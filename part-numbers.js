import * as THREE from 'three';

// A projected texture in the body's own coordinates: follows isolation, sectioning,
// movement and explosion without adding geometry or changing CAD materials.
export function labelProjection(geometry,worldQuaternion,worldScale,mmPerUnit){
 const pos=geometry.attributes.position,index=geometry.index;
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3(),buckets=new Map();
 for(let i=0;i<(index?.count??pos.count);i+=3){
  a.fromBufferAttribute(pos,index?index.getX(i):i);b.fromBufferAttribute(pos,index?index.getX(i+1):i+1);c.fromBufferAttribute(pos,index?index.getX(i+2):i+2);
  normal.crossVectors(b.sub(a),c.sub(a));const area=normal.length();if(area<1e-12)continue;normal.divideScalar(area);
  // Treat opposite faces as the same direction, but retain the broadest face.
  const axis=[Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)].indexOf(Math.max(Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)));
  if(normal.getComponent(axis)<0)normal.negate();
  const key=normal.toArray().map(v=>Math.round(v*8)).join(',');
  const bucket=buckets.get(key)||{area:0,normal:new THREE.Vector3()};bucket.area+=area;bucket.normal.addScaledVector(normal,area);buckets.set(key,bucket);
 }
 if(!buckets.size)return null;
 const n=[...buckets.values()].sort((a,b)=>b.area-a.area)[0].normal.normalize();
 const inverse=worldQuaternion.clone().invert();let up=new THREE.Vector3(0,1,0).applyQuaternion(inverse);
 if(Math.abs(up.dot(n))>.9)up=new THREE.Vector3(0,0,-1).applyQuaternion(inverse);
 const v=up.addScaledVector(n,-up.dot(n)).normalize(),u=new THREE.Vector3().crossVectors(v,n).normalize();
 let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
 for(let i=0;i<pos.count;i++){a.fromBufferAttribute(pos,i);const x=a.dot(u),y=a.dot(v);minU=Math.min(minU,x);maxU=Math.max(maxU,x);minV=Math.min(minV,y);maxV=Math.max(maxV,y);}
 const localMm=mmPerUnit*Math.abs(worldScale.x);
 let height=Math.min(70/localMm,(maxV-minV)*.42,(maxU-minU)*.21),width=height*2;
 if(!(height>0))return null;
 // The bounding-box centre of an arc or ring is often a hole. Place ink on
 // actual triangles and ensure the whole label rectangle lies on the part.
 const triangles=[];
 for(let i=0;i<(index?.count??pos.count);i+=3){
  a.fromBufferAttribute(pos,index?index.getX(i):i);b.fromBufferAttribute(pos,index?index.getX(i+1):i+1);c.fromBufferAttribute(pos,index?index.getX(i+2):i+2);
  normal.crossVectors(b.clone().sub(a),c.clone().sub(a));const area=normal.length();
  if(!area||Math.abs(normal.dot(n)/area)<.65)continue;
  triangles.push({points:[a,b,c].map(p=>[p.dot(u),p.dot(v)]),area});
 }
 function covered(x,y){return triangles.some(({points:[a,b,c]})=>{
  const cross=(p,q)=>(q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0]);
  const d=[cross(a,b),cross(b,c),cross(c,a)],epsilon=1e-7;
  return d.every(v=>v>=-epsilon)||d.every(v=>v<=epsilon);
 });}
 const candidates=[[(minU+maxU)/2,(minV+maxV)/2],...triangles.sort((a,b)=>b.area-a.area).slice(0,24).map(t=>[0,1].map(k=>t.points.reduce((s,p)=>s+p[k],0)/3))];
 let anchor=null;
 for(const factor of [1,.7,.5,.35,.2,.1]){
  const h=height*factor,w=width*factor;
  anchor=candidates.find(([x,y])=>[-.48,0,.48].every(dx=>[-.48,0,.48].every(dy=>covered(x+dx*w,y+dy*h))));
  if(anchor){height=h;width=w;break;}
 }
 anchor=anchor||candidates.find(([x,y])=>covered(x,y));if(!anchor)return null;
 return {u,v,n,centerU:anchor[0],centerV:anchor[1],width,height};
}

function numberTexture(number){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#fffce8';ctx.strokeStyle='#161a16';ctx.lineWidth=8;
 ctx.beginPath();ctx.roundRect(12,12,488,232,30);ctx.fill();ctx.stroke();
 ctx.fillStyle='#111611';ctx.font='bold 192px Arial, sans-serif';
 const font=Math.min(192,192*440/Math.max(1,ctx.measureText(String(number)).width));ctx.font=`bold ${font}px Arial, sans-serif`;
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(number),256,140);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

