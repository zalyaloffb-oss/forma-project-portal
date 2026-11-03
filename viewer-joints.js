import * as THREE from 'three';

const belongs=(path,parent)=>path===parent||path.startsWith(parent+'+');
export function createJoints({descriptors,items,center,scale,rootQuaternion}){
 const joints=[];
 for(const d of descriptors||[]){
  if(d.type!=='revolute'||d.coordinates!=='fusion-world-metres'||d.angleUnit!=='radians')continue;
  if(![d.pivot,d.axis].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)))continue;
  if(![d.minimum,d.maximum,d.angle].every(Number.isFinite)||d.minimum>d.maximum)continue;
  const members=items.filter(i=>belongs(i.path,d.movingPath));
  const axis=new THREE.Vector3(...d.axis).applyQuaternion(rootQuaternion);
  if(!members.length||axis.lengthSq()<1e-12)continue;
  const pivot=new THREE.Vector3(...d.pivot).applyQuaternion(rootQuaternion).sub(center).multiplyScalar(scale);
  joints.push({...d,members,pivot,axis:axis.normalize(),initialAngle:d.angle,initialPivot:pivot.clone(),initialAxis:axis.clone().normalize()});
 }
 function setAngle(joint,value){
  const next=THREE.MathUtils.clamp(value,joint.minimum,joint.maximum);
  const rotation=new THREE.Quaternion().setFromAxisAngle(joint.axis,next-joint.angle);
  for(const item of joint.members){
   item.mesh.position.sub(joint.pivot).applyQuaternion(rotation).add(joint.pivot);
   item.base.sub(joint.pivot).applyQuaternion(rotation).add(joint.pivot);
   item.mesh.quaternion.premultiply(rotation).normalize();
  }
  // Downstream hinges follow their parent assembly, while unrelated hinges stay fixed.
  for(const child of joints)if(child!==joint&&belongs(child.movingPath,joint.movingPath)&&belongs(child.fixedPath,joint.movingPath)){
   child.pivot.sub(joint.pivot).applyQuaternion(rotation).add(joint.pivot);
   child.axis.applyQuaternion(rotation).normalize();
  }
  joint.angle=next;
 }
 function reset(){
  for(const i of items){i.base.copy(i.restPosition);i.mesh.position.copy(i.restPosition);i.mesh.quaternion.copy(i.restQuaternion);}
  for(const j of joints){j.angle=j.initialAngle;j.pivot.copy(j.initialPivot);j.axis.copy(j.initialAxis);}
 }
 const capture=()=>joints.map(j=>({angle:j.angle,pivot:j.pivot.toArray(),axis:j.axis.toArray()}));
 function restore(state){state.forEach((s,n)=>{const j=joints[n];j.angle=s.angle;j.pivot.fromArray(s.pivot);j.axis.fromArray(s.axis);});}
 return {joints,setAngle,reset,capture,restore};
}
