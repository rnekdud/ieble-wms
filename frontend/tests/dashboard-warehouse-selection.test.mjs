import test from 'node:test'
import assert from 'node:assert/strict'
import { readDashboardWarehouse, rememberDashboardWarehouse, resolveDashboardWarehouse } from '../src/dashboard-warehouse-selection.ts'

function storage() {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}
test('last warehouse survives a revisit without leaking into another company', () => {
  const memory = storage()
  rememberDashboardWarehouse('company-a', 'warehouse-a2', memory)
  rememberDashboardWarehouse('company-b', 'warehouse-b1', memory)
  assert.equal(readDashboardWarehouse('company-a', memory), 'warehouse-a2')
  assert.equal(readDashboardWarehouse('company-b', memory), 'warehouse-b1')
  assert.equal(readDashboardWarehouse('company-c', memory), '')
})
test('deleted, inactive and foreign saved selections fall back to an authorized warehouse', () => {
  const active = [{ id: 'warehouse-a1' }, { id: 'warehouse-a2' }]
  for (const unavailable of ['deleted', 'inactive', 'warehouse-b1', '']) {
    assert.equal(resolveDashboardWarehouse(active, unavailable).id, 'warehouse-a1')
  }
  assert.equal(resolveDashboardWarehouse(active, 'warehouse-a2').id, 'warehouse-a2')
})
test('zero warehouses clears the remembered selection; one warehouse is the default', () => {
  const memory = storage()
  rememberDashboardWarehouse('company-a', 'removed', memory)
  assert.equal(resolveDashboardWarehouse([], readDashboardWarehouse('company-a', memory)), undefined)
  rememberDashboardWarehouse('company-a', '', memory)
  assert.equal(readDashboardWarehouse('company-a', memory), '')
  assert.equal(resolveDashboardWarehouse([{ id: 'only-warehouse' }], 'removed').id, 'only-warehouse')
})
test('blocked browser storage never prevents warehouse selection', () => {
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
  assert.equal(readDashboardWarehouse('company-a', blocked), '')
  assert.doesNotThrow(() => rememberDashboardWarehouse('company-a', 'one', blocked))
  assert.doesNotThrow(() => rememberDashboardWarehouse('company-a', '', blocked))
  assert.equal(resolveDashboardWarehouse([{ id: 'one' }], '').id, 'one')
})
