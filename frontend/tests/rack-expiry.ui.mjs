import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176'
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),errors=[],requests=[]
 await context.route('**/api/**',route=>{requests.push(route.request().url());return route.abort()})
 await context.route(origin+'/__rack-expiry',route=>route.fulfill({contentType:'text/html',body:`<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>t=>t; window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/rack-expiry-ui.tsx"></script></html>`}))
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/__rack-expiry')
 const dialog=page.getByRole('dialog'),rows=dialog.locator('tbody tr')
 await rows.nth(1).waitFor();await rows.nth(0).locator('summary').click();await rows.nth(1).locator('summary').click()
 assert.match(await rows.nth(0).innerText(),/오늘 만료/)
 assert.match(await rows.nth(1).innerText(),/2028-10-10/);assert.doesNotMatch(await rows.nth(1).innerText(),/오늘 만료|유통기한 경과|가장 빠른 유통기한/)
 assert.equal(await rows.nth(1).locator('.risk-cell > .risk-tag').textContent(),'안전');assert.match(await rows.nth(1).innerText(),/이 위치: 현재고 90/)
 assert.equal(await dialog.locator('.dashboard-rack-summary .risk-tag').textContent(),'주의')
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});const b=await dialog.boundingBox();assert(b.x>=0&&b.x+b.width<=width+1)}
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[])
 console.log('PASS: same product/rack, due-today cell warns, 2028 cell remains safe, rack aggregate warns, local quantities and expiry preserved. No API calls.')
 await context.close()
}finally{await browser.close()}
