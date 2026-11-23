"""Owner-side publication. Git authenticates through its credential manager.

No GitHub credentials are ever placed in browser code or in this repository.
"""
from pathlib import Path
import argparse,datetime,hashlib,json,re,shutil,struct,subprocess,urllib.parse,gzip

ROOT=Path(__file__).resolve().parent.parent
SITE='https://zalyaloffb-oss.github.io/forma-project-portal/'

def slugify(value):
    chars=dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя', ['a','b','v','g','d','e','e','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','h','ts','ch','sh','sch','','y','','e','yu','ya']))
    text=''.join(chars.get(c,c) for c in value.lower())
    return re.sub('[^a-z0-9]+','-',text).strip('-')[:64] or 'proekt'

def read_catalog():return json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8'))

def creation_date(meta):
    value=meta.get('sourceCreatedAt')
    if value:
        created=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
        if created.tzinfo is None:raise ValueError('Fusion creation time must include its timezone')
        return created.astimezone(datetime.timezone(datetime.timedelta(hours=3))).date().isoformat()
    if meta.get('dataFileId'):
        raise ValueError('Fusion не передал дату первой версии. Обновите экспортёр; текущая дата не подставляется.')
    return datetime.date.today().isoformat()

def match_project(items,meta):
    source=meta.get('dataFileId')
    if source:
        found=[p for p in items if p.get('fusionDataFileId')==source]
        if len(found)>1:raise ValueError('Several projects have the same Fusion source identity')
        if found:return found[0]
    explicit=meta.get('expectedExistingProjectId') or meta.get('projectId')
    if explicit:
        found=next((p for p in items if p['id']==explicit),None)
        if found:
            if source and found.get('fusionDataFileId') not in (None,'',source):raise ValueError('Explicit project and Fusion source identities conflict')
            return found
        if meta.get('expectedExistingProjectId'):raise ValueError('Expected project is missing; refusing to create a duplicate')
    found=[p for p in items if p['title'].strip().casefold()==meta['title'].strip().casefold()]
    if len(found)>1:
        if source and all(p.get('model')=='max' or (p.get('fusionDataFileId') and p['fusionDataFileId']!=source) for p in found):return None
        raise ValueError('Ambiguous project title; specify projectId')
    if found and source and (found[0].get('fusionDataFileId') not in (None,'',source) or found[0].get('model')=='max'):return None
    return found[0] if found else None

