import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../catalog-filters.js',import.meta.url),'utf8');
const {projectCategory,matchesCollection,filterProjects,navigationCounts,collectionTitle}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
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
