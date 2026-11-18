import test from 'node:test'
import assert from 'node:assert/strict'
import { quantityPreview, inventoryQuantityError } from '../src/inventory-model.ts'
const stock = {quantity:100,reservedQuantity:30,availableQuantity:70,serialManaged:false}
test('예약 보호 및 수량 예측은 소수점 3자리 유지',()=>{assert.deepEqual(quantityPreview(100,30,70,false),{after:30,available:0,valid:true});assert.equal(quantityPreview(100,30,71,false).valid,false);assert.deepEqual(quantityPreview(0.1,0,0.2,true),{after:0.3,available:0.3,valid:true})})
test('재고 이동·감소는 예약 제외 수량 한도 적용',()=>{assert.equal(inventoryQuantityError('70',stock,false),null);assert.ok(inventoryQuantityError('70.001',stock,false));assert.equal(inventoryQuantityError('100',stock,true),null);for(const value of ['0','-1','1.0001','','NaN'])assert.ok(inventoryQuantityError(value,stock,false))})
test('시리얼 기존 행의 0↔1만 허용',()=>{const s={...stock,quantity:1,reservedQuantity:0,availableQuantity:1,serialManaged:true};assert.equal(inventoryQuantityError('1',s,false),null);assert.ok(inventoryQuantityError('1',s,true));assert.ok(inventoryQuantityError('0.5',s,false));assert.equal(inventoryQuantityError('1',{...s,quantity:0,availableQuantity:0},true),null)})
