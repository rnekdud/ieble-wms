import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176'
const baselineOrigin=origin
const writes=[];let failSave=false
const id='12345678-1234-1234-1234-123456789012'
const errors=[],unknown=new Set(),now='2026-11-09T05:00:00Z',empty={items:[],total:0,page:1,pageSize:20}
const employee={userId:'employee',name:'QA 구성원',loginId:'employee001',email:'qa@example.test',role:'Employee',isActive:true,membershipIsActive:true,accountIsActive:true,accountType:'Internal',departmentId:null,positionId:null,permissionGradeId:'Employee',version:'1',registeredAt:now,billingStartsAt:now,billingStartMonth:'2026-11',mustChangePassword:false}
const partner={id:'partner',name:'QA 거래처',code:'PT01',type:'BOTH',isActive:true,version:'1',countryCode:'KR'}
const inquiry={id:'ticket',number:'QA01',title:'QA 문의',category:'Service',status:'Received',createdAt:now,author:'QA 구성원',company:'헤더 QA 기업',version:'1',message:'필수 업무 확인',answer:null,attachments:[],history:[]}
const permissions=Object.fromEntries(workspacePages.map(p=>[p.key,['menu','read','readAll','create','update','delete','confirm','count','manageUsers']]))
const workspace={id:'header-qa',name:'헤더 QA 기업',role:'Master',permissions,serviceStatus:'Active',billingStatus:'Active',billingAccess:{state:'Active',canAccessWms:true,hasRegisteredCard:true,freeUntil:'2027-01-01',firstChargeAt:'2027-01-01'},billingPolicy:{monthlyPerUserKrw:0,monthlyBaseKrw:0,includedUsers:1},canManageBilling:false,latestChange:null}
let receiptStatus='Planned', inspectedAt=null
const admin=false
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',route=>{
  const r=route.request(),u=new URL(r.url()),p=u.pathname.replace('/api/tenants/header-qa','')
  assert([origin,baselineOrigin].includes(u.origin))
  if(u.pathname==='/__readonly-input')return route.fulfill({contentType:'text/html',body:'<html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/readonly-input-ui.tsx"></script></html>'})
  if(!u.pathname.startsWith('/api/'))return route.continue()
  if(p==='/products/delete-check')return route.fulfill({json:{canDelete:false,items:[{id,code:'PR01',name:'QA 상품',canDelete:false,reasons:['QA 이력 존재']}]}})
  if(p==='/support'&&r.method()==='POST'){writes.push(r.postData()||'');return failSave?route.fulfill({status:500,json:{message:'QA 저장 오류'}}):route.fulfill({json:{id:'ticket'}})}
  assert.equal(r.method(),'GET','Unexpected fixture write '+p)
  const json=data=>route.fulfill({json:data})
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'헤더 QA',userName:'qa',email:'qa@example.test',systemRole:admin?'IebleAdministrator':'User',mustChangePassword:false},memberships:[{tenantId:workspace.id,name:workspace.name,role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:workspace.id})
  if(p==='/api/auth/csrf')return json({token:'fixture'})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p==='/workspace')return json(workspace)
  if(p.startsWith('/pages/'))return json({})
  if(p==='/dashboard/warehouses')return json({warehouses:[],asOf:now})
  if(p.endsWith('/choices'))return json({...empty,warehouses:[],partners:[],products:[],locations:[]})
  if(p.endsWith('/inspection-history'))return json(empty)
  if(p==='/inventory/history')return json({...empty,total:1,items:[{id:'op1',number:'OP01',type:'Move',productName:'QA 상품',unit:'EA',quantity:1,occurredAt:now}]})
  if(p==='/inventory/history/op1')return json({operation:{id:'op1',number:'OP01',type:'Move',productName:'QA 상품',unit:'EA',quantity:1,beforeSource:2,afterSource:1,beforeDestination:0,afterDestination:1,occurredAt:now,createdAt:now},movements:[]})
  if(p==='/inventory')return json(empty)
  if(p==='/warehouses/w1')return json({warehouse:{id:'w1',code:'WH01',name:'헤더 QA 창고',isActive:true,version:'1'},zones:[],racks:[],locationCount:0})
  if(p==='/warehouses/w1/workspace')return json({detail:{warehouse:{id:'w1',code:'WH01',name:'헤더 QA 창고',isActive:true,version:'1'},zones:[],racks:[],locationCount:0},floorLocations:[],plan:{exists:false,objects:[],aspectRatio:1.6}})
  if(p==='/products/'+id)return json({product:{id,code:'PR01',name:'헤더 QA 상품',unit:'EA',isActive:true,version:'1',images:[],barcodes:[],lotManaged:false,serialManaged:false,expiryManaged:false},categoryName:null})
  if(p==='/receipts/'+id)return json({receipt:{id,number:'IN01',warehouseId:'w1',warehouseName:'QA 창고',partnerId:'p1',partnerName:'QA 거래처',expectedDate:'2026-11-09',status:receiptStatus,inspectedAt,version:'1',createdAt:now},lines:[]})
  if(p==='/shipments/'+id)return json({shipment:{id,number:'PK01',warehouseId:'w1',warehouseName:'QA 창고',partnerId:'p1',partnerName:'QA 거래처',requestDate:'2026-11-09',expectedDate:'2026-11-09',status:'Picking',version:'1',createdAt:now},lines:[],allocations:[],movements:[]})
  if(p==='/stocktakes/'+id)return json({document:{id,number:'ST01',scope:'Selected',status:'Confirmed',warehouseId:'w1',warehouseName:'QA 창고',version:'1',createdAt:now},summary:{total:0,counted:0,missing:0,differences:0,shortages:0,excesses:0,matches:0},conflicts:[],incoming:false,selectedItems:[]})
  if(p.startsWith('/stocktakes/'+id+'/'))return json(empty)
  if(p==='/products/options')return json({categories:[],productTypes:[],units:['EA']})
  if(p==='/users/organization-options'||p==='/organization-items')return json({departments:[],positions:[]})
  if(p.endsWith('/permission-grades'))return json([{id:'Employee',name:'일반 직원',isActive:true,isBuiltIn:true,memberCount:0,version:'1'}])
  if(p==='/permissions')return json({roles:{Administrator:{},Employee:{}},defaults:{Administrator:{},Employee:{}},features:[],version:'1'})
  if(p==='/organization-chart')return json({departments:[],positions:[],employees:[],users:[],unassigned:[],companyName:workspace.name,totalEmployees:0})
  if(p==='/users')return json({...empty,items:[employee],total:1,monthlyPerUserKrw:0})
  if(p==='/partners')return json({...empty,items:[partner],total:1})
  if(p==='/partners/partner')return json(partner)
  if(p==='/support')return json({...empty,items:[inquiry],total:1})
  if(p==='/support/ticket')return json(inquiry)
  if(p==='/company')return json({company:{id:workspace.id,name:workspace.name,version:'1'},history:[]})
  if(p==='/reports/stock-history')return json({...empty,summary:{rows:0,receiptRows:0,shipmentRows:0,operationRows:0,stocktakeRows:0,workCount:0},start:'2026-11-01',end:'2026-11-09',today:'2026-11-09'})
  if(p==='/reports/stock-overview')return json({...empty,summary:{registeredProducts:0,matchingProducts:0,holdingProducts:0,lowProducts:0,reservedProducts:0},asOf:now,today:'2026-11-09'})
  if(p==='/reports/movement-stats')return json({...empty,summary:{receipts:0,shipments:0,receiptProducts:0,shipmentProducts:0},trend:[],start:'2026-11-01',end:'2026-11-09',today:'2026-11-09'})
  if(['/warehouses','/products','/receipts','/shipments','/partners','/stocktakes','/users','/support','/reports/stock-history','/inventory/movements','/inventory/adjustments'].includes(p))return json({...empty,monthlyPerUserKrw:0})
  if(p==='/api/admin/tenants'||p==='/api/admin/support')return json(empty)
  if(p==='/api/admin/overview')return json({tenantCount:0,activeTenantCount:0,activeUserCount:0,newTenantCount:0,inquiryCount:0,pendingInquiryCount:0})
  unknown.add(p);return json(empty)
 })
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
 async function locked(input){
  await input.waitFor();const value=await input.inputValue();assert(value)
  assert.equal(await input.getAttribute('readonly'),'');assert.equal(await input.isDisabled(),true)
  await input.scrollIntoViewIfNeeded();const box=await input.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
  assert.equal(await input.evaluate(e=>document.activeElement===e),false)
  await input.evaluate(e=>e.focus());assert.equal(await input.evaluate(e=>document.activeElement===e),false)
  await page.keyboard.press('Tab');assert.equal(await input.evaluate(e=>document.activeElement===e),false)
  assert.equal(await input.inputValue(),value)
  const style=await input.evaluate(e=>({bg:getComputedStyle(e).backgroundColor,h:e.getBoundingClientRect().height,cursor:getComputedStyle(e).cursor}))
  assert.equal(style.bg,'rgb(241, 245, 249)');assert.equal(style.h,40);assert.equal(style.cursor,'default')
 }
 for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/app/warehouses?warehouseId=w1&tab=info')
  await locked(page.getByRole('textbox',{name:'시스템 창고 코드',exact:true}))
  const regular=page.locator('.warehouse-inline-basics input:not([readonly]):not([type=checkbox])').first()
  assert.equal(await regular.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  await page.goto(origin+'/app/settings/users');await page.getByRole('button',{name:'QA 구성원 수정',exact:true}).click()
  await locked(page.getByRole('textbox',{name:'로그인 아이디',exact:true}));await locked(page.getByRole('textbox',{name:'이메일',exact:true}))
  await page.keyboard.press('Escape')
  await page.goto(origin+'/app/products/'+id);const code=page.getByRole('textbox',{name:'상품코드',exact:true});await code.fill('PR10');assert.equal(await code.inputValue(),'PR10');assert.equal(await code.evaluate(e=>e.readOnly),false)
  await page.goto(origin+'/app/partners');await page.getByRole('button',{name:'QA 거래처 상세',exact:true}).filter({visible:true}).click();await page.getByRole('button',{name:'거래처 수정',exact:true}).click()
  const partnerCode=page.getByRole('textbox',{name:'거래처코드',exact:true});await partnerCode.fill('BP10');assert.equal(await partnerCode.inputValue(),'BP10')
  console.log(`PASS ${width}x${height}: readonly styling, immutable values, no click/Tab/programmatic focus, editable product/partner codes`)
 }
 await page.goto(origin+'/__readonly-input');await page.getByRole('textbox',{name:'소속 업체명',exact:true}).waitFor()
 const values=()=>page.locator('form').evaluate(e=>[...new FormData(e).entries()])
 assert.deepEqual(await values(),[['before','앞'],['companyName','기존 업체'],['after','뒤'],['external','연결값']])
 await page.getByRole('textbox',{name:'앞 필드',exact:true}).focus();await page.keyboard.press('Tab');assert(await page.getByRole('textbox',{name:'뒤 필드',exact:true}).evaluate(e=>document.activeElement===e))
 await page.getByRole('button',{name:'조회 결과 반영',exact:true}).click();assert.equal((await values()).find(([k])=>k==='companyName')[1],'조회된 업체')
 await page.getByRole('button',{name:'수정 허용 전환',exact:true}).click();const company=page.getByRole('textbox',{name:'소속 업체명',exact:true});assert(await company.isEditable());await company.fill('새 업체');assert.equal((await values()).filter(([k])=>k==='companyName').length,1);assert.equal((await values()).find(([k])=>k==='companyName')[1],'새 업체')
 await page.getByRole('button',{name:'수정 허용 전환',exact:true}).click();assert(await company.isDisabled());assert.equal((await values()).find(([k])=>k==='companyName')[1],'새 업체')
 await page.getByRole('button',{name:'처리 중 전환',exact:true}).click();assert.deepEqual(await values(),[['external','연결값']]);await page.getByRole('button',{name:'처리 중 전환',exact:true}).click();assert.equal((await values()).length,4)
 console.log('PASS named fixed values submitted once, external form association, live lookup updates, editable/locked transitions and disabled fieldset exclusion')
 assert.deepEqual(errors,[]);assert.equal(writes.length,0)
}finally{await browser.close()}
