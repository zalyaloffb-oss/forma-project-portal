// Finite-segment distance, not distance between infinite supporting lines.
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const along=(a,u,t)=>a.map((v,i)=>v+u[i]*t),clamp=v=>Math.max(0,Math.min(1,v));
// Reassemble smooth stroke segments into a pickable curve, stopping at CAD junctions/corners.
export function stitchEdges(segments){
 const key=p=>p.map(x=>Math.round(x/1e-7)).join(','),nodes=new Map(),links=[],unique=new Set();
 for(const [a,b] of segments){const ka=key(a),kb=key(b),pair=[ka,kb].sort().join('|');if(ka===kb||unique.has(pair))continue;unique.add(pair);const id=links.length;links.push([ka,kb]);for(const [k,p] of [[ka,a],[kb,b]]){if(!nodes.has(k))nodes.set(k,{point:p,links:[]});nodes.get(k).links.push(id);}}
 const other=(id,k)=>links[id].find(x=>x!==k);
 function smooth(k){const n=nodes.get(k);if(n.links.length!==2)return false;const [a,b]=n.links.map(id=>sub(nodes.get(other(id,k)).point,n.point));return dot(a,b)/Math.sqrt(dot(a,a)*dot(b,b))< -Math.cos(25*Math.PI/180);}
 const used=new Set(),paths=[];
 function walk(start,id){const path=[nodes.get(start).point];let k=start;
  while(!used.has(id)){used.add(id);k=other(id,k);path.push(nodes.get(k).point);if(!smooth(k))break;const next=nodes.get(k).links.find(x=>!used.has(x));if(next===undefined)break;id=next;}paths.push(path);
 }
 for(const [k,n] of nodes)if(!smooth(k))for(const id of n.links)if(!used.has(id))walk(k,id);
 links.forEach((link,id)=>{if(!used.has(id))walk(link[0],id);});return paths;
}
export function closestSegments(a,b,c,d){
 const u=sub(b,a),v=sub(d,c),w=sub(a,c),aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w),eps=1e-20;
 let s=0,t=0;
 if(aa<=eps&&cc<=eps){}
 else if(aa<=eps)t=clamp(ee/cc);
 else if(cc<=eps)s=clamp(-dd/aa);
 else{const denominator=aa*cc-bb*bb;s=denominator>1e-12*aa*cc?clamp((bb*ee-cc*dd)/denominator):0;t=(bb*s+ee)/cc;if(t<0){t=0;s=clamp(-dd/aa);}else if(t>1){t=1;s=clamp((bb-dd)/aa);}}
 const p=along(a,u,s),q=along(c,v,t);return {a:p,b:q,distance:Math.hypot(...sub(q,p))};
}
export function edgeMeasurement(segments,tolerance=1e-6){
 if(!segments.length)return null;
 const parent=segments.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++)if(closestSegments(...segments[i],...segments[j]).distance<=tolerance)parent[find(i)]=find(j);
 const groups=new Map();segments.forEach((s,i)=>{const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);});
 if(groups.size===1)return {kind:'length',value:segments.reduce((sum,[a,b])=>sum+Math.hypot(...sub(b,a)),0),a:segments[0][0],b:segments.at(-1)[1]};
 if(groups.size!==2)return {kind:'ambiguous',groups:groups.size};
 const [first,second]=[...groups.values()];let nearest=null;
 for(const a of first)for(const b of second){const candidate=closestSegments(...a,...b);if(!nearest||candidate.distance<nearest.distance)nearest=candidate;}
 return {kind:'distance',value:nearest.distance,a:nearest.a,b:nearest.b};
}
export function planeMeasurement(first,second){
 const cosine=dot(first.normal,second.normal),angle=Math.acos(Math.min(1,Math.abs(cosine)))*180/Math.PI;
 if(Math.abs(cosine)<1-1e-8)return {kind:'nonparallel',angle};
 const offset=dot(sub(second.point,first.point),first.normal);
 return {kind:'distance',value:Math.abs(offset),a:along(second.point,first.normal,-offset),b:second.point};
}
