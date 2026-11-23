"""EES Yandex Disk connector. OAuth stays in Windows DPAPI, outside the repository."""
from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import hashlib
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import parse_qs, urlencode, urlsplit

API = 'https://cloud-api.yandex.net/v1/disk'
VAULT = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'EES/YandexDisk'
ROOT = 'disk:/EES проекты/forma-project-portal'
TOKEN_FILE = VAULT / 'oauth.dpapi'

def file_sha256(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()


class DiskError(RuntimeError):
    def __init__(self, message, status=0):
        super().__init__(message)
        self.status = status


def _dpapi(data: bytes, decrypt=False):
    if os.name != 'nt':
        raise DiskError('DPAPI доступен только в Windows.')
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]
    raw = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(raw, ctypes.POINTER(ctypes.c_ubyte)))
    target = Blob()
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    crypt.CryptProtectData.argtypes = [ctypes.POINTER(Blob), wintypes.LPCWSTR, ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    crypt.CryptUnprotectData.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    crypt.CryptProtectData.restype = crypt.CryptUnprotectData.restype = wintypes.BOOL
    if decrypt:
        ok = crypt.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target))
    else:
        ok = crypt.CryptProtectData(ctypes.byref(source), 'EES Yandex Disk', None, None, None, 1, ctypes.byref(target))
    if not ok:
        raise DiskError('Не удалось обработать защищённый доступ Windows.')
    try:
        return ctypes.string_at(target.data, target.size)
    finally:
        ctypes.windll.kernel32.LocalFree(target.data)


