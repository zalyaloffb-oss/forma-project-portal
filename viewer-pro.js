import {loadCatalogue,permittedModel,projectModel} from './site-config.js?v=furniture-2';
import * as THREE from 'three';
import {partDxf,dxfFilename,flatContours} from './part-dxf.js?v=3';
import {measurementMarkerRadius} from './measurement-markers.js?v=1';
import {createComponentHover} from './component-hover.js?v=1';
import {createViewCube} from './viewer-cube.js?v=2';
import {createInteractionBatch} from './viewer-batching.js?v=1';
import {createJoints} from './viewer-joints.js?v=1';
import {createHistory} from './viewer-history.js?v=1';
import {addPartNumbers} from './part-numbers.js?v=github-v183';
import {viewerLink,copyViewerLink} from './viewer-share.js?v=furniture-2';
import {iconButton} from './viewer-icons.js?v=lucide-20261105';
import {planarFace,sectionGeometry} from './geometry-tools.js?v=sheet-layout-1';
import {edgeMeasurement,planeMeasurement,stitchEdges} from './measure-geometry.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
const $=s=>document.querySelector(s),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let renderer,controls,resizeObserver,raf,environment;
const stage=$('#stage'),loading=$('#loading');
const sliderPanels=document.createElement('div');sliderPanels.className='slider-panels';sliderPanels.setAttribute('aria-label','Настройки инструментов');document.body.append(sliderPanels);
for(const selector of ['#section-panel','#explode-panel','#joints-panel'])sliderPanels.append($(selector));
const faceOffsetRange=document.createElement('input');faceOffsetRange.type='range';faceOffsetRange.id='section-face-range';faceOffsetRange.hidden=true;faceOffsetRange.step='1';faceOffsetRange.setAttribute('aria-label','Смещение сечения от грани, мм');$('#section-position').after(faceOffsetRange);
function positionSliderPanels(){const toolbar=$('.toolbar').getBoundingClientRect();sliderPanels.style.bottom=Math.max(0,innerHeight-toolbar.top+8)+'px';}
new ResizeObserver(positionSliderPanels).observe($('.toolbar'));window.addEventListener('resize',positionSliderPanels);positionSliderPanels();
function modelMetadata(object,key){for(let current=object;current;current=current.parent){if(current.userData?.[key])return current.userData[key];}return null;}
const params=new URLSearchParams(location.search),projectId=window.FORMA_PROJECT?.id||params.get('project');
let shareProject=window.FORMA_PROJECT||(projectId?{id:projectId}:{modelUrl:params.get('model')});
const shareButton=document.createElement('button');shareButton.id='share-model';shareButton.title='Скопировать ссылку на просмотрщик этого проекта';shareButton.setAttribute('aria-label',shareButton.title);shareButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';$('.topline > div').prepend(shareButton);
for(const button of document.querySelectorAll('.selection-modes button'))document.querySelector('.toolbar').append(button);
const closeButton=document.createElement('button');closeButton.id='viewer-close';closeButton.title='Выйти в каталог';closeButton.setAttribute('aria-label','Выйти в каталог');closeButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';$('.topline > div').append(closeButton);closeButton.onclick=()=>{if(window.parent!==window)window.parent.postMessage({type:'forma-close-viewer'},location.origin);else window.location.href=new URL('./',document.baseURI).href;};
shareButton.onclick=async()=>{const url=viewerLink(shareProject);if(await copyViewerLink(url)){$('#status').textContent='Ссылка скопирована';}};
const navigationMenu=document.createElement('div');navigationMenu.className='navigation-menu';navigationMenu.hidden=true;navigationMenu.setAttribute('aria-label','Управление видом');document.body.append(navigationMenu);
const navigationButton=document.createElement('button');navigationButton.id='navigation-menu-toggle';navigationButton.setAttribute('aria-expanded','false');iconButton(navigationButton,'pan','Управление видом');const panButton=$('[data-mode="pan"]');panButton.before(navigationButton);
for(const selector of ['[data-mode="orbit"]','[data-mode="pan"]','[data-mode="zoom"]','#fit','#home'])navigationMenu.append($(selector));
function closeNavigation(){navigationMenu.hidden=true;navigationButton.setAttribute('aria-expanded','false');}
navigationButton.onclick=()=>{if(!navigationMenu.hidden){closeNavigation();return;}const rect=navigationButton.getBoundingClientRect();navigationMenu.style.left=Math.max(8,Math.min(innerWidth-58,rect.left))+'px';navigationMenu.style.bottom=(innerHeight-rect.top+8)+'px';navigationMenu.hidden=false;navigationButton.setAttribute('aria-expanded','true');};
navigationMenu.addEventListener('click',e=>{if(e.target.closest('button'))closeNavigation();});document.addEventListener('pointerdown',e=>{if(!navigationMenu.contains(e.target)&&!navigationButton.contains(e.target))closeNavigation();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNavigation();});
try{
 renderer=new THREE.WebGLRenderer({antialias:false,logarithmicDepthBuffer:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xffffff);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;renderer.localClippingEnabled=true;
 let darkBackground=false;
 $('#background').onclick=()=>{darkBackground=!darkBackground;renderer.setClearColor(darkBackground?0x20242a:0xffffff);iconButton($('#background'),'background',darkBackground?'Сменить тёмный фон на белый':'Сменить белый фон на тёмный');};
 stage.appendChild(renderer.domElement);renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','3D-модель: выберите деталь щелчком');
 const scene=new THREE.Scene();let camera=new THREE.PerspectiveCamera(40,1,.001,1000);
 const composer=new EffectComposer(renderer);
 composer.renderTarget1.samples=composer.renderTarget2.samples=Math.min(4,renderer.capabilities.maxSamples);
 const renderPass=new RenderPass(scene,camera),outputPass=new OutputPass(),fxaaPass=new ShaderPass(FXAAShader);
 composer.addPass(renderPass);composer.addPass(outputPass);composer.addPass(fxaaPass);
 let antialiasOn=true;
 try{antialiasOn=localStorage.getItem('forma-antialias')!=='off';}catch{}
 function updateAntialias(){const b=$('#antialias');iconButton(b,'aa','Сглаживание: '+(antialiasOn?'ВКЛ':'ВЫКЛ'));b.setAttribute('aria-pressed',String(antialiasOn));stage.dataset.antialias=antialiasOn?'on':'off';}
 $('#antialias').onclick=()=>{antialiasOn=!antialiasOn;updateAntialias();try{localStorage.setItem('forma-antialias',antialiasOn?'on':'off');}catch{}};
 updateAntialias();
 // Keep interaction light, refine once after settling, then stop GPU redraws.
 let renderDirty=true,interacting=false,settleAt=0,qualityRatio=renderer.getPixelRatio(),renderCount=0;
 let interactionBatch=null,batchDirty=true;
 renderer.info.autoReset=false;
 const dirtyBatch=()=>{batchDirty=true;};
 document.addEventListener('click',dirtyBatch);document.addEventListener('input',dirtyBatch);document.addEventListener('change',dirtyBatch);document.addEventListener('keydown',dirtyBatch);renderer.domElement.addEventListener('pointerup',dirtyBatch);
 function invalidate(){renderDirty=true;}
 function activity(){settleAt=performance.now()+350;invalidate();}
 function quality(forceHigh=false){
  const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);
  const base=Math.min(devicePixelRatio||1,1.5);
  const high=antialiasOn&&(forceHigh||(!interacting&&performance.now()>=settleAt));
  // Bound high-resolution buffers on large displays (8 MP and GPU texture limits).
  const ratio=interacting&&!forceHigh?Math.min(base,1,Math.sqrt(2000000/(w*h))):high?Math.min(base*2,3,Math.sqrt(8000000/(w*h)),renderer.capabilities.maxTextureSize/Math.max(w,h)):base;
  const next=Math.max(.5,ratio);
  if(Math.abs(next-qualityRatio)>.001){qualityRatio=next;renderer.setPixelRatio(next);renderer.setSize(w,h,false);composer.setPixelRatio(next);invalidate();}
  fxaaPass.uniforms.resolution.value.set(1/(w*qualityRatio),1/(h*qualityRatio));
  stage.dataset.renderQuality=antialiasOn?(high?'high':'interactive'):'off';stage.dataset.renderRatio=String(qualityRatio);
 }
 function renderView(forceHigh=false){
  quality(forceHigh);renderer.info.reset();const began=performance.now();
  const navigation=interacting&&!forceHigh,batched=navigation&&interactionBatch&&['orbit','pan','zoom'].includes(mode);
  if(batched)interactionBatch.render(()=>renderer.render(scene,camera));
  else if(antialiasOn&&!navigation){renderPass.camera=camera;composer.render();}else renderer.render(scene,camera);
  stage.dataset.lastDrawCalls=String(renderer.info.render.calls);stage.dataset.frameCpuMs=(performance.now()-began).toFixed(2);
  stage.dataset.navigationBatch=batched?'on':'off';
  if(navigation){stage.dataset.navigationDrawCalls=String(renderer.info.render.calls);stage.dataset.navigationCpuMs=stage.dataset.frameCpuMs;stage.dataset.navigationFrames=String(Number(stage.dataset.navigationFrames||0)+1);}
  renderDirty=false;stage.dataset.renderCount=String(++renderCount);
 }
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN;
 controls.addEventListener('start',()=>{if(interactionBatch&&batchDirty){interactionBatch.refresh();batchDirty=false;}interacting=true;activity();});
 controls.addEventListener('end',()=>{interacting=false;activity();});
 controls.addEventListener('change',activity);
 // Capture body drags too; they intentionally bypass OrbitControls.
 renderer.domElement.addEventListener('pointerdown',()=>{interacting=true;activity();},true);
 for(const event of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,()=>{interacting=false;activity();},true);
 renderer.domElement.addEventListener('pointermove',e=>{if(e.buttons)activity();},true);
 document.addEventListener('click',invalidate,true);document.addEventListener('keydown',invalidate,true);
 document.addEventListener('input',activity,true);document.addEventListener('change',invalidate,true);
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;scene.environmentIntensity=.65;room.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xffffff,0x697b59,.65));const sun=new THREE.DirectionalLight(0xffffff,1.25);sun.position.set(4,8,5);scene.add(sun);
 let requested=params.get('model'),projectTitle='';
 if(projectId){
  if(!/^[\w-]{1,100}$/.test(projectId))throw Error('Недопустимый проект');
  const data=await loadCatalogue(),project=projectModel(data.projects.find(p=>p.id===projectId),params.get('item')||window.FORMA_PROJECT?.itemId);
  if(!project?.modelUrl)throw Error('3D-модель проекта не найдена');
  requested=project.modelUrl;projectTitle=project.title;shareProject=project;
 }
 // CAD-style diffuse lighting avoids the bright studio reflections on Fusion's solid colors.
 if(requested){renderer.toneMapping=THREE.NoToneMapping;scene.environment=null;scene.children.filter(o=>o.isLight).forEach(o=>scene.remove(o));scene.add(new THREE.AmbientLight(0xfff9eb,1.7));const cadSun=new THREE.DirectionalLight(0xffffff,.6);cadSun.position.set(4,8,5);scene.add(cadSun);}
 if(requested&&!permittedModel(requested))throw Error('Недопустимый адрес модели');
 const asset=await new GLTFLoader().loadAsync(requested||'./models/health-territory-v23.glb'),model=asset.scene;scene.add(model);model.updateMatrixWorld(true);
 model.traverse(object=>{const node=asset.parser.associations.get(object)?.nodes;if(node!==undefined)Object.assign(object.userData,asset.parser.json.nodes[node]?.extras||{});});
 const fusionView=model.children[0]?.userData?.fusionCamera;
 const jointDescriptors=model.children[0]?.userData?.fusionJoints||[];
 const jointRootQuaternion=model.children[0]?.quaternion.clone()||new THREE.Quaternion();
 if(requested){const name=projectTitle||model.children[0]?.name||'Модель Fusion';document.title=name+' — 3D';$('.topline > span').textContent=name;}
 const originalBox=new THREE.Box3().setFromObject(model),center=originalBox.getCenter(new THREE.Vector3()),size=originalBox.getSize(new THREE.Vector3()),largest=Math.max(...size.toArray());
 if(!Number.isFinite(largest)||largest<=0)throw Error('Некорректная геометрия');
 const scale=10/largest,mmPerUnit=1000/scale;
 const meshes=[];model.traverse(o=>{if(o.isMesh)meshes.push(o);});
 const edges=[],materials=new Set(),textures=new Set(),edgeMaterial=new LineMaterial({color:0x000000,linewidth:1.5,worldUnits:false,alphaToCoverage:true,depthWrite:false});
 // A bounded 0.8 mm display tolerance resolves coplanar seams without X-ray edges.
 // Match this Three.js version's actual logarithmic-depth define, not USE_LOGDEPTHBUF.
 const contactDepthUniforms={contactTolerance:{value:.8/mmPerUnit},contactClipRange:{value:new THREE.Vector2(camera.near,camera.far)}};
 edgeMaterial.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,contactDepthUniforms);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float contactTolerance;\nuniform vec2 contactClipRange;').replace('#include <logdepthbuf_fragment>',`#include <logdepthbuf_fragment>
   float contactBias=contactTolerance/(contactClipRange.y-contactClipRange.x);
   #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    if(vIsPerspective!=0.0)contactBias=log2(vFragDepth/max(1.0,vFragDepth-contactTolerance))*logDepthBufFC*0.5;
    gl_FragDepth=max(0.0,gl_FragDepth-contactBias);
   #else
    gl_FragDepth=max(0.0,gl_FragCoord.z-contactBias);
   #endif`);
 };
 edgeMaterial.customProgramCacheKey=()=> 'cad-contact-edge-bias-v2';
 const items=meshes.map((mesh,id)=>{
  const sourceName=modelMetadata(mesh,'bodyName'),sourcePath=modelMetadata(mesh,'fusionPath');
  const world=mesh.matrixWorld.clone(),transform=new THREE.Matrix4().makeScale(scale,scale,scale).multiply(new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z)).multiply(world);
  mesh.removeFromParent();mesh.matrixAutoUpdate=true;transform.decompose(mesh.position,mesh.quaternion,mesh.scale);scene.add(mesh);
  // A slope-dependent offset lets rear edges bleed through thin CAD panels.
  // Only a tiny constant depth bias is needed to keep their own edges visible.
  const src=Array.isArray(mesh.material)?mesh.material:[mesh.material];const own=src.map(m=>{const copy=requested&&!m.map?new THREE.MeshLambertMaterial({name:m.name,color:m.color,emissive:m.emissive,side:m.side,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,depthWrite:m.depthWrite}):m.clone();
   // Preserve source assets; a small display-only adjustment matches Fusion's muted CAD palette.
   if(requested&&copy.color&&!copy.map){const luminance=.2126*copy.color.r+.7152*copy.color.g+.0722*copy.color.b;copy.color.lerp(new THREE.Color().setRGB(luminance,luminance,luminance),.15);if(m.metalness>.5)copy.color.multiplyScalar(.6);}
   copy.polygonOffset=true;copy.polygonOffsetFactor=0;copy.polygonOffsetUnits=4;materials.add(copy);for(const k of ['map','normalMap','specularColorMap','roughnessMap','metalnessMap'])if(copy[k])textures.add(copy[k]);return copy;});mesh.material=Array.isArray(mesh.material)?own:own[0];
  // Exported BRep edges include tangent seams; a triangle-angle filter cannot recover them.
  const cadEdges=mesh.userData.cadEdges;
  const sourceEdges=Array.isArray(cadEdges)&&cadEdges.length%6===0?new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(cadEdges,3)):new THREE.EdgesGeometry(mesh.geometry,25);
  const lines=new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(sourceEdges),edgeMaterial);lines.userData.sourceGeometry=sourceEdges;lines.renderOrder=1;mesh.add(lines);edges.push(lines);mesh.userData.itemId=id;
  mesh.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(mesh),mid=box.getCenter(new THREE.Vector3());
  return {id,mesh,box,center:mid,base:mesh.position.clone(),restPosition:mesh.position.clone(),restQuaternion:mesh.quaternion.clone(),name:sourceName||mesh.name||`Деталь ${id+1}`,path:sourcePath||'Прочие детали',materials:own,emissive:own.map(m=>m.emissive?.clone()),colors:own.map(m=>m.color?.clone()),visible:true};
 });
 scene.remove(model);
 const jointController=createJoints({descriptors:jointDescriptors,items,center,scale,rootQuaternion:jointRootQuaternion});
 const joints=jointController.joints;
 stage.dataset.jointCount=String(joints.length);
 await addPartNumbers({items,projectId,mmPerUnit,materials,textures,toolbar:$('.topline > div'),invalidate,stage,cacheKey:shareProject.updatedAt||shareProject.fusionVersion});
 const modelBox=new THREE.Box3();items.forEach(i=>modelBox.union(i.box));const radius=modelBox.getSize(new THREE.Vector3()).length()/2;
 controls.minDistance=.05;controls.maxDistance=radius*20;camera.near=.01;camera.far=radius*30;
 let selectionAnchor=null;const selectionCenter=new THREE.Vector3();
 let selected=[],mode='orbit',sectionOn=false,explode=0,points=[],measureObjects=[],measurementCenter=null;
 const dxfButton=document.createElement('button');dxfButton.id='export-part-dxf';$('.selection-actions').append(dxfButton);
 const selectionSectionButton=document.createElement('button');
 selectionSectionButton.id='section-from-selection';
 $('.selection-actions').append(selectionSectionButton);
 selectionSectionButton.onclick=()=>{
  if(!selectionAnchor||selected.length!==1||!Number.isInteger(selectionAnchor.faceIndex))return;
  const mesh=items[selectionAnchor.id].mesh;
  mesh.updateWorldMatrix(true,false);
  const surface=planarFace(mesh,selectionAnchor.faceIndex);
  if(surface?.area>0){
   startFaceSection(0,surface);
   select([]);
  }
 };
 const addToSheetButton=document.createElement('button');
 addToSheetButton.id='add-face-to-sheet';
 $('.selection-actions').append(addToSheetButton);
 const sheetButton=document.createElement('button');
 iconButton(sheetButton,'tree','Раскладка на листе');
 $('.toolbar').append(sheetButton);
 let sheetLayoutPromise;
 function sheetLayout(){
  sheetLayoutPromise??=import('./sheet-layout.js?v=1')
   .then(({createSheetLayout})=>createSheetLayout(projectTitle||'Модель'))
   .catch(error=>{sheetLayoutPromise=null;throw error;});
  return sheetLayoutPromise;
 }
 sheetButton.onclick=async()=>{
  try{(await sheetLayout()).open();}
  catch(error){alert(error.message);}
 };
 addToSheetButton.onclick=async()=>{
  if(selected.length!==1||!Number.isInteger(selectionAnchor?.faceIndex))return;
  const {id,faceIndex}=selectionAnchor,item=items[id];
  try{
   item.mesh.updateWorldMatrix(true,false);
   const surface=planarFace(item.mesh,faceIndex);
   if(!surface?.area)throw Error('Выберите плоскую грань детали.');
   const loops=flatContours(item.mesh,mmPerUnit,surface.vertices);
   const layout=await sheetLayout();
   layout.add(id+':'+surface.surfaceId,item.name,loops);
   layout.open();
  }catch(error){alert(error.message);}
 };
 function exportPart(item,chosenFace=null){
  const dialog=document.createElement('dialog');dialog.className='dxf-dialog';
  const title=document.createElement('h2');title.textContent='Экспорт детали в DXF';
  const name=document.createElement('p');name.textContent=item.name;
  const label=document.createElement('label');label.textContent='Что экспортировать';
  const select=document.createElement('select');select.id='dxf-mode';label.htmlFor=select.id;
  for(const [value,text] of [...(chosenFace?[['face','Контур выбранной грани · 2D']]:[]),['flat','Контур наибольшей плоской поверхности · 2D'],['edges','Все рёбра детали · 3D']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}
  const note=document.createElement('p');note.className='dxf-note';note.textContent='Масштаб 1:1, единицы — миллиметры. Контур включает отверстия выбранной поверхности. Кривые аппроксимированы отрезками сетки. Это не развёртка; глухие отверстия на другой стороне могут не попасть в контур. Перед изготовлением сверьте с исходной CAD-моделью.';
  const error=document.createElement('p');error.className='dxf-error';error.setAttribute('role','alert');
  const actions=document.createElement('div');actions.className='dxf-actions';
  const cancel=document.createElement('button');cancel.textContent='Отмена';cancel.onclick=()=>dialog.close();
  const save=document.createElement('button');save.textContent='Скачать DXF';save.onclick=()=>{
   try{
    const output=partDxf(item.mesh,mmPerUnit,{mode:select.value==='edges'?'edges':'flat',faceVertices:select.value==='face'?chosenFace.vertices:null,cadEdges:item.mesh.userData.cadEdges});
    const blob=new Blob([output.text],{type:'application/dxf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=dxfFilename(item.name);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    status(output.kind+' · '+item.name+' · миллиметры, масштаб 1:1');dialog.close();
   }catch(e){error.textContent=e.message;}
  };
  actions.append(cancel,save);dialog.append(title,name,label,select,note,error,actions);document.body.append(dialog);
  dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 }
 dxfButton.onclick=()=>{if(selected.length===1)exportPart(items[selected[0]]);};
 const plane=new THREE.Plane(new THREE.Vector3(1,0,0),0),clipPlanes=[plane];let planeHelper=null,selectionBox=null;
 const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
 const chosenEdges=new Map(),edgeCandidates=[];
 // Reassemble tessellated curves without joining unrelated CAD junctions.
 items.forEach(item=>{
  const attr=edges[item.id].userData.sourceGeometry.attributes.position,segments=[];
  for(let j=0;j<attr.count;j+=2)segments.push([new THREE.Vector3().fromBufferAttribute(attr,j).toArray(),new THREE.Vector3().fromBufferAttribute(attr,j+1).toArray()]);
  stitchEdges(segments).forEach((path,n)=>{const points=path.map(p=>new THREE.Vector3(...p));edgeCandidates.push({key:item.id+':'+n,item,ends:[points[0],points.at(-1)],points});});
 });
 function clearEdges(){for(const e of chosenEdges.values()){e.line.removeFromParent();e.line.geometry.dispose();e.line.material.dispose();}chosenEdges.clear();updateEdgePanel();}
 function updateEdgePanel(){
  $('#edge-selection').hidden=mode!=='edge';let total=0;
  $('#edge-list').innerHTML=[...chosenEdges.values()].map(e=>{total+=e.length;return `<div>${escape(e.item.path.split('+').at(-1))} / ${escape(e.item.name)}<b>${e.length.toLocaleString('ru-RU',{maximumFractionDigits:2})} мм</b></div>`;}).join('');
  $('#edge-total').textContent=`Выбрано: ${chosenEdges.size} · ${total.toLocaleString('ru-RU',{maximumFractionDigits:2})} мм`;
 }
 function findEdge(event){
  const rect=renderer.domElement.getBoundingClientRect(),cursor=new THREE.Vector2(event.clientX-rect.left,event.clientY-rect.top);let best=null,bestDistance=event.pointerType==='touch'?22:14;
  scene.updateMatrixWorld(true);
  for(const e of edgeCandidates){if(!e.item.visible)continue;for(let j=1;j<e.points.length;j++){const a=e.points[j-1].clone().applyMatrix4(e.item.mesh.matrixWorld),b=e.points[j].clone().applyMatrix4(e.item.mesh.matrixWorld),pa=a.clone().project(camera),pb=b.clone().project(camera);if(pa.z< -1||pa.z>1||pb.z< -1||pb.z>1)continue;
   const sa=new THREE.Vector2((pa.x+1)*rect.width/2,(1-pa.y)*rect.height/2),sb=new THREE.Vector2((pb.x+1)*rect.width/2,(1-pb.y)*rect.height/2),delta=sb.clone().sub(sa),t=THREE.MathUtils.clamp(cursor.clone().sub(sa).dot(delta)/Math.max(delta.lengthSq(),1e-12),0,1),screen=sa.clone().addScaledVector(delta,t),distance=screen.distanceTo(cursor);if(distance>=bestDistance)continue;
   const point=a.clone().lerp(b,t);if(sectionOn&&plane.distanceToPoint(point)<0)continue;
   raycaster.setFromCamera(new THREE.Vector2(screen.x/rect.width*2-1,1-screen.y/rect.height*2),camera);
   const front=raycaster.intersectObjects(items.filter(i=>i.visible).map(i=>i.mesh),false).find(h=>!sectionOn||plane.distanceToPoint(h.point)>=0);
   if(front&&front.distance+radius*.0001<raycaster.ray.origin.distanceTo(point))continue;
   best=e;bestDistance=distance;
  }}
  return best;
 }
 function chooseEdge(event){
  const best=findEdge(event);if(!best){status('Нажмите ближе к видимому ребру');return;}
  if(chosenEdges.has(best.key)){const old=chosenEdges.get(best.key);old.line.removeFromParent();old.line.geometry.dispose();old.line.material.dispose();chosenEdges.delete(best.key);}
  else{const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(best.points),new THREE.LineBasicMaterial({color:0x008dff,depthTest:false,transparent:true,opacity:1}));line.renderOrder=20;best.item.mesh.add(line);const world=best.points.map(p=>p.clone().applyMatrix4(best.item.mesh.matrixWorld));const length=world.slice(1).reduce((s,p,j)=>s+p.distanceTo(world[j]),0)*mmPerUnit;chosenEdges.set(best.key,{...best,line,length});}
  updateEdgePanel();
 }
 $('#edge-clear').onclick=clearEdges;
 let face=null,faceOverlay=null,customSection=null,dragBody=null,capsDirty=true;
 const caps=new THREE.Group();scene.add(caps);
 const hatchColors=['#e9b96e','#87c4d7','#b6ca87','#d99ebd','#a5a3d3','#e1a48b'];
 const cutOutlineMaterial=new LineMaterial({color:0x000000,linewidth:1.8,worldUnits:false,alphaToCoverage:true,depthWrite:false});
 cutOutlineMaterial.onBeforeCompile=edgeMaterial.onBeforeCompile;cutOutlineMaterial.customProgramCacheKey=edgeMaterial.customProgramCacheKey;
 function cutMaterial(id){
  const material=new THREE.MeshBasicMaterial({color:hatchColors[id%hatchColors.length],side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-1});
  // Analytic hatching stays sharp at every zoom: no magnified bitmap or mipmap blur.
  material.onBeforeCompile=shader=>{
   shader.uniforms.cutPitch={value:6/mmPerUnit};
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vCutUv;').replace('#include <uv_vertex>','#include <uv_vertex>\nvCutUv=uv;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vCutUv;\nuniform float cutPitch;').replace('#include <color_fragment>',`#include <color_fragment>
    float hatchCoordinate=vCutUv.x+vCutUv.y;
    float visiblePitch=max(cutPitch,fwidth(hatchCoordinate)*8.0);
    hatchCoordinate/=visiblePitch;
    float pixelWidth=max(fwidth(hatchCoordinate),0.00001);
    float hatchDistance=abs(fract(hatchCoordinate+0.5)-0.5);
    float hatchInk=1.0-smoothstep(pixelWidth*0.25,pixelWidth*0.85,hatchDistance);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.0),hatchInk);`);
  };
  material.customProgramCacheKey=()=> 'cad-analytic-hatch-v1';return material;
 }
 const sectionPanel=$('#section-panel');
 function syncFaceSectionPreview(){
  const preview=!!face;
  const wasPreview=sectionPanel.classList.contains('face-preview');
  sectionPanel.classList.toggle('face-preview',preview);
  if(preview){
   sectionPanel.hidden=false;
   $('#section-position').hidden=true;
   faceOffsetRange.hidden=false;
   setFaceOffsetRange(0);
   $('#section-value').textContent='0 мм';
  }else if(wasPreview){
   sectionPanel.hidden=$('#section-toggle').getAttribute('aria-pressed')!=='true';
   if(!sectionPanel.hidden)section();
  }
 }
 function clearFace(){if(faceOverlay){faceOverlay.removeFromParent();faceOverlay.geometry.dispose();faceOverlay.material.dispose();faceOverlay=null;}face=null;syncFaceSectionPreview();}
 function chooseFace(hit){clearFace();if(!hit)return;const geometry=planarFace(hit.object,hit.faceIndex);if(!geometry)return;const item=items[hit.object.userData.itemId];face={...geometry,item};select([]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(geometry.vertices,3));faceOverlay=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0x008dff,transparent:true,opacity:.30,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}));scene.add(faceOverlay);syncFaceSectionPreview();status('Сдвиньте ползунок для сечения от грани.');
 }
 function rebuildCaps(){clearRulerHover();capsDirty=false;while(caps.children.length){const c=caps.children[0];caps.remove(c);c.traverse(o=>{o.geometry?.dispose();if(o.material&&o.material!==cutOutlineMaterial)o.material.dispose();});}if(!sectionOn){stage.dataset.sectionCaps='0';return;}scene.updateMatrixWorld(true);for(const item of items){if(!item.visible)continue;const g=sectionGeometry(item.mesh,plane);if(!g)continue;const cap=new THREE.Mesh(g,cutMaterial(item.id));cap.renderOrder=2;const boundary=new THREE.EdgesGeometry(g,1),outline=new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(boundary),cutOutlineMaterial);cap.userData.contour=boundary.getAttribute('position');boundary.dispose();outline.renderOrder=3;cap.add(outline);caps.add(cap);}stage.dataset.sectionCaps=String(caps.children.length);}
 function startFaceSection(offset,surface=face){
  if(!surface)return;
  customSection={normal:surface.normal.clone(),point:surface.point.clone()};
  $('#section-axis').value='face';
  $('#section-flip').checked=true;
  $('#section-offset').value=String(offset);
  $('#section-toggle').setAttribute('aria-pressed','true');
  sectionOn=true;
  sectionPanel.hidden=false;
  sectionPanel.classList.remove('face-preview');
  setMode('orbit');
  section();
 }
 function pointerRay(e){const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);raycaster.setFromCamera(mouse,camera);}
 renderer.domElement.addEventListener('pointerdown',e=>{if(mode!=='move'||e.button!==0)return;controls.enabled=false;e.stopImmediatePropagation();const hit=pick(e);if(!hit){controls.enabled=true;return;}clearFace();clearEdges();clearMeasurement();const item=items[hit.object.userData.itemId];select([item.id],hit);const dragPlane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),hit.point);dragBody={item,plane:dragPlane,start:hit.point.clone(),base:item.mesh.position.clone(),pointer:e.pointerId};renderer.domElement.setPointerCapture(e.pointerId);},true);
 renderer.domElement.addEventListener('pointermove',e=>{if(!dragBody)return;e.stopImmediatePropagation();pointerRay(e);const p=raycaster.ray.intersectPlane(dragBody.plane,new THREE.Vector3());if(!p)return;dragBody.item.mesh.position.copy(dragBody.base).add(p.sub(dragBody.start));dragBody.item.mesh.updateMatrixWorld(true);capsDirty=true;const d=dragBody.item.mesh.position.clone().sub(dragBody.base).length()*mmPerUnit;status('Перемещение тела: '+d.toFixed(1)+' мм · «Вернуть тела» отменяет перемещения');},true);
 function endBodyDrag(e){if(!dragBody)return;dragBody=null;if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);controls.enabled=true;}
 renderer.domElement.addEventListener('pointerup',endBodyDrag,true);renderer.domElement.addEventListener('pointercancel',endBodyDrag,true);renderer.domElement.addEventListener('lostpointercapture',()=>{dragBody=null;controls.enabled=true;});
 $('#restore-bodies').onclick=()=>{jointController.reset();syncJointPanel();$('#explode-range').value='0';explodeModel();clearFace();capsDirty=true;status('Тела возвращены в исходное положение');};
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
 function select(ids,hit=null){
  if(hit){const item=items[hit.object.userData.itemId];selectionAnchor={id:item.id,faceIndex:hit.faceIndex,point:item.mesh.worldToLocal(hit.point.clone())};}
  else if(!selectionAnchor||!ids.includes(selectionAnchor.id))selectionAnchor=null;
  for(const id of selected){const item=items[id];item.materials.forEach((m,j)=>{if(m.emissive&&item.emissive[j])m.emissive.copy(item.emissive[j]);if(m.color&&item.colors[j])m.color.copy(item.colors[j]);});}
  selected=ids;for(const id of selected){const item=items[id];item.materials.forEach((m,j)=>{if(m.color&&item.colors[j])m.color.copy(item.colors[j]).multiplyScalar(.70);if(m.emissive&&item.emissive[j])m.emissive.copy(item.emissive[j]).multiplyScalar(.70);});}
  $('#selection').hidden=!ids.length;
  dxfButton.disabled=ids.length!==1;
  selectionSectionButton.disabled=ids.length!==1||!Number.isInteger(selectionAnchor?.faceIndex);
  addToSheetButton.disabled=selectionSectionButton.disabled;
  if(ids.length){const first=items[ids[0]],b=new THREE.Box3();ids.forEach(id=>b.union(new THREE.Box3().setFromObject(items[id].mesh)));b.getCenter(selectionCenter);const d=b.getSize(new THREE.Vector3()).multiplyScalar(mmPerUnit);$('#selected-title').textContent=ids.length===1?first.name:`Выбрано тел: ${ids.length}`;$('#selected-path').textContent=first.path.split('+').join(' / ');$('#selected-size').textContent=`Габариты X × Y × Z: ${d.toArray().map(v=>v.toLocaleString('ru-RU',{maximumFractionDigits:1})).join(' × ')} мм`;status('F — приблизить · H — скрыть · I — изолировать · Esc — снять выделение');}
  updateSelectionBox();syncTree();
 }
 // Desktop object inspector follows the picked surface in body-local coordinates.
 const selectionCard=$('#selection'),desktopSelection=matchMedia('(min-width:769px)');
 const dismissSelection=document.createElement('button');dismissSelection.className='selection-close';dismissSelection.setAttribute('aria-label','Закрыть карточку детали');dismissSelection.title='Закрыть карточку';dismissSelection.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';selectionCard.prepend(dismissSelection);dismissSelection.onclick=()=>select([]);
 const actionTip=document.createElement('div');actionTip.id='selection-action-tip';actionTip.role='tooltip';actionTip.hidden=true;stage.append(actionTip);
 let tippedButton=null;
 function hideActionTip(){if(tippedButton)tippedButton.removeAttribute('aria-describedby');tippedButton=null;actionTip.hidden=true;}
 function placeActionTip(){
  if(!tippedButton||selectionCard.hidden){hideActionTip();return;}
  const a=tippedButton.getBoundingClientRect(),r=stage.getBoundingClientRect(),w=actionTip.offsetWidth,h=actionTip.offsetHeight;
  const x=THREE.MathUtils.clamp(a.left-r.left+a.width/2-w/2,8,Math.max(8,r.width-w-8));
  let y=a.bottom-r.top+8;if(y+h>r.height-8)y=a.top-r.top-h-8;
  actionTip.style.left=x+'px';actionTip.style.top=Math.max(8,y)+'px';
 }
 for(const [id,icon,label] of [['fit-selected','fit','Приблизить'],['move-selected','move','Переместить'],['hide','eye','Скрыть'],['isolate','face','Изолировать'],['export-part-dxf','download','Скачать выбранную деталь в DXF'],['section-from-selection','section','Сечение от грани'],['add-face-to-sheet','tree','Добавить выбранную грань на лист']]){
  const button=$('#'+id);iconButton(button,icon,label);button.removeAttribute('title');
  if(id==='hide'){const slash=document.createElementNS('http://www.w3.org/2000/svg','path');slash.setAttribute('d','M3 3l18 18');button.querySelector('svg').append(slash);}
  function show(){tippedButton=button;actionTip.textContent=label;actionTip.hidden=false;button.setAttribute('aria-describedby',actionTip.id);placeActionTip();}
  button.addEventListener('pointerenter',show);button.addEventListener('focus',show);button.addEventListener('pointerleave',hideActionTip);button.addEventListener('blur',hideActionTip);button.addEventListener('click',hideActionTip);
 }
 renderer.domElement.addEventListener('pointerdown',hideActionTip,true);
 function positionSelectionCard(){
  selectionCard.classList.toggle('floating',desktopSelection.matches);
  if(!desktopSelection.matches){selectionCard.style.removeProperty('left');selectionCard.style.removeProperty('top');if(!actionTip.hidden)placeActionTip();return;}
  if(selectionCard.hidden){hideActionTip();return;}
  let point=selectionCenter.clone();
  if(selectionAnchor&&items[selectionAnchor.id]?.visible){const mesh=items[selectionAnchor.id].mesh;mesh.updateMatrixWorld(true);point=mesh.localToWorld(selectionAnchor.point.clone());}
  point.project(camera);const w=stage.clientWidth,h=stage.clientHeight,cw=selectionCard.offsetWidth,ch=selectionCard.offsetHeight;
  const px=(point.x+1)*w/2,py=(1-point.y)*h/2,gap=20,padding=12;
  let x=px+gap;if(x+cw>w-padding)x=px-cw-gap;
  if(selected.length===1){
   const mesh=items[selected[0]].mesh;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;
   let left=Infinity,right=-Infinity;
   for(const xx of [box.min.x,box.max.x])for(const yy of [box.min.y,box.max.y])for(const zz of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(xx,yy,zz).applyMatrix4(mesh.matrixWorld).project(camera);const sx=(p.x+1)*w/2;left=Math.min(left,sx);right=Math.max(right,sx);
   }
   if(right+gap+cw<=w-padding)x=right+gap;else if(left-gap-cw>=padding)x=left-gap-cw;
  }
  x=THREE.MathUtils.clamp(x,padding,Math.max(padding,w-cw-padding));
  const y=THREE.MathUtils.clamp(py-ch/2,padding,Math.max(padding,h-ch-padding));
  selectionCard.style.left=x+'px';selectionCard.style.top=y+'px';
  selectionCard.dataset.anchorX=px.toFixed(1);selectionCard.dataset.anchorY=py.toFixed(1);
  if(!actionTip.hidden)placeActionTip();
 }
 desktopSelection.addEventListener('change',()=>{positionSelectionCard();invalidate();});
 function setVisible(ids,visible){capsDirty=true;clearFace();ids.forEach(id=>{items[id].visible=visible;items[id].mesh.visible=visible;});select(selected.filter(id=>items[id].visible));syncTree();}
 function showAll(){capsDirty=true;items.forEach(i=>{i.visible=true;i.mesh.visible=true;});syncTree();status('Все детали показаны');}
 function isolate(){capsDirty=true;clearFace();if(!selected.length)return;const s=new Set(selected);items.forEach(i=>{i.visible=s.has(i.id);i.mesh.visible=i.visible;});syncTree();fit(null,true);status('Изоляция включена. «Показать всё» возвращает сборку.');}
 const treeRoot={name:projectTitle||model.children[0]?.name||'Модель',children:new Map(),ids:[]};
 for(const item of items){let n=treeRoot;n.ids.push(item.id);for(const name of item.path.split('+')){if(!n.children.has(name))n.children.set(name,{name,children:new Map(),ids:[]});n=n.children.get(name);n.ids.push(item.id);}if(!n.bodies)n.bodies=[];n.bodies.push(item);}
 const groups=[];function treeHTML(n,root=false){const groupId=groups.push(n)-1;return `<details ${root?'open':''}><summary><input type="checkbox" checked data-group-eye="${groupId}" aria-label="Показать ${escape(n.name)}"><button class="group-select" data-group="${groupId}" title="${escape(n.name)}">${escape(n.name)} <small>(${n.ids.length})</small></button></summary>${[...n.children.values()].map(c=>treeHTML(c)).join('')}${(n.bodies||[]).map(i=>`<div class="tree-row" data-row="${i.id}"><input type="checkbox" checked data-eye="${i.id}" aria-label="Показать ${escape(i.name)}"><button data-item="${i.id}" title="${escape(i.path+' / '+i.name)}">${escape(i.name)}</button></div>`).join('')}</details>`;}
 $('#tree').innerHTML=treeHTML(treeRoot,true);
 function syncTree(){for(const row of document.querySelectorAll('[data-row]')){const i=items[Number(row.dataset.row)];row.classList.toggle('selected',selected.includes(i.id));row.classList.toggle('off',!i.visible);row.querySelector('input').checked=i.visible;}for(const box of document.querySelectorAll('[data-group-eye]')){const n=groups[Number(box.dataset.groupEye)],visible=n.ids.filter(id=>items[id].visible).length;box.checked=visible===n.ids.length;box.indeterminate=visible>0&&visible<n.ids.length;}}
 $('#tree').addEventListener('click',e=>{const b=e.target.closest('[data-item],[data-group]');if(!b)return;e.preventDefault();clearEdges();clearMeasurement();select(b.dataset.item!==undefined?[Number(b.dataset.item)]:groups[Number(b.dataset.group)].ids);isolate();updateSelectionBox();});
 $('#tree').addEventListener('change',e=>{const b=e.target;if(b.dataset.eye!==undefined)setVisible([Number(b.dataset.eye)],b.checked);if(b.dataset.groupEye!==undefined)setVisible(groups[Number(b.dataset.groupEye)].ids,b.checked);});
 const componentHover=createComponentHover({canvas:renderer.domElement,stage,items,pick,canShow:()=>desktopSelection.matches&&mode==='orbit'&&!interacting,
  onIsolate:group=>{clearEdges();clearMeasurement();select(group.ids);isolate();batchDirty=true;recordAction();invalidate();},
  getJoint:item=>joints.find(j=>[j.movingPath,j.fixedPath].some(path=>item.path===path||item.path.startsWith(path+'+'))),
  onJointAction:(joint,open)=>{jointSelect.value=String(joints.indexOf(joint));const angle=open?(Math.abs(joint.maximum-joint.initialAngle)>Math.abs(joint.minimum-joint.initialAngle)?joint.maximum:joint.minimum):joint.initialAngle;driveJoint(angle);batchDirty=true;recordAction();}

 });
 controls.addEventListener('start',componentHover.hide);controls.addEventListener('change',componentHover.hide);
 $('#tree-search').oninput=()=>{const q=$('#tree-search').value.toLocaleLowerCase('ru');document.querySelectorAll('[data-row]').forEach(row=>{const i=items[Number(row.dataset.row)];row.hidden=!!q&&!`${i.path} ${i.name}`.toLocaleLowerCase('ru').includes(q);});for(const d of [...$('#tree').querySelectorAll('details')].reverse()){d.hidden=!!q&&![...d.querySelectorAll('[data-row]')].some(r=>!r.hidden);if(q)d.open=true;} };
 function toggleTree(){const open=$('#tree-panel').hidden;$('#tree-panel').hidden=!open;$('#tree-toggle').setAttribute('aria-pressed',String(open));}
 $('#tree-toggle').onclick=toggleTree;$('#tree-close').onclick=toggleTree;
 const treePanel=$('#tree-panel'),treeHeader=treePanel.querySelector('header'),workspace=treePanel.parentElement;let treeDrag=null;
 function clampTree(x,y){const w=workspace.getBoundingClientRect(),p=treePanel.getBoundingClientRect();return {x:Math.max(0,Math.min(x,Math.max(0,w.width-p.width))),y:Math.max(0,Math.min(y,Math.max(0,w.height-p.height)))};}
 treeHeader.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;const p=treePanel.getBoundingClientRect(),w=workspace.getBoundingClientRect();treeDrag={id:e.pointerId,dx:e.clientX-p.left,dy:e.clientY-p.top};treePanel.style.left=(p.left-w.left)+'px';treePanel.style.top=(p.top-w.top)+'px';treePanel.style.right='auto';treeHeader.setPointerCapture(e.pointerId);treeHeader.classList.add('dragging');e.preventDefault();});
 treeHeader.addEventListener('pointermove',e=>{if(!treeDrag||e.pointerId!==treeDrag.id)return;const w=workspace.getBoundingClientRect(),p=clampTree(e.clientX-w.left-treeDrag.dx,e.clientY-w.top-treeDrag.dy);treePanel.style.left=p.x+'px';treePanel.style.top=p.y+'px';});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])treeHeader.addEventListener(type,()=>{treeDrag=null;treeHeader.classList.remove('dragging');});
 window.addEventListener('resize',()=>{if(treePanel.hidden||!treePanel.style.left)return;const p=clampTree(parseFloat(treePanel.style.left)||0,parseFloat(treePanel.style.top)||0);treePanel.style.left=p.x+'px';treePanel.style.top=p.y+'px';});
 let measureKind='points';const rulerEdges=new Map();let rulerFaces=[];
 function disposeMeasureVisuals(){for(const o of measureObjects){scene.remove(o);o.geometry?.dispose();o.material?.dispose();}measureObjects=[];measurementCenter=null;$('#measure-label').hidden=true;}
 function measurePrompt(){if(measureKind==='section')return 'Укажите две точки на срезе модели';return measureKind==='edges'?'Выберите ребро. Ctrl + щелчок — добавить или убрать; две раздельные группы — расстояние.':measureKind==='planes'?'Выберите первую плоскость, затем вторую. Расстояние измеряется по перпендикуляру.':'Укажите две точки на поверхности модели';}
 function clearMeasurement(){clearRulerHover();disposeMeasureVisuals();points=[];rulerEdges.clear();rulerFaces=[];$('#measure-value').textContent=measurePrompt();stage.dataset.measureSelection='0';delete stage.dataset.measureValue;}
 function measureStroke(ends,color=0x008dff){const line=new LineSegments2(new LineSegmentsGeometry().setPositions(ends.flatMap(p=>p.toArray())),new LineMaterial({color,linewidth:3,worldUnits:false,depthTest:false,depthWrite:false,transparent:true,opacity:.9}));line.renderOrder=20;scene.add(line);measureObjects.push(line);return line;}
 function measureResult(text,anchor,value=null){measurementCenter=anchor.clone();$('#measure-label').textContent=text;$('#measure-label').hidden=false;$('#measure-value').textContent=text;if(value!==null)stage.dataset.measureValue=String(value);else delete stage.dataset.measureValue;invalidate();}
 function distanceVisual(a,b){const separate=a.distanceToSquared(b)>1e-20;if(separate)measureStroke([a,b],0x267aac);for(const p of separate?[a,b]:[a]){const marker=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),new THREE.MeshBasicMaterial({color:0x267aac,depthTest:false,depthWrite:false}));marker.position.copy(p);marker.userData.measurementPoint=true;marker.renderOrder=21;scene.add(marker);measureObjects.push(marker);}}
 const mm=value=>value.toLocaleString('ru-RU',{maximumFractionDigits:2})+' мм';
 function rulerEdge(event){
  const best=findEdge(event);if(!best){status('Нажмите ближе к видимому ребру');return;}
  if(!event.ctrlKey&&!event.metaKey)rulerEdges.clear();
  if(rulerEdges.has(best.key))rulerEdges.delete(best.key);else rulerEdges.set(best.key,best);
  disposeMeasureVisuals();stage.dataset.measureSelection=String(rulerEdges.size);if(!rulerEdges.size){clearMeasurement();return;}
  const segments=[...rulerEdges.values()].flatMap(e=>{const points=e.points.map(p=>p.clone().applyMatrix4(e.item.mesh.matrixWorld));return points.slice(1).map((p,j)=>[points[j],p]);});
  segments.forEach(ends=>measureStroke(ends));
  const result=edgeMeasurement(segments.map(ends=>ends.map(p=>p.toArray())),.01/mmPerUnit);
  const center=new THREE.Vector3();segments.flat().forEach(p=>center.add(p));center.divideScalar(segments.length*2);
  if(result.kind==='ambiguous'){measureResult(`Выбрано ${result.groups} раздельных групп · оставьте две для расстояния`,center);return;}
  const value=result.value*mmPerUnit;
  if(result.kind==='length')measureResult((rulerEdges.size===1?'Длина ребра: ':'Сумма длин: ')+mm(value),center,value);
  else{const a=new THREE.Vector3(...result.a),b=new THREE.Vector3(...result.b);distanceVisual(a,b);measureResult('Расстояние между рёбрами: '+mm(value),a.clone().add(b).multiplyScalar(.5),value);}
  status(measurePrompt());
 }
 function rulerPlane(hit,event){
  if(!hit)return;const geometry=planarFace(hit.object,hit.faceIndex);if(!geometry){status('Выберите плоскую грань');return;}
  const duplicate=rulerFaces.findIndex(f=>f.itemId===hit.object.userData.itemId&&Math.abs(f.normal.dot(geometry.normal))>.99999&&Math.abs(f.normal.dot(hit.point.clone().sub(f.point)))<1e-5);
  if(duplicate>=0)rulerFaces.splice(duplicate,1);else{if(rulerFaces.length===2)rulerFaces=[];rulerFaces.push({...geometry,point:snapPoint(hit,event),itemId:hit.object.userData.itemId});}
  disposeMeasureVisuals();stage.dataset.measureSelection=String(rulerFaces.length);
  for(const f of rulerFaces){const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(f.vertices,3));const overlay=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0x008dff,transparent:true,opacity:.30,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}));overlay.renderOrder=10;scene.add(overlay);measureObjects.push(overlay);}
  if(!rulerFaces.length){clearMeasurement();return;}
  if(rulerFaces.length===1){measureResult('Плоскость 1 · выберите вторую',rulerFaces[0].point);return;}
  const result=planeMeasurement(...rulerFaces.map(f=>({normal:f.normal.toArray(),point:f.point.toArray()})));
  if(result.kind==='nonparallel'){measureResult(`Плоскости не параллельны · угол ${result.angle.toLocaleString('ru-RU',{maximumFractionDigits:1})}°`,rulerFaces[0].point.clone().add(rulerFaces[1].point).multiplyScalar(.5));return;}
  const a=new THREE.Vector3(...result.a),b=new THREE.Vector3(...result.b),value=result.value*mmPerUnit;distanceVisual(a,b);measureResult('Между плоскостями: '+mm(value),a.clone().add(b).multiplyScalar(.5),value);
 }
 function setMode(value){componentHover.hide();mode=value;controls.enabled=true;if(value!=='face')clearFace();if(value!=='edge')clearEdges();if(value==='edge'||value==='measure')select([]);updateEdgePanel();controls.mouseButtons.LEFT=value==='pan'?THREE.MOUSE.PAN:value==='zoom'?THREE.MOUSE.DOLLY:THREE.MOUSE.ROTATE;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===value));if(value!=='measure')clearMeasurement();status(value==='move'?'Зажмите левую кнопку на теле и перетащите его в плоскости экрана':value==='face'?'Щёлкните плоскую грань тела для выбора плоскости сечения':value==='edge'?'Щёлкайте рёбра для добавления к сумме · Повторный щелчок снимает выделение':value==='measure'?measurePrompt():value==='pan'?'Перетаскивайте модель левой кнопкой для перемещения':value==='zoom'?'Перетаскивайте мышь для изменения масштаба':'Щелчок — выделение · Левая кнопка — вращение · Средняя — сдвиг · Колёсико — масштаб');}
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
 function toolMenu(button,choices,onChoose,isAvailable=()=>true){const menu=document.createElement('div');menu.className='tool-choice-menu';menu.hidden=true;menu.setAttribute('role','group');document.body.append(menu);for(const [value,label] of choices){const choice=document.createElement('button');choice.type='button';choice.dataset.choice=value;choice.textContent=label;choice.onclick=()=>{menu.hidden=true;button.setAttribute('aria-expanded','false');onChoose(value);};menu.append(choice);}button.setAttribute('aria-expanded','false');button.onclick=()=>{const open=menu.hidden;document.querySelectorAll('.tool-choice-menu').forEach(m=>m.hidden=true);closeNavigation();menu.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){for(const choice of menu.children)choice.hidden=!isAvailable(choice.dataset.choice);const r=button.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-190,r.left))+'px';menu.style.bottom=(innerHeight-r.top+8)+'px';}};document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!button.contains(e.target)){menu.hidden=true;button.setAttribute('aria-expanded','false');}});document.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;button.setAttribute('aria-expanded','false');}});}
 let snapToVertices=true;
 toolMenu($('[data-mode="measure"]'),[
  ['planes','По плоскостям'],['points','По точкам'],['edges','По рёбрам'],['section','По сечению'],
  ['snap','Привязка к вершинам'],['clear','Очистить измерение'],['off','Завершить измерение']
 ],value=>{
  if(value==='snap'){
   clearRulerHover();
   snapToVertices=!snapToVertices;
   status(snapToVertices?'Привязка к вершинам включена':'Привязка к вершинам выключена');
   return;
  }
  if(value==='clear'){clearMeasurement();return;}
  if(value==='off'){setMode('orbit');return;}
  if(value==='section'&&!sectionOn){
   $('#section-toggle').click();
   return;
  }
  measureKind=value;
  clearMeasurement();
  setMode('measure');
 });
 const rulerPlaneGeometry=new THREE.BufferGeometry();
 const rulerHoverFace=new THREE.Mesh(rulerPlaneGeometry,new THREE.MeshBasicMaterial({
  color:0x008dff,side:THREE.DoubleSide,transparent:true,opacity:.30,depthWrite:false,
  polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-2
 }));
 const rulerHoverPoint=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),new THREE.MeshBasicMaterial({
  color:0xffb53e,depthTest:false,depthWrite:false
 }));
 rulerHoverFace.renderOrder=4;
 rulerHoverPoint.renderOrder=22;
 rulerHoverFace.visible=rulerHoverPoint.visible=false;
 scene.add(rulerHoverFace,rulerHoverPoint);

 const rulerHoverEdge=new LineSegments2(new LineSegmentsGeometry(),new LineMaterial({
  color:0xffb53e,linewidth:4,depthWrite:false
 }));
 rulerHoverEdge.renderOrder=19;
 rulerHoverEdge.visible=false;
 scene.add(rulerHoverEdge);
 let hoverEdgeKey=null,hoverPlaneHit=null,lastRulerHover=0;

 function clearRulerHover(){
  if(rulerHoverFace.visible||rulerHoverPoint.visible||rulerHoverEdge.visible)invalidate();
  rulerHoverFace.visible=rulerHoverPoint.visible=rulerHoverEdge.visible=false;
  rulerHoverFace.geometry=rulerPlaneGeometry;
  hoverEdgeKey=hoverPlaneHit=null;
  lastRulerHover=0;
 }

 function showRulerFace(geometry,clip){
  const material=rulerHoverFace.material;
  if(material.clippingPlanes!==clip){
   material.clippingPlanes=clip;
   material.needsUpdate=true;
  }
  rulerHoverFace.geometry=geometry;
  rulerHoverFace.visible=true;
 }

 function showRulerPoint(point,snapped){
  rulerHoverPoint.position.copy(point);
  rulerHoverPoint.material.color.setHex(snapped?0xffb53e:0x267aac);
  rulerHoverPoint.visible=true;
 }

 function pickSectionTarget(event){
  if(!sectionOn)return null;
  if(capsDirty)rebuildCaps();
  pointerRay(event);
  const hit=raycaster.intersectObjects(caps.children,false)[0];
  if(!hit)return null;
  const surface=pick(event);
  if(surface&&surface.distance<hit.distance-0.00001)return null;

  const point=plane.projectPoint(hit.point,new THREE.Vector3());
  let snapped=false;
  if(snapToVertices){
   const rect=renderer.domElement.getBoundingClientRect();
   const contour=hit.object.userData.contour;
   const vertex=new THREE.Vector3(),screen=new THREE.Vector3();
   let closest=event.pointerType==='touch'?22:14;
   for(let index=0;index<contour.count;index++){
    vertex.fromBufferAttribute(contour,index);
    screen.copy(vertex).project(camera);
    if(screen.z<-1||screen.z>1)continue;
    const dx=rect.left+(screen.x+1)*rect.width/2-event.clientX;
    const dy=rect.top+(1-screen.y)*rect.height/2-event.clientY;
    const distance=Math.hypot(dx,dy);
    if(distance>=closest)continue;
    closest=distance;
    plane.projectPoint(vertex,point);
    snapped=true;
   }
  }
  return {point,cap:hit.object,snapped};
 }

 renderer.domElement.addEventListener('pointermove',event=>{
  if(event.buttons||mode!=='measure'){clearRulerHover();return;}
  const now=performance.now();
  if(now-lastRulerHover<(measureKind==='edges'?70:24))return;
  lastRulerHover=now;

  if(measureKind==='section'){
   const target=pickSectionTarget(event);
   if(!target){clearRulerHover();return;}
   showRulerFace(target.cap.geometry,null);
   showRulerPoint(target.point,target.snapped);
  }else if(measureKind==='edges'){
   const edge=findEdge(event);
   if(!edge){clearRulerHover();return;}
   if(edge.key!==hoverEdgeKey){
    const positions=[];
    const world=edge.points.map(point=>point.clone().applyMatrix4(edge.item.mesh.matrixWorld));
    for(let i=1;i<world.length;i++)positions.push(...world[i-1].toArray(),...world[i].toArray());
    rulerHoverEdge.geometry.dispose();
    rulerHoverEdge.geometry=new LineSegmentsGeometry().setPositions(positions);
    hoverEdgeKey=edge.key;
   }
   const edgeClip=sectionOn?clipPlanes:null;
   if(rulerHoverEdge.material.clippingPlanes!==edgeClip){
    rulerHoverEdge.material.clippingPlanes=edgeClip;
    rulerHoverEdge.material.needsUpdate=true;
   }
   rulerHoverEdge.visible=true;
  }else{
   const hit=pick(event);
   if(!hit){clearRulerHover();return;}
   const point=snapPoint(hit,event);
   if(measureKind==='planes'){
    if(hoverPlaneHit?.object!==hit.object||hoverPlaneHit.faceIndex!==hit.faceIndex){
     const surface=planarFace(hit.object,hit.faceIndex);
     if(!surface){clearRulerHover();return;}
     rulerPlaneGeometry.dispose();
     rulerPlaneGeometry.setAttribute('position',new THREE.Float32BufferAttribute(surface.vertices,3));
     rulerPlaneGeometry.boundingSphere=null;
     hoverPlaneHit=hit;
    }
    showRulerFace(rulerPlaneGeometry,sectionOn?clipPlanes:null);
   }
   showRulerPoint(point,point.distanceToSquared(hit.point)>1e-20);
  }
  invalidate();
 });
 renderer.domElement.addEventListener('pointerleave',clearRulerHover);
 renderer.domElement.addEventListener('pointerdown',clearRulerHover);
 function pick(event){const r=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(mouse,camera);return raycaster.intersectObjects(items.filter(i=>i.visible).map(i=>i.mesh),false).find(h=>!sectionOn||plane.distanceToPoint(h.point)>=-.00001);}
 function snapPoint(hit,event){if(!snapToVertices)return hit.point.clone();const rect=renderer.domElement.getBoundingClientRect(),attr=hit.object.geometry.attributes.position;let best=hit.point.clone(),distance=event.pointerType==='touch'?22:14;for(const index of [hit.face.a,hit.face.b,hit.face.c]){const v=new THREE.Vector3().fromBufferAttribute(attr,index).applyMatrix4(hit.object.matrixWorld);if(sectionOn&&plane.distanceToPoint(v)<0)continue;const p=v.clone().project(camera),px=rect.left+(p.x+1)*rect.width/2,py=rect.top+(1-p.y)*rect.height/2;const d=Math.hypot(px-event.clientX,py-event.clientY);if(d<distance){distance=d;best=v;}}return best;}
 function addPoint(p){if(points.length===2)clearMeasurement();points.push(p);stage.dataset.measureSelection=String(points.length);disposeMeasureVisuals();if(points.length===1){distanceVisual(p,p);measureResult('Точка 1 · выберите вторую',p);return;}distanceVisual(...points);const delta=points[1].clone().sub(points[0]).multiplyScalar(mmPerUnit),distance=delta.length();measureResult((measureKind==='section'?'По сечению: ':'Между точками: ')+mm(distance)+` · ΔX ${Math.abs(delta.x).toFixed(1)} · ΔY ${Math.abs(delta.y).toFixed(1)} · ΔZ ${Math.abs(delta.z).toFixed(1)}`,points[0].clone().add(points[1]).multiplyScalar(.5),distance);}
 let pointerDown=null;renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)pointerDown={x:e.clientX,y:e.clientY};});renderer.domElement.addEventListener('pointerup',e=>{if(mode==='move'){pointerDown=null;return;}if(e.button!==0||!pointerDown)return;const moved=Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y);pointerDown=null;if(moved>5)return;if(mode==='edge'){chooseEdge(e);return;}if(mode==='measure'&&measureKind==='edges'){rulerEdge(e);return;}if(mode==='measure'&&measureKind==='section'){const target=pickSectionTarget(e);if(target)addPoint(target.point);return;}const hit=pick(e);if(mode==='face'){chooseFace(hit);return;}if(mode==='measure'){if(measureKind==='planes')rulerPlane(hit,e);else if(hit)addPoint(snapPoint(hit,e));}else if(['orbit','pan','zoom'].includes(mode))select(hit?[hit.object.userData.itemId]:[],hit);});renderer.domElement.addEventListener('dblclick',e=>{if(mode==='measure'||mode==='edge'||mode==='face'||mode==='move')return;const hit=pick(e);if(hit){select([hit.object.userData.itemId],hit);fit(null,true);}});
 function setFaceOffsetRange(offset){
  const extent=Math.max(1,Math.ceil(modelBox.getSize(new THREE.Vector3()).length()*mmPerUnit));
  faceOffsetRange.min=String(Math.min(-extent,offset));
  faceOffsetRange.max=String(Math.max(extent,offset));
  faceOffsetRange.value=String(offset);
 }
 function section(){clearEdges();sectionOn=$('#section-toggle').getAttribute('aria-pressed')==='true';let axis=$('#section-axis').value;const flip=$('#section-flip').checked?-1:1;
 if(axis==='face'&&!customSection){axis='x';$('#section-axis').value='x';status('Сначала выберите грань в режиме «Плоскости».');}
 const fromFace=axis==='face';$('#section-position').hidden=fromFace;faceOffsetRange.hidden=!fromFace;$('#section-offset-label').hidden=!fromFace;
 if(fromFace)setFaceOffsetRange(Number($('#section-offset').value)||0);
 if(fromFace){const offset=Number($('#section-offset').value)||0;plane.normal.copy(customSection.normal).multiplyScalar(flip);plane.constant=-plane.normal.dot(customSection.point.clone().addScaledVector(customSection.normal,offset/mmPerUnit));$('#section-value').textContent=offset+' мм от грани';}
 else{const index={x:0,y:1,z:2}[axis],value=Number($('#section-position').value)/100;const location=THREE.MathUtils.lerp(modelBox.min.getComponent(index),modelBox.max.getComponent(index),value);plane.normal.set(0,0,0).setComponent(index,flip);plane.constant=-location*flip;$('#section-value').textContent=Math.round(value*100)+'%';}
 materials.forEach(m=>{const next=sectionOn?clipPlanes:null;if(m.clippingPlanes!==next){m.clippingPlanes=next;m.needsUpdate=true;}});const nextClip=sectionOn?clipPlanes:null;if(edgeMaterial.clippingPlanes!==nextClip){edgeMaterial.clippingPlanes=nextClip;edgeMaterial.needsUpdate=true;}capsDirty=true;clearMeasurement();
 }
 $('#section-toggle').onclick=()=>{const on=$('#section-toggle').getAttribute('aria-pressed')!=='true';$('#section-toggle').setAttribute('aria-pressed',String(on));$('#section-panel').hidden=!on;if(on){setMode('orbit');controls.enabled=true;controls.enableRotate=true;$('#help-panel').hidden=true;}section();};['section-axis','section-position','section-flip','section-offset'].forEach(id=>$('#'+id).oninput=section);
 faceOffsetRange.oninput=()=>{
  const offset=Number(faceOffsetRange.value);
  if(sectionPanel.classList.contains('face-preview')){startFaceSection(offset);return;}
  $('#section-offset').value=String(offset);
  section();
 };
 toolMenu($('#section-toggle'),[
  ['x','Сечение по X'],['y','Сечение по Y'],['z','Сечение по Z'],
  ['face','От плоскости'],['face-start','Сечение от выбранной грани'],
  ['face-dxf','Скачать контур DXF'],['face-clear','Снять выбор грани'],
  ['off','Выключить сечение']
 ],value=>{
  if(value==='face'){setMode('face');status('Выберите плоскую грань модели.');return;}
  if(value==='face-start'){startFaceSection(0);return;}
  if(value==='face-dxf'){if(face)exportPart(face.item,face);return;}
  if(value==='face-clear'){clearFace();return;}
  const on=value!=='off';
  $('#section-toggle').setAttribute('aria-pressed',String(on));
  $('#section-panel').hidden=!on;
  if(on){$('#section-axis').value=value;$('#help-panel').hidden=true;}
  setMode('orbit');
  section();
 },value=>!value.startsWith('face-')||!!face);
 const componentCenters=new Map();for(const i of items){const key=i.path;if(!componentCenters.has(key))componentCenters.set(key,new THREE.Box3());componentCenters.get(key).union(i.box);}for(const [key,b] of componentCenters)componentCenters.set(key,b.getCenter(new THREE.Vector3()));
 function explodeModel(){capsDirty=true;clearFace();explode=Number($('#explode-range').value)/100;for(const i of items){const direction=componentCenters.get(i.path).clone().sub(modelBox.getCenter(new THREE.Vector3()));i.mesh.position.copy(i.base).addScaledVector(direction,explode*1.4);}scene.updateMatrixWorld(true);$('#explode-value').textContent=Math.round(explode*100)+'%';updateSelectionBox();clearMeasurement();}
 // Native Fusion hinges control the whole moving component, including fittings and labels.
 const jointToggle=$('#joints-toggle'),jointSelect=$('#joint-select'),jointRange=$('#joint-angle');
 jointToggle.hidden=!joints.length;
 jointSelect.replaceChildren(...joints.map((j,n)=>{const o=document.createElement('option');o.value=n;o.textContent=j.name;return o;}));
 function activeJoint(){return joints[Number(jointSelect.value)||0];}
 function syncJointPanel(){
  const j=activeJoint();if(!j)return;
  jointRange.min=THREE.MathUtils.radToDeg(j.minimum);jointRange.max=THREE.MathUtils.radToDeg(j.maximum);
  jointRange.value=THREE.MathUtils.radToDeg(j.angle);
  $('#joint-value').textContent=Math.round(THREE.MathUtils.radToDeg(j.angle))+'°';
  stage.dataset.jointAngles=JSON.stringify(joints.map(j=>THREE.MathUtils.radToDeg(j.angle)));
 }
 function driveJoint(value){
  const j=activeJoint();if(!j)return;
  clearFace();clearEdges();clearMeasurement();jointController.setAngle(j,value);
  scene.updateMatrixWorld(true);capsDirty=true;if(selected.length)select([...selected]);syncJointPanel();activity();
 }
 jointToggle.onclick=()=>{const open=$('#joints-panel').hidden;$('#joints-panel').hidden=!open;jointToggle.setAttribute('aria-pressed',String(open));syncJointPanel();};
 jointSelect.onchange=syncJointPanel;
 jointRange.oninput=()=>driveJoint(THREE.MathUtils.degToRad(Number(jointRange.value)));
 $('#joint-open').onclick=()=>{const j=activeJoint();driveJoint(Math.abs(j.maximum-j.initialAngle)>Math.abs(j.minimum-j.initialAngle)?j.maximum:j.minimum);};
 $('#joint-close').onclick=()=>driveJoint(activeJoint().initialAngle);
 $('#joint-fit').onclick=()=>{const j=activeJoint();if(j){showAll();select(j.members.map(i=>i.id));fit(null,true);}};
 syncJointPanel();
 $('#explode-toggle').onclick=()=>{const open=$('#explode-panel').hidden;$('#explode-panel').hidden=!open;$('#explode-toggle').setAttribute('aria-pressed',String(open));if(!open){$('#explode-range').value='0';explodeModel();}};$('#explode-range').oninput=explodeModel;
 function homeView(){
  if(!fusionView){fit(dirs.iso);return;}
  const v=fusionView,toScene=p=>new THREE.Vector3(...p).sub(center).multiplyScalar(scale);
  if(v.orthographic){const half=v.height*scale/2,aspect=stage.clientWidth/Math.max(1,stage.clientHeight);camera=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.01,radius*100);}
  else camera=new THREE.PerspectiveCamera(v.fov||40,stage.clientWidth/Math.max(1,stage.clientHeight),.01,radius*100);
  // Fusion exports screen-up, which is tilted in isometry. Orbit around the model's world vertical.
  camera.position.copy(toScene(v.eye));camera.up.set(0,1,0);
  if(Math.abs(camera.position.clone().sub(toScene(v.target)).normalize().y)>.999999)camera.up.set(...v.up).normalize();
  controls.object=camera;controls.target.copy(toScene(v.target));controls.update();camera.updateProjectionMatrix();stage.dataset.homeView='fusion';
 }
 if(fusionView){iconButton($('#home'),'home','Домашний вид — как в Fusion');}
 $('#move-selected').onclick=()=>{setMode('move');status('Перетащите выбранную деталь левой кнопкой мыши · Esc — вернуться к вращению');};
 $('#hide').onclick=()=>setVisible(selected,false);$('#isolate').onclick=isolate;$('#show-all').onclick=showAll;$('#fit-selected').onclick=()=>fit(null,true);$('#home').onclick=homeView;$('#fit').onclick=()=>fit(null,selected.length>0);
 const orientationCube=createViewCube({host:$('.viewcube'),onHome:homeView,onRoll:direction=>{camera.up.applyAxisAngle(camera.getWorldDirection(new THREE.Vector3()),-direction*Math.PI/2);controls.update();activity();},
  onNavigate:values=>{
   const direction=new THREE.Vector3(...values);
   if(!camera.isOrthographicCamera){const previous=camera;camera=new THREE.OrthographicCamera(-10,10,10,-10,.01,radius*30);camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);controls.object=camera;}
   camera.up.set(0,1,0);if(!direction.x&&!direction.z)camera.up.set(0,0,direction.y>0?-1:1);
   fit(direction);activity();
  },onDrag:(dx,dy)=>{
   interacting=true;
   const frame=new THREE.Quaternion().setFromUnitVectors(camera.up.clone().normalize(),new THREE.Vector3(0,1,0));
   const offset=camera.position.clone().sub(controls.target).applyQuaternion(frame),spherical=new THREE.Spherical().setFromVector3(offset);
   spherical.theta-=dx*.012;spherical.phi=THREE.MathUtils.clamp(spherical.phi-dy*.012,.001,Math.PI-.001);
   offset.setFromSpherical(spherical).applyQuaternion(frame.invert());camera.position.copy(controls.target).add(offset);controls.update();activity();
  },onEnd:()=>{interacting=false;activity();recordAction();}
 });
 $('#reset').onclick=()=>{jointController.reset();syncJointPanel();customSection=null;$('#section-axis').value='x';$('#section-flip').checked=false;showAll();select([]);$('#explode-range').value='0';explodeModel();$('#section-toggle').setAttribute('aria-pressed','false');$('#section-panel').hidden=true;section();$('#explode-panel').hidden=true;$('#explode-toggle').setAttribute('aria-pressed','false');setMode('orbit');homeView();};
 $('#help').onclick=()=>$('#help-panel').hidden=!$('#help-panel').hidden;$('#help-close').onclick=()=>$('#help-panel').hidden=true;
 $('#snapshot').onclick=()=>{if(capsDirty)rebuildCaps();renderView(true);const a=document.createElement('a');a.href=renderer.domElement.toDataURL('image/png');a.download='Территория здоровья — 3D.png';a.click();};
 function resize(){const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);renderer.setSize(w,h,false);composer.setSize(w,h);edgeMaterial.resolution.set(w,h);cutOutlineMaterial.resolution.set(w,h);if(camera.isOrthographicCamera){camera.left=-camera.top*w/h;camera.right=-camera.left;}else camera.aspect=w/h;camera.updateProjectionMatrix();activity();}resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);resize();homeView();fit(null,false);
 document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key.toLowerCase()==='f'){e.preventDefault();fit(null,selected.length>0);}if(e.key.toLowerCase()==='h'&&selected.length)setVisible(selected,false);if(e.key.toLowerCase()==='i')isolate();if(e.key==='Escape'){select([]);setMode('orbit');$('#help-panel').hidden=true;}});
 document.querySelectorAll('button').forEach(b=>b.disabled=false);loading.hidden=true;$('#info').textContent=`${items.length} тел · мм`;stage.dataset.meshes=String(items.length);stage.dataset.textures=String(textures.size);stage.dataset.ready='true';setMode('orbit');

 // Undoable viewer state. Selection and open tools are restored with an action,
 // but selecting a body or opening a panel alone does not consume a history step.
 const undoButton=document.createElement('button'),redoButton=document.createElement('button');
 for(const [button,id,label,path] of [
  [undoButton,'viewer-undo','Назад — отменить действие','M9 5l-5 5 5 5M4 10h9a7 7 0 0 1 7 7'],
  [redoButton,'viewer-redo','Вперёд — повторить действие','M15 5l5 5-5 5M20 10h-9a7 7 0 0 0-7 7']]){
  button.id=id;button.className='icon-button';button.setAttribute('aria-label',label);
  button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
 }
 const historyDivider=document.createElement('span');historyDivider.className='divider';
 $('.toolbar').prepend(undoButton,redoButton,historyDivider);
 let historyRestoring=false,historyTimer;
 function captureViewer(){
  return {
   bodies:items.map(i=>[i.visible,...i.mesh.position.toArray(),...i.mesh.quaternion.toArray(),...i.base.toArray()]),joints:jointController.capture(),selected:[...selected],mode,
   camera:{type:camera.type,position:camera.position.toArray(),up:camera.up.toArray(),target:controls.target.toArray(),
    near:camera.near,far:camera.far,zoom:camera.zoom,fov:camera.fov,top:camera.top,bottom:camera.bottom,left:camera.left,right:camera.right},
   section:{on:sectionOn,axis:$('#section-axis').value,value:$('#section-position').value,offset:$('#section-offset').value,flip:$('#section-flip').checked,
    custom:customSection?{normal:customSection.normal.toArray(),point:customSection.point.toArray()}:null},
   explode:$('#explode-range').value,explodeOpen:!$('#explode-panel').hidden,
   background:darkBackground,antialias:antialiasOn,numbers:$('#part-numbers')?.getAttribute('aria-pressed')||null
  };
 }
 function restoreViewer(state){
  historyRestoring=true;
  try{
   if(dragBody){const pointer=dragBody.pointer;dragBody=null;if(renderer.domElement.hasPointerCapture(pointer))renderer.domElement.releasePointerCapture(pointer);}
   controls.enabled=true;clearFace();clearEdges();clearMeasurement();
   items.forEach((i,index)=>{const [visible,x,y,z,qx,qy,qz,qw,bx,by,bz]=state.bodies[index];i.visible=visible;i.mesh.visible=visible;i.mesh.position.set(x,y,z);i.mesh.quaternion.set(qx,qy,qz,qw);i.base.set(bx,by,bz);});
   jointController.restore(state.joints);syncJointPanel();
   explode=Number(state.explode)/100;$('#explode-range').value=state.explode;$('#explode-value').textContent=Math.round(explode*100)+'%';
   $('#explode-panel').hidden=!state.explodeOpen;$('#explode-toggle').setAttribute('aria-pressed',String(state.explodeOpen));
   customSection=state.section.custom?{normal:new THREE.Vector3(...state.section.custom.normal),point:new THREE.Vector3(...state.section.custom.point)}:null;
   $('#section-axis').value=state.section.axis;$('#section-position').value=state.section.value;$('#section-offset').value=state.section.offset;$('#section-flip').checked=state.section.flip;
   $('#section-toggle').setAttribute('aria-pressed',String(state.section.on));$('#section-panel').hidden=!state.section.on;section();
   const c=state.camera,aspect=stage.clientWidth/Math.max(1,stage.clientHeight);
   camera=c.type==='OrthographicCamera'?new THREE.OrthographicCamera(c.left,c.right,c.top,c.bottom,c.near,c.far):new THREE.PerspectiveCamera(c.fov,aspect,c.near,c.far);
   camera.zoom=c.zoom;camera.position.fromArray(c.position);camera.up.fromArray(c.up);controls.object=camera;controls.target.fromArray(c.target);controls.update();
   if(camera.isOrthographicCamera){camera.left=-camera.top*aspect;camera.right=-camera.left;}camera.updateProjectionMatrix();
   if(darkBackground!==state.background)$('#background').click();
   if(antialiasOn!==state.antialias)$('#antialias').click();
   if(state.numbers!==null&&$('#part-numbers')?.getAttribute('aria-pressed')!==state.numbers)$('#part-numbers').click();
   setMode(state.mode);select(state.selected.filter(id=>items[id]?.visible));scene.updateMatrixWorld(true);syncTree();capsDirty=true;activity();
  }finally{historyRestoring=false;}
 }
 function historyKey(s){
  const c=s.camera;
  // Horizontal frustum changes with sidebar/window width, not user edits.
  return JSON.stringify({bodies:s.bodies,joints:s.joints,section:s.section,explode:s.explode,background:s.background,antialias:s.antialias,numbers:s.numbers,
   camera:{type:c.type,position:c.position,up:c.up,target:c.target,zoom:c.zoom,fov:c.fov,top:c.top,bottom:c.bottom}},
   (key,value)=>typeof value==='number'?Math.round(value*1e6)/1e6:value);
 }
 const history=createHistory({capture:captureViewer,restore:restoreViewer,key:historyKey,onChange:state=>{
  undoButton.disabled=!state.canUndo;redoButton.disabled=!state.canRedo;
  undoButton.title='Назад — отменить действие (Ctrl+Z)';redoButton.title='Вперёд — повторить действие (Ctrl+Shift+Z / Ctrl+Y)';
  stage.dataset.undoCount=String(state.undoCount);stage.dataset.redoCount=String(state.redoCount);
 }});
 function navigateHistory(forward){clearTimeout(historyTimer);const changed=forward?history.redo():history.undo();if(changed)status(forward?'Действие повторено':'Действие отменено');invalidate();}
 undoButton.onclick=()=>navigateHistory(false);redoButton.onclick=()=>navigateHistory(true);
 const recordAction=()=>{if(!historyRestoring)queueMicrotask(()=>history.record());};
 document.addEventListener('click',e=>{if(!e.target.closest('#viewer-undo,#viewer-redo'))recordAction();});
 document.addEventListener('change',recordAction);
 renderer.domElement.addEventListener('pointerup',recordAction);
 controls.addEventListener('end',()=>{if(historyRestoring)return;clearTimeout(historyTimer);historyTimer=setTimeout(()=>history.record(),200);});
 document.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea,[contenteditable="true"]'))return;
  const k=e.code==='KeyZ'?'z':e.code==='KeyY'?'y':e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&(k==='z'||k==='y')){e.preventDefault();navigateHistory(k==='y'||e.shiftKey);}
  else if(!e.ctrlKey&&!e.metaKey&&!e.altKey)recordAction();
 });
 if(items.length>200&&params.get('batch')!=='off')interactionBatch=createInteractionBatch({items,edges,edgeMaterial,scene});
 function tick(){raf=requestAnimationFrame(tick);controls.update();quality();if(interactionBatch&&!interacting&&batchDirty){const began=performance.now();const changed=interactionBatch.refresh();if(changed)interactionBatch.render(()=>renderer.compile(scene,camera));batchDirty=false;stage.dataset.batchBuildMs=(performance.now()-began).toFixed(2);stage.dataset.batchedBodies=String(interactionBatch.stats.bodies);stage.dataset.batchCalls=String(interactionBatch.stats.calls);}contactDepthUniforms.contactClipRange.value.set(camera.near,camera.far);if(capsDirty){rebuildCaps();invalidate();}if(measurementCenter){const p=measurementCenter.clone().project(camera),label=$('#measure-label');label.hidden=p.z>1||p.z< -1;const half=label.offsetWidth/2+12,height=label.offsetHeight+12;label.style.left=THREE.MathUtils.clamp((p.x+1)*stage.clientWidth/2,half,Math.max(half,stage.clientWidth-half))+'px';label.style.top=THREE.MathUtils.clamp((1-p.y)*stage.clientHeight/2-12,height,Math.max(height,stage.clientHeight-12))+'px';}if(renderDirty){camera.updateMatrixWorld(true);for(const marker of measureObjects)if(marker.userData.measurementPoint)marker.scale.setScalar(measurementMarkerRadius(camera,marker.position,stage.clientHeight));if(rulerHoverPoint.visible)rulerHoverPoint.scale.setScalar(measurementMarkerRadius(camera,rulerHoverPoint.position,stage.clientHeight));stage.dataset.measureMarkerPixels='7';orientationCube.update(camera.quaternion);positionSelectionCard();renderView();}}tick();
 addEventListener('pagehide',()=>{cancelAnimationFrame(raf);componentHover.dispose();orientationCube.dispose();interactionBatch?.dispose();resizeObserver.disconnect();controls.dispose();clearFace();sectionOn=false;rebuildCaps();cutOutlineMaterial.dispose();rulerPlaneGeometry.dispose();rulerHoverFace.material.dispose();rulerHoverPoint.geometry.dispose();rulerHoverPoint.material.dispose();rulerHoverEdge.geometry.dispose();rulerHoverEdge.material.dispose();clearEdges();clearMeasurement();items.forEach(i=>i.mesh.geometry.dispose());edges.forEach(e=>{e.geometry.dispose();e.userData.sourceGeometry.dispose();});materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());edgeMaterial.dispose();environment.dispose();composer.dispose();outputPass.dispose();fxaaPass.dispose();renderer.dispose();},{once:true});
}catch(error){console.error(error);loading.textContent='Не удалось открыть модель: '+error.message;loading.classList.add('error');}
$('#full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('#status').textContent='Откройте просмотрщик в отдельной вкладке для полноэкранного режима.';}};
document.addEventListener('fullscreenchange',()=>{iconButton($('#full'),'full',document.fullscreenElement?'Свернуть':'На весь экран');});
