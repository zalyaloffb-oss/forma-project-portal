export function mainComponentGroups(items){
 const groups=new Map();
 for(const item of items){const name=item.path.split('+')[0]||item.name;let group=groups.get(name);if(!group){group={name,ids:[]};groups.set(name,group);}group.ids.push(item.id);}
 return groups;
}

export function createComponentHover({canvas,stage,items,pick,canShow,onIsolate,getJoint,onJointAction}){
 const groups=mainComponentGroups(items),button=document.createElement('div');button.className='component-hover';button.id='component-hover';button.hidden=true;
 button.setAttribute('role','group');button.setAttribute('aria-label','Действия компонента');
 button.innerHTML='<button class="component-hover-main"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l10-5 8 5-10 5zM3 8v8l8 5 10-5V8M11 13v8"/></svg><span class="component-hover-copy"><strong></strong><small></small></span></button><div class="component-hover-door" hidden><span></span><div><button data-door-action="open">Открыть дверь</button><button data-door-action="close">Закрыть дверь</button></div></div>';
 const main=button.querySelector('.component-hover-main'),door=button.querySelector('.component-hover-door');
 stage.append(button);let timer=null,hideTimer=null,active=null,activeJoint=null;
 function hide(){clearTimeout(timer);clearTimeout(hideTimer);button.hidden=true;active=null;activeJoint=null;}
 function updateDoor(){
  door.hidden=!activeJoint;if(!activeJoint)return;
  const j=activeJoint,open=Math.abs(j.maximum-j.initialAngle)>Math.abs(j.minimum-j.initialAngle)?j.maximum:j.minimum;
  const closed=Math.abs(j.angle-j.initialAngle)<.005,opened=Math.abs(j.angle-open)<.005;
  door.querySelector('span').textContent=closed?'Дверь закрыта':opened?'Дверь открыта':'Дверь приоткрыта';
  door.querySelector('[data-door-action="open"]').disabled=opened;door.querySelector('[data-door-action="close"]').disabled=closed;
 }
 function place(point){
  const r=stage.getBoundingClientRect(),w=button.offsetWidth,h=button.offsetHeight;
  let x=point.clientX-r.left+18,y=point.clientY-r.top+16;
  if(x+w>r.width-12)x=point.clientX-r.left-w-18;
  if(y+h>r.height-12)y=point.clientY-r.top-h-16;
  button.style.left=Math.max(12,Math.min(x,r.width-w-12))+'px';button.style.top=Math.max(12,Math.min(y,r.height-h-12))+'px';
 }
 function schedule(event){
  if(event.buttons||event.pointerType==='touch'||!canShow()){hide();return;}
  clearTimeout(hideTimer);
  if(!button.hidden){
   const r=button.getBoundingClientRect();
   // A small bridge lets the pointer travel from the model onto the clickable hint.
   if(event.clientX>=r.left-26&&event.clientX<=r.right+16&&event.clientY>=r.top-24&&event.clientY<=r.bottom+16)return;
   hide();
  }
  clearTimeout(timer);const point={clientX:event.clientX,clientY:event.clientY};
  timer=setTimeout(()=>{
   if(!canShow())return;const hit=pick(point);if(!hit)return;
   const item=items[hit.object.userData.itemId],group=groups.get(item.path.split('+')[0]||item.name);if(!group)return;
   active=group;activeJoint=getJoint?.(item)||null;main.querySelector('strong').textContent=group.name;
   main.querySelector('small').textContent='Изолировать компонент · '+group.ids.length+' тел';
   main.setAttribute('aria-label','Изолировать компонент '+group.name);main.title=group.name;updateDoor();
   button.hidden=false;place(point);stage.dataset.hoverComponent=group.name;
  },320);
 }
 function leave(event){if(event.relatedTarget===button||button.contains(event.relatedTarget))return;hideTimer=setTimeout(hide,180);}
 button.addEventListener('pointerenter',()=>{clearTimeout(hideTimer);clearTimeout(timer);});
 button.addEventListener('pointerleave',()=>{hideTimer=setTimeout(hide,180);});button.addEventListener('focusout',event=>{if(!button.contains(event.relatedTarget)&&!button.matches(':hover'))hide();});
 main.addEventListener('click',event=>{event.stopPropagation();const group=active;if(!group)return;hide();onIsolate(group);});
 door.addEventListener('click',event=>{const action=event.target.closest('[data-door-action]');if(!action||!activeJoint)return;event.stopPropagation();onJointAction(activeJoint,action.dataset.doorAction==='open');updateDoor();});
 canvas.addEventListener('pointermove',schedule);canvas.addEventListener('pointerup',schedule);canvas.addEventListener('pointerdown',hide);canvas.addEventListener('pointerleave',leave);window.addEventListener('blur',hide);
 return {hide,dispose(){hide();button.remove();canvas.removeEventListener('pointermove',schedule);canvas.removeEventListener('pointerup',schedule);canvas.removeEventListener('pointerdown',hide);canvas.removeEventListener('pointerleave',leave);window.removeEventListener('blur',hide);}};
}
