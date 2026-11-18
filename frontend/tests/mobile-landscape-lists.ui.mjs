import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://localhost:5176'
const id='12345678-1234-1234-1234-123456789012'
const requests=[];const errors=[],unknown=new Set(),now='2026-11-09T05:00:00Z',empty={items:[],total:0,page:1,pageSize:20}
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
  assert([origin,process.env.MANAGEMENT_BASELINE_ORIGIN].includes(u.origin),u.origin)
  if(!u.pathname.startsWith('/api/'))return route.continue()
  assert.equal(r.method(),'GET','Audit must not write any business data')
  const json=data=>route.fulfill({json:data})
  requests.push({path:p,params:Object.fromEntries(u.searchParams)})
  const paged=(factory,fixed=false)=>{const size=fixed?20:Number(u.searchParams.get('pageSize')||20),page=Number(u.searchParams.get('page')||1),total=125;return json({items:Array.from({length:Math.max(0,Math.min(size,total-(page-1)*size))},(_,i)=>factory((page-1)*size+i+1)),total,page,pageSize:size,monthlyPerUserKrw:0})}
  const product=n=>({id:'p'+n,code:'PR'+n,name:'상품 '+n,unit:'EA',isActive:true,version:'v1',hasImage:false})
  const warehouse=n=>({id:'w'+n,code:'WH'+n,name:'창고 '+n,type:'Ambient',isActive:true,version:'v1'})
  const doc=n=>({id:n===1?id:'12345678-1234-1234-1234-'+String(n).padStart(12,'0'),number:'DOC'+n,expectedDate:'2026-11-09',requestDate:'2026-11-09',partnerName:'아주 긴 거래처명 '+('거래처'.repeat(16)),warehouseName:'긴 창고 이름 '.repeat(8),status:'Planned',createdAt:now})
  if(p==='/products')return paged(n=>({product:product(n),categoryName:'분류'}))
  if(p==='/partners')return paged(n=>({...partner,id:'p'+n,name:'거래처 '+n+' '+('긴이름'.repeat(16)),code:'BP'+n,isActive:process.env.PARTNER_CARD_QA ? n%2===1 : partner.isActive}))
  if(p==='/warehouses')return paged(n=>({warehouse:warehouse(n),zoneCount:1,rackCount:1,locationCount:1}),true)
  if(p==='/receipts')return paged(n=>({receipt:doc(n),productCount:1,totals:[{unit:'EA',quantity:n}]}))
  if(p==='/shipments')return paged(n=>({shipment:{...doc(n),status:'Requested'},productCount:1,totals:[{unit:'EA',quantity:n}]}))
  if(p==='/stocktakes')return paged(n=>({document:{...doc(n),name:'실사 '+n,status:'Counting',scope:'Selected',basisAt:now,contactName:'담당자'},productCount:1,targetCount:1,differenceCount:0}),true)
  if(p==='/users')return paged(n=>({...employee,userId:'u'+n,name:'구성원 '+n,loginId:'member'+n}))
  if(p==='/support')return paged(n=>({...inquiry,id:'q'+n,number:'Q'+n,title:'문의 '+n+' '+('긴 문의 제목 '.repeat(12))}))
  if(p==='/activity-log')return paged(n=>({id:n,source:'products',action:'수정',actor:'담당자',changedAt:now}),true)
  if(p==='/inventory')return paged(n=>({id:'s'+n,productId:'p'+n,productCode:'PR'+n,productName:'상품 '+n,warehouseName:'창고',rackCode:'R1',locationCode:'L'+n,unit:'EA',quantity:10,reservedQuantity:0,availableQuantity:10,isActive:true}))
  if(p==='/inventory/history')return paged(n=>({id:'op'+n,number:'OP'+n,type:'Move',productName:'상품',productCode:'P1',sourceLabel:'위치1',destinationLabel:'위치2',quantity:1,unit:'EA',occurredAt:now,reason:'이동',actorName:'담당자'}))
  if(p==='/organization-items'||p==='/users/organization-options')return json({departments:Array.from({length:65},(_,i)=>({id:'d'+i,name:'부서 '+i,isActive:true,version:'v1',sortOrder:i,memberCount:0})),positions:Array.from({length:65},(_,i)=>({id:'p'+i,name:'직급 '+i,isActive:true,version:'v1',sortOrder:i,memberCount:0}))})
  if(p.endsWith('/permission-grades'))return json(Array.from({length:65},(_,i)=>({id:'grade'+i,name:'권한 '+i,isActive:true,isBuiltIn:false,memberCount:0,version:'v1'})))

  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'헤더 QA',userName:'qa',email:'qa@example.test',systemRole:admin?'IebleAdministrator':'User',mustChangePassword:false},memberships:[{tenantId:workspace.id,name:workspace.name,role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:workspace.id})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p==='/workspace')return json(workspace)
  if(p.startsWith('/pages/'))return json({})
  if(p==='/dashboard/warehouses')return json({warehouses:[{id:'w1',name:'모바일 QA 창고',code:'WH01'}],asOf:now})
  if(p==='/dashboard/warehouses/w1')return json({asOf:now,warehouse:{id:'w1',name:'모바일 QA 창고',code:'WH01'},racks:[{id:'r1',code:'R01',name:'보관 랙'}],rackTotals:[{rackId:'r1',unit:'EA',quantity:90}],plan:{exists:true,aspectRatio:1.6,objects:[{id:'rack1',type:'rack',rackId:'r1',label:'R01',x:.5,y:.5,width:.2,height:.2,rotation:0,fill:'#ddd'}]},risk:{lowProducts:2,expiryProducts:1,todayReceipts:3,todayShipments:5,counts:{safe:1,warning:0,danger:0,review:0,empty:0},racks:[],detail:null},detail:null})
  if(p.endsWith('/choices'))return json({...empty,warehouses:[],partners:[],products:[],locations:[]})
  if(p==='/inventory')return json(empty)
  if(p==='/warehouses/w1')return json({warehouse:{id:'w1',code:'WH01',name:'헤더 QA 창고',isActive:true,version:'1'},zones:[],racks:[],locationCount:0})
  if(p==='/warehouses/w1/workspace')return json({detail:{warehouse:{id:'w1',code:'WH01',name:'헤더 QA 창고',isActive:true,version:'1'},zones:[],racks:[],locationCount:0},floorLocations:[],plan:{exists:false,objects:[],aspectRatio:1.6}})
  if(p==='/products/'+id)return json({product:{id,code:'PR01',name:'헤더 QA 상품',unit:'EA',isActive:true,version:'1',images:[],barcodes:[],lotManaged:false,serialManaged:false,expiryManaged:false},categoryName:null})
  if((p==='/receipts/'+id||p==='/receipts/d1'))return json({receipt:{id,number:'IN01',warehouseId:'w1',warehouseName:'QA 창고',partnerId:'p1',partnerName:'QA 거래처',expectedDate:'2026-11-09',status:'Planned',version:'1',createdAt:now},lines:[]})
  if((p==='/shipments/'+id||p==='/shipments/d1'))return json({shipment:{id,number:'PK01',warehouseId:'w1',warehouseName:'QA 창고',partnerId:'p1',partnerName:'QA 거래처',requestDate:'2026-11-09',expectedDate:'2026-11-09',status:'Requested',version:'1',createdAt:now},lines:[],allocations:[],movements:[]})
  if((p==='/stocktakes/'+id||p==='/stocktakes/d1'))return json({document:{id,number:'ST01',scope:'Selected',status:'Confirmed',warehouseId:'w1',warehouseName:'QA 창고',version:'1',createdAt:now},summary:{total:0,counted:0,missing:0,differences:0,shortages:0,excesses:0,matches:0},conflicts:[],incoming:false,selectedItems:[]})
  if((p.startsWith('/stocktakes/'+id+'/')||p.startsWith('/stocktakes/d1/')))return json(empty)
  if(p==='/products/options')return json({categories:[],productTypes:[],units:['EA']})
  if(p==='/users/organization-options'||p==='/organization-items')return json({departments:[],positions:[]})
  if(p.endsWith('/permission-grades'))return json([{id:'Employee',name:'일반 직원',isActive:true,isBuiltIn:true,memberCount:0,version:'1'}])
  if(p==='/permissions')return json({roles:{Administrator:{},Employee:{}},defaults:{Administrator:{},Employee:{}},features:[],version:'1'})
  if(p==='/organization-chart')return json({departments:[],positions:[],employees:[],users:[],unassigned:[],companyName:workspace.name,totalEmployees:0})
  if(p==='/users')return json({...empty,items:[employee],total:1,monthlyPerUserKrw:0})
  if(p==='/partners')return json({...empty,items:[partner],total:1})
  if((p==='/partners/partner'||p==='/partners/p1'))return json(partner)
  if(p==='/support')return json({...empty,items:[inquiry],total:1})
  if((p==='/support/ticket'||p==='/support/q1'))return json(inquiry)
  if(p==='/company')return json({company:{id:workspace.id,name:workspace.name,version:'1'},history:[]})
  if(p==='/reports/stock-history')return json({...empty,summary:{rows:0,receiptRows:0,shipmentRows:0,operationRows:0,stocktakeRows:0,workCount:0},start:'2026-11-01',end:'2026-11-09',today:'2026-11-09'})
  if(p==='/reports/stock-overview')return json({...empty,items:[{productId:'p1',productCode:'P01',productName:'모바일 재고 상품',unit:'EA',quantity:120,reservedQuantity:20,availableQuantity:100,isActive:true,statuses:['정상'],warehouseId:'w1',warehouseName:'QA 창고'}],total:1,summary:{registeredProducts:0,matchingProducts:0,holdingProducts:0,lowProducts:0,reservedProducts:0},asOf:now,today:'2026-11-09'})
  if(p==='/reports/movement-stats')return json({...empty,summary:{receipts:0,shipments:0,receiptProducts:0,shipmentProducts:0},trend:[],start:'2026-11-01',end:'2026-11-09',today:'2026-11-09'})
  if(['/warehouses','/products','/receipts','/shipments','/partners','/stocktakes','/users','/support','/reports/stock-history','/inventory/movements','/inventory/adjustments'].includes(p))return json({...empty,monthlyPerUserKrw:0})
  if(p==='/api/admin/tenants')return paged(n=>({id:'t'+n,name:'QA 기업 '+n,businessRegistrationNumber:null,createdAt:now,version:'1',isActive:true,billingStatus:'Active',serviceStatus:'Active',userCount:1,estimatedMonthlyKrw:0,billingAccess:{state:'Active'},canReactivate:false,contacts:[]}))
  if(p==='/api/admin/support')return paged(n=>({...inquiry,id:'a'+n,number:'A'+n,title:'관리자 문의 '+n}))
  if(p==='/api/admin/overview')return json({tenantCount:0,activeTenantCount:0,activeUserCount:0,newTenantCount:0,inquiryCount:0,pendingInquiryCount:0})
  unknown.add(p);return json(empty)
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000)
 const baseline=process.env.MANAGEMENT_BASELINE_ORIGIN,old=baseline?await context.newPage():null
 const cases=[['/app/receipts','.receipt-list-table','입고 검색'],['/app/shipments','.shipment-list-table','출고 검색'],['/app/inventory/counts','.stocktake-list','실사 검색'],['/app/partners','.partner-management-table','거래처 검색'],['/app/support','.support-table','문의 검색']]
 const open=async(p,server,path,selector)=>{await p.goto(server+path);await p.locator(selector+' tbody > tr > td[data-label]:visible').first().waitFor()}
 const measure=async(p,selector)=>p.locator(selector).evaluate(table=>{
  const rect=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right}}
  const row=table.querySelector('tbody > tr'),box=table.parentElement,form=document.querySelector('.wms-content .list-search-filters')
  return {display:getComputedStyle(table).display,rowDisplay:getComputedStyle(row).display,table:rect(table),container:rect(box),row:rect(row),overflow:box.scrollWidth>box.clientWidth+1,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,form:rect(form),formOverflow:form.scrollWidth>form.clientWidth+1,
   cells:[...row.cells].filter(e=>getComputedStyle(e).display!=='none').map(e=>({label:e.dataset.label,rect:rect(e),overflow:e.scrollWidth>e.clientWidth+1})),buttons:[...table.querySelectorAll('tbody button')].map(rect),formControls:[...form.querySelectorAll('input,select,button')].filter(e=>e.getClientRects().length).map(rect)}
 })
 for(const [width,height] of (process.env.FLOW_ONLY?[]:[[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]])){
  await page.setViewportSize({width,height});if(old)await old.setViewportSize({width,height})
  for(const [path,selector] of cases){
   await open(page,origin,path,selector);const m=await measure(page,selector),cards=width<=600||(width<=1024&&height<=500&&width>height)
   let b;if(old){await open(old,baseline,path,selector);b=await measure(old,selector)}
   if(process.env.AUDIT_ONLY){console.log('BEFORE',width,height,path,m.rowDisplay,'button',m.buttons[0]?.x,m.buttons[0]?.right,'scroll',m.overflow,'filters height',m.form.h);continue}
   assert.equal(m.rowDisplay,cards?'grid':'table-row',path+' layout '+width)
   if(cards){assert(!m.overflow,path+' horizontal list scroll '+width);assert(!m.pageOverflow,path+' page overflow '+width);assert(!m.formOverflow,path+' filters overflow '+width)
    for(const c of m.cells)assert(!c.overflow,path+' cell overflow '+c.label+' '+width)
    for(const button of m.buttons)assert(button.x>=0&&button.right<=width,path+' action outside viewport '+JSON.stringify(button))
    for(const control of m.formControls)assert(control.x>=0&&control.right<=width,path+' filter outside viewport')
   }
   if(b){if(width<=600||height>500)assert.deepEqual(m,b,'portrait/tablet/PC unchanged '+path+' '+width)
    else {assert(m.form.h<=b.form.h+1,'landscape filters grew '+path);console.log('LANDSCAPE',width,path,`action right ${b.buttons[0]?.right} -> ${m.buttons[0]?.right}; filters ${b.form.h} -> ${m.form.h}`)}
   }
  }
  console.log('PASS list geometry',width,height)
 }
 if(process.env.AUDIT_ONLY){assert.deepEqual(errors,[]);await browser.close();process.exit(0)}
 for(const [path,selector,label] of cases){
  await page.setViewportSize({width:390,height:844});await open(page,origin,path,selector)
  const search=page.getByRole('textbox',{name:label,exact:true});await search.fill('유지할 검색어')
  const select=page.locator('.list-search-filters > label > select').first();await select.selectOption({index:1});const selected=await select.inputValue()
  const response=page.waitForResponse(r=>r.url().includes('/api/')&&new URL(r.url()).searchParams.get('search')==='유지할 검색어');await page.getByRole('button',{name:'검색',exact:true}).click();await response
  await page.locator(selector+' tbody > tr > td[data-label]:visible').first().waitFor()
  const page2=page.getByRole('button',{name:'2페이지',exact:true});await page2.click();await page.locator(selector+' tbody > tr > td[data-label]:visible').first().waitFor()
  const text=await page.locator(selector+' tbody').innerText()
  for(const viewport of [{width:844,height:390},{width:390,height:844},{width:932,height:430}]){await page.setViewportSize(viewport);assert.equal(await search.inputValue(),'유지할 검색어');assert.equal(await select.inputValue(),selected);assert.equal(await page.locator(selector+' tbody').innerText(),text);assert.equal(await page2.getAttribute('aria-current'),'page')}
  await page.getByRole('button',{name:'초기화',exact:true}).first().click();await page.getByRole('dialog',{name:'필터 초기화'}).getByRole('button',{name:'초기화',exact:true}).click();await page.locator(selector+' tbody > tr > td[data-label]:visible').first().waitFor();assert.equal(await search.inputValue(),'')
  // Existing detail actions stay clickable; do not submit any business operation.
  await page.locator(selector+' tbody button').first().click()
  if(path.endsWith('partners')||path.endsWith('support')){const dialog=page.getByRole('dialog');await dialog.waitFor();await page.setViewportSize({width:390,height:844});assert(await dialog.isVisible())}
  else {await page.locator('.work-detail-header').waitFor();assert(!page.url().endsWith(path))}
  console.log('PASS search/filter/reset/page/rotation and detail action',path)
 }
 workspace.permissions=Object.fromEntries(workspacePages.map(p=>[p.key,['menu','read']]))
 for(const [path,selector] of cases){await open(page,origin,path,selector);assert.equal(await page.locator('.wms-page-heading').getByRole('button',{name:/등록/}).count(),0);assert(await page.locator(selector+' tbody button').first().isVisible())}
 assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[]);console.log('PASS permissions retained; all API requests read-only and mocked')
}finally{await browser.close()}
