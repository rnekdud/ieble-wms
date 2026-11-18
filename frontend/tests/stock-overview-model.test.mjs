import test from 'node:test'
import assert from 'node:assert/strict'
import { overviewDefaults, overviewFilter, overviewParams, overviewDetailQuery, overviewRowKey, overviewLocationSpans } from '../src/stock-overview-model.ts'
test('dependent warehouse, zone and rack filters reset child selections and pagination', () => { const q={...overviewDefaults,warehouseId:'w',zoneId:'z',rackId:'r',locationId:'l',page:5};const w=overviewFilter(q,{warehouseId:'w2'});assert.equal(w.zoneId,'');assert.equal(w.rackId,'');assert.equal(w.locationId,'');assert.equal(w.page,1);const z=overviewFilter(q,{zoneId:'z2'});assert.equal(z.warehouseId,'w');assert.equal(z.rackId,'');const r=overviewFilter(q,{rackId:'r2'});assert.equal(r.zoneId,'z');assert.equal(r.locationId,'') })
test('view/search/page-size changes reset pagination while preserving filters', () => { const q={...overviewDefaults,warehouseId:'w',page:3};for(const patch of [{view:'location'},{search:'barcode'},{pageSize:50}]){const n=overviewFilter(q,patch);assert.equal(n.page,1);assert.equal(n.warehouseId,'w')} })
test('detail preserves exact trace nulls without mixing lots or units', () => {const r={productId:'p',unit:'kg',warehouseId:'w',locationId:'l',lotNumber:null,expiryDate:null,serialNumber:null};const q=overviewDetailQuery({...overviewDefaults,view:'location'},r,2);assert.equal(q.trace,true);assert.equal(q.unit,'kg');assert.equal(q.locationId,'l');const params=overviewParams(q);assert.equal(params.get('trace'),'true');assert.equal(params.get('lotExact'),null);assert.notEqual(overviewRowKey(r),overviewRowKey({...r,unit:'EA'}));assert.notEqual(overviewRowKey(r),overviewRowKey({...r,lotNumber:'LOT'}))})

const row=(patch={})=>({warehouseId:'w1',warehouseName:'동일 창고명',zoneId:'z1',rackId:'r1',rackName:'같은 랙',locationId:'l1',locationName:'1단 1칸',locationCode:'BIN-01',productId:'p1',quantity:10,reservedQuantity:2,availableQuantity:8,...patch})
test('hierarchy merges identity cells without combining products, LOTs or quantities',()=>{
 const items=[row(),row({productId:'p2'}),row({lotNumber:'LOT-2'}),row({locationId:'l2'}),row({rackId:'r2',locationId:'l3'}),row({warehouseId:'w2',zoneId:'z2',rackId:'r3',locationId:'l4'})]
 const original=structuredClone(items),spans=overviewLocationSpans(items)
 assert.deepEqual(spans.map(s=>s.warehouse),[5,0,0,0,0,1])
 assert.deepEqual(spans.map(s=>s.rack),[4,0,0,0,1,1])
 assert.deepEqual(spans.map(s=>s.location),[3,0,0,1,1,1]);assert.deepEqual(items,original)
})
test('row spans are page-local and recomputed after filtering or reordering',()=>{
 const items=Array.from({length:23},(_,i)=>row({productId:'p'+i}))
 assert.equal(overviewLocationSpans(items.slice(0,20))[0].location,20)
 assert.equal(overviewLocationSpans(items.slice(20))[0].location,3)
 assert.equal(overviewLocationSpans(items.filter((_,i)=>i%2===0))[0].location,12)
 assert.deepEqual(overviewLocationSpans([row(),row({locationId:'other'}),row()]).map(s=>s.location),[1,1,1])
 assert.deepEqual(overviewLocationSpans([]),[])
})
test('same labels and missing IDs never merge unrelated locations or racks',()=>{
 const items=[row({locationId:null,rackId:null}),row({locationId:null,rackId:null}),row(),row({warehouseId:'w2'}),row({warehouseId:'w2',rackId:'r2'}),row({warehouseId:null}),row({warehouseId:null})]
 const spans=overviewLocationSpans(items)
 assert.deepEqual(spans.map(s=>s.location),[1,1,1,1,1,1,1])
 assert.deepEqual(spans.map(s=>s.rack),[1,1,1,1,1,1,1])
 assert.deepEqual(spans.map(s=>s.warehouse),[3,0,0,2,0,1,1])
})
