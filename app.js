import {loadCatalogue,projectModel} from './site-config.js?v=banner-preview-1';
import {projectCategory,filterProjects,matchesCollection,navigationCounts,collectionTitle,furnitureTypes,moveProject,projectGroups,mergeProjects,separateProject} from './catalog-filters.js?v=project-groups-1';
import {openPdf} from './pdf-engine.js?v=lazy-pdf-1';
import {viewerLink} from './viewer-share.js?v=performance-1';
import {fetchAsset,installAssetLinks} from './asset-store.js?v=large-source-1';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db, projects=[], selected=null, editing=null, doc=null, page=1, renderVersion=0, drawVersion=0, tab='design', downloadUrl=null;
let collection={view:'all',furnitureType:''},furnitureExpanded=false,movingId=null,selectionMode=false;
const chosenProjects=new Set();
const urls=new Map(), statuses=['Реализовано','На стадии проекта','Не согласовано'];
const fmt=date=>!date?'Не указана':new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(date+'T12:00:00'));
const badge=s=>`<span class="badge ${s===statuses[1]?'progress':s===statuses[2]?'rejected':''}">${esc(s)}</span>`;
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),3500)}
installAssetLinks(toast);

function setSidebar(open){
 const panel=$('#catalog-sidebar'),button=$('#settings-btn');
 if(!open&&panel.contains(document.activeElement))button.focus();
 panel.hidden=!open;
 $('#sidebar-backdrop').hidden=!open;
 document.body.classList.toggle('sidebar-open',open);
 button.setAttribute('aria-expanded',String(open));
 button.title=open?'Закрыть левую панель':'Открыть левую панель';
 button.setAttribute('aria-label',button.title);
}
$('#settings-btn').onclick=()=>setSidebar($('#catalog-sidebar').hidden);
$('#sidebar-backdrop').onclick=()=>setSidebar(false);
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&selectionMode&&!document.querySelector('dialog[open]')){
  event.preventDefault();setProjectSelection(false);return;
 }
 if(event.key==='Escape'&&!$('#catalog-sidebar').hidden&&!document.querySelector('dialog[open]')){
  event.preventDefault();setSidebar(false);
 }
});

