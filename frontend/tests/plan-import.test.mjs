import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importFileError,importTemplate } from '../src/plan-import-model.ts'
const object={id:'old-id',type:'rack',label:'candidate',x:.3,y:.4,width:.2,height:.1,rotation:90,fill:'#ffffff',shape:'rectangle',rackId:'persisted-id',zoneId:'old-zone',locationId:'old-location'}
const plan={schemaVersion:1,aspectRatio:1.5,objects:[object]}
test('import uses relative geometry without reusing any persisted identities',()=>{
 const result=importTemplate(plan,{'old-id':{code:'R-01',levels:2,bays:3}})
 assert.equal(result.aspectRatio,1.5);assert.equal(result.objects[0].rotation,90);assert.equal(result.objects[0].x,.3);assert.equal(result.objects[0].rackIndex,0)
 for(const field of ['id','rackId','locationId','zoneId'])assert.equal(field in result.objects[0],false)
 assert.equal(result.racks[0].levels,2);assert.equal(result.racks[0].bays,3)
})
test('unknown rack dimensions and duplicate codes cannot be silently accepted',()=>{
 for(const levels of [0,1.5,101])assert.throws(()=>importTemplate(plan,{'old-id':{code:'R-01',levels,bays:2}}))
 assert.throws(()=>importTemplate(plan,{'old-id':{code:'R-01',levels:100,bays:100}}))
 assert.throws(()=>importTemplate({...plan,objects:[object,{...object,id:'second'}]},{'old-id':{code:'R-01',levels:2,bays:3},second:{code:'R-01',levels:2,bays:3}}))
})
test('blank walls-only plans and file constraints',()=>{
 assert.deepEqual(importTemplate({...plan,objects:[{...object,type:'wall'}]},{}).racks,[])
 for(const name of ['x.PDF','x.png','x.jpg','x.jpeg','x.webp'])assert.equal(importFileError({name,size:100}), '')
 assert.ok(importFileError({name:'x.svg',size:100}));assert.ok(importFileError({name:'x.png',size:21*1024*1024}));assert.ok(importFileError({name:'x.png',size:0}))
})

test('reviewed rack names survive template and editable workspace conversion',async()=>{
 const {instantiateTemplate}=await import('../src/warehouse-templates.ts')
 const template=importTemplate(plan,{'old-id':{name:'  확인한 랙 1  ',code:'R-01',levels:2,bays:3}})
 assert.equal(template.racks[0].name,'확인한 랙 1');assert.equal(template.objects[0].label,'확인한 랙 1')
 let id=0;const workspace=instantiateTemplate(template,undefined,()=>`new-${++id}`)
 assert.equal(workspace.draft.racks[0].name,'확인한 랙 1');assert.equal(workspace.plan.objects[0].rackId,workspace.draft.racks[0].clientId)
 assert.notEqual(workspace.plan.objects[0].rackId,'persisted-id')
 assert.throws(()=>importTemplate(plan,{'old-id':{name:'x'.repeat(201),code:'R-01',levels:2,bays:3}}))
})
