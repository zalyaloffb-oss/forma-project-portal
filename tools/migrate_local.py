"""Recover the public catalogue from verified local exports; never copy server secrets."""
from pathlib import Path
import json,shutil,hashlib,html,re,struct

ROOT=Path(__file__).resolve().parent.parent
PORTAL=Path('C:/Users/LEGION/Documents/ChatGPT/программы/forma-beget')
BULAT=Path('C:/Users/LEGION/Documents/ChatGPT/Булат')
TREST=BULAT/'tmp/catalog_trest_20261101'
report=[]

def put_asset(slug,source,kind):
    source=Path(source)
    if not source.is_file():
        report.append({'project':slug,'missing':kind,'source':str(source)});return ''
    data=source.read_bytes();digest=hashlib.sha256(data).hexdigest()
    suffix=source.suffix.lower() or {'model':'.glb','cover':'.png','f3d':'.f3d'}.get(kind,'')
    if source.name in ('model','cover','f3d'):suffix={'model':'.glb','cover':'.png','f3d':'.f3d'}[source.name]
    if len(data)>99*1024*1024:raise ValueError('Use a release asset for files larger than Git limit: '+source.name)
    dest=ROOT/'assets'/slug/(kind+'-'+digest[:12]+suffix);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
    report.append({'project':slug,'kind':kind,'bytes':len(data),'sha256':digest,'file':dest.relative_to(ROOT).as_posix()})
    return dest.relative_to(ROOT).as_posix()

