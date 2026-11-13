import * as THREE from 'three';
import {fetchModelBytes} from './model-transport.js?v=1';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadCatalogue,projectModel,permittedModel,assetUrl,SITE_ROOT} from './site-config.js?v=performance-1';
import {viewerLink,copyViewerLink} from './viewer-share.js?v=performance-1';
import {planarFace} from './geometry-tools.js?v=sheet-layout-1';
import {bannerGeometry,rectangleGeometry,isNamedBanner,applyTexturePlacement} from './banner-geometry.js?v=texture-placement-1';

const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./banner-viewer.css?v=1',import.meta.url);document.head.append(css);
// This mode has a dedicated workspace, without changing the normal CAD tools.
document.querySelectorAll('link[rel=stylesheet]').forEach(link=>{if(link!==css)link.remove();});
document.body.innerHTML=`<main class="banner-app"><header class="banner-header"><div><h1>Баннеры 3D</h1><small id="banner-project">Загрузка проекта…</small></div><div class="banner-actions"><button id="banner-share" aria-label="Скопировать ссылку на Баннеры 3D" title="Скопировать ссылку">Ссылка</button><button id="banner-full" aria-label="На весь экран">⛶</button><button id="banner-close" aria-label="Закрыть Баннеры 3D">✕</button></div></header><div class="banner-workspace"><aside class="banner-sidebar"><h2>Поверхности баннеров</h2><p>Нажмите плоскую поверхность стенда, чтобы добавить её в болванку. Перетаскивание вращает вид.</p><label><input type="checkbox" id="banner-context" checked> Показать конструкцию стенда</label><div id="banner-list" class="banner-list"></div><section id="banner-editor" hidden><label>Название<input type="text" id="banner-name" maxlength="120"></label><p id="banner-size"></p><label><input id="banner-rectangle" type="checkbox"> Прямоугольная болванка</label><div id="banner-dimensions" hidden><label>Ширина, мм<input id="banner-width" type="number" min="1" max="100000" step="1"></label><label>Высота, мм<input id="banner-height" type="number" min="1" max="100000" step="1"></label><label>Сдвиг вправо, мм<input id="banner-offset-u" type="number" min="-100000" max="100000" step="1"></label><label>Сдвиг вверх, мм<input id="banner-offset-v" type="number" min="-100000" max="100000" step="1"></label><button id="banner-apply-size">Применить размеры</button></div><label class="banner-file-label">Текстура JPG / PNG<input id="banner-image" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png"></label><label>Поворот текстуры<select id="banner-rotation"><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label><label><input id="banner-mirror" type="checkbox"> Отразить по горизонтали</label><div class="banner-controls"><button id="banner-clear-image">Убрать текстуру</button><button id="banner-remove">Удалить поверхность из схемы</button></div></section><p class="banner-warning">Это визуальная болванка для размещения графики. Размеры поверхностей взяты из модели; печатные припуски не добавляются.</p><div class="banner-controls"><button id="banner-published" hidden>Открыть опубликованную схему</button><button id="banner-save" class="primary">Сохранить на устройстве</button><button id="banner-export">Скачать схему с текстурами</button><button id="banner-glb">Скачать болванку GLB</button></div><details><summary>Загрузить сохранённую схему</summary><input id="banner-import" type="file" accept=".json,application/json"><p>Изменения видны только на этом устройстве. Для общего доступа передайте скачанную схему владельцу каталога для публикации.</p></details></aside><section class="banner-view" aria-label="Баннеры 3D"><div class="banner-busy" id="banner-loading" role="status">Загружаем текущую модель…</div><div class="banner-view-tools"><button id="banner-fit">Уместить</button><button id="banner-only">Болванка</button><button id="banner-shot">Снимок</button></div></section></div><footer class="banner-status" id="banner-status" role="status">Подготовка модели…</footer></main>`;
const $=id=>document.getElementById(id),view=document.querySelector('.banner-view');
const message=text=>{$('banner-status').textContent=text;};
const query=new URLSearchParams(location.search);let project;
$('banner-close').onclick=()=>{if(parent!==window)parent.postMessage({type:'forma-close-viewer'},location.origin);else location.href=new URL('./',document.baseURI);};
$('banner-full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{message('Полный экран недоступен в этом браузере.');}};
try{
 const catalogue=await loadCatalogue();project=projectModel(catalogue.projects.find(p=>p.id===(window.FORMA_PROJECT?.id||query.get('project'))),query.get('item')||window.FORMA_PROJECT?.itemId);
 if(!project||!permittedModel(project.modelUrl))throw Error('Модель проекта не найдена');
 $('banner-project').textContent=project.title;document.title=project.title+' — Баннеры 3D';
 $('banner-share').onclick=async()=>{const url=new URL(viewerLink(project));url.searchParams.set('view','banners');if(await copyViewerLink(url.href))message('Ссылка на Баннеры 3D скопирована. Локальные текстуры не публикуются автоматически.');};
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0xffffff);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
 renderer.domElement.setAttribute('aria-label','Выберите плоскую поверхность для баннера');view.prepend(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.01,5000),controls=new OrbitControls(camera,renderer.domElement);controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN;controls.enableDamping=false;
 scene.add(new THREE.AmbientLight(0xffffff,2));const sun=new THREE.DirectionalLight(0xffffff,1);sun.position.set(4,8,5);scene.add(sun);
 let dirty=true;const invalidate=()=>{dirty=true;};controls.addEventListener('change',invalidate);
 const loader=new GLTFLoader(),compressed=await fetchModelBytes(project.modelGzipUrl);view.dataset.modelTransport=compressed?'gzip':'original';
 const asset=compressed?await loader.parseAsync(compressed,new URL('.',project.modelUrl).href):await loader.loadAsync(project.modelUrl),model=asset.scene;
 model.traverse(object=>{const node=asset.parser.associations.get(object)?.nodes;if(node!==undefined)Object.assign(object.userData,asset.parser.json.nodes[node]?.extras||{});});
 model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),largest=Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
 if(!Number.isFinite(largest)||largest<=0)throw Error('Пустая модель');
 const scale=10/largest,mmPerUnit=1000/scale,root=new THREE.Group();root.scale.setScalar(scale);root.position.copy(center).multiplyScalar(-scale);root.add(model);scene.add(root);root.updateMatrixWorld(true);
 const meshes=[],surfaces=[],surfaceGroup=new THREE.Group();scene.add(surfaceGroup);
 const neutral=new THREE.MeshLambertMaterial({color:0xdce1df,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:2});
 const metadata=(object,key)=>{for(let o=object;o;o=o.parent)if(o.userData?.[key])return o.userData[key];return '';};
 model.traverse(o=>{if(o.isMesh){o.userData.bannerIndex=meshes.length;o.userData.bannerName=metadata(o,'bodyName')||o.name||'Поверхность';o.material=neutral;meshes.push(o);}});
 let selected=null,nextNumber=1,nextPrimitive=-1;const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
 function fit(){const box=new THREE.Box3().setFromObject(surfaces.length&&!$('banner-context').checked?surfaceGroup:root);if(box.isEmpty())return;const r=box.getSize(new THREE.Vector3()).length()/2,c=box.getCenter(new THREE.Vector3());const a=Math.min(camera.fov*Math.PI/180,2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));camera.position.copy(c).addScaledVector(new THREE.Vector3(1,.7,1).normalize(),r/Math.sin(a/2)*1.12);controls.target.copy(c);controls.update();invalidate();}
 const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function refresh(){
  $('banner-list').innerHTML=surfaces.length?surfaces.map(s=>`<button data-banner="${s.key}" aria-pressed="${s===selected}">${escape(s.name)}<small>${Math.ceil(s.width*mmPerUnit-1e-3)} × ${Math.ceil(s.height*mmPerUnit-1e-3)} мм${s.image?' · текстура':''}</small></button>`).join(''):'<p class="banner-empty">Выберите поверхности баннеров на модели. Затем нажмите «Болванка», чтобы оставить только их.</p>';
  document.querySelectorAll('[data-banner]').forEach(b=>b.onclick=()=>choose(surfaces.find(s=>s.key===b.dataset.banner)));
  $('banner-editor').hidden=!selected;$('banner-only').disabled=!surfaces.length;$('banner-glb').disabled=!surfaces.length;
  if(selected){$('banner-name').value=selected.name;$('banner-size').textContent=`Габарит поверхности: ${Math.ceil(selected.width*mmPerUnit-1e-3)} × ${Math.ceil(selected.height*mmPerUnit-1e-3)} мм`;$('banner-rotation').value=String(selected.rotation);$('banner-mirror').checked=selected.mirror;
   $('banner-rectangle').checked=!!selected.rectangle;$('banner-dimensions').hidden=!selected.rectangle;
   $('banner-width').value=Math.ceil(selected.width*mmPerUnit-1e-3);$('banner-height').value=Math.ceil(selected.height*mmPerUnit-1e-3);
   $('banner-offset-u').value=selected.rectangle?.offsetU||0;$('banner-offset-v').value=selected.rectangle?.offsetV||0;}
  for(const s of surfaces){s.mesh.material.color.set(s.image?0xffffff:s.fillColor|| (s===selected?0x3587e2:0x89bdf1));s.mesh.material.emissive?.set(s===selected?0x122d4a:0x000000);s.outline.material.color.set(s===selected?0x075ebf:0x226ea7);}
  view.dataset.bannerCount=String(surfaces.length);invalidate();
 }
 function choose(s){selected=s;refresh();}
 function addSurface(mesh,faceIndex,record={}){
  mesh.updateMatrixWorld(true);const face=planarFace(mesh,faceIndex);if(!face||face.area<1e-8)throw Error('Выберите плоскую грань детали');
  const key=mesh.userData.bannerIndex+':'+face.surfaceId,existing=surfaces.find(s=>s.key===key);if(existing){choose(existing);return existing;}
  const data=bannerGeometry(face),material=new THREE.MeshBasicMaterial({color:0x89bdf1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const patch=new THREE.Mesh(data.geometry,material);patch.position.copy(face.normal).multiplyScalar(.0004);patch.renderOrder=2;
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(data.geometry),new THREE.LineBasicMaterial({color:0x226ea7}));patch.add(outline);surfaceGroup.add(patch);
  const s={key,index:mesh.userData.bannerIndex,sourceMesh:mesh,worldVertices:record.worldVertices||null,faceIndex:face.surfaceId,name:String(record.name||`Б-${nextNumber++} · ${mesh.userData.bannerName}`).slice(0,120),mesh:patch,outline,...data,image:null,fillColor:/^#[0-9a-f]{6}$/i.test(record.fillColor)?record.fillColor:null,texturePlacement:record.texturePlacement||null,rotation:[0,90,180,270].includes(record.rotation)?record.rotation:0,mirror:record.mirror===true,rectangle:null};if(record.rectangle)resizeSurface(s,record.rectangle);applyTexturePlacement(s.geometry,s.width*mmPerUnit,s.height*mmPerUnit,s.texturePlacement);patch.userData.surface=s;surfaces.push(s);const code=/^Б-(\d+)(?:\D|$)/.exec(s.name);if(code)nextNumber=Math.max(nextNumber,Number(code[1])+1);choose(s);return s;
 }
 function addPrimitive(record){
  if(!Array.isArray(record.worldVertices)||record.worldVertices.length<9||record.worldVertices.length>30000||record.worldVertices.length%9||!record.worldVertices.every(n=>Number.isFinite(n)&&Math.abs(n)<10000))throw Error('Некорректная плоскость болванки');
  const positions=[];for(let i=0;i<record.worldVertices.length;i+=3)positions.push(...new THREE.Vector3(...record.worldVertices.slice(i,i+3)).sub(center).multiplyScalar(scale).toArray());
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
  const source=new THREE.Mesh(geometry,neutral);source.userData.bannerIndex=nextPrimitive--;source.userData.bannerName='Плоскость болванки';source.updateMatrixWorld(true);
  return addSurface(source,0,record);
 }
 function resizeSurface(s,rectangle){
  const values=['width','height','offsetU','offsetV'].map(k=>Number(rectangle[k]||0));
  if(!values.every(Number.isFinite)||values[0]<1||values[1]<1||values.some(v=>Math.abs(v)>100000))throw Error('Размеры должны быть от 1 до 100 000 мм');
  const [width,height,offsetU,offsetV]=values,geometry=rectangleGeometry(s.frame,width/mmPerUnit,height/mmPerUnit,offsetU/mmPerUnit,offsetV/mmPerUnit);
  s.geometry.dispose();s.geometry=geometry;s.mesh.geometry=geometry;s.outline.geometry.dispose();s.outline.geometry=new THREE.EdgesGeometry(geometry);s.width=width/mmPerUnit;s.height=height/mmPerUnit;s.rectangle={width,height,offsetU,offsetV};applyTexturePlacement(s.geometry,s.width*mmPerUnit,s.height*mmPerUnit,s.texturePlacement);
 }
 $('banner-rectangle').onchange=()=>{
  if(!selected)return;
  if($('banner-rectangle').checked){resizeSurface(selected,{width:Math.ceil(selected.width*mmPerUnit-1e-3),height:Math.ceil(selected.height*mmPerUnit-1e-3),offsetU:0,offsetV:0});}
  else{const face=planarFace(selected.sourceMesh,selected.faceIndex),data=bannerGeometry(face);selected.geometry.dispose();selected.geometry=data.geometry;selected.mesh.geometry=data.geometry;selected.width=data.width;selected.height=data.height;selected.rectangle=null;selected.outline.geometry.dispose();selected.outline.geometry=new THREE.EdgesGeometry(data.geometry);applyTexturePlacement(selected.geometry,selected.width*mmPerUnit,selected.height*mmPerUnit,selected.texturePlacement);}
  refresh();
 };
 $('banner-apply-size').onclick=()=>{if(!selected)return;try{resizeSurface(selected,{width:Number($('banner-width').value),height:Number($('banner-height').value),offsetU:Number($('banner-offset-u').value),offsetV:Number($('banner-offset-v').value)});refresh();message('Размеры болванки обновлены.');}catch(e){message(e.message);}};
 function textureTransform(s){const map=s.mesh.material.map;if(map){map.center.set(.5,.5);map.rotation=s.rotation*Math.PI/180;map.repeat.set(s.mirror?-1:1,1);map.needsUpdate=true;}invalidate();}
 async function applyImage(s,url){const map=await new THREE.TextureLoader().loadAsync(url);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());s.mesh.material.map?.dispose();s.mesh.material.map=map;s.mesh.material.needsUpdate=true;s.image=url;textureTransform(s);refresh();}
 let down=null;
 renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)down={x:e.clientX,y:e.clientY};});
 renderer.domElement.addEventListener('pointerup',e=>{
  if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6){down=null;return;}down=null;
  const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);
  const hits=ray.intersectObjects([...surfaces.map(s=>s.mesh),...($('banner-context').checked?meshes:[])],false),hit=hits[0];if(!hit)return;
  if(hit.object.userData.surface){choose(hit.object.userData.surface);return;}
  try{addSurface(hit.object,hit.faceIndex);message('Поверхность добавлена. Теперь можно наложить текстуру JPG / PNG.');}catch(e){message(e.message);}
 });
 renderer.domElement.addEventListener('pointercancel',()=>{down=null;});
 $('banner-context').onchange=()=>{root.visible=$('banner-context').checked;invalidate();};
 $('banner-only').onclick=()=>{$('banner-context').checked=false;root.visible=false;fit();};
 $('banner-fit').onclick=fit;
 $('banner-name').onchange=()=>{if(selected){selected.name=$('banner-name').value;refresh();}};
 $('banner-rotation').onchange=()=>{if(selected){selected.rotation=Number($('banner-rotation').value);textureTransform(selected);}};
 $('banner-mirror').onchange=()=>{if(selected){selected.mirror=$('banner-mirror').checked;textureTransform(selected);}};
 $('banner-image').onchange=async()=>{const file=$('banner-image').files[0],s=selected;if(!file||!s)return;try{if(!['image/jpeg','image/png'].includes(file.type)||file.size>20*1024*1024)throw Error('Выберите JPG или PNG до 20 МБ');const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});s.texturePlacement=null;applyTexturePlacement(s.geometry,s.width*mmPerUnit,s.height*mmPerUnit,null);await applyImage(s,url);message('Текстура нанесена. Сохраните схему на устройстве или скачайте её.');}catch(e){message(e.message||'Не удалось открыть изображение');}finally{$('banner-image').value='';}};
 $('banner-clear-image').onclick=()=>{if(!selected)return;selected.mesh.material.map?.dispose();selected.mesh.material.map=null;selected.mesh.material.needsUpdate=true;selected.image=null;refresh();};
 function remove(s){if(s.worldVertices)s.sourceMesh.geometry.dispose();s.mesh.removeFromParent();s.geometry.dispose();s.mesh.material.map?.dispose();s.mesh.material.dispose();s.outline.geometry.dispose();s.outline.material.dispose();surfaces.splice(surfaces.indexOf(s),1);}
 $('banner-remove').onclick=()=>{if(selected)remove(selected);choose(surfaces.at(-1)||null);};
 const packet=()=>({format:'forma-banners-v1',projectId:project.id,itemId:project.itemId||null,modelUrl:new URL(project.modelUrl).pathname.slice(SITE_ROOT.pathname.length),surfaces:surfaces.map(({index,faceIndex,name,image,rotation,mirror,rectangle,worldVertices,texturePlacement,fillColor})=>({index,faceIndex,name,image,rotation,mirror,rectangle,worldVertices,texturePlacement,fillColor}))});
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('forma-banner-layouts',1);request.onupgradeneeded=()=>request.result.createObjectStore('layouts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 const storageKey=project.id+':'+(project.itemId||'');
 async function restore(data){
  if(data?.format!=='forma-banners-v1'||data.projectId!==project.id||(data.itemId||null)!==(project.itemId||null)||assetUrl(data.modelUrl)!==project.modelUrl)throw Error('Схема относится к другой модели или её версии. Поверхности нужно выбрать заново.');
  if(!Array.isArray(data.surfaces)||data.surfaces.length>500)throw Error('Некорректная схема');
  for(const s of data.surfaces){if(!s.worldVertices&&(!Number.isInteger(s.index)||!meshes[s.index]||!Number.isInteger(s.faceIndex)||s.faceIndex<0||!planarFace(meshes[s.index],s.faceIndex)))throw Error('Поверхность схемы не найдена');if(s.imageUrl)assetUrl(s.imageUrl);if(s.image&&(!/^data:image\/(png|jpeg);base64,/.test(s.image)||s.image.length>30*1024*1024))throw Error('Некорректная текстура');}
  surfaces.slice().forEach(remove);selected=null;
  for(const record of data.surfaces){const s=record.worldVertices?addPrimitive(record):addSurface(meshes[record.index],record.faceIndex,record);if(record.image)await applyImage(s,record.image);
   else if(record.imageUrl){const response=await fetch(assetUrl(record.imageUrl));if(!response.ok)throw Error('Не удалось загрузить текстуру');const blob=await response.blob();const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});await applyImage(s,data);}}refresh();
 }
 $('banner-save').onclick=async()=>{try{await new Promise((resolve,reject)=>{const tx=db.transaction('layouts','readwrite');tx.objectStore('layouts').put(packet(),storageKey);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});message('Схема и текстуры сохранены на этом устройстве.');}catch{message('Не удалось сохранить. Скачайте схему с текстурами в файл.');}};
 const download=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
 $('banner-glb').onclick=async()=>{
  const button=$('banner-glb');button.disabled=true;const output=new THREE.Group();
  try{for(const s of surfaces){const geometry=s.geometry.clone();geometry.scale(1/scale,1/scale,1/scale);geometry.translate(center.x,center.y,center.z);const material=new THREE.MeshStandardMaterial({color:s.fillColor||0xffffff,map:s.mesh.material.map,side:THREE.DoubleSide,roughness:1,metalness:0});const mesh=new THREE.Mesh(geometry,material);mesh.name=s.name;output.add(mesh);}
   const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');const bytes=await new GLTFExporter().parseAsync(output,{binary:true});download(new Blob([bytes],{type:'model/gltf-binary'}),project.title+' — Баннеры 3D.glb');message('Болванка GLB подготовлена: только плоскости баннеров, масштаб в метрах, текстуры встроены.');
  }catch(e){message('Не удалось экспортировать GLB: '+e.message);}finally{output.children.forEach(m=>{m.geometry.dispose();m.material.dispose();});button.disabled=!surfaces.length;}
 };
 $('banner-export').onclick=()=>download(new Blob([JSON.stringify(packet())],{type:'application/json'}),project.title+' — Баннеры 3D.json');
 $('banner-import').onchange=async()=>{try{const file=$('banner-import').files[0];if(!file)return;if(file.size>100*1024*1024)throw Error('Файл больше 100 МБ');await restore(JSON.parse(await file.text()));message('Схема загружена. Для сохранения на устройстве нажмите «Сохранить».');}catch(e){message(e.message);}finally{$('banner-import').value='';}};
 $('banner-shot').onclick=()=>{renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(blob)download(blob,project.title+' — Баннеры 3D.png');});};
 let saved;try{saved=await new Promise((resolve,reject)=>{const r=db.transaction('layouts').objectStore('layouts').get(storageKey);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(saved){await restore(saved);message('Восстановлена схема с текстурами, сохранённая на этом устройстве.');}}catch(e){saved=null;message(e.message);}
 $('banner-published').hidden=!project.bannerLayoutUrl;
 $('banner-published').onclick=async()=>{try{const r=await fetch(assetUrl(project.bannerLayoutUrl),{cache:'no-store'});if(!r.ok)throw Error('Не удалось загрузить схему');await restore(await r.json());message('Открыта опубликованная схема с текстурами. Сохранённая локальная копия не удалена.');}catch(e){message(e.message);}};
 let published=false;
 if(!saved&&project.bannerLayoutUrl){try{const response=await fetch(assetUrl(project.bannerLayoutUrl),{cache:'no-store'});if(!response.ok)throw Error('Не удалось загрузить болванку');await restore(await response.json());published=true;message('Загружена болванка баннеров по текущей модели. Выберите плоскость и нанесите текстуру.');}catch(e){message(e.message);}}
 // Only explicit banner body names are candidates. Never infer printing from a frame or cladding ancestor.
 if(!saved&&!published)for(const mesh of meshes.filter(m=>isNamedBanner(m.userData.bannerName))){
  const g=mesh.geometry,idx=g.index,p=g.attributes.position;let best=-1,area=0;
  for(let i=0;i<(idx?idx.count:p.count);i+=3){const t=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));const a=new THREE.Triangle(...t).getArea();if(a>area){area=a;best=i/3;}}
  if(best>=0)try{addSurface(mesh,best);}catch{}
 }
 refresh();
 if(!saved&&!published)message(surfaces.length?`Выделено поверхностей по названиям: ${surfaces.length}. Проверьте выбор и добавьте нужные грани.`:'Баннеры не обозначены по именам. Выберите нужные плоские поверхности на модели.');
 function resize(){const w=Math.max(1,view.clientWidth),h=Math.max(1,view.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();invalidate();}const observer=new ResizeObserver(resize);observer.observe(view);resize();fit();
 $('banner-loading').hidden=true;view.dataset.ready='true';
 let raf;function tick(){raf=requestAnimationFrame(tick);if(dirty){renderer.render(scene,camera);dirty=false;}}tick();
 addEventListener('pagehide',()=>{cancelAnimationFrame(raf);observer.disconnect();controls.dispose();db.close();surfaces.slice().forEach(remove);neutral.dispose();renderer.dispose();},{once:true});
}catch(error){$('banner-loading').textContent='Не удалось открыть модель: '+error.message;message('Попробуйте открыть проект заново.');console.error(error);}
