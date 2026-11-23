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

export function projectGroups(projects){
 const byId=new Map(projects.map(project=>[project.id,project])),rootIds=new Map(),parts=new Map(),roots=[];
 for(const project of projects){
  let root=project;const visited=new Set([project.id]);
  while(root.parentProjectId&&byId.has(root.parentProjectId)){
   if(visited.has(root.parentProjectId)){root=project;break;}
   root=byId.get(root.parentProjectId);visited.add(root.id);
  }
  rootIds.set(project.id,root.id);
  if(root.id===project.id)roots.push(project);
  else {if(!parts.has(root.id))parts.set(root.id,[]);parts.get(root.id).push(project);}
 }
 return {byId,rootIds,roots,parts};
}

export function mergeProjects(projects,selectedIds,primaryId){
 const ids=new Set(selectedIds),groups=projectGroups(projects);
 if(ids.size<2||!ids.has(primaryId))throw Error('Выберите минимум два проекта и основной проект.');
 for(const id of ids)if(!groups.byId.has(id)||groups.rootIds.get(id)!==id)
  throw Error('Выберите самостоятельные проекты. Вложенную часть сначала отделите.');
 const updates=[];
 for(const project of projects){
  const rootId=groups.rootIds.get(project.id);
  if(project.id!==primaryId&&ids.has(rootId)&&project.parentProjectId!==primaryId)
   updates.push({...project,parentProjectId:primaryId});
 }
 return updates;
}

export function separateProject(project){return {...project,parentProjectId:''};}

export function filterProjects(projects,collection,filters={}){
 const query=String(filters.query||'').trim().toLocaleLowerCase('ru');
 const groups=projectGroups(projects);
 return groups.roots.filter(project=>matchesCollection(project,collection)&&
  (!query||[project,...(groups.parts.get(project.id)||[])].some(part=>[part.title,part.customer,part.event,part.manager].some(value=>String(value||'').toLocaleLowerCase('ru').includes(query))))&&
  (!filters.customer||project.customer===filters.customer)&&
  (!filters.status||project.status===filters.status)&&
  (!filters.year||String(project.date||'').startsWith(filters.year)));
}

export function navigationCounts(projects){
 const counts={all:0,stands:0,furniture:0,archive:0,...Object.fromEntries(furnitureTypes.map(type=>[type.id,0]))};
 for(const project of projectGroups(projects).roots){
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
