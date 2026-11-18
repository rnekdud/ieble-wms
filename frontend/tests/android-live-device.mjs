import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

// Explicit device-only check. No credential values, business data, screenshots or reports are logged.
const browser = await chromium.connectOverCDP(process.env.WMS_DEVICE_CDP || 'http://127.0.0.1:9228')
const restored = []
try {
  const context = browser.contexts()[0]
  const page = context.pages().find(p => p.url().startsWith('http://localhost:5174/'))
  assert(page, 'Open the WMS Live Reload app and keep the Galaxy unlocked')
  page.setDefaultTimeout(15000)
  const cdp = await context.newCDPSession(page), updates = []
  await cdp.send('Network.enable')
  cdp.on('Network.webSocketFrameReceived', event => {
    try { const data = JSON.parse(event.response.payloadData); if (data.type === 'update') updates.push(...data.updates.map(update => update.path)) } catch { /* Non-Vite frames are ignored. */ }
  })
  const before = await page.evaluate(async () => {
    const me = await fetch('/api/auth/me', { credentials:'same-origin', cache:'no-store' })
    const csrf = await fetch('/api/auth/csrf', { credentials:'same-origin', cache:'no-store' })
    const token = await csrf.json()
    return { origin:location.origin, path:location.pathname, platform:window.Capacitor?.getPlatform?.(), me:me.status, csrf:csrf.status, tokenIssued:typeof token.token === 'string' && token.token.length > 0, serviceWorkers:(await navigator.serviceWorker.getRegistrations()).length, timeOrigin:performance.timeOrigin, width:innerWidth, overflow:document.documentElement.scrollWidth > innerWidth + 1 }
  })
  assert.equal(before.platform, 'android'); assert.equal(before.me, 200); assert.equal(before.csrf, 200); assert(before.tokenIssued); assert.equal(before.serviceWorkers, 0)
  const cookiesBefore = (await context.cookies()).filter(cookie => cookie.name.startsWith('ieble.'))
  assert(cookiesBefore.some(cookie => cookie.name === 'ieble.session' && cookie.httpOnly && cookie.sameSite === 'Strict'))
  assert(cookiesBefore.some(cookie => cookie.name === 'ieble.csrf' && cookie.httpOnly && cookie.sameSite === 'Strict'))
  console.log('PASS Galaxy Origin http://localhost:5174; Android bridge; authenticated /api/auth/me 200; CSRF 200; Strict HttpOnly cookies; no service worker')
  if (process.argv.includes('--hmr')) {
    assert(process.env.WMS_HMR_SOURCE_ROOT, 'Specify the Vite source root explicitly for the temporary HMR edit')
    const sourceRoot = resolve(process.env.WMS_HMR_SOURCE_ROOT)
    const component = resolve(sourceRoot, 'src/components/mobile/MobileRuntime.tsx'), stylesheet = resolve(sourceRoot, 'src/components/mobile/mobile.css')
    const original = await readFile(component, 'utf8')
    const needle = 'return mobile && !online ? <div className="mobile-offline" role="alert">네트워크 연결이 끊겼습니다. 저장·확정 결과를 확인한 뒤 다시 시도하세요.</div> : null'
    assert(original.includes(needle))
    const replacement = 'return <>{isAndroidApp() && <div data-wms-live-check="true" style={{position:"fixed",top:80,left:16,zIndex:99999,padding:12,background:"#16345f",color:"white"}}>Live Reload 연결 확인</div>}{mobile && !online ? <div className="mobile-offline" role="alert">네트워크 연결이 끊겼습니다. 저장·확정 결과를 확인한 뒤 다시 시도하세요.</div> : null}</>'
    restored.push({ file:component, from:replacement, to:needle })
    await writeFile(component, original.replace(needle, replacement))
    await page.locator('[data-wms-live-check]').waitFor({state:'visible'})
    console.log('PASS React TSX edit appeared on the real Galaxy without reinstall/reload')
    const css = '\n/* Temporary USB HMR verification; removed in finally. */\n[data-wms-live-check] { background: rgb(17, 119, 85) !important; }\n'
    restored.push({file:stylesheet,from:css,to:''})
    await writeFile(stylesheet, (await readFile(stylesheet,'utf8')) + css)
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-wms-live-check]')).backgroundColor === 'rgb(17, 119, 85)')
    console.log('PASS CSS edit appeared on the real Galaxy')
    for (const entry of restored.splice(0).reverse()) { const current=await readFile(entry.file,'utf8'); assert(current.includes(entry.from)); await writeFile(entry.file,current.replace(entry.from,entry.to)) }
    await page.locator('[data-wms-live-check]').waitFor({state:'detached'})
    await page.waitForFunction(timeOrigin => performance.timeOrigin === timeOrigin, before.timeOrigin)
    assert(updates.some(path=>path.includes('MobileRuntime.tsx')), 'Vite WebSocket must deliver the React HMR update')
    assert(updates.some(path=>path.includes('mobile.css')), 'Vite WebSocket must deliver the CSS HMR update')
    console.log('PASS React/CSS restoration and Vite WebSocket update frames; same document retained')
  }
  const after = await page.evaluate(async()=>({me:(await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'})).status,path:location.pathname,timeOrigin:performance.timeOrigin}))
  assert.equal(after.me,200); assert.equal(after.timeOrigin,before.timeOrigin); assert.equal(after.path,before.path)
  const cookiesAfter=await context.cookies()
  for (const cookie of cookiesBefore) assert.equal(cookiesAfter.find(c=>c.name===cookie.name)?.value,cookie.value,'HMR must preserve '+cookie.name)
  console.log('PASS authenticated user endpoint and session/CSRF cookies remained intact; no business API mutations')
  await cdp.detach()
} finally {
  for (const entry of restored.reverse()) { const current=await readFile(entry.file,'utf8'); if(current.includes(entry.from)) await writeFile(entry.file,current.replace(entry.from,entry.to)) }
  await browser.close()
}
