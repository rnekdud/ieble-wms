import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { chromium } from 'playwright'

const assets = resolve('android/app/src/main/assets/public'), origin = 'http://127.0.0.1:5176'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const native of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
    const requests = [], errors = []
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.startsWith('/api/')) {
        requests.push(url.href)
        return route.fulfill({ status: url.pathname === '/api/health/db' ? 503 : 401, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': origin }, body: JSON.stringify({ message: 'Test API unavailable' }) })
      }
      assert.equal(url.origin, origin)
      const file = resolve(assets, url.pathname === '/' || url.pathname === '/login' ? 'index.html' : '.' + url.pathname)
      assert(file.startsWith(assets + sep))
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
      await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] || 'application/octet-stream' })
    })
    if (native) await context.addInitScript(() => {
      window.androidBridge = {}
      window.Capacitor = {
        PluginHeaders: [
          { name: 'WmsApi', methods: [{ name: 'getConfiguration', rtype: 'promise' }] },
          { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'minimizeApp', rtype: 'promise' }] },
        ],
        nativePromise: async (plugin, method) => {
          if (plugin === 'WmsApi' && method === 'getConfiguration') return { baseUrl: 'http://localhost:5080' }
          if (method === 'minimizeApp') { window.didMinimize = true; return }
          throw new Error('Unexpected native call')
        },
        nativeCallback: (_plugin, _method, _options, callback) => { window.nativeBack = callback; return 'test-listener' },
      }
    })
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin + '/login')
    await page.getByRole('button', { name: '로그인', exact: true }).waitFor()
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      assert(await page.locator('input[name=email]').isVisible())
    }
    assert(requests.some(url => url.startsWith(native ? 'http://localhost:5080/api/' : origin + '/api/')))
    if (native) {
      assert(await page.evaluate(() => {
        const dialog = document.createElement('dialog'); document.body.append(dialog); dialog.showModal()
        let canceled = false; dialog.addEventListener('cancel', () => { canceled = true; dialog.remove() })
        window.nativeBack({ canGoBack: false }); return canceled
      }))
      await page.evaluate(() => window.nativeBack({ canGoBack: false }))
      await page.waitForFunction(() => window.didMinimize)
    }
    assert.deepEqual(errors, [])
    console.log(`PASS bundled APK assets render login offline, portrait/landscape, ${native ? 'simulated native API mapping and back button' : 'web fallback'}; no real API writes`)
    await context.close()
  }
} finally { await browser.close() }
