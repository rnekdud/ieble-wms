import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://localhost:5176'
const endpoint='/api/tenants/fixture/stocktakes',id='11111111-1111-1111-1111-111111111111'
const number='20261106053551481-CT-8023-VERY-LONG-STOCKTAKE-NUMBER'
const document={id,number,version:'v1',warehouseId:'w1',warehouseName:'테스트 창고',name:'2026-11-06 상품 실사',basisAt:'2026-11-06',snapshotAt:'2026-11-06',status:'Confirmed',scope:'Selected',scopeLabel:'선택 상품 실사',contactName:'담당자 QA',confirmedAt:'2026-11-06'}
const item={id:'t1',productId:'p1',productName:'사탕',productCode:'PR01',unit:'EA',locationId:'l1',locationCode:'R-01-L01-B01',rackCode:'R-01',baselineQuantity:20,baselineReserved:0,originalQuantity:20,originalReserved:0,countedQuantity:18,originalSnapshotAt:'2026-11-06',baselineAt:'2026-11-06',reason:'실물 확인',excluded:false,isUnregistered:false}
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 const requests=[],errors=[]
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname
  assert.equal(url.origin,origin)
  if(path==='/__stocktake-ui')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/stocktake-ui.tsx"></script></html>'})
  if(!path.startsWith('/api/'))return route.continue()
  assert.equal(req.method(),'GET','UI layout verification must not write')
  requests.push(url)
  let result={}
  if(path===endpoint)result={items:[{document,productCount:1,targetCount:12}],total:41,page:Number(url.searchParams.get('page')||1)}
  else if(path===endpoint+'/'+id)result={document,selectedItems:[item],summary:{total:1,counted:1,missing:0,differences:1,shortages:1,excesses:0,matches:0},conflicts:[],incoming:false,confirmedByName:'담당자 QA'}
  else if(path.endsWith('/items'))result={items:[item],total:1}
  else if(path.endsWith('/choices'))result={items:[{id:'w1',name:'테스트 창고',code:'WH01',unit:null,lotManaged:false,expiryManaged:false,serialManaged:false}],total:1}
  await route.fulfill({json:result})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 const visit=()=>page.goto(origin+'/__stocktake-ui')
 await visit();await page.locator('.stocktake-number-cell').waitFor()
 for(const width of [1920,1440,1280,768,390]) {
  await page.setViewportSize({width,height:1000})
  const boxes=await page.locator('.report-period-dates').evaluate(el=>[...el.children].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}}))
  const [left,sep,right]=boxes
  assert.equal(left.height,40);assert.equal(right.height,40);assert(Math.abs(left.width-right.width)<1)
  for(const b of boxes)assert(Math.abs(b.y+b.height/2-left.y-left.height/2)<1)
  assert(Math.abs(sep.x-left.x-left.width-8)<1);assert(Math.abs(right.x-sep.x-sep.width-8)<1)
  const tabs=await page.locator('.report-period-tabs').boundingBox(),search=await page.getByLabel('실사 검색',{exact:true}).boundingBox()
  assert(Math.abs(tabs.y-left.y-left.height-8)<1);assert(search.y>tabs.y+tabs.height)
  const row=page.locator('.stocktake-simple-list tbody tr').first()
  assert.equal(await row.locator('td').nth(2).innerText(),'1개')
  const code=await row.locator('strong').boundingBox(),meta=await row.locator('small').boundingBox()
  assert(Math.abs(meta.y-code.y-code.height-4)<1);assert.equal(await row.locator('strong').getAttribute('title'),number)
  const gap=await page.locator('.stocktake-list-card').evaluate(el=>el.querySelector('.wms-pagination').getBoundingClientRect().top-el.querySelector('.table-scroll').getBoundingClientRect().bottom)
  assert(gap>=8&&gap<=12,'pagination gap '+gap)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  if(width>=1280) {
   const fields=await Promise.all([page.getByLabel('실사 검색',{exact:true}),page.getByLabel('실사 상태',{exact:true}),page.locator('.stocktake-search-filters .searchable-choice-trigger'),page.getByRole('button',{name:'검색',exact:true}),page.getByRole('button',{name:'초기화',exact:true})].map(e=>e.boundingBox()))
   assert(fields[0].width>=240&&fields[0].width<=280)
   for(let i=1;i<fields.length;i++){assert.equal(fields[i].height,40);assert(Math.abs(fields[i].y-fields[0].y)<1);assert(Math.abs(fields[i].x-fields[i-1].x-fields[i-1].width-8)<1)}
  }
 }
 await page.setViewportSize({width:1440,height:1000})
 await page.getByRole('button',{name:'2페이지',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('[aria-label="2페이지"]')?.getAttribute('aria-current')==='page')
 await page.getByRole('button',{name:'7일',exact:true}).click()
 const dates=page.locator('.report-period-dates input');assert.equal((Date.parse(await dates.nth(1).inputValue())-Date.parse(await dates.nth(0).inputValue()))/86400000,6)
 await page.getByLabel('실사 검색',{exact:true}).fill('검색 검증');await page.getByLabel('실사 상태',{exact:true}).selectOption('Confirmed')
 await page.getByRole('button',{name:/^창고 /}).click();await page.getByRole('combobox',{name:'창고 검색'}).fill('WH01');await page.getByRole('option',{name:/테스트 창고/}).click()
 await page.getByRole('button',{name:'검색',exact:true}).click()
 await page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname===endpoint&&u.searchParams.get('search')==='검색 검증'})
 const query=requests.filter(u=>u.pathname===endpoint).at(-1).searchParams
 assert.equal(query.get('page'),'1');assert.equal(query.get('status'),'Confirmed');assert.equal(query.get('warehouseId'),'w1')
 await page.getByRole('button',{name:'초기화',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'취소',exact:true}).click();assert.equal(await page.getByLabel('실사 검색',{exact:true}).inputValue(),'검색 검증')
 await page.getByRole('button',{name:'초기화',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'초기화',exact:true}).click();assert.equal(await page.getByLabel('실사 검색',{exact:true}).inputValue(),'')
 await page.getByRole('button',{name:'2026-11-06 상품 실사 상세',exact:true}).click();await page.locator('.stocktake-targets tbody td').first().waitFor()
 assert.equal(await page.getByText(number,{exact:true}).count(),1,'detail number appears only in header')
 assert.equal(await page.getByRole('button',{name:'실사 확정',exact:true}).count(),0)
 for(const width of [1920,1440,1280,768,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'detail overflow '+width)}
 await page.getByRole('button',{name:'목록으로 돌아가기',exact:true}).click();await page.getByRole('button',{name:'실사 등록',exact:true}).click();await page.locator('.simple-stocktake-fields').waitFor()
 for(const width of [1920,1440,1280,768,390]) {
  await page.setViewportSize({width,height:1000})
  const fields=await page.locator('.simple-stocktake-fields').evaluate(el=>[...el.querySelectorAll('input,.searchable-choice-trigger')].map(e=>{const r=e.getBoundingClientRect();const label=e.closest('.searchable-choice')?.querySelector('label')||e.parentElement;return{y:r.y,height:r.height,gap:e.closest('.searchable-choice')?r.y-label.getBoundingClientRect().bottom:null}}))
  for(const field of fields){assert.equal(field.height,40);if(field.gap!==null)assert(field.gap>=4&&field.gap<=6)}
  if(width>=1280)assert(fields.slice(0,3).every(f=>Math.abs(f.y-fields[0].y)<1),'basic field baselines')
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'registration overflow '+width)
 }
 document.status='Counting'
 await page.goto(origin+'/__stocktake-ui?path='+encodeURIComponent('/app/inventory/counts/'+id))
 const quantity=page.getByLabel('실제 수량 1',{exact:true});await quantity.waitFor()
 assert.equal(await quantity.getAttribute('step'),'1')
 await quantity.fill('1.5');assert(await quantity.evaluate(el=>el.validity.stepMismatch))
 await page.getByRole('button',{name:'실사 저장',exact:true}).click()
 await quantity.fill('18');assert(await quantity.evaluate(el=>el.validity.valid))
 assert.deepEqual(errors,[])
 console.log('PASS: stocktake list/register/confirmed detail × 5 widths; date alignment, stacked date/tabs/filters, filter widths/gaps, two-line code, product count, pagination/search/reset, read-only detail, aligned registration fields. GET-only isolated fixtures at '+origin)
 await context.close()
} finally {await browser.close()}
