// Run existing UI fixtures against the actual bundled iOS web output.
// The native bridge and API are mocked; this is NOT an iOS Simulator/device test.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { chromium } from 'playwright'

const suite = process.argv[2] || 'product-packaging'
if (!/^[a-z0-9-]+$/.test(suite) || suite === 'ios-package') throw new Error('Invalid test suite')
const origin = 'http://127.0.0.1:5176'
process.env.UI_ORIGIN = origin
process.env.WMS_UI_ORIGIN = origin
const root = resolve(import.meta.dirname, '../ios/App/App/public')
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.woff2':'font/woff2' }
const launch = chromium.launch.bind(chromium)
let nativeCalls = 0
chromium.launch = async options => {
  const browser = await launch(options)
  const newContext = browser.newContext.bind(browser)
  browser.newContext = async options => {
    const context = await newContext(options)
    await context.exposeBinding('iosNativeConfiguration', () => { nativeCalls++; return { baseUrl: origin } })
    await context.addInitScript(() => {
      window.webkit = { messageHandlers: { bridge: {} } }
      window.Capacitor = {
        PluginHeaders: [{ name: 'WmsApi', methods: [{ name: 'getConfiguration', rtype: 'promise' }] }],
        nativePromise: (plugin, method) => {
          if (plugin !== 'WmsApi' || method !== 'getConfiguration') throw new Error('Unexpected native call')
          return window.iosNativeConfiguration()
        },
      }
    })
    const newPage = context.newPage.bind(context)
    context.newPage = async () => {
      const page = await newPage()
      await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.pathname.startsWith('/api/')) return route.fallback()
        // No real network/API requests; existing suite handlers provide every fixture.
        if (url.origin !== origin) return route.abort()
        const path = route.request().isNavigationRequest() ? '/index.html' : decodeURIComponent(url.pathname)
        const file = resolve(root, '.' + path)
        assert(file.startsWith(root + '/'))
        try { await route.fulfill({ body: await readFile(file), contentType: mime[extname(file)] || 'application/octet-stream' }) }
        catch { await route.fulfill({ status:404, body:'Missing bundled asset' }) }
      })
      return page
    }
    return context
  }
  return browser
}
await import(`./${suite}.ui.mjs`)
assert(nativeCalls > 0, 'iOS entry must initialize the native configuration before rendering')
console.log(`iOS bundled web / mock bridge: ${suite} passed (${nativeCalls} initializations). Native WebKit/device unverified.`)
