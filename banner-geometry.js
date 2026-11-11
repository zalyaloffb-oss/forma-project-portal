import * as THREE from 'three';
const baseUVs=new WeakMap();

// Place existing artwork at its physical size; clamp-to-edge keeps blank margins blank.
export function applyTexturePlacement(geometry,width,height,placement){
 const uv=geometry.attributes.uv;
 if(!baseUVs.has(geometry))baseUVs.set(geometry,uv.array.slice());
 const base=baseUVs.get(geometry);uv.array.set(base);
 if(placement){
  const {width:tw,height:th,offsetU=0,offsetV=0}=placement;
  if(![tw,th,offsetU,offsetV].every(Number.isFinite)||tw<=0||th<=0||[tw,th,offsetU,offsetV].some(v=>Math.abs(v)>100000))throw Error('Некорректное размещение текстуры');
  for(let i=0;i<uv.count;i++)uv.setXY(i,(base[i*2]*width-offsetU)/tw,(base[i*2+1]*height-offsetV)/th);
 }
 uv.needsUpdate=true;
}

// The face is already in world coordinates. Project to a stable, upright UV frame.
export function bannerGeometry(surface){
 const normal=surface.normal.clone().normalize();
 const up=new THREE.Vector3(0,1,0);
 const v=up.addScaledVector(normal,-up.dot(normal));
 if(v.lengthSq()<.001)v.set(0,0,-1).addScaledVector(normal,normal.z);
 v.normalize();const u=new THREE.Vector3().crossVectors(v,normal).normalize();
 const positions=surface.vertices,coords=[];
 for(let i=0;i<positions.length;i+=3){const p=new THREE.Vector3(...positions.slice(i,i+3));coords.push([p.dot(u),p.dot(v)]);}
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(const [x,y] of coords){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 const width=maxX-minX,height=maxY-minY;if(width<1e-8||height<1e-8)throw Error('Поверхность имеет нулевой размер');
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(coords.flatMap(([x,y])=>[(x-minX)/width,(y-minY)/height]),2));geometry.computeVertexNormals();
 const center=u.clone().multiplyScalar((minX+maxX)/2).addScaledVector(v,(minY+maxY)/2).addScaledVector(normal,surface.point.dot(normal));
 return {geometry,width,height,frame:{u,v,normal,center}};
}
export function rectangleGeometry(frame,width,height,offsetU=0,offsetV=0){
 if(![width,height,offsetU,offsetV].every(Number.isFinite)||width<=0||height<=0)throw Error('Укажите положительные размеры');
 const matrix=new THREE.Matrix4().makeBasis(frame.u,frame.v,frame.normal);
 matrix.setPosition(frame.center.clone().addScaledVector(frame.u,offsetU).addScaledVector(frame.v,offsetV));
 return new THREE.PlaneGeometry(width,height).applyMatrix4(matrix);
}
export function isNamedBanner(name){
 return /(?:^|[^а-яa-z])(?:баннер|banner)(?:ы|а|ов|s)?(?:$|[^а-яa-z])/iu.test(name)&&!/(?:рама|каркас|креп[её]ж|профиль|подрамник)/iu.test(name);
}
