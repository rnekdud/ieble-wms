import assert from 'node:assert/strict'
import { chromium } from 'playwright'

let input = ''
for await (const chunk of process.stdin) input += chunk
const fixture = JSON.parse(input), origin = process.env.UI_ORIGIN || 'http://127.0.0.1:5176'
assert.equal(origin, 'http://127.0.0.1:5176')
const root = `/api/tenants/${fixture.tenant}/company`, writes = [], errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  async function context(mobile = false) {
    const ctx = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' })
    await ctx.routeWebSocket(origin.replace('http:', 'ws:') + '/**', () => {})
    await ctx.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url())
      assert.equal(url.origin, origin)
      if (url.pathname === '/__company-logo-cards') return route.fulfill({ contentType: 'text/html', body: '<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/company-logo-cards.tsx"></script></html>' })
      if (!url.pathname.startsWith('/api/')) return route.continue()
      if (url.pathname === '/api/health/db') return route.fulfill({ json: { status: 'connected', database: 'isolated SQLite fixture' } })
      if (req.method() !== 'GET' && url.pathname === root) writes.push(req.postDataJSON())
      const response = await ctx.request.fetch('http://localhost:5086' + url.pathname + url.search, { method: req.method(), headers: req.headers(), data: req.postDataBuffer() || undefined, failOnStatusCode: false })
      if (response.status() >= 500) errors.push(`${response.status()} ${url.pathname}`)
      await route.fulfill({ status: response.status(), headers: response.headers(), body: await response.body() })
    })
    return ctx
  }
  const ctx = await context(), page = await ctx.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  let acceptSave = true
  page.on('dialog', dialog => acceptSave ? dialog.accept() : dialog.dismiss())
  const editor = page.locator('.company-logo-editor'), card = editor.locator('.company-logo-preview')
  const upload = file => editor.getByLabel('기업 로고 파일').setInputFiles(file)
  async function discardDraft() {
    await page.getByRole('link', { name: '상품관리', exact: true }).click()
    await page.getByRole('button', { name: '변경 버리고 계속', exact: true }).click()
    await page.waitForURL('**/app/products')
    await page.goto(origin + '/app/settings/company')
    await editor.waitFor()
  }
  const remove = async () => { await card.hover(); await editor.getByRole('button', { name: '로고 제거', exact: true }).click() }
  async function login(p) {
    await p.goto(origin + '/login')
    await p.locator('input[name=email]').fill('Master@org.test')
    await p.locator('input[name=password]').fill(fixture.password)
    await p.getByRole('button', { name: '로그인', exact: true }).click()
    await p.locator('.wms-layout').waitFor()
    await p.goto(origin + '/app/settings/company')
    await p.locator('.company-logo-editor').waitFor()
  }
  async function save(p = page) {
    const response = p.waitForResponse(r => new URL(r.url()).pathname === root && r.request().method() === 'POST')
    await p.getByRole('button', { name: '기업 정보 저장', exact: true }).click()
    assert.equal((await response).status(), 200)
    await p.locator('.company-logo-editor').locator('small[role=status]').waitFor({ state: 'detached' })
  }
  // Compare real logo and product components under the same responsive constraints.
  await page.goto(origin + '/__company-logo-cards')
  await card.waitFor()
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const styles = await page.locator('.product-gallery-select,.product-gallery-add').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(), css = getComputedStyle(node)
      return { width: rect.width, height: rect.height, radius: css.borderRadius, border: css.border, background: css.backgroundColor }
    }))
    assert.deepEqual(styles[0], styles[1]); assert.equal(styles.length, 3)
    assert.equal(styles[0].width, styles[0].height)
    if (width === 1440) assert.equal(styles[0].width, 140)
    assert.equal(await editor.locator('.product-gallery-grid').evaluate(node => getComputedStyle(node).columnGap), '12px')
    assert.equal(await card.locator('img').evaluate(node => getComputedStyle(node).objectFit), 'contain')
  }
  await page.goto(origin + '/__company-logo-cards?readonly=1')
  await card.waitFor(); assert.equal(await editor.locator('button,input').count(), 0)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await login(page)
  assert.equal(await card.count(), 0)
  assert.equal(await editor.locator('.product-gallery-grid > *').count(), 1)
  const buffers = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 60
    const painter = canvas.getContext('2d'); painter.fillStyle = '#172b4d'; painter.fillRect(0, 0, 240, 60)
    return ['image/png', 'image/jpeg', 'image/webp'].map(type => canvas.toDataURL(type).split(',')[1])
  })
  const files = ['png', 'jpg', 'webp'].map((extension, index) => ({ name: 'logo.' + extension, mimeType: ['image/png', 'image/jpeg', 'image/webp'][index], buffer: Buffer.from(buffers[index], 'base64') }))
  const chooserEvent = page.waitForEvent('filechooser')
  await editor.getByRole('button', { name: '로고 등록', exact: true }).click()
  const chooser = await chooserEvent; assert.equal(chooser.isMultiple(), false); await chooser.setFiles(files[0])
  await card.locator('img[src^="data:"]').waitFor()
  assert.equal(writes.length, 0); assert.equal(await page.locator('.wms-company img').count(), 0)
  assert.equal(await editor.getByRole('button', { name: /이미지 추가|로고 변경 취소/ }).count(), 0)
  assert.equal(await editor.locator('.product-gallery-grid > *').count(), 1)
  await discardDraft(); assert.equal(await card.count(), 0)
  await upload(files[0]); await card.locator('img[src^="data:"]').waitFor()
  acceptSave = false; await page.getByRole('button', { name: '기업 정보 저장', exact: true }).click(); acceptSave = true
  assert.equal(writes.length, 0); assert.equal(await card.locator('img[src^="data:"]').count(), 1)
  await save(); await page.locator('.wms-company img').evaluate(node => node.decode())
  let savedSource = await page.locator('.wms-company img').getAttribute('src')
  await page.reload(); await card.locator('img').waitFor()
  assert.equal(await page.locator('.wms-company img').getAttribute('src'), savedSource)
  const count = writes.length
  const replacementEvent = page.waitForEvent('filechooser')
  await card.hover(); await editor.getByRole('button', { name: '로고 변경', exact: true }).click()
  const replacement = await replacementEvent; assert.equal(replacement.isMultiple(), false); await replacement.setFiles(files[1])
  await card.locator('img[src^="data:"]').waitFor()
  assert.equal(await card.count(), 1); assert.equal(await editor.locator('.product-gallery-grid > *').count(), 1)
  assert.equal(await page.locator('.wms-company img').getAttribute('src'), savedSource)
  await discardDraft(); assert.equal(await card.locator('img').getAttribute('src'), savedSource)
  await remove(); assert.equal(await card.count(), 0); assert.equal(await page.locator('.wms-company img').count(), 1)
  await discardDraft(); assert.equal(await card.locator('img').getAttribute('src'), savedSource)
  assert.equal(writes.length, count)
  await card.locator('button.product-gallery-select').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '로고 제거')
  await page.keyboard.press('Enter'); assert.equal(await card.count(), 0); await discardDraft()
  for (const file of [files[1], files[2]]) {
    await upload(file); await card.locator('img[src^="data:"]').waitFor(); await save()
    await page.waitForFunction(previous => document.querySelector('.wms-company img')?.getAttribute('src') !== previous, savedSource)
    savedSource = await page.locator('.wms-company img').getAttribute('src')
    await page.reload(); await card.locator('img').waitFor()
    assert.equal(await page.locator('.wms-company img').getAttribute('src'), savedSource)
  }
  const savedWrites = writes.length
  for (const bad of [
    { name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') },
    { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) },
    { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid-image') },
  ]) {
    await upload(bad); await editor.getByRole('alert').waitFor()
    assert.equal(await card.locator('img').getAttribute('src'), savedSource)
  }
  assert.equal(writes.length, savedWrites)
  await upload(files[0]); await card.locator('img[src^="data:"]').waitFor()
  await page.getByRole('link', { name: '상품관리', exact: true }).click()
  await page.getByRole('button', { name: '계속 편집', exact: true }).click()
  assert.equal(await card.locator('img[src^="data:"]').count(), 1)
  await page.getByRole('link', { name: '상품관리', exact: true }).click()
  await page.getByRole('button', { name: '변경 버리고 계속', exact: true }).click()
  await page.waitForURL('**/app/products')
  await page.goto(origin + '/app/settings/company'); await card.locator('img').waitFor()
  assert.equal(await card.locator('img').getAttribute('src'), savedSource); assert.equal(writes.length, savedWrites)
  console.log('PASS: real product card style equality, file chooser, single draft, cancellation, save confirmation, PNG/JPG/WEBP, validation, reload and navigation discard')
  const mobileContext = await context(true), mp = await mobileContext.newPage()
  mp.setDefaultTimeout(10000); mp.on('dialog', dialog => dialog.accept()); mp.on('pageerror', error => errors.push(error.message))
  await login(mp)
  const mobileEditor = mp.locator('.company-logo-editor')
  await mobileEditor.getByRole('button', { name: '기업 로고 선택', exact: true }).tap()
  await mobileEditor.getByRole('button', { name: '로고 제거', exact: true }).tap()
  assert.equal(await mobileEditor.locator('img').count(), 0); assert.equal(await mp.locator('.wms-company img').count(), 1)
  await mp.reload(); await mobileEditor.locator('img').waitFor()
  await mobileEditor.getByLabel('기업 로고 파일').setInputFiles(files[0]); await mobileEditor.locator('img[src^="data:"]').waitFor()
  await save(mp); await mp.locator('.wms-company img').evaluate(node => node.decode())
  await mp.reload(); await mp.locator('.wms-company img').waitFor()
  assert.equal(await mp.locator('.wms-company img').evaluate(node => getComputedStyle(node).objectFit), 'contain')
  assert(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  assert.equal(await mobileEditor.locator('.company-logo-preview').count(), 1)
  await mobileEditor.getByRole('button', { name: '기업 로고 선택', exact: true }).tap()
  await mobileEditor.getByRole('button', { name: '로고 제거', exact: true }).tap(); await save(mp)
  await mp.locator('.wms-company img').waitFor({ state: 'detached' })
  await mp.reload(); await mobileEditor.waitFor(); assert.equal(await mobileEditor.locator('img').count(), 0)
  await page.reload(); await editor.waitFor(); assert.equal(await page.locator('.wms-company img').count(), 0)
  assert.equal(writes.length, 5); assert(writes.every(write => !Array.isArray(write.logo)))
  assert.deepEqual(errors, [])
  console.log('PASS: touch removal/discard, mobile save/header/reload, final removal persists on desktop/mobile; only isolated SQLite mutations')
} finally { await browser.close() }
