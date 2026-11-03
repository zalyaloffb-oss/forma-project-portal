import * as THREE from 'three';

const fail=message=>{throw new Error(message);};
const number=n=>{if(!Number.isFinite(n))fail('Некорректные координаты детали.');return String(Number(n.toFixed(5)));};
export function dxfFilename(name){return (String(name||'Деталь').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,140)||'Деталь')+'.dxf';}
function coordinates(mesh,mmPerUnit){
 if(!Number.isFinite(mmPerUnit)||mmPerUnit<=0)fail('Неизвестен масштаб модели.');
 mesh.updateWorldMatrix(true,false);const g=mesh.geometry,p=g?.attributes.position,idx=g?.index;
 if(!p)fail('У детали нет геометрии.');
 const result=[];for(let i=0;i<(idx?idx.count:p.count);i+=3){
  const t=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld).multiplyScalar(mmPerUnit));
  if(t.some(v=>!v.toArray().every(Number.isFinite)))fail('Некорректные координаты детали.');
  if(new THREE.Triangle(...t).getArea()>1e-8)result.push(t);
 }
 if(!result.length)fail('У детали нет поверхности.');return result;
}
function document(entities){
 return ['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','9','$MEASUREMENT','70','1','0','ENDSEC',
  '0','SECTION','2','TABLES','0','TABLE','2','LAYER','5','2','330','0','100','AcDbSymbolTable','70','1','0','LAYER','5','3','330','2','100','AcDbSymbolTableRecord','100','AcDbLayerTableRecord','2','PART','70','0','62','7','6','CONTINUOUS','0','ENDTAB','0','ENDSEC',
  '0','SECTION','2','ENTITIES',...entities,'0','ENDSEC','0','EOF',''].join('\r\n');
}
// Choose the largest coplanar surface, rather than an arbitrary large triangle.
export function flatContours(mesh,mmPerUnit,faceVertices=null){
 let ts=coordinates(mesh,mmPerUnit),normal,origin;
 if(faceVertices){
  if(faceVertices.length<9 || faceVertices.length%9)fail('Сначала выберите плоскую грань.');
  ts=[];for(let i=0;i<faceVertices.length;i+=9)ts.push([0,3,6].map(k=>new THREE.Vector3(...faceVertices.slice(i+k,i+k+3)).multiplyScalar(mmPerUnit)));
  normal=new THREE.Triangle(...ts[0]).getNormal(new THREE.Vector3());origin=ts[0][0];
 }else{
  const groups=new Map(),reference=new THREE.Box3().setFromPoints(ts.flat()).getCenter(new THREE.Vector3());
  for(const t of ts){
   const n=new THREE.Triangle(...t).getNormal(new THREE.Vector3());const dominant=n.toArray().reduce((a,v,i,arr)=>Math.abs(v)>Math.abs(arr[a])?i:a,0);if(n.getComponent(dominant)<0)n.negate();
   const distance=t[0].clone().sub(reference).dot(n),key=n.toArray().map(x=>Math.round(x*10000)).join(',')+':'+Math.round(distance/.01);
   if(!groups.has(key))groups.set(key,{normal:n,origin:t[0],ts:[],area:0});const group=groups.get(key);group.ts.push(t);group.area+=new THREE.Triangle(...t).getArea();
  }
  const best=[...groups.values()].sort((a,b)=>b.area-a.area)[0];({normal,origin,ts}=best);
 }
 // Weld only within 0.01mm. Internal tessellation edges cancel in pairs.
 const vertices=new Map(),edges=new Map();
 const key=p=>p.clone().sub(origin).toArray().map(x=>Math.round(x/.01)).join(',');
 for(const t of ts)for(let j=0;j<3;j++){
  const a=t[j],b=t[(j+1)%3],ka=key(a),kb=key(b);if(ka===kb)continue;
  vertices.set(ka,a);vertices.set(kb,b);const ek=[ka,kb].sort().join('|');if(!edges.has(ek))edges.set(ek,{a:ka,b:kb,count:0});edges.get(ek).count++;
 }
 if([...edges.values()].some(e=>e.count>2))fail('Поверхность содержит наложенные полигоны. Выберите другую грань или экспорт рёбер 3D.');
 const boundary=[...edges.values()].filter(e=>e.count===1),adj=new Map();
 for(const e of boundary)for(const [a,b] of [[e.a,e.b],[e.b,e.a]]){if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b);}
 if(!boundary.length || [...adj.values()].some(ns=>ns.length!==2))fail('Контур не замкнут. Выберите другую плоскую грань или экспорт рёбер 3D.');
 const longest=boundary.reduce((a,b)=>vertices.get(a.a).distanceToSquared(vertices.get(a.b))>=vertices.get(b.a).distanceToSquared(vertices.get(b.b))?a:b);
 const u=vertices.get(longest.b).clone().sub(vertices.get(longest.a)).normalize(),v=new THREE.Vector3().crossVectors(normal,u).normalize();
 const used=new Set(),loops=[];
 for(const start of adj.keys()){
  if(used.has(start))continue;const loop=[];let current=start,previous=null;
  do{
   if(used.has(current))fail('Неоднозначный контур поверхности.');used.add(current);
   const p=vertices.get(current).clone().sub(origin);loop.push([p.dot(u),p.dot(v)]);
   const next=adj.get(current).find(k=>k!==previous);previous=current;current=next;
  }while(current!==start);
  if(loop.length<3)fail('Вырожденный контур.');loops.push(loop);
 }
 let minX=Infinity,minY=Infinity;for(const loop of loops)for(const [x,y] of loop){minX=Math.min(minX,x);minY=Math.min(minY,y);}
 return loops.map(loop=>loop.map(([x,y])=>[x-minX,y-minY]));
}
export function partDxf(mesh,mmPerUnit,{mode='flat',faceVertices=null,cadEdges=null}={}){
 if(mode==='flat'){
  const loops=flatContours(mesh,mmPerUnit,faceVertices),entities=[];
  for(const loop of loops){entities.push('0','LWPOLYLINE','100','AcDbEntity','8','PART','100','AcDbPolyline','90',String(loop.length),'70','1');for(const [x,y] of loop)entities.push('10',number(x),'20',number(y));}
  return {text:document(entities),contours:loops.length,kind:'Контур 2D'};
 }
 if(mode!=='edges')fail('Неизвестный режим DXF.');
 mesh.updateWorldMatrix(true,false);
 const source=Array.isArray(cadEdges)&&cadEdges.length>=6&&cadEdges.length%6===0?cadEdges:null;
 const geometry=source?null:new THREE.EdgesGeometry(mesh.geometry,25),p=geometry?.attributes.position;
 const count=source?source.length/3:p.count,segments=[];
 for(let i=0;i<count;i+=2)segments.push([0,1].map(k=>(source?new THREE.Vector3(...source.slice((i+k)*3,(i+k+1)*3)):new THREE.Vector3().fromBufferAttribute(p,i+k)).applyMatrix4(mesh.matrixWorld).multiplyScalar(mmPerUnit)));
 geometry?.dispose();if(!segments.length)fail('У детали нет рёбер.');
 const center=new THREE.Box3().setFromPoints(segments.flat()).getCenter(new THREE.Vector3()),entities=[];
 for(const pair of segments){const [a,b]=pair.map(p=>p.clone().sub(center));entities.push('0','LINE','100','AcDbEntity','8','PART','100','AcDbLine','10',number(a.x),'20',number(a.y),'30',number(a.z),'11',number(b.x),'21',number(b.y),'31',number(b.z));}
 return {text:document(entities),segments:segments.length,kind:'Рёбра 3D'};
}
