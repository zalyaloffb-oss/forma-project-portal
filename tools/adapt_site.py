from pathlib import Path
import re,json,html
ROOT=Path(__file__).resolve().parent.parent
UPSTREAM=Path('C:/Users/LEGION/Documents/ChatGPT/программы/forma-beget/public/catalog')

def main():
    lines=(UPSTREAM/'app.js').read_text(encoding='utf-8').splitlines()
    # Reuse all existing catalogue, drawer, PDF/JPG, batch and settings UI.
    # Remove MySQL authentication, upload and server-PDF-generation code entirely.
    source='\n'.join(lines[:87]+lines[149:157])
    source="import {loadCatalogue,SITE_ROOT} from './site-config.js';\n"+source
    source=source.replace("indexedDB.open('forma-project-library',1)","indexedDB.open('forma-project-library-github-v1',1)")
    source=source.replace("toast('Проект сохранён на хостинге')","toast('Черновик сохранён в этом браузере. Для общего доступа скачайте изменения для публикации.')")
    source=source.replace("try{db=await openDB();await refresh();}","try{db=await openDB();await loadPublished();}")
    source+='\n'+(ROOT/'tools/static-app-tail.js').read_text(encoding='utf-8')
    (ROOT/'app.js').write_text(source,encoding='utf-8')
    viewer=(UPSTREAM/'viewer-pro.js').read_text(encoding='utf-8')
    viewer="import {loadCatalogue,permittedModel} from './site-config.js';\n"+viewer
    viewer=viewer.replace("const response=await fetch('/api/catalog/projects',{cache:'no-store'});if(!response.ok)throw Error('Не удалось загрузить проект');\n  const data=await response.json(),project=data.projects.find(p=>p.id===projectId);", "const data=await loadCatalogue(),project=data.projects.find(p=>p.id===projectId);")
    viewer=re.sub(r"if\(requested&&!/.*?\.test\(requested\)\)throw Error\('Недопустимый адрес модели'\);", "if(requested&&!permittedModel(requested))throw Error('Недопустимый адрес модели');",viewer)
    viewer=viewer.replace('part-numbers.js?v=engels-60-20261026','part-numbers.js?v=github-20261104')
    (ROOT/'viewer-pro.js').write_text(viewer,encoding='utf-8')
    share=(UPSTREAM/'viewer-share.js').read_text(encoding='utf-8')
    share="import {SITE_ROOT} from './site-config.js';\n"+share
    share=share.replace('new URL(project.viewerPath,location.origin).href',"new URL(project.viewerPath.slice(1)+'/',SITE_ROOT).href")
    share=share.replace("new URL('/catalog/viewer.html',location.origin)","new URL('viewer.html',SITE_ROOT)")
    (ROOT/'viewer-share.js').write_text(share,encoding='utf-8')
    numbers=(UPSTREAM/'part-numbers.js').read_text(encoding='utf-8')
    numbers=numbers.replace("projectId===engelsProject?['engels']:null", "projectId===engelsProject?['engels']:projectId==='fusion-33a9c8dba62e3ca65ecc75221596d8db8c99fb2f54aa3f1ea461dbb80483f617'?['trest']:null")
    numbers=re.sub(r'fetch\(`\./\$\{scope\}-part-numbers.json\?v=.*?`\)',"fetch(`./${scope}-part-numbers.json?v=github-20261104`)",numbers)
    (ROOT/'part-numbers.js').write_text(numbers,encoding='utf-8')
    s=(ROOT/'index.html').read_text(encoding='utf-8')
    s=s.replace('app.js?v=short-links-1','app.js?v=github-20261104')
    s=s.replace('Данные — в базе MySQL.<br>Файлы — на хостинге.','Опубликованные проекты — на GitHub.<br>Черновики — в этом браузере.')
    s=s.replace('Файлы сохраняются на хостинге.','Импорт сохраняется в этом браузере. Для общего доступа скачайте изменения для публикации в настройках.')
    s=s.replace('Публичное демо · Данные на хостинге','GitHub · Общий каталог и локальные черновики')
    (ROOT/'index.html').write_text(s,encoding='utf-8')
    v=(ROOT/'viewer.html').read_text(encoding='utf-8').replace('viewer-pro.js?v=part-dxf-20261027-2','viewer-pro.js?v=github-20261104')
    (ROOT/'viewer.html').write_text(v,encoding='utf-8')
    from migrate_local import materialized_viewer
    for project in json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8'))['projects']:materialized_viewer(project,'../')
    (ROOT/'.nojekyll').touch()

if __name__=='__main__':main()
