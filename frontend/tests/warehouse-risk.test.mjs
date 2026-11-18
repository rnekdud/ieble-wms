import {test} from 'node:test';import assert from 'node:assert/strict';import {reservationDay,popoverPosition,locationRisk,conciseRiskReasons,rackHoverGroups} from '../src/warehouse-risk.ts'
test('reservation labels use server operational date across month and year boundaries',()=>{assert.equal(reservationDay('2027-01-01','2026-12-31'),'내일');assert.equal(reservationDay('2026-12-31','2026-12-31'),'오늘');assert.match(reservationDay('2026-12-30','2026-12-31'),/예정일 경과/);assert.equal(reservationDay('2027-01-02','2026-12-31'),'2027-01-02')})
test('popover stays within desktop and mobile viewport without changing rack coordinates',()=>{for(const [vw,vh,w,h] of[[1440,900,360,660],[390,700,360,660]])for(const [x,y]of[[0,0],[vw-1,vh-1],[vw/2,vh/2]]){const p=popoverPosition(x,y,w,h,vw,vh);assert(p.left>=8&&p.top>=8);assert(p.left+w<=vw-8&&p.top+h<=vh-8)}})

test('desktop popover flips away from the pointer so rack clicks remain reachable',()=>{for(const x of [100,700,1350]) {const p=popoverPosition(x,500,360,600,1440,900);assert(x<p.left||x>p.left+360)}})

const product = { status:'warning', reasons:['오늘 유통기한 만료'], earliestExpiry:'2026-11-10', inventoryStatus:'safe', inventoryReasons:[], rackQuantity:100, rackReservedQuantity:0 }
const row = { quantity:90,reservedQuantity:0,expiryDate:'2028-10-10',hasExpiring:false,hasExpired:false }
test('same rack/product uses each location and LOT expiry, preserving rack aggregate',()=>{
 const future=locationRisk(product,row,'2026-11-10')
 assert.equal(future.status,'safe');assert.deepEqual(future.reasons,[]);assert.equal(future.earliestExpiry,'2028-10-10');assert.equal(future.rackQuantity,90)
 const due=locationRisk(product,{...row,quantity:10,expiryDate:'2026-11-10',hasExpiring:true},'2026-11-10')
 assert.equal(due.status,'warning');assert.deepEqual(due.reasons,['오늘 유통기한 만료']);assert.equal(due.rackQuantity,10)
 assert.deepEqual(product.reasons,['오늘 유통기한 만료']);assert.equal(product.rackQuantity,100)
})
test('location expiry handles expired, near, undated and empty rows using server date/flags',()=>{
 for(const [patch,status,text] of [
  [{expiryDate:'2026-11-09',hasExpired:true},'danger','유통기한 경과'],
  [{expiryDate:'2026-12-10',hasExpiring:true},'warning','30일 남음'],
  [{expiryDate:null},'safe',null],
  [{expiryDate:'2026-11-10',hasExpiring:true,quantity:0},'safe',null],
 ]) {const result=locationRisk(product,{...row,...patch},'2026-11-10');assert.equal(result.status,status);if(text)assert(result.reasons.some(r=>r.includes(text)));else assert.deepEqual(result.reasons,[])}
})
test('future LOT still preserves product shortage and review reasons',()=>{
 const shortage=locationRisk({...product,inventoryStatus:'danger',inventoryReasons:['상품 전체 안전재고 미달']},row,'2026-11-10')
 assert.equal(shortage.status,'danger');assert.deepEqual(shortage.reasons,['상품 전체 안전재고 미달'])
 const unknown=locationRisk({...product,inventoryStatus:undefined,inventoryReasons:undefined},row,'2026-11-10');assert.equal(unknown.status,'review');assert(!unknown.reasons.includes('오늘 유통기한 만료'))
})

test('compact reasons preserve global reservation shortages and per-LOT dates',()=>{
 const p={status:'danger',unit:'EA',currentQuantity:12,reservedQuantity:0,expectedQuantity:12,safetyStock:30,shortageQuantity:18,reasons:['상품 전체 현재 재고가 안전재고 미만','유통기한 7일 남음'],earliestExpiry:'2026-11-17'}
 assert.deepEqual(conciseRiskReasons(p,'2026-11-10'),['안전재고 30개 / 현재고 12개 · 18개 부족','유통기한 2026-11-17 · 7일 남음'])
 assert.deepEqual(conciseRiskReasons({...p,earliestExpiry:'2026-11-05',reasons:['유통기한 경과 재고 있음']},'2026-11-11'),['유통기한 2026-11-05 · 6일 경과'])
 assert.match(conciseRiskReasons({...p,currentQuantity:50,reservedQuantity:20,expectedQuantity:30,safetyStock:40,shortageQuantity:10},'2026-11-10')[0],/현재고 50개 · 예약 20개 \/ 출고 후 예상 30개 · 10개 부족 예상/)
 assert.deepEqual(conciseRiskReasons({...p,status:'safe'},'2026-11-10'),[])
})
test('hover summaries use authoritative totals and deduplicate fallback products',()=>{
 const groups=[{status:'danger',total:8,products:[{productId:'p',productName:'상품'}]}]
 assert.deepEqual(rackHoverGroups({hoverGroups:groups}),groups)
 const summary=rackHoverGroups({preview:[{productId:'p',status:'warning'},{productId:'p',status:'danger'},{productId:'q',status:'warning'}]})
 assert.equal(summary[0].total,1);assert.equal(summary[1].total,1)
})
