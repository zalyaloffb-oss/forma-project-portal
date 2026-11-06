import {MaxRectsBin,Rectangle} from './vendor/maxrects/maxrects-packer.mjs';
import {dxfFilename,sheetDxf} from './part-dxf.js?v=3';

export function layoutSheet(parts,{width,height,margin,gap,rotate}){
 if(![width,height,margin,gap].every(Number.isFinite)||width<=0||height<=0||
    margin<0||gap<0||2*margin>=Math.min(width,height)){
  throw Error('Задайте положительные размеры листа и отступы в пределах листа.');
 }
 const usableWidth=width-2*margin,usableHeight=height-2*margin;
 const bin=new MaxRectsBin(usableWidth,usableHeight,gap,{smart:false,pot:false,square:false,allowRotation:rotate});
 const placed=[],unplaced=[];
 const ordered=parts.slice().sort((a,b)=>Math.max(b.width,b.height)-Math.max(a.width,a.height));
 for(const part of ordered){
  const rect=bin.add(new Rectangle(part.width,part.height));
  if(!rect){unplaced.push(part);continue;}
  const x=rect.x+margin,y=rect.y+margin;
  const w=rect.rot?part.height:part.width,h=rect.rot?part.width:part.height;
  const tolerance=1e-7;
  if(x<margin-tolerance||y<margin-tolerance||x+w>width-margin+tolerance||y+h>height-margin+tolerance||
     placed.some(p=>x<p.x+p.width+gap-tolerance&&x+w+gap>p.x+tolerance&&
                    y<p.y+p.height+gap-tolerance&&y+h+gap>p.y+tolerance)){
   throw Error('Раскладка не прошла проверку зазоров. Измените параметры листа.');
  }
  const loops=part.loops.map(loop=>loop.map(([u,v])=>rect.rot?[x+part.height-v,y+u]:[x+u,y+v]));
  placed.push({...part,x,y,width:w,height:h,loops});
 }
 return {placed,unplaced};
}

export function createSheetLayout(projectTitle){
 const parts=new Map();
 const dialog=document.createElement('dialog');
 dialog.className='dxf-dialog sheet-layout';
 dialog.innerHTML=`
  <h2>Раскладка граней на листе</h2>
  <p class="dxf-note">Добавляйте плоские грани одного материала и толщины через карточки деталей. Раскладка использует их габариты, экспорт сохраняет контуры и отверстия.</p>
  <div class="sheet-fields">
   <label>Ширина листа, мм<input name="width" type="number" min="1" step="any" value="2800"></label>
   <label>Высота листа, мм<input name="height" type="number" min="1" step="any" value="2070"></label>
   <label>Отступ от края, мм<input name="margin" type="number" min="0" step="any" value="10"></label>
   <label>Зазор между деталями, мм<input name="gap" type="number" min="0" step="any" value="6"></label>
  </div>
  <label><input name="rotate" type="checkbox"> Разрешить поворот на 90°</label>
  <p class="dxf-note">Контуры взяты из 3D-превью. Перед резкой сверьте их с моделью.</p>
  <svg class="sheet-preview" role="img" aria-label="Предпросмотр раскладки"></svg>
  <p class="sheet-status" role="status"></p>
  <ul class="sheet-parts"></ul>
  <div class="dxf-actions"><button type="button" data-close>К модели</button><button type="button" data-export>Скачать DXF</button></div>`;
 document.body.append(dialog);
 const field=name=>dialog.querySelector('[name="'+name+'"]');
 const svg=dialog.querySelector('svg'),status=dialog.querySelector('.sheet-status');
 const download=dialog.querySelector('[data-export]');
 let exportData=null;
 const element=(name,attrs)=>{
  const node=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  return node;
 };
 function update(){
  const params=Object.fromEntries(['width','height','margin','gap'].map(key=>[key,field(key).valueAsNumber]));
  params.rotate=field('rotate').checked;
  const list=dialog.querySelector('.sheet-parts');
  list.replaceChildren();
  exportData=null;
  download.disabled=true;
  svg.replaceChildren();
  let layout;
  try{layout=layoutSheet([...parts.values()],params);}
  catch(error){status.textContent=error.message;}
  if(layout){
   const {width,height,margin}=params;
   svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
   svg.append(element('rect',{width,height,fill:'#fff',stroke:'#4d6458','vector-effect':'non-scaling-stroke'}));
   svg.append(element('rect',{x:margin,y:margin,width:width-2*margin,height:height-2*margin,fill:'none',stroke:'#a6b7aa','stroke-dasharray':'4 4','vector-effect':'non-scaling-stroke'}));
   for(const part of layout.placed){
    const d=part.loops.map(loop=>loop.map(([x,y],i)=>`${i?'L':'M'}${x} ${height-y}`).join(' ')+' Z').join(' ');
    const shape=element('path',{d,fill:'#d7e7df',stroke:'#234f40','fill-rule':'evenodd','vector-effect':'non-scaling-stroke'});
    const title=element('title',{});title.textContent=part.name;shape.append(title);svg.append(shape);
   }
   status.textContent=parts.size?`На листе ${layout.placed.length} из ${parts.size}. ${layout.unplaced.length?'Увеличьте лист или уберите детали, которые не поместились.':''}`:'Выберите плоскую грань на модели и добавьте её через карточку детали.';
   if(parts.size&&!layout.unplaced.length){
    exportData={width,height,loops:layout.placed.flatMap(part=>part.loops)};
    download.disabled=false;
   }
  }
  for(const [key,part] of parts){
   const row=document.createElement('li');
   const label=document.createElement('span');
   label.textContent=part.name+(layout?.unplaced.includes(part)?' · не поместилась':'');
   const remove=document.createElement('button');
   remove.type='button';remove.textContent='Убрать';
   remove.onclick=()=>{parts.delete(key);update();};
   row.append(label,remove);list.append(row);
  }
 }
 dialog.addEventListener('input',update);
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 download.onclick=()=>{
  if(!exportData)return;
  const {width,height,loops}=exportData;
  const url=URL.createObjectURL(new Blob([sheetDxf(width,height,loops)],{type:'application/dxf'}));
  const a=document.createElement('a');
  a.href=url;a.download=dxfFilename(projectTitle+' — раскладка');a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return {
  open(){update();if(!dialog.open)dialog.showModal();},
  add(key,name,loops){
   let width=0,height=0;
   for(const loop of loops)for(const [x,y] of loop){width=Math.max(width,x);height=Math.max(height,y);}
   parts.set(key,{name,loops,width,height});
  }
 };
}
