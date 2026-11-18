import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
let origin=process.env.WMS_UI_ORIGIN||'http://localhost:5176'
const id='12345678-1234-1234-1234-123456789012'
let snapshotTime='2026-11-09T05:00:00Z'
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
 await context.routeWebSocket('**/*',()=>{})
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
  if(p==='/dashboard/warehouses/w1')return json({asOf:snapshotTime,warehouse:{id:'w1',name:'모바일 QA 창고',code:'WH01'},racks:[{id:'r1',code:'R01',name:'보관 랙'}],rackTotals:[{rackId:'r1',unit:'EA',quantity:90}],plan:{exists:true,aspectRatio:1.6,objects:[{id:'rack1',type:'rack',rackId:'r1',label:'R01',x:.5,y:.5,width:.2,height:.2,rotation:0,fill:'#ddd'}]},risk:{lowProducts:2,expiryProducts:1,todayReceipts:3,todayShipments:5,counts:{safe:1,warning:0,danger:0,review:0,empty:0},racks:[],detail:null},detail:null})
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


 const dashboardRequests=()=>requests.filter(r=>r.path==='/dashboard/warehouses/w1').length
 const rect=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})
 await page.clock.install()
 for(const width of [360,390,430,768]){
  await page.setViewportSize({width,height:844});await navigate('/app')
  await page.locator('.warehouse-live-map canvas').first().waitFor()
  const headerBar=page.locator('.wms-header'),profile=headerBar.locator('.user-profile-trigger')
  assert.equal((await rect(headerBar)).height,54);assert.equal(await headerBar.locator('.mobile-brand').count(),0)
  assert.equal(await profile.locator(':scope > svg').count(),2)
  const user=await rect(profile.locator('strong')),role=await rect(profile.locator('small'))
  assert(Math.abs(user.y+user.height/2-role.y-role.height/2)<1)
  assert.equal(await profile.locator('small').evaluate(e=>getComputedStyle(e,'::before').content),'"/"')
  const company=headerBar.locator('.wms-company'),logo=company.locator(':scope > svg,:scope > img')
  assert.equal((await rect(logo)).width,26);assert.equal((await rect(logo)).height,26)
  assert((await rect(company)).right<=(await rect(profile)).x)
  await profile.click();await page.getByRole('button',{name:'비밀번호 변경',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.user-profile-panel').count(),0)
  const companyText=company.locator('span'),originalCompany=await companyText.textContent()
  await companyText.evaluate(e=>e.textContent='아이블소프트 아주 긴 기업명 주식회사')
  assert((await rect(company)).right<=(await rect(profile)).x);assert.equal((await rect(headerBar)).height,54)
  await companyText.evaluate((e,text)=>e.textContent=text,originalCompany)
  const refresh=page.getByRole('button',{name:'관제 새로고침'})
  await refresh.waitFor();assert.equal(await refresh.isEnabled(),true)
  const title=page.locator('.dashboard-title-with-warehouse'),name=title.locator('h1'),picker=title.locator('.searchable-choice-trigger'),separator=title.locator(':scope > span')
  const n=await rect(name),p=await rect(picker),slash=await rect(separator),t=await rect(title)
  assert.equal(await separator.innerText(),'/');assert.equal(await separator.isVisible(),true)
  assert(Math.abs(n.y+n.height/2-p.y-p.height/2)<1);assert(p.x>slash.right&&slash.x>n.right);assert(p.right<=width-16)
  assert.equal(t.height,28);assert.equal(p.height,28);assert.equal(await picker.getAttribute('aria-haspopup'),'listbox')
  const header=page.locator('.warehouse-dashboard-heading');assert.equal(await header.evaluate(e=>getComputedStyle(e).rowGap),'0px');assert.equal(await header.evaluate(e=>getComputedStyle(e).marginBottom),'0px')
  const updated=page.locator('.mobile-dashboard-refresh .warehouse-dashboard-updated')
  const info=await rect(updated),hit=await rect(refresh),button={...hit,y:hit.y-10,width:24,height:24,right:hit.x+24,bottom:hit.y+14}
  assert.equal(hit.width,44);assert.equal(hit.height,44)
  assert.equal(await refresh.evaluate(e=>getComputedStyle(e,'::before').width),'24px')
  assert.equal(button.width,24);assert.equal(button.height,24)
  assert(Math.abs(button.x-info.right-6)<1);assert(Math.abs(button.y+12-info.y-info.height/2)<1)
  assert(button.right<=width-16);assert.match(await updated.innerText(),/마지막 갱신 14:0[01]/)
  assert.equal(await refresh.innerText(),'')
  assert.equal(await updated.evaluate(e=>getComputedStyle(e).lineHeight),'13.75px')
  assert.equal((await rect(page.locator('.mobile-dashboard-refresh'))).height,24)
  const nextTitle=await rect(page.locator('.mobile-section-title'))
  assert(nextTitle.y-n.bottom<40,'refresh area visually compact between headings')
  assert.equal(await page.locator('.mobile-section-title').evaluate(e=>getComputedStyle(e).marginTop),'4px')
  const today=page.locator('.dashboard-today-work'),quick=page.locator('.mobile-quick-work')
  assert.equal(await today.locator('button').count(),4);assert.equal(await quick.locator('button').count(),4)
  for(const group of [today,quick.locator(':scope > div')]){
   const rows=group.locator('button'),a=await rect(rows.nth(0)),b=await rect(rows.nth(1)),c=await rect(rows.nth(2))
   assert.equal(a.y,b.y);assert.equal(a.width,b.width);assert(c.y>a.y);assert.equal(b.x-a.right,8)
  }
  for(const card of await today.locator('button').all()){
   const style=await card.evaluate(e=>{const s=getComputedStyle(e);return {padding:s.padding,background:s.backgroundColor,shadow:s.boxShadow,font:getComputedStyle(e.querySelector('strong')).fontSize,height:e.getBoundingClientRect().height}})
   assert.equal(style.padding,'10px 12px');assert.equal(style.background,'rgb(255, 255, 255)');assert.equal(style.shadow,'none');assert.equal(style.font,'18px');assert(style.height<80)
  }
  for(const shortcut of await quick.locator('button').all()){
   assert.equal((await rect(shortcut)).height,44)
   assert.equal(await shortcut.evaluate(e=>getComputedStyle(e).borderRadius),'8px')
   assert.equal(await shortcut.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)')
   assert.equal((await rect(shortcut.locator('svg'))).width,18)
  }
  assert.equal(await page.locator('.warehouse-dashboard .warehouse-map-toolbar').evaluate(e=>getComputedStyle(e).paddingBottom),'4px')
  const controls=page.locator('.dashboard-map-actions button')
  assert.equal(await controls.count(),4)
  for(const control of await controls.all()){
   const b=await rect(control),i=await rect(control.locator('svg'));assert.equal(b.width,33);assert.equal(b.height,33)
   assert(Math.abs(b.x+16.5-i.x-i.width/2)<1);assert(Math.abs(b.y+16.5-i.y-i.height/2)<1)
   assert.equal(await control.evaluate(e=>getComputedStyle(e).borderRadius),'8px')
  }
  const map=page.locator('.warehouse-live-map'),todayRect=await rect(today),quickRect=await rect(quick),mapRect=await rect(map)
  assert(todayRect.bottom<=quickRect.y&&quickRect.bottom<=mapRect.y)
  assert.equal(await page.locator('.mobile-map-toggle').count(),0)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  assert.deepEqual(await today.locator('strong').allTextContents(),['3건','5건','2종','1종'])
  // Long names stay on one line; the existing title tooltip retains the complete name.
  const selectedName=picker.locator('strong'),originalName=await selectedName.textContent()
  await selectedName.evaluate(e=>e.textContent='아주 긴 창고명을 사용하는 아이블 상온 물류 보관 창고')
  assert((await rect(picker)).right<=t.right);assert.equal((await rect(title)).height,t.height)
  await selectedName.evaluate((e,value)=>e.textContent=value,originalName)
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
  assert.equal(await page.locator('.mobile-bottom-nav').count(),0)
  const last=await rect(page.locator('.warehouse-dashboard'))
  assert(844-last.bottom>=16,'last content has safe bottom spacing without a dock')
  assert.equal(await page.locator('.wms-content').evaluate(e=>parseFloat(getComputedStyle(e).paddingBottom)),16)
  const before=dashboardRequests();snapshotTime='2026-11-09T05:01:00Z';await Promise.all([page.waitForResponse(r=>r.url().includes('/dashboard/warehouses/w1')),refresh.click()])
  await page.waitForFunction(()=>document.querySelector('.warehouse-dashboard-updated')?.textContent.includes('14:01'))
  assert(dashboardRequests()>before)
  await page.getByRole('button',{name:'도면 확대',exact:true}).click();await page.getByRole('button',{name:'도면 축소',exact:true}).click();await page.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click()
  if(width===390&&process.env.DASHBOARD_VISUAL){await page.evaluate(()=>window.scrollTo(0,0));console.log('IMAGE:'+(await page.screenshot({type:'jpeg',quality:75})).toString('base64'))}
  console.log('PASS refresh alignment, compact 2-column summaries, section order, always-open map, controls',width)
 }
 const beforePoll=dashboardRequests();await Promise.all([page.waitForResponse(r=>r.url().includes('/dashboard/warehouses/w1')),page.clock.fastForward(15050)])
 assert(dashboardRequests()>beforePoll)
 for(const [label,path] of [['바코드 스캔','/app/barcode-lookup'],['입고 검수','/app/receipts'],['출고 피킹','/app/shipments'],['재고 조회','/app/reports/stock']]){
  await navigate('/app');await page.locator('.mobile-quick-work').getByRole('button',{name:label,exact:true}).click();await page.waitForURL(origin+path)
 }
 await page.setViewportSize({width:1440,height:1000});await navigate('/app');await page.locator('.warehouse-live-map canvas').first().waitFor();await page.evaluate(()=>document.fonts.ready)
 const desktopState=()=>page.evaluate(()=>['.wms-header','.wms-company','.user-profile-trigger','.warehouse-dashboard-heading','.dashboard-today-work','.warehouse-live-map','.warehouse-dashboard-updated','.warehouse-dashboard-controls > button','.wms-sidebar'].map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect(),s=getComputedStyle(e);return {selector,rect:[r.x,r.y,r.width,r.height],padding:s.padding,font:s.font,background:s.backgroundColor}}))
 const desktop=await desktopState()
 assert.equal(await page.locator('.mobile-dashboard-refresh,.mobile-quick-work').count(),0)
 assert.equal(await page.getByRole('button',{name:'관제 새로고침'}).innerText(),'새로고침')
 if(process.env.BASELINE_ORIGIN){origin=process.env.BASELINE_ORIGIN;await navigate('/app');await page.locator('.warehouse-live-map canvas').first().waitFor();await page.evaluate(()=>document.fonts.ready);assert.deepEqual(await desktopState(),desktop)}
 assert.deepEqual(errors,[])
 console.log('PASS 15-second polling, all quick links, desktop layout/styles preserved')
}finally{await browser.close()}