def save_token(token):
    VAULT.mkdir(parents=True, exist_ok=True)
    sid = subprocess.check_output(['whoami', '/user', '/fo', 'csv', '/nh'], text=True)
    sid = re.search(r'S-1-5-[\d-]+', sid).group()
    result = subprocess.run(['icacls', str(VAULT), '/inheritance:r', '/grant:r',
                             '*' + sid + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F'], capture_output=True)
    if result.returncode:
        raise DiskError('Не удалось закрыть папку доступа от других пользователей Windows.')
    encrypted = _dpapi(token.encode('ascii'))
    temporary = TOKEN_FILE.with_suffix('.next')
    temporary.write_bytes(encrypted)
    temporary.replace(TOKEN_FILE)


def load_token():
    if not TOKEN_FILE.is_file():
        raise DiskError('Диск ещё не подключён. Выполните команду setup.')
    return _dpapi(TOKEN_FILE.read_bytes(), decrypt=True).decode('ascii')


def remote_path(relative=''):
    if '\\' in relative or ':' in relative or relative.startswith('/') or any(p in ('.', '..') for p in relative.split('/')):
        raise DiskError('Ожидается относительный путь внутри папки EES проекты.')
    return ROOT + ('/' + str(PurePosixPath(relative)) if relative else '')


def trusted_transfer(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443) or not any(
            parsed.hostname and parsed.hostname.endswith('.' + host) for host in ('yandex.ru', 'yandex.net')):
        raise DiskError('Яндекс вернул недопустимый адрес передачи файла.')
    return url


class Disk:
    def __init__(self, token=None):
        self.token = token if token is not None else load_token()
        self._folders = set()
        self._lock = threading.Lock()

    def _curl(self, url, *, method='GET', authenticated=False, upload=None, content=None, output=None):
        with tempfile.TemporaryDirectory(prefix='ees-disk-') as folder:
            response = Path(folder) / 'response'
            transfer_size = len(content) if content is not None else Path(upload).stat().st_size if upload else 0
            timeout = max(45, min(600, int(30 + transfer_size / 1024 / 1024 * 5))) if upload or content is not None else 90
            args = ['curl.exe', '-4', '--silent', '--show-error', '--connect-timeout', '20',
                    '--max-time', str(timeout), '--retry', '2', '--retry-delay', '2',
                    '--proto', '=https', '--request', method, '--output', str(output or response),
                    '--write-out', '%{http_code}']
            config = ''
            if method=='GET':args += ['--retry-all-errors']
            if authenticated:
                if not url.startswith(API + '/') and url != API:
                    raise DiskError('Токен разрешён только для API Яндекс Диска.')
                config = 'header = ' + json.dumps('Authorization: OAuth ' + self.token) + '\n'
                args += ['--config', '-']
            if upload:
                args += ['--upload-file', str(upload)]
            if content is not None:
                if authenticated:
                    raise DiskError('Передача файла с заголовком OAuth запрещена.')
                args += ['--data-binary', '@-', '--header', 'Content-Type: application/octet-stream']
            args += [url]
            result = subprocess.run(args, input=content if content is not None else config.encode('utf-8'), capture_output=True)
            if result.returncode:
                detail = result.stderr.decode('utf-8', errors='replace').splitlines()[0] if result.stderr else ''
                detail = re.sub(r'https://\S+', '[адрес передачи]', detail)[:180]
                if 'y0_' in detail or 'Authorization' in detail:
                    detail = ''
                raise DiskError('Сетевая ошибка Яндекс Диска (curl ' + str(result.returncode) + '). ' + detail)
            status = int(result.stdout[-3:].decode('ascii'))
            body = b'' if output else response.read_bytes()
            return status, body

    def api(self, method, endpoint='', **params):
        url = API + endpoint + ('?' + urlencode(params) if params else '')
        status, body = self._curl(url, method=method, authenticated=True)
        if status >= 400:
            raise DiskError('Яндекс Диск: HTTP ' + str(status) + ' (' + method + ' ' + (endpoint or '/') + ').', status)
        return json.loads(body) if body else {}

    def info(self):
        data = self.api('GET')
        return {key: data.get(key) for key in ('total_space', 'used_space', 'trash_size', 'max_file_size', 'user')}

    def stat(self, relative=''):
        return self.api('GET', '/resources', path=remote_path(relative), limit=1000)

    def mkdir(self, relative=''):
        target = remote_path(relative)
        with self._lock:
            parts = target[len('disk:/'):].split('/')
            current = 'disk:'
            for part in parts:
                current += '/' + part
                if current in self._folders:
                    continue
                try:
                    existing = self.api('GET', '/resources', path=current)
                except DiskError as error:
                    if error.status != 404:
                        raise
                    try:
                        self.api('PUT', '/resources', path=current)
                    except DiskError as creation_error:
                        if creation_error.status not in (409, 423):
                            raise
                    existing = self.api('GET', '/resources', path=current)
                if existing.get('type') != 'dir':
                    raise DiskError('Путь папки занят файлом.')
                self._folders.add(current)

    def upload(self, local, relative, *, expected_sha256=None, overwrite=False, content=None):
        local = Path(local).resolve(strict=True)
        if not local.is_file():
            raise DiskError('Нужен существующий файл.')
        data_hash = hashlib.sha256(content).hexdigest() if content is not None else file_sha256(local)
        size = len(content) if content is not None else local.stat().st_size
        if expected_sha256 and data_hash != expected_sha256:
            raise DiskError('Локальный файл изменился после составления списка: ' + relative)
        self.mkdir(str(PurePosixPath(relative).parent) if '/' in relative else '')
        try:
            existing = self.stat(relative)
        except DiskError as error:
            if error.status != 404:
                raise
            existing = None
        if existing:
            if existing.get('type') == 'file' and existing.get('sha256') == data_hash and existing.get('size') == size:
                return {'path': relative, 'sha256': data_hash, 'size': size, 'status': 'verified-existing'}
            if not overwrite:
                raise DiskError('На Диске уже есть другой файл: ' + relative)
        for attempt in range(3):
            address = self.api('GET', '/resources/upload', path=remote_path(relative), overwrite=str(overwrite).lower())
            try:
                code, _ = self._curl(trusted_transfer(address['href']), method='PUT', upload=local if content is None else None, content=content)
                if code not in (200,201,202):
                    # The first PUT can succeed even if a retried/late response
                    # is an error. Trust only the stored bytes, never the status.
                    try:confirmed=self.stat(relative)
                    except DiskError:confirmed={}
                    if confirmed.get('size')==size and confirmed.get('sha256')==data_hash:
                        return {'path':relative,'sha256':data_hash,'size':size,'status':'uploaded-verified-after-error-response'}
                if code in (404,408,410,429,500,502,503,504) and attempt<2:
                    time.sleep(2**attempt)
                    continue
                break
            except DiskError as interrupted:
                # A dropped response does not prove a failed PUT. Check server bytes.
                try:
                    confirmed = self.stat(relative)
                except DiskError:
                    confirmed = {}
                if confirmed.get('size') == size and confirmed.get('sha256') == data_hash:
                    return {'path': relative, 'sha256': data_hash, 'size': size, 'status': 'uploaded-verified-after-interruption'}
                if confirmed or attempt == 2:
                    raise interrupted
                # Refresh the signed URL instead of retrying a failing upload node.
        if code not in (200, 201, 202):
            raise DiskError('Яндекс Диск отклонил загрузку (HTTP ' + str(code) + ').', code)
        stored = self.stat(relative)
        if stored.get('size') != size or stored.get('sha256') != data_hash:
            raise DiskError('Проверка размера/SHA-256 после загрузки не пройдена: ' + relative)
        return {'path': relative, 'sha256': data_hash, 'size': stored['size'], 'status': 'uploaded-verified'}

    def publish(self, relative=''):
        self.api('PUT', '/resources/publish', path=remote_path(relative))
        item = self.stat(relative)
        if not item.get('public_url'):
            raise DiskError('Публичная ссылка пока не появилась.')
        return item['public_url']


def setup(port=4187):
    nonce = secrets.token_urlsafe(24)
    state = {'connected': TOKEN_FILE.is_file()}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, body, code=200):
            self.send_response(code)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body.encode('utf-8'))

        def do_GET(self):
            if self.path != '/connect/' + nonce:
                return self.reply('Not found', 404)
            self.reply('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Подключение Яндекс Диска · EES</title>'
                '<style>body{font:18px system-ui;max-width:660px;margin:10vh auto;padding:24px}input{width:100%;padding:14px;box-sizing:border-box}button{padding:14px;margin-top:18px}</style>'
                '<h1>Яндекс Диск · EES проекты</h1><p>Токен будет зашифрован средствами Windows и сохранён только на этом компьютере.</p>'
                '<form method="post"><label>OAuth-токен<input type="password" name="token" id="token" autofocus required autocomplete="off"></label>'
                '<button>Подключить</button></form></html>')

        def do_POST(self):
            if self.path != '/connect/' + nonce or self.headers.get('Origin') != 'http://127.0.0.1:' + str(self.server.server_port):
                return self.reply('Forbidden', 403)
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 20000:
                return self.reply('Invalid request', 400)
            values = parse_qs(self.rfile.read(size).decode('utf-8'))
            candidate = values.get('token', [''])[0]
            match = re.search(r'\by0_[A-Za-z0-9_-]{20,}', candidate)
            if not match:
                return self.reply('Токен не найден. Вставьте OAuth-токен Яндекса.', 400)
            token = match.group()
            try:
                info = Disk(token).info()
                save_token(token)
                state['connected'] = True
                state['user'] = info.get('user', {}).get('login')
                state['free_bytes'] = (info.get('total_space') or 0) - (info.get('used_space') or 0)
                (VAULT / 'connection.json').write_text(json.dumps({'root': ROOT, **state}, ensure_ascii=False), encoding='utf-8')
                self.reply('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Диск подключён · EES</title>'
                    '<h1>Яндекс Диск подключён</h1><p>Доступ проверен. Токен сохранён в зашифрованном виде.</p>'
                    '<p>Аккаунт: ' + html.escape(state['user'] or '') + '</p></html>')
                print(json.dumps({'connected': True, 'user': state['user'], 'free_bytes': state['free_bytes']}, ensure_ascii=False), flush=True)
            except DiskError as error:
                self.reply(html.escape(str(error)), 400)
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print('SETUP_URL=http://127.0.0.1:' + str(server.server_port) + '/connect/' + nonce, flush=True)
    server.serve_forever()


