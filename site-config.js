// Resolve everything under the project Pages subdirectory, never at github.io root.
export const SITE_ROOT=new URL('./',import.meta.url);
export const CATALOG_URL=new URL('data/catalog.json',SITE_ROOT);
export function assetUrl(path){
 if(!path)return '';
 const url=new URL(path,SITE_ROOT);
 if(url.origin!==SITE_ROOT.origin || !url.pathname.startsWith(SITE_ROOT.pathname+'assets/'))throw Error('Недопустимый адрес файла проекта');
 return url.href;
}
export function normalizeProject(project){
 const p={...project};
 for(const key of ['modelUrl','coverUrl','designUrl','assemblyUrl','autoAssemblyUrl','f3dUrl','sourceFileUrl'])p[key]=assetUrl(p[key]);
 p.attachments=(p.attachments||[]).map(a=>({...a,url:assetUrl(a.url)}));
 return p;
}
export async function loadCatalogue(){
 const r=await fetch(CATALOG_URL,{cache:'no-store'});if(!r.ok)throw Error('Не удалось загрузить каталог GitHub');
 const data=await r.json();return {...data,projects:data.projects.map(normalizeProject)};
}
export function permittedModel(path){try{return !!path && assetUrl(path).endsWith('.glb');}catch{return false;}}
