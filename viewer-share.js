import {SITE_ROOT} from './site-config.js?v=furniture-2';
export function viewerLink(project) {
 if(typeof project?.viewerPath==='string'&&/^\/[a-z0-9][a-z0-9-]{0,79}$/.test(project.viewerPath)){
  const item=project.itemId;
  if(item&&!/^[a-z0-9][a-z0-9-]{0,79}$/.test(item))throw Error('Недопустимый предмет мебели');
  const url=new URL(project.viewerPath.slice(1)+'/'+(item?item+'/':''),SITE_ROOT);
  return url.href;
 }
 const url=new URL('viewer.html',SITE_ROOT);
 url.search='';url.hash='';
 if(project?.id)url.searchParams.set('project',project.id);
 else if(project?.modelUrl)url.searchParams.set('model',project.modelUrl);
 if(project?.itemId)url.searchParams.set('item',project.itemId);
 return url.href;
}

export async function copyViewerLink(url) {
 try {
  if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(url);return true;}
 }catch{}
 // Technical hosting uses HTTP, where the modern clipboard API is unavailable.
 const input=document.createElement('textarea');input.value=url;
 input.setAttribute('aria-label','Ссылка на 3D-просмотрщик');
 input.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
 const host=document.querySelector('dialog[open]')||document.body;
 const focused=document.activeElement;host.append(input);input.focus();input.select();
 let copied=false;try{copied=document.execCommand('copy');}catch{}
 input.remove();focused?.focus();
 if(copied)return true;
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Ссылка на 3D-просмотрщик');
 dialog.style.cssText='max-width:560px;width:85%;padding:24px;border:1px solid #dce2d5;border-radius:10px';
 const title=document.createElement('p');title.textContent='Скопируйте ссылку на 3D-просмотрщик:';
 const field=document.createElement('input');field.value=url;field.readOnly=true;field.setAttribute('aria-label','Ссылка на 3D-просмотрщик');field.style.cssText='width:100%;box-sizing:border-box;padding:12px';
 const close=document.createElement('button');close.textContent='Закрыть';close.style.marginTop='16px';close.onclick=()=>dialog.close();
 dialog.append(title,field,close);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();field.focus();field.select();
 return false;
}