function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('forma-project-library-github-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function records(){return new Promise((resolve,reject)=>{const tx=db.transaction('projects'),r=tx.objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function putLocal(p){return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(p);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
async function coverFor(blob){const pdf=await openPdf(blob);try{const p=await pdf.getPage(1),v=p.getViewport({scale:1.1}),c=document.createElement('canvas');c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return await new Promise(r=>c.toBlob(r,'image/png'));}finally{await pdf.destroy()}}
async function refresh(){
 projects=(await records()).filter(p=>!p.browserOriginalId).sort((a,b)=>Number(!!b.model)-Number(!!a.model)||(b.date||'').localeCompare(a.date||''));
 for(const url of urls.values())URL.revokeObjectURL(url);
 urls.clear();
 projects.forEach(p=>{if(p.cover)urls.set(p.id,URL.createObjectURL(p.cover));});
 const customer=$('#customer-filter').value,year=$('#year-filter').value;
 const customers=[...new Set(projects.map(p=>p.customer||'Не указан'))].sort((a,b)=>a.localeCompare(b,'ru'));
 $('#customer-filter').innerHTML='<option value="">Все заказчики</option>'+customers.map(c=>`<option>${esc(c)}</option>`).join('');
 $('#customer-filter').value=customers.includes(customer)?customer:'';
 $('#customer-list').innerHTML=customers.map(c=>`<option value="${esc(c)}"></option>`).join('');
 const years=[...new Set(projects.map(p=>String(p.date||'').slice(0,4)).filter(Boolean))].sort().reverse();
 $('#year-filter').innerHTML='<option value="">Все годы</option>'+years.map(y=>`<option>${y}</option>`).join('');
 $('#year-filter').value=years.includes(year)?year:'';
 render();
}
function render(){
 renderSidebar();renderProjectSelection();
 const groups=projectGroups(projects);
 const filtered=filterProjects(projects,collection,{query:$('#search').value,customer:$('#customer-filter').value,status:$('#status-filter').value,year:$('#year-filter').value});
 const total=groups.roots.filter(p=>matchesCollection(p,collection)).length;
 $('#result-count').textContent=`Показано ${filtered.length} из ${total}`;
 const emptyTitle=collection.view==='archive'&&!total?'Архив пуст':'Проекты не найдены';
 const emptyHint=collection.view==='archive'&&!total?'Перенесите проект в архив через «Переместить в раздел».':'Измените фильтры или добавьте новый проект.';
 $('#grid').innerHTML=filtered.length?filtered.map(p=>`<article class="card-shell ${chosenProjects.has(p.id)?'is-selected':''}"><button class="card" data-id="${esc(p.id)}" aria-label="${selectionMode?'Выбрать':'Открыть'} проект ${esc(p.title)}"${selectionMode?` aria-pressed="${chosenProjects.has(p.id)}"`:''}><div class="cover">${(urls.get(p.id)||p.coverUrl)?`<img src="${esc(urls.get(p.id)||p.coverUrl)}" alt="${p.model&&!p.design?'Превью модели Fusion':'Первая страница дизайн-проекта'}" loading="lazy" decoding="async">`:'<span class="no-cover">Добавьте дизайн-проект</span>'}<span class="cover-count">${p.model?'3D · ':''}${['design','assembly','expo','electrical'].filter(key=>p[key]||p[key+'Url']).length} PDF${p.attachments?.length?` · ${p.attachments.length} файлов`:""}</span></div><div class="card-content"><div class="card-kicker"><span class="customer">${esc(p.customer)}</span>${badge(p.status)}</div><h2>${esc(p.title)}</h2>${groups.parts.has(p.id)?`<div class="card-group">Состав проекта · ${groups.parts.get(p.id).length}</div>`:''}${p.event?`<p>${esc(p.event)}</p>`:''}<div class="card-bottom"><span>${esc(p.manager)}</span><span>${fmt(p.date)}</span></div></div></button><label class="card-select"${selectionMode?'':' hidden'}><input type="checkbox" data-select-id="${esc(p.id)}" aria-label="Выбрать проект ${esc(p.title)}"${chosenProjects.has(p.id)?' checked':''}></label><button type="button" class="card-move" data-move-id="${esc(p.id)}" aria-label="Переместить проект ${esc(p.title)} в раздел" title="Переместить в раздел"${selectionMode?' hidden':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M10 19H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v2M13 17h9m-4-4 4 4-4 4"/></svg></button></article>`).join(''):`<div class="empty"><h2>${emptyTitle}</h2><p>${emptyHint}</p></div>`;
 document.querySelectorAll('.card').forEach(card=>card.onclick=()=>selectionMode?toggleProjectSelection(card.dataset.id):openProject(card.dataset.id));
 document.querySelectorAll('[data-select-id]').forEach(input=>input.onchange=()=>toggleProjectSelection(input.dataset.selectId));
 document.querySelectorAll('[data-move-id]').forEach(button=>button.onclick=()=>openMoveProject(button.dataset.moveId));
}
async function openProject(id,preferredTab){
 selected=projects.find(project=>project.id===id);if(!selected)return;
 const p=selected,groups=projectGroups(projects),parts=groups.parts.get(id)||[];
 const parentId=groups.rootIds.get(id),parent=parentId!==id?groups.byId.get(parentId):null;
 const tabs=[['design','Дизайн-проект'],['assembly','Монтажная схема'],['expo','Экспоплан'],['electrical','Электросхема'],['banners','Баннеры 3D']];
 if(p.model)tabs.push(['model','3D-модель']);
 if(p.furniture?.length)tabs.push(['furniture','Мебель']);
 if(parts.length)tabs.push(['parts',`Состав проекта (${parts.length})`]);
 tab=tabs.some(([key])=>key===preferredTab)?preferredTab:p.model?'model':(p.design||p.designUrl)?'design':parts.length?'parts':p.attachments?.length?'files':'design';
 $('#drawer-content').innerHTML=`${parent?`<button class="project-parent" id="parent-project">← ${esc(parent.title)}</button>`:''}<h2>${esc(p.title)}</h2>${badge(p.status)}<dl class="details"><div><dt>Заказчик</dt><dd>${esc(p.customer)}</dd></div><div><dt>Дата создания</dt><dd>${fmt(p.date)}</dd></div><div><dt>Мероприятие</dt><dd>${esc(p.event)||'—'}</dd></div><div><dt>Менеджер компании</dt><dd>${esc(p.manager)||'—'}</dd></div></dl><div class="tabs">${tabs.map(([key,label])=>`<button class="tab ${tab===key?'selected':''}" data-tab="${key}">${label}</button>`).join('')}</div><div id="tab-loading" class="tab-loading" role="status" hidden><span class="tab-loading-track" aria-hidden="true"><i></i></span><span>Загрузка…</span></div>${p.attachments?.length?`<div class="attachments"><label>Материалы проекта (${p.attachments.length})<select id="attachment-select">${p.attachments.map((f,i)=>`<option value="${i}">${esc(f.name)}</option>`).join('')}</select></label><button id="open-attachment" class="quiet">Открыть файл</button></div>`:''}<div id="pdf-area"></div>${p.source?`<a class="source-link" href="${esc(p.source)}" target="_blank" rel="noopener noreferrer"><span><strong>Исходники проекта</strong></span></a>`:'<div class="source-link"><span><strong>Исходники проекта</strong><small>Ссылка на Яндекс Диск пока не добавлена</small></span></div>'}<div class="drawer-actions">${parent?'<button class="quiet" id="separate-btn">Отделить в самостоятельный проект</button>':'<button class="quiet" id="group-btn">Объединить с другими</button>'}<button class="quiet" id="move-btn">Переместить в раздел</button><button class="quiet" id="edit-btn">Редактировать проект</button></div>`;
 if(!$('#drawer').open)$('#drawer').showModal();
 document.querySelectorAll('.tab').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;document.querySelectorAll('.tab').forEach(other=>other.classList.toggle('selected',other===button));loadPDF()});
 if(p.attachments?.length){
  $('#open-attachment').onclick=()=>{tab='files';document.querySelectorAll('.tab').forEach(button=>button.classList.remove('selected'));loadPDF();};
  $('#attachment-select').onchange=()=>$('#open-attachment').click();
 }
 if(parent){$('#parent-project').onclick=()=>openProject(parent.id,'parts');$('#separate-btn').onclick=()=>detachProject(p.id);}
 else $('#group-btn').onclick=()=>setProjectSelection(true,p.id);
 $('#move-btn').onclick=()=>openMoveProject(p.id);
 $('#edit-btn').onclick=()=>{$('#drawer').close();openEditor(p.id)};
 await loadPDF();
}
async function loadPDF(){
 closePdfViewer();const version=++renderVersion;++drawVersion;
 const indicator=$('#tab-loading'),area=$('#pdf-area');
 indicator.hidden=false;area.setAttribute('aria-busy','true');
 area.innerHTML='<div class="empty-file">Загружаем содержимое…</div>';
 try{
  await loadTabContent(version);
  if(version!==renderVersion)return;
  await Promise.all([...area.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));
 }catch(error){
  if(version===renderVersion)area.innerHTML='<div class="empty-file">Не удалось загрузить содержимое. Попробуйте открыть вкладку ещё раз.</div>';
 }finally{
  if(version===renderVersion){indicator.hidden=true;area.setAttribute('aria-busy','false');}
 }
}
async function loadTabContent(version){const old=doc;doc=null;if(old)await old.destroy();if(version!==renderVersion)return;if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null;if(tab==='parts'){renderProjectParts();return;}if(tab==='banners'){
 let preview=urls.get(selected.id)||selected.coverUrl||'';
 if(selected.model&&selected.bannerCoverUrl){
  const cover=await fetchAsset(selected.bannerCoverUrl)
   .then(response=>response.ok?response.blob():null).catch(()=>null);
  if(version!==renderVersion)return;
  if(cover){downloadUrl=URL.createObjectURL(cover);preview=downloadUrl;}
 }
 $('#pdf-area').innerHTML=selected.model?`<button class="model-preview banner-preview" id="open-banners" aria-label="Открыть Баннеры 3D"><img src="${esc(preview)}" alt="Превью схемы размещения баннеров"><span>Открыть Баннеры 3D</span></button>`:'<div class="empty-file">Сначала добавьте 3D-модель проекта.</div>';
 if($('#open-banners'))$('#open-banners').onclick=()=>openModelViewer(selected,'banners');return;
}if(tab==='furniture'){
 const items=selected.furniture||[];
 $('#pdf-area').innerHTML='<div class="furniture-list">'+items.map(item=>`<article class="furniture-card"><h3>${esc(item.title)}</h3><button class="model-preview" data-furniture="${esc(item.id)}" aria-label="Открыть ${esc(item.title)} в 3D"><img src="${esc(item.coverUrl)}" alt="${esc(item.title)}"><span>Открыть 3D-модель</span></button>${item.f3dUrl?`<a class="quiet" href="${esc(item.f3dUrl)}" download>Скачать исходник F3D</a>`:''}${item.assemblyUrl?`<a class="quiet" href="${esc(item.assemblyUrl)}" target="_blank" rel="noopener noreferrer">Открыть монтажку PDF</a>`:''}${item.dxfUrl?`<a class="quiet" href="${esc(item.dxfUrl)}" download>Скачать комплект DXF</a>`:''}${item.fabricationNote?`<p>${esc(item.fabricationNote)}</p>`:''}</article>`).join('')+'</div>';
 document.querySelectorAll('[data-furniture]').forEach(button=>button.onclick=()=>openModelViewer(projectModel(selected,button.dataset.furniture)));
 return;
}if(tab==='model'&&selected?.model){$('#pdf-area').innerHTML=`<button class="model-preview" aria-label="Открыть 3D-модель с инструментами"><img src="${esc(urls.get(selected.id)||selected.coverUrl||'./models/health-territory-v23.png')}" alt="Превью 3D-модели"><span>Открыть 3D-модель</span></button>`;$('.model-preview').onclick=()=>openModelViewer();return;}const attachment=tab==='files'?selected.attachments?.[Number($('#attachment-select')?.value||0)]:null;let blob=attachment?.blob||selected?.[tab];const fileUrl=attachment?.url||selected?.[tab+'Url'];if(fileUrl&&!blob){const response=await fetchAsset(fileUrl);if(!response.ok){$('#pdf-area').innerHTML='<div class="empty-file">Не удалось загрузить файл с сервера.</div>';return;}blob=await response.blob();if(version!==renderVersion)return;}if(attachment?.kind==='jpg'){downloadUrl=URL.createObjectURL(blob);$('#pdf-area').innerHTML=`<div class="pdf-toolbar"><span>${esc(attachment.name)}</span><a href="${downloadUrl}" download="${esc(attachment.name)}">Скачать JPG</a></div><div class="pdf-viewer"><img src="${downloadUrl}" alt="${esc(attachment.name)}" style="max-width:100%;height:auto;display:block"></div>`;return;}if(!blob){const label={expo:'Экспоплан',electrical:'Электросхема'}[tab]||'PDF';$('#pdf-area').innerHTML='<div class="empty-file">'+label+' пока не добавлен. Загрузите PDF в настройках проекта.</div>';return;}$('#pdf-area').innerHTML='<div class="empty-file">Открываем документ…</div>';try{
 const loaded=await openPdf(blob);
 if(version!==renderVersion){await loaded.destroy();return;}
 doc=loaded;
 page=1;
 downloadUrl=URL.createObjectURL(blob);
 const filename=attachment?.name||selected.title+' — '+({design:'дизайн-проект',assembly:'монтажная схема',expo:'экспоплан',electrical:'электросхема'}[tab]||'документ')+'.pdf';
 $('#pdf-area').innerHTML=`<div class="pdf-toolbar pdf-page-controls">
  <button id="prev-page" aria-label="Предыдущая страница">←</button>
  <span id="page-number" aria-live="polite"></span>
  <button id="next-page" aria-label="Следующая страница">→</button>
  <button id="pdf-fullscreen" aria-label="Открыть PDF на весь экран">⛶ На весь экран</button>
  <a href="${downloadUrl}" download="${esc(filename)}">Скачать PDF</a>
 </div><div class="pdf-viewer" id="canvas-host"></div>`;
 $('#prev-page').onclick=()=>turnPdfPage(-1);
 $('#next-page').onclick=()=>turnPdfPage(1);
 $('#pdf-fullscreen').onclick=openPdfViewer;
 bindPdfSwipe($('#canvas-host'));
 await drawPage();
}catch(e){
 if(version===renderVersion)$('#pdf-area').innerHTML='<div class="empty-file">Не удалось открыть PDF. Возможно, он повреждён или защищён паролем.</div>';
}}
function turnPdfPage(delta){
 if(!doc)return;
 const next=page+delta;
 if(next<1||next>doc.numPages)return;
 page=next;
 drawPage();
}
function bindPdfSwipe(host){
 let start=null;
 host.addEventListener('touchstart',event=>{
  const touch=event.touches[0];
  start=event.touches.length===1&&(window.visualViewport?.scale??1)<1.02
   ?{id:touch.identifier,x:touch.clientX,y:touch.clientY}:null;
 },{passive:true});
 host.addEventListener('touchend',event=>{
  if(!start)return;
  const origin=start;
  start=null;
  const touch=Array.from(event.changedTouches).find(point=>point.identifier===origin.id);
  if(!touch||event.touches.length)return;
  const dx=touch.clientX-origin.x,dy=touch.clientY-origin.y;
  if(Math.abs(dx)>=50&&Math.abs(dx)>Math.abs(dy)*1.5)turnPdfPage(dx<0?1:-1);
 },{passive:true});
 host.addEventListener('touchcancel',()=>{start=null;},{passive:true});
}
let pdfViewerDialog=null;
function closePdfViewer(){
 if(pdfViewerDialog?.open)pdfViewerDialog.close();
}
function openPdfViewer(){
 if(!doc||pdfViewerDialog)return;
 const area=$('#pdf-area');
 const fullscreenButton=$('#pdf-fullscreen');
 const modal=document.createElement('dialog');
 modal.className='pdf-fullscreen-dialog';
 modal.setAttribute('aria-label',`${selected.title} — полноэкранный просмотр PDF`);
 const close=document.createElement('button');
 close.className='pdf-fullscreen-close';
 close.textContent='×';
 close.title='Закрыть';
 close.setAttribute('aria-label','Закрыть полноэкранный PDF');
 close.onclick=()=>modal.close();
 area.querySelector('.pdf-page-controls').append(close);
 const content=document.createElement('div');
 content.className='pdf-fullscreen-content';
 content.append(...area.childNodes);
 modal.append(content);
 document.body.append(modal);
 fullscreenButton.hidden=true;
 pdfViewerDialog=modal;

 const root=document.documentElement;
 let fullscreenRequest=null;
 modal.addEventListener('close',()=>{
  if(fullscreenRequest)fullscreenRequest.then(()=>{
   if(document.fullscreenElement===root)return document.exitFullscreen();
  }).catch(()=>{});
  close.remove();
  area.append(...content.childNodes);
  fullscreenButton.hidden=false;
  modal.remove();
  pdfViewerDialog=null;
  if($('#drawer').open)fullscreenButton.focus();
 },{once:true});
 modal.showModal();
 if(!document.fullscreenElement&&root.requestFullscreen){
  fullscreenRequest=root.requestFullscreen();
  fullscreenRequest.catch(()=>{});
 }
}
async function drawPage(){
 const version=++drawVersion,current=doc;
 if(!current)return;
 const number=page;
 $('#page-number').textContent=`${number} / ${current.numPages}`;
 $('#prev-page').disabled=number===1;
 $('#next-page').disabled=number===current.numPages;
 try{
  const pdfPage=await current.getPage(number);
  if(version!==drawVersion)return;
  const viewport=pdfPage.getViewport({scale:1.8});
  const canvas=document.createElement('canvas');
  canvas.width=viewport.width;
  canvas.height=viewport.height;
  await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  if(version===drawVersion)$('#canvas-host')?.replaceChildren(canvas);
 }catch(error){
  if(version===drawVersion)console.error('Не удалось отрисовать страницу PDF',error);
 }
}
function putDrafts(updates){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('projects','readwrite'),store=tx.objectStore('projects');
  try{for(const project of updates)store.put({...project,localDraft:true});}
  catch(error){tx.abort();reject(error);return;}
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
function renderProjectSelection(){
 $('#selection-toolbar').hidden=!selectionMode;
 $('#select-projects').textContent=selectionMode?'Завершить выбор':'Выбрать проекты';
 $('#select-projects').setAttribute('aria-pressed',String(selectionMode));
 $('#selection-count').textContent='Выбрано: '+chosenProjects.size;
 $('#merge-projects').disabled=chosenProjects.size<2;
}
function setProjectSelection(enabled,initialId){
 if($('#drawer').open)$('#drawer').close();
 selectionMode=enabled;chosenProjects.clear();if(enabled&&initialId)chosenProjects.add(initialId);
 render();
}
function toggleProjectSelection(id){
 const checkbox=document.activeElement?.matches('[data-select-id]');
 if(chosenProjects.has(id))chosenProjects.delete(id);else chosenProjects.add(id);
 render();
 const control=[...document.querySelectorAll(checkbox?'[data-select-id]':'.card')].find(control=>(control.dataset.selectId||control.dataset.id)===id);
 control?.focus({preventScroll:true});
}
function openMergeProjects(){
 const groups=projectGroups(projects),items=[...chosenProjects].map(id=>groups.byId.get(id)).filter(Boolean);
 if(items.length<2)return;
 $('#merge-primary').innerHTML=items.map(project=>`<option value="${esc(project.id)}">${esc(project.title)}</option>`).join('');
 $('#merge-project-list').innerHTML=items.map(project=>`<li>${esc(project.title)}${groups.parts.has(project.id)?` · состав: ${groups.parts.get(project.id).length}`:''}</li>`).join('');
 $('#merge-error').textContent='';setSidebar(false);$('#merge-modal').showModal();
}
async function submitMergeProjects(event){
 event.preventDefault();const dialog=$('#merge-modal'),button=$('#merge-submit'),primaryId=$('#merge-primary').value;
 const closeButtons=[...dialog.querySelectorAll('.close')];
 dialog.dataset.busy='true';button.disabled=true;closeButtons.forEach(button=>button.disabled=true);button.textContent='Объединяем…';$('#merge-error').textContent='';
 try{
  const updates=mergeProjects(projects,chosenProjects,primaryId),main=projects.find(project=>project.id===primaryId);
  await putDrafts(updates);
  const category=projectCategory(main);
  collection={view:main.archived===true?'archive':category.category,furnitureType:main.archived===true?'':category.furnitureType};
  furnitureExpanded=collection.view==='furniture';selectionMode=false;chosenProjects.clear();
  $('#search').value='';['customer-filter','status-filter','year-filter'].forEach(id=>$('#'+id).value='');
  await refresh();dialog.close();await openProject(primaryId,'parts');
  toast('Проекты объединены. Черновик сохранён в этом браузере.');
 }catch(error){$('#merge-error').textContent=error.message||'Не удалось объединить проекты.';}
 finally{delete dialog.dataset.busy;button.disabled=false;closeButtons.forEach(button=>button.disabled=false);button.textContent='Объединить';}
}
function renderProjectParts(){
 const parts=projectGroups(projects).parts.get(selected.id)||[];
 $('#pdf-area').innerHTML=parts.length?'<div class="project-parts">'+parts.map(part=>{
  const preview=urls.get(part.id)||part.coverUrl;
  return `<article class="project-part" data-part-id="${esc(part.id)}">${preview?`<img class="project-part-cover" src="${esc(preview)}" alt="${esc(part.title)}" loading="lazy">`:'<div class="project-part-cover"></div>'}<div><h3>${esc(part.title)}</h3><p>${esc(part.customer||'Не указан')} · ${fmt(part.date)}</p><div class="project-part-actions"><button class="quiet" data-open-part="${esc(part.id)}">Открыть материалы</button>${part.model?`<a class="quiet" href="${esc(viewerLink(part))}">Открыть 3D</a>`:''}<button class="quiet" data-detach-part="${esc(part.id)}">Отделить</button></div></div></article>`;
 }).join('')+'</div>':'<div class="empty-file">В составе пока нет других проектов.</div>';
 document.querySelectorAll('[data-open-part]').forEach(button=>button.onclick=()=>openProject(button.dataset.openPart));
 document.querySelectorAll('[data-detach-part]').forEach(button=>button.onclick=()=>detachProject(button.dataset.detachPart));
}
async function detachProject(id){
 const groups=projectGroups(projects),project=groups.byId.get(id),rootId=groups.rootIds.get(id);
 if(!project||rootId===id)return;
 const openedId=selected?.id;
 try{
  await put(separateProject(project));await refresh();
  const parent=projectGroups(projects).parts.get(rootId);
  if(openedId===rootId)await openProject(rootId,parent?.length?'parts':undefined);
  else await openProject(id);
  toast('Часть отделена в самостоятельный проект. Черновик сохранён в этом браузере.');
 }catch(error){toast(error.message||'Не удалось отделить часть проекта.');}
}
$('#select-projects').onclick=()=>setProjectSelection(!selectionMode);
$('#cancel-selection').onclick=()=>setProjectSelection(false);
$('#merge-projects').onclick=openMergeProjects;
$('#merge-form').onsubmit=submitMergeProjects;
$('#merge-modal').addEventListener('cancel',event=>{if(event.currentTarget.dataset.busy)event.preventDefault();});

function openMoveProject(id){
 const project=projects.find(project=>project.id===id);if(!project)return;
 movingId=id;setSidebar(false);
 if($('#drawer').open)$('#drawer').close();
 const category=projectCategory(project),select=$('#move-form').elements.destination;
 select.innerHTML='<option value="stands">Стенды</option><optgroup label="Мебель"><option value="furniture">Мебель — без подраздела</option>'+furnitureTypes.map(type=>`<option value="furniture/${type.id}">${type.label}</option>`).join('')+'</optgroup><option value="archive">Архив</option>';
 select.value=project.archived===true?'archive':category.category+(category.furnitureType?'/'+category.furnitureType:'');
 $('#move-project-name').textContent=project.title;
 $('#move-group-note').hidden=projectGroups(projects).rootIds.get(id)===id;
 $('#move-error').textContent='';
 $('#move-modal').showModal();
}
$('#move-modal').addEventListener('close',()=>{movingId=null;});
$('#move-form').onsubmit=async event=>{
 event.preventDefault();const button=$('#move-submit');button.disabled=true;button.textContent='Перемещаем…';$('#move-error').textContent='';
 try{
  const original=projects.find(project=>project.id===movingId);
  if(!original)throw Error('Проект не найден. Обновите страницу.');
  let project=moveProject(original,event.currentTarget.elements.destination.value);
  if(projectGroups(projects).rootIds.get(original.id)!==original.id)project=separateProject(project);
  await put(project);
  collection={view:project.archived?'archive':project.category,furnitureType:project.archived?'':project.furnitureType};
  furnitureExpanded=collection.view==='furniture';
  $('#search').value='';['customer-filter','status-filter','year-filter'].forEach(id=>$('#'+id).value='');
  await refresh();$('#move-modal').close();
  const card=[...document.querySelectorAll('.card')].find(card=>card.dataset.id===project.id);
  card?.focus({preventScroll:true});card?.scrollIntoView({block:'nearest'});
  toast('Перемещено: '+collectionTitle(collection)+'. Черновик сохранён в этом браузере.');
 }catch(error){$('#move-error').textContent=error.name==='QuotaExceededError'?'Недостаточно места в браузере.':error.message||'Не удалось переместить проект.';}
 finally{button.disabled=false;button.textContent='Переместить';}
};

function openEditor(id){
 editing=id?projects.find(p=>p.id===id):null;
 const form=$('#project-form');form.reset();fillManagers();
 $('#form-error').textContent='';
 $('#editor-title').textContent=editing?'Редактирование проекта':'Новый проект';
 const now=new Date();
 form.elements.date.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 if(editing)for(const key of ['title','customer','event','manager','date','status','source'])form.elements[key].value=editing[key]??'';
 const category=editing?projectCategory(editing):{category:collection.view==='furniture'?'furniture':'stands',furnitureType:collection.furnitureType};
 form.elements.category.value=category.category;
 form.elements.furnitureType.value=category.furnitureType||'';
 form.elements.archived.checked=editing?.archived===true;
 updateCategoryField();
 $('#editor').showModal();
}
function updateCategoryField(){
 const form=$('#project-form'),furniture=form.elements.category.value==='furniture';
 $('#furniture-type-field').hidden=!furniture;
 form.elements.furnitureType.disabled=!furniture;
}
$('#project-form').elements.category.onchange=updateCategoryField;

$('#project-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=$('#save-btn');button.disabled=true;button.textContent='Сохраняем…';$('#form-error').textContent='';try{const data=new FormData(form),p={...(editing||{id:crypto.randomUUID(),demo:false})};for(const k of ['title','customer','event','manager','date','status','source'])p[k]=String(data.get(k)).trim();p.category=form.elements.category.value;p.furnitureType=p.category==='furniture'?form.elements.furnitureType.value:'';p.archived=form.elements.archived.checked;if(!p.title||!p.customer)throw Error('Укажите название проекта и заказчика.');if(p.source){const u=new URL(p.source);if(u.protocol!=='https:'||!['disk.yandex.ru','disk.yandex.com','yadi.sk'].includes(u.hostname))throw Error('Укажите HTTPS-ссылку на Яндекс Диск.');}for(const kind of ['design','assembly','expo','electrical']){const f=data.get(kind);if(f?.size){if(f.size>50*1024*1024)throw Error('PDF должен быть не больше 50 МБ.');if(await f.slice(0,5).text()!=='%PDF-')throw Error('Выберите корректный файл PDF.');const cover=await coverFor(f);p[kind]=f;if(kind==='design')p.cover=cover;}}await put(p);if(!matchesCollection(p,collection)){collection={view:p.archived?'archive':p.category,furnitureType:p.archived?'':p.furnitureType};furnitureExpanded=collection.view==='furniture';}await refresh();$('#editor').close();toast('Черновик сохранён в этом браузере. Для общего доступа скачайте изменения для публикации.');}catch(e){$('#form-error').textContent=e.name==='QuotaExceededError'?'Недостаточно места в браузере для сохранения файлов.':e.message||'Не удалось сохранить проект.';}finally{button.disabled=false;button.textContent='Сохранить проект'}};
document.querySelectorAll('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d&&!d.dataset.busy){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));$('#drawer').addEventListener('close',()=>{closePdfViewer();++renderVersion;++drawVersion;if(doc){doc.destroy();doc=null;}if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;}});$('#add-btn').onclick=()=>openEditor();$('#invite-btn').onclick=()=>$('#invite-modal').showModal();['search','customer-filter','status-filter','year-filter'].forEach(id=>$('#'+id).addEventListener(id==='search'?'input':'change',render));document.querySelectorAll('[data-collection]').forEach(button=>button.onclick=()=>{
 if(button.dataset.collection==='all'){$('#search').value='';['customer-filter','status-filter','year-filter'].forEach(id=>$('#'+id).value='');}
 selectCollection(button.dataset.collection,button.dataset.furnitureType||'');
});
$('#clients-nav').onclick=()=>{setSidebar(false);$('#customer-filter').scrollIntoView({block:'center'});$('#customer-filter').focus();$('#customer-filter').showPicker?.()};
try{db=await openDB();await loadPublished();}catch(e){$('#grid').innerHTML='<div class="empty"><h2>Не удалось открыть локальную библиотеку</h2><p>Разрешите хранение данных в браузере и обновите страницу.</p></div>';console.error(e)}

function renderSidebar(){
 const counts=navigationCounts(projects);
 document.querySelectorAll('[data-count]').forEach(badge=>badge.textContent=counts[badge.dataset.count]);
 document.querySelectorAll('[data-collection]').forEach(button=>{
  const active=button.dataset.collection===collection.view&&(button.dataset.furnitureType||'')===collection.furnitureType;
  button.classList.toggle('active',active||(button.id==='furniture-nav'&&collection.view==='furniture'));
  if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 });
 $('#furniture-nav').setAttribute('aria-expanded',String(furnitureExpanded));
 $('#furniture-subnav').hidden=!furnitureExpanded;
 $('#catalog-section').textContent=collectionTitle(collection);
}
function selectCollection(view,furnitureType=''){
 furnitureExpanded=view==='furniture'&&(furnitureType||collection.view!=='furniture'||collection.furnitureType?true:!furnitureExpanded);
 collection={view,furnitureType:view==='furniture'?furnitureType:''};
 render();
 if((view!=='furniture'||furnitureType)&&window.matchMedia('(max-width:700px), (pointer:coarse) and (max-width:1024px)').matches)setSidebar(false);
}

$('#batch-btn').onclick=()=>{$('#batch-target').innerHTML='<option value="new">Создать один новый проект</option>'+projects.map(p=>`<option value="${esc(p.id)}">В проект: ${esc(p.title)}</option>`).join('');$('#batch-progress').textContent='';$('#batch-errors').replaceChildren();$('#batch-files').value='';$('#batch-name').value='';$('#batch-name-label').hidden=false;$('#batch-name').required=true;$('#batch-modal').showModal();};
async function prepareImport(file){
 if(file.size>50*1024*1024)throw Error('Размер больше 50 МБ');
 const bytes=new Uint8Array(await file.slice(0,5).arrayBuffer());let kind,cover;
 if(bytes.length>=5&&String.fromCharCode(...bytes)==='%PDF-'){kind='pdf';cover=await coverFor(file);}
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){kind='jpg';const bitmap=await createImageBitmap(file);try{const k=Math.min(1,900/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*k));canvas.height=Math.max(1,Math.round(bitmap.height*k));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);cover=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.85));}finally{bitmap.close();}}
 else throw Error('Поддерживаются только PDF и JPG');
 return {kind,cover,blob:file,name:file.name,id:crypto.randomUUID()};
}
$('#batch-form').onsubmit=async e=>{e.preventDefault();const files=[...$('#batch-files').files];if(!files.length)return;const target=$('#batch-target').value;const dialog=$('#batch-modal');dialog.dataset.busy='true';const failures=[];let busy=true;const cancel=e=>{if(busy)e.preventDefault();};dialog.addEventListener('cancel',cancel);const buttons=[...dialog.querySelectorAll('button,input,select')];buttons.forEach(b=>b.disabled=true);$('#batch-errors').replaceChildren();let count=0;let project=target==='new'?{id:crypto.randomUUID(),title:$('#batch-name').value.trim(),customer:'Не указан',event:'',manager:'',date:'',status:'Не указан',source:'',attachments:[],demo:false}:{...projects.find(p=>p.id===target)};
 try{for(let i=0;i<files.length;i++){const file=files[i];$('#batch-progress').textContent=`Обработка ${i+1} из ${files.length}: ${file.name}`;try{const attachment=await prepareImport(file);const next={...project,attachments:[...(project.attachments||[]),attachment],cover:project.cover||attachment.cover};await put(next);project=next;count++;}catch(error){failures.push(file);const li=document.createElement('li');li.textContent=file.name+': '+(error.name==='QuotaExceededError'?'Недостаточно места в браузере':error.message);$('#batch-errors').append(li);}}
 await refresh();if(count&&target==='new'){$('#batch-target').add(new Option('В проект: '+project.title,project.id));$('#batch-target').value=project.id;$('#batch-name-label').hidden=true;$('#batch-name').required=false;}$('#batch-progress').textContent=`Загружено ${count} из ${files.length}.`;
 // Keep only failed files for retry, avoiding duplicate successful imports.
 const transfer=new DataTransfer();failures.forEach(f=>transfer.items.add(f));$('#batch-files').files=transfer.files;
 }finally{delete dialog.dataset.busy;busy=false;dialog.removeEventListener('cancel',cancel);buttons.forEach(b=>b.disabled=false);}
};

