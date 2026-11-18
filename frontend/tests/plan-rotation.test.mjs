import test from 'node:test'
import assert from 'node:assert/strict'
import {rotationChangeError} from '../src/plan-rotation.ts'
import {createPlanObject,editPlan,undoPlan,redoPlan} from '../src/warehouse-plan-model.ts'
const rack={...createPlanObject('rack','r'),rackId:'rack',zoneId:null,locationId:'location',width:.3,height:.08}
const document=(objects,aspectRatio=1.5)=>({schemaVersion:1,aspectRatio,objects})
const turn=(doc,id,rotation)=>({...doc,objects:doc.objects.map(o=>o.id===id?{...o,rotation}:o)})
test('free center rotation retains dimensions/IDs, serializes, and undoes as one operation',()=>{
 const before=document([rack]);const after=turn(before,'r',37.25)
 assert.equal(rotationChangeError(before,after),null)
 assert.deepEqual({...after.objects[0],rotation:0},rack)
 const h=editPlan({past:[],present:before,future:[]},JSON.parse(JSON.stringify(after)))
 assert.deepEqual(undoPlan(h).present,before);assert.deepEqual(redoPlan(undoPlan(h)).present,after)
})
test('rotated physical footprint respects warehouse aspect ratio and perimeter',()=>{
 const before=document([{...rack,y:.1}]);assert.match(rotationChangeError(before,turn(before,'r',90)),/밖/)
 assert.equal(rotationChangeError(before,turn(before,'r',0)),null)
 const square=document([{...rack,x:.5,y:.2}],1);assert.equal(rotationChangeError(square,turn(square,'r',90)),null)
 const wide=document([{...rack,x:.5,y:.2}],4);assert.match(rotationChangeError(wide,turn(wide,'r',90)),/밖/)
})
test('new rack/wall collisions are rejected, rotated rectangles are checked beyond AABBs',()=>{
 for(const type of ['rack','wall']){
  const obstacle={...createPlanObject(type,'ob'),x:.5,y:.68,width:.08,height:.08}
  const before=document([rack,obstacle]);assert.match(rotationChangeError(before,turn(before,'r',90)),/겹칩니다/)
  assert.equal(rotationChangeError(before,turn(before,'r',10)),null)
 }
})
test('existing overlaps and decorative zone/aisle/door policy are preserved',()=>{
 for(const type of ['zone','aisle','door']){
  const before=document([rack,{...createPlanObject(type,'ob'),width:.6,height:.6}]);assert.equal(rotationChangeError(before,turn(before,'r',90)),null)
 }
 const before=document([rack,{...rack,id:'existing'}]);assert.equal(rotationChangeError(before,turn(before,'r',25)),null)
})
test('invalid rotation numbers are rejected, existing negative angles are accepted',()=>{
 const before=document([rack]);for(const angle of [NaN,Infinity,181,-181])assert.match(rotationChangeError(before,turn(before,'r',angle)),/방향/)
 assert.equal(rotationChangeError(before,turn(before,'r',-135)),null)
})
