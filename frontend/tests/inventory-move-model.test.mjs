import test from 'node:test'
import assert from 'node:assert/strict'
import { floorRackId, moveSourceMatches, moveSelectionError } from '../src/inventory-move-model.ts'
const from = { productId: 'product', warehouseId: 'warehouse', rackId: 'rack', locationId: 'slot' }
const to = { warehouseId: 'warehouse', rackId: 'other-rack', locationId: 'other-slot' }
const stock = { ...from, quantity: 100, reservedQuantity: 30, availableQuantity: 70, isActive: true, serialManaged: false }
test('랙 간·칸 간·창고 간 이동은 동일 위치와 미완성 경로를 차단한다', () => {
  assert.equal(moveSelectionError(stock, from, to, '70'), null)
  assert.equal(moveSelectionError(stock, from, { ...to, rackId: from.rackId }, '70'), null)
  assert.equal(moveSelectionError(stock, from, { ...to, warehouseId: 'other-warehouse' }, '70'), null)
  assert.match(moveSelectionError(stock, from, from, '1'), /같습니다/)
  for (const key of ['warehouseId', 'rackId', 'locationId']) assert.ok(moveSelectionError(stock, from, { ...to, [key]: undefined }, '1'))
})
test('상위 선택 변경·동시 이동 후 이전 재고 응답을 출발 재고로 사용하지 않는다', () => {
  for (const key of ['productId', 'warehouseId', 'rackId', 'locationId']) {
    assert.equal(moveSourceMatches(stock, { ...from, [key]: 'changed' }), false)
    assert.ok(moveSelectionError({ ...stock, [key]: 'moved' }, from, to, '1'))
  }
  assert.ok(moveSelectionError(undefined, from, to, '1'))
  assert.ok(moveSelectionError({ ...stock, isActive: false }, from, to, '1'))
})
test('실재고 100·예약 30은 최대 70, 최신 예약 40은 최대 60', () => {
  assert.equal(moveSelectionError(stock, from, to, '70'), null)
  assert.match(moveSelectionError(stock, from, to, '70.001'), /예약/)
  assert.match(moveSelectionError({ ...stock, reservedQuantity: 40, availableQuantity: 60 }, from, to, '70'), /예약/)
  assert.ok(moveSelectionError({ ...stock, reservedQuantity: 100, availableQuantity: 0 }, from, to, '1'))
})
test('기존 바닥 보관 위치와 시리얼 재고도 원래 위치 ID로 이동한다', () => {
  const floor = { ...stock, rackId: null }
  assert.equal(moveSelectionError(floor, { ...from, rackId: floorRackId }, to, '1'), null)
  assert.equal(moveSourceMatches(floor, { ...from, rackId: undefined }), false)
  const serial = { ...stock, quantity: 1, reservedQuantity: 0, availableQuantity: 1, serialManaged: true }
  assert.equal(moveSelectionError(serial, from, to, '1'), null)
  assert.ok(moveSelectionError(serial, from, to, '0.5'))
})
