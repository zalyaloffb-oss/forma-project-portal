import * as THREE from 'three';

// CSS has a downward Y axis; conjugate the camera's inverse rotation accordingly.
export function cubeMatrix(quaternion){
 const matrix=new THREE.Matrix4().makeRotationFromQuaternion(quaternion.clone().invert());
 for(let column=0;column<3;column++)for(let row=0;row<3;row++)matrix.elements[column*4+row]*=(row===1?-1:1)*(column===1?-1:1);
 return matrix;
}
export const cubeFaces=[
 {name:'Перед',label:'Вид спереди',side:'front',n:[0,0,1],u:[1,0,0],v:[0,-1,0]},
 {name:'Сзади',label:'Вид сзади',side:'back',n:[0,0,-1],u:[-1,0,0],v:[0,-1,0]},
 {name:'Право',label:'Вид справа',side:'right',n:[1,0,0],u:[0,0,-1],v:[0,-1,0]},
 {name:'Лево',label:'Вид слева',side:'left',n:[-1,0,0],u:[0,0,1],v:[0,-1,0]},
 {name:'Верх',label:'Вид сверху',side:'top',n:[0,1,0],u:[1,0,0],v:[0,0,1]},
 {name:'Низ',label:'Вид снизу',side:'bottom',n:[0,-1,0],u:[1,0,0],v:[0,0,-1]}
];
export function cubeDirection(face,row,column){return face.n.map((v,k)=>v+face.u[k]*column+face.v[k]*row);}
function directionLabel(direction){
 const names=direction.map((v,k)=>v?[["слева","справа"],["снизу","сверху"],["сзади","спереди"]][k][v>0?1:0]:null).filter(Boolean);
 return (names.length===3?'Изометрия: ':'Вид на ребро: ')+names.join(' / ');
}
export function createViewCube({host,onNavigate,onHome,onDrag,onEnd,onRoll}){
 host.className='viewcube orientation-cube';host.setAttribute('aria-label','Куб ориентации модели');host.replaceChildren();
 const home=document.createElement('button');home.className='cube-home';home.setAttribute('aria-label','Домашний вид куба');home.title='Домашний вид';
 home.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8M6 9v12h12V9M10 21v-7h4v7"/></svg>';home.onclick=onHome;host.append(home);
 const space=document.createElement('div');space.className='cube-space';const solid=document.createElement('div');solid.className='cube-solid';space.append(solid);host.append(space);
 const rolls=document.createElement('div');rolls.className='cube-rolls';
 for(const [direction,label,path] of [[-1,'Повернуть вид на 90° против часовой стрелки','M9 4L4 8l5 4M4 8h10a6 6 0 0 1 0 12'],[1,'Повернуть вид на 90° по часовой стрелке','M15 4l5 4-5 4M20 8H10a6 6 0 0 0 0 12']]){
  const button=document.createElement('button');button.setAttribute('aria-label',label);button.title=label;button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';button.onclick=()=>{onRoll?.(direction);onEnd?.();};rolls.append(button);
 }
 host.append(rolls);
 const compass=document.createElement('div');compass.className='cube-compass';compass.setAttribute('aria-hidden','true');
 compass.innerHTML='<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="49"/><circle class="compass-inner" cx="60" cy="60" r="43"/><path d="M60 7v12M60 101v12M7 60h12M101 60h12"/><text x="60" y="15">N</text><text x="60" y="114">S</text><text x="11" y="63">W</text><text x="109" y="63">E</text></svg>';solid.append(compass);
 for(const face of cubeFaces){
  const plane=document.createElement('div');plane.className='cube-face cube-'+face.side;
  for(let row=-1;row<=1;row++)for(let column=-1;column<=1;column++){
   const direction=cubeDirection(face,row,column),button=document.createElement('button');button.className='cube-target';
   const label=row===0&&column===0?face.label:directionLabel(direction)+' · '+face.name;
   button.setAttribute('aria-label',label);button.title=label;button.dataset.direction=direction.join(',');button.addEventListener('pointerenter',()=>{solid.querySelectorAll('.cube-target').forEach(b=>b.classList.toggle('cube-hovered',b.dataset.direction===button.dataset.direction));});button.addEventListener('pointerleave',()=>solid.querySelectorAll('.cube-hovered').forEach(b=>b.classList.remove('cube-hovered')));plane.append(button);
  }
  const label=document.createElement('span');label.className='cube-label';label.textContent=face.name.toLocaleUpperCase('ru-RU');plane.append(label);solid.append(plane);
 }
 let drag=null,suppressClick=false,last='';
 function navigate(button){onNavigate(button.dataset.direction.split(',').map(Number));onEnd?.();}
 solid.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;event.preventDefault();event.stopPropagation();
  drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false,button:event.target.closest('button')};suppressClick=false;solid.setPointerCapture(event.pointerId);
 });
 solid.addEventListener('pointermove',event=>{
  if(!drag)return;const x=event.clientX,y=event.clientY;
  if(Math.hypot(x-drag.startX,y-drag.startY)>4)drag.moved=true;
  if(drag.moved)onDrag?.(x-drag.x,y-drag.y);
  drag.x=x;drag.y=y;
 });
 solid.addEventListener('pointerup',event=>{
  if(!drag||event.pointerId!==drag.pointer)return;const finished=drag;drag=null;suppressClick=true;
  if(solid.hasPointerCapture(event.pointerId))solid.releasePointerCapture(event.pointerId);
  if(finished.moved)onEnd?.();else if(finished.button)navigate(finished.button);
 });
 const cancel=()=>{if(drag){drag=null;onEnd?.();}};
 solid.addEventListener('pointercancel',cancel);solid.addEventListener('lostpointercapture',cancel);
 solid.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(suppressClick&&event.detail!==0){suppressClick=false;event.preventDefault();return;}
  // Keyboard activation does not have pointer events.
  if(event.detail===0)navigate(button);
 });
 return {update(quaternion){const values=cubeMatrix(quaternion).elements.map(v=>Math.abs(v)<1e-10?0:Number(v.toFixed(8)));const next='matrix3d('+values.join(',')+')';if(next!==last){solid.style.transform=next;host.dataset.orientation=values.join(',');last=next;}},dispose(){host.replaceChildren();}};
}
