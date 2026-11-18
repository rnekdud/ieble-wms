import test from 'node:test'
import assert from 'node:assert/strict'
import {pickingRackTour,pickingVisitOrder} from '../src/picking-route.ts'
import {warehouseNavigation} from '../src/barcode-route.ts'
import {warehouseFixture} from './barcode-route.test.mjs'
const shape=(type,x,y,width,height,extra={})=>({id:`${type}-${x}-${y}`,type,x,y,width,height,rotation:0,shape:'rectangle',label:type,rackId:null,...extra})
function verify(plan,tour){
 assert(tour.route);const route=tour.route,door=plan.objects.find(o=>o.id===route.entranceId)
 assert.deepEqual(route.points[0],{x:door.x,y:door.y})
 for(const id of tour.order){const end=tour.individual[id].points.at(-1);assert(route.points.some(p=>Math.hypot(p.x-end.x,p.y-end.y)<1e-9),'visits each actual rack access point')}
 for(let i=1;i<route.points.length;i++)for(let j=0;j<=300;j++){
  const a=route.points[i-1],b=route.points[i],p={x:a.x+(b.x-a.x)*j/300,y:a.y+(b.y-a.y)*j/300}
  assert(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)
  for(const o of plan.objects.filter(o=>['rack','shape','wall'].includes(o.type))){
   const ang=o.rotation*Math.PI/180,dx=(p.x-o.x)*plan.aspectRatio,dy=p.y-o.y,x=dx*Math.cos(ang)+dy*Math.sin(ang),y=-dx*Math.sin(ang)+dy*Math.cos(ang)
   const inside=o.shape==='ellipse'?(x/(o.width*plan.aspectRatio/2))**2+(y/(o.height/2))**2<1-1e-8:Math.abs(x)<o.width*plan.aspectRatio/2-1e-8&&Math.abs(y)<o.height/2-1e-8
   if(inside)assert(o.type==='wall'&&plan.objects.some(d=>d.type==='door'&&Math.abs(p.x-d.x)<=d.width/2&&Math.abs(p.y-d.y)<=d.height/2),`crosses ${o.id}`)
  }
 }
}
function perms(a){return !a.length?[[]]:a.flatMap((v,i)=>perms(a.filter((_,j)=>j!==i)).map(p=>[v,...p]))}
test('exact open visit order equals exhaustive search and does not force return',()=>{
 const start=[10,3,7,2],matrix=[[0,9,2,10],[9,0,8,1],[2,8,0,9],[10,1,9,0]]
 const cost=order=>order.reduce((s,n,i)=>s+(i?matrix[order[i-1]][n]:start[n]),0)
 const actual=pickingVisitOrder(start,matrix)
 assert.equal(actual.distance,Math.min(...perms([0,1,2,3]).map(cost)));assert.equal(actual.exact,true)
})
test('real six-rack enclosed warehouse, shared rack once, continuous tour touches all rack edges without crossing geometry',()=>{
 const plan=warehouseFixture(),before=JSON.stringify(plan),tour=pickingRackTour(plan,['r0','r4','r2','r1','r4','r5'])
 assert.equal(tour.order.length,5);assert.equal(tour.unreachable.length,0);verify(plan,tour);assert.equal(JSON.stringify(plan),before)
})
test('obstacle distance order outperforms a straight-line nearest-neighbour order',()=>{
 const plan={schemaVersion:1,aspectRatio:1,objects:[shape('door',.45,.25,.02,.02),shape('wall',.5,.36,.012,.72),shape('rack',.58,.25,.04,.06,{rackId:'a'}),shape('rack',.22,.45,.04,.06,{rackId:'b'}),shape('rack',.7,.84,.05,.05,{rackId:'c'})]}
 const ids=['a','b','c'],nav=warehouseNavigation(plan),entry=nav.entries[0],search=nav.search(entry.nodes.filter(n=>nav.valid[n]).map(node=>({node,cost:Math.hypot(nav.points[node].x-entry.start.x,nav.points[node].y-entry.start.y)})))
 const access=ids.map(id=>nav.access(id).sort((a,b)=>(search.costs[a.node]+a.offset)-(search.costs[b.node]+b.offset))[0])
 const matrix=access.map(a=>{const s=nav.search([{node:a.node,cost:0}]);return access.map(b=>a===b?0:a.offset+s.costs[b.node]+b.offset)})
 const start=access.map(a=>search.costs[a.node]+a.offset),order=[],remaining=new Set([0,1,2])
 let position=plan.objects.find(o=>o.type==='door')
 while(remaining.size){const next=[...remaining].sort((a,b)=>{const pa=plan.objects.find(o=>o.rackId===ids[a]),pb=plan.objects.find(o=>o.rackId===ids[b]);return Math.hypot(pa.x-position.x,pa.y-position.y)-Math.hypot(pb.x-position.x,pb.y-position.y)})[0];order.push(next);remaining.delete(next);position=plan.objects.find(o=>o.rackId===ids[next])}
 const euclideanCost=order.reduce((s,n,i)=>s+(i?matrix[order[i-1]][n]:start[n]),0),tour=pickingRackTour(plan,ids)
 assert(tour.route.distance<euclideanCost-.1,`${tour.route.distance} vs ${euclideanCost}`);assert.equal(tour.order[0],'b');verify(plan,tour)
 console.log('Obstacle-aware tour',tour.order,'distance',tour.route.distance.toFixed(3),'vs Euclidean order',euclideanCost.toFixed(3))
})
test('many-stop heuristic never worsens nearest neighbour and keeps every visit',()=>{
 const points=Array.from({length:16},(_,i)=>({x:(i*17%23),y:(i*31%29)})),start=points.map(p=>Math.hypot(p.x,p.y)),matrix=points.map(a=>points.map(b=>Math.hypot(a.x-b.x,a.y-b.y)))
 const remaining=new Set(points.map((_,i)=>i)),order=[];while(remaining.size){const last=order.at(-1),n=[...remaining].sort((a,b)=>(last===undefined?start[a]-start[b]:matrix[last][a]-matrix[last][b]))[0];order.push(n);remaining.delete(n)}
 const nn=order.reduce((s,n,i)=>s+(i?matrix[order[i-1]][n]:start[n]),0),actual=pickingVisitOrder(start,matrix)
 assert.equal(actual.exact,false);assert.equal(new Set(actual.order).size,16);assert(actual.distance<=nn)
})
test('missing doors, missing rack and disconnected components never produce fake connections',()=>{
 const base=warehouseFixture();assert.equal(pickingRackTour({...base,objects:base.objects.filter(o=>o.type!=='door')},['r0']).route,undefined)
 const partial=pickingRackTour(base,['r0','missing']);assert.deepEqual(partial.unreachable,['missing']);verify(base,partial)
 const plan={schemaVersion:1,aspectRatio:1,objects:[shape('door',.1,.5,.02,.02),shape('door',.9,.5,.02,.02),shape('wall',.5,.5,.01,1),shape('rack',.25,.5,.08,.1,{rackId:'left'}),shape('rack',.75,.5,.08,.1,{rackId:'right'})]}
 const tour=pickingRackTour(plan,['left','right']);assert.equal(tour.order.length,1);assert.equal(tour.unreachable.length,1);verify(plan,tour)
})
