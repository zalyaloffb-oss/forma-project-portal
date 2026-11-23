from pathlib import Path
import copy,json,sys,tempfile,unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import import_drafts,validate_site

class ClassificationImport(unittest.TestCase):
    def test_new_primary_can_follow_its_parts_in_a_package_and_have_no_own_model(self):
        part={'id':'part','title':'Part','viewerPath':'/part','attachments':[]}
        catalog={'projects':[part]}
        packet={'format':'forma-catalog-drafts-v1','projects':[
            {**part,'parentProjectId':'primary'},
            {'id':'primary','title':'Primary','date':'2024-01-02','attachments':[]}]}
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);file=root/'drafts.json';file.write_text(json.dumps(packet),encoding='utf-8')
            with patch.object(sys,'argv',['import_drafts.py',str(file)]),patch.object(import_drafts,'read_catalog',return_value=catalog),patch.object(import_drafts,'save_catalog'):
                import_drafts.main()
            self.assertEqual(part['parentProjectId'],'primary')
            (root/'data').mkdir();(root/'data/catalog.json').write_text(json.dumps(catalog),encoding='utf-8')
            for project in catalog['projects']:
                route=root/project['viewerPath'].strip('/');route.mkdir();(route/'index.html').write_text('ok')
            for name in ('viewer-pro.js','app.js','site-config.js','viewer-share.js'):(root/name).write_text('')
            with patch.object(validate_site,'ROOT',root):validate_site.main()

    def test_grouping_and_separation_survive_publication_without_changing_models_or_documents(self):
        main={'id':'main','title':'Стенд','viewerPath':'/main','date':'2024-01-02','attachments':[]}
        part={'id':'part','title':'Ресепшен','viewerPath':'/part','fusionDataFileId':'native-part',
              'date':'2023-02-03','modelUrl':'assets/part.glb','designUrl':'assets/part.pdf',
              'attachments':[{'id':'drawing','name':'drawing.pdf','kind':'pdf','url':'assets/drawing.pdf'}]}
        before=copy.deepcopy(part);catalog={'projects':[main,part]}
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'drafts.json'
            for parent in ('main',''):
                packet={'format':'forma-catalog-drafts-v1','projects':[{**part,'parentProjectId':parent}]}
                file.write_text(json.dumps(packet),encoding='utf-8')
                with patch.object(sys,'argv',['import_drafts.py',str(file)]),patch.object(import_drafts,'read_catalog',return_value=catalog),patch.object(import_drafts,'save_catalog') as save:
                    import_drafts.main()
                save.assert_called_once_with(catalog)
                self.assertEqual(part['parentProjectId'],parent)
                for key,value in before.items():self.assertEqual(part[key],value)

    def test_grouping_validates_the_complete_package_and_rejects_cycles_atomically(self):
        catalog={'projects':[{'id':'a'},{'id':'b'},{'id':'c'}]}
        for drafts in ([{'id':'a','parentProjectId':'missing'}],[{'id':'a','parentProjectId':'a'}],
                       [{'id':'a','parentProjectId':True}],
                       [{'id':'a','parentProjectId':'b'},{'id':'b','parentProjectId':'a'}]):
            before=copy.deepcopy(catalog)
            with self.assertRaises(ValueError):import_drafts.apply_relationships(catalog,drafts)
            self.assertEqual(catalog,before)
        import_drafts.apply_relationships(catalog,[{'id':'a','parentProjectId':'b'},{'id':'b','parentProjectId':'c'}])
        before=copy.deepcopy(catalog)
        with self.assertRaises(ValueError):import_drafts.apply_relationships(catalog,[{'id':'c','parentProjectId':'a'}])
        self.assertEqual(catalog,before)
        import_drafts.apply_relationships(catalog,[{'id':'a'}])
        self.assertEqual(catalog,before,'Legacy drafts preserve grouping')

    def test_classification_archive_and_restore_survive_owner_import(self):
        project={'id':'same','title':'Ресепшен','viewerPath':'/same','fusionDataFileId':'native-id',
                 'date':'2024-04-01','modelUrl':'assets/model.glb','designUrl':'assets/design.pdf','attachments':[]}
        original=copy.deepcopy(project)
        catalog={'projects':[project]}
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'drafts.json'
            for archived in (True,False):
                packet={'format':'forma-catalog-drafts-v1','projects':[{**project,'category':'furniture','furnitureType':'receptions','archived':archived}]}
                file.write_text(json.dumps(packet),encoding='utf-8')
                with patch.object(sys,'argv',['import_drafts.py',str(file)]),patch.object(import_drafts,'read_catalog',return_value=catalog),patch.object(import_drafts,'save_catalog') as save:
                    import_drafts.main()
                save.assert_called_once_with(catalog)
                self.assertIs(project['archived'],archived)
                self.assertEqual(project['category'],'furniture');self.assertEqual(project['furnitureType'],'receptions')
                for key,value in original.items():self.assertEqual(project[key],value)

    def test_legacy_drafts_preserve_existing_classification_and_invalid_flags_are_rejected(self):
        project={'category':'furniture','furnitureType':'octanorm','archived':True}
        import_drafts.apply_classification(project,{'title':'Other'})
        self.assertEqual(project,{'category':'furniture','furnitureType':'octanorm','archived':True})
        for fields in ({'category':'invalid'},{'furnitureType':'invalid'},{'archived':'false'}):
            before=copy.deepcopy(project)
            with self.assertRaises(ValueError):import_drafts.apply_classification(project,fields)
            self.assertEqual(project,before)
        import_drafts.apply_classification(project,{'category':'stands','archived':False})
        self.assertEqual(project,{'category':'stands','furnitureType':'','archived':False})

if __name__=='__main__':unittest.main()
