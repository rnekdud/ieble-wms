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
let authenticated=true
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',route=>{
  const r=route.request(),u=new URL(r.url()),p=u.pathname.replace('/api/tenants/header-qa','')
  assert.equal(u.origin,origin)
  if(u.pathname==='/__required-tracking')return route.fulfill({contentType:'text/html',body:`<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/receipt-tracking-ui.tsx"></script></html>`})
  if(!u.pathname.startsWith('/api/'))return route.continue()
  assert.equal(r.method(),'GET','Audit must not write any business data')
  const json=data=>route.fulfill({json:data})
  if(p==='/api/auth/me'&&!authenticated)return route.fulfill({status:401,json:{message:'로그인이 필요합니다.'}})
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

 async function checkFields(name){
  assert.equal(await page.getByText('필수 선택 항목',{exact:true}).count(),0,name+' no redundant required text')

  const stats=await page.evaluate(()=>{
   const visible=e=>e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0
   const labels=[...document.querySelectorAll('label')].filter(visible)
   const missing=[],duplicates=[],badColor=[],heights=[]
   for(const label of labels){
    const controls=[...label.querySelectorAll('input,select,textarea')]
    if(label.htmlFor){const input=document.getElementById(label.htmlFor);if(input)controls.push(input)}
    const required=controls.some(i=>i.required&&!i.readOnly&&!i.disabled&&!i.matches(':disabled'))
    const marks=[...label.querySelectorAll('.form-required-mark')]
    if(required&&!marks.length)missing.push(label.innerText)
    if(marks.length>1)duplicates.push(label.innerText)
    for(const mark of marks){if(getComputedStyle(mark).color!=='rgb(235, 68, 68)')badColor.push(label.innerText)}
    for(const c of controls)if(visible(c)&&c.tagName!=='TEXTAREA'&&!['checkbox','radio','file','color','hidden'].includes(c.type))heights.push({label:label.innerText,height:c.getBoundingClientRect().height})
   }
   return {missing,duplicates,badColor,heights,marks:document.querySelectorAll('.form-required-mark').length}
  })
  assert.deepEqual(stats.missing,[],name+' missing required label');assert.deepEqual(stats.duplicates,[],name+' duplicate marks');assert.deepEqual(stats.badColor,[],name+' marker color');assert(stats.marks>0,name+' has required labels')
  for(const item of stats.heights)assert.equal(item.height,40,name+' height '+item.label)
 }
 async function mark(label,expected){const field=page.getByLabel(label,{exact:true});await field.waitFor();const count=await field.evaluate(e=>e.closest('label')?.querySelectorAll('.form-required-mark').length||0);assert.equal(count,expected,label)}
 const routes=['/app/products/new','/app/receipts/new','/app/shipments/new','/app/inventory/counts/new','/app/settings/company']
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000})
  for(const path of routes){await navigate(path);await page.locator('.form-required-mark').first().waitFor();await checkFields(path);if(path==='/app/products/new'){await mark('상품명',1);await mark('상품코드',0);await mark('인박스 수량',0);await mark('파레트당 아웃박스',0)}}
  await navigate('/app/warehouses');await page.getByRole('button',{name:'창고 등록',exact:true}).click();await page.getByLabel('창고명',{exact:true}).waitFor();await checkFields('창고 등록');await mark('창고명',1);await mark('창고 유형',0);await mark('자체 창고 코드',0)
  for(const [path,button] of [['/app/settings/users','사용자 등록'],['/app/partners','거래처 등록'],['/app/support','문의 등록']]){await navigate(path);await page.getByRole('button',{name:button,exact:true}).click();await page.getByRole('dialog').waitFor();await checkFields(button);if(button==='거래처 등록'){await mark('거래처코드',0);await mark('거래처명',1);await mark('사업자등록번호',0)}}
  await navigate('/app/settings/items');await page.getByRole('button',{name:'부서 등록',exact:true}).click();await page.getByRole('dialog').waitFor();await checkFields('부서 등록')
  console.log('PASS required labels and 40px inputs',width)
 }
 await navigate('/app/products/new');await page.getByLabel('상품명',{exact:true}).waitFor()
 const before=await page.locator('input[required],select[required],textarea[required]').count()
 await page.getByLabel('아웃박스 수량',{exact:true}).fill('5');await mark('인박스 수량',1);await page.getByLabel('아웃박스 구성',{exact:true}).selectOption('EA');await mark('인박스 수량',0)
 await page.getByLabel('파레트당 아웃박스',{exact:true}).fill('20');await mark('아웃박스 수량',1);await page.getByLabel('파레트당 아웃박스',{exact:true}).fill('');await mark('아웃박스 수량',0)
 assert.equal(await page.locator('input[required],select[required],textarea[required]').count(),before,'conditional visual requirements must not change native validation')
 await navigate('/__required-tracking');const tracking=page.getByRole('dialog');await tracking.waitFor();assert.equal(await tracking.locator('.form-required-mark').count(),0,'optional tracking has no unconditional marks')
 await tracking.getByRole('button',{name:'+ LOT 추가',exact:true}).click();await page.getByLabel('LOT 유통기한 1',{exact:true}).fill('2027-01-01');await page.getByLabel('LOT 수량 1',{exact:true}).fill('10');assert.equal(await tracking.getByRole('tab',{name:/LOT/}).locator('.form-required-mark').count(),1)
 await tracking.getByRole('tab',{name:/시리얼/}).click();await tracking.getByRole('button',{name:'+ 시리얼 추가',exact:true}).click();await page.getByLabel('시리얼 번호 1',{exact:true}).fill('QA-001');assert.equal(await tracking.getByRole('columnheader',{name:'시리얼 번호',exact:true}).locator('.form-required-mark').count(),1)
 await tracking.getByRole('button',{name:'+ 시리얼 추가',exact:true}).click();await page.getByLabel('시리얼 번호 2',{exact:true}).fill('QA-001');await tracking.getByRole('button',{name:'저장',exact:true}).click();await tracking.getByRole('alert').waitFor();assert(await tracking.isVisible());await page.getByLabel('시리얼 번호 2',{exact:true}).fill('QA-002')
 await tracking.getByRole('tab',{name:/LOT/}).click();assert.equal(await page.getByLabel('LOT 유통기한 1',{exact:true}).inputValue(),'2027-01-01');await tracking.getByRole('button',{name:'저장',exact:true}).click();await tracking.waitFor({state:'hidden'});const entries=JSON.parse(await page.getByLabel('저장된 추적 정보').textContent());assert.equal(entries[0].quantity,10);assert.equal(entries[0].expiryDate,'2027-01-01');assert.equal(entries.flatMap(e=>e.serials).length,2)
 console.log('PASS optional tracking, conditional LOT group, serial row requirement, duplicate error and local draft save')
 authenticated=false;await navigate('/register');await page.getByLabel('기업명',{exact:true}).waitFor();await checkFields('기업 회원가입');assert(await page.getByLabel('기업명',{exact:true}).evaluate(e=>e.validity.valueMissing))
 await navigate('/login');await page.getByLabel('아이디',{exact:true}).waitFor();await checkFields('로그인')
 assert.deepEqual(errors,[])
 console.log('PASS real application forms, conditional packaging, optional codes, unchanged required validation; all APIs read-only mocked',origin)
}finally{await browser.close()}