export async function addPartNumbers({items,projectId,mmPerUnit,materials,textures,toolbar,invalidate,stage}){
 const knownProject='fusion-e803b1fe3ca3173cff2efdb19a0e8413ecfbd5cb2b1d47e7bd79fccf9b84987b';
 const engelsProject='max-f57ca5ffdbf719fc37fb7510db76a51ac165e5e3b638b9eb7ad467e92c449e86';
 const scopes=projectId===knownProject?['reception','wall','support','ring']:projectId===engelsProject?['engels']:projectId==='fusion-33a9c8dba62e3ca65ecc75221596d8db8c99fb2f54aa3f1ea461dbb80483f617'?['trest']:null;
 if(!scopes)return;
 const configs=await Promise.all(scopes.map(async scope=>{
  const response=await fetch(`./${scope}-part-numbers.json?v=github-20261104`);
  if(!response.ok)throw new Error('Не удалось загрузить номера деталей');
  const config=await response.json();if(config.projectId!==projectId)throw new Error('Номера относятся к другому проекту');
  return config.entries.map(entry=>({...entry,scope}));
 }));
 const entries=configs.flat(),mapping=new Map(entries.map(e=>[e.path+'\n'+e.body,e])),aliases=new Map(),maps=new Map(),enabled={value:1};let count=0;
 // Rounding the displayed dimensions in Fusion must not erase otherwise exact
 // semantic matches. Ambiguous aliases never select a drawing position.
 const canonical=path=>path.replace(/ — габ\. [^+]+?(?=:\d+(?:\+|$))/g,'');
 for(const entry of entries){const key=canonical(entry.path)+'\n'+entry.body,old=aliases.get(key);aliases.set(key,old===null||old&&old.number!==entry.number?null:entry);}
 const match=item=>mapping.get(item.path+'\n'+item.name)||aliases.get(canonical(item.path)+'\n'+item.name);
 // Position 19 denotes the complete logo kit. One texture on the biggest element
 // identifies the kit; every element retains the same part number in the tree.
 const logos=items.filter(i=>match(i)?.number===19);
 const logo=logos.sort((a,b)=>b.box.getSize(new THREE.Vector3()).lengthSq()-a.box.getSize(new THREE.Vector3()).lengthSq())[0];
 for(const item of items){
  const entry=match(item);if(!entry)continue;const number=entry.number;
  item.partNumber=number;item.name=(entry.display||(typeof number==='number'?'№'+number:number))+' · '+item.name;item.mesh.userData.partNumber=number;item.partScope=entry.scope;count++;
  if(number===19&&item!==logo)continue;
  const projection=labelProjection(item.mesh.geometry,item.mesh.quaternion,item.mesh.scale,mmPerUnit);if(!projection)continue;
  if(!maps.has(number)){const texture=numberTexture(number);maps.set(number,texture);textures.add(texture);}
  for(const material of item.materials){
   const previous=material.onBeforeCompile;
   material.onBeforeCompile=function(shader,renderer){
    previous.call(this,shader,renderer);
    Object.assign(shader.uniforms,{formaNumberMap:{value:maps.get(number)},formaNumbersOn:enabled,formaLabelU:{value:projection.u},formaLabelV:{value:projection.v},formaLabelN:{value:projection.n},formaLabelOrigin:{value:new THREE.Vector2(projection.centerU,projection.centerV)},formaLabelSize:{value:new THREE.Vector2(projection.width,projection.height)}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform vec3 formaLabelU,formaLabelV,formaLabelN; uniform vec2 formaLabelOrigin,formaLabelSize; varying vec2 formaNumberUv; varying float formaNumberFace;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat formaSide=dot(normal,formaLabelN); formaNumberFace=abs(formaSide); formaNumberUv=(vec2(dot(position,formaLabelU),dot(position,formaLabelV))-formaLabelOrigin)/formaLabelSize; formaNumberUv.x*=formaSide<0.0?-1.0:1.0; formaNumberUv+=0.5;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D formaNumberMap; uniform float formaNumbersOn; varying vec2 formaNumberUv; varying float formaNumberFace;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nif(formaNumbersOn>0.5 && formaNumberFace>0.65 && all(greaterThanEqual(formaNumberUv,vec2(0.0))) && all(lessThanEqual(formaNumberUv,vec2(1.0)))){vec4 formaInk=texture2D(formaNumberMap,formaNumberUv); diffuseColor.rgb=mix(diffuseColor.rgb,formaInk.rgb,formaInk.a);}');
   };
   material.customProgramCacheKey=()=> 'forma-surface-number-v1';material.needsUpdate=true;
  }
 }
 if(!count)return;
 stage.dataset.numberedBodies=String(count);stage.dataset.partNumbers='on';
 stage.dataset.numberedReception=String(items.filter(i=>i.partScope==='reception').length);stage.dataset.numberedWalls=String(items.filter(i=>i.partScope==='wall').length);
 stage.dataset.numberedSupports=String(items.filter(i=>i.partScope==='support').length);stage.dataset.numberedRing=String(items.filter(i=>i.partScope==='ring').length);
 stage.dataset.numberedEngels=String(items.filter(i=>i.partScope==='engels').length);
 const button=document.createElement('button');button.id='part-numbers';button.textContent='Номера деталей';button.title='Маркировка ресепшена, стен, кольца и обшивки опор. К3/1 — короб №3, деталь №1; Н01/1 — нижний сектор кольца 01, деталь 1. Металлокаркас без маркировки.';button.setAttribute('aria-pressed','true');toolbar.prepend(button);
 if(scopes.includes('trest'))button.title='Номера деталей «Первого треста»: подтверждённые позиции коробов и мебели, идентификаторы остальных деталей.';
 if(projectId===engelsProject)button.title='Маркировка ЭНГЕЛЬС: ДК — короб/позиция; РС — ресепшен; Т1/Т2 — тумбы; С-01 — стеллаж. СТ — детали стандартных коробов; ЗБ — закладные; СВ — профили.';
 button.onclick=()=>{enabled.value=enabled.value?0:1;button.setAttribute('aria-pressed',String(!!enabled.value));stage.dataset.partNumbers=enabled.value?'on':'off';invalidate();};
}
