import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyWorkspace, newStructure, workspaceRequest, workspaceError, previewRack, emptyVersion } from '../src/warehouse-workspace-model.ts'
import { blankPlan, createPlanObject } from '../src/warehouse-plan-model.ts'
const draft = () => { const d = emptyWorkspace(); d.warehouse.name = '통합 창고'; return d }
test('new workspace can save basic information without a plan or physical IDs', () => {
 const d = draft(), body = workspaceRequest(d, blankPlan(), emptyVersion, false, 'request')
 assert.equal(body.plan, null); assert.equal(body.warehouse.code, undefined); assert.equal(workspaceError(d, blankPlan()), null)
})
test('3 by 4 draft rack previews twelve deterministic slots without changing draft', () => {
 const rack = {...newStructure('rack-client','랙'),code:' r-1 '}, before = JSON.stringify(rack), slots = previewRack(rack)
 assert.equal(slots.length,12); assert.equal(slots[0].code,'R-1-L01-B01'); assert.equal(slots[11].id,'rack-client:3:4'); assert.equal(JSON.stringify(rack),before)
 assert.deepEqual(previewRack(rack),slots); assert.deepEqual(previewRack({...rack,levels:100,bays:100}),[])
})
test('expanded preview preserves actual IDs, customized location codes and status', () => {
 const rack = {...newStructure('rack','랙'),id:'rack',levels:4,bays:4,minimumLevels:3,minimumBays:4,code:'R'}
 const existing = {...previewRack(rack)[0],id:'real-slot',code:'CUSTOM',isActive:false}
 const slots = previewRack(rack,[existing]); assert.equal(slots.length,16); assert.deepEqual(slots[0],existing)
})
test('request keeps client links and existing versions but removes presentation-only fields', () => {
 const d=draft(); const z={...newStructure('zone','구역'),code:'Z'}; const r={...newStructure('rack','랙'),code:'R',zoneClientId:'zone'}; d.zones=[z];d.racks=[r]
 const p=blankPlan(); p.objects=[{...createPlanObject('rack','visual'),rackId:r.clientId}]
 const req=workspaceRequest(d,p,'version',false,'request'); assert.equal(req.racks[0].clientId,'rack'); assert.equal(req.racks[0].zoneClientId,'zone'); assert.equal(req.plan.objects[0].rackId,'rack'); assert.equal(req.racks[0].minimumLevels,undefined); assert.equal(req.plan.version,'version')
 assert.equal(workspaceRequest(d,blankPlan(),'version',true,'request').plan.objects.length,0)
})
test('validation prevents shrinking, duplicate links and generated location collisions', () => {
 const d=draft(); const rack={...newStructure('rack','랙'),code:'R',id:'rack',minimumLevels:3,minimumBays:4};d.racks=[rack]
 rack.levels=2;assert.match(workspaceError(d,blankPlan()),/확장/);rack.levels=4
 d.floorLocations=[{...newStructure('floor','바닥'),code:'R-L04-B01'}];assert.match(workspaceError(d,blankPlan()),/중복/);d.floorLocations=[]
 const p=blankPlan();p.objects=[{...createPlanObject('rack','a'),rackId:'rack'},{...createPlanObject('rack','b'),rackId:'rack'}];assert.match(workspaceError(d,p),/한 객체/)
})
