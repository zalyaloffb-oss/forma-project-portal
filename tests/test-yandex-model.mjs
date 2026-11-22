import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadYandexModel,yandexPublicLink,validateYandexGLB} from '../yandex-model.js';

const data=fs.readFileSync(new URL('../assets/tachpanel/model-c7616d17ffca.glb',import.meta.url));
const buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
const publicLink='https://disk.yandex.ru/d/testModel';
const href='https://downloader.disk.yandex.ru/disk/test-file';
const info={name:'test.glb',type:'file',size:data.length};
function mock({metadata=info,download=href,bytes=data,infoStatus=200,downloadStatus=200}={}){
 const calls=[];
 return {calls,fetcher:async(url,options)=>{
  calls.push({url,options});
  if(url.startsWith('https://cloud-api.yandex.net/v1/disk/public/resources?'))return Response.json(metadata,{status:infoStatus});
  if(url.startsWith('https://cloud-api.yandex.net/v1/disk/public/resources/download?'))return Response.json({href:download});
  assert.equal(url,download);
  return new Response(bytes,{status:downloadStatus});
 }};
}

const happy=mock(),stages=[];
const result=await loadYandexModel(publicLink,{fetcher:happy.fetcher,onStage:text=>stages.push(text)});
assert.deepEqual(Buffer.from(result.bytes),data);
assert.equal(result.sha256,createHash('sha256').update(data).digest('hex'));
assert.equal(result.host,'downloader.disk.yandex.ru');
assert.equal(happy.calls.length,3);
assert.ok(happy.calls.every(c=>c.options.credentials==='omit'&&!c.options.headers));
assert.ok(happy.calls.every(c=>c.options.referrerPolicy==='no-referrer'));
assert.ok(stages.includes('Яндекс Диск: 100%'));
assert.equal(yandexPublicLink(publicLink+'?tracking=1#test'),publicLink);
assert.equal(validateYandexGLB(buffer),buffer);
for(const invalid of ['http://disk.yandex.ru/d/test','https://example.com/d/test',
 'https://disk.yandex.ru.evil.example/d/test','https://user:password@disk.yandex.ru/d/test',
 'https://disk.yandex.ru:444/d/test','https://disk.yandex.ru/client/disk'])assert.throws(()=>yandexPublicLink(invalid));

for(const options of [
 {infoStatus:404},{metadata:{...info,type:'dir'}},{metadata:{...info,name:'test.f3d'}},
 {metadata:{...info,size:201*1024*1024}},{metadata:{...info,sha256:'0'.repeat(64)}},{download:'https://example.com/test.glb'},
 {download:'http://downloader.disk.yandex.ru/test.glb'},{downloadStatus:403},
 {bytes:data.subarray(0,100)},{bytes:Buffer.concat([data,Buffer.from('extra')])},
 {bytes:Buffer.alloc(data.length)}
])await assert.rejects(()=>loadYandexModel(publicLink,{fetcher:mock(options).fetcher}));

await assert.rejects(()=>loadYandexModel(publicLink,{fetcher:async()=>{throw TypeError('CORS blocked');}}));
const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},buffers:[{uri:'https://example.com/external.bin'}]}));
const padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
const external=Buffer.alloc(20+padded.length);external.writeUInt32LE(0x46546c67,0);external.writeUInt32LE(2,4);
external.writeUInt32LE(external.length,8);external.writeUInt32LE(padded.length,12);external.writeUInt32LE(0x4e4f534a,16);padded.copy(external,20);
assert.throws(()=>validateYandexGLB(external.buffer.slice(external.byteOffset,external.byteOffset+external.byteLength)),/встроенными/);
console.log('PASS: Yandex public GLB, exact bytes/SHA-256, no credentials, URL/size/format guards, failures and no fallback.');
