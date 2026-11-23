from pathlib import Path
import copy,json,sys,tempfile,unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import import_drafts

class ClassificationImport(unittest.TestCase):
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
