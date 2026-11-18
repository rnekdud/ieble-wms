import assert from 'node:assert/strict'
import test from 'node:test'
import { routePresentation, routeTrailFrame, pointAtDistance, trailRibbon } from '../src/route-presentation.ts'
import { barcodeRackRoutes } from '../src/barcode-route.ts'
import { warehouseFixture } from './barcode-route.test.mjs'

const points=[{x:.1,y:.1},{x:.5,y:.1},{x:.5,y:.6},{x:.8,y:.6}]
const path=routePresentation(points,1.6)
test('projection keeps all planner vertices and right angles; constant distance speed',()=>{
 assert.deepEqual(path.points,points.map(p=>({x:p.x*1200,y:p.y*750})))
 const a=routeTrailFrame(path,1000,1),b=routeTrailFrame(path,1500,1),c=routeTrailFrame(path,2000,1)
 assert(Math.abs((b.distance-a.distance)-(c.distance-b.distance))<1e-8)
 assert.deepEqual(pointAtDistance(path,480),{x:600,y:75})
 assert.deepEqual(pointAtDistance(path,600),{x:600,y:195})
})
test('trail has no points ahead of the dot, retains corners, fades from tail to head',()=>{
 for(let t=100;t<path.travelMs;t+=37){
  const f=routeTrailFrame(path,t,.8)
  assert.deepEqual(f.point,pointAtDistance(path,f.distance))
  assert.deepEqual({x:f.trail.at(-1).x,y:f.trail.at(-1).y},f.point)
  for(let i=0;i<f.trail.length;i++){
   const p=f.trail[i];assert(p.distance<=f.distance&&p.distance>=f.from)
   assert.deepEqual({x:p.x,y:p.y},pointAtDistance(path,p.distance))
   if(i)assert(p.alpha>=f.trail[i-1].alpha)
  }
  if(f.from>0)assert.equal(f.trail[0].alpha,0)
 }
 const corner=routeTrailFrame(path,path.travelMs*520/path.total,1)
 assert(corner.trail.some(p=>p.x===600&&p.y===75),'trail retains passed right-angle vertex')
 const ribbon=trailRibbon(corner.trail,1.75)
 assert.deepEqual(ribbon[0].polygon.slice(1,3),[ribbon[1].polygon[0],ribbon[1].polygon[3]],'adjacent ribbon pieces share seam without gaps')
})
test('arrival fades out, then pauses invisibly before restarting at entrance',()=>{
 const arrival=routeTrailFrame(path,path.travelMs,1),fade=routeTrailFrame(path,path.travelMs+225,1),pause=routeTrailFrame(path,path.travelMs+500,1),restart=routeTrailFrame(path,path.cycleMs,1)
 assert.deepEqual(arrival.point,path.points.at(-1));assert.equal(arrival.opacity,1)
 assert.deepEqual(fade.point,arrival.point);assert.equal(fade.opacity,.5);assert.equal(pause.opacity,0)
 assert.deepEqual(restart.point,path.points[0]);assert.equal(restart.opacity,0)
})
test('real computed warehouse routes are unchanged; every dot/trail sample stays on the original segments',()=>{
 const plan=warehouseFixture(),routes=barcodeRackRoutes(plan,['r0','r1','r2','r3','r4','r5']),snapshot=JSON.stringify([...routes])
 for(const route of routes.values()){
  const p=routePresentation(route.points,plan.aspectRatio)
  assert.deepEqual(p.points,route.points.map(v=>({x:v.x*1200,y:v.y*1200/plan.aspectRatio})))
  for(let t=100;t<p.travelMs;t+=43){
   const f=routeTrailFrame(p,t,.4)
   for(const q of [f.point,...f.trail])assert(p.segments.some(s=>{
    const cross=(q.x-s.start.x)*(s.end.y-s.start.y)-(q.y-s.start.y)*(s.end.x-s.start.x)
    return Math.abs(cross)<1e-6&&q.x>=Math.min(s.start.x,s.end.x)-1e-8&&q.x<=Math.max(s.start.x,s.end.x)+1e-8&&q.y>=Math.min(s.start.y,s.end.y)-1e-8&&q.y<=Math.max(s.start.y,s.end.y)+1e-8
   }))
  }
 }
 assert.equal(JSON.stringify([...routes]),snapshot)
})
test('empty, zero-length and repeated vertices are safe',()=>{
 for(const values of [[],[{x:0,y:0}],[{x:0,y:0},{x:0,y:0}]]){
  const p=routePresentation(values,1.6);assert.equal(p.total,0);assert.deepEqual(routeTrailFrame(p,100,1).trail,[])
 }
})
