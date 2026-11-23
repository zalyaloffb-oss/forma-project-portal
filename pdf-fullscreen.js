// Fullscreen-only zoom, pan and tap controls. The original canvas returns to the drawer.
export function bindPdfFullscreen({modal,content,host,toolbar,onZoom}){
 const abort=new AbortController(),options={signal:abort.signal};
 let zoom=1,redraw=null,pointers=new Map(),gesture=null;
 const sheet=document.createElement('div');sheet.className='pdf-zoom-sheet';host.append(sheet);
 const controls=document.createElement('div');controls.className='pdf-zoom-controls';
 controls.innerHTML='<button type="button" title="Уменьшить" aria-label="Уменьшить PDF">−</button><output aria-live="polite">100%</output><button type="button" title="Увеличить" aria-label="Увеличить PDF">+</button><button type="button" title="Уместить страницу" aria-label="Уместить страницу PDF">⛶</button>';
 toolbar.insertBefore(controls,toolbar.querySelector('a'));
 const buttons=controls.querySelectorAll('button'),output=controls.querySelector('output');
 function layout(){
  const canvas=host.querySelector('canvas');if(!canvas)return;
  if(canvas.parentElement!==sheet)sheet.replaceChildren(canvas);
  const width=Math.max(1,host.clientWidth-32),height=Math.max(1,host.clientHeight-32);
  const fit=Math.min(width/canvas.width,height/canvas.height);
  canvas.style.width=canvas.width*fit*zoom+'px';canvas.style.height=canvas.height*fit*zoom+'px';
  sheet.style.width=Math.max(width,canvas.width*fit*zoom)+'px';sheet.style.height=Math.max(height,canvas.height*fit*zoom)+'px';
  output.textContent=Math.round(zoom*100)+'%';buttons[0].disabled=zoom<=1;buttons[1].disabled=zoom>=6;
 }
 function setZoom(value,x,y){
  const canvas=host.querySelector('canvas');if(!canvas)return;
  const box=canvas.getBoundingClientRect(),bounds=host.getBoundingClientRect();
  x??=bounds.left+host.clientWidth/2;y??=bounds.top+host.clientHeight/2;
  const u=(x-box.left)/box.width,v=(y-box.top)/box.height;
  const previous=zoom;zoom=Math.max(1,Math.min(6,value));layout();if(previous!==zoom){clearTimeout(redraw);redraw=setTimeout(()=>onZoom?.(),180);}
  const next=canvas.getBoundingClientRect();host.scrollLeft+=next.left+u*next.width-x;host.scrollTop+=next.top+v*next.height-y;
 }
 buttons[0].onclick=()=>setZoom(zoom/1.25);buttons[1].onclick=()=>setZoom(zoom*1.25);buttons[2].onclick=()=>setZoom(1);
 host.addEventListener('wheel',event=>{event.preventDefault();setZoom(zoom*(event.deltaY<0?1.12:1/1.12),event.clientX,event.clientY);},{...options,passive:false});
 const distance=()=>{const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
 host.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;event.preventDefault();host.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size===1)gesture={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false};
  else if(pointers.size===2){gesture.moved=true;gesture.distance=distance();gesture.zoom=zoom;}
 },options);
 host.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId)||!gesture)return;
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size===2){const [a,b]=[...pointers.values()];setZoom(gesture.zoom*distance()/gesture.distance,(a.x+b.x)/2,(a.y+b.y)/2);}
  else{
   if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>5)gesture.moved=true;
   if(gesture.moved){host.scrollLeft-=event.clientX-gesture.lastX;host.scrollTop-=event.clientY-gesture.lastY;}
  }
  gesture.lastX=event.clientX;gesture.lastY=event.clientY;
 },options);
 function end(event){
  if(!pointers.has(event.pointerId))return;
  if(event.type==='pointerup'&&pointers.size===1&&!gesture?.moved){
   const box=host.querySelector('canvas')?.getBoundingClientRect();
   const onPage=box&&event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom;
   content.classList.toggle('pdf-header-hidden',!onPage);
  }
  pointers.delete(event.pointerId);
  if(pointers.size===1){const [point]=pointers.values();gesture={...gesture,lastX:point.x,lastY:point.y,moved:true};}
  if(!pointers.size)gesture=null;
 }
 for(const type of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(type,end,options);
 modal.addEventListener('keydown',event=>{
  if(event.key==='+'||event.key==='='){event.preventDefault();setZoom(zoom*1.25);}
  if(event.key==='-'){event.preventDefault();setZoom(zoom/1.25);}
  if(event.key==='0'){event.preventDefault();setZoom(1);}
 },options);
 const observer=new ResizeObserver(layout);observer.observe(host);
 function refresh(){if(!sheet.isConnected)host.append(sheet);layout();}
 refresh();
 return {get zoom(){return zoom;},replaceCanvas(canvas){sheet.replaceChildren(canvas);layout();},refresh,dispose(){clearTimeout(redraw);abort.abort();observer.disconnect();controls.remove();const canvas=sheet.querySelector('canvas');if(canvas){canvas.removeAttribute('style');host.append(canvas);}sheet.remove();}};
}
