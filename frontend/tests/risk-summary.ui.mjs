import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',root='/api/tenants/fixture/dashboard/warehouses'
const warehouse={id:'w1',code:'W1',name:'테스트 창고'},rack={id:'r1',code:'R-01',name:'R-01',products:13}
const product={productId:'p1',productCode:'P1',productName:'부족 상품',unit:'EA',status:'danger',currentQuantity:12,reservedQuantity:0,expectedQuantity:12,safetyStock:30,shortageQuantity:18,rackQuantity:12,rackReservedQuantity:0,inventoryStatus:'danger',inventoryReasons:['상품 전체 현재 재고가 안전재고 미만'],reasons:['상품 전체 현재 재고가 안전재고 미만'],reservations:[],moreReservationDates:0}
const rows=[{productId:'p1',productCode:'P1',productName:'부족 상품',locationId:'l1',locationCode:'L1',unit:'EA',quantity:12,reservedQuantity:0,availableQuantity:12,safetyStock:30,safetyComparable:true,expiryDate:null},{productId:'p2',productCode:'P2',productName:'유통기한 상품',locationId:'l2',locationCode:'L2',unit:'EA',quantity:10,reservedQuantity:0,availableQuantity:10,safetyStock:0,safetyComparable:true,expiryDate:'2026-11-17',hasExpiring:true},{productId:'p2',productCode:'P2',productName:'유통기한 상품',locationId:'l3',locationCode:'L3',unit:'EA',quantity:90,reservedQuantity:0,availableQuantity:90,safetyStock:0,safetyComparable:true,expiryDate:'2028-10-10',hasExpiring:false}]
const expiry={...product,productId:'p2',productName:'유통기한 상품',safetyStock:0,shortageQuantity:0,status:'warning',inventoryStatus:'safe',inventoryReasons:[],reasons:['유통기한 6일 남음'],earliestExpiry:'2026-11-17'}
let totals=[8,4]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[]
 await context.route('**/*',route=>{
 const url=new URL(route.request().url()),q=url.searchParams
 url.pathname=url.pathname.replace('/reports/stock-overview/warehouses','/dashboard/warehouses')
 if(url.pathname==='/__risk-summary')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/risk-summary-ui.tsx"></script></html>'})
 if(!url.pathname.startsWith('/api/'))return route.continue()
 assert.equal(route.request().method(),'GET')
 if(url.pathname===root)return route.fulfill({json:{warehouses:[warehouse]}})
 if(url.pathname.includes('/reports/stock-overview'))return route.fulfill({json:{items:[],total:0,summary:{},page:1,pageSize:20}})
 assert.equal(url.pathname,root+'/w1')
 return route.fulfill({json:{asOf:new Date().toISOString(),warehouse,racks:[rack],rackTotals:[],plan:{exists:true,aspectRatio:1.6,objects:[{id:'shape',type:'rack',rackId:'r1',label:'R-01',x:.3,y:.5,width:.18,height:.2,rotation:0,fill:'#fff'}]},risk:{today:'2026-11-11',counts:{safe:0,warning:0,danger:1,review:0,empty:0},lowProducts:8,expiryProducts:4,todayReceipts:0,todayShipments:0,racks:[{id:'r1',status:totals[0]?'danger':totals[1]?'warning':'safe',issueCount:totals[0]+totals[1],preview:[],hoverGroups:['danger','warning'].map((status,i)=>({status,total:totals[i],products:Array.from({length:Math.min(3,totals[i])},(_,n)=>({productId:status+n,productName:(i?'주의 상품 ':'위험 상품 ')+n}))}))}],detail:q.has('rackId')?{rackId:'r1',stockProducts:[product,expiry]}:null},detail:q.has('rackId')?{front:{rack,locations:[]},stock:{items:rows,total:3,page:1,pageSize:20,locationId:null}}:null}})
 })
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 for(const mode of ['dashboard','inventory']) {
 await page.goto(origin+'/__risk-summary?'+mode)
 if(mode==='inventory')await page.getByRole('button',{name:'도면 보기',exact:true}).click()
 const canvas=page.getByLabel('창고 2D 도면 캔버스',{exact:true});await canvas.waitFor().catch(async e=>{console.log(await page.locator("body").innerText(),errors);throw e});await canvas.scrollIntoViewIfNeeded();await page.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click();await page.waitForTimeout(150)
 const point=async()=>{const b=await canvas.boundingBox(),scale=Number(await canvas.getAttribute('data-view-scale'));return{x:b.x+b.width/2-.2*1200*scale,y:b.y+b.height/2}}
 let p=await point();await page.mouse.move(p.x,p.y)
 const tip=page.getByRole('tooltip');await tip.waitFor();assert.match(await tip.innerText(),/위험 8종/);assert.match(await tip.innerText(),/주의 4종/);assert.match(await tip.innerText(),/외 5종/);assert.match(await tip.innerText(),/외 1종/);assert.equal(await tip.locator('li').count(),6);assert.doesNotMatch(await tip.innerText(),/안전재고|유통기한|출고/)
 const bounds=await tip.boundingBox();assert(bounds.x>=8&&bounds.y>=8&&bounds.x+bounds.width<=1440-8&&bounds.y+bounds.height<=1000-8);assert(await tip.evaluate(e=>e.scrollHeight<=e.clientHeight))
 await page.mouse.click(p.x,p.y);const dialog=page.getByRole('dialog');await dialog.waitFor();const trs=dialog.locator('tbody tr');await trs.nth(2).waitFor()
 assert.match(await trs.nth(0).innerText(),/안전재고 30개 \/ 현재고 12개 · 18개 부족/)
 assert.match(await trs.nth(1).innerText(),/유통기한 2026-11-17 · 6일 남음/)
 assert.equal(await trs.nth(2).locator('.risk-reason-lines:visible').count(),0);assert.equal(await trs.nth(2).locator('.risk-cell > .risk-tag').innerText(),'안전')
 await trs.nth(0).locator('summary').click();assert.match(await trs.nth(0).locator('article').innerText(),/18개 부족/)
 await dialog.getByRole('button',{name:'닫기',exact:true}).click()
 for(const name of ['도면 확대','도면 축소','도면 화면 맞춤'])await page.getByRole('button',{name,exact:true}).click()
 console.log('PASS',mode,'actual canvas hover/click, grouped totals, inline reasons, LOT isolation and controls')
 }
 for(const count of [0,1]){totals=[count,0];await page.goto(origin+'/__risk-summary?dashboard');const canvas=page.getByLabel('창고 2D 도면 캔버스',{exact:true});await canvas.waitFor().catch(async e=>{console.log(await page.locator("body").innerText(),errors);throw e});await canvas.scrollIntoViewIfNeeded();await page.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click();await page.waitForTimeout(150);const b=await canvas.boundingBox(),scale=Number(await canvas.getAttribute('data-view-scale'));await page.mouse.move(b.x+b.width/2-.2*1200*scale,b.y+b.height/2);const tip=page.getByRole('tooltip');await tip.waitFor();assert.match(await tip.innerText(),count?/위험 1종/:/위험·주의 상품 없음/)}
 assert.deepEqual(errors,[])
}finally{await browser.close()}
