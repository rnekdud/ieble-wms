import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {workspacePages} from '../src/components/workspace/navigation.ts'
const fullApp=process.env.WMS_FULL_APP==='1'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',root='/api/tenants/fixture/dashboard/warehouses'
const warehouses=[{id:'w1',code:'WH-0003',name:'테스트 창고',customCode:'TEST-3'},{id:'w2',code:'WH-0004',name:'다른 창고',customCode:'OTHER-4'}]
const rack={id:'r1',code:'R-01',name:'RACK-A01',products:2}
const stockRows=Array.from({length:21},(_,i)=>({productId:i===20?'p2':'p1',productCode:i===20?'P2':'P1',productName:i===20?'위험 상품':'안전 상품',rackId:'r1',warehouseId:'w1',locationId:'loc'+i,locationCode:'A-'+i,locationName:'1단 '+(i+1)+'칸',unit:i===20?'kg':'EA',quantity:i===0?100:i===20?15:1,reservedQuantity:i===0?20:i===20?10:0,availableQuantity:i===0?80:i===20?5:1,safetyStock:20,safetyComparable:true,lotNumber:'LOT-'+i,expiryDate:null,serialNumber:null}))
const products=[{productId:'p1',productCode:'P1',productName:'안전 상품',unit:'EA',status:'safe',currentQuantity:119,reservedQuantity:20,expectedQuantity:99,safetyStock:20,shortageQuantity:0,rackQuantity:119,rackReservedQuantity:20,inventoryStatus:'safe',inventoryReasons:[],reasons:[],reservations:[]},{productId:'p2',productCode:'P2',productName:'위험 상품',unit:'kg',status:'danger',currentQuantity:15,reservedQuantity:10,expectedQuantity:5,safetyStock:20,shortageQuantity:15,rackQuantity:15,rackReservedQuantity:10,inventoryStatus:'danger',inventoryReasons:['출고 예약 반영 후 상품 전체 안전재고 미달 예상'],reasons:['출고 예약 반영 후 상품 전체 안전재고 미달 예상'],reservations:[]}]
const warehouseReads=[]
let reads=0,fail=false,late=false,receiptCount=3
const errors=[],browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.addInitScript(()=>{window.rackTexts=[];window.rackTextSizes=[];const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.rackTexts.push(text);if(text.includes(" · "))window.rackTextSizes.push(parseFloat(this.font)*this.getTransform().a);return fill.call(this,text,...args)}})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,q=url.searchParams
  assert.equal(url.origin,origin)
  if(path==='/__dashboard-ui')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/dashboard-ui.tsx"></script></html>'})
  if(!path.startsWith('/api/'))return route.continue()
  assert.equal(req.method(),'GET','dashboard must not mutate business data')
  if(path==='/api/auth/me')return route.fulfill({json:{user:{id:'qa',displayName:'QA 사용자',userName:'qa',email:'qa@example.test',systemRole:'User',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'}})
  if(path==='/api/health/db')return route.fulfill({json:{status:'connected'}})
  if(path==='/api/tenants/fixture/workspace')return route.fulfill({json:{id:'fixture',name:'QA 기업',role:'Master',permissions:Object.fromEntries(workspacePages.map(p=>[p.key,['menu','read','readAll']])),serviceStatus:'Active',billingStatus:'Active',billingAccess:{state:'Active',canAccessWms:true,hasRegisteredCard:true},billingPolicy:{monthlyPerUserKrw:0,monthlyBaseKrw:0,includedUsers:1},canManageBilling:false}})
  if(path.startsWith('/api/tenants/fixture/pages/'))return route.fulfill({json:{}})
  if(path===root)return route.fulfill({json:{warehouses,asOf:new Date().toISOString()}})
  if(path==='/api/tenants/fixture/warehouses'){const term=q.get('search')||'';const items=warehouses.filter(w=>[w.name,w.code,w.customCode].join(' ').includes(term));return route.fulfill({json:{items:items.map(warehouse=>({warehouse})),total:items.length,pageSize:20}})}
  if(path.includes('/scheduled-'))return route.fulfill({json:{today:'2026-11-06',documents:[],total:0,page:1,pageSize:10}})
  const w=warehouses.find(w=>path===root+'/'+w.id);assert.ok(w,path);reads++;warehouseReads.push(w.id)
  if(fail)return route.fulfill({status:503,json:{message:'일시 오류'}})
  if(late&&w.id==='w1')await new Promise(r=>setTimeout(r,500))
  const selected=q.get('rackId'),page=Number(q.get('page')||1)
  return route.fulfill({json:{asOf:new Date().toISOString(),warehouse:w,racks:[rack],rackTotals:[{rackId:'r1',unit:'EA',quantity:119},{rackId:'r1',unit:'kg',quantity:15}],plan:{exists:true,aspectRatio:1.6,objects:[{id:'shape1',type:'rack',rackId:'r1',label:'RACK-A01',x:.3,y:.5,width:.18,height:.2,rotation:0,fill:'#fff'}]},risk:{lowProducts:1,expiryProducts:1,expirySoonDays:30,alerts:q.get('riskKind')?{page:1,pageSize:20,total:1,items:[{stock:{...stockRows[20],expiryDate:'2026-11-05',warehouseName:w.name,rackCode:'R-01'},risk:products[1],remainingDays:-1,expiryStatus:'danger'}]}:null,today:'2026-11-06',todayReceipts:receiptCount,todayShipments:5,counts:{safe:0,warning:0,danger:1,review:0,empty:0},racks:[{id:'r1',status:'danger',needsReview:false,issueCount:1,preview:[products[1]]}],detail:selected?{rackId:selected,stockProducts:products,items:[products[1]],total:1,page:1,pageSize:20,expiry:{items:[],total:0,page:1,pageSize:20}}:null},detail:selected?{front:{rack,locations:[]},locations:[],stock:{items:stockRows.slice((page-1)*20,page*20),total:21,page,pageSize:20,locationId:null}}:null}})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/__dashboard-ui');await page.getByRole('combobox',{name:'창고 도면 보기',exact:true}).selectOption('2d')
  const canvas=page.getByLabel('창고 2D 도면 캔버스',{exact:true});await canvas.waitFor();await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(100)
  const scale=await canvas.getAttribute('data-view-scale'),box=await canvas.boundingBox();await page.mouse.click(box.x+box.width/2+(0.3-.5)*1200*Number(scale),box.y+box.height/2)
  const dialog=page.getByRole('dialog',{name:'RACK-A01 재고 현황',exact:true});await dialog.waitFor();await dialog.getByText('안전 상품',{exact:true}).first().waitFor()
  assert.equal(await dialog.locator('details,summary,.risk-product').count(),0);assert.equal(await dialog.locator('tbody tr').count(),20)
  assert.match(await dialog.locator('tbody tr').first().innerText(),/A-0.*LOT-0.*100 EA.*20 EA.*80 EA/s)
  await dialog.getByRole('button',{name:'2페이지',exact:true}).click();await dialog.getByText('위험 상품',{exact:true}).first().waitFor();assert.equal(await dialog.locator('details,summary,.risk-product').count(),0)
  assert.match(await dialog.locator('tbody tr').innerText(),/A-20.*15 kg.*10 kg.*5 kg.*20 kg/s);assert(await dialog.locator('.risk-reason-lines').count()>0)
  assert.equal(await page.locator('.risk-rack-index > summary').count(),1)
  assert.equal(await page.locator('.risk-rack-index').getByRole('button',{name:'R-01 · 위험',exact:true,includeHidden:true}).getAttribute('aria-pressed'),'true')
  await dialog.getByRole('button',{name:'닫기',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await canvas.getAttribute('data-view-scale'),scale)
  const index=page.locator('.risk-rack-index');await index.locator('summary').click();assert.equal(await index.getByRole('button',{name:'R-01 · 위험',exact:true}).count(),1)
  console.log('PASS '+width+'x'+height+': 2D rack click, selection retained, no detail accordion, location/LOT/stock/status retained, pagination and rack index preserved')
 }
 assert.deepEqual(errors,[])
}finally{await browser.close()}
