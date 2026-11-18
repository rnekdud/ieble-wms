import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const origin = process.env.WMS_UI_ORIGIN || 'http://localhost:5176'
const root = '/api/tenants/fixture/stocktakes/11111111-1111-1111-1111-111111111111'
const document = { id: root.split('/').at(-1), number: 'CT-DETAIL-QA', version: 'v1', warehouseId: 'w1', warehouseName: '격리 창고', name: '실사 상세 검증', basisAt: '2026-11-06', snapshotAt: '2026-11-06', status: 'Confirmed', scope: 'Selected', scopeLabel: '선택 상품', contactName: '실사 담당자 QA' }
const items = Array.from({ length: 43 }, (_, i) => ({ id: `t${i}`, productId: `p${i}`, productCode: `PR${i}`, productName: `검증 상품 ${i}`, unit: 'EA', locationId: 'l1', locationCode: 'L01', rackCode: 'R01', lotNumber: 'LOT-QA', expiryDate: '2027-01-01', baselineQuantity: 20, baselineReserved: 0, originalQuantity: 20, originalReserved: 0, countedQuantity: 18, originalSnapshotAt: '2026-11-06', baselineAt: '2026-11-06', reason: '실물 확인', excluded: false, isUnregistered: false }))
const histories = Array.from({ length: 43 }, (_, i) => ({ id: i, action: i % 2 ? 'reopen' : 'Count', actorName: '이력 담당자 QA', createdAt: '2026-11-06T01:00:00Z', beforeJson: JSON.stringify({ ProductCode: `PR${i}`, LocationCode: 'L01', CountedQuantity: 20, Unit: 'EA' }), afterJson: JSON.stringify({ ProductCode: `PR${i}`, LocationCode: 'L01', CountedQuantity: 18, Unit: 'EA', Reason: '실물 확인' }) }))
const pageResult = (rows, url) => { const page = Number(url.searchParams.get('page') || 1), pageSize = 20; return { items: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: rows.length } }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const requests = [], errors = []
  await context.routeWebSocket(origin.replace('http:', 'ws:') + '/**', () => {})
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname
    assert.equal(url.origin, origin)
    if (path === '/__stocktake-ui') return route.fulfill({ contentType: 'text/html', body: '<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/stocktake-ui.tsx"></script></html>' })
    if (!path.startsWith('/api/')) return route.continue()
    assert.equal(req.method(), 'GET', 'No data writes during detail UI verification')
    requests.push(url)
    let result
    if (path === root) result = { document, summary: { total: 43, counted: 43, missing: 0, differences: 43, shortages: 43, excesses: 0, matches: 0 }, conflicts: [], incoming: false }
    else if (path === root + '/items') result = pageResult(url.searchParams.get('search') ? items.slice(0, 1) : items, url)
    else if (path === root + '/history') result = pageResult(histories, url)
    else throw new Error('Unexpected API: ' + path)
    await route.fulfill({ json: result })
  })
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
  const visit = () => page.goto(origin + '/__stocktake-ui?path=' + encodeURIComponent('/app/inventory/counts/' + document.id))
  const targets = page.locator('.stocktake-targets'), accordion = page.locator('.stocktake-history'), summary = accordion.locator(':scope > summary')
  const targetPager = page.getByRole('navigation', { name: '실사 대상 페이지', exact: true })
  const historyPager = page.getByRole('navigation', { name: '실사 이력 페이지', exact: true })
  for (const width of [360, 390, 430, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 }); await visit()
    await targets.getByText('검증 상품 0', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '실사 대상', exact: true }).count(), 0)
    assert.equal(await page.locator('button').filter({ hasText: '입력·재실사 이력' }).count(), 0)
    assert.equal(await accordion.getAttribute('open'), null)
    assert.equal(await targets.locator('th').count(), 10)
    assert.deepEqual(await targets.locator('tbody tr').first().locator('td').allTextContents(), ['PR0검증 상품 0', 'LOT-QA2027-01-01', '—', 'R01L01', '20 / 0최초 기준20 / 0' + await targets.locator('tbody tr').first().locator('td').nth(4).locator('details small').allTextContents().then(x => x.join('')), '18', '-2 EA', '부족', '실물 확인', ''])
    const geometry = await page.evaluate(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height,width:r.width } }
      return { search:box('.stocktake-target-toolbar'), row:box('.stocktake-target-filters'), size:box('.stocktake-target-filters + .table-scroll + .wms-pagination .table-page-size'), state:box('.stocktake-target-filters > label'), selects:[...document.querySelectorAll('.stocktake-target-filters select')].map(el=>({height:el.getBoundingClientRect().height,radius:getComputedStyle(el).borderRadius,border:getComputedStyle(el).borderColor})), table:box('.stocktake-targets'), pager:box('.stocktake-targets').bottom, pagination:box('.stocktake-target-filters + .table-scroll + .wms-pagination'), history:box('.stocktake-history') }
    })
    assert(geometry.row.y - geometry.search.bottom >= 12 && geometry.row.y - geometry.search.bottom <= 16)
    assert.equal(geometry.selects[0].height, 40); assert(geometry.size.y > geometry.table.bottom)
    assert(Math.abs(geometry.state.x - geometry.row.x) < 1, 'comparison filter stays left aligned')
    assert(geometry.table.y - geometry.row.bottom >= 8 && geometry.table.y - geometry.row.bottom <= 12)
    assert(geometry.history.y - geometry.pagination.bottom >= 16 && geometry.history.y - geometry.pagination.bottom <= 20)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'collapsed overflow ' + width)
    await summary.click(); await accordion.getByText('이력 담당자 QA', { exact: true }).first().waitFor()
    assert.equal(await accordion.locator('tbody tr').count(), 20)
    assert(await accordion.getByText('실사·재실사 수량', { exact:true }).first().isVisible())
    assert(await accordion.getByText('재실사', { exact:true }).first().isVisible())
    assert(await accordion.getByText('PR0 L01  · 18 EA 실물 확인', { exact:true }).isVisible())
    assert.equal(await targets.locator('tbody tr').count(), 20, 'history does not replace targets')
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'expanded overflow ' + width)
    await summary.click(); assert.equal(await accordion.getAttribute('open'), null)
    await summary.focus(); await page.keyboard.press('Enter'); await accordion.locator('tbody tr').first().waitFor()
    await summary.focus(); await page.keyboard.press('Space'); assert.equal(await accordion.getAttribute('open'), null)
    console.log('PASS stocktake detail layout, history, keyboard toggle at ' + width + 'px')
  }
  await page.setViewportSize({width:1440,height:1000})
  await targetPager.getByRole('button', { name:'2페이지', exact:true }).click()
  await targets.getByText('검증 상품 20', {exact:true}).waitFor()
  await Promise.all([page.waitForResponse(r => r.url().includes('/items?') && new URL(r.url()).searchParams.get('state') === 'short'), page.getByLabel('비교 상태', {exact:true}).selectOption('short')])
  assert.equal(requests.filter(u=>u.pathname.endsWith('/items')).at(-1).searchParams.get('page'), '1')
  await targets.getByText('검증 상품 0', {exact:true}).waitFor()
  await page.locator('.stocktake-target-filters + .table-scroll + .wms-pagination').getByLabel('페이지당 표시 건수').selectOption('50')
  await page.waitForFunction(()=>document.querySelectorAll('.stocktake-targets tbody tr').length===43)
  await Promise.all([page.waitForResponse(r => r.url().includes('/items?') && new URL(r.url()).searchParams.get('search') === '검증 상품 0'), page.getByLabel('대상 검색', {exact:true}).fill('검증 상품 0')])
  await targets.getByText('검증 상품 0', {exact:true}).waitFor()
  assert.equal(await targets.locator('tbody tr').count(),1)
  const q=requests.filter(u=>u.pathname.endsWith('/items')).at(-1).searchParams
  assert.equal(q.get('search'),'검증 상품 0'); assert.equal(q.get('state'),'short'); assert.equal(q.get('page'),'1')
  await summary.click(); await accordion.locator('tbody tr').first().waitFor()
  await historyPager.getByRole('button',{name:'2페이지',exact:true}).click()
  await accordion.getByText('PR20 L01  · 18 EA 실물 확인',{exact:true}).waitFor()
  await accordion.getByLabel('페이지당 표시 건수').selectOption('50')
  await page.waitForFunction(()=>document.querySelectorAll('.stocktake-history tbody tr').length===43)
  assert.equal(await historyPager.getByRole('button',{name:'1페이지',exact:true}).getAttribute('aria-current'),'page')
  document.scope='Warehouse'; document.status='Counting'
  await visit(); const quantity=targets.getByRole('spinbutton').first(); await quantity.waitFor(); await quantity.fill('17')
  await summary.click(); await accordion.locator('tbody tr').first().waitFor(); await summary.click()
  assert.equal(await quantity.inputValue(),'17','opening history preserves unsaved counts')
  assert.equal(await page.getByRole('dialog').count(),0)
  await page.getByLabel('비교 상태',{exact:true}).selectOption('match')
  await page.getByRole('dialog',{name:'저장하지 않은 실사 작업'}).waitFor()
  assert.deepEqual(errors,[])
  console.log('PASS target search/filter/page size/page reset, history pagination, unsaved count preservation and existing navigation guard; GET-only fixture API')
  await context.close()
} finally { await browser.close() }
