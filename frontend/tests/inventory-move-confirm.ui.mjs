import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin = process.env.UI_ORIGIN || 'http://localhost:5176'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const stock = { id:'source', version:'v1', productId:'p1', productName:'농심 새우깡 90g', productCode:'PR01', warehouseId:'w1', warehouseName:'제1물류창고', rackId:'r1', rackCode:'R-01', locationId:'l1', locationCode:'R-01-L01-B02', unit:'EA', quantity:5000, reservedQuantity:100, availableQuantity:4900, lotNumber:'LOT-001', expiryDate:'2027-05-10', serialNumber:null, serialManaged:false, isActive:true }
const choice = (id, name, code='') => ({ id,name,code,unit:null,lotManaged:false,expiryManaged:false,serialManaged:false })
try {
 const context = await browser.newContext({ viewport:{width:1440,height:900}, serviceWorkers:'block' })
 const errors=[], writes=[]
 let responseStatus=503
 await context.route('**/api/**', async route => {
  const req=route.request(), url=new URL(req.url())
  let data={}
  if (url.pathname.endsWith('/csrf')) data={token:'fixture'}
  else if (url.pathname.endsWith('/move')) {
   writes.push(req.postDataJSON())
   await new Promise(resolve=>setTimeout(resolve,250))
   return route.fulfill({status:responseStatus,json:responseStatus===200?{id:'fixture-result'}:{message:'QA 이동 실패'}})
  } else if(req.method()!=='GET') throw new Error('Unexpected write '+url)
  else if(url.pathname.endsWith('/source')) data={stock}
  else if(url.pathname.endsWith('/choices')) {
   const kind=url.searchParams.get('kind')
   const items=kind==='move-stocks'?[{...choice('source','LOT-001'),...stock}]:kind==='move-warehouses'?[choice('w1','제1물류창고'),choice('w2','제2물류창고')]:kind==='move-racks'?[choice('r2','랙 2','R-02'),choice('00000000-0000-0000-0000-000000000000','랙 없는 보관 위치')]:kind==='move-locations'?[choice('l2','2단 1칸','BIN-0021')]:[]
   data={items,total:items.length}
  }
  await route.fulfill({json:data})
 })
 await context.route(origin+'/__move-confirm',route=>route.fulfill({contentType:'text/html',body:`<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>t=>t; window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/inventory-move-confirm-ui.tsx"></script></html>`}))
 const page=await context.newPage(); page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)})
 const pick=async(label,name)=>{await page.getByRole('button',{name:new RegExp('^'+label)}).click();await page.getByRole('option',{name:new RegExp(name)}).click()}
 async function prepare(warehouse='제2물류창고',rack='랙 2') {
  await page.goto(origin+'/__move-confirm')
  await pick('도착 창고',warehouse);await pick('도착 랙',rack);await pick('도착 보관 위치','2단 1칸')
  await page.getByLabel('이동 수량',{exact:true}).fill('1000');await page.getByLabel('이동 사유',{exact:true}).fill('위치 정리')
  await page.getByRole('button',{name:'재고 이동',exact:true}).click()
  await page.getByRole('dialog',{name:'재고 이동 확정',exact:true}).waitFor()
 }
 await prepare()
 const dialog=page.locator('dialog.inventory-move-confirm-dialog')
 assert.match(await dialog.locator('.move-confirm-summary').innerText(),/농심 새우깡 90g[\s\S]*PR01[\s\S]*1,000/)
 assert.deepEqual(await dialog.locator('.move-confirm-place > strong').allTextContents(),['제1물류창고','제2물류창고'])
 assert.match(await dialog.locator('.move-confirm-route').innerText(),/R-01[\s\S]*R-02 · 2단 1칸[\s\S]*BIN-0021/)
 for(const width of [1920,1440,1280,768,390]) {
  await page.setViewportSize({width,height:900})
  const size=await dialog.evaluate(el=>{
   const rect=el.getBoundingClientRect(), body=el.querySelector('.dialog-body'),buttons=[...el.querySelectorAll('footer button')].map(b=>b.getBoundingClientRect()),arrow=el.querySelector('.move-confirm-arrow').getBoundingClientRect(),route=el.querySelector('.move-confirm-route').getBoundingClientRect()
   return {x:rect.x,right:rect.right,width:rect.width,overflow:body.scrollWidth>body.clientWidth,buttons:buttons.map(b=>({x:b.x,right:b.right,y:b.y,height:b.height,width:b.width})),arrowCenter:arrow.x+arrow.width/2,routeCenter:route.x+route.width/2}
  })
  assert(size.x>=0&&size.right<=width);assert.equal(Math.round(size.width),Math.min(500,width-32));assert(!size.overflow)
  assert.equal(size.buttons[0].height,size.buttons[1].height);assert.equal(size.buttons[0].y,size.buttons[1].y);assert(size.buttons[1].width>size.buttons[0].width)
  assert(Math.abs(size.buttons[1].x-size.buttons[0].right-8)<1);assert(Math.abs(size.arrowCenter-size.routeCenter)<1)
 }
 await page.setViewportSize({width:390,height:480})
 const scrolling=await dialog.evaluate(el=>({body:el.querySelector('.dialog-body').clientHeight,scroll:el.querySelector('.dialog-body').scrollHeight,footer:el.querySelector('footer').getBoundingClientRect().bottom}))
 assert(scrolling.scroll>scrolling.body);assert(scrolling.footer<=480)
 await dialog.getByRole('button',{name:'취소',exact:true}).click()
 assert.equal(await page.getByLabel('이동 수량',{exact:true}).inputValue(),'1000');assert.equal(await page.getByLabel('이동 사유',{exact:true}).inputValue(),'위치 정리');assert.equal(writes.length,0)
 await page.getByRole('button',{name:'재고 이동',exact:true}).click()
 await dialog.getByRole('button',{name:'이동 확정',exact:true}).click()
 await dialog.getByRole('button',{name:'처리 결과 다시 확인',exact:true}).waitFor()
 assert.equal(writes.length,1);assert(await dialog.getByRole('button',{name:'취소',exact:true}).isDisabled())
 responseStatus=200
 await dialog.getByRole('button',{name:'처리 결과 다시 확인',exact:true}).evaluate(el=>{el.click();el.click()})
 await page.waitForFunction(()=>document.body.dataset.saved==='true')
 assert.equal(writes.length,2);assert.equal(writes[0].requestId,writes[1].requestId);assert.equal(writes[1].quantity,1000);assert.equal(writes[1].stockId,'source');assert.equal(writes[1].warehouseId,'w2')
 await prepare('제1물류창고','랙 없는 보관 위치')
 assert.deepEqual(await dialog.locator('.move-confirm-place > strong').allTextContents(),['제1물류창고','제1물류창고'])
 assert(!/R-02|랙 없는/.test(await dialog.locator('.move-confirm-place').last().innerText()))
 responseStatus=409
 await dialog.getByRole('button',{name:'이동 확정',exact:true}).click()
 await dialog.waitFor({state:'hidden'});assert.equal(await page.getByLabel('이동 수량',{exact:true}).inputValue(),'1000')
 assert.equal(await page.locator('[role=alert]').count(),1)
 assert.deepEqual(errors,[])
 console.log('PASS: 5 widths, compact modal/body scroll, product/EA/locations/tracking, cancellation retains draft, cross/same warehouse, no invented floor rack, failure retention, idempotent retry/double-click guard. All API responses mocked; no DB writes. '+origin)
 await context.close()
} finally { await browser.close() }
