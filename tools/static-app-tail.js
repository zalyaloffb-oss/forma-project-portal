
async function put(project){return putLocal({...project,localDraft:true});}
async function loadPublished(){
 const data=await loadCatalogue(),current=await records();
 for(const item of data.projects){
  const old=current.find(p=>p.id===item.id);if(old?.localDraft)continue;
  let cover=old?.cover;
  if(item.coverUrl&&(!cover||old?.coverUrl!==item.coverUrl)){
   try{const r=await fetch(item.coverUrl);if(r.ok)cover=await r.blob();}catch{}
  }
  await putLocal({...item,cover,published:true});
 }
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
