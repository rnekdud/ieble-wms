import test from 'node:test'
import assert from 'node:assert/strict'
import { workError, serialSelectionError, shipmentStatuses } from '../src/shipment-model.ts'
import { unitTotals } from '../src/receipt-model.ts'
test('출고 작업: 초과·부족 완료·기존 피킹 축소 차단, 부분 저장 허용', () => {
  assert.ok(workError('4', 3, false)); assert.ok(workError('2', 3, true)); assert.ok(workError('0', 3, false, 1)); assert.ok(workError('1.0001', 3, false)); assert.equal(workError('2', 3, false), null); assert.equal(workError('3', 3, true), null)
})
test('시리얼 자동 선택 및 지정 개수·중복·형식 검증', () => {
  assert.equal(serialSelectionError(true, 2, []), null); assert.equal(serialSelectionError(true, 2, ['A', 'B']), null); assert.ok(serialSelectionError(true, 2, ['A', 'A'])); assert.equal(serialSelectionError(true, 1.5, []), null); assert.equal(serialSelectionError(false, 1, ['A']), null); assert.ok(serialSelectionError(true, 1, ['A\n'])); assert.ok(serialSelectionError(true, 2, ['A']))
})
test('여섯 출고 상태와 단위별 합계', () => {
  assert.equal(Object.keys(shipmentStatuses).length, 6); assert.equal(unitTotals([{unit:'EA',quantity:2},{unit:'kg',quantity:1.5},{unit:'EA',quantity:3}]), '5 EA · 1.5 kg')
})
