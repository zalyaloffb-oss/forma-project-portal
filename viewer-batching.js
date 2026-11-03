import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';

// Only a temporary display cache: the editable/pickable body meshes are untouched.
function materialKey(material,geometry){
 if(Array.isArray(material)||material.transparent||material.map||material.normalMap||material.alphaMap||material.emissiveMap||material.roughnessMap||material.metalnessMap||material.lightMap||material.aoMap||material.bumpMap||material.displacementMap||material.specularMap||material.envMap||material.vertexColors)return null;
 if(!['MeshLambertMaterial','MeshStandardMaterial','MeshBasicMaterial'].includes(material.type))return null;
 const layout=Object.entries(geometry.attributes).map(([k,a])=>[k,a.itemSize,a.normalized,a.array?.constructor.name]);
 return JSON.stringify([material.type,material.name,material.color?.toArray(),material.emissive?.toArray(),material.emissiveIntensity,material.side,material.opacity,material.alphaTest,material.depthTest,material.depthWrite,material.roughness,material.metalness,material.polygonOffset,material.polygonOffsetFactor,material.polygonOffsetUnits,material.flatShading,material.fog,!!geometry.index,layout,material.clippingPlanes?.map(p=>[...p.normal.toArray(),p.constant])]);
}
export function bakedGeometry(mesh){
 const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
 // WebGL flips front-face winding for mirrored original objects. Baking must do so explicitly.
 if(mesh.matrixWorld.determinant()<0){
  if(geometry.index){const a=geometry.index;for(let n=0;n<a.count;n+=3){const v=a.getX(n+1);a.setX(n+1,a.getX(n+2));a.setX(n+2,v);}}
  else for(const a of Object.values(geometry.attributes))for(let n=0;n<a.count;n+=3)for(let c=0;c<a.itemSize;c++){
   const v=a.getComponent(n+1,c);a.setComponent(n+1,c,a.getComponent(n+2,c));a.setComponent(n+2,c,v);
  }
 }
 return geometry;
}
export function createInteractionBatch({items,edges,edgeMaterial,scene}){
 const group=new THREE.Group();group.name='Navigation display cache';group.visible=false;scene.add(group);
 let previous='',included=[],builds=0;
 function clear(){for(const o of [...group.children]){group.remove(o);o.geometry.dispose();if(o.material!==edgeMaterial)o.material.dispose();}included=[];}
 function refresh(){
  for(const i of items)i.mesh.updateMatrixWorld(true);
  const keys=items.map(i=>i.visible?materialKey(i.mesh.material,i.mesh.geometry):null);
  const signature=JSON.stringify(items.map((i,n)=>[i.visible,i.mesh.matrixWorld.elements,keys[n],edges[n].visible]));
  if(previous===signature)return false;
  clear();previous=signature;const groups=new Map();let edgeCount=0;
  for(let n=0;n<items.length;n++){
   const item=items[n],key=keys[n];if(!item.visible||key===null)continue;
   let bucket=groups.get(key);if(!bucket){bucket={source:item.mesh.material,geometries:[]};groups.set(key,bucket);}
   bucket.geometries.push(bakedGeometry(item.mesh));included.push(item);
   if(edges[n].visible)edgeCount+=edges[n].userData.sourceGeometry.attributes.position.count;
  }
  for(const bucket of groups.values()){
   const geometry=mergeGeometries(bucket.geometries,false);bucket.geometries.forEach(g=>g.dispose());
   if(!geometry)throw Error('Incompatible navigation geometry');
   const material=bucket.source.clone();
   // Surface-number shaders use individual local body axes; restore those in the detailed frame.
   material.onBeforeCompile=THREE.Material.prototype.onBeforeCompile;
   material.customProgramCacheKey=THREE.Material.prototype.customProgramCacheKey;
   const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;group.add(mesh);
  }
  if(edgeCount){
   const positions=new Float32Array(edgeCount*3),point=new THREE.Vector3();let offset=0;
   for(const item of included){const edge=edges[item.id];if(!edge.visible)continue;const source=edge.userData.sourceGeometry.attributes.position;
    for(let n=0;n<source.count;n++){point.fromBufferAttribute(source,n).applyMatrix4(item.mesh.matrixWorld);point.toArray(positions,offset);offset+=3;}
   }
   const lines=new LineSegments2(new LineSegmentsGeometry().setPositions(positions),edgeMaterial);lines.renderOrder=1;lines.frustumCulled=false;group.add(lines);
  }
  builds++;return true;
 }
 function render(draw){
  const visibility=included.map(i=>i.mesh.visible);included.forEach(i=>{i.mesh.visible=false;});group.visible=true;
  try{return draw();}finally{group.visible=false;included.forEach((i,n)=>{i.mesh.visible=visibility[n];});}
 }
 return {refresh,render,dispose(){clear();group.removeFromParent();},get stats(){return {bodies:included.length,calls:group.children.length,builds};}};
}
