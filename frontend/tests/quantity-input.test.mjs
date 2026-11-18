import test from 'node:test'
import assert from 'node:assert/strict'
import { eachQuantityError, isQuantityDraft } from '../src/quantity-input.ts'
import { inventoryQuantityError } from '../src/inventory-model.ts'
import { countError } from '../src/stocktake-model.ts'
import { workError } from '../src/shipment-model.ts'
import { placementComparison } from '../src/receipt-model.ts'
test('quantity input rejects decimal EA, signs and exponent notation without conversion', () => {
 for (const unit of ['EA', '개', undefined]) {
  for (const value of ['', '0', '10', '100']) assert(isQuantityDraft(value, unit))
  for (const value of ['1.5', '.25', '-', '-10', '+10', '1e3', '1E3', 'abc', '1,000']) assert(!isQuantityDraft(value, unit))
 }
 for (const value of ['1.5', '0.25', '', '10']) assert(isQuantityDraft(value, 'kg'))
 for (const value of ['-1.5', '+1', '1e3']) assert(!isQuantityDraft(value, 'kg'))
})
test('EA drafts reject fractions without conversion; empty drafts and legacy units are preserved',()=>{
 for(const value of ['1.5','0.25','abc'])assert(eachQuantityError(value,'EA'))
 for(const value of ['',null,'0','10','100'])assert.equal(eachQuantityError(value,'EA'),null)
 assert.equal(eachQuantityError('1.5','kg'),null)
 const stock={unit:'EA',quantity:20,reservedQuantity:0,availableQuantity:20,serialManaged:false}
 assert(inventoryQuantityError('1.5',stock,false));assert.equal(inventoryQuantityError('1.5',{...stock,unit:'kg'},false),null)
 assert(inventoryQuantityError('1.5',undefined,true,'EA'))
 assert(countError(1.5,undefined,undefined,'EA'));assert.equal(countError(1.5,undefined,undefined,'kg'),null)
 assert(workError('1.5',10,false,0,'EA'));assert.equal(workError('1.5',10,false,0,'kg'),null)
 assert.equal(placementComparison(10,['1.5','8.5'],'EA').valid,false)
 assert.equal(placementComparison(10,['1.5','8.5'],'kg').status,'matched')
})
