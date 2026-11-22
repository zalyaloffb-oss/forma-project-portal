"""Map public assets only after server SHA-256 verification; keep social previews local."""
import argparse
import gzip
import hashlib
import json
import mimetypes
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
MIME = {'.glb': 'model/gltf-binary', '.gz': 'application/gzip', '.pdf': 'application/pdf',
        '.f3d': 'application/octet-stream', '.max': 'application/octet-stream', '.dxf': 'image/vnd.dxf'}


def descriptor(path, data):
    row = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
           'mime': MIME.get(Path(path).suffix.lower()) or mimetypes.guess_type(path)[0] or 'application/octet-stream'}
    if path.endswith('.glb'):
        assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 8)[0] == len(data)
        gltf = json.loads(data[20:20+struct.unpack_from('<I', data, 12)[0]])
        assert all(not r.get('uri') or r['uri'].startswith('data:') for r in gltf.get('buffers', []) + gltf.get('images', []))
        row['selfContainedGLB'] = True
    elif path.endswith('.glb.gz'):
        decoded = gzip.decompress(data)
        row['decodedSHA256'] = hashlib.sha256(decoded).hexdigest()
        row['decodedBytes'] = len(decoded)
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--verified', type=Path, required=True)
    parser.add_argument('--public-key', required=True)
    parser.add_argument('--extra-verified', type=Path)
    parser.add_argument('--enable', action='store_true')
    args = parser.parse_args()
    source = json.loads(args.manifest.read_text(encoding='utf-8'))
    checked = {r['path']: r for r in json.loads(args.verified.read_text(encoding='utf-8'))['verified']}
    if args.extra_verified and args.extra_verified.is_file():
        checked.update({r['path']: r for r in json.loads(args.extra_verified.read_text(encoding='utf-8'))['verified']})
    catalog = json.loads((ROOT / 'data/catalog.json').read_text(encoding='utf-8'))
    keep = {'assets/event-expo-service.jpg'}
    for project in catalog['projects']:
        for entry in [project, *project.get('furniture', [])]:
            for key in ('coverUrl', 'bannerCoverUrl'):
                if entry.get(key):
                    keep.add(entry[key])
    # These small existing models are deterministic CI fixtures, still copied to Disk.
    fixtures = {'assets/tachpanel/model-c7616d17ffca.glb'}
    first = next(p for p in catalog['projects'] if p['id'] == 'fpp-2026')
    fixtures.update(first[k] for k in ('modelUrl', 'modelGzipUrl'))
    files = {}
    for record in source['files']:
        path = record['path']
        if not path.startswith('assets/') or path in keep or Path(path).suffix == '.json':
            continue
        stored = checked.get(path)
        if not stored or stored['sha256'] != record['sha256'] or stored['size'] != record['bytes']:
            raise RuntimeError('Файл ещё не проверен на Диске: ' + path)
        data = (ROOT / path).read_bytes()
        row = descriptor(path, data)
        assert row['sha256'] == record['sha256']
        files[path] = row
    config = {'version': 1, 'provider': 'yandex-disk', 'enabled': args.enable,
              'publicKey': args.public_key, 'sourceCommit': source['commit'], 'files': files,
              'retainedFixtures': sorted(fixtures)}
    (ROOT / 'data/asset-storage.json').write_text(json.dumps(config, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'mappedFiles': len(files), 'bytes': sum(r['bytes'] for r in files.values()),
                      'enabled': args.enable, 'retainedPreviews': len(keep)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