def write_asset(project,kind,source,disk=None):
    source=Path(source)
    storage_file=ROOT/'data/asset-storage.json'
    storage=json.loads(storage_file.read_text(encoding='utf-8')) if storage_file.is_file() else None
    cloud=storage and storage.get('enabled') and kind!='cover'
    size=source.stat().st_size
    if cloud and kind in ('f3d','source') and size>200*1024*1024:
        from yandex_disk import Disk,file_sha256
        if size>50*1024**3:raise ValueError('Source exceeds the verified Disk file limit: '+source.name)
        digest=file_sha256(source);suffix='.f3d' if kind=='f3d' else source.suffix.lower()
        path='assets/'+project['viewerPath'].strip('/')+'/'+kind+'-'+digest[:12]+suffix
        (disk or Disk()).upload(source,path,expected_sha256=digest)
        storage['files'][path]={'bytes':size,'sha256':digest,'mime':'application/octet-stream','downloadOnly':True}
        temporary=storage_file.with_suffix('.json.next')
        temporary.write_text(json.dumps(storage,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temporary.replace(storage_file)
        return path
    data=source.read_bytes()
    limit=(200 if cloud else 99)*1024*1024
    if len(data)>limit:raise ValueError('File exceeds the storage limit: '+source.name)
    suffix={ 'model':'.glb','cover':('.jpg' if data.startswith(b'\xff\xd8') else '.png'),'f3d':'.f3d','assembly':'.pdf'}.get(kind,source.suffix.lower())
    if kind=='model':
        if len(data)<28 or data[:4]!=b'glTF' or struct.unpack_from('<I',data,8)[0]!=len(data):raise ValueError('Invalid GLB')
        g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
        for r in g.get('buffers',[])+g.get('images',[]):
            if r.get('uri') and not r['uri'].startswith('data:'):raise ValueError('GLB must contain its textures and buffers')
    name=kind+'-'+hashlib.sha256(data).hexdigest()[:12]+suffix
    target=ROOT/'assets'/project['viewerPath'].strip('/')/name
    if cloud:
        from yandex_disk import Disk
        from prepare_yandex_storage import descriptor
        if storage.get('version')!=1 or storage.get('provider')!='yandex-disk':raise ValueError('Unknown asset storage')
        disk=disk or Disk();path=target.relative_to(ROOT).as_posix()
        uploads={path:data}
        if kind=='model':uploads[path+'.gz']=gzip.compress(data,compresslevel=6,mtime=0)
        records={}
        for remote,content in uploads.items():
            row=descriptor(remote,content)
            if remote==path:disk.upload(source,remote,expected_sha256=row['sha256'])
            else:disk.upload(source,remote,expected_sha256=row['sha256'],content=content)
            records[remote]=row
        storage['files'].update(records)
        temporary=storage_file.with_suffix('.json.next')
        temporary.write_text(json.dumps(storage,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temporary.replace(storage_file)
        if kind=='model':project['modelGzipUrl']=path+'.gz'
        return path
    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    if kind=='model':
        packed=target.with_suffix(target.suffix+'.gz');packed.write_bytes(gzip.compress(data,compresslevel=6,mtime=0))
        project['modelGzipUrl']=packed.relative_to(ROOT).as_posix()
    return target.relative_to(ROOT).as_posix()

def save_catalog(data):
    file=ROOT/'data/catalog.json';temporary=file.with_suffix('.json.next')
    temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temporary.replace(file)
    from migrate_local import materialized_viewer
    for p in data['projects']:
        materialized_viewer(p,'../')
        for item in p.get('furniture',[]):
            if not re.fullmatch('[a-z0-9][a-z0-9-]{0,79}',item['id']):raise ValueError('Invalid furniture route')
            page={**item,'id':p['id'],'itemId':item['id'],'title':p['title']+' · '+item['title'],'viewerPath':p['viewerPath']+'/'+item['id']}
            materialized_viewer(page,'../../')

def git(*args):
    result=subprocess.run(['git','-C',str(ROOT),*args],capture_output=True,text=True,encoding='utf-8')
    if result.returncode:raise RuntimeError(result.stderr[-1000:])
    return result.stdout.strip()

def publish(meta,files,report=lambda *args:None,push=True,disk=None):
    if push and git('status','--porcelain'):raise RuntimeError('Сначала завершите текущие изменения репозитория; публикация остановлена.')
    source_date=creation_date(meta)
    data=read_catalog()
    furniture=[(p,item) for p in data['projects'] for item in p.get('furniture',[]) if meta.get('dataFileId') and item.get('fusionDataFileId')==meta['dataFileId']]
    if len(furniture)>1:raise ValueError('Ambiguous furniture source identity')
    if furniture:
        parent,project=furniture[0]
        action='updated'
    else:
        parent=None;project=match_project(data['projects'],meta);action='updated' if project else 'created'
    if project is None:
        source=meta.get('dataFileId') or meta.get('projectKey') or meta['title']
        pid=meta.get('projectId') or ('fusion-' if meta.get('dataFileId') else 'max-')+hashlib.sha256(source.encode()).hexdigest()
        slug=slugify(meta['title']);used={p['viewerPath'] for p in data['projects']}
        if '/'+slug in used:slug+='-'+hashlib.sha256(pid.encode()).hexdigest()[:6]
        project={'id':pid,'title':meta['title'],'customer':'Не указан','event':'','manager':'','date':source_date,'status':'Не указан','source':'','viewerPath':'/'+slug,'attachments':[],'published':True}
        data['projects'].insert(0,project)
    report(7,'Подготовка файлов каталога…')
    if parent is None:project['title']=meta['title']
    project['model']='fusion' if meta.get('dataFileId') else project.get('model','max')
    if meta.get('dataFileId'):project['fusionDataFileId']=meta['dataFileId'];project['fusionVersion']=str(meta.get('version',''))
    if meta.get('dataFileId'):
        project['sourceApp']='Fusion'
        if 'bodyCount' in meta:project['bodyCount']=meta['bodyCount']
        if 'sourceFolderPath' in meta:project['fusionFolderPath']=meta['sourceFolderPath']
    if meta.get('sourceCreatedAt'):
        project['date']=source_date
        for key in ('sourceCreatedAt','sourceCreatedVersion','dateSource'):
            if key in meta:project[key]=meta[key]
    for kind,source in files.items():
        if kind not in ['model','cover','f3d','source','assembly']:raise ValueError('Unexpected file type')
        destination={**project,'viewerPath':(parent or project)['viewerPath']}
        path=write_asset(destination,kind,source,disk=disk);project[{'source':'sourceFileUrl'}.get(kind,kind+'Url')]=path
        if kind=='model':project['modelGzipUrl']=destination['modelGzipUrl']
    project['updatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save_catalog(data)
    route=parent or project
    if push:
        report(11,'Публикация каталога в GitHub…')
        git('add','--','data/catalog.json','assets',route['viewerPath'].strip('/'))
        if (ROOT/'data/asset-storage.json').is_file():git('add','--','data/asset-storage.json')
        if git('diff','--cached','--name-only'):
            git('commit','-m','Update catalogue model: '+project['title']);git('push','origin','main')
    url=SITE+route['viewerPath'].strip('/')+'/'+(urllib.parse.quote(project['id'])+'/' if parent else '')
    return {'ok':True,'action':action,'projectId':route['id'],'version':str(meta.get('version','')),'assetId':hashlib.sha256(Path(files['model']).read_bytes()).hexdigest()[:24],
            'url':url,'viewerUrl':url,'deployment':'GitHub Pages build pending' if push else 'local'}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--manifest',required=True);parser.add_argument('--local-only',action='store_true');args=parser.parse_args()
    manifest=json.loads(Path(args.manifest).read_text(encoding='utf-8-sig'))
    result=publish(manifest['meta'],manifest['files'],push=not args.local_only)
    if manifest.get('receipt'):Path(manifest['receipt']).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
