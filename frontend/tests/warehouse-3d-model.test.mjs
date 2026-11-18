import test from 'node:test'
import assert from 'node:assert/strict'
import { planToWorld, sceneRacks, resolveSlot, detailedShelves } from '../src/warehouse-3d-model.ts'
const object={id:'visual',type:'rack',x:.75,y:.25,width:.2,height:.1,rotation:90,rackId:'real-rack'}
test('normalized center, aspect and clockwise rotation retain the 2D footprint',()=>{
 const p=planToWorld(object,1.5);assert.deepEqual(p,{x:7.5,z:-5,width:6,depth:2,rotation:-Math.PI/2})
 // A local point on +X moves toward +Y in the 2D canvas and +Z in 3D.
 assert(Math.abs(-Math.sin(p.rotation)*3-3)<1e-10)
 assert.equal(planToWorld({...object,rotation:-90},2).rotation,Math.PI/2)
})
test('scene uses actual rack structure and never invents a link for visual-only objects',()=>{
 const plan={aspectRatio:1.5,objects:[object,{...object,id:'unlinked',rackId:null}]},rack={id:'real-rack',levels:3,bays:4,code:'R01'}
 const before=JSON.stringify(plan),result=sceneRacks(plan,[rack]);assert.equal(result.length,1);assert.equal(result[0].rack,rack);assert.equal(JSON.stringify(plan),before)
 assert.equal(sceneRacks(plan,[{...rack,id:'other-rack'}]).length,0)
})
test('shelf picking resolves the persisted LocationId, including sparse grids',()=>{
 const slot={id:'database-location',rackId:'real-rack',level:3,bay:4}
 assert.equal(resolveSlot([{location:slot}],{rackId:'real-rack',level:3,bay:4}),slot)
 assert.equal(resolveSlot([{location:slot}],{rackId:'real-rack',level:3,bay:3}),undefined)
 assert.equal(resolveSlot([{location:slot}],{rackId:'other',level:3,bay:4}),undefined)
})
test('large plans use bounded rack outlines rather than millions of shelf meshes',()=>{
 assert.equal(detailedShelves(Array.from({length:500},()=>({rack:{levels:3,bays:4}}))),true)
 assert.equal(detailedShelves(Array.from({length:500},()=>({rack:{levels:50,bays:100}}))),false)
})
