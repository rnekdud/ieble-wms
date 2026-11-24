import assert from 'node:assert/strict'
import {test} from 'node:test'
import {newObject,papers,bounds,fresh,commit,undo,redo} from '../src/label-editor/model.ts'
import {intersectingObjects,moveSelection,selectionBounds,hitObject} from '../src/label-editor/selection.ts'
const p=papers[2],objects=['text','image','barcode'].map((kind,i)=>({...newObject(kind,p),id:String(i),x:8+i*20.2,y:8+i*.1,width:12,height:8,rotation:i===1?30:0}))
test('marquee intersects full and partial rotated bounds in either drag direction',()=>{
 const label={objects},box=selectionBounds(objects)
 assert.deepEqual(intersectingObjects(label,{x:box.x-.1,y:box.y-.1},{x:box.x+box.width+.1,y:box.y+box.height+.1}),['0','1','2'])
 assert.deepEqual(intersectingObjects(label,{x:99,y:33},{x:0,y:0}),['0','1','2'])
 assert.deepEqual(intersectingObjects(label,{x:9,y:8},{x:20,y:16}),['0'])
 const rotated=objects[1];assert.deepEqual(intersectingObjects({objects:[rotated]},{x:rotated.x,y:rotated.y},{x:rotated.x+rotated.width,y:rotated.y+rotated.height}),[rotated.id])
})
test('group movement preserves relative positions, IDs, rotation, formats and clamps rotated extents',()=>{
 const label={objects},original=structuredClone(label)
 for(const delta of [{x:3.2,y:2.1},{x:200,y:200},{x:-200,y:-200}]){
  const result=moveSelection(label,['0','1','2'],delta,p,true),dx=result.objects[0].x-objects[0].x,dy=result.objects[0].y-objects[0].y
  result.objects.forEach((o,i)=>{assert(Math.abs(o.x-objects[i].x-dx)<1e-10);assert(Math.abs(o.y-objects[i].y-dy)<1e-10);assert.deepEqual({...o,x:0,y:0},{...objects[i],x:0,y:0});const b=bounds(o);assert(b.x>=-1e-10&&b.y>=-1e-10&&b.x+b.width<=p.labelWidth+1e-10&&b.y+b.height<=p.labelHeight+1e-10)})
 }
 assert.deepEqual(label,original);assert.equal(moveSelection(label,['0'],{x:.3,y:.3},p,true).objects[0].x,8.5)
 assert.equal(moveSelection(label,['0'],{x:1,y:1},p,true).objects[1],objects[1])
})
test('one group move or delete is one undo step and other labels remain intact',()=>{
 const d=fresh();d.labels[0]={objects};d.labels[1]=structuredClone(d.labels[0]);const n=structuredClone(d);n.labels[0]=moveSelection(n.labels[0],['0','1'],{x:4,y:2},p,true)
 let h=commit({past:[],present:d,future:[]},n);assert.deepEqual(undo(h).present,d);assert.deepEqual(redo(undo(h)).present,n)
 const deleted=structuredClone(n);deleted.labels[0].objects=deleted.labels[0].objects.filter(o=>!['0','1'].includes(o.id));h=commit(h,deleted);assert.deepEqual(undo(h).present,n);assert.deepEqual(deleted.labels[1],d.labels[1]);assert.equal(deleted.labels[0].objects[0].id,'2')
})