def mcp_server():
    tools = [
        {'name': 'disk_info', 'description': 'Проверить подключение и свободное место Яндекс Диска.', 'inputSchema': {'type': 'object', 'properties': {}, 'additionalProperties': False}},
        {'name': 'list_files', 'description': 'Список файлов внутри EES проекты/forma-project-portal.', 'inputSchema': {'type': 'object', 'properties': {'path': {'type': 'string'}}, 'additionalProperties': False}},
        {'name': 'create_folder', 'description': 'Создать папку внутри EES проекты/forma-project-portal.', 'inputSchema': {'type': 'object', 'properties': {'path': {'type': 'string'}}, 'required': ['path'], 'additionalProperties': False}},
        {'name': 'upload_file', 'description': 'Прямая загрузка файла проекта в Яндекс Диск с проверкой SHA-256. Путь назначения относителен к EES проекты/forma-project-portal.', 'inputSchema': {'type': 'object', 'properties': {'local_path': {'type': 'string'}, 'path': {'type': 'string'}, 'overwrite': {'type': 'boolean', 'default': False}}, 'required': ['local_path', 'path'], 'additionalProperties': False}},
        {'name': 'public_link', 'description': 'Опубликовать файл или папку EES и получить публичную ссылку.', 'inputSchema': {'type': 'object', 'properties': {'path': {'type': 'string'}}, 'additionalProperties': False}},
    ]
    allowed = [Path(p).resolve() for p in json.loads((VAULT / 'allowed-roots.json').read_text(encoding='utf-8'))] if (VAULT / 'allowed-roots.json').is_file() else []
    disk = None
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            method = request.get('method')
            if 'id' not in request:
                continue
            if method == 'initialize':
                result = {'protocolVersion': request.get('params', {}).get('protocolVersion', '2024-11-05'), 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'ees-yandex-disk', 'version': '1.0.0'}}
            elif method == 'ping':
                result = {}
            elif method == 'tools/list':
                result = {'tools': tools}
            elif method == 'tools/call':
                disk = disk or Disk()
                params = request['params']; args = params.get('arguments') or {}; name = params['name']
                if name == 'disk_info':
                    value = disk.info()
                elif name == 'list_files':
                    data = disk.stat(args.get('path', ''))
                    value = {key: data.get(key) for key in ('name', 'type', 'size', 'sha256', 'public_url', '_embedded')}
                elif name == 'create_folder':
                    disk.mkdir(args['path']); value = {'created': args['path']}
                elif name == 'public_link':
                    value = {'url': disk.publish(args.get('path', ''))}
                elif name == 'upload_file':
                    local = Path(args['local_path']).resolve(strict=True)
                    if not any(local.is_relative_to(root) for root in allowed):
                        raise DiskError('Локальный файл находится вне разрешённых папок проектов.')
                    value = disk.upload(local, args['path'], overwrite=args.get('overwrite', False))
                else:
                    raise DiskError('Неизвестный инструмент.')
                result = {'content': [{'type': 'text', 'text': json.dumps(value, ensure_ascii=False)}]}
            else:
                raise DiskError('Метод не поддерживается.')
            response = {'jsonrpc': '2.0', 'id': request['id'], 'result': result}
        except Exception as error:
            message = str(error) if isinstance(error, DiskError) else 'Ошибка запроса к коннектору.'
            response = {'jsonrpc': '2.0', 'id': request.get('id'), 'error': {'code': -32000, 'message': message}}
        print(json.dumps(response, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['setup', 'info', 'mkdir', 'stat', 'upload', 'publish', 'mcp'])
    parser.add_argument('path', nargs='?', default='')
    parser.add_argument('--file'); parser.add_argument('--overwrite', action='store_true')
    parser.add_argument('--port', type=int, default=4187)
    args = parser.parse_args()
    if args.command == 'setup':
        return setup(args.port)
    if args.command == 'mcp':
        return mcp_server()
    disk = Disk()
    if args.command == 'info': result = disk.info()
    elif args.command == 'mkdir': disk.mkdir(args.path); result = {'created': args.path}
    elif args.command == 'stat': result = disk.stat(args.path)
    elif args.command == 'publish': result = {'url': disk.publish(args.path)}
    else: result = disk.upload(args.file, args.path, overwrite=args.overwrite)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    try:
        main()
    except DiskError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
