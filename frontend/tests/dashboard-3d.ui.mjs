import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {OrthographicCamera,Vector3} from 'three'
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
  if(path==='/api/tenants/fixture/warehouses/w1'||path==='/api/tenants/fixture/warehouses/w2')return route.fulfill({json:{warehouse:warehouses[0],zones:[],racks:[{...rack,levels:3,bays:4,isActive:true},{...rack,id:'r2',name:'RACK-A02',code:'R-02',levels:2,bays:3,isActive:true}],locationCount:12}})
  const w=warehouses.find(w=>path===root+'/'+w.id);assert.ok(w,path);reads++;warehouseReads.push(w.id)
  if(fail)return route.fulfill({status:503,json:{message:'일시 오류'}})
  if(late&&w.id==='w1')await new Promise(r=>setTimeout(r,500))
  const selected=q.get('rackId'),page=Number(q.get('page')||1)
  return route.fulfill({json:{asOf:new Date().toISOString(),warehouse:w,racks:[rack,{...rack,id:'r2',code:'R-02',name:'RACK-A02'}],rackTotals:[{rackId:'r2',unit:'EA',quantity:205},{rackId:'r1',unit:'EA',quantity:119},{rackId:'r1',unit:'kg',quantity:15}],plan:{exists:true,aspectRatio:1.6,objects:[{id:'shape1',type:'rack',rackId:'r1',label:'RACK-A01',x:.3,y:.5,width:.18,height:.2,rotation:0,fill:'#fff'},{id:'shape2',type:'rack',rackId:'r2',label:'RACK-A02',x:.7,y:.6,width:.18,height:.2,rotation:90,fill:'#fff'}]},risk:{lowProducts:1,expiryProducts:1,expirySoonDays:30,alerts:q.get('riskKind')?{page:1,pageSize:20,total:1,items:[{stock:{...stockRows[20],expiryDate:'2026-11-05',warehouseName:w.name,rackCode:'R-01'},risk:products[1],remainingDays:-1,expiryStatus:'danger'}]}:null,today:'2026-11-06',todayReceipts:receiptCount,todayShipments:5,counts:{safe:0,warning:1,danger:1,review:0,empty:0},racks:[{id:'r2',status:'warning',needsReview:false,issueCount:1,preview:[]},{id:'r1',status:'danger',needsReview:false,issueCount:1,preview:[products[1]]}],detail:selected?{rackId:selected,stockProducts:products,items:[products[1]],total:1,page:1,pageSize:20,expiry:{items:[],total:0,page:1,pageSize:20}}:null},detail:selected?{front:{rack:{...rack,id:selected,name:selected==='r2'?'RACK-A02':rack.name},locations:[]},locations:[],stock:{items:stockRows.slice((page-1)*20,page*20),total:21,page,pageSize:20,locationId:null}}:null}})
 })
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
 const ready=()=>page.locator('.warehouse-scene[data-ready=true]').waitFor()
 const view=()=>page.getByRole('combobox',{name:'창고 도면 보기',exact:true})
 for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});await page.goto(origin+(fullApp?'/app':'/__dashboard-ui?user=qa-'+width));await ready()
  assert.equal(await view().inputValue(),'3d');assert.equal(await page.locator('.dashboard-map-view').count(),0);const triggerStyle=await view().evaluate(e=>({border:getComputedStyle(e).borderWidth,background:getComputedStyle(e).backgroundColor,h:e.getBoundingClientRect().height}));assert.equal(triggerStyle.border,'0px');assert.equal(triggerStyle.background,'rgba(0, 0, 0, 0)');assert(triggerStyle.h>=44)
  assert.equal(await page.locator('.warehouse-rack-bubble').count(),2);const bubble=page.locator('.warehouse-rack-bubble[data-rack-id=r1]');await bubble.waitFor();assert.match(await bubble.innerText(),/119 EA.*15 kg/)
  assert.equal(await page.locator('.warehouse-scene').getAttribute('data-racks'),'2')
  const geometry=await bubble.evaluate(e=>{const r=e.getBoundingClientRect(),host=e.closest('.warehouse-scene').getBoundingClientRect();return {w:r.width,h:r.height,inside:r.left>=host.left&&r.right<=host.right&&r.top>=host.top&&r.bottom<=host.bottom,overflow:document.documentElement.scrollWidth>innerWidth}})
  assert(geometry.inside,JSON.stringify(geometry));assert(geometry.h>=44);assert(!geometry.overflow)
  const beforeCamera=await page.locator('.warehouse-scene').getAttribute('data-camera');await page.getByRole('button',{name:'3D 도면 확대',exact:true}).click();await page.waitForFunction(before=>document.querySelector('.warehouse-scene')?.dataset.camera!==before,beforeCamera);const camera=await page.locator('.warehouse-scene').getAttribute('data-camera')
  const checkbox=page.getByRole('checkbox',{name:'총 수량 말풍선 숨기기',exact:true});await checkbox.check();assert.equal(await page.locator('.warehouse-rack-bubble').count(),0);assert.equal(await page.locator('.warehouse-scene-bubbles').count(),0);assert(await page.evaluate(()=>window.rackTexts.includes('R-01 · 위험')&&window.rackTexts.includes('R-02 · 주의')));assert.equal(await page.locator('.warehouse-scene').getAttribute('data-camera'),camera)
  await checkbox.uncheck();await bubble.waitFor();assert.match(await bubble.innerText(),/RACK-A01\s*위험/);await bubble.click();await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByText('안전 상품',{exact:true}).first().waitFor();assert.equal(await page.getByRole('dialog').locator('details,summary,.risk-product').count(),0);assert.match(await page.getByRole('dialog').locator('tbody tr').first().innerText(),/A-0.*100 EA.*20 EA.*80 EA/s);assert(warehouseReads.length>0);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'})
  assert.equal(await page.locator('.warehouse-scene').getAttribute('data-camera'),camera,'detail GET must preserve camera')
  await view().selectOption('2d');await page.getByLabel('창고 2D 도면 캔버스',{exact:true}).waitFor();await page.reload();await page.getByLabel('창고 2D 도면 캔버스',{exact:true}).waitFor();assert.equal(await view().inputValue(),'2d')
  await view().selectOption('3d');await ready();await checkbox.check();await page.reload();await ready();assert.equal(await checkbox.isChecked(),true);assert.equal(await page.locator('.warehouse-rack-bubble').count(),0);await checkbox.uncheck()
  console.log('PASS '+width+'x'+height+': title menu, default 3D, unit-safe quantities, rack-code risk labels, complete bubble hiding, exact rack detail, stable camera, persisted 2D/3D; no horizontal overflow')
 }
 await page.goto(origin+(fullApp?'/app':'/__dashboard-ui?user=new-user'));await ready();const second=page.locator('.warehouse-rack-bubble[data-rack-id=r2]');assert.match(await second.innerText(),/총 205개/);await second.click();await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/RACK-A02/);await page.keyboard.press('Escape');assert.equal(await view().inputValue(),'3d')
 await page.getByRole('checkbox',{name:'총 수량 말풍선 숨기기',exact:true}).check()
 await page.getByRole('button',{name:'3D 도면 화면 맞춤',exact:true}).click()
 const canvas=page.getByLabel('창고 3D 도면 캔버스',{exact:true});await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(100)
 const scene=page.locator('.warehouse-scene'),box=await canvas.boundingBox(),before=JSON.parse(await scene.getAttribute('data-camera')),point=new Vector3(-10,-.02,5)
 const projection=state=>{const camera=new OrthographicCamera(-18*box.width/box.height,18*box.width/box.height,18,-18,.01,3000);camera.position.fromArray(state.position);camera.lookAt(new Vector3().fromArray(state.target));camera.zoom=state.zoom;camera.updateProjectionMatrix();camera.updateMatrixWorld();return point.clone().project(camera)}
 const p=projection(before);await page.mouse.click(box.x+(p.x+1)*box.width/2,box.y+(1-p.y)*box.height/2)
 await page.waitForFunction(before=>{const el=document.querySelector('.warehouse-scene');return el.dataset.panning==='false'&&el.dataset.camera!==before},JSON.stringify(before))
 const after=JSON.parse(await scene.getAttribute('data-camera')),centred=projection(after)
 assert(Math.abs(centred.x)*box.width/2<1&&Math.abs(centred.y)*box.height/2<1)
 assert.equal(after.zoom,before.zoom);assert(Math.abs(after.position[1]-before.position[1])<1e-8)
 console.log('PASS '+(fullApp?'full application':'dashboard fixture')+': floor click centres within 1px, camera height/zoom unchanged, mocked read-only APIs')
 assert.deepEqual(errors,[])
 console.log('PASS user isolation; only mocked GET requests')
}finally{await browser.close()}
