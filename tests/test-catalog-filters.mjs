import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../catalog-filters.js',import.meta.url),'utf8');
const {projectCategory,matchesCollection,filterProjects,navigationCounts,collectionTitle,moveProject,furnitureTypes,projectGroups,mergeProjects,separateProject}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const samples=[
 {id:'stand',title:'Стенд с ресепшеном',customer:'А',date:'2025-01-02',status:'Реализовано'},
 {id:'shelf',title:'Стеллаж 3 полки',customer:'А',date:'2024-01-02',status:'На стадии проекта'},
 {id:'desk',title:'РЕСЕПШЕН №2',customer:'Б',date:'2025-03-04',status:'Реализовано'},
 {id:'octa',title:'витрина октанорм 500Х500'},
 {id:'promo',title:'Промо-стойка'},
 {id:'entry',title:'входная арка'},
 {id:'table',title:'стол 3600х900'},
 {id:'folder',title:'VR 1',fusionFolderPath:'Короба EES/!!!мебель EES'},
 {id:'old',title:'Стеллаж старый',archived:true,customer:'Б',date:'2025-01-01',status:'Реализовано'},
 {id:'rejected',title:'ФПП №2',status:'Не согласовано'},
 {id:'override',title:'Ресепшен в составе стенда',category:'stands',furnitureType:'receptions'},
];
const ids=(collection,filters)=>filterProjects(samples,collection,filters).map(row=>row.id);
assert.deepEqual(ids({view:'stands'}),['stand','rejected','override']);
assert.deepEqual(ids({view:'furniture',furnitureType:'receptions'}),['desk']);
assert.deepEqual(ids({view:'furniture',furnitureType:'shelves'}),['shelf']);
assert.deepEqual(ids({view:'furniture',furnitureType:'octanorm'}),['octa']);
assert.deepEqual(ids({view:'furniture',furnitureType:'promo'}),['promo']);
assert.deepEqual(ids({view:'furniture',furnitureType:'entrances'}),['entry']);
assert.deepEqual(ids({view:'furniture'},{query:'РЕСЕП',customer:'Б',status:'Реализовано',year:'2025'}),['desk']);
assert.deepEqual(ids({view:'archive'},{customer:'Б',year:'2025'}),['old']);
assert.ok(!ids({view:'all'}).includes('old'));
assert.ok(ids({view:'all'}).includes('rejected'),'Status and age do not archive a project');
assert.equal(projectCategory(samples.find(p=>p.id==='folder')).category,'furniture');
assert.equal(projectCategory(samples.find(p=>p.id==='table')).furnitureType,'');
assert.equal(projectCategory({title:'Стеллаж',category:'furniture',furnitureType:'promo'}).furnitureType,'promo');
assert.equal(collectionTitle({view:'furniture',furnitureType:'shelves'}),'Мебель / Стеллажи');
const counts=navigationCounts(samples);
assert.deepEqual(counts,{all:10,stands:3,furniture:7,archive:1,shelves:1,receptions:1,octanorm:1,promo:1,entrances:1});
const archived={...samples[2],category:'furniture',furnitureType:'receptions',archived:true};
assert.equal(matchesCollection(archived,{view:'furniture'}),false);
assert.equal(matchesCollection({...archived,archived:false},{view:'furniture',furnitureType:'receptions'}),true);
console.log('PASS: catalogue sections, all furniture types, combined filters, explicit overrides, archive and restore.');
const project={...samples[0],viewerPath:'/fixed-route',fusionDataFileId:'source-id',modelUrl:'assets/model.glb',designUrl:'assets/design.pdf',attachments:[{id:'original-file'}]};
const before=structuredClone(project);
for(const destination of ['stands','furniture',...furnitureTypes.map(type=>'furniture/'+type.id),'archive']){
 const moved=moveProject(project,destination);
 assert.notEqual(moved,project);
 assert.deepEqual(project,before,'Moving does not mutate the source record');
 for(const key of Object.keys(before))assert.deepEqual(moved[key],before[key],'Moving preserves '+key);
 assert.equal(moved.attachments,project.attachments,'File references stay intact');
 assert.equal(moved.archived,destination==='archive');
 if(destination!=='archive'){
  const [category,type='']=destination.split('/');
  assert.deepEqual(projectCategory(moved),{category,furnitureType:type});
 }
}
const intoArchive=moveProject(moveProject(project,'furniture/receptions'),'archive');
assert.equal(intoArchive.category,'furniture');assert.equal(intoArchive.furnitureType,'receptions');
assert.equal(moveProject(intoArchive,'furniture/receptions').archived,false);
for(const destination of ['invalid','stands/shelves','furniture/no-such-type','furniture/shelves/extra'])assert.throws(()=>moveProject(project,destination));
console.log('PASS: moving across every section, archive restore, source fields and file references preserved, invalid targets rejected.');
const groupSource=[
 {...project,id:'main',title:'Стенд выставки'},
 {...project,id:'part',title:'Ресепшен отдельный',viewerPath:'/part',fusionDataFileId:'part-source'},
 {...project,id:'third',title:'Стеллаж отдельный',viewerPath:'/third'},
 {...project,id:'other',title:'Другой стенд',viewerPath:'/other'},
];
const originalGroup=structuredClone(groupSource);
const changes=mergeProjects(groupSource,['main','part','third'],'main');
const withUpdates=(rows,updates)=>rows.map(row=>updates.find(update=>update.id===row.id)||row);
const combined=withUpdates(groupSource,changes),groups=projectGroups(combined);
assert.deepEqual(groupSource,originalGroup);
assert.deepEqual(groups.roots.map(p=>p.id),['main','other']);
assert.deepEqual(groups.parts.get('main').map(p=>p.id),['part','third']);
for(const changed of changes){
 const old=groupSource.find(p=>p.id===changed.id);
 for(const key of Object.keys(old))assert.deepEqual(changed[key],old[key],'Grouping preserves '+key);
 assert.equal(changed.attachments,old.attachments);
}
assert.deepEqual(filterProjects(combined,{view:'all'},{query:'Ресепшен отдельный'}).map(p=>p.id),['main']);
assert.equal(navigationCounts(combined).all,2);
const regrouped=withUpdates(combined,mergeProjects(combined,['main','other'],'other'));
assert.equal(projectGroups(regrouped).roots.length,1);
assert.deepEqual(projectGroups(regrouped).parts.get('other').map(p=>p.id),['main','part','third']);
const detached=withUpdates(combined,[separateProject(combined.find(p=>p.id==='part'))]);
assert.deepEqual(projectGroups(detached).roots.map(p=>p.id),['main','part','other']);
assert.equal(detached.find(p=>p.id==='part').viewerPath,'/part');
assert.equal(projectGroups([{id:'orphan',parentProjectId:'missing'}]).roots.length,1);
assert.equal(projectGroups([{id:'a',parentProjectId:'b'},{id:'b',parentProjectId:'a'}]).roots.length,2);
assert.throws(()=>mergeProjects(combined,['main','part'],'main'));
assert.throws(()=>mergeProjects(groupSource,['main'],'main'));
assert.throws(()=>mergeProjects(groupSource,['main','part'],'other'));
console.log('PASS: reversible grouping, regrouping existing groups, child-name search, source identity preservation and invalid selection guards.');
