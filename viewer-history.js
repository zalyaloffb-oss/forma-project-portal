// Plain snapshots keep history independent of Three.js objects and GPU resources.
export function createHistory({capture,restore,key=JSON.stringify,onChange=()=>{},limit=80}){
 let states=[],index=-1,applying=false;
 const clone=state=>structuredClone(state);
 const notify=()=>onChange({canUndo:index>0,canRedo:index<states.length-1,undoCount:index,redoCount:states.length-index-1});
 function record(){
  if(applying)return;
  const state=clone(capture()),signature=key(state);
  if(index>=0&&states[index].signature===signature)return;
  states.splice(index+1);states.push({state,signature});index=states.length-1;
  if(states.length>limit+1){states.shift();index--;}
  notify();
 }
 function go(direction){
  record();const next=index+direction;if(next<0||next>=states.length)return false;
  applying=true;
  try{
   restore(clone(states[next].state));index=next;
   // Camera controls may normalize floating-point values while restoring.
   const state=clone(capture());states[index]={state,signature:key(state)};
  }finally{applying=false;notify();}
  return true;
 }
 record();
 return {record,undo:()=>go(-1),redo:()=>go(1)};
}
