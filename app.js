import {loadCatalogue,projectModel} from './site-config.js?v=banner-preview-1';
import {openPdf} from './pdf-engine.js?v=lazy-pdf-1';
import {viewerLink} from './viewer-share.js?v=performance-1';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db, projects=[], selected=null, editing=null, doc=null, page=1, renderVersion=0, drawVersion=0, tab='design', downloadUrl=null;
const urls=new Map(), statuses=['Реализовано','На стадии проекта','Не согласовано'];
const fmt=date=>!date?'Не указана':new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(date+'T12:00:00'));
const badge=s=>`<span class="badge ${s===statuses[1]?'progress':s===statuses[2]?'rejected':''}">${esc(s)}</span>`;
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),3500)}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('forma-project-library-github-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function records(){return new Promise((resolve,reject)=>{const tx=db.transaction('projects'),r=tx.objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function putLocal(p){return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(p);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
async function coverFor(blob){const pdf=await openPdf(blob);try{const p=await pdf.getPage(1),v=p.getViewport({scale:1.1}),c=document.createElement('canvas');c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return await new Promise(r=>c.toBlob(r,'image/png'));}finally{await pdf.destroy()}}
async function refresh(){projects=(await records()).filter(p=>!p.browserOriginalId).sort((a,b)=>Number(!!b.model)-Number(!!a.model)||b.date.localeCompare(a.date));for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();projects.forEach(p=>{if(p.cover)urls.set(p.id,URL.createObjectURL(p.cover))});const customer=$('#customer-filter').value,year=$('#year-filter').value;const customers=[...new Set(projects.map(p=>p.customer))].sort((a,b)=>a.localeCompare(b,'ru'));$('#customer-filter').innerHTML='<option value="">Все заказчики</option>'+customers.map(c=>`<option>${esc(c)}</option>`).join('');$('#customer-filter').value=customers.includes(customer)?customer:'';$('#customer-list').innerHTML=customers.map(c=>`<option value="${esc(c)}"></option>`).join('');const years=[...new Set(projects.map(p=>p.date.slice(0,4)).filter(Boolean))].sort().reverse();$('#year-filter').innerHTML='<option value="">Все годы</option>'+years.map(y=>`<option>${y}</option>`).join('');$('#year-filter').value=years.includes(year)?year:'';$('#total').textContent=String(projects.length).padStart(2,'0');$('#nav-count').textContent=projects.length;$('#done-count').textContent=String(projects.filter(p=>p.status===statuses[0]).length).padStart(2,'0');$('#progress-count').textContent=String(projects.filter(p=>p.status===statuses[1]).length).padStart(2,'0');$('#clients-count').textContent=String(customers.filter(c=>c!=='Не указан').length).padStart(2,'0');render()}
function render(){renderSidebar();const q=$('#search').value.trim().toLocaleLowerCase('ru');const filtered=projects.filter(p=>(!q||[p.title,p.customer,p.event,p.manager].some(v=>v.toLocaleLowerCase('ru').includes(q)))&&(!$('#customer-filter').value||p.customer===$('#customer-filter').value)&&(!$('#status-filter').value||p.status===$('#status-filter').value)&&(!$('#year-filter').value||p.date.startsWith($('#year-filter').value)));$('#result-count').textContent=`Показано ${filtered.length} из ${projects.length}`;$('#grid').innerHTML=filtered.length?filtered.map(p=>`<button class="card" data-id="${p.id}" aria-label="Открыть проект ${esc(p.title)}"><div class="cover">${(urls.get(p.id)||p.coverUrl)?`<img src="${esc(urls.get(p.id)||p.coverUrl)}" alt="${p.model&&!p.design?'Превью модели Fusion':'Первая страница дизайн-проекта'}" loading="lazy" decoding="async">`:'<span class="no-cover">Добавьте дизайн-проект</span>'}<span class="cover-count">${p.model?'3D · ':''}${['design','assembly','expo','electrical'].filter(key=>p[key]||p[key+'Url']).length} PDF${p.attachments?.length?` · ${p.attachments.length} файлов`:""}</span></div><div class="card-content"><div class="card-kicker"><span class="customer">${esc(p.customer)}</span>${badge(p.status)}</div><h2>${esc(p.title)}</h2><p>${esc(p.event)||'Мероприятие не указано'}</p><div class="card-bottom"><span>${esc(p.manager)||'Менеджер не указан'}</span><span>${fmt(p.date)}</span></div></div></button>`).join(''):'<div class="empty"><h2>Проекты не найдены</h2><p>Измените фильтры или добавьте новый проект.</p></div>';document.querySelectorAll('.card').forEach(c=>c.onclick=()=>openProject(c.dataset.id))}
async function openProject(id){selected=projects.find(p=>p.id===id);tab=selected.model?'model':(selected.design||selected.designUrl)?'design':selected.attachments?.length?'files':'design';const p=selected;$('#drawer-content').innerHTML=`<h2>${esc(p.title)}</h2>${badge(p.status)}<dl class="details"><div><dt>Заказчик</dt><dd>${esc(p.customer)}</dd></div><div><dt>Дата создания</dt><dd>${fmt(p.date)}</dd></div><div><dt>Мероприятие</dt><dd>${esc(p.event)||'—'}</dd></div><div><dt>Менеджер компании</dt><dd>${esc(p.manager)||'—'}</dd></div></dl><div class="tabs"><button class="tab ${tab==='design'?'selected':''}" data-tab="design">Дизайн-проект</button><button class="tab" data-tab="assembly">Монтажная схема</button><button class="tab" data-tab="expo">Экспоплан</button><button class="tab" data-tab="electrical">Электросхема</button><button class="tab" data-tab="banners">Баннеры 3D</button>${p.model?'<button class="tab selected" data-tab="model">3D-модель</button>':''}${p.furniture?.length?'<button class="tab" data-tab="furniture">Мебель</button>':''}</div><div id="tab-loading" class="tab-loading" role="status" hidden><span class="tab-loading-track" aria-hidden="true"><i></i></span><span>Загрузка…</span></div>${p.attachments?.length?`<div class="attachments"><label>Материалы проекта (${p.attachments.length})<select id="attachment-select">${p.attachments.map((f,i)=>`<option value="${i}">${esc(f.name)}</option>`).join('')}</select></label><button id="open-attachment" class="quiet">Открыть файл</button></div>`:''}<div id="pdf-area"></div>${p.source?`<a class="source-link" href="${esc(p.source)}" target="_blank" rel="noopener noreferrer"><span><strong>Исходники проекта</strong><small>Открыть на Яндекс Диске</small></span><span>↗</span></a>`:'<div class="source-link"><span><strong>Исходники проекта</strong><small>Ссылка на Яндекс Диск пока не добавлена</small></span></div>'}<div class="drawer-actions"><button class="quiet" id="edit-btn">Редактировать проект</button></div>`;if(!$('#drawer').open)$('#drawer').showModal();document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{tab=t.dataset.tab;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('selected',x===t));loadPDF()});if(p.attachments?.length){$('#open-attachment').onclick=()=>{tab='files';document.querySelectorAll('.tab').forEach(x=>x.classList.remove('selected'));loadPDF();};$('#attachment-select').onchange=()=>$('#open-attachment').click();}$('#edit-btn').onclick=()=>{$('#drawer').close();openEditor(p.id)};await loadPDF()}
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
async function loadTabContent(version){const old=doc;doc=null;if(old)await old.destroy();if(version!==renderVersion)return;if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null;if(tab==='banners'){
 $('#pdf-area').innerHTML=selected.model?`<p class="model-note">Текущая модель стенда: выберите поверхности баннеров, соберите болванку и нанесите текстуры JPG / PNG.</p><button class="model-preview banner-preview" id="open-banners" aria-label="Открыть Баннеры 3D"><img src="${esc(selected.bannerCoverUrl||urls.get(selected.id)||selected.coverUrl||'')}" alt="Превью схемы размещения баннеров"><span><b>⛶</b>Открыть Баннеры 3D</span></button>`:'<div class="empty-file">Сначала добавьте 3D-модель проекта.</div>';
 if($('#open-banners'))$('#open-banners').onclick=()=>openModelViewer(selected,'banners');return;
}if(tab==='furniture'){
 const items=selected.furniture||[];
 $('#pdf-area').innerHTML='<div class="furniture-list">'+items.map(item=>`<article class="furniture-card"><h3>${esc(item.title)}</h3><button class="model-preview" data-furniture="${esc(item.id)}" aria-label="Открыть ${esc(item.title)} в 3D"><img src="${esc(item.coverUrl)}" alt="${esc(item.title)}"><span><b>⛶</b>Открыть 3D-модель</span></button>${item.f3dUrl?`<a class="quiet" href="${esc(item.f3dUrl)}" download>Скачать исходник F3D ↓</a>`:''}${item.assemblyUrl?`<a class="quiet" href="${esc(item.assemblyUrl)}" target="_blank" rel="noopener noreferrer">Открыть монтажку PDF ↗</a>`:''}${item.dxfUrl?`<a class="quiet" href="${esc(item.dxfUrl)}" download>Скачать комплект DXF ↓</a>`:''}${item.fabricationNote?`<p>${esc(item.fabricationNote)}</p>`:''}</article>`).join('')+'</div>';
 document.querySelectorAll('[data-furniture]').forEach(button=>button.onclick=()=>openModelViewer(projectModel(selected,button.dataset.furniture)));
 return;
}if(tab==='model'&&selected?.model){$('#pdf-area').innerHTML=`<button class="model-preview" aria-label="Открыть 3D-модель с инструментами"><img src="${esc(urls.get(selected.id)||selected.coverUrl||'./models/health-territory-v23.png')}" alt="Превью 3D-модели"><span><b>⛶</b>Открыть 3D-модель</span></button>`;$('.model-preview').onclick=()=>openModelViewer();return;}const attachment=tab==='files'?selected.attachments?.[Number($('#attachment-select')?.value||0)]:null;let blob=attachment?.blob||selected?.[tab];const fileUrl=attachment?.url||selected?.[tab+'Url'];if(fileUrl&&!blob){const response=await fetch(fileUrl);if(!response.ok){$('#pdf-area').innerHTML='<div class="empty-file">Не удалось загрузить файл с сервера.</div>';return;}blob=await response.blob();if(version!==renderVersion)return;}if(attachment?.kind==='jpg'){downloadUrl=URL.createObjectURL(blob);$('#pdf-area').innerHTML=`<div class="pdf-toolbar"><span>${esc(attachment.name)}</span><a href="${downloadUrl}" download="${esc(attachment.name)}">Скачать JPG ↓</a></div><div class="pdf-viewer"><img src="${downloadUrl}" alt="${esc(attachment.name)}" style="max-width:100%;height:auto;display:block"></div>`;return;}if(!blob){const label={expo:'Экспоплан',electrical:'Электросхема'}[tab]||'PDF';$('#pdf-area').innerHTML='<div class="empty-file">'+label+' пока не добавлен. Загрузите PDF в настройках проекта.</div>';return;}$('#pdf-area').innerHTML='<div class="empty-file">Открываем документ…</div>';try{const loaded=await openPdf(blob);if(version!==renderVersion){await loaded.destroy();return;}doc=loaded;page=1;downloadUrl=URL.createObjectURL(blob);$('#pdf-area').innerHTML=`<div class="pdf-toolbar"><button id="prev-page" aria-label="Предыдущая страница">←</button><span id="page-number"></span><button id="next-page" aria-label="Следующая страница">→</button><button id="pdf-fullscreen" aria-label="Открыть PDF на весь экран">⛶ На весь экран</button><a href="${downloadUrl}" download="${esc(attachment?.name||selected.title+' — '+({design:'дизайн-проект',assembly:'монтажная схема',expo:'экспоплан',electrical:'электросхема'}[tab]||'документ')+'.pdf')}">Скачать PDF ↓</a></div><div class="pdf-viewer" id="canvas-host"></div>`;$('#prev-page').onclick=()=>{if(page>1){page--;drawPage()}};$('#next-page').onclick=()=>{if(page<doc.numPages){page++;drawPage()}};$('#pdf-fullscreen').onclick=openPdfViewer;await drawPage();}catch(e){if(version===renderVersion)$('#pdf-area').innerHTML='<div class="empty-file">Не удалось открыть PDF. Возможно, он повреждён или защищён паролем.</div>';}}
let pdfViewerDialog=null;
function closePdfViewer(){
 if(pdfViewerDialog?.open)pdfViewerDialog.close();
}
function openPdfViewer(){
 if(!doc||pdfViewerDialog)return;
 const area=$('#pdf-area');
 const modal=document.createElement('dialog');
 modal.className='pdf-fullscreen-dialog';
 modal.setAttribute('aria-label','Полноэкранный просмотр PDF');
 const header=document.createElement('div');
 header.className='pdf-fullscreen-header';
 const title=document.createElement('span');
 title.textContent=selected.title;
 const close=document.createElement('button');
 close.className='quiet';
 close.textContent='× Закрыть';
 close.setAttribute('aria-label','Закрыть полноэкранный PDF');
 close.onclick=()=>modal.close();
 header.append(title,close);
 const content=document.createElement('div');
 content.className='pdf-fullscreen-content';
 content.append(...area.childNodes);
 modal.append(header,content);
 document.body.append(modal);
 const fullscreenButton=$('#pdf-fullscreen');
 fullscreenButton.hidden=true;
 pdfViewerDialog=modal;
 modal.addEventListener('close',()=>{
  if(document.fullscreenElement===modal)document.exitFullscreen().catch(()=>{});
  area.append(...content.childNodes);
  fullscreenButton.hidden=false;
  modal.remove();
  pdfViewerDialog=null;
  fullscreenButton.focus();
 },{once:true});
 modal.showModal();
 if(modal.requestFullscreen)modal.requestFullscreen().catch(()=>{});
}
async function drawPage(){const version=++drawVersion,current=doc;if(!current)return;const n=page;$('#page-number').textContent=`${n} / ${current.numPages}`;$('#prev-page').disabled=n===1;$('#next-page').disabled=n===current.numPages;const p=await current.getPage(n);if(version!==drawVersion)return;const v=p.getViewport({scale:1.8}),canvas=document.createElement('canvas');canvas.width=v.width;canvas.height=v.height;try{await p.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;if(version===drawVersion)$('#canvas-host')?.replaceChildren(canvas);}catch{}}
function openEditor(id){editing=id?projects.find(p=>p.id===id):null;const form=$('#project-form');form.reset();fillManagers();$('#form-error').textContent='';$('#editor-title').textContent=editing?'Редактирование проекта':'Новый проект';const now=new Date();form.elements.date.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;if(editing)for(const key of ['title','customer','event','manager','date','status','source'])form.elements[key].value=editing[key];$('#editor').showModal()}
$('#project-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=$('#save-btn');button.disabled=true;button.textContent='Сохраняем…';$('#form-error').textContent='';try{const data=new FormData(form),p={...(editing||{id:crypto.randomUUID(),demo:false})};for(const k of ['title','customer','event','manager','date','status','source'])p[k]=String(data.get(k)).trim();if(!p.title||!p.customer)throw Error('Укажите название проекта и заказчика.');if(p.source){const u=new URL(p.source);if(u.protocol!=='https:'||!['disk.yandex.ru','disk.yandex.com','yadi.sk'].includes(u.hostname))throw Error('Укажите HTTPS-ссылку на Яндекс Диск.');}for(const kind of ['design','assembly','expo','electrical']){const f=data.get(kind);if(f?.size){if(f.size>50*1024*1024)throw Error('PDF должен быть не больше 50 МБ.');if(await f.slice(0,5).text()!=='%PDF-')throw Error('Выберите корректный файл PDF.');const cover=await coverFor(f);p[kind]=f;if(kind==='design')p.cover=cover;}}await put(p);await refresh();$('#editor').close();toast('Черновик сохранён в этом браузере. Для общего доступа скачайте изменения для публикации.');}catch(e){$('#form-error').textContent=e.name==='QuotaExceededError'?'Недостаточно места в браузере для сохранения файлов.':e.message||'Не удалось сохранить проект.';}finally{button.disabled=false;button.textContent='Сохранить проект'}};
document.querySelectorAll('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d&&!d.dataset.busy){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));$('#drawer').addEventListener('close',()=>{closePdfViewer();++renderVersion;++drawVersion;if(doc){doc.destroy();doc=null;}if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;}});$('#add-btn').onclick=()=>openEditor();$('#invite-btn').onclick=()=>$('#invite-modal').showModal();['search','customer-filter','status-filter','year-filter'].forEach(id=>$('#'+id).addEventListener(id==='search'?'input':'change',render));$('#all-nav').onclick=()=>{$('#search').value='';['customer-filter','status-filter','year-filter'].forEach(id=>$('#'+id).value='');render()};$('#clients-nav').onclick=()=>{$('#customer-filter').focus();$('#customer-filter').showPicker?.()};
try{db=await openDB();await loadPublished();}catch(e){$('#grid').innerHTML='<div class="empty"><h2>Не удалось открыть локальную библиотеку</h2><p>Разрешите хранение данных в браузере и обновите страницу.</p></div>';console.error(e)}

function renderSidebar(){
 const total=projects.length,done=projects.filter(p=>p.status===statuses[0]).length;
 const percent=total?Math.round(done/total*100):0;
 $('#side-total').textContent=String(total).padStart(2,'0');
 $('#side-customers').textContent=new Set(projects.map(p=>p.customer).filter(c=>c!=='Не указан')).size;
 $('#side-percent').textContent=percent+'%';
 $('#side-progress').style.width=percent+'%';
 $('#side-statuses').innerHTML=[...statuses,...(projects.some(p=>p.status==='Не указан')?['Не указан']:[])].map((status,i)=>`<button class="side-status" data-summary-status="${esc(status)}" aria-pressed="${$('#status-filter').value===status}"><i class="dot ${['green','amber','rose','neutral'][i]}"></i><span>${esc(status)}</span><strong>${projects.filter(p=>p.status===status).length}</strong></button>`).join('');
 document.querySelectorAll('[data-summary-status]').forEach(button=>button.onclick=()=>{
   $('#search').value='';$('#customer-filter').value='';$('#year-filter').value='';
   $('#status-filter').value=button.dataset.summaryStatus;render();
 });
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
$('#settings-btn').onclick=()=>{$('#manager-message').textContent='';$('#manager-form').reset();try{showManagers();}catch{$('#manager-message').textContent='Не удалось прочитать сохранённый список менеджеров.';}$('#settings-modal').showModal();};
$('#manager-form').onsubmit=async e=>{e.preventDefault();const name=$('#manager-name').value.trim().replace(/\s+/g,' ');if(!name){$('#manager-message').textContent='Введите имя менеджера.';return;}try{const names=managerNames();if(names.some(n=>n.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru'))){$('#manager-message').textContent='Такой менеджер уже есть в списке.';return;}localStorage.setItem('forma-managers',JSON.stringify([...names,name]));showManagers();fillManagers();$('#manager-form').reset();$('#manager-message').textContent='Менеджер добавлен.';}catch{$('#manager-message').textContent='Не удалось сохранить менеджера. Проверьте доступ к хранилищу браузера.';}};

async function put(project){return putLocal({...project,localDraft:true});}
async function loadPublished(){
 const data=await loadCatalogue(),current=await records();
 const drafts=new Set(current.filter(p=>p.localDraft).map(p=>p.id));
 const published=data.projects.filter(item=>!drafts.has(item.id));
 if(published.length)await new Promise((resolve,reject)=>{
  const tx=db.transaction('projects','readwrite');
  for(const item of published)tx.objectStore('projects').put({...item,published:true});
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
 // Public covers are normal lazy images, not serial downloads copied into IndexedDB.
 // Local drafts retain their own uploaded cover blobs through the guard above.
 await refresh();
}
$('.private-mark').textContent='◈ Открытый каталог';
$('.sidebar-bottom > p').textContent='Проекты — на GitHub. Новые файлы и изменения сохраняются сначала в этом браузере.';
$('footer span:last-child').textContent='GitHub · Общий каталог и локальные черновики';
$('#invite-btn').hidden=true;
$('#settings-modal > p').textContent='Менеджеры и черновики сохраняются в этом браузере. Общий каталог обновляется публикацией в GitHub.';
const notice=document.createElement('p');notice.className='github-notice';
notice.textContent='Опубликованные проекты доступны всем. Добавленные здесь файлы и правки — локальные черновики до публикации.';
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
openProject=async function(id){
 await nativeOpen(id);
 if(selected.localDraft){const hint=document.createElement('p');hint.className='draft-hint';hint.textContent='Черновик на этом устройстве. Другие посетители увидят изменения после публикации.';$('#drawer-content').prepend(hint);}
 const source=selected.sourceFileUrl||selected.f3dUrl;
 if(source){const a=document.createElement('a');a.className='source-link';a.href=source;a.textContent=selected.sourceFileUrl?'Скачать исходник 3ds Max (.max)':'Скачать исходник Fusion (.f3d)';a.setAttribute('download','');$('#drawer-content').append(a);}
};
const requestedProject=decodeURIComponent(location.hash.slice(1));if(projects.some(p=>p.id===requestedProject))await openProject(requestedProject);
