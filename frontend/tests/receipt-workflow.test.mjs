import test from 'node:test'
import assert from 'node:assert/strict'
import {placementComparison,receiptPlacementReady,receiptRetailTotals,unitTotals} from '../src/receipt-model.ts'
test('placement compares every split precisely and distinguishes over, under, invalid and zero inspection',()=>{
 assert.equal(placementComparison(.3,['0.1','0.2'],'kg').status,'matched')
 assert.match(placementComparison(20,['25'],'EA').message,/5 EA 초과/)
 assert.match(placementComparison(20,['15'],'EA').message,/5 EA 부족/)
 for(const q of ['','-1','NaN','0','1.1234'])assert.equal(placementComparison(20,[q],'EA').status,'invalid')
 assert.equal(placementComparison(0,[],'EA').status,'matched')
 const line=(expected,placed)=>({inspectedQuantity:expected,unit:'EA',placements:[{locationId:'l',quantity:placed}]})
 assert.equal(receiptPlacementReady([line(20,25),line(20,15)]),false)
 assert.equal(receiptPlacementReady([line(20,20)]),true)
 assert.equal(receiptPlacementReady([]),false)
 assert.equal(receiptPlacementReady([{inspectedQuantity:0,unit:'EA',placements:[]}]),false)
})
test('reference totals keep currencies and units separate and count missing values',()=>{
 const result=receiptRetailTotals([{product:{retailPrice:5000,currency:'KRW'},quantity:'10'},{product:{retailPrice:2,currency:'USD'},quantity:'3'},{product:{retailPrice:null},quantity:'5'},{product:{retailPrice:0},quantity:'1'}])
 assert.equal(result.amount,'50,000 원 · 6 USD');assert.equal(result.missing,1)
 assert.equal(unitTotals([{unit:'EA',quantity:10},{unit:'kg',quantity:.1},{unit:'kg',quantity:.2}]),'10 EA · 0.3 kg')
})
