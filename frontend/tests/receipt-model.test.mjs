import test from 'node:test'
import assert from 'node:assert/strict'
import {quantityError,trackingError,splitSerials,unitTotals} from '../src/receipt-model.ts'
test('mixed units stay separate and decimal totals avoid floating point artifacts',()=>{
 assert.equal(unitTotals([{unit:'kg',quantity:.1},{unit:'kg',quantity:.2},{unit:'EA',quantity:2}]),'0.3 kg · 2 EA')
})
test('optional trace fields preserve supplied serial count validation',()=>{
 for(const v of ['-1','1.0001','1000000000',''])assert(quantityError(v))
 assert(quantityError('0'));assert.equal(quantityError('0',true),false);assert.equal(quantityError('1.125'),false)
 const flags={lotManaged:true,expiryManaged:true,serialManaged:true}
 assert.equal(trackingError(flags,2,'','2027-01-01','A\nB'),null);assert.equal(trackingError(flags,2,'LOT','','A\nB'),null);assert.equal(trackingError(flags,2,'','',''),null);assert(trackingError(flags,2,'LOT','2027-01-01','A\nA'));assert(trackingError(flags,2,'LOT','2027-01-01','A'))
 assert.equal(trackingError(flags,2,'LOT','2027-01-01','A\nB'),null);assert.deepEqual(splitSerials(' A\r\n B\n'),['A','B'])
})
