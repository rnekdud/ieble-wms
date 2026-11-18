import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin = process.env.UI_ORIGIN || 'http://127.0.0.1:5176'
const browser = await chromium.launch({channel:'chrome',headless:true})
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 const errors=[],requests=[]
 await context.route('**/api/**',route=>{requests.push(route.request().url());return route.abort()})
 await context.route(origin+'/__tracking-ui',route=>route.fulfill({contentType:'text/html',body:`<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>t=>t; window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/receipt-tracking-ui.tsx"></script></html>`}))
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/__tracking-ui')
 const dialog=page.getByRole('dialog'),save=()=>dialog.getByRole('button',{name:'저장',exact:true}).click(),lot=()=>dialog.getByRole('tab',{name:/LOT/}).click(),serial=()=>dialog.getByRole('tab',{name:/시리얼/}).click(),reopen=()=>page.getByRole('button',{name:'추적 정보 입력(선택)',exact:true}).click()
 await dialog.waitFor();await dialog.getByText('농심 새우깡 90g · 예정 수량 100 EA',{exact:true}).waitFor()
 assert.equal(await dialog.locator('table').count(),0)
 const emptyHeight=(await dialog.boundingBox()).height
 assert(emptyHeight<450);assert.equal(Math.round((await dialog.boundingBox()).width),800)
 await serial();assert.equal(await dialog.locator('table').count(),0);assert.equal(await dialog.getByRole('status').count(),0)
 await save();await dialog.waitFor({state:'hidden'});assert.equal(await page.getByLabel('저장된 추적 정보').textContent(),'[]');await reopen()
 await dialog.getByRole('button',{name:'+ LOT 추가',exact:true}).click()
 await page.getByLabel('LOT 번호 1',{exact:true}).fill('LOT-001');await page.getByLabel('LOT 유통기한 1',{exact:true}).fill('2027-05-10');await page.getByLabel('LOT 수량 1',{exact:true}).fill('101')
 await save();await dialog.getByRole('alert').filter({hasText:'초과'}).waitFor()
 await page.getByLabel('LOT 수량 1',{exact:true}).fill('50')
 await serial();await dialog.getByRole('button',{name:'+ 시리얼 추가',exact:true}).click();await page.getByLabel('시리얼 번호 1',{exact:true}).fill('SN-001')
 await dialog.getByRole('button',{name:'+ 시리얼 추가',exact:true}).click();await page.getByLabel('시리얼 번호 2',{exact:true}).fill('SN-001')
 assert.deepEqual(await dialog.locator('thead th').allTextContents(),['시리얼 번호*','관리'])
 await save();await dialog.getByRole('alert').filter({hasText:'중복'}).waitFor()
 await page.getByLabel('시리얼 번호 2',{exact:true}).fill('SN-002')
 await lot();assert.equal(await page.getByLabel('LOT 번호 1',{exact:true}).inputValue(),'LOT-001');await dialog.getByRole('status').filter({hasText:'입력한 LOT 수량 50 / 예정 수량 100 EA'}).waitFor()
 await save();await dialog.waitFor({state:'hidden'});await reopen();await serial();assert.equal(await page.getByLabel('시리얼 번호 2',{exact:true}).inputValue(),'SN-002')
 await dialog.getByRole('button',{name:'시리얼 2 삭제',exact:true}).click();await dialog.getByRole('button',{name:'취소',exact:true}).click();await reopen();await serial();assert.equal(await page.getByLabel('시리얼 번호 2',{exact:true}).inputValue(),'SN-002')
 await dialog.locator('.receipt-serial-bulk > summary').click();await page.getByLabel('시리얼 일괄 입력',{exact:true}).fill('SN-003\nSN-004');await dialog.getByRole('button',{name:'목록에 추가',exact:true}).click()
 await dialog.getByRole('tab',{name:'시리얼 (4)',exact:true}).waitFor();await dialog.locator('.receipt-serial-bulk > summary').click()
 for(const width of [1920,1440,1280,768,390]) {
  await page.setViewportSize({width,height:900});await lot()
  const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await serial();const actions=await dialog.locator(':scope > .dialog-actions').boundingBox();assert(actions.y+actions.height<=900)
 }
 await page.setViewportSize({width:390,height:600})
 for(let i=0;i<12;i++)await dialog.getByRole('button',{name:'+ 시리얼 추가',exact:true}).click()
 const sizes=await dialog.evaluate(el=>({height:el.getBoundingClientRect().height,body:el.querySelector('.dialog-body').clientHeight,scroll:el.querySelector('.dialog-body').scrollHeight,footer:el.querySelector('footer').getBoundingClientRect().bottom}))
 assert(sizes.height<=511);assert(sizes.scroll>sizes.body);assert(sizes.footer<=600)
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[])
 console.log('PASS: both empty states, row add/delete, tab/save/reopen retention, cancel, bulk serials, duplicate/quantity validation, five viewport widths and body-only scrolling. No API requests.')
 await context.close()
}finally{await browser.close()}
