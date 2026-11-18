import {test} from 'node:test';import assert from 'node:assert/strict'
import {defaultWarehouseTemplate,emptyWarehouseTemplate,generalWarehouseTemplate,instantiateTemplate,templateFromWorkspace} from '../src/warehouse-templates.ts'
import {workspaceError,workspaceRequest,emptyVersion} from '../src/warehouse-workspace-model.ts'
test('general warehouse is editable geometry with linked draft racks and final-save-only locations',()=>{const d=instantiateTemplate(generalWarehouseTemplate());d.draft.warehouse.name='QA';assert.equal(workspaceError(d.draft,d.plan),null);assert.equal(d.draft.racks.length,6);assert.equal(d.plan.objects.length,16);assert.deepEqual(new Set(d.plan.objects.map(x=>x.type)),new Set(['wall','door','aisle','zone','rack']));const r=workspaceRequest(d.draft,d.plan,emptyVersion,false,crypto.randomUUID());assert(r.racks.every(x=>x.id===null&&x.barcode.mode==='none'));assert.equal(r.racks.reduce((n,x)=>n+x.levels*x.bays,0),72)})
test('template allowlist strips all physical identities, barcodes, inactive state and tracking, then assigns fresh links',()=>{const d=instantiateTemplate(generalWarehouseTemplate());for(const r of d.draft.racks){r.id=crypto.randomUUID();r.barcode='880123';r.barcodeChange={mode:'manual',value:'ABC'};r.isActive=false;r.secretInventory='LOT-SECRET'}d.plan.objects[10].locationId=crypto.randomUUID();const t=templateFromWorkspace(d.draft,d.plan),serialized=JSON.stringify(t);for(const key of ['clientId','rackId','locationId','zoneId','barcode','LOT-SECRET','isActive'])assert(!serialized.includes(key));const a=instantiateTemplate(t),b=instantiateTemplate(t);assert(a.plan.objects.every(x=>!b.plan.objects.some(y=>x.id===y.id)));assert(a.draft.racks.every(x=>x.id===null&&x.isActive&&x.barcodeChange.mode==='none'));assert.equal(a.draft.racks[0].zoneClientId,a.draft.zones[0].clientId);assert.equal(a.plan.objects[10].rackId,a.draft.racks[0].clientId);assert.equal(a.plan.objects[10].locationId,null)})
test('template replacement preserves warehouse basics and does not mutate source data',()=>{const t=generalWarehouseTemplate(),before=JSON.stringify(t),basics={...instantiateTemplate(t).draft.warehouse,name:'Own',notes:'keep'};const a=instantiateTemplate(t,basics);assert.equal(a.draft.warehouse.name,'Own');a.plan.objects[0].x=.8;a.draft.racks[0].levels=5;assert.equal(JSON.stringify(t),before);const blank=instantiateTemplate({schemaVersion:1,aspectRatio:1.6,objects:[],zones:[],racks:[]},basics);assert.equal(blank.draft.warehouse.notes,'keep');assert.equal(blank.plan.objects.length,0)})

test('new warehouse default keeps the original structure and only the two original aisles',()=>{
 const template=defaultWarehouseTemplate(),first=instantiateTemplate(template),second=instantiateTemplate(defaultWarehouseTemplate())
 assert.equal(first.plan.aspectRatio,1.6);assert.equal(first.plan.objects.length,16)
 assert.equal(first.draft.zones.length,2);assert.equal(first.draft.racks.length,6)
 assert.deepEqual(first.draft.racks.map(r=>[r.code,r.levels,r.bays]),Array.from({length:6},(_,i)=>[`R-${String(i+1).padStart(2,'0')}`,3,4]))
 assert.deepEqual(first.plan.objects.filter(o=>o.type==='aisle').map(o=>[o.label,o.x,o.y,o.width,o.height]),[['중앙 통로',.5,.5,.86,.10],['출입 통로',.5,.92,.12,.10]])
 assert.equal(first.plan.objects.filter(o=>o.type==='wall').length,5)
 assert.equal(first.plan.objects.filter(o=>o.type==='door').length,1)
 assert.deepEqual(first.plan.objects.filter(o=>o.type==='rack').map(o=>[o.x,o.y,o.width,o.height,o.rotation]),Array.from({length:6},(_,i)=>[.22+(i%3)*.28,i<3?.28:.72,.18,.20,0]))
 first.plan.objects[0].x=.1;first.draft.racks[0].levels=9
 assert.equal(second.plan.objects[0].x,.5);assert.equal(second.draft.racks[0].levels,3)
 second.draft.warehouse.name='QA default warehouse'
 assert.equal(workspaceError(second.draft,second.plan),null)
 const request=workspaceRequest(second.draft,second.plan,emptyVersion,false,crypto.randomUUID())
 assert.equal(request.zones.length,2);assert.equal(request.racks.length,6);assert.equal(request.plan.objects.length,16)
 assert.deepEqual(instantiateTemplate(emptyWarehouseTemplate()).plan,{schemaVersion:1,aspectRatio:1.5,objects:[]})
})
test('default reset keeps warehouse basics and leaves a user template intact',()=>{
 const custom=generalWarehouseTemplate();custom.aspectRatio=2.25;custom.racks[0].name='User rack'
 const before=JSON.stringify(custom),existing=instantiateTemplate(custom)
 existing.draft.warehouse.name='Keep company warehouse name'
 const reset=instantiateTemplate(defaultWarehouseTemplate(),existing.draft.warehouse)
 assert.equal(reset.plan.aspectRatio,1.6);assert.equal(reset.plan.objects.length,16)
 assert.equal(reset.draft.warehouse.name,'Keep company warehouse name')
 assert.equal(JSON.stringify(custom),before);assert.equal(existing.plan.aspectRatio,2.25)
 assert.equal(existing.draft.racks[0].name,'User rack')
})
