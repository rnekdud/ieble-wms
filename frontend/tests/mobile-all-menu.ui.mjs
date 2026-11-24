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
  assert.equal(u.origin,origin)
  if(!u.pathname.startsWith('/api/'))return route.continue()
  assert.equal(r.method(),'GET','Audit must not write any business data')
  const json=data=>route.fulfill({json:data})
  requests.push({path:p,params:Object.fromEntries(u.searchParams)})
  const paged=(factory,fixed=false)=>{const size=fixed?20:Number(u.searchParams.get('pageSize')||20),page=Number(u.searchParams.get('page')||1),total=125;return json({items:Array.from({length:Math.max(0,Math.min(size,total-(page-1)*size))},(_,i)=>factory((page-1)*size+i+1)),total,page,pageSize:size,monthlyPerUserKrw:0})}
  const product=n=>({id:'p'+n,code:'PR'+n,name:'상품 '+n,unit:'EA',isActive:true,version:'v1',hasImage:false})
  const warehouse=n=>({id:'w'+n,code:'WH'+n,name:'창고 '+n,type:'Ambient',isActive:true,version:'v1'})
  const doc=n=>({id:'d'+n,number:'DOC'+n,expectedDate:'2026-11-09',requestDate:'2026-11-09',partnerName:'거래처',warehouseName:'창고',status:'Planned',createdAt:now})
  if(p==='/products')return paged(n=>({product:product(n),categoryName:'분류'}))
  if(p==='/partners')return paged(n=>({...partner,id:'p'+n,name:'거래처 '+n,code:'BP'+n}))
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

 const menu=()=>page.getByRole('dialog',{name:'전체 메뉴',exact:true})
 const openAll=async()=>{await page.getByRole('button',{name:'전체 메뉴 열기',exact:true}).click();await menu().waitFor();await menu().evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished)))}
 for(const width of [360,390,430,768]){
  await page.setViewportSize({width,height:844});await navigate('/app');await page.getByRole('heading',{name:'빠른 업무'}).waitFor();await openAll()
  assert.equal(await page.locator('.mobile-bottom-nav').count(),0)
  const opener=page.locator('.wms-header > .mobile-header-menu')
  const buttonBox=await opener.boundingBox(),companyBox=await page.locator('.wms-company').boundingBox()
  assert.equal(buttonBox.width,44);assert.equal(buttonBox.height,44);assert(buttonBox.x+44<=companyBox.x)
  const dialog=menu();assert.equal(await dialog.locator('footer').count(),1);assert.equal(await dialog.locator('footer .sidebar-language-trigger').textContent(),'한국어');assert.equal(await dialog.getByRole('button',{name:'닫기',exact:true}).count(),1)
  const closeGeometry=await dialog.getByRole('button',{name:'닫기',exact:true}).boundingBox()
  assert(closeGeometry.height>=44,JSON.stringify(closeGeometry));assert(closeGeometry.width>=44)
  assert.equal(await dialog.locator('.organization-dialog-heading button').count(),0)
  assert.equal(await dialog.locator('.mobile-menu-grid').count(),0);assert.equal(await dialog.locator('.mobile-menu-list > .mobile-menu-item').count(),workspacePages.length)
  assert.equal(await dialog.getByRole('button',{name:'홈 화면에 추가',exact:true}).count(),0)
  assert.equal(await dialog.locator('.mobile-menu-sublist svg').count(),0)
  assert.equal(await dialog.locator('.mobile-menu-list .mobile-menu-chevron').count(),0)
  const toggles=dialog.locator('.mobile-menu-toggle')
  assert.equal(await toggles.count(),5)
  for(const toggle of await toggles.all()) assert.equal(await toggle.getAttribute('aria-expanded'),'false')
  assert.equal(await dialog.getByRole('button',{name:'재고 실사/조사',exact:true}).count(),0)
  const inventoryToggle=dialog.getByRole('button',{name:'재고관리',exact:true})
  await inventoryToggle.focus();await page.keyboard.press('Enter');assert.equal(await inventoryToggle.getAttribute('aria-expanded'),'true')
  await page.keyboard.press('Space');assert.equal(await inventoryToggle.getAttribute('aria-expanded'),'false')
  if(width===390 && process.env.MENU_VISUAL) console.log('IMAGE:'+(await page.screenshot({type:'jpeg',quality:75})).toString('base64'))
  for(const toggle of await toggles.all()){await toggle.click();assert.equal(await dialog.locator('.mobile-menu-toggle[aria-expanded=true]').count(),1)}
  const geometry=await dialog.evaluate(d=>{const b=d.querySelector('.dialog-body'),body=b.getBoundingClientRect(),pad=getComputedStyle(b);return {overflow:d.scrollWidth>d.clientWidth||b.scrollWidth>b.clientWidth,scroll:b.scrollHeight>b.clientHeight,width:body.width-parseFloat(pad.paddingLeft)-parseFloat(pad.paddingRight),rect:{x:d.getBoundingClientRect().x,y:d.getBoundingClientRect().y,radius:getComputedStyle(d).borderRadius,right:d.getBoundingClientRect().right,bottom:d.getBoundingClientRect().bottom},rows:[...d.querySelectorAll('.mobile-menu-item')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),icon=e.querySelector('svg')?.getBoundingClientRect(),label=e.querySelector('span').getBoundingClientRect();return {x:r.x,width:r.width,height:r.height,background:s.backgroundColor,iconCenter:icon?icon.y+icon.height/2:null,labelCenter:label.y+label.height/2}})}})
  if(geometry.overflow)console.log(JSON.stringify(await dialog.evaluate(d=>({geometry:{client:d.clientWidth,scroll:d.scrollWidth},elements:[...d.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({tag:e.tagName,cls:e.className,client:e.clientWidth,scroll:e.scrollWidth,rect:e.getBoundingClientRect().toJSON(),display:getComputedStyle(e).display}))}))))
  assert(!geometry.overflow);assert(geometry.scroll);assert.equal(geometry.rect.x,0);assert.equal(geometry.rect.y,0);assert.equal(geometry.rect.radius,'0px');assert.equal(geometry.rect.right,Math.min(320,width-48));assert.equal(geometry.rect.bottom,844)
  for(const row of geometry.rows){assert(Math.abs(row.width-geometry.width)<1);assert.equal(row.x,geometry.rows[0].x);assert.equal(row.height,48);if(row.iconCenter!==null)assert(Math.abs(row.iconCenter-row.labelCenter)<1)}
  assert.equal(geometry.rows[1].background,'rgb(255, 255, 255)')
  assert.equal(await dialog.locator('[aria-current=page]').textContent(),'대시보드')
  const header=dialog.locator('.organization-dialog-heading'),initial=await header.boundingBox(),footer=dialog.locator('footer'),footerInitial=await footer.boundingBox()
  await dialog.locator('.dialog-body').evaluate(e=>e.scrollTop=e.scrollHeight);assert.deepEqual(await header.boundingBox(),initial);assert.deepEqual(await footer.boundingBox(),footerInitial)
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).overflow),'hidden')
  await dialog.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await menu().count(),0);assert.equal(await opener.evaluate(e=>e===document.activeElement),true)
  await openAll();await page.keyboard.press('Escape');assert.equal(await menu().count(),0)
  await openAll();await page.mouse.click(width-12,200);await menu().waitFor({state:'detached'})
  console.log('PASS left-edge drawer, outside tap, one-column full-width rows, header/body scroll, single close, safe viewport',width)
 }
 if(!process.env.MENU_LAYOUT_ONLY){
 await page.setViewportSize({width:390,height:844})
 for(const entry of workspacePages){
  await navigate('/app');await page.getByRole('heading',{name:'빠른 업무'}).waitFor();await openAll()
  const item=menu().locator('.mobile-menu-list > .mobile-menu-item').filter({has:page.locator('span',{hasText:new RegExp('^'+entry.label+'$')})})
  if(!await item.isVisible()) await item.locator('xpath=ancestor::section').locator('.mobile-menu-toggle').click()
  await item.click()
  await menu().waitFor({state:'detached'})
  if(entry.key==='guide'){await page.getByRole('dialog',{name:'이용 가이드',exact:true}).waitFor()}
  else {await page.waitForURL(origin+entry.path);if(entry.path!=='/app'){await page.goBack();await page.waitForURL(origin+'/app')}}
 }
 await navigate('/app/reports/stock');await page.locator('.mobile-header-menu').waitFor();await openAll()
 assert.equal(await menu().getByRole('button',{name:'통계 및 보고서',exact:true}).getAttribute('aria-expanded'),'true')
 assert.equal(await menu().getByRole('button',{name:'재고관리',exact:true}).getAttribute('aria-expanded'),'false')
 assert.equal(await menu().locator('[aria-current=page]:visible').count(),1)
 await menu().getByRole('button',{name:'통계 및 보고서',exact:true}).click()
 assert.equal(await menu().locator('[aria-current=page]:visible').count(),0)
 await menu().getByRole('button',{name:'닫기',exact:true}).click()
 // Reopening reveals the active route; manual collapse remains respected until close.
 await openAll();assert.equal(await menu().getByRole('button',{name:'통계 및 보고서',exact:true}).getAttribute('aria-expanded'),'true')
 assert.equal(await menu().locator('.mobile-menu-toggle[aria-expanded=true]').count(),1)
 await menu().getByRole('button',{name:'닫기',exact:true}).click()
 await navigate('/app/receipts/'+id);await page.locator('.mobile-header-menu').waitFor();await openAll();assert.equal(await menu().locator('[aria-current=page]').textContent(),'입고관리')
 // Long labels wrap within a full-width row without clipping or moving the chevron off screen.
 await menu().locator('.mobile-menu-item > span').first().evaluate(e=>e.textContent='긴 메뉴명 확인 '.repeat(15))
 const long=await menu().locator('.mobile-menu-item').first().evaluate(e=>({height:e.getBoundingClientRect().height,overflow:e.scrollWidth>e.clientWidth,label:e.querySelector('span').getBoundingClientRect(),right:e.getBoundingClientRect().right}))
 assert(long.height>48&&!long.overflow);assert(long.label.right<=long.right)
 await menu().getByRole('button',{name:'닫기',exact:true}).click()
 workspace.role='Employee';workspace.permissions={products:['menu','read']};await navigate('/app/barcode-lookup');await page.locator('.mobile-header-menu').waitFor();await openAll()
 assert.deepEqual(await menu().locator('.mobile-menu-item span').allTextContents(),['상품관리','상품관리','라벨링 출력','바코드 조회','이용 가이드']);assert.deepEqual(await menu().locator('h3').allTextContents(),['주요 메뉴','고객지원'])
 await menu().getByRole('button',{name:'닫기',exact:true}).click()
 workspace.role='Master';workspace.permissions=permissions;
 await page.setViewportSize({width:1440,height:1000});await navigate('/app');await page.locator('.wms-sidebar').waitFor();assert.equal(await page.locator('.mobile-bottom-nav').count(),0);assert.equal(await page.locator('.mobile-all-menu').count(),0);assert.equal(await page.locator('.mobile-header-menu').count(),0)
 assert.deepEqual(errors,[])
 console.log('PASS every authorized menu route, back navigation, guide popup, detail highlight, long labels, restricted permissions, header hamburger, removed dock and unchanged PC sidebar')
 }
}finally{await browser.close()}
