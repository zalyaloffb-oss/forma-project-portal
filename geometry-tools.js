import * as THREE from 'three';
export function triangles(mesh){
 const g=mesh.geometry,p=g.attributes.position,idx=g.index,out=[];
 for(let i=0;i<(idx?idx.count:p.count);i+=3)out.push([0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld)));
 return out;
}
export function planarFace(mesh,faceIndex){
 const ts=triangles(mesh),seed=ts[faceIndex];if(!seed)return null;
 const normal=new THREE.Triangle(...seed).getNormal(new THREE.Vector3()),origin=seed[0],eps=1e-5;
 const key=v=>v.toArray().map(x=>Math.round(x/eps)).join(',');
 const candidates=new Map(),adj=new Map();
 ts.forEach((t,i)=>{if(t.some(v=>Math.abs(v.clone().sub(origin).dot(normal))>eps))return;
  if(new THREE.Triangle(...t).getNormal(new THREE.Vector3()).dot(normal)<.99999)return;
  const keys=t.map(key);candidates.set(i,keys);for(let j=0;j<3;j++){const e=[keys[j],keys[(j+1)%3]].sort().join('|');if(!adj.has(e))adj.set(e,[]);adj.get(e).push(i);}
 });
 const visited=new Set(),queue=[faceIndex];while(queue.length){const i=queue.pop();if(visited.has(i)||!candidates.has(i))continue;visited.add(i);const keys=candidates.get(i);for(let j=0;j<3;j++)for(const n of adj.get([keys[j],keys[(j+1)%3]].sort().join('|')))if(!visited.has(n))queue.push(n);}
 const vertices=[...visited].flatMap(i=>ts[i].flatMap(v=>v.toArray()));
 return {normal,point:origin.clone(),vertices,area:[...visited].reduce((a,i)=>a+new THREE.Triangle(...ts[i]).getArea(),0)};
}
export function sectionGeometry(mesh,plane){
 const eps=1e-5,segments=[];
 for(const t of triangles(mesh)){
  const d=t.map(v=>plane.distanceToPoint(v));if(!d.some(x=>x>eps)||!d.some(x=>x< -eps))continue;
  const hits=[];for(let j=0;j<3;j++){const k=(j+1)%3;if(Math.abs(d[j])<=eps)hits.push(t[j]);else if(d[j]*d[k]<0)hits.push(t[j].clone().lerp(t[k],d[j]/(d[j]-d[k])));}
  const unique=hits.filter((v,i)=>!hits.slice(0,i).some(w=>v.distanceToSquared(w)<eps*eps));if(unique.length===2)segments.push(unique);
 }
 if(!segments.length)return null;
 const normal=plane.normal,origin=normal.clone().multiplyScalar(-plane.constant),u=new THREE.Vector3().crossVectors(Math.abs(normal.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0),normal).normalize(),v=new THREE.Vector3().crossVectors(normal,u);
 const nodes=new Map(),edges=new Set(),key=p=>p.toArray().map(x=>Math.round(x/eps)).join(',');
 for(const [a,b] of segments){const ka=key(a),kb=key(b);if(ka===kb)continue;const ek=[ka,kb].sort().join('|');if(edges.has(ek))continue;edges.add(ek);for(const [k,p,n] of [[ka,a,kb],[kb,b,ka]]){if(!nodes.has(k))nodes.set(k,{p,neighbors:[]});nodes.get(k).neighbors.push(n);}}
 const used=new Set(),loops=[];
 for(const [start,node] of nodes){for(const next of node.neighbors){if(used.has([start,next].sort().join('|')))continue;const loop=[],first=start;let prev=null,current=start,target=next;
  for(let n=0;n<=edges.size;n++){loop.push(nodes.get(current).p);used.add([current,target].sort().join('|'));prev=current;current=target;if(current===first)break;const choices=nodes.get(current).neighbors.filter(k=>k!==prev&&!used.has([current,k].sort().join('|')));if(!choices.length)break;target=choices[0];}
  if(current===first&&loop.length>=3)loops.push(loop.map(p=>{const q=p.clone().sub(origin);return new THREE.Vector2(q.dot(u),q.dot(v));}));
 }}
 function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
 const records=loops.map((loop,i)=>({loop,i,area:Math.abs(THREE.ShapeUtils.area(loop)),parent:null,depth:0}));
 for(const r of records){const parents=records.filter(q=>q.area>r.area&&inside(r.loop[0],q.loop)).sort((a,b)=>a.area-b.area);r.parent=parents[0]||null;r.depth=parents.length;}
 const positions=[],uv=[];
 for(const r of records.filter(r=>r.depth%2===0)){const holes=records.filter(q=>q.parent===r&&q.depth%2===1).map(q=>q.loop);const points=[...r.loop,...holes.flat()];for(const tri of THREE.ShapeUtils.triangulateShape(r.loop,holes))for(const i of tri){const p=points[i],world=origin.clone().addScaledVector(u,p.x).addScaledVector(v,p.y);positions.push(...world.toArray());uv.push(p.x,p.y);}}
 if(!positions.length)return null;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