def materialized_viewer(project,base):
    s=(ROOT/'viewer.html').read_text(encoding='utf-8')
    s=s.replace('<head>','<head><base href="'+base+'">',1)
    title=html.escape(project['title']+' — 3D');s=re.sub(r'<title>.*?</title>','<title>'+title+'</title>',s,count=1)
    payload=json.dumps(project,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    s=s.replace('</head>','<link rel="canonical" href="https://zalyaloffb-oss.github.io/forma-project-portal/'+project['viewerPath'].strip('/')+'/"><meta property="og:image" content="https://zalyaloffb-oss.github.io/forma-project-portal/'+project.get('coverUrl','')+'"><meta property="og:title" content="'+title+'"><meta property="og:description" content="3D-модель проекта в каталоге Форма"><script>window.FORMA_PROJECT='+payload+';</script></head>')
    folder=ROOT/project['viewerPath'].strip('/');folder.mkdir(exist_ok=True);(folder/'index.html').write_text(s,encoding='utf-8')

def main():
    public=PORTAL/'public/catalog'
    # Explicit public source allowlist: never private/, migration/, credentials or CAD working files.
    for p in public.iterdir():
        if p.is_file() and p.suffix in ('.js','.css','.json') and p.name!='app.js':shutil.copyfile(p,ROOT/p.name)
    shutil.copytree(public/'vendor',ROOT/'vendor',dirs_exist_ok=True)
    shutil.copyfile(public/'index.html',ROOT/'index.html')
    shutil.copyfile(PORTAL/'private/viewer-template.html',ROOT/'viewer.html')
    # Dedicated adaptations are applied by adapt_site.py, after copying upstream sources.
    original=json.loads((BULAT/'tmp/catalog-before.json').read_text(encoding='utf-8'))
    items=original['projects']
    slugs=['tachpanel','engels','1c-firma','fpp-3-iyun-2026','kazanforum-2026','dotspace-2026']
    local=Path.home()
    sources={
      'tachpanel':local/'forma-fusion-touchpanel',
      'engels':local/'forma-fusion-engels-20261026',
      '1c-firma':PORTAL/'joints',
      'fpp-3-iyun-2026':PORTAL/'max-exporter/fpp-june-2026',
      'kazanforum-2026':PORTAL/'max-exporter/kazanforum-selected',
      'dotspace-2026':PORTAL/'private/storage/fusion/files/be697b09-43d4-415a-90da-7b7593fd6e4c'
    }
    for project,slug in zip(items,slugs):
        assert (slug!='engels' or project['title']=='ЭНГЕЛЬС')
        source=sources[slug]
        project['viewerPath']='/'+slug
        model=source/('published.glb' if slug=='1c-firma' else 'model' if slug=='dotspace-2026' else 'model.glb')
        project['modelUrl']=put_asset(slug,model,'model')
        if slug=='1c-firma':cover=local/'forma-max-work/cover.png' # replaced below with verified 1C cover if available
        else:cover=source/('cover' if slug=='dotspace-2026' else 'cover.png')
        if slug=='1c-firma':cover=ROOT/'assets/1c-firma/cover-recovered.png'
        project['coverUrl']=put_asset(slug,cover,'cover')
        project['f3dUrl']='';project['sourceFileUrl']='';project['designUrl']='';project['assemblyUrl']='';project['autoAssemblyUrl']=''
        # Preserve only files whose source identity has been verified.
        if slug in ('engels','tachpanel','dotspace-2026'):
            project['f3dUrl']=put_asset(slug,source/('f3d' if slug=='dotspace-2026' else 'source.f3d'),'f3d')
        if slug=='fpp-3-iyun-2026':
            project['assemblyUrl']=put_asset(slug,source/'assembly.pdf','assembly')
            project['sourceFileUrl']=put_asset(slug,local/'Downloads/ФПП 3 июнь 2026 монтажка.max','source')
        if slug=='kazanforum-2026':
            project['assemblyUrl']=put_asset(slug,PORTAL/'max-exporter/kazanforum/assembly.pdf','assembly')
            project['sourceFileUrl']=put_asset(slug,local/'Downloads/KAZANFORUM монтажка 2026.max','source')
        if slug=='dotspace-2026':
            project['designUrl']=put_asset(slug,Path('C:/#bulat/DOTSPACE_стенд/dotspace 2026 презентация 5.pdf'),'design')
            project['assemblyUrl']=put_asset(slug,Path('C:/#bulat/DOTSPACE_стенд/DOTSPACE 2026 - stand Drawing v19.pdf'),'assembly')
        if slug=='engels':
            project['fusionVersion']='62';project['model']='fusion'
            project['assemblyUrl']=put_asset(slug,BULAT/'output/pdf/ЭНГЕЛЬС_все_монтажные_схемы.pdf','assembly')
        # Previously attached external URLs are not left pointing at the failed host.
        project['attachments']=[a for a in project.get('attachments',[]) if not a.get('url','').startswith('/api/')]
        for key in ['title','customer','event','manager','date','status','source']:project.setdefault(key,'')
        project['published']=True
    receipt=json.loads((TREST/'publication_receipt.json').read_text(encoding='utf-8'))
    project={'id':receipt['projectId'],'title':'Первый трест','customer':'Первый трест','event':'','manager':'','date':'2026-11-01','status':'Не указан','source':'','model':'fusion','fusionVersion':receipt['version'],'viewerPath':'/pervyy-trest','published':True,'attachments':[]}
    for kind in ['model','cover','f3d']:
        project[kind+'Url']=put_asset('pervyy-trest',TREST/('source.f3d' if kind=='f3d' else 'model.glb' if kind=='model' else 'cover.png'),kind)
    project['designUrl']=put_asset('pervyy-trest',Path('C:/#bulat/Трест_выставочный стенд/Стенд1трест28.10.26.pdf'),'design')
    project['assemblyUrl']=put_asset('pervyy-trest',Path('C:/#bulat/Трест_выставочный стенд/новые монтажки/ТРЕСТ_короба_ДСП16_v89_внутренние_размеры.pdf'),'assembly')
    items.insert(0,project)
    shutil.copyfile(TREST/'trest-part-numbers.json',ROOT/'trest-part-numbers.json')
    (ROOT/'data').mkdir(exist_ok=True)
    (ROOT/'data/catalog.json').write_text(json.dumps({'projects':items,'managers':original.get('managers',[]),'storage':'github-pages','recoveredAt':'2026-11-04'},ensure_ascii=False,indent=2),encoding='utf-8')
    # Do not publish a local inventory of user filesystem paths.
    (Path.home()/'forma-github-recovery-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Recovered',len(items),'projects;',sum(r.get('bytes',0) for r in report)//1024//1024,'MiB')
    print('Unavailable files:',[(r['project'],r['missing']) for r in report if 'missing' in r])

if __name__=='__main__':main()
