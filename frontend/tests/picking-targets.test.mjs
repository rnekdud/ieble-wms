import test from 'node:test'
import assert from 'node:assert/strict'
import {pickingTargets} from '../src/picking-targets.ts'
function fixture(){
 const detail={shipment:{warehouseId:'w'},lines:[{id:'line',productId:'p',productName:'상품',productCode:'PR01',unit:'EA',requestedQuantity:10}],allocations:[{id:'a',lineId:'line',stockId:'s',warehouseId:'w',rackId:'r',locationId:'l',locationCode:'BIN01',quantity:10,pickedQuantity:3,state:'Active',lotNumber:'LOT-A',expiryDate:'2027-01-01',serialNumber:null}]}
 const stocks={p:[{id:'s',isActive:true,locationCode:'BIN01',unit:'EA',lotNumber:'LOT-A',expiryDate:'2027-01-01',quantity:20,reservedQuantity:15,availableQuantity:5}]}
 const racks={r:{rack:{id:'r',name:'랙',code:'R01'},zoneName:'구역',locations:[{location:{id:'l',rackId:'r',code:'BIN01',name:'위치',level:1,bay:2},effectiveActive:true}]}}
 return {detail,stocks,racks}
}
test('remaining quantity, exact location/LOT identity and own reservation preserved without mutation',()=>{
 const f=fixture(),before=JSON.stringify(f),result=pickingTargets(f.detail,f.stocks,f.racks)
 assert.equal(result.items[0].remaining,7);assert.equal(result.items[0].available,15);assert.equal(result.items[0].issue,'');assert.equal(result.items[0].lot,'LOT-A');assert.equal(result.items[0].locationLabel,'1단 2칸');assert.equal(JSON.stringify(f),before)
})
test('invalid/stale stock, inactive location and foreign warehouse never become route targets',()=>{
 for(const change of [f=>f.stocks.p[0].reservedQuantity=9,f=>f.stocks.p[0].quantity=14,f=>f.stocks.p[0].lotNumber='OTHER',f=>f.stocks.p[0].serialNumber='OTHER',f=>f.stocks.p[0].unit='BOX',f=>f.stocks.p[0].locationCode='MOVED',f=>f.racks.r.locations[0].effectiveActive=false,f=>f.detail.allocations[0].warehouseId='foreign',f=>f.detail.allocations[0].rackId=undefined,f=>f.detail.allocations[0].locationId='other',f=>f.stocks.p=[]]){
  const f=fixture();change(f);assert(pickingTargets(f.detail,f.stocks,f.racks).items[0].issue)
 }
})
test('shared stock reservations checked as a sum; complete quantities excluded from remaining, missing allocations reported',()=>{
 const f=fixture();f.detail.allocations.push({...f.detail.allocations[0],id:'b',quantity:6,pickedQuantity:0});assert.match(pickingTargets(f.detail,f.stocks,f.racks).items[0].issue,/부족/)
 f.detail.allocations.pop();f.detail.allocations[0].pickedQuantity=10;f.stocks={};const done=pickingTargets(f.detail,f.stocks,f.racks);assert.equal(done.items[0].remaining,0);assert.equal(done.items[0].issue,'')
 f.detail.allocations=[];const missing=pickingTargets(f.detail,f.stocks,f.racks);assert.equal(missing.items.length,0);assert.match(missing.issues[0],/10 EA 부족/)
})
