from pathlib import Path
import sys
import unittest
from types import SimpleNamespace as NS
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from FusionMetadata import creation_metadata
from publish_export import creation_date,match_project
import publish_export


class FusionDates(unittest.TestCase):
    def test_first_version_is_not_latest_version_or_export_date(self):
        first=NS(id='same',name='Stand',versionNumber=1,dateCreated=1704067200)
        latest=NS(id='same',name='Stand',versionNumber=99,versionId='urn:adsk:file:stand?version=99',dateCreated=1780000000)
        queries=[]
        def lookup(key):queries.append(key);return first
        meta=creation_metadata(latest,lookup)
        self.assertEqual(queries,['urn:adsk:file:stand?version=1'])
        self.assertEqual(meta['sourceCreatedAt'],'2024-01-01T00:00:00+00:00')
        self.assertEqual(creation_date({'dataFileId':'same',**meta}),'2024-01-01')

    def test_calendar_date_uses_moscow_and_missing_dates_never_become_today(self):
        self.assertEqual(creation_date({'dataFileId':'same','sourceCreatedAt':'2024-01-01T22:30:00Z'}),'2024-01-02')
        with self.assertRaises(ValueError):creation_date({'dataFileId':'same'})
        with self.assertRaises(ValueError):creation_date({'sourceCreatedAt':'2024-01-01T22:30:00'})
        with self.assertRaises(ValueError):creation_metadata(NS(id='x',name='Bad',versionNumber=1,dateCreated=0))

    def test_version_history_is_used_when_direct_lookup_is_not_supported(self):
        first=NS(id='same',name='Stand',versionNumber=1,dateCreated=1704067200)
        latest=NS(id='same',name='Stand',versionNumber=4,versionId='urn:adsk:file:stand?version=4',versions=NS(count=1,item=lambda index:first))
        def unsupported(key):raise RuntimeError('InternalValidationError: versions')
        self.assertEqual(creation_metadata(latest,unsupported)['sourceCreatedAt'],'2024-01-01T00:00:00+00:00')

    def test_distinct_sources_with_same_title_do_not_replace_each_other(self):
        records=[{'id':'old','title':'Stand','fusionDataFileId':'first','model':'fusion'}]
        self.assertIsNone(match_project(records,{'title':'Stand','dataFileId':'second'}))
        self.assertIs(match_project(records,{'title':'Renamed','dataFileId':'first'}),records[0])
        with self.assertRaises(ValueError):match_project(records,{'title':'Stand','dataFileId':'second','projectId':'old'})

    def test_existing_project_date_is_corrected_without_losing_documents_or_route(self):
        project={'id':'kept','title':'Stand','viewerPath':'/same-link','fusionDataFileId':'same','date':'2026-11-23',
                 'designUrl':'assets/old-design.pdf','assemblyUrl':'assets/old-assembly.pdf','manager':'Anna','attachments':[]}
        source=Path(__file__).resolve().parents[1]/'models/health-territory-v23.glb'
        meta={'title':'Stand','dataFileId':'same','version':'8','sourceCreatedAt':'2024-05-01T10:00:00Z','sourceCreatedVersion':1}
        def asset(destination,kind,file,**kwargs):destination['modelGzipUrl']='assets/new.glb.gz';return 'assets/new.glb'
        with patch.object(publish_export,'read_catalog',return_value={'projects':[project]}),patch.object(publish_export,'write_asset',side_effect=asset),patch.object(publish_export,'save_catalog'):
            result=publish_export.publish(meta,{'model':source},push=False)
        self.assertEqual(result['projectId'],'kept');self.assertEqual(result['action'],'updated')
        self.assertEqual(project['date'],'2024-05-01');self.assertEqual(project['viewerPath'],'/same-link')
        self.assertEqual(project['designUrl'],'assets/old-design.pdf');self.assertEqual(project['assemblyUrl'],'assets/old-assembly.pdf')
        self.assertEqual(project['manager'],'Anna')


if __name__=='__main__':unittest.main()
