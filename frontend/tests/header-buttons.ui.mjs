import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176'
const id='12345678-1234-1234-1234-123456789012'
const errors=[],unknown=new Set(),now='2026-11-09T05:00:00Z',empty={items:[],total:0,page:1,pageSize:20}
const employee={userId:'employee',name:'QA 구성원',loginId:'employee001',email:'qa@example.test',role:'Employee',isActive:true,membershipIsActive:true,accountIsActive:true,accountType:'Internal',departmentId:null,positionId:null,permissionGradeId:'Employee',version:'1',registeredAt:now,billingStartsAt:now,billingStartMonth:'2026-11',mustChangePassword:false}
const partner={id:'partner',name:'QA 거래처',code:'PT01',type:'BOTH',isActive:true,version:'1',countryCode:'KR'}
const inquiry={id:'ticket',number:'QA01',title:'QA 문의',category:'Service',status:'Received',createdAt:now,author:'QA 구성원',company:'헤더 QA 기업',version:'1',message:'필수 업무 확인',answer:null,attachments:[],history:[]}
const permissions=Object.fromEntries(workspacePages.map(p=>[p.key,['menu','read','readAll','create','update','delete','confirm','count','manageUsers']]))
const workspace={id:'header-qa',name:'헤더 QA 기업',role:'Master',permissions,serviceStatus:'Active',billingStatus:'Active',billingAccess:{state:'Active',canAccessWms:true,hasRegisteredCard:true,freeUntil:'2027-01-01',firstChargeAt:'2027-01-01'},billingPolicy:{monthlyPerUserKrw:0,monthlyBaseKrw:0,includedUsers:1},canManageBilling:false,latestChange:null}
const admin=false
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',route=>{
  const r=route.request(),u=new URL(r.url()),p=u.pathname.replace('/api/tenants/header-qa','')
  assert.equal(u.origin,origin)
  if(!u.pathname.startsWith('/api/'))return route.continue()
  assert.equal(r.method(),'GET','Audit must not write any business data')
  const json=data=>route.fulfill({json:data})
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'헤더 QA',userName:'qa',email:'qa@example.test',systemRole:admin?'IebleAdministrator':'User',mustChangePassword:false},memberships:[{tenantId:workspace.id,name:workspace.name,role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:workspace.id})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p==='/workspace')return json(workspace)
  if(p.startsWith('/pages/'))return json({})
  if(p==='/dashboard/warehouses')return json({warehouses:[],asOf:now})
  if(p.endsWith('/choices'))return json({...empty,warehouses:[],partners:[],products:[],locations:[]})
  if(p==='/inventory')return json(empty)
  if(p==='/warehouses/w1')return json({warehouse:{id:'w1',code:'WH01',name:'헤더 QA 창고',isActive:true,version:'1'},zones:[],racks:[],locationCount:0})
  if(p==='/warehouses/w1/workspace')return json({detail:{warehouse:{id:'w1',code:'WH01',name:'헤더 QA 창고',isActive:true,version:'1'},zones:[],racks:[],locationCount:0},floorLocations:[],plan:{exists:false,objects:[],aspectRatio:1.6}})
  if(p==='/products/'+id)return json({product:{id,code:'PR01',name:'헤더 QA 상품',unit:'EA',isActive:true,version:'1',images:[],barcodes:[],lotManaged:false,serialManaged:false,expiryManaged:false},categoryName:null})
  if(p==='/receipts/'+id)return json({receipt:{id,number:'IN01',warehouseId:'w1',warehouseName:'QA 창고',partnerId:'p1',partnerName:'QA 거래처',expectedDate:'2026-11-09',status:'Planned',version:'1',createdAt:now},lines:[]})
  if(p==='/shipments/'+id)return json({shipment:{id,number:'PK01',warehouseId:'w1',warehouseName:'QA 창고',partnerId:'p1',partnerName:'QA 거래처',requestDate:'2026-11-09',expectedDate:'2026-11-09',status:'Requested',version:'1',createdAt:now},lines:[],allocations:[],movements:[]})
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
 const page=await context.newPage();const navigate=path=>page.goto(origin+path,{waitUntil:'domcontentloaded'});page.setDefaultTimeout(12000);page.on('pageerror',e=>{errors.push(e.message);console.log('RENDER ERROR',e.message)})

 async function controls(scope){
  for(const el of await scope.locator('input:not([type=checkbox],[type=radio],[type=hidden],[type=file],[type=range],[type=color],[type=button],[type=submit]),select:not([multiple]),.searchable-choice-trigger:not(.is-title-trigger)').all()){
   if(!await el.isVisible())continue
   assert.equal((await el.boundingBox()).height,40,await el.evaluate(e=>e.outerHTML.slice(0,160)))
   assert.equal(await el.evaluate(e=>getComputedStyle(e).borderRadius),'8px')
  }
 }
 async function chrome(width){
  const header=page.locator('.wms-header');await header.waitFor()
  const menu=header.getByRole('button',{name:'업무 메뉴 열기',exact:true})
  assert.equal(await menu.isVisible(),width<=760,`mobile opener at ${width}`)
  const company=header.locator('.wms-company'),profile=header.locator('.user-profile')
  const h=await header.boundingBox(),c=await company.boundingBox(),p=await profile.boundingBox()
  const padding=await header.evaluate(el=>({left:parseFloat(getComputedStyle(el).paddingLeft),right:parseFloat(getComputedStyle(el).paddingRight)}))
  if(width>760)assert(Math.abs(c.x-h.x-padding.left)<1,'company aligned to header left')
  assert(Math.abs(h.x+h.width-padding.right-p.x-p.width)<1,'profile aligned right')
  assert(c.x+c.width<=p.x+1,'company/profile do not overlap')
  assert.equal(await company.evaluate(el=>getComputedStyle(el).gap),'8px')
  if(width<=760){await menu.click();await page.getByRole('button',{name:'사이드바 닫기',exact:true}).click()}
 }
 async function actions(scope){
  for(const b of await scope.locator('button:is(.primary,.secondary)').all()){
   if(!await b.isVisible()||await b.evaluate(el=>!!el.closest('.wms-segmented,[role=tablist],.wms-pagination')||el.classList.contains('registration-back')))continue
   const style=await b.evaluate(el=>{const s=getComputedStyle(el);return {text:el.textContent.trim(),padding:s.paddingInlineStart,min:s.minWidth,flex:s.flexGrow,height:el.getBoundingClientRect().height,overflow:el.scrollWidth>el.clientWidth+1}})
   assert.equal(style.padding,'16px',JSON.stringify(style));assert.equal(style.min,'0px',JSON.stringify(style));assert.equal(style.flex,'0',JSON.stringify(style));assert.equal(style.height,40,JSON.stringify(style));assert.equal(style.overflow,false,JSON.stringify(style))
  }
 }
 const paths=['/app/settings/company','/app/products','/app/warehouses','/app/settings/users','/app/receipts','/app/shipments','/app/inventory/counts','/app/partners','/app/inventory/adjustments','/app/reports/history','/app/products/new','/app/receipts/new','/app/shipments/new']
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000})
  for(const path of paths){
   await navigate(path);await page.locator('.wms-page-header h1,.wms-page-header h2').first().waitFor().catch(async e=>{console.log('FAILED',path,(await page.locator('body').innerText()).slice(-700));throw e});await chrome(width);await controls(page)
   if(width>760&&path===paths[0]){await page.getByRole('button',{name:'사이드바 접기',exact:true}).click();await chrome(width);await page.getByRole('button',{name:'사이드바 펼치기',exact:true}).click()}
   await actions(page.locator('.wms-page-header'));await actions(page.locator('.list-search-actions'))
   const head=page.locator('.wms-page-header').first();assert(await head.evaluate(el=>el.scrollWidth<=el.clientWidth+1),path+' header overflow')
   for(const b of await head.locator('button').all()){if(!await b.isVisible())continue;const r=await b.boundingBox();assert(r.x>=0&&r.x+r.width<=width+1,path+' action outside viewport')}
  }
  await navigate('/app/partners');await page.getByRole('button',{name:'거래처 등록',exact:true}).click();await controls(page.getByRole('dialog'));await page.getByRole('dialog').getByRole('button',{name:'취소',exact:true}).click()
  await navigate('/app/warehouses');await page.getByRole('button',{name:'창고 등록',exact:true}).click();await page.getByLabel('창고명',{exact:true}).waitFor();await controls(page)
  await navigate('/app/settings/users');await page.getByRole('button',{name:'사용자 등록',exact:true}).click();const d=page.getByRole('dialog');await d.waitFor();await controls(d);await actions(d.locator('.dialog-actions'))
  const footer=d.locator('.dialog-actions');assert.equal(await footer.evaluate(el=>getComputedStyle(el).gap),'8px')
  const sizes=await footer.locator('button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().width));assert(sizes.at(-1)>sizes[0],'save text controls natural width')
  await d.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0)
  await page.locator('.user-profile-trigger').click();await page.locator('.user-profile-panel').waitFor();await page.keyboard.press('Escape')
  console.log('PASS',width,'desktop/mobile company header, sidebar, profile, 13 business routes, natural action widths and modal cancellation')
 }
 assert.deepEqual(errors,[])
 console.log('PASS real app served from '+origin+'; API reads mocked; no data writes')
}finally{await browser.close()}
