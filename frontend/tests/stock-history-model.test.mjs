import test from 'node:test'
import assert from 'node:assert/strict'
import { historyDefaults, historyFilter, historyParams, signedQuantity, historyTypes } from '../src/stock-history-model.ts'
test('warehouse and rack changes reset dependent filters and pagination', () => {
 const q = { ...historyDefaults, page: 5, warehouseId: 'a', rackId: 'r', locationId: 'l', actorId: 'actor' }
 const w = historyFilter(q, { warehouseId: 'b' }); assert.equal(w.page, 1); assert.equal(w.rackId, ''); assert.equal(w.locationId, ''); assert.equal(w.actorId, 'actor')
 const r = historyFilter(q, { rackId: 'x' }); assert.equal(r.warehouseId, 'a'); assert.equal(r.locationId, '')
})
test('filters encode safely and retain all export conditions', () => {
 const q = { ...historyDefaults, search: '상품&=', document: 'IN-1', serial: 'SN/1', lot: 'LOT', type: 'move' }
 const params = new URLSearchParams(historyParams(q)); assert.equal(params.get('search'), '상품&='); assert.equal(params.get('document'), 'IN-1'); assert.equal(params.get('serial'), 'SN/1'); assert.equal(params.has('warehouseId'), false)
})
test('signed quantities keep units and distinguish both move legs', () => {
 assert.equal(signedQuantity(1.25, 'kg'), '+1.25 kg'); assert.equal(signedQuantity(-1, 'EA'), '-1 EA'); assert.notEqual(historyTypes.MoveIn, historyTypes.MoveOut); assert.match(signedQuantity(1), /미기록/)
})