function openModelViewer(project=selected,view=null){
 const url=new URL(viewerLink(project));
 if(view)url.searchParams.set('view',view);
 url.searchParams.set('v','direct-view-1');
 window.location.assign(url.href);
}

$('#batch-target').onchange=()=>{const isNew=$('#batch-target').value==='new';$('#batch-name-label').hidden=!isNew;$('#batch-name').required=isNew;};

function managerNames(){
 const saved=JSON.parse(localStorage.getItem('forma-managers')||'[]');
 return [...new Set([...saved,...projects.map(p=>p.manager)].filter(n=>typeof n==='string'&&n.trim()))].sort((a,b)=>a.localeCompare(b,'ru'));
}
function fillManagers(){const select=$('#project-form').elements.manager;const value=select.value;select.innerHTML='<option value="">Не указан</option>'+managerNames().map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');select.value=value;}
function showManagers(){const names=managerNames();$('#manager-list').innerHTML=names.length?names.map(name=>`<li>${esc(name)}</li>`).join(''):'<li>Менеджеров пока нет.</li>';}
$('#service-settings-btn').onclick=()=>{$('#manager-message').textContent='';$('#manager-form').reset();try{showManagers();}catch{$('#manager-message').textContent='Не удалось прочитать сохранённый список менеджеров.';}$('#settings-modal').showModal();};
$('#manager-form').onsubmit=async e=>{e.preventDefault();const name=$('#manager-name').value.trim().replace(/\s+/g,' ');if(!name){$('#manager-message').textContent='Введите имя менеджера.';return;}try{const names=managerNames();if(names.some(n=>n.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru'))){$('#manager-message').textContent='Такой менеджер уже есть в списке.';return;}localStorage.setItem('forma-managers',JSON.stringify([...names,name]));showManagers();fillManagers();$('#manager-form').reset();$('#manager-message').textContent='Менеджер добавлен.';}catch{$('#manager-message').textContent='Не удалось сохранить менеджера. Проверьте доступ к хранилищу браузера.';}};

async function put(project){return putLocal({...project,localDraft:true});}
async function loadPublished(){
 const data=await loadCatalogue();
 const publishedIds=new Set(data.projects.map(project=>project.id));
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('projects','readwrite');
  const store=tx.objectStore('projects');
  const request=store.getAll();
  request.onsuccess=()=>{
   const drafts=new Map(request.result.filter(project=>project.localDraft).map(project=>[project.id,project]));
   for(const project of request.result){
    if(project.published&&!project.localDraft&&!publishedIds.has(project.id))store.delete(project.id);
   }
   for(const project of data.projects){
    const draft=drafts.get(project.id);
    if(!draft)store.put({...project,published:true});
    else if(!draft.cover&&!draft.design&&project.coverUrl&&draft.modelUrl===project.modelUrl&&draft.coverUrl!==project.coverUrl){
     // A metadata draft keeps its edits while receiving a corrected source preview.
     store.put({...draft,coverUrl:project.coverUrl});
    }
   }
  };
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
 // Public covers are normal lazy images, not serial downloads copied into IndexedDB.
 // Local drafts retain their own uploaded cover blobs through the guard above.
 await refresh();
}
$('#invite-btn').hidden=true;
$('#settings-modal > p').textContent='Список менеджеров хранится в этом браузере.';
const notice=document.createElement('p');notice.className='github-notice';
notice.textContent='Каталог открыт для всех. Правки хранятся в этом браузере до публикации.';
$('main .intro').after(notice);
const backupSection=document.createElement('section');backupSection.className='publish-settings';
backupSection.innerHTML='<h3>Публикация изменений</h3><p>Скачайте черновики с файлами и передайте владельцу каталога для публикации. До публикации они видны только на этом устройстве.</p><button id="export-drafts" class="quiet">Скачать изменения для публикации</button><p id="backup-message" role="status"></p>';
$('#settings-modal').append(backupSection);
async function portable(value){
 if(value instanceof Blob){const bytes=new Uint8Array(await value.arrayBuffer());let encoded='';for(let i=0;i<bytes.length;i+=32768)encoded+=String.fromCharCode(...bytes.subarray(i,i+32768));return {$file:true,type:value.type,name:value.name||'',data:btoa(encoded)};}
 if(Array.isArray(value))return Promise.all(value.map(portable));
 if(value&&typeof value==='object'){const out={};for(const [k,v] of Object.entries(value))out[k]=await portable(v);return out;}return value;
}
$('#export-drafts').onclick=async()=>{
 const button=$('#export-drafts');button.disabled=true;
 try{const drafts=(await records()).filter(p=>p.localDraft);if(!drafts.length){$('#backup-message').textContent='Нет новых черновиков для публикации.';return;}
 const data=await portable({format:'forma-catalog-drafts-v1',projects:drafts,managers:managerNames()});
 const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='forma-izmeneniya-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 $('#backup-message').textContent='Файл подготовлен. Он включает новые PDF/JPG и изменения проектов.';
 }catch(e){$('#backup-message').textContent='Не удалось подготовить файл: '+e.message;}finally{button.disabled=false;}
};
const nativeOpen=openProject;
openProject=async function(id,preferredTab){
 await nativeOpen(id,preferredTab);
 if(selected.localDraft||(projectGroups(projects).parts.get(selected.id)||[]).some(part=>part.localDraft)){const hint=document.createElement('p');hint.className='draft-hint';hint.textContent='Локальный черновик. Изменения ещё не опубликованы.';$('#drawer-content').prepend(hint);}
 const source=selected.sourceFileUrl||selected.f3dUrl;
 if(source){const a=document.createElement('a');a.className='source-link';a.href=source;a.textContent=selected.sourceFileUrl?'Скачать исходник 3ds Max (.max)':'Скачать исходник Fusion (.f3d)';a.setAttribute('download','');$('#drawer-content').append(a);}
};
const requestedProject=decodeURIComponent(location.hash.slice(1));if(projects.some(p=>p.id===requestedProject))await openProject(requestedProject);
