"""Future CAD publications must verify Disk bytes before publishing their URLs."""
import gzip
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import publish_export


class PublicationChecks(unittest.TestCase):
    def test_model_and_gzip_go_to_disk_without_repository_payload(self):
        source=ROOT/'models/health-territory-v23.glb'
        with tempfile.TemporaryDirectory() as folder,patch.object(publish_export,'ROOT',Path(folder)),patch('yandex_disk.Disk') as disk:
            root=Path(folder);(root/'data').mkdir()
            config=root/'data/asset-storage.json'
            config.write_text(json.dumps({'version':1,'provider':'yandex-disk','enabled':True,'files':{}}))
            project={'id':'same-id','viewerPath':'/same-route'}
            path=publish_export.write_asset(project,'model',source)
            self.assertEqual(disk.return_value.upload.call_count,2)
            calls=disk.return_value.upload.call_args_list
            raw=calls[0].kwargs['content'];packed=calls[1].kwargs['content']
            self.assertEqual(raw,source.read_bytes());self.assertEqual(gzip.decompress(packed),raw)
            storage=json.loads(config.read_text())
            self.assertEqual(storage['files'][path]['sha256'],hashlib.sha256(raw).hexdigest())
            self.assertTrue(storage['files'][path]['selfContainedGLB'])
            self.assertEqual(storage['files'][project['modelGzipUrl']]['decodedSHA256'],hashlib.sha256(raw).hexdigest())
            self.assertFalse((root/path).exists());self.assertEqual(project['id'],'same-id')

    def test_failed_upload_does_not_publish_a_missing_asset(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(publish_export,'ROOT',Path(folder)),patch('yandex_disk.Disk') as disk:
            root=Path(folder);(root/'data').mkdir();file=root/'data/asset-storage.json'
            original=json.dumps({'version':1,'provider':'yandex-disk','enabled':True,'files':{}});file.write_text(original)
            disk.return_value.upload.side_effect=RuntimeError('Upload unavailable')
            with self.assertRaises(RuntimeError):publish_export.write_asset({'viewerPath':'/test'},'model',ROOT/'models/health-territory-v23.glb')
            self.assertEqual(file.read_text(),original)

    def test_large_cad_archive_is_streamed_and_marked_for_direct_download(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(publish_export,'ROOT',Path(folder)),patch('yandex_disk.Disk') as disk:
            root=Path(folder);(root/'data').mkdir();config=root/'data/asset-storage.json'
            config.write_text(json.dumps({'version':1,'provider':'yandex-disk','enabled':True,'files':{}}))
            source=root/'large.f3d'
            with source.open('wb') as stream:stream.truncate(201*1024*1024)
            with patch.object(Path,'read_bytes',side_effect=AssertionError('Large archives must be streamed')):
                path=publish_export.write_asset({'viewerPath':'/large-source'},'f3d',source)
            row=json.loads(config.read_text())['files'][path]
            self.assertTrue(row['downloadOnly']);self.assertEqual(row['bytes'],201*1024*1024)
            self.assertNotIn('content',disk.return_value.upload.call_args.kwargs)


if __name__=='__main__':unittest.main()
