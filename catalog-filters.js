export const furnitureTypes=Object.freeze([
 {id:'shelves',label:'Стеллажи'},
 {id:'receptions',label:'Ресепшены'},
 {id:'octanorm',label:'Октанорм'},
 {id:'promo',label:'Промо стойки'},
 {id:'entrances',label:'Входные группы'},
]);
const typeIds=new Set(furnitureTypes.map(type=>type.id));

// Explicit editor choices always take precedence over names from older exports.
export function projectCategory(project){
 if(['stands','furniture'].includes(project.category))return {
  category:project.category,
  furnitureType:project.category==='furniture'&&typeIds.has(project.furnitureType)?project.furnitureType:'',
 };
 const title=String(project.title||'').toLocaleLowerCase('ru').replace(/[_-]+/g,' ');
 const folder=String(project.fusionFolderPath||'').toLocaleLowerCase('ru');
 let furnitureType='';
 if(/октанорм|октонорм|octanorm/u.test(title))furnitureType='octanorm';
 else if(/(?:^|\s)стенд(?:\s|$)/u.test(title))return {category:'stands',furnitureType:''};
 else if(/ресепш|ресепц|reception/u.test(title))furnitureType='receptions';
 else if(/стеллаж|стелаж/u.test(title))furnitureType='shelves';
 else if(/промо|инфостенд|информационн.*стойк/u.test(title))furnitureType='promo';
 else if(/входн.*(?:групп|арк|портал)/u.test(title))furnitureType='entrances';
 const furniture=furnitureType||/мебель/u.test(folder)||
  /витрин|(?:^|\s)стол(?:\s|$)|столешниц|стул|стуль|шкаф|тумб|кашпо|полк|подставк|тачпанел|vr панел|барн.*стойк/u.test(title);
 return {category:furniture?'furniture':'stands',furnitureType};
}

export function moveProject(project,destination){
 if(destination==='archive')return {...project,...projectCategory(project),archived:true};
 const [category,furnitureType='',...extra]=String(destination).split('/');
 if(extra.length||!['stands','furniture'].includes(category)||
  (category==='stands'&&furnitureType)||(furnitureType&&!typeIds.has(furnitureType)))
  throw Error('Выберите раздел из списка.');
 return {...project,category,furnitureType,archived:false};
}

export function matchesCollection(project,{view='all',furnitureType=''}={}){
 const archived=project.archived===true;
 if(view==='archive')return archived;
 if(archived)return false;
 if(view==='all')return true;
 const category=projectCategory(project);
 return category.category===view&&(!furnitureType||category.furnitureType===furnitureType);
}

export function filterProjects(projects,collection,filters={}){
 const query=String(filters.query||'').trim().toLocaleLowerCase('ru');
 return projects.filter(project=>matchesCollection(project,collection)&&
  (!query||[project.title,project.customer,project.event,project.manager].some(value=>String(value||'').toLocaleLowerCase('ru').includes(query)))&&
  (!filters.customer||project.customer===filters.customer)&&
  (!filters.status||project.status===filters.status)&&
  (!filters.year||String(project.date||'').startsWith(filters.year)));
}

export function navigationCounts(projects){
 const counts={all:0,stands:0,furniture:0,archive:0,...Object.fromEntries(furnitureTypes.map(type=>[type.id,0]))};
 for(const project of projects){
  if(project.archived===true){counts.archive++;continue;}
  counts.all++;
  const category=projectCategory(project);
  counts[category.category]++;
  if(category.furnitureType)counts[category.furnitureType]++;
 }
 return counts;
}

export function collectionTitle({view='all',furnitureType=''}={}){
 const title={all:'Все проекты',stands:'Стенды',furniture:'Мебель',archive:'Архив'}[view]||'Все проекты';
 const type=furnitureTypes.find(type=>type.id===furnitureType);
 return view==='furniture'&&type?title+' / '+type.label:title;
}
