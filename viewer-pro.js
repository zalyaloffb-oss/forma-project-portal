import * as THREE from 'three';
import {planarFace,sectionGeometry} from './geometry-tools.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
const $=s=>document.querySelector(s),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let renderer,controls,resizeObserver,raf,environment;
const stage=$('#stage'),loading=$('#loading');
try{
 renderer=new THREE.WebGLRenderer({antialias:true,logarithmicDepthBuffer:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0xffffff);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;renderer.localClippingEnabled=true;
 let darkBackground=false;
 $('#background').onclick=()=>{darkBackground=!darkBackground;renderer.setClearColor(darkBackground?0x20242a:0xffffff);$('#background').textContent=darkBackground?'◐ Белый фон':'◐ Тёмный фон';$('#background').title=darkBackground?'Сменить тёмный фон на белый':'Сменить белый фон на тёмный';};
 stage.appendChild(renderer.domElement);renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','3D-модель: выберите деталь щелчком');
 const scene=new THREE.Scene();let camera=new THREE.PerspectiveCamera(40,1,.001,1000);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN;
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;scene.environmentIntensity=.65;room.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xffffff,0x697b59,.65));const sun=new THREE.DirectionalLight(0xffffff,1.25);sun.position.set(4,8,5);scene.add(sun);
 const asset=await new GLTFLoader().loadAsync('./models/health-territory-v23.glb'),model=asset.scene;scene.add(model);model.updateMatrixWorld(true);
 const originalBox=new THREE.Box3().setFromObject(model),center=originalBox.getCenter(new THREE.Vector3()),size=originalBox.getSize(new THREE.Vector3()),largest=Math.max(...size.toArray());
 if(!Number.isFinite(largest)||largest<=0)throw Error('Некорректная геометрия');
 const scale=10/largest,mmPerUnit=1000/scale;
 const meshes=[];model.traverse(o=>{if(o.isMesh)meshes.push(o);});
 const edges=[],materials=new Set(),textures=new Set(),edgeMaterial=new THREE.LineBasicMaterial({color:0x354333,transparent:true,opacity:.66,depthWrite:false});
 const items=meshes.map((mesh,id)=>{
  const world=mesh.matrixWorld.clone(),transform=new THREE.Matrix4().makeScale(scale,scale,scale).multiply(new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z)).multiply(world);
  mesh.removeFromParent();mesh.matrixAutoUpdate=true;transform.decompose(mesh.position,mesh.quaternion,mesh.scale);scene.add(mesh);
  // A slope-dependent offset lets rear edges bleed through thin CAD panels.
  // Only a tiny constant depth bias is needed to keep their own edges visible.
  const src=Array.isArray(mesh.material)?mesh.material:[mesh.material];const own=src.map(m=>{const copy=m.clone();copy.polygonOffset=true;copy.polygonOffsetFactor=0;copy.polygonOffsetUnits=1;materials.add(copy);for(const k of ['map','normalMap','specularColorMap','roughnessMap','metalnessMap'])if(copy[k])textures.add(copy[k]);return copy;});mesh.material=Array.isArray(mesh.material)?own:own[0];
  const lines=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,25),edgeMaterial);lines.renderOrder=1;mesh.add(lines);edges.push(lines);mesh.userData.itemId=id;
  mesh.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(mesh),mid=box.getCenter(new THREE.Vector3());
  return {id,mesh,box,center:mid,base:mesh.position.clone(),name:mesh.userData.bodyName||mesh.name||`Деталь ${id+1}`,path:mesh.userData.fusionPath||'Прочие детали',materials:own,emissive:own.map(m=>m.emissive?.clone()),colors:own.map(m=>m.color?.clone()),visible:true};
 });
 scene.remove(model);
 const modelBox=new THREE.Box3();items.forEach(i=>modelBox.union(i.box));const radius=modelBox.getSize(new THREE.Vector3()).length()/2;
 controls.minDistance=.05;controls.maxDistance=radius*20;camera.near=.01;camera.far=radius*30;
 let selected=[],mode='orbit',edgesOn=true,sectionOn=false,explode=0,points=[],measureObjects=[],measurementCenter=null;
 const plane=new THREE.Plane(new THREE.Vector3(1,0,0),0),clipPlanes=[plane];let planeHelper=null,selectionBox=null;
 const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
 const chosenEdges=new Map(),edgeCandidates=[];
 // Join contiguous collinear tessellation segments into one straight edge.
 items.forEach(item=>{
  const attr=edges[item.id].geometry.attributes.position,segments=[];
  for(let j=0;j<attr.count;j+=2)segments.push([new THREE.Vector3().fromBufferAttribute(attr,j),new THREE.Vector3().fromBufferAttribute(attr,j+1)]);
  for(let a=0;a<segments.length;a++){let changed=true;while(changed){changed=false;for(let b=a+1;b<segments.length;b++){
   const x=segments[a],y=segments[b],u=x[1].clone().sub(x[0]).normalize(),v=y[1].clone().sub(y[0]).normalize();if(Math.abs(u.dot(v))<.999999)continue;
   let merged=null;for(let i=0;i<2;i++)for(let k=0;k<2;k++)if(x[i].distanceToSquared(y[k])<1e-12)merged=[x[1-i],y[1-k]];
   if(merged){segments[a]=merged;segments.splice(b,1);changed=true;break;}
  }}}
  segments.forEach((ends,n)=>edgeCandidates.push({key:item.id+':'+n,item,ends}));
 });
 function clearEdges(){for(const e of chosenEdges.values()){e.line.removeFromParent();e.line.geometry.dispose();e.line.material.dispose();}chosenEdges.clear();updateEdgePanel();}
 function updateEdgePanel(){
  $('#edge-selection').hidden=mode!=='edge';let total=0;
  $('#edge-list').innerHTML=[...chosenEdges.values()].map(e=>{total+=e.length;return `<div>${escape(e.item.path.split('+').at(-1))} / ${escape(e.item.name)}<b>${e.length.toLocaleString('ru-RU',{maximumFractionDigits:2})} мм</b></div>`;}).join('');
  $('#edge-total').textContent=`Выбрано: ${chosenEdges.size} · ${total.toLocaleString('ru-RU',{maximumFractionDigits:2})} мм`;
 }
 function chooseEdge(event){
  const rect=renderer.domElement.getBoundingClientRect(),cursor=new THREE.Vector2(event.clientX-rect.left,event.clientY-rect.top);let best=null,bestDistance=9;
  scene.updateMatrixWorld(true);
  for(const e of edgeCandidates){if(!e.item.visible)continue;const a=e.ends[0].clone().applyMatrix4(e.item.mesh.matrixWorld),b=e.ends[1].clone().applyMatrix4(e.item.mesh.matrixWorld),pa=a.clone().project(camera),pb=b.clone().project(camera);if(pa.z< -1||pa.z>1||pb.z< -1||pb.z>1)continue;
   const sa=new THREE.Vector2((pa.x+1)*rect.width/2,(1-pa.y)*rect.height/2),sb=new THREE.Vector2((pb.x+1)*rect.width/2,(1-pb.y)*rect.height/2),delta=sb.clone().sub(sa),t=THREE.MathUtils.clamp(cursor.clone().sub(sa).dot(delta)/Math.max(delta.lengthSq(),1e-12),0,1),screen=sa.clone().addScaledVector(delta,t),distance=screen.distanceTo(cursor);if(distance>=bestDistance)continue;
   const point=a.clone().lerp(b,t);if(sectionOn&&plane.distanceToPoint(point)<0)continue;
   raycaster.setFromCamera(new THREE.Vector2(screen.x/rect.width*2-1,1-screen.y/rect.height*2),camera);
   const front=raycaster.intersectObjects(items.filter(i=>i.visible).map(i=>i.mesh),false).find(h=>!sectionOn||plane.distanceToPoint(h.point)>=0);
   if(front&&front.distance+radius*.0001<raycaster.ray.origin.distanceTo(point))continue;
   best=e;bestDistance=distance;
  }
  if(!best){status('Нажмите ближе к видимому ребру');return;}
  if(chosenEdges.has(best.key)){const old=chosenEdges.get(best.key);old.line.removeFromParent();old.line.geometry.dispose();old.line.material.dispose();chosenEdges.delete(best.key);}
  else{const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(best.ends),new THREE.LineBasicMaterial({color:0x008dff,depthTest:false,transparent:true,opacity:1}));line.renderOrder=20;best.item.mesh.add(line);const length=best.ends[0].clone().applyMatrix4(best.item.mesh.matrixWorld).distanceTo(best.ends[1].clone().applyMatrix4(best.item.mesh.matrixWorld))*mmPerUnit;chosenEdges.set(best.key,{...best,line,length});}
  updateEdgePanel();
 }
 $('#edge-clear').onclick=clearEdges;
 let face=null,faceOverlay=null,customSection=null,dragBody=null,capsDirty=true;
 const caps=new THREE.Group();scene.add(caps);
 const hatchMaps=[];
 for(const color of ['#e9b96e','#87c4d7','#b6ca87','#d99ebd','#a5a3d3','#e1a48b']){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,64,64);ctx.strokeStyle='#344451';ctx.lineWidth=2;for(let x=-64;x<128;x+=16){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+64,64);ctx.stroke();}const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2,2);tex.colorSpace=THREE.SRGBColorSpace;hatchMaps.push(tex);}
 function clearFace(){if(faceOverlay){faceOverlay.removeFromParent();faceOverlay.geometry.dispose();faceOverlay.material.dispose();faceOverlay=null;}face=null;$('#face-selection').hidden=true;}
 function chooseFace(hit){clearFace();if(!hit)return;const geometry=planarFace(hit.object,hit.faceIndex);if(!geometry)return;const item=items[hit.object.userData.itemId];face={...geometry,item};select([]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(geometry.vertices,3));faceOverlay=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0x008dff,transparent:true,opacity:.38,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}));scene.add(faceOverlay);$('#face-selection').hidden=false;$('#face-name').textContent=item.path.split('+').at(-1)+' / '+item.name;$('#face-area').textContent='Площадь: '+(geometry.area*mmPerUnit*mmPerUnit).toLocaleString('ru-RU',{maximumFractionDigits:1})+' мм²';status('Плоская грань выбрана. Нажмите «Сечение от грани».');
 }
 function rebuildCaps(){capsDirty=false;while(caps.children.length){const c=caps.children[0];caps.remove(c);c.geometry.dispose();c.material.dispose();}if(!sectionOn)return;scene.updateMatrixWorld(true);for(const item of items){if(!item.visible)continue;const g=sectionGeometry(item.mesh,plane);if(!g)continue;const m=new THREE.MeshBasicMaterial({map:hatchMaps[item.id%hatchMaps.length],side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});const cap=new THREE.Mesh(g,m);caps.add(cap);}stage.dataset.sectionCaps=String(caps.children.length);}
 $('#face-section').onclick=()=>{if(!face)return;customSection={normal:face.normal.clone(),point:face.point.clone()};$('#section-axis').value='face';$('#section-flip').checked=true;$('#section-offset').value='0';$('#section-toggle').setAttribute('aria-pressed','true');$('#section-panel').hidden=false;clearFace();setMode('orbit');section();};
 $('#face-clear').onclick=clearFace;
 function pointerRay(e){const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);raycaster.setFromCamera(mouse,camera);}
 renderer.domElement.addEventListener('pointerdown',e=>{if(mode!=='move'||e.button!==0)return;controls.enabled=false;e.stopImmediatePropagation();const hit=pick(e);if(!hit){controls.enabled=true;return;}clearFace();clearEdges();clearMeasurement();const item=items[hit.object.userData.itemId];select([item.id]);const dragPlane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),hit.point);dragBody={item,plane:dragPlane,start:hit.point.clone(),base:item.mesh.position.clone(),pointer:e.pointerId};renderer.domElement.setPointerCapture(e.pointerId);},true);
 renderer.domElement.addEventListener('pointermove',e=>{if(!dragBody)return;e.stopImmediatePropagation();pointerRay(e);const p=raycaster.ray.intersectPlane(dragBody.plane,new THREE.Vector3());if(!p)return;dragBody.item.mesh.position.copy(dragBody.base).add(p.sub(dragBody.start));dragBody.item.mesh.updateMatrixWorld(true);capsDirty=true;const d=dragBody.item.mesh.position.clone().sub(dragBody.base).length()*mmPerUnit;status('Перемещение тела: '+d.toFixed(1)+' мм · «Вернуть тела» отменяет перемещения');},true);
 function endBodyDrag(e){if(!dragBody)return;dragBody=null;if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);controls.enabled=true;}
 renderer.domElement.addEventListener('pointerup',endBodyDrag,true);renderer.domElement.addEventListener('pointercancel',endBodyDrag,true);renderer.domElement.addEventListener('lostpointercapture',()=>{dragBody=null;controls.enabled=true;});
 $('#restore-bodies').onclick=()=>{$('#explode-range').value='0';explodeModel();clearFace();capsDirty=true;status('Тела возвращены в исходное положение');};
 const dirs={iso:new THREE.Vector3(1,1,1),front:new THREE.Vector3(0,0,1),back:new THREE.Vector3(0,0,-1),left:new THREE.Vector3(-1,0,0),right:new THREE.Vector3(1,0,0),top:new THREE.Vector3(0,1,.0001),bottom:new THREE.Vector3(0,-1,.0001)};
 function fit(direction=null,onlySelection=false){
  if(direction===dirs.iso&&!camera.isOrthographicCamera){const previous=camera;camera=new THREE.OrthographicCamera(-10,10,10,-10,.01,radius*30);camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);controls.object=camera;}
  const list=onlySelection&&selected.length?selected.map(id=>items[id]).filter(i=>i.visible):items.filter(i=>i.visible);if(!list.length)return;
  const box=new THREE.Box3();list.forEach(i=>box.union(new THREE.Box3().setFromObject(i.mesh)));const c=box.getCenter(new THREE.Vector3()),r=Math.max(.05,box.getSize(new THREE.Vector3()).length()/2);
  const dir=direction?direction.clone():camera.position.clone().sub(controls.target).normalize();const aspect=stage.clientWidth/Math.max(1,stage.clientHeight),fov=camera.fov||40;const angle=Math.min(fov*Math.PI/180,2*Math.atan(Math.tan(fov*Math.PI/360)*aspect));
  if(camera.isOrthographicCamera){const half=r*1.1/Math.min(1,aspect);camera.top=half;camera.bottom=-half;camera.left=-half*aspect;camera.right=half*aspect;camera.zoom=1;camera.updateProjectionMatrix();}
  camera.position.copy(c).addScaledVector(dir.normalize(),r/Math.sin(angle/2)*1.1);controls.target.copy(c);controls.update();
 }
 function status(text){$('#status').textContent=text;}
 function updateSelectionBox(){if(selectionBox){scene.remove(selectionBox);selectionBox.geometry.dispose();selectionBox.material.dispose();selectionBox=null;}}
 function select(ids){
  for(const id of selected){const item=items[id];item.materials.forEach((m,j)=>{if(m.emissive&&item.emissive[j])m.emissive.copy(item.emissive[j]);if(m.color&&item.colors[j])m.color.copy(item.colors[j]);});}
  selected=ids;for(const id of selected){const item=items[id];item.materials.forEach((m,j)=>{if(m.color&&item.colors[j])m.color.copy(item.colors[j]).multiplyScalar(.70);if(m.emissive&&item.emissive[j])m.emissive.copy(item.emissive[j]).multiplyScalar(.70);});}
  $('#selection').hidden=!ids.length;
  if(ids.length){const first=items[ids[0]],b=new THREE.Box3();ids.forEach(id=>b.union(items[id].box));const d=b.getSize(new THREE.Vector3()).multiplyScalar(mmPerUnit);$('#selected-title').textContent=ids.length===1?first.name:`Выбрано тел: ${ids.length}`;$('#selected-path').textContent=first.path.split('+').join(' / ');$('#selected-size').textContent=`Габариты X × Y × Z: ${d.toArray().map(v=>v.toLocaleString('ru-RU',{maximumFractionDigits:1})).join(' × ')} мм`;status('F — приблизить · H — скрыть · I — изолировать · Esc — снять выделение');}
  updateSelectionBox();syncTree();
 }
 function setVisible(ids,visible){capsDirty=true;clearFace();ids.forEach(id=>{items[id].visible=visible;items[id].mesh.visible=visible;});select(selected.filter(id=>items[id].visible));syncTree();}
 function showAll(){capsDirty=true;items.forEach(i=>{i.visible=true;i.mesh.visible=true;});syncTree();status('Все детали показаны');}
 function isolate(){capsDirty=true;clearFace();if(!selected.length)return;const s=new Set(selected);items.forEach(i=>{i.visible=s.has(i.id);i.mesh.visible=i.visible;});syncTree();fit(null,true);status('Изоляция включена. «Показать всё» возвращает сборку.');}
 const treeRoot={name:'Территория здоровья',children:new Map(),ids:[]};
 for(const item of items){let n=treeRoot;n.ids.push(item.id);for(const name of item.path.split('+')){if(!n.children.has(name))n.children.set(name,{name,children:new Map(),ids:[]});n=n.children.get(name);n.ids.push(item.id);}if(!n.bodies)n.bodies=[];n.bodies.push(item);}
 const groups=[];function treeHTML(n,root=false){const groupId=groups.push(n)-1;return `<details ${root?'open':''}><summary><input type="checkbox" checked data-group-eye="${groupId}" aria-label="Показать ${escape(n.name)}"><button class="group-select" data-group="${groupId}" title="${escape(n.name)}">${escape(n.name)} <small>(${n.ids.length})</small></button></summary>${[...n.children.values()].map(c=>treeHTML(c)).join('')}${(n.bodies||[]).map(i=>`<div class="tree-row" data-row="${i.id}"><input type="checkbox" checked data-eye="${i.id}" aria-label="Показать ${escape(i.name)}"><button data-item="${i.id}" title="${escape(i.path+' / '+i.name)}">${escape(i.name)}</button></div>`).join('')}</details>`;}
 $('#tree').innerHTML=treeHTML(treeRoot,true);
 function syncTree(){for(const row of document.querySelectorAll('[data-row]')){const i=items[Number(row.dataset.row)];row.classList.toggle('selected',selected.includes(i.id));row.classList.toggle('off',!i.visible);row.querySelector('input').checked=i.visible;}for(const box of document.querySelectorAll('[data-group-eye]')){const n=groups[Number(box.dataset.groupEye)],visible=n.ids.filter(id=>items[id].visible).length;box.checked=visible===n.ids.length;box.indeterminate=visible>0&&visible<n.ids.length;}}
 $('#tree').addEventListener('click',e=>{const b=e.target.closest('[data-item],[data-group]');if(!b)return;e.preventDefault();clearEdges();clearMeasurement();select(b.dataset.item!==undefined?[Number(b.dataset.item)]:groups[Number(b.dataset.group)].ids);isolate();updateSelectionBox();});
 $('#tree').addEventListener('change',e=>{const b=e.target;if(b.dataset.eye!==undefined)setVisible([Number(b.dataset.eye)],b.checked);if(b.dataset.groupEye!==undefined)setVisible(groups[Number(b.dataset.groupEye)].ids,b.checked);});
 $('#tree-search').oninput=()=>{const q=$('#tree-search').value.toLocaleLowerCase('ru');document.querySelectorAll('[data-row]').forEach(row=>{const i=items[Number(row.dataset.row)];row.hidden=!!q&&!`${i.path} ${i.name}`.toLocaleLowerCase('ru').includes(q);});for(const d of [...$('#tree').querySelectorAll('details')].reverse()){d.hidden=!!q&&![...d.querySelectorAll('[data-row]')].some(r=>!r.hidden);if(q)d.open=true;} };
 function toggleTree(){const open=$('#tree-panel').hidden;$('#tree-panel').hidden=!open;$('#tree-toggle').setAttribute('aria-pressed',String(open));}
 $('#tree-toggle').onclick=toggleTree;$('#tree-close').onclick=toggleTree;
 function clearMeasurement(){for(const o of measureObjects){scene.remove(o);o.geometry?.dispose();o.material?.dispose();}measureObjects=[];points=[];measurementCenter=null;$('#measure-label').hidden=true;$('#measure-value').textContent='Выберите первую точку';}
 function setMode(value){mode=value;controls.enabled=true;if(value!=='face')clearFace();if(value!=='edge')clearEdges();else select([]);updateEdgePanel();controls.mouseButtons.LEFT=value==='pan'?THREE.MOUSE.PAN:value==='zoom'?THREE.MOUSE.DOLLY:THREE.MOUSE.ROTATE;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===value));$('#measure-panel').hidden=value!=='measure';if(value!=='measure')clearMeasurement();status(value==='move'?'Зажмите левую кнопку на теле и перетащите его в плоскости экрана':value==='face'?'Щёлкните плоскую грань тела для выбора плоскости сечения':value==='edge'?'Щёлкайте рёбра для добавления к сумме · Повторный щелчок снимает выделение':value==='measure'?'Укажите две точки на поверхности модели':value==='pan'?'Перетаскивайте модель левой кнопкой для перемещения':value==='zoom'?'Перетаскивайте мышь для изменения масштаба':'Щелчок — выделение · Левая кнопка — вращение · Средняя — сдвиг · Колёсико — масштаб');}
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
 function pick(event){const r=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(mouse,camera);return raycaster.intersectObjects(items.filter(i=>i.visible).map(i=>i.mesh),false).find(h=>!sectionOn||plane.distanceToPoint(h.point)>=-.00001);}
 function snapPoint(hit,event){if(!$('#snap').checked)return hit.point.clone();const rect=renderer.domElement.getBoundingClientRect(),attr=hit.object.geometry.attributes.position;let best=hit.point.clone(),distance=10;for(const index of [hit.face.a,hit.face.b,hit.face.c]){const v=new THREE.Vector3().fromBufferAttribute(attr,index).applyMatrix4(hit.object.matrixWorld);if(sectionOn&&plane.distanceToPoint(v)<0)continue;const p=v.clone().project(camera),px=rect.left+(p.x+1)*rect.width/2,py=rect.top+(1-p.y)*rect.height/2;const d=Math.hypot(px-event.clientX,py-event.clientY);if(d<distance){distance=d;best=v;}}return best;}
 function addPoint(p){if(points.length===2)clearMeasurement();points.push(p);const marker=new THREE.Mesh(new THREE.SphereGeometry(radius*.007,12,8),new THREE.MeshBasicMaterial({color:0x267aac,depthTest:false}));marker.position.copy(p);marker.renderOrder=10;scene.add(marker);measureObjects.push(marker);if(points.length===1){$('#measure-value').textContent='Выберите вторую точку';return;}const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x267aac,depthTest:false}));line.renderOrder=10;scene.add(line);measureObjects.push(line);const delta=points[1].clone().sub(points[0]).multiplyScalar(mmPerUnit),distance=delta.length();const text=distance.toLocaleString('ru-RU',{maximumFractionDigits:2})+' мм';$('#measure-value').textContent=text+` · ΔX ${Math.abs(delta.x).toFixed(1)} · ΔY ${Math.abs(delta.y).toFixed(1)} · ΔZ ${Math.abs(delta.z).toFixed(1)}`;$('#measure-label').textContent=text;$('#measure-label').hidden=false;measurementCenter=points[0].clone().add(points[1]).multiplyScalar(.5);}
 let pointerDown=null;renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)pointerDown={x:e.clientX,y:e.clientY};});renderer.domElement.addEventListener('pointerup',e=>{if(mode==='move'){pointerDown=null;return;}if(e.button!==0||!pointerDown)return;const moved=Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y);pointerDown=null;if(moved>5)return;if(mode==='edge'){chooseEdge(e);return;}const hit=pick(e);if(mode==='face'){chooseFace(hit);return;}if(mode==='measure'){if(hit)addPoint(snapPoint(hit,e));}else if(mode==='orbit')select(hit?[hit.object.userData.itemId]:[]);});renderer.domElement.addEventListener('dblclick',e=>{if(mode==='measure'||mode==='edge'||mode==='face'||mode==='move')return;const hit=pick(e);if(hit){select([hit.object.userData.itemId]);fit(null,true);}});
 $('#measure-clear').onclick=clearMeasurement;
 function section(){clearEdges();sectionOn=$('#section-toggle').getAttribute('aria-pressed')==='true';let axis=$('#section-axis').value;const flip=$('#section-flip').checked?-1:1;
 if(axis==='face'&&!customSection){axis='x';$('#section-axis').value='x';status('Сначала выберите грань в режиме «Плоскости».');}
 const fromFace=axis==='face';$('#section-position').hidden=fromFace;$('#section-offset-label').hidden=!fromFace;
 if(fromFace){const offset=Number($('#section-offset').value)||0;plane.normal.copy(customSection.normal).multiplyScalar(flip);plane.constant=-plane.normal.dot(customSection.point.clone().addScaledVector(customSection.normal,offset/mmPerUnit));$('#section-value').textContent=offset+' мм от грани';}
 else{const index={x:0,y:1,z:2}[axis],value=Number($('#section-position').value)/100;const location=THREE.MathUtils.lerp(modelBox.min.getComponent(index),modelBox.max.getComponent(index),value);plane.normal.set(0,0,0).setComponent(index,flip);plane.constant=-location*flip;$('#section-value').textContent=Math.round(value*100)+'%';}
 materials.forEach(m=>{const next=sectionOn?clipPlanes:null;if(m.clippingPlanes!==next){m.clippingPlanes=next;m.needsUpdate=true;}});const nextClip=sectionOn?clipPlanes:null;if(edgeMaterial.clippingPlanes!==nextClip){edgeMaterial.clippingPlanes=nextClip;edgeMaterial.needsUpdate=true;}capsDirty=true;clearMeasurement();
 }
 $('#section-toggle').onclick=()=>{const on=$('#section-toggle').getAttribute('aria-pressed')!=='true';$('#section-toggle').setAttribute('aria-pressed',String(on));$('#section-panel').hidden=!on;if(on){setMode('orbit');controls.enabled=true;controls.enableRotate=true;$('#help-panel').hidden=true;}section();};['section-axis','section-position','section-flip','section-offset'].forEach(id=>$('#'+id).oninput=section);
 const componentCenters=new Map();for(const i of items){const key=i.path;if(!componentCenters.has(key))componentCenters.set(key,new THREE.Box3());componentCenters.get(key).union(i.box);}for(const [key,b] of componentCenters)componentCenters.set(key,b.getCenter(new THREE.Vector3()));
 function explodeModel(){capsDirty=true;clearFace();explode=Number($('#explode-range').value)/100;for(const i of items){const direction=componentCenters.get(i.path).clone().sub(modelBox.getCenter(new THREE.Vector3()));i.mesh.position.copy(i.base).addScaledVector(direction,explode*1.4);}scene.updateMatrixWorld(true);$('#explode-value').textContent=Math.round(explode*100)+'%';updateSelectionBox();clearMeasurement();}
 $('#explode-toggle').onclick=()=>{const open=$('#explode-panel').hidden;$('#explode-panel').hidden=!open;$('#explode-toggle').setAttribute('aria-pressed',String(open));if(!open){$('#explode-range').value='0';explodeModel();}};$('#explode-range').oninput=explodeModel;
 $('#edges').onclick=()=>{edgesOn=!edgesOn;edges.forEach(e=>e.visible=edgesOn);$('#edges').setAttribute('aria-pressed',String(edgesOn));};
 $('#hide').onclick=()=>setVisible(selected,false);$('#isolate').onclick=isolate;$('#show-all').onclick=showAll;$('#fit-selected').onclick=()=>fit(null,true);$('#home').onclick=()=>fit(dirs.iso);$('#fit').onclick=()=>fit(null,selected.length>0);
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>fit(dirs[b.dataset.view]));
 $('#reset').onclick=()=>{customSection=null;$('#section-axis').value='x';$('#section-flip').checked=false;showAll();select([]);$('#explode-range').value='0';explodeModel();$('#section-toggle').setAttribute('aria-pressed','false');$('#section-panel').hidden=true;section();$('#explode-panel').hidden=true;$('#explode-toggle').setAttribute('aria-pressed','false');setMode('orbit');fit(dirs.iso);};
 $('#help').onclick=()=>$('#help-panel').hidden=!$('#help-panel').hidden;$('#help-close').onclick=()=>$('#help-panel').hidden=true;
 $('#snapshot').onclick=()=>{renderer.render(scene,camera);const a=document.createElement('a');a.href=renderer.domElement.toDataURL('image/png');a.download='Территория здоровья — 3D.png';a.click();};
 function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);if(camera.isOrthographicCamera){camera.left=-camera.top*w/Math.max(1,h);camera.right=-camera.left;}else camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();}resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);resize();fit(dirs.iso);
 document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key.toLowerCase()==='f'){e.preventDefault();fit(null,selected.length>0);}if(e.key.toLowerCase()==='h'&&selected.length)setVisible(selected,false);if(e.key.toLowerCase()==='i')isolate();if(e.key==='Escape'){select([]);setMode('orbit');$('#help-panel').hidden=true;}});
 document.querySelectorAll('button').forEach(b=>b.disabled=false);loading.hidden=true;$('#info').textContent=`${items.length} тел · мм`;stage.dataset.meshes=String(items.length);stage.dataset.textures=String(textures.size);stage.dataset.ready='true';setMode('orbit');
 function tick(){raf=requestAnimationFrame(tick);controls.update();if(capsDirty)rebuildCaps();if(measurementCenter){const p=measurementCenter.clone().project(camera);$('#measure-label').style.left=(p.x+1)*stage.clientWidth/2+'px';$('#measure-label').style.top=(1-p.y)*stage.clientHeight/2+'px';$('#measure-label').hidden=p.z>1||p.z< -1;}renderer.render(scene,camera);}tick();
 addEventListener('pagehide',()=>{cancelAnimationFrame(raf);resizeObserver.disconnect();controls.dispose();clearFace();sectionOn=false;rebuildCaps();hatchMaps.forEach(t=>t.dispose());clearEdges();clearMeasurement();items.forEach(i=>i.mesh.geometry.dispose());edges.forEach(e=>e.geometry.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());edgeMaterial.dispose();environment.dispose();renderer.dispose();},{once:true});
}catch(error){console.error(error);loading.textContent='Не удалось открыть модель: '+error.message;loading.classList.add('error');}
$('#full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('#status').textContent='Откройте просмотрщик в отдельной вкладке для полноэкранного режима.';}};
document.addEventListener('fullscreenchange',()=>{$('#full').textContent=document.fullscreenElement?'⛶ Свернуть':'⛶ На весь экран';});
