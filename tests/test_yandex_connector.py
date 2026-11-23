import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from yandex_disk import Disk, DiskError, _dpapi, remote_path, trusted_transfer
from migrate_yandex import inventory


class FakeDisk(Disk):
    def __init__(self, existing=None, bad_hash=False):
        self.existing = existing
        self.bad_hash = bad_hash
        self.calls = []

    def mkdir(self, path=''):
        self.calls.append(('mkdir', path))

    def stat(self, path=''):
        if self.existing is None:
            raise DiskError('Missing', 404)
        return self.existing

    def api(self, method, endpoint='', **params):
        self.calls.append((method, endpoint, params))
        return {'href': 'https://uploader.disk.yandex.net/test'}

    def _curl(self, url, **options):
        self.calls.append(('transfer', options))
        data = options.get('content')
        if data is None:
            data = Path(options['upload']).read_bytes()
        self.existing = {'type': 'file', 'size': len(data), 'sha256': 'wrong' if self.bad_hash else hashlib.sha256(data).hexdigest()}
        return 201, b''


class ConnectorChecks(unittest.TestCase):
    def test_destination_is_bounded(self):
        self.assertTrue(remote_path('assets/test.glb').endswith('/assets/test.glb'))
        for path in ('../other', '/outside', 'C:/secret', 'assets/../../other', 'a\\b'):
            with self.assertRaises(DiskError):
                remote_path(path)

    def test_transfer_origin(self):
        self.assertEqual(trusted_transfer('https://uploader.disk.yandex.net/file'), 'https://uploader.disk.yandex.net/file')
        self.assertEqual(trusted_transfer('https://uploader.disk.yandex.net:443/file'), 'https://uploader.disk.yandex.net:443/file')
        for url in ('http://uploader.disk.yandex.net/file', 'https://uploader.disk.yandex.net:444/file', 'https://example.com/file', 'https://user:pass@uploader.disk.yandex.net/file', 'https://uploader.disk.yandex.net.evil.example/file'):
            with self.assertRaises(DiskError):
                trusted_transfer(url)

    @unittest.skipUnless(os.name == 'nt', 'Windows DPAPI')
    def test_encrypted_credential_round_trip(self):
        sample = b'ees-synthetic-token-not-a-credential'
        protected = _dpapi(sample)
        self.assertNotIn(sample, protected)
        self.assertEqual(_dpapi(protected, True), sample)

    def test_uploaded_bytes_are_verified(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'model.glb'; file.write_bytes(b'current working bytes\r\n')
            content = b'exact committed Git bytes\n'
            disk = FakeDisk()
            result = disk.upload(file, 'assets/test.glb', content=content)
            self.assertEqual(result['sha256'], hashlib.sha256(content).hexdigest())
            self.assertEqual(result['size'], len(content))
            transfer = next(c for c in disk.calls if c[0] == 'transfer')[1]
            self.assertFalse(transfer.get('authenticated', False))
            with self.assertRaises(DiskError):
                FakeDisk(bad_hash=True).upload(file, 'assets/test.glb')

    def test_resume_and_no_silent_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'file.pdf'; file.write_bytes(b'exact bytes')
            row = {'type': 'file', 'size': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}
            disk = FakeDisk(row)
            self.assertEqual(disk.upload(file, 'assets/file.pdf')['status'], 'verified-existing')
            self.assertFalse(any(c[0] == 'transfer' for c in disk.calls))
            with self.assertRaises(DiskError):
                FakeDisk({**row, 'sha256': 'different'}).upload(file, 'assets/file.pdf')
            with self.assertRaises(DiskError):
                FakeDisk().upload(file, 'assets/file.pdf', expected_sha256='wrong')

    def test_expired_upload_node_is_replaced_without_losing_verification(self):
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'source.f3d';file.write_bytes(b'current CAD source')
            disk=FakeDisk();transfer=disk._curl
            def upload(url,**options):
                if not hasattr(disk,'expired'):disk.expired=True;return 404,b''
                return transfer(url,**options)
            with patch.object(disk,'_curl',side_effect=upload),patch('yandex_disk.time.sleep'):
                result=disk.upload(file,'assets/source.f3d')
            self.assertEqual(result['sha256'],hashlib.sha256(file.read_bytes()).hexdigest())
            self.assertEqual(len([call for call in disk.calls if call[0]=='GET']),2)

    def test_inventory_uses_only_committed_public_content(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            (root / 'page.txt').write_bytes(b'public content\n')
            subprocess.run(['git', '-C', str(root), 'add', 'page.txt'], check=True)
            subprocess.run(['git', '-C', str(root), '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'test'], check=True)
            (root / 'page.txt').write_bytes(b'unpublished working change')
            (root / 'untracked-secret.txt').write_bytes(b'must never upload')
            plan = inventory(root)
            self.assertEqual(plan['fileCount'], 1)
            self.assertEqual(plan['files'][0]['sha256'], hashlib.sha256(b'public content\n').hexdigest())


if __name__ == '__main__':
    unittest.main()
