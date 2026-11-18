import test from 'node:test'
import assert from 'node:assert/strict'
import { statsDefaults, statsRange, statsFilter, statsParams, statsDetailQuery } from '../src/movement-stats-model.ts'
test('inclusive calendar shortcuts handle leap months and year boundaries', () => {
 assert.deepEqual(statsRange('30', '2026-01-01'), { start: '2025-12-03', end: '2026-01-01' })
 assert.deepEqual(statsRange('7', '2026-10-31'), { start: '2026-10-25', end: '2026-10-31' })
 assert.deepEqual(statsRange('lastMonth', '2024-03-15'), { start: '2024-02-01', end: '2024-02-29' })
 assert.deepEqual(statsRange('month', '2026-10-31'), { start: '2026-10-01', end: '2026-10-31' })
 assert.deepEqual(statsRange('today', '2026-10-31'), { start: '2026-10-31', end: '2026-10-31' })
})
test('filters reset pagination and encode user strings without exposing blank ids', () => {
 const q = statsFilter({ ...statsDefaults, page: 6 }, { search: '한글&=x', direction: 'receipt' })
 assert.equal(q.page, 1); const p = new URLSearchParams(statsParams(q)); assert.equal(p.get('search'), '한글&=x'); assert.equal(p.has('productId'), false)
})
test('drilldown preserves grouping unit and document detail includes all document products', () => {
 const q = { ...statsDefaults, start: '2026-10-01', end: '2026-10-31', page: 3, productId: 'p', search: 'search' }
 assert.equal(statsDetailQuery(q, { id: 'p', unit: 'kg' }).unit, 'kg')
 const d = statsDetailQuery(q, { documentId: 'doc', direction: 'shipment' }); assert.equal(d.productId, ''); assert.equal(d.search, ''); assert.equal(d.documentId, 'doc'); assert.equal(d.page, 1)
})
