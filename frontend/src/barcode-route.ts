import type { PlanDocument, PlanObject } from './warehouse-plan-model.ts'

export type RoutePoint = { x: number; y: number }
export type RackRoute = { entranceId: string; entranceLabel: string; points: RoutePoint[]; distance: number }
// Client projection of Shipping/ShipmentRouteOrder's free-floor geometry and 96-column
// grid policy. Keeps predecessor nodes for a single-rack visual route; does not change
// shipment ordering. Coordinates are plan-relative, not measured metres. No aisle required.
type P = RoutePoint
function rect(o: PlanObject, aspect: number) {
  const x=o.x*aspect,y=o.y,w=o.width*aspect,h=o.height,c=Math.cos(o.rotation*Math.PI/180),s=Math.sin(o.rotation*Math.PI/180)
  const local=(p:P)=>({x:(p.x-x)*c+(p.y-y)*s,y:-(p.x-x)*s+(p.y-y)*c})
  const ellipse=o.type==='shape'&&o.shape==='ellipse'
  return {
    contains(p:P) { const q=local(p);return ellipse ? (q.x/(w/2))**2+(q.y/(h/2))**2<=1+1e-12 : Math.abs(q.x)<=w/2+1e-12&&Math.abs(q.y)<=h/2+1e-12 },
    closest(p:P) {const q=local(p),a=Math.max(-w/2,Math.min(w/2,q.x)),b=Math.max(-h/2,Math.min(h/2,q.y));return {x:x+a*c-b*s,y:y+a*s+b*c}},
    clip(a:P,b:P):[number,number]|null {
      const u=local(a),v=local(b)
      if(ellipse){const x=u.x/(w/2),y=u.y/(h/2),dx=(v.x-u.x)/(w/2),dy=(v.y-u.y)/(h/2),aa=dx*dx+dy*dy,bb=2*(x*dx+y*dy),cc=x*x+y*y-1
        if(aa<1e-24)return cc<=0?[0,1]:null
        const d=bb*bb-4*aa*cc;if(d<0)return null
        const lo=Math.max(0,(-bb-Math.sqrt(d))/(2*aa)),hi=Math.min(1,(-bb+Math.sqrt(d))/(2*aa));return lo<=hi?[lo,hi]:null
      }
      let from=0,to=1
      for(const [p,d,half] of [[u.x,v.x-u.x,w/2],[u.y,v.y-u.y,h/2]]){
        if(Math.abs(d)<1e-12){if(Math.abs(p)>half)return null;continue}
        const t1=(-half-p)/d,t2=(half-p)/d;from=Math.max(from,Math.min(t1,t2));to=Math.min(to,Math.max(t1,t2));if(from>to)return null
      }return [from,to]
    },
  }
}
const distance=(a:P,b:P)=>Math.hypot(a.x-b.x,a.y-b.y)
type Rect=ReturnType<typeof rect>
function crosses(r:Rect,a:P,b:P){const hit=r.clip(a,b);return !!hit&&hit[1]-hit[0]>1e-9}
function covered(a:P,b:P,rects:Rect[],from:number,to:number){let end=from;for(const r of rects.map(r=>r.clip(a,b)).filter((x):x is [number,number]=>!!x).sort((a,b)=>a[0]-b[0])){if(r[1]<end)continue;if(r[0]>end+1e-9)return false;end=Math.max(end,r[1]);if(end>=to-1e-9)return true}return end>=to-1e-9}
// Simplify only the interior grid path. Keep the physical entrance and rack
// approach unchanged (including rotated-rack approaches). Candidate L-shaped
// replacements are accepted only after continuous collision/shell checks.
function tidyOrthogonalRoute(path: P[], clear: (a:P,b:P)=>boolean): P[] {
  if(path.length<5)return path
  const core=path.slice(1,-1),prefix=[0]
  for(let i=1;i<core.length;i++)prefix.push(prefix[i-1]+distance(core[i-1],core[i]))
  const direction=(a:P,b:P)=>Math.abs(a.x-b.x)<1e-10?(b.y>a.y?'D':'U'):Math.abs(a.y-b.y)<1e-10?(b.x>a.x?'R':'L'):`${b.x-a.x},${b.y-a.y}`
  type State={turns:number;length:number;points:P[];direction:string}
  const states=core.map(()=>new Map<string,State>())
  const initial=direction(path[0],core[0])
  states[0].set(initial,{turns:0,length:0,points:[core[0]],direction:initial})
  const better=(a:State,b?:State)=>!b||a.turns<b.turns||a.turns===b.turns&&a.length<b.length-1e-10
  for(let i=0;i<core.length-1;i++)for(let j=i+1;j<Math.min(core.length,i+65);j++){
    const a=core[i],b=core[j]
    const options=Math.abs(a.x-b.x)<1e-10||Math.abs(a.y-b.y)<1e-10?[[a,b]]:[[a,{x:a.x,y:b.y},b],[a,{x:b.x,y:a.y},b]]
    for(const candidate of options){
      const length=candidate.slice(1).reduce((sum,p,k)=>sum+distance(candidate[k],p),0)
      if(length>prefix[j]-prefix[i]+1e-9||!candidate.slice(1).every((p,k)=>clear(candidate[k],p)))continue
      for(const state of states[i].values()){
        let turns=state.turns,last=state.direction
        for(let k=1;k<candidate.length;k++){const next=direction(candidate[k-1],candidate[k]);if(next!==last)turns++;last=next}
        const next={turns,length:state.length+length,points:[...state.points,...candidate.slice(1)],direction:last}
        if(better(next,states[j].get(last)))states[j].set(last,next)
      }
    }
    // A narrow doorway may fail the stricter shell check. Preserve its already
    // verified original edge as a fallback; never make a missing route reachable.
    if(j===i+1)for(const state of states[i].values()){
      const last=direction(a,b),next={turns:state.turns+Number(last!==state.direction),length:state.length+distance(a,b),points:[...state.points,b],direction:last}
      if(better(next,states[j].get(last)))states[j].set(last,next)
    }
  }
  const finish=direction(core.at(-1)!,path.at(-1)!)
  let best:State|undefined
  for(const state of states.at(-1)!.values()){
    const candidate={...state,turns:state.turns+Number(state.direction!==finish)}
    if(better(candidate,best))best=candidate
  }
  if(!best)return path
  const result:P[]=[]
  for(const p of [path[0],...best.points,path.at(-1)!]){
    if(result.length&&distance(result.at(-1)!,p)<1e-12)continue
    while(result.length>=2&&direction(result.at(-2)!,result.at(-1)!)===direction(result.at(-1)!,p))result.pop()
    result.push(p)
  }
  return result.length<=path.length?result:path
}
// Binary min heap avoids quadratic scans of the floor grid.
class Queue {
  items:{node:number;cost:number}[]=[]
  push(node:number,cost:number){const item={node,cost};let i=this.items.length;this.items.push(item);while(i>0){const p=(i-1)>>1;if(this.items[p].cost<=cost)break;this.items[i]=this.items[p];i=p}this.items[i]=item}
  pop(){const first=this.items[0],last=this.items.pop();if(last&&this.items.length){let i=0;while(i*2+1<this.items.length){let child=i*2+1;if(child+1<this.items.length&&this.items[child+1].cost<this.items[child].cost)child++;if(this.items[child].cost>=last.cost)break;this.items[i]=this.items[child];i=child}this.items[i]=last}return first}
}
export function warehouseNavigation(doc:PlanDocument){
  const {objects,aspectRatio:aspect}=doc,doors=objects.filter(o=>o.type==='door')
  if(!doors.length||doors.length>32||objects.length>1500||!Number.isFinite(aspect)||aspect<.1||aspect>10||objects.some(o=>![o.x,o.y,o.width,o.height,o.rotation].every(Number.isFinite)||o.x<0||o.x>1||o.y<0||o.y>1||o.width<=0||o.height<=0))return undefined
  const doorRects=doors.map(o=>rect(o,aspect)),walls=objects.filter(o=>o.type==='wall').map(o=>rect(o,aspect)),obstacles=objects.filter(o=>o.type==='rack'||o.type==='shape').map(o=>rect(o,aspect))
  const inside=(p:P)=>p.x>=0&&p.x<=aspect&&p.y>=0&&p.y<=1
  const clear=(a:P,b:P)=>inside(a)&&inside(b)&&!obstacles.some(r=>crosses(r,a,b))&&!walls.some(r=>{const hit=r.clip(a,b);return hit&&hit[1]-hit[0]>1e-9&&!covered(a,b,doorRects,hit[0],hit[1])})
  const nx=96,ny=Math.max(32,Math.min(128,Math.ceil(nx/aspect))),dx=aspect/nx,dy=1/ny,n=nx*ny
  const points=Array.from({length:n},(_,i)=>({x:(i%nx+.5)*dx,y:(Math.floor(i/nx)+.5)*dy}))
  const neighbors=(i:number)=>[i%nx>0?i-1:-1,i%nx<nx-1?i+1:-1,i>=nx?i-nx:-1,i+nx<n?i+nx:-1].filter(j=>j>=0)
  // Close door apertures for exterior flood, exactly as the server: never walk around outside walls.
  const shell=[...walls,...doorRects],shellClear=(a:P,b:P)=>!shell.some(r=>crosses(r,a,b)),shellFree=points.map(p=>!shell.some(r=>r.contains(p))),exterior=new Uint8Array(n),flood:number[]=[]
  points.forEach((p,i)=>{if(shellFree[i]&&((i%nx===0&&shellClear({x:0,y:p.y},p))||(i%nx===nx-1&&shellClear({x:aspect,y:p.y},p))||(i<nx&&shellClear({x:p.x,y:0},p))||(i>=n-nx&&shellClear({x:p.x,y:1},p)))){exterior[i]=1;flood.push(i)}})
  for(let k=0;k<flood.length;k++)for(const j of neighbors(flood[k]))if(!exterior[j]&&shellFree[j]&&shellClear(points[flood[k]],points[j])){exterior[j]=1;flood.push(j)}
  const free=points.map(p=>!obstacles.some(r=>r.contains(p))&&(!walls.some(r=>r.contains(p))||doorRects.some(r=>r.contains(p))))
  const entries=doors.map((door,d)=>{const start={x:door.x*aspect,y:door.y};return {start,nodes:points.flatMap((p,i)=>free[i]&&distance(p,doorRects[d].closest(p))<=Math.max(dx,dy)*2&&clear(start,p)?[i]:[])}})
  const enclosed=entries.some(e=>e.nodes.some(i=>shellFree[i]&&!exterior[i]))
  const valid=points.map((p,i)=>free[i]&&(!enclosed||!exterior[i]&&shellFree[i]||doorRects.some(r=>r.contains(p))))
  const edges=points.map(()=>[] as {node:number;cost:number}[])
  points.forEach((p,i)=>{if(!valid[i])return;for(const j of [i%nx<nx-1?i+1:-1,i+nx<n?i+nx:-1])if(j>=0&&valid[j]&&clear(p,points[j])){const cost=distance(p,points[j]);edges[i].push({node:j,cost});edges[j].push({node:i,cost})}})
  const search=(seeds:{node:number;cost:number}[])=>{
    const costs=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),queue=new Queue()
    for(const seed of seeds)if(seed.cost<costs[seed.node]){costs[seed.node]=seed.cost;queue.push(seed.node,seed.cost)}
    while(queue.items.length){const item=queue.pop();if(item.cost>costs[item.node])continue;for(const edge of edges[item.node]){const cost=item.cost+edge.cost;if(cost<costs[edge.node]){costs[edge.node]=cost;prev[edge.node]=item.node;queue.push(edge.node,cost)}}}
    return {costs,prev}
  }
  const access=(id:string)=>{
    const matches=objects.filter(o=>o.type==='rack'&&o.rackId===id)
    if(matches.length!==1)return []
    const r=rect(matches[0],aspect)
    return points.flatMap((p,node)=>{if(!valid[node])return [];const end=r.closest(p),offset=distance(p,end);return offset<=Math.max(dx,dy)*1.6&&clear(p,end)?[{node,end,offset}]:[]})
  }
  const render=(path:P[])=>{
    const compact:P[]=[]
    for(const p of path){if(compact.length&&distance(compact.at(-1)!,p)<1e-12)continue;while(compact.length>=2){const a=compact.at(-2)!,b=compact.at(-1)!;if(Math.abs((b.x-a.x)*(p.y-b.y)-(b.y-a.y)*(p.x-b.x))>1e-12||(b.x-a.x)*(p.x-b.x)+(b.y-a.y)*(p.y-b.y)<0)break;compact.pop()}compact.push(p)}
    return tidyOrthogonalRoute(compact,(a,b)=>clear(a,b)&&shellClear(a,b)).map(p=>({x:p.x/aspect,y:p.y}))
  }
  return {objects,aspect,doors,points,edges,entries,valid,n,dx,dy,clear,shellClear,search,access,render}
}
export function barcodeRackRoutes(doc:PlanDocument,rackIds:string[]):Map<string,RackRoute>{
  const result=new Map<string,RackRoute>(),navigation=warehouseNavigation(doc)
  if(!navigation)return result
  const {objects,aspect,doors,points,edges,entries,valid,n,dx,dy,clear,shellClear}=navigation
  const costs=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),origin=new Int32Array(n).fill(-1),queue=new Queue()
  entries.forEach((e,d)=>e.nodes.forEach(i=>{const cost=distance(e.start,points[i]);if(valid[i]&&cost<costs[i]){costs[i]=cost;origin[i]=d;queue.push(i,cost)}}))
  while(queue.items.length){const item=queue.pop();if(item.cost>costs[item.node])continue;for(const edge of edges[item.node]){const cost=item.cost+edge.cost;if(cost<costs[edge.node]){costs[edge.node]=cost;prev[edge.node]=item.node;origin[edge.node]=origin[item.node];queue.push(edge.node,cost)}}}
  for(const id of new Set(rackIds)){
    const matches=objects.filter(o=>o.type==='rack'&&o.rackId===id);if(matches.length!==1)continue
    const r=rect(matches[0],aspect);let best=-1,total=Infinity,end:P|null=null
    points.forEach((p,i)=>{if(!valid[i]||!Number.isFinite(costs[i]))return;const target=r.closest(p),offset=distance(p,target);if(offset<=Math.max(dx,dy)*1.6&&costs[i]+offset<total&&clear(p,target)){best=i;total=costs[i]+offset;end=target}})
    if(best<0||!end)continue
    const d=origin[best],path:P[]=[end];for(let i=best;i>=0;i=prev[i])path.push(points[i]);path.push(entries[d].start);path.reverse()
    // Remove only collinear vertices, never shortcut a corner or cross obstacles.
    const compact:P[]=[]
    for(const p of path){if(compact.length&&distance(compact.at(-1)!,p)<1e-12)continue;while(compact.length>=2){const a=compact.at(-2)!,b=compact.at(-1)!;if(Math.abs((b.x-a.x)*(p.y-b.y)-(b.y-a.y)*(p.x-b.x))>1e-12)break;compact.pop()}compact.push(p)}
    // Closed-shell checks also prevent shortcuts through another doorway into
    // exterior floor. The original reachability and entrance ranking stay intact.
    const tidy=tidyOrthogonalRoute(compact,(a,b)=>clear(a,b)&&shellClear(a,b))
    result.set(id,{entranceId:doors[d].id,entranceLabel:doors[d].label||'출입구',distance:total,points:tidy.map(p=>({x:p.x/aspect,y:p.y}))})
  }
  return result
}
