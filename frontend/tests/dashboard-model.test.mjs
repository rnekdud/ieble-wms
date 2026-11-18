import test from 'node:test'
import assert from 'node:assert/strict'
import { canTask, businessEntry, reportEntry } from '../src/dashboard-model.ts'
test('shortcuts require menu read and the specific action', () => {
 assert.equal(canTask({ receipts: ['create'] }, 'receipts', 'create'), false)
 assert.equal(canTask({ receipts: ['menu', 'read'] }, 'receipts', 'create'), false)
 assert.equal(canTask({ receipts: ['menu', 'read', 'create'] }, 'receipts', 'create'), true)
 assert.equal(canTask({}, 'stock-overview'), false)
})
test('entry hints validate document identity and never grant creation access', () => {
 assert.equal(businessEntry('?action=new', false), null)
 assert.deepEqual(businessEntry('?action=new', true), { id: null })
 const id = '96017713-d6df-4a0e-bee9-7c5e285b2e04'
 assert.deepEqual(businessEntry('?document=' + id, false), { id })
 assert.equal(businessEntry('?document=../other', true), null)
})
test('report links only initialize supported warning filters and views', () => {
 assert.deepEqual(reportEntry('?status=low'), { status: 'low' })
 assert.deepEqual(reportEntry('?status=expired&view=location'), { status: 'expired', view: 'location' })
 assert.deepEqual(reportEntry('?status=invalid&view=other&tenantId=other'), {})
})
