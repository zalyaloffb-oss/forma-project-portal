// Stable catalogue paths, public Disk storage, and integrity-checked browser reads.
const SITE_ROOT=new URL('./',import.meta.url),API='https://cloud-api.yandex.net/v1/disk/public/resources/download';
const LIMIT=200*1024*1024,DOWNLOAD_LIMIT=50*1024**3;
function publicKey(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!['disk.yandex.ru','disk.yandex.com','disk.360.yandex.ru','yadi.sk'].includes(u.hostname)||!/^\/d\/[\w-]+\/?$/.test(u.pathname))throw Error('Некорректная папка хранилища.');return u.href;}
function transferURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!['','443'].includes(u.port)||!['yandex.ru','yandex.net'].some(h=>u.hostname.endsWith('.'+h)))throw Error('Некорректный адрес скачивания.');return u.href;}
export function logicalAssetPath(value,base=SITE_ROOT){const u=new URL(typeof value==='string'||value instanceof URL?value:value.url,base),root=new URL(base);return u.origin===root.origin&&u.pathname.startsWith(root.pathname)?decodeURIComponent(u.pathname.slice(root.pathname.length)):null;}

export function createAssetStore({baseURL=SITE_ROOT,fetcher=fetch,configLoader,onLoaded=()=>{}}={}){
 let configPromise;
 const config=()=>configPromise||=(async()=>{
  const value=configLoader?await configLoader():await(async()=>{const r=await fetcher(new URL('data/asset-storage.json',baseURL),{cache:'no-store'});if(r.status===404)return null;if(!r.ok)throw Error('Не удалось прочитать настройки хранилища.');return r.json();})();
  if(!value?.enabled)return null;
  if(value.version!==1||value.provider!=='yandex-disk'||!value.files||typeof value.files!=='object')throw Error('Некорректные настройки хранилища.');
  return {...value,publicKey:publicKey(value.publicKey)};
 })();
 async function locate(value,options={}){
  const path=logicalAssetPath(value,baseURL);
  if(!path||!path.startsWith('assets/'))return null;
  const storage=await config(),row=storage?.files[path];if(!row)return null;
  if(!Number.isSafeInteger(row.bytes)||row.bytes<0||row.bytes>(row.downloadOnly===true?DOWNLOAD_LIMIT:LIMIT)||!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Некорректная запись файла в хранилище.');
  const query=new URLSearchParams({public_key:storage.publicKey,path:'/'+path});
  const r=await fetcher(API+'?'+query,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:options.signal||AbortSignal.timeout(120000)});
  if(!r.ok)throw Error('Яндекс Диск не выдал файл (HTTP '+r.status+').');
  const href=transferURL((await r.json()).href);return {href,row,path};
 }
 async function read(value,options={}){
  const file=await locate(value,options);if(!file)return fetcher(value,options);
  if(file.row.downloadOnly===true)throw Error('Крупный исходник доступен по ссылке для скачивания.');
  const r=await fetcher(file.href,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:options.signal||AbortSignal.timeout(180000)});
  if(!r.ok)throw Error('Не удалось скачать файл с Диска (HTTP '+r.status+').');
  const decoded=file.row.decodedBytes&&/^[a-f0-9]{64}$/.test(file.row.decodedSHA256||'');
  const maxSize=Math.max(file.row.bytes,decoded?file.row.decodedBytes:0);if(maxSize>LIMIT)throw Error('Файл превышает допустимый размер.');
  if(Number(r.headers.get('content-length'))>maxSize)throw Error('Размер файла на Диске изменился.');
  const reader=r.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxSize){await reader.cancel();throw Error('Размер файла на Диске изменился.');}chunks.push(value);}}finally{reader.releaseLock();}
  if(size!==file.row.bytes&&(!decoded||size!==file.row.decodedBytes))throw Error('Файл загружен не полностью.');
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(sha256!==file.row.sha256&&(!decoded||sha256!==file.row.decodedSHA256))throw Error('Контрольная сумма файла на Диске изменилась.');
  onLoaded({path:file.path,bytes:size,sha256});
  return new Response(bytes,{headers:{'Content-Type':file.row.mime||'application/octet-stream','Content-Length':String(size),'X-EES-Storage':'yandex-disk'}});
 }
 return {fetch:read,async downloadURL(value){return (await locate(value))?.href||new URL(value,baseURL).href;}};
}

const store=createAssetStore({onLoaded:info=>{if(typeof document!=='undefined'){const d=document.documentElement.dataset;d.assetStorage='yandex-disk';d.cloudAssetCount=String(Number(d.cloudAssetCount||0)+1);d.lastCloudAsset=info.path;d.lastCloudBytes=String(info.bytes);d.lastCloudSHA256=info.sha256;}}});
export const fetchAsset=(value,options)=>store.fetch(value,options);
export async function readAssetBytes(value){const r=await fetchAsset(value);if(!r.ok)throw Error('Не удалось открыть файл (HTTP '+r.status+').');return r.arrayBuffer();}
export function installAssetLinks(onError=message=>alert(message)){
 const bypass=new WeakSet();
 document.addEventListener('click',async event=>{
  const a=event.target.closest('a[href]');if(!a||bypass.has(a)||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const path=logicalAssetPath(a.href);if(!path?.startsWith('assets/'))return;
  event.preventDefault();const popup=a.target==='_blank'&&!a.hasAttribute('download')?window.open('about:blank','_blank'):null;
  try{const href=await store.downloadURL(a.href);if(popup){popup.opener=null;popup.location.replace(href);}else{const link=document.createElement('a');link.href=href;link.referrerPolicy='no-referrer';link.rel='noopener noreferrer';if(a.hasAttribute('download'))link.download=a.download;bypass.add(link);document.body.append(link);link.click();link.remove();}}
  catch(error){popup?.close();onError(error.message);}
 });
}
