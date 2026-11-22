"""Verified, resumable copy of a committed GitHub tree to the EES Disk folder."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from yandex_disk import Disk, DiskError, ROOT


def inventory(repo):
    commit = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
    records = subprocess.check_output(['git', '-C', str(repo), 'ls-tree', '-r', '-z', 'HEAD']).split(b'\0')
    files = []
    batch = subprocess.Popen(['git', '-C', str(repo), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    for record in records:
        if not record:
            continue
        attrs, raw_path = record.split(b'\t', 1)
        mode, kind, blob = attrs.decode().split()
        relative = raw_path.decode('utf-8')
        if kind != 'blob' or mode not in ('100644', '100755'):
            raise DiskError('Необычный объект Git, нужен отдельный разбор: ' + relative)
        local = repo / relative
        if not local.resolve().is_relative_to(repo.resolve()):
            raise DiskError('Путь выходит за пределы репозитория.')
        # Read the exact committed public bytes, independent of Windows line endings.
        batch.stdin.write((blob + '\n').encode('ascii')); batch.stdin.flush()
        header = batch.stdout.readline().decode('ascii').split()
        if header[:2] != [blob, 'blob']:
            raise DiskError('Не удалось прочитать опубликованный объект Git.')
        content = batch.stdout.read(int(header[2])); batch.stdout.read(1)
        files.append({'path': relative, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest(), 'gitBlob': blob})
    batch.stdin.close(); batch.wait(); batch.stdout.close()
    return {'source': 'https://github.com/zalyaloffb-oss/forma-project-portal', 'commit': commit,
            'destination': ROOT, 'fileCount': len(files), 'totalBytes': sum(f['bytes'] for f in files), 'files': files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--upload', action='store_true')
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    manifest = inventory(args.repo.resolve())
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in manifest.items() if k != 'files'}, ensure_ascii=False), flush=True)
    if not args.upload:
        return
    disk = Disk()
    info = disk.info()
    if (info.get('total_space') or 0) - (info.get('used_space') or 0) < manifest['totalBytes']:
        raise DiskError('На Диске недостаточно свободного места.')
    disk.mkdir()
    verified = []; failures = []
    report = args.manifest.with_name(args.manifest.stem + '-verified.json')
    def send(row):
        content = subprocess.check_output(['git', '-C', str(args.repo), 'cat-file', 'blob', row['gitBlob']])
        return disk.upload(args.repo / row['path'], row['path'], expected_sha256=row['sha256'], content=content)
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as pool:
        jobs = {pool.submit(send, row): row for row in manifest['files']}
        for future in as_completed(jobs):
            try:
                result = future.result()
                verified.append(result)
                print(json.dumps({'done': len(verified), 'total': len(jobs), **result}, ensure_ascii=False), flush=True)
            except DiskError as error:
                failures.append({'path': jobs[future]['path'], 'error': str(error)})
                print(json.dumps({'failed': failures[-1]}, ensure_ascii=False), flush=True)
            report.write_text(json.dumps({'commit': manifest['commit'], 'verified': verified, 'failed': failures}, ensure_ascii=False, indent=2), encoding='utf-8')
    if failures:
        raise DiskError('Не удалось проверить ' + str(len(failures)) + ' файлов. Повторный запуск продолжит перенос.')
    print(json.dumps({'complete': True, 'files': len(verified), 'bytes': sum(f['size'] for f in verified)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    try:
        main()
    except DiskError as error:
        raise SystemExit(str(error))
