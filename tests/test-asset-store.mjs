import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAssetStore,logicalAssetPath} from '../asset-store.js';
const baseURL=new URL('https://example.github.io/portal/');
const bytes=new TextEncoder().encode('exact public asset bytes');
const sha256=createHash('sha256').update(bytes).digest('hex');
const config={version:1,enabled:true,provider:'yandex-disk',publicKey:'https://disk.yandex.ru/d/publicFolder',files:{'assets/test.pdf':{bytes:bytes.length,sha256,mime:'application/pdf'}}};
function setup({cfg=config,payload=bytes,href='https://downloader.disk.yandex.ru:443/file',status=200}={}){
 const calls=[],loaded=[];
 const fetcher=async(url,options)=>{calls.push({url:String(url),options});if(String(url).startsWith('https://cloud-api.yandex.net/'))return Response.json({href},{status});return new Response(payload);};
 return {calls,loaded,store:createAssetStore({baseURL,configLoader:async()=>cfg,fetcher,onLoaded:info=>loaded.push(info)})};
}
assert.equal(logicalAssetPath('https://example.github.io/portal/assets/test.pdf',baseURL),'assets/test.pdf');
assert.equal(logicalAssetPath('https://evil.example/portal/assets/test.pdf',baseURL),null);
assert.equal(logicalAssetPath('https://example.github.io/another/assets/test.pdf',baseURL),null);
const happy=setup(),result=await happy.store.fetch(new URL('assets/test.pdf',baseURL).href);
assert.deepEqual(new Uint8Array(await result.arrayBuffer()),bytes);
assert.equal(result.headers.get('X-EES-Storage'),'yandex-disk');
assert.equal(happy.loaded[0].sha256,sha256);
assert.ok(happy.calls.every(c=>c.options.credentials==='omit'&&c.options.referrerPolicy==='no-referrer'));
assert.ok(happy.calls[0].url.includes('path=%2Fassets%2Ftest.pdf'));
for(const options of [{payload:new Uint8Array(bytes.length)},{payload:bytes.subarray(0,5)},{payload:new Uint8Array(bytes.length+1)},{href:'https://evil.example/file'},{href:'http://downloader.disk.yandex.ru/file'},{href:'https://downloader.disk.yandex.ru:444/file'},{status:403}]){
 const bad=setup(options);await assert.rejects(()=>bad.store.fetch(new URL('assets/test.pdf',baseURL).href));
 assert.ok(bad.calls.every(c=>!c.url.startsWith(baseURL.href)),'cloud errors must not silently use the GitHub copy');
}
const plain=setup({cfg:null});await plain.store.fetch(new URL('assets/test.pdf',baseURL).href);assert.equal(plain.calls.length,1);assert.ok(plain.calls[0].url.startsWith(baseURL.href));
const unmapped=setup();await unmapped.store.fetch(new URL('data/catalog.json',baseURL).href);assert.equal(unmapped.calls.length,1);
const decodedConfig={...config,files:{'assets/test.pdf':{bytes:5,sha256:'0'.repeat(64),decodedBytes:bytes.length,decodedSHA256:sha256}}};
const decoded=setup({cfg:decodedConfig});assert.deepEqual(new Uint8Array(await(await decoded.store.fetch(new URL('assets/test.pdf',baseURL).href)).arrayBuffer()),bytes);
const largeConfig={...config,files:{'assets/archive.f3d':{bytes:403*1024*1024,sha256,downloadOnly:true}}};
const large=setup({cfg:largeConfig}),largeUrl=new URL('assets/archive.f3d',baseURL).href;
assert.equal(new URL(await large.store.downloadURL(largeUrl)).hostname,'downloader.disk.yandex.ru');
await assert.rejects(()=>large.store.fetch(largeUrl),/Крупный исходник/);
assert.ok(large.calls.every(c=>c.url.startsWith('https://cloud-api.yandex.net/')),'large CAD archives must not be fetched into browser memory');
console.log('PASS: public-folder assets, exact bytes/SHA-256, no credentials/referrer, path/origin guards, failures and no GitHub fallback.');
