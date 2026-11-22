"""Install the local EES Disk MCP server; never put OAuth in Codex config."""
import json
from pathlib import Path
import shutil
import sys
import tomllib

from yandex_disk import TOKEN_FILE, VAULT


def main():
    home = Path.home()
    destination = home / '.codex/connectors/yandex-disk'
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(Path(__file__).with_name('yandex_disk.py'), destination / 'connector.py')
    roots_file = VAULT / 'allowed-roots.json'
    roots = json.loads(roots_file.read_text(encoding='utf-8')) if roots_file.is_file() else []
    for root in (Path(__file__).resolve().parents[1], home / 'Documents/ChatGPT/Сайты/forma-github'):
        value = str(root.resolve())
        if root.is_dir() and value not in roots:
            roots.append(value)
    VAULT.mkdir(parents=True, exist_ok=True)
    roots_file.write_text(json.dumps(roots, ensure_ascii=False, indent=2), encoding='utf-8')
    config = home / '.codex/config.toml'
    text = config.read_text(encoding='utf-8')
    parsed = tomllib.loads(text)
    expected = {'command': sys.executable, 'args': [str(destination / 'connector.py'), 'mcp']}
    existing = parsed.get('mcp_servers', {}).get('ees_yandex_disk')
    if existing and any(existing.get(key) != value for key, value in expected.items()):
        raise RuntimeError('MCP-сервер ees_yandex_disk уже настроен иначе; сохранена существующая конфигурация.')
    if not existing:
        text += '\n[mcp_servers.ees_yandex_disk]\ncommand = ' + json.dumps(sys.executable)
        text += '\nargs = ' + json.dumps(expected['args']) + '\nstartup_timeout_sec = 30\ntool_timeout_sec = 900\n'
        tomllib.loads(text)
        temporary = config.with_suffix('.toml.next')
        temporary.write_text(text, encoding='utf-8'); temporary.replace(config)
    print(json.dumps({'installed': True, 'mcp': 'ees_yandex_disk', 'credentialEncrypted': TOKEN_FILE.is_file(), 'path': str(destination)}, ensure_ascii=False))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
