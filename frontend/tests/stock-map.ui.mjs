import assert from 'node:assert/strict'
import {chromium} from 'playwright'
let input='';for await(const chunk of process.stdin)input+=chunk
const f=JSON.parse(input),origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',root=`/api/tenants/${f.tenant}/reports/stock-overview`
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],reads=[],writes=[]
let fail=false,snapshot
const mapStyles=new Map()
async function mapStyle(page){return page.locator('.warehouse-dashboard').evaluate(el=>{const title=el.querySelector('.dashboard-warehouse-title .searchable-choice-trigger'),name=title.querySelector('strong'),arrow=title.querySelector('svg path');return {font:getComputedStyle(name).fontSize,weight:getComputedStyle(name).fontWeight,gap:getComputedStyle(title).gap,border:getComputedStyle(title).borderWidth,background:getComputedStyle(title).backgroundColor,path:arrow?.getAttribute('d'),buttons:[...el.querySelectorAll('[aria-label="도면 조작"] button')].map(b=>{const r=b.getBoundingClientRect();return [r.width,r.height]})}})}
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.addInitScript(()=>{window.mapText=[];const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.mapText.push(text);return fill.call(this,text,...args)}})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());assert.equal(u.origin,origin)
  if(!u.pathname.startsWith('/api/'))return route.continue()
  if(u.pathname==='/api/health/db')return route.fulfill({json:{status:'connected',database:'isolated SQLite'}})
  if(req.method()!=='GET'&&u.pathname.includes('/tenants/'))writes.push(u.pathname)
  if(u.pathname.startsWith(root))reads.push(u.pathname+u.search)
  if(fail&&u.pathname===root+'/warehouses/'+f.warehouse)return route.fulfill({status:503,json:{message:'일시 조회 오류'}})
  const response=await context.request.fetch('http://localhost:5086'+u.pathname+u.search,{method:req.method(),headers:req.headers(),data:req.postDataBuffer()||undefined,failOnStatusCode:false})
  if(response.status()>=500)errors.push(`${response.status()} ${u.pathname}`)
  const body=await response.body();if(u.pathname===root+'/warehouses/'+f.warehouse&&response.ok())snapshot=JSON.parse(body)
  await route.fulfill({status:response.status(),headers:response.headers(),body})
 })
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/login');await page.locator('input[name=email]').fill('Employee');await page.locator('input[name=password]').fill(f.password);await page.getByRole('button',{name:'로그인',exact:true}).click();await page.locator('.wms-layout').waitFor()
 await page.goto(origin+'/app/reports/stock');await page.getByRole('button',{name:'리스트 보기',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'리스트 보기',exact:true}).getAttribute('aria-pressed'),'true')
 await page.getByRole('button',{name:'보관 위치별 재고',exact:true}).click();await page.getByRole('button',{name:'2페이지',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.overview-table tbody tr').length===2)
 await page.getByRole('button',{name:'도면 보기',exact:true}).click();await page.getByLabel('창고 2D 도면 캔버스',{exact:true}).waitFor();await page.getByRole('button',{name:'리스트 보기',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.overview-table tbody tr').length===20)
 await page.getByLabel('재고 현황 검색',{exact:true}).fill('구조 QA');await page.getByRole('button',{name:'검색',exact:true}).click();await page.locator('.overview-table tbody tr').filter({hasText:'구조 QA 재고'}).waitFor()
 const cells=page.locator('.overview-table tbody tr').first().locator('.overview-cell-lines');assert.equal(await cells.count(),2);assert.equal(await cells.nth(1).locator('span').count(),1);assert.equal(await cells.nth(1).locator('small').count(),1);
 const line=await page.locator('.overview-table tbody tr').first().innerText();assert.match(line,/42.5/)
 await page.getByRole('button',{name:'도면 보기',exact:true}).click();const canvas=page.getByLabel('창고 2D 도면 캔버스',{exact:true});await canvas.waitFor();assert.equal(await page.getByRole('heading',{name:'재고 현황',exact:true}).count(),1);assert.equal(await page.getByRole('heading',{name:'대시보드',exact:true}).count(),0)
 assert.equal(await page.getByRole('button',{name:/오늘 입고 예정/}).count(),0)
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});if(width<=760&&await page.getByRole('button',{name:'사이드바 접기',exact:true}).isVisible())await page.getByRole('button',{name:'사이드바 접기',exact:true}).click();await page.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click();await page.getByRole('button',{name:'도면 확대',exact:true}).click()
  const titleBox=await page.locator('.inventory-map-title-row .dashboard-warehouse-title').boundingBox(),updatedBox=await page.locator('.inventory-map-title-row .warehouse-dashboard-controls').boundingBox();if(width>=1280)assert(Math.abs(titleBox.y+titleBox.height/2-updatedBox.y-updatedBox.height/2)<2);const style=await mapStyle(page);assert.equal(style.font,width<=540?'22px':'24px');assert.equal(style.weight,'700');assert.equal(style.gap,'10px');assert.equal(style.border,'0px');assert(style.path.includes('C'));assert(style.buttons.every(([w,h])=>w===36&&h===36));mapStyles.set(width,style);
  const box=await canvas.boundingBox(),scale=Number(await canvas.getAttribute('data-view-scale')),ratio=Number(await canvas.getAttribute('data-plan-ratio')),rack=snapshot.plan.objects.find(o=>o.rackId===f.rack)
  await page.mouse.click(box.x+box.width/2+(rack.x-.5)*1200*scale,box.y+box.height/2+(rack.y-.5)*1200/ratio*scale)
  const dialog=page.getByRole('dialog',{name:'주 랙 재고 현황',exact:true});await dialog.getByText('구조 QA 재고',{exact:true}).first().waitFor();assert.equal(await dialog.locator('tbody tr').count(),20);assert.match(await dialog.innerText(),/42.5 EA/);assert.match(await dialog.innerText(),/40.5 EA/);assert.match(await dialog.innerText(),/SN-/)
  await dialog.getByRole('button',{name:'2페이지',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('dialog[open] .dashboard-rack-table > tbody > tr').length===2)
  const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0&&bounds.height<=1000)
  await dialog.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await page.locator('.warehouse-live-detail').count(),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
 }
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click();await page.waitForFunction(()=>window.mapText.some(t=>t.includes('총 63.5개')))
 // Selection search lives inside the dropdown, including internal warehouse codes.
 await page.getByRole('button',{name:/재고 도면 창고/}).click();await page.getByPlaceholder('창고명·시스템 코드·내부 코드 검색').fill('SECOND-CODE');await page.getByRole('option',{name:/보조 창고/}).click();await page.getByRole('heading',{name:'저장된 2D 도면이 없습니다'}).waitFor();assert.equal(await canvas.count(),0);assert.equal(await page.getByRole('button',{name:'창고 도면 보기',exact:true}).count(),0)
 await page.getByRole('button',{name:'리스트 보기',exact:true}).click();assert.equal(await page.getByLabel('재고 현황 검색',{exact:true}).inputValue(),'구조 QA');await page.getByRole('button',{name:/^조회 창고 /}).filter({hasText:'보조 창고'}).waitFor();assert.equal(await page.locator('.overview-table tbody tr').filter({hasText:'구조 QA 재고'}).count(),0);assert.equal(await page.getByRole('button',{name:'보관 위치별 재고',exact:true}).getAttribute('aria-pressed'),'true')
 await page.getByRole('button',{name:'도면 보기',exact:true}).click();await page.getByRole('heading',{name:'저장된 2D 도면이 없습니다'}).waitFor();await page.getByRole('button',{name:/재고 도면 창고/}).click();await page.getByRole('option',{name:/통합 창고/}).click();await canvas.waitFor()
 const lastSuccess=await page.locator('.warehouse-dashboard-updated').innerText();fail=true;await page.waitForTimeout(16000);await page.getByRole('alert').filter({hasText:'마지막 정상 데이터를 표시합니다.'}).waitFor();assert.equal(await canvas.count(),1);assert.equal(await page.locator('.warehouse-dashboard-updated').innerText(),lastSuccess)
 fail=false;await page.getByRole('button',{name:'다시 조회',exact:true}).click();await page.getByRole('alert').waitFor({state:'hidden'})
 const count=reads.length, scaleBefore=await canvas.getAttribute('data-view-scale');await page.waitForTimeout(16000);assert(reads.length>count,'map must auto-refresh');assert.equal(await canvas.getAttribute('data-view-scale'),scaleBefore)
 // Retry after an initial error must not invent an empty rack or a zero quantity.
 await page.getByRole('button',{name:'리스트 보기',exact:true}).click();fail=true;await page.getByRole('button',{name:'도면 보기',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await canvas.count(),0)
 fail=false;await page.getByRole('button',{name:'다시 조회',exact:true}).click();await canvas.waitFor()
 // Compare the actual dashboard surface with inventory's shared title and controls.
 assert.equal(await page.evaluate(async password=>{const csrf=await(await fetch('/api/auth/csrf')).json();return(await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':csrf.token},body:JSON.stringify({email:'Master',password})})).status},f.password),200)
 await page.goto(origin+'/app');await page.getByLabel('창고 2D 도면 캔버스',{exact:true}).waitFor()
 for(const width of [1920,1440,1280,768,390]){await page.setViewportSize({width,height:1000});assert.deepEqual(await mapStyle(page),mapStyles.get(width),'dashboard/inventory controls differ at '+width)}
 await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/app/warehouses');await page.getByRole('button',{name:'창고 등록',exact:true}).click();await page.getByRole('button',{name:/^창고 담당자 /}).waitFor()
 for(const c of await page.locator('select,.searchable-choice-trigger:not(.is-title-trigger)').all()){if(await c.isVisible())assert.deepEqual(await c.evaluate(e=>[e.getBoundingClientRect().height,getComputedStyle(e).borderRadius]),[40,'8px'])}
 await page.goto(origin+'/app/warehouses');await page.locator('.warehouse-directory-open').first().click();await page.getByRole('tab',{name:'구역·랙·보관 위치',exact:true}).click();await page.locator('.structure-filters').waitFor()
 for(const width of [1920,1440,1280,768,390]){await page.setViewportSize({width,height:1000});for(const c of await page.locator('.structure-filters select').all())assert.deepEqual(await c.evaluate(e=>[e.getBoundingClientRect().height,getComputedStyle(e).borderRadius]),[40,'8px'])}
 await page.goto('about:blank');await context.unrouteAll({behavior:'wait'})
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[])
 console.log('PASS: actual app inventory-only permissions, default list/filter retention, real map/rack click, 22 trace rows/page 2, warehouse/internal-code search, readonly/error/refresh, five widths; SQLite ledger unchanged')
}finally{await browser.close()}
