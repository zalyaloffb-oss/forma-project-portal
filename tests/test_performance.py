import gzip,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'tools'))
import audit_payload,publish_export

class PerformanceContracts(unittest.TestCase):
    def test_catalogue_startup_budget(self):
        files=audit_payload.dependencies('app.js')
        self.assertLess(sum(files.values()),100_000,'Catalogue startup must not load PDF or 3D engines')

    def test_banner_exporter_is_deferred(self):
        files=audit_payload.dependencies('banner-viewer.js')
        self.assertFalse(any(name.endswith('/GLTFExporter.js') for name in files))

    def test_future_publication_creates_exact_transport(self):
        project={'id':'preserved','viewerPath':'/test-project'}
        source=ROOT/'models/health-territory-v23.glb'
        with tempfile.TemporaryDirectory() as folder,patch.object(publish_export,'ROOT',Path(folder)):
            url=publish_export.write_asset(project,'model',source)
            self.assertEqual((Path(folder)/url).read_bytes(),source.read_bytes())
            self.assertEqual(gzip.decompress((Path(folder)/project['modelGzipUrl']).read_bytes()),source.read_bytes())
            self.assertEqual(project['id'],'preserved')

if __name__=='__main__':unittest.main()