test('common hit test exposes objects inside transparent frames and preserves opaque stacking',()=>{
 const item={...objects[0],id:'item'},frame={...newObject('rectangle',p),id:'frame',x:1,y:1,width:90,height:30,fill:'transparent'}
 for(const kind of ['text','barcode','image','rectangle','line']){
  const target={...item,kind};assert.equal(hitObject({objects:[target,frame]},{x:target.x+target.width/2,y:target.y+target.height/2},4)?.id,'item')
 }
 assert.equal(hitObject({objects:[item,frame]},{x:1.1,y:5},4)?.id,'frame')
 assert.equal(hitObject({objects:[item,frame]},{x:80,y:20},4)?.id,'frame')
 assert.equal(hitObject({objects:[item,{...frame,fill:'#ffffff'}]},{x:14,y:12},4)?.id,'frame')
})
test('thin rotated lines retain a six-screen-pixel hit tolerance without changing model bounds',()=>{
 const line={...newObject('line',p),x:30,y:15,width:20,height:.2,rotation:35},before=structuredClone(line)
 for(const scale of [96/25.4*.5,96/25.4,96/25.4*2]){
  const a=line.rotation*Math.PI/180,dx=0,dy=3/scale
  const point={x:line.x+line.width/2+dx*Math.cos(a)-dy*Math.sin(a),y:line.y+line.height/2+dx*Math.sin(a)+dy*Math.cos(a)}
  assert.equal(hitObject({objects:[line]},point,scale)?.id,line.id)
 }
 assert.deepEqual(line,before)
})

test('all five kinds select at 15%, half, corner, full overlap and all drag directions',()=>{
 for(const kind of ['text','barcode','image','rectangle','line']){
  const o={...newObject(kind,p),id:kind,x:10,y:10,width:20,height:10},label={objects:[o]}
  for(const [a,b] of [[{x:5,y:5},{x:13,y:25}],[{x:5,y:5},{x:20,y:25}],[{x:5,y:5},{x:35,y:25}]]){
   for(const [start,end] of [[a,b],[b,a],[{x:a.x,y:b.y},{x:b.x,y:a.y}],[{x:b.x,y:a.y},{x:a.x,y:b.y}]])assert.deepEqual(intersectingObjects(label,start,end),[kind],kind)
  }
  if(kind!=='line')assert.deepEqual(intersectingObjects(label,{x:9,y:9},{x:10.1,y:10.1}),[kind])
  assert.deepEqual(intersectingObjects(label,{x:0,y:0},{x:5,y:5}),[])
 }
})
test('rotated rectangle uses actual corners, not empty AABB margins',()=>{
 for(const kind of ['text','barcode','image','rectangle']){
  const o={...newObject(kind,p),id:kind,x:10,y:10,width:20,height:10,rotation:45},box=bounds(o),label={objects:[o]}
  assert.deepEqual(intersectingObjects(label,{x:box.x-.1,y:box.y-.1},{x:box.x+.4,y:box.y+.4}),[])
  const tip={x:20+15/Math.sqrt(2),y:15+5/Math.sqrt(2)}
  assert.deepEqual(intersectingObjects(label,{x:tip.x-.3,y:tip.y-.3},{x:tip.x+.3,y:tip.y+.3}),[kind])
 }
})
test('transparent frame interiors and line box / click padding alone do not select',()=>{
 const frame={...newObject('rectangle',p),x:10,y:10,width:20,height:10,strokeWidth:.3}
 assert.deepEqual(intersectingObjects({objects:[frame]},{x:12,y:12},{x:28,y:18}),[])
 assert.deepEqual(intersectingObjects({objects:[{...frame,fill:'#fff'}]},{x:12,y:12},{x:28,y:18}),[frame.id])
 const line={...newObject('line',p),x:10,y:10,width:20,height:10}
 assert.deepEqual(intersectingObjects({objects:[line]},{x:12,y:10.5},{x:15,y:12}),[])
 assert.deepEqual(intersectingObjects({objects:[line]},{x:12,y:14},{x:15,y:16}),[line.id])
 assert.deepEqual(intersectingObjects({objects:[line]},{x:8,y:14},{x:10,y:16}),[line.id])
 const rotated={...line,rotation:90}
 assert.deepEqual(intersectingObjects({objects:[rotated]},{x:19,y:4},{x:21,y:7}),[line.id])
 assert.deepEqual(intersectingObjects({objects:[rotated]},{x:16,y:10},{x:18,y:12}),[])
})
