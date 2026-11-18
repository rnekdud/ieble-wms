import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Read-only UI fixtures. Every API request is intercepted; no business database is used.
const origin = process.env.WMS_UI_ORIGIN || 'http://localhost:5176'
const id = '11111111-1111-4111-8111-111111111111'
const now = '2026-11-16T02:00:00Z'
const doc = { id, number: 'QA-001', warehouseId: 'w', warehouseName: 'QA 창고', partnerName: 'QA 거래처', contactName: 'QA 담당자', expectedDate: '2026-11-16', requestDate: '2026-11-16', version: '1', inspectedAt: now }
const lines = [0, 1].map(i => ({ id: `l${i}`, productId: `p${i}`, productName: i ? '두 번째 상품' : '긴 상품명과 LongProductCode123456789012345678901234567890 표시 확인', productCode: `P${i}`, unit: i ? 'kg' : 'EA', expectedQuantity: i ? 2.5 : 10, inspectedQuantity: i ? 2 : 10, requestedQuantity: i ? 2.5 : 10, lotNumber: 'LOT-QA', expiryDate: '2027-11-16', serials: i ? [] : ['SERIAL-QA'], placements: [{ locationCode: 'RACK-A/01', quantity: i ? 2 : 10 }], plannedRackName: 'A 랙', plannedRackCode: 'RACK-A' }))
const allocations = lines.map((l, i) => ({ id: `a${i}`, lineId: l.id, rackCode: 'RACK-A', locationCode: 'RACK-A/01', lotNumber: 'LOT-QA', expiryDate: '2027-11-16', serialNumber: i ? null : 'SERIAL-QA', quantity: l.requestedQuantity, pickedQuantity: l.requestedQuantity, inspectedQuantity: i ? 2 : 10, pickedByName: 'QA 작업자', pickedAt: now, state: 'Reserved' }))
let working = false
const errors = [], unknown = [], writes = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.routeWebSocket(origin.replace('http:', 'ws:') + '/**', () => {})
  await context.route('**/*', route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname.replace('/api/tenants/fixture', '')
    if (url.origin !== origin) { unknown.push(req.url()); return route.abort() }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (req.method() !== 'GET') { writes.push(p); return route.abort() }
    const json = value => route.fulfill({ json: value })
    if (p === '/api/auth/me') return json({ user: { id: 'qa', displayName: 'QA', userName: 'qa', systemRole: 'None', mustChangePassword: false }, memberships: [{ tenantId: 'fixture', name: 'QA', role: 'Master', serviceStatus: 'Active' }], tenantResolution: 'resolved', selectedTenantId: 'fixture' })
    if (p === '/workspace') return json({ id: 'fixture', name: 'QA', role: 'Master', accountType: 'Internal', serviceStatus: 'Active', canManageBilling: false, billingAccess: { canAccessWms: true }, permissions: { receipts: ['menu', 'read', 'update'], shipments: ['menu', 'read', 'update'] } })
    if (p.startsWith('/pages/')) return json({})
    if (p === '/api/health/db') return json({ status: 'connected' })
    if (p === `/receipts/${id}`) return json({ receipt: { ...doc, inspectedAt: working ? null : now, status: 'Inspecting' }, lines })
    if (p === `/shipments/${id}`) return json({ shipment: { ...doc, status: 'Picked' }, lines, allocations, movements: [] })
    if (p.endsWith('/inspection-history')) return json({ items: [], page: 1, pageSize: 30, total: 0 })
    unknown.push(p); return route.fulfill({ status: 404, json: { message: 'Unmocked API' } })
  })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  for (const width of [360, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const kind of ['receipts', 'shipments']) {
      await page.goto(`${origin}/app/${kind}/${id}`)
      const table = page.locator('.document-detail-products').first()
      await table.locator('tbody > tr').first().waitFor()
      assert.equal(await table.locator('tbody > tr').count(), 2)
      if (kind === 'receipts') {
        const first = table.locator('tbody > tr').first()
        assert.equal(await first.locator('[data-label="총 수량"]').innerText(), '10 EA')
        assert.equal(await first.locator('[data-label="검수수량"]').innerText(), '10 EA')
        for (const title of ['LOT 1개', '보관 위치 보기', '시리얼 1개']) {
          const summary = first.locator('summary').filter({ hasText: title })
          await summary.click()
          assert.equal(await summary.evaluate(el => el.parentElement.open), true)
          await summary.click()
          assert.equal(await summary.evaluate(el => el.parentElement.open), false)
        }
      } else {
        const first = table.locator('tbody > tr').first()
        for (const label of ['요청', '예약 배정', '피킹', '검수']) assert.equal(await first.locator(`[data-label="${label}"]`).innerText(), '10')
        await page.getByText('예약 배정 및 작업 수량', { exact: true }).click()
        assert.equal(await page.locator('.document-detail-products').count(), 3)
        assert.equal(await page.locator('.document-detail-products').last().locator('tbody > tr').count(), 2)
      }
      const layout = await page.locator('.document-detail-products').evaluateAll(tables => tables.filter(t => t.getBoundingClientRect().height).map(t => ({
        head: getComputedStyle(t.tHead).display,
        rows: [...t.tBodies[0].rows].map(r => ({ display: getComputedStyle(r).display, radius: getComputedStyle(r).borderRadius, border: getComputedStyle(r).borderTopWidth, width: r.getBoundingClientRect().width })),
        overflow: t.scrollWidth > t.clientWidth + 1,
        labels: [...t.tBodies[0].rows].every(r => [...r.cells].every(c => !!c.dataset.label || c.colSpan > 1)),
      })))
      for (const result of layout) {
        assert.equal(result.head, width <= 1024 ? 'none' : 'table-header-group')
        assert.ok(result.labels)
        for (const row of result.rows) {
          assert.equal(row.display, width <= 1024 ? 'grid' : 'table-row')
          if (width <= 1024) { assert.equal(row.radius, '12px'); assert.equal(row.border, '1px'); assert.ok(row.width <= width) }
        }
        if (width <= 1024) assert.equal(result.overflow, false)
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
      console.log(`${kind} ${width}px: cards/table, quantities, details, overflow OK`)
    }
  }
  working = true
  for (const width of [360, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const kind of ['receipts', 'shipments']) {
      await page.goto(`${origin}/app/${kind}/${id}`)
      if (kind === 'shipments') await page.getByRole('button', { name: '최종 검수', exact: true }).click()
      const table = page.locator('.receipt-scan-table.document-detail-products')
      await table.locator('tbody > tr').first().waitFor()
      assert.equal(await table.locator('tbody > tr').count(), 2)
      assert.equal(await table.locator('tbody > tr').first().evaluate(r => getComputedStyle(r).display), width <= 1024 ? 'grid' : 'table-row')
      assert.equal(await table.locator('tbody > tr').first().evaluate(r => getComputedStyle(r).borderRadius), width <= 1024 ? '12px' : '0px')
      assert.equal(await table.locator('input[type="number"]').count(), 2)
      if (width <= 1024) assert.equal(await table.evaluate(t => t.scrollWidth > t.clientWidth + 1), false)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
      console.log(`${kind} work ${width}px: cards and quantity inputs OK`)
    }
  }
  assert.deepEqual(errors, []); assert.deepEqual(unknown, []); assert.deepEqual(writes, [])
} finally { await browser.close() }
