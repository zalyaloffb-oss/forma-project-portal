from pathlib import Path
import json,struct,urllib.parse,re

ROOT=Path(__file__).resolve().parent.parent
def main():
    data=json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8'))
    ids=set();slugs=set();checked=0
    for p in data['projects']:
        assert p['id'] not in ids;ids.add(p['id'])
        assert re.fullmatch('/[a-z0-9][a-z0-9-]{0,79}',p['viewerPath'])
        assert p['viewerPath'] not in slugs;slugs.add(p['viewerPath'])
        assert (ROOT/p['viewerPath'].strip('/')/'index.html').is_file()
        for entry in [p,*p.get('furniture',[])]:
            for key in ['modelUrl','coverUrl','designUrl','assemblyUrl','f3dUrl','sourceFileUrl','autoAssemblyUrl','dxfUrl']:
                url=entry.get(key)
                if not url:continue
                assert url.startswith('assets/') and '..' not in url
                file=ROOT/url;assert file.is_file(),file
                checked+=1;assert file.stat().st_size<100*1024*1024
            model=(ROOT/entry['modelUrl']).read_bytes()
            assert model[:4]==b'glTF' and struct.unpack_from('<I',model,8)[0]==len(model)
            g=json.loads(model[20:20+struct.unpack_from('<I',model,12)[0]])
            for r in g.get('buffers',[])+g.get('images',[]):assert not r.get('uri') or r['uri'].startswith('data:')
    for name in ['viewer-pro.js','app.js','site-config.js','viewer-share.js']:
        text=(ROOT/name).read_text(encoding='utf-8');assert 'zalyaltn.beget.tech' not in text
        assert '/api/catalog/' not in text and '/api/fusion/' not in text
    print('PASS:',len(ids),'unique projects/short routes;',checked,'local file links; all GLBs self-contained; no Beget API calls.')
if __name__=='__main__':main()
