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
  const doc=n=>({id:'d'+n,number:'DOC'+n,expectedDate:'2026-11-09',requestDate:'2026-11-09',partnerName:'거래처',warehouseName:'창고',status:'Planned',createdAt:now})
  if(p==='/products')return paged(n=>({product:product(n),categoryName:'분류'}))
  if(p==='/partners')return paged(n=>({...partner,id:'p'+n,name:'거래처 '+n,code:'BP'+n,isActive:process.env.PARTNER_CARD_QA ? n%2===1 : partner.isActive}))
  if(p==='/warehouses')return paged(n=>({warehouse:warehouse(n),zoneCount:1,rackCount:1,locationCount:1}),true)
  if(p==='/receipts')return paged(n=>({receipt:doc(n),productCount:1,totals:[{unit:'EA',quantity:n}]}))
  if(p==='/shipments')return paged(n=>({shipment:{...doc(n),status:'Requested'},productCount:1,totals:[{unit:'EA',quantity:n}]}))
  if(p==='/stocktakes')return paged(n=>({document:{...doc(n),name:'실사 '+n,status:'Counting',scope:'Selected',basisAt:now,contactName:'담당자'},productCount:1,targetCount:1,differenceCount:0}),true)
  if(p==='/users')return paged(n=>({...employee,userId:'u'+n,name:'구성원 '+n,loginId:'member'+n}))
  if(p==='/support')return paged(n=>({...inquiry,id:'q'+n,number:'Q'+n,title:'문의 '+n}))
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
  if(p==='/reports/stock-overview')return json({...empty,items:[{productId:'p1',productCode:'P01',productName:'모바일 재고 상품',unit:'EA',quantity:120,reservedQuantity:20,availableQuantity:100,isActive:true,statuses:['정상'],warehouseId:'w1',warehouseName:'QA 창고'}],total:1,summary:{registeredProducts:0,matchingProducts:0,holdingProducts:0,lowProducts:0,reservedProducts:0},asOf:now,today:'2026-11-09'})
  if(p==='/reports/movement-stats')return json({...empty,summary:{receipts:0,shipments:0,receiptProducts:0,shipmentProducts:0},trend:[],start:'2026-11-01',end:'2026-11-09',today:'2026-11-09'})
  if(['/warehouses','/products','/receipts','/shipments','/partners','/stocktakes','/users','/support','/reports/stock-history','/inventory/movements','/inventory/adjustments'].includes(p))return json({...empty,monthlyPerUserKrw:0})
  if(p==='/api/admin/tenants')return paged(n=>({id:'t'+n,name:'QA 기업 '+n,businessRegistrationNumber:null,createdAt:now,version:'1',isActive:true,billingStatus:'Active',serviceStatus:'Active',userCount:1,estimatedMonthlyKrw:0,billingAccess:{state:'Active'},canReactivate:false,contacts:[]}))
  if(p==='/api/admin/support')return paged(n=>({...inquiry,id:'a'+n,number:'A'+n,title:'관리자 문의 '+n}))
  if(p==='/api/admin/overview')return json({tenantCount:0,activeTenantCount:0,activeUserCount:0,newTenantCount:0,inquiryCount:0,pendingInquiryCount:0})
  unknown.add(p);return json(empty)
 })
 const page=await context.newPage();const navigate=path=>page.goto(origin+path,{waitUntil:'domcontentloaded'});page.setDefaultTimeout(12000);page.on('pageerror',e=>{errors.push(e.message);console.log('RENDER ERROR',e.message)})

 if(process.env.MANAGEMENT_LIST_QA) {
  const cases=process.env.PARTNER_CARD_QA ? [['/app/partners']] : [
   ['/app/partners'], ['/app/settings/users'], ['/app/settings/items'],
   ['/app/settings/items','직급 관리'], ['/app/settings/items','권한 등급 관리'],
   ['/app/support'], ['/app/master/activity-log'],
   ['/app/inventory/adjustments','이동·조정 내역'], ['/app/shipments'], ['/app/warehouses'],
  ]
  for(const width of [360,390,430,768,1440]) {
   await page.setViewportSize({width,height:844})
   for(const [path,tab] of cases) {
    await navigate(path)
    if(width<=1024) await page.locator('.mobile-header-menu').waitFor()
    if(tab) await page.getByRole(tab==='이동·조정 내역'?'button':'tab',{name:tab,exact:true}).click()
    const warehouse=path==='/app/warehouses', locator=warehouse?'.warehouse-directory-item':'.mobile-record-table tbody > tr'
    await page.locator(locator).first().waitFor();await page.waitForTimeout(120)
    if(!warehouse) await page.locator('.mobile-record-table td[data-label]:visible').first().waitFor()
    const geometry=await page.evaluate(({warehouse})=>{
     const table=document.querySelector('.mobile-record-table'),rows=warehouse?document.querySelectorAll('.warehouse-directory-item'):table.querySelectorAll('tbody > tr'),a=rows[0].getBoundingClientRect(),b=rows[1].getBoundingClientRect(),cs=getComputedStyle(rows[0]);
     const controls=[...document.querySelectorAll('.mobile-management-filters input,.mobile-management-filters select')].map(e=>({width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,parentRight:e.parentElement.getBoundingClientRect().right}));
     return {overflow:document.documentElement.scrollWidth>innerWidth+1,padding:cs.paddingLeft,gap:b.top-a.bottom,left:a.left,right:a.right,display:table?getComputedStyle(table).display:null,outer:table?getComputedStyle(table.parentElement).borderWidth:null,labels:table?[...rows[0].children].every(e=>e.hasAttribute('data-label')):true,controls};
    },{warehouse})
    assert(!geometry.overflow,`${width} ${path} page overflow`)
    if(width<=600) {
     assert.equal(geometry.padding,'16px',`${path} inset`);assert.equal(geometry.gap,12,`${path} card gap`)
     assert(geometry.left>=12&&geometry.right<=width-12,`${path} viewport inset`)
     if(!warehouse) {assert.equal(geometry.display,'block');assert.equal(geometry.outer,'0px');assert(geometry.labels)}
     for(const control of geometry.controls) {assert(control.width>=100,`${path} narrow field ${control.width}`);assert(control.right<=control.parentRight+1,`${path} overflowing field`)}
    }else if(!warehouse) assert.equal(geometry.display,'table',`${path} desktop/tablet table`)
    if(process.env.PARTNER_CARD_QA) {
     const table=page.locator('.partner-management-table'),row=table.locator('tbody > tr').first()
     const meta=row.locator('.partner-card-meta')
     assert.equal(await meta.isVisible(),width<=600)
     for(const label of ['거래처코드','거래처 유형']) assert.equal(await row.locator(`[data-label="${label}"]`).isVisible(),width>600)
     if(width<=600) {
      assert.equal(await row.locator('.partner-card-name').evaluate(e=>getComputedStyle(e).fontSize),'17px')
      assert.equal(await row.locator('td[data-label="거래처명"]').evaluate(e=>getComputedStyle(e,'::before').display),'none')
      assert.match(await meta.innerText(),/BP1 \/ 매입·매출처/)
      assert.equal(await table.locator('.partner-card-status.is-active').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(230, 244, 235)')
      assert.equal(await table.locator('.partner-card-status.is-inactive').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(253, 236, 236)')
     }
    }
    if(process.env.MANAGEMENT_BASELINE_ORIGIN && width===1440) {
     const measure=()=>page.evaluate(()=>[...document.querySelectorAll('.wms-page-heading,.list-search-filters,.table-page-size,.table-scroll,.wms-table-scroll,.warehouse-directory-grid')].filter(e=>!e.closest('dialog')).map(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,padding:cs.padding,border:cs.borderWidth,font:cs.fontSize}}))
     const current=await measure()
     await page.goto(process.env.MANAGEMENT_BASELINE_ORIGIN+path,{waitUntil:'domcontentloaded'})
     if(tab) await page.getByRole(tab==='이동·조정 내역'?'button':'tab',{name:tab,exact:true}).click()
     await page.locator(warehouse?'.warehouse-directory-item':'.wms-content table tbody tr').first().waitFor();await page.waitForTimeout(350)
     assert.deepEqual(await measure(),current,`${path} desktop baseline changed`)
    }
    if(process.env.MANAGEMENT_VISUAL && width===390 && ['/app/partners','/app/settings/users','/app/warehouses'].includes(path)) console.log('IMAGE:'+(await page.screenshot({type:'jpeg',quality:75})).toString('base64'))
   }
   console.log('PASS management list layout',width)
  }
  await page.setViewportSize({width:390,height:844});await navigate('/app/partners')
  const search=page.getByRole('textbox',{name:'거래처 검색'});await search.fill('거래처 2')
  await page.getByRole('button',{name:'검색',exact:true}).click()
  await page.waitForResponse(r=>r.url().includes('/partners?')&&new URL(r.url()).searchParams.get('search')==='거래처 2')
  await page.locator('.mobile-management-table td[data-label]:visible').first().waitFor()
  await page.getByRole('button',{name:'초기화',exact:true}).click()
  await page.getByRole('dialog',{name:'필터 초기화'}).getByRole('button',{name:'초기화',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('input[aria-label="거래처 검색"]')?.value==='')
  await page.locator('.mobile-management-table td[data-label]:visible').first().waitFor()
  await page.getByRole('button',{name:'2페이지',exact:true}).click()
  await page.waitForResponse(r=>r.url().includes('/partners?')&&new URL(r.url()).searchParams.get('page')==='2')
  await page.locator('.mobile-management-table td[data-label]:visible').first().waitFor()
  assert(requests.some(r=>r.path==='/partners'&&r.params.page==='2'))
  assert.deepEqual(errors,[])
  console.log('PASS management search, reset, pagination and read-only fixture requests')
 }else if(process.env.MOBILE_VISUAL){
  await page.setViewportSize({width:390,height:844});await navigate('/app');await page.getByRole('heading',{name:'빠른 업무'}).waitFor();await page.waitForTimeout(300);console.log('IMAGE:'+ (await page.screenshot({type:'jpeg',quality:75})).toString('base64'))
  await navigate('/app/receipts');await page.locator('.mobile-record-table tbody tr').first().waitFor();await page.waitForTimeout(300);console.log('IMAGE:'+ (await page.screenshot({type:'jpeg',quality:75})).toString('base64'))
 }else{
 for(const width of [360,390,430,768,1024,1440]) {
  await page.setViewportSize({width,height:850})
  for(const path of ['/app','/app/receipts','/app/shipments','/app/reports/stock','/app/inventory/adjustments','/app/inventory/counts','/app/products','/app/partners','/app/warehouses','/app/settings/users','/app/support','/app/barcode-lookup']) {
   await navigate(path);await page.locator('.wms-content').waitFor();await page.waitForTimeout(220)
   const mobile=width<=1024
   if(path==='/app/receipts') {
    await page.locator('.mobile-record-table tbody tr td[data-label="입고번호"]').first().waitFor()
    const metrics=await page.evaluate(()=>{
     const table=document.querySelector('.mobile-record-table'), rows=table.querySelectorAll('tbody > tr'), input=document.querySelector('input[aria-label="입고 검색"]'), select=document.querySelector('select[aria-label="입고 상태 필터"]'), tab=document.querySelector('.report-period-tabs button')
     const a=rows[0].getBoundingClientRect(), b=rows[1].getBoundingClientRect(), cs=getComputedStyle(rows[0])
     return {inputFont:getComputedStyle(input).fontSize,selectFont:getComputedStyle(select).fontSize,tabHeight:tab.getBoundingClientRect().height,paddingLeft:cs.paddingLeft,paddingRight:cs.paddingRight,gap:b.top-a.bottom,tableDisplay:getComputedStyle(table).display}
    })
    if(width<=1024) {assert.equal(metrics.inputFont,'14px');assert.equal(metrics.selectFont,'14px');assert.equal(metrics.tabHeight,32)}
    if(width<=600) {assert.equal(metrics.paddingLeft,'16px');assert.equal(metrics.paddingRight,'16px');assert.equal(metrics.gap,12)}
    else assert.equal(metrics.tableDisplay,'table')
    console.log('PASS receipt field/tab/card geometry',width,JSON.stringify(metrics))
   }
   if(path==='/app/reports/stock' && width<=1024) {
    const tabs=page.locator('.overview-display-tabs button')
    await tabs.first().waitFor()
    for(const tab of await tabs.all()) assert.equal((await tab.boundingBox()).height,36)
   }
   if(mobile||path==='/app') assert.equal(await page.locator('.wms-breadcrumb').evaluate(e=>getComputedStyle(e).display==='none'),mobile,`${width} ${path} breadcrumb display`)
   assert.equal(await page.locator('.mobile-bottom-nav').count(),0,path)
   if(mobile) await page.locator('.mobile-header-menu').waitFor()
   assert.equal(await page.locator('.mobile-header-menu').count(),mobile?1:0,path)
   if(mobile) {assert.equal(await page.locator('.wms-sidebar').count(),0)}
   const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('.wms-content *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+2&&getComputedStyle(e).position!=='fixed'&&!e.closest('.table-scroll,.document-line-scroll')}).slice(0,6).map(e=>[e.tagName,e.className,e.getBoundingClientRect().width])}))
   if(overflow.scroll>width+2) console.log('OVERFLOW',width,path,JSON.stringify(overflow))
   assert(overflow.scroll<=width+2,`${width} ${path} overflows ${overflow.scroll}`)
  }
  console.log('PASS mobile presentation',width)
 }
 await page.setViewportSize({width:390,height:844});await navigate('/app')
 assert.match(await page.locator('.dashboard-today-work').innerText(),/3건/)
 await page.locator('.warehouse-plan-canvas').waitFor();assert.equal(await page.locator('.mobile-map-toggle').count(),0)
 const openMenu=()=>page.getByRole('button',{name:'전체 메뉴 열기',exact:true}).click()
 await openMenu();await page.getByRole('dialog',{name:'전체 메뉴',exact:true}).getByRole('button',{name:'입고관리',exact:true}).click();await page.waitForURL('**/app/receipts')
 await openMenu();await page.getByRole('dialog',{name:'전체 메뉴',exact:true}).getByRole('button',{name:'바코드 조회',exact:true}).click();await page.waitForURL('**/app/barcode-lookup')
 await openMenu();await page.getByRole('button',{name:'이용 가이드',exact:true}).click();await page.getByRole('dialog',{name:'이용 가이드',exact:true}).waitFor()
 workspace.role='Employee';workspace.permissions={products:['menu','read']};await navigate('/app/barcode-lookup');await openMenu();assert.equal(await page.getByRole('dialog',{name:'전체 메뉴',exact:true}).getByRole('button',{name:'입고관리',exact:true}).count(),0);assert.equal(await page.getByRole('dialog',{name:'전체 메뉴',exact:true}).getByRole('button',{name:'출고관리',exact:true}).count(),0)
 assert.deepEqual(errors,[])
 console.log('PASS mobile navigation, guide and desktop shell; unknown fixture reads', [...unknown])
}
} finally {await browser.close()}
