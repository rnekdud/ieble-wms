import test from 'node:test'
import assert from 'node:assert/strict'
import { blankPlan, createPlanObject, movePlanObjects, duplicatePlanObjects, deletePlanObjects, editPlan, undoPlan, redoPlan, rotation, unlinkedStructureObjects, duplicateRackLinks } from '../src/warehouse-plan-model.ts'
test('normalized geometry survives serialization without altering physical references',()=>{
 const rack={...createPlanObject('rack','visual-id'),rackId:'physical-rack',locationId:'stable-slot'}
 const doc={...blankPlan(),objects:[rack]};const next=movePlanObjects(doc,[rack.id],.14,-.12,true)
 assert.equal(next.objects[0].rackId,'physical-rack');assert.equal(next.objects[0].locationId,'stable-slot');assert.equal(doc.objects[0].x,.5)
 assert.deepEqual(JSON.parse(JSON.stringify(next)),next)
 for(const width of [800,1200,1900])assert(Math.abs((next.objects[0].x*width)/width-next.objects[0].x)<1e-12)
})
test('group movement snaps one anchor and preserves relative distances at edges',()=>{
 const a=createPlanObject('wall','a',.2,.3),b=createPlanObject('zone','b',.45,.7),doc={...blankPlan(),objects:[a,b]}
 const next=movePlanObjects(doc,['a','b'],.8,.8,true)
 assert.equal(next.objects[1].x,1);assert.equal(next.objects[1].y,1)
 assert(Math.abs(next.objects[1].x-next.objects[0].x-.25)<1e-6);assert(Math.abs(next.objects[1].y-next.objects[0].y-.4)<1e-6)
})
test('duplicate creates new visual identities, delete and undo never remove linked storage identities',()=>{
 const doc={...blankPlan(),objects:[{...createPlanObject('rack','a'),rackId:'r',locationId:'l'}]};const copy=duplicatePlanObjects(doc,['a'],()=> 'b')
 assert.equal(copy.objects.length,2);assert.equal(copy.objects[1].rackId,null);assert.equal(copy.objects[1].locationId,null);assert.equal(copy.objects[0].rackId,'r');assert.equal(copy.objects[1].id,'b')
 let h={past:[],present:doc,future:[]};h=editPlan(h,copy);h=editPlan(h,deletePlanObjects(copy,['a']));assert.equal(h.present.objects[0].id,'b')
 h=undoPlan(h);assert.deepEqual(h.present,copy);h=undoPlan(h);assert.deepEqual(h.present,doc);h=redoPlan(h);assert.deepEqual(h.present,copy)
 h=editPlan(h,{...copy,objects:[]});assert.equal(h.future.length,0)
})
test('rotation normalizes full turns and object catalog creates bounded normalized shapes',()=>{
 assert.equal(rotation(450),90);assert.equal(rotation(-450),-90)
 for(const kind of ['wall','zone','rack','aisle','door','text','shape']){const o=createPlanObject(kind,kind);assert(o.width>0&&o.width<=1);assert(o.height>0&&o.height<=1);assert.equal(o.type,kind)}
})

test('unlinked structures require a choice and linked rack duplication is detected',()=>{
 const zone={...createPlanObject('zone','z'),zoneId:'physical-zone'}
 const rack={...createPlanObject('rack','r'),rackId:'physical-rack'}
 const doc={...blankPlan(),objects:[zone,rack,createPlanObject('rack','loose'),createPlanObject('text','label')]}
 assert.deepEqual(unlinkedStructureObjects(doc).map(o=>o.id),['loose'])
 assert.equal(duplicateRackLinks(doc),false)
 assert.equal(duplicateRackLinks({...doc,objects:[rack,{...rack,id:'other'}]}),true)
 const copy=duplicatePlanObjects(doc,['z','r'],(()=>{let id=0;return()=>String(++id)})())
 assert.equal(duplicateRackLinks(copy),false)
 assert.equal(copy.objects[4].zoneId,null)
 assert.deepEqual(unlinkedStructureObjects(copy).map(o=>o.id),['loose','1','2'])
 const moved=movePlanObjects(doc,['z','r'],.1,.1,false)
 assert.equal(moved.objects[0].zoneId,'physical-zone');assert.equal(moved.objects[1].rackId,'physical-rack')
})
