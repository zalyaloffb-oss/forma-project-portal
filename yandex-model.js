// Experimental, token-free loading of a publicly shared, self-contained GLB.
// A failed cloud request never falls back to the catalogue's local model.
const API='https://cloud-api.yandex.net/v1/disk/public/resources';
const MAX_BYTES=200*1024*1024;

export function yandexPublicLink(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port||
    !['disk.yandex.ru','disk.yandex.com','disk.360.yandex.ru','yadi.sk'].includes(url.hostname)||
    !/^\/[di]\/[\w-]+\/?$/.test(url.pathname))throw Error('Нужна публичная HTTPS-ссылка на файл Яндекс Диска.');
 url.search='';url.hash='';return url.href;
}

export function validateYandexGLB(bytes){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<20)throw Error('Яндекс Диск вернул не GLB-файл.');
 const view=new DataView(bytes);
 if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength||
    view.getUint32(16,true)!==0x4e4f534a||view.getUint32(12,true)>bytes.byteLength-20)throw Error('Файл GLB повреждён или загружен не полностью.');
 const json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,view.getUint32(12,true))));
 for(const item of [...(json.buffers||[]),...(json.images||[])]){
  if(item.uri&&!item.uri.startsWith('data:'))throw Error('Для теста нужен GLB со встроенными текстурами и геометрией.');
 }
 return bytes;
}

export async function loadYandexModel(link,{fetcher=fetch,onStage=()=>{},signal=AbortSignal.timeout(120000)}={}){
 const publicLink=yandexPublicLink(link);
 const query=new URLSearchParams({public_key:publicLink});
 // Disk's downloader rejects third-party Referer headers with HTTP 403.
 const options={credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal};
 onStage('Получаем сведения о модели с Яндекс Диска…');
 const infoResponse=await fetcher(API+'?'+query,options);
 if(!infoResponse.ok)throw Error('Не удалось прочитать публичный файл Яндекс Диска (HTTP '+infoResponse.status+').');
 const info=await infoResponse.json();
 if(info.type!=='file'||!info.name?.toLowerCase().endsWith('.glb'))throw Error('По ссылке должен находиться файл GLB, а не папка.');
 if(!Number.isSafeInteger(info.size)||info.size<=0||info.size>MAX_BYTES)throw Error('Для теста нужен GLB размером до 200 МБ.');
 const linkResponse=await fetcher(API+'/download?'+query,options);
 if(!linkResponse.ok)throw Error('Яндекс Диск не выдал ссылку на скачивание (HTTP '+linkResponse.status+').');
 const download=new URL((await linkResponse.json()).href);
 if(download.protocol!=='https:'||download.username||download.password||download.port||
    !['yandex.ru','yandex.net'].some(host=>download.hostname.endsWith('.'+host)))throw Error('Недопустимый адрес скачивания Яндекс Диска.');
 onStage('Загружаем 3D-модель с Яндекс Диска…');
 const response=await fetcher(download.href,options);
 if(!response.ok)throw Error('Не удалось скачать модель с Яндекс Диска (HTTP '+response.status+').');
 if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('Модель превышает 200 МБ.');
 const reader=response.body.getReader();const chunks=[];let size=0;
 try{
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>info.size||size>MAX_BYTES){await reader.cancel();throw Error('Размер скачиваемого файла отличается от размера на Диске.');}
   chunks.push(value);onStage('Яндекс Диск: '+Math.round(size/info.size*100)+'%');
  }
 }finally{reader.releaseLock();}
 if(size!==info.size)throw Error('Модель с Яндекс Диска загружена не полностью.');
 const buffer=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
 const bytes=validateYandexGLB(buffer.buffer);
 const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(info.sha256&&info.sha256.toLowerCase()!==sha256)throw Error('Контрольная сумма модели не совпадает с файлом на Диске.');
 return {bytes,name:info.name,size,sha256,host:download.hostname,publicLink};
}
