from pathlib import Path
import json,struct,urllib.parse,re,gzip,hashlib

ROOT=Path(__file__).resolve().parent.parent
def main():
    data=json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8'))
    storage_file=ROOT/'data/asset-storage.json'
    storage=json.loads(storage_file.read_text(encoding='utf-8')) if storage_file.is_file() else {}
    cloud=storage.get('files',{}) if storage.get('enabled') else {}
    if cloud:
        assert storage['version']==1 and storage['provider']=='yandex-disk'
        public=urllib.parse.urlsplit(storage['publicKey'])
        assert public.scheme=='https' and public.hostname in ('disk.yandex.ru','yadi.sk')
        assert re.fullmatch(r'/d/[\w-]+/?',public.path) and not public.username and not public.password
    def check(url):
        assert url.startswith('assets/') and all(p not in ('','.','..') for p in url.split('/'))
        file=ROOT/url;row=cloud.get(url)
        assert file.is_file() or row, 'Asset missing locally and from verified cloud storage: '+url
        if row:
            assert 0<row['bytes']<=200*1024*1024 and re.fullmatch('[a-f0-9]{64}',row['sha256'])
            if file.is_file():assert file.stat().st_size==row['bytes'] and hashlib.sha256(file.read_bytes()).hexdigest()==row['sha256'],url
        elif file.is_file():assert file.stat().st_size<100*1024*1024
        return file
    for url in cloud:check(url)
    ids=set();slugs=set();checked=0
    for p in data['projects']:
        assert p['id'] not in ids;ids.add(p['id'])
        assert re.fullmatch('/[a-z0-9][a-z0-9-]{0,79}',p['viewerPath'])
        assert p['viewerPath'] not in slugs;slugs.add(p['viewerPath'])
        assert (ROOT/p['viewerPath'].strip('/')/'index.html').is_file()
        for entry in [p,*p.get('furniture',[])]:
            for key in ['modelUrl','modelGzipUrl','bannerModelUrl','bannerLayoutUrl','bannerCoverUrl','coverUrl','designUrl','assemblyUrl','expoUrl','electricalUrl','f3dUrl','sourceFileUrl','autoAssemblyUrl','dxfUrl']:
                url=entry.get(key)
                if not url:continue
                check(url);checked+=1
            for attachment in entry.get('attachments',[]):check(attachment['url']);checked+=1
            file=ROOT/entry['modelUrl']
            if file.is_file():
                model=file.read_bytes()
                assert model[:4]==b'glTF' and struct.unpack_from('<I',model,8)[0]==len(model)
                g=json.loads(model[20:20+struct.unpack_from('<I',model,12)[0]])
                for r in g.get('buffers',[])+g.get('images',[]):assert not r.get('uri') or r['uri'].startswith('data:')
            else:assert cloud[entry['modelUrl']].get('selfContainedGLB') is True
            if entry.get('modelGzipUrl'):
                packed=ROOT/entry['modelGzipUrl']
                if packed.is_file() and file.is_file():assert gzip.decompress(packed.read_bytes())==model,'Compressed model differs from source'
                else:
                    assert cloud[entry['modelGzipUrl']]['decodedSHA256']==cloud[entry['modelUrl']]['sha256']
                    assert cloud[entry['modelGzipUrl']]['decodedBytes']==cloud[entry['modelUrl']]['bytes']
            if entry.get('bannerLayoutUrl'):
                layout=json.loads((ROOT/entry['bannerLayoutUrl']).read_text(encoding='utf-8'))
                assert layout['modelUrl']==entry['modelUrl'],'Banner layout belongs to an older model'
                for surface in layout['surfaces']:
                    url=surface.get('imageUrl')
                    if url:
                        check(url)
                        checked+=1
    for name in ['viewer-pro.js','app.js','site-config.js','viewer-share.js']:
        text=(ROOT/name).read_text(encoding='utf-8');assert 'zalyaltn.beget.tech' not in text
        assert '/api/catalog/' not in text and '/api/fusion/' not in text
    print('PASS:',len(ids),'unique projects/short routes;',checked,'file links;',len(cloud),'verified cloud assets; all GLBs self-contained; no Beget API calls.')
if __name__=='__main__':main()
