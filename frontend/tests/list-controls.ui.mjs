import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://localhost:5176', audit=process.env.WMS_HEADER_AUDIT==='1'
const id='12345678-1234-1234-1234-123456789012'
const requests=[];const errors=[],unknown=new Set(),now='2026-11-09T05:00:00Z',empty={items:[],total:0,page:1,pageSize:20}
const employee={userId:'employee',name:'QA 구성원',loginId:'employee001',email:'qa@example.test',role:'Employee',isActive:true,membershipIsActive:true,accountIsActive:true,accountType:'Internal',departmentId:null,positionId:null,permissionGradeId:'Employee',version:'1',registeredAt:now,billingStartsAt:now,billingStartMonth:'2026-11',mustChangePassword:false}
const partner={id:'partner',name:'QA 거래처',code:'PT01',type:'BOTH',isActive:true,version:'1',countryCode:'KR'}
const inquiry={id:'ticket',number:'QA01',title:'QA 문의',category:'Service',status:'Received',createdAt:now,author:'QA 구성원',company:'헤더 QA 기업',version:'1',message:'필수 업무 확인',answer:null,attachments:[],history:[]}
const permissions=Object.fromEntries(workspacePages.map(p=>[p.key,['menu','read','readAll','create','update','delete','confirm','count','manageUsers']]))
const workspace={id:'header-qa',name:'헤더 QA 기업',role:'Master',permissions,serviceStatus:'Active',billingStatus:'Active',billingAccess:{state:'Active',canAccessWms:true,hasRegisteredCard:true,freeUntil:'2027-01-01',firstChargeAt:'2027-01-01'},billingPolicy:{monthlyPerUserKrw:0,monthlyBaseKrw:0,includedUsers:1},canManageBilling:false,latestChange:null}
let admin=false
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
  const product=n=>({id:'p'+n,code:'PR'+n,name:process.env.WMS_USAGE_CARDS&&n===1?'길이가 긴 상품명으로 상태 배지와의 겹침을 확인하는 상품':'상품 '+n,unit:'EA',isActive:!process.env.WMS_USAGE_CARDS||n%2===1,version:'v1',hasImage:false})
  const warehouse=n=>({id:'w'+n,code:'WH'+n,name:'창고 '+n,type:'Ambient',isActive:true,version:'v1'})
  const doc=n=>({id:'d'+n,number:'DOC'+n,expectedDate:'2026-11-09',requestDate:'2026-11-09',partnerName:'거래처',warehouseName:'창고',status:'Planned',createdAt:now})
  if(p==='/products')return paged(n=>({product:product(n),categoryName:'분류'}))
  if(p==='/partners')return paged(n=>({...partner,id:'p'+n,name:process.env.WMS_USAGE_CARDS&&n===1?'길이가 긴 거래처 이름으로 상태 표시와 겹침 확인':'거래처 '+n,code:'BP'+n,isActive:!process.env.WMS_USAGE_CARDS||n%2===1}))
  if(p==='/warehouses')return paged(n=>({warehouse:warehouse(n),zoneCount:1,rackCount:1,locationCount:1}),true)
  if(p==='/receipts')return paged(n=>({receipt:doc(n),productCount:1,totals:[{unit:'EA',quantity:n}]}))
  if(p==='/shipments')return paged(n=>({shipment:{...doc(n),status:'Requested'},productCount:1,totals:[{unit:'EA',quantity:n}]}))
  if(p==='/stocktakes')return paged(n=>({document:{...doc(n),name:'실사 '+n,status:'Counting',scope:'Selected',basisAt:now,contactName:'담당자'},productCount:1,targetCount:1,differenceCount:0}),true)
  if(p==='/users'&&process.env.WMS_USER_HEADINGS)return paged(n=>({...employee,userId:'u'+n,name:n===1?'이름이 긴 사용자 검증':'구성원 '+n,loginId:'member'+n,accountType:n%2?'Internal':'External',companyName:'검증 협력사',isActive:n%2===1,mustChangePassword:n===2}))
  if(p==='/users')return paged(n=>({...employee,userId:'u'+n,name:'구성원 '+n,loginId:'member'+n}))
  if(p==='/support')return paged(n=>({...inquiry,id:'q'+n,number:'Q'+n,title:'문의 '+n}))
  if(p==='/activity-log')return paged(n=>({id:n,source:'products',action:'수정',actor:'담당자',changedAt:now}),true)
  if(p==='/inventory')return paged(n=>({id:'s'+n,productId:'p'+n,productCode:'PR'+n,productName:'상품 '+n,warehouseName:'창고',rackCode:'R1',locationCode:'L'+n,unit:'EA',quantity:10,reservedQuantity:0,availableQuantity:10,isActive:true}))
  if(p==='/inventory/history')return paged(n=>({id:'op'+n,number:'OP'+n,type:'Move',productName:'상품',productCode:'P1',sourceLabel:'위치1',destinationLabel:'위치2',quantity:1,unit:'EA',occurredAt:now,reason:'이동',actorName:'담당자'}))
  if(p==='/organization-items'&&process.env.WMS_ITEM_HEADINGS)return json({departments:[{id:'d1',name:'물류본부',parentId:null,sortOrder:1,isActive:true,version:'1',memberCount:2},{id:'d2',name:'입고팀',parentId:'d1',sortOrder:1,isActive:true,version:'1',memberCount:1},{id:'d3',name:'검수파트',parentId:'d2',sortOrder:1,isActive:true,version:'1',memberCount:1}],positions:[{id:'p1',name:'팀장',sortOrder:1,isActive:true,version:'1',memberCount:1}]})
  if(p==='/organization-items'||p==='/users/organization-options')return json({departments:Array.from({length:65},(_,i)=>({id:'d'+i,name:'부서 '+i,isActive:true,version:'v1',sortOrder:i,memberCount:0})),positions:Array.from({length:65},(_,i)=>({id:'p'+i,name:'직급 '+i,isActive:true,version:'v1',sortOrder:i,memberCount:0}))})
  if(p.endsWith('/permission-grades'))return json(Array.from({length:65},(_,i)=>({id:'grade'+i,name:'권한 '+i,isActive:true,isBuiltIn:false,memberCount:0,version:'v1'})))

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
  if(p==='/permissions'&&process.env.WMS_PERMISSION_BAR)return json({version:'1',roles:{Administrator:{products:['menu','read','update']},Employee:{products:['menu','read']}},defaults:{Administrator:{products:['menu','read','update']},Employee:{products:['menu','read']}},features:[{key:'products',label:'상품관리',actions:['menu','read','update'],implementedActions:['menu','read','update'],roleActions:{Administrator:['menu','read','update'],Employee:['menu','read']}}]})
  if(p==='/permissions')return json({roles:{Administrator:{},Employee:{}},defaults:{Administrator:{},Employee:{}},features:[],version:'1'})
  if(p==='/organization-chart'&&process.env.WMS_ORG_TOOLBAR)return json({departments:[{id:'d1',name:'물류팀',parentId:null,isActive:true,sortOrder:1},{id:'d2',name:'입고팀',parentId:'d1',isActive:true,sortOrder:2}],employees:[]})
  if(p==='/organization-chart')return json({departments:[],positions:[],employees:[],users:[],unassigned:[],companyName:workspace.name,totalEmployees:0})
  if(p==='/users')return json({...empty,items:[employee],total:1,monthlyPerUserKrw:0})
  if(p==='/partners')return json({...empty,items:[partner],total:1})
  if(p==='/partners/partner')return json(partner)
  if(p==='/support')return json({...empty,items:[inquiry],total:1})
  if(p==='/support/ticket')return json(inquiry)
  if(p==='/company')return json({company:{id:workspace.id,name:workspace.name,version:'1'},history:[]})
  if(p==='/reports/stock-history'&&!process.env.WMS_HISTORY_MOBILE)return json({...empty,summary:{rows:0,receiptRows:0,shipmentRows:0,operationRows:0,stocktakeRows:0,workCount:0},start:'2026-11-01',end:'2026-11-09',today:'2026-11-09'})
  if(p==='/reports/stock-overview')return json({...empty,...(process.env.WMS_USAGE_CARDS?{items:[{productId:'p1',productCode:'PR1',productName:'긴 상품명을 가진 재고 현황의 상태 배지 확인용 상품',unit:'EA',quantity:100,reservedQuantity:10,availableQuantity:90,globalAvailableQuantity:90,safetyComparable:true,safetyStock:null,isActive:true,statuses:['정상']}],total:1}:{}),summary:{registeredProducts:0,matchingProducts:0,holdingProducts:0,lowProducts:0,reservedProducts:0},asOf:now,today:'2026-11-09'})
  if(p.startsWith('/reports/stock-history')&&process.env.WMS_HISTORY_MOBILE) {
   const row={id:'h1',stockId:'s1',type:'MoveOut',createdAt:now,quantity:-12,unit:'EA',productCode:'PR01',productName:'검증 상품',warehouseName:'검증 창고',rackCode:'R01',locationId:'l1',locationCode:'R01-L01',locationSnapshot:'1단 1칸',lotNumber:'LOT01',serialNumber:'SERIAL01',actorId:'u1',actorName:'검증 담당자',documentKind:'Operation',documentNumber:'MV01',documentLinked:false}
   if(p.endsWith('/h1'))return json({row,document:null,operation:null,countTarget:null,related:[row],total:1,page:1,pageSize:20})
   if(p==='/reports/stock-history')return json({...empty,items:[row],total:1,summary:{rows:1,receiptRows:0,shipmentRows:0,operationRows:1,stocktakeRows:0,workCount:1},start:'2026-11-01',end:'2026-11-09',today:'2026-11-09'})
  }
  if(p==='/reports/movement-stats'&&process.env.WMS_STATS_MOBILE) {
   const view=u.searchParams.get('view'),fact={rowId:'f1',documentId:'d1',number:'IN-QA01',direction:'receipt',confirmedAt:now,actorName:'QA 담당자',productId:'p1',productCode:'PR01',productName:'검증 상품',warehouseName:'검증 창고',partnerName:'검증 거래처',unit:'EA',quantity:12,lotNumber:'LOT01',serialNumber:'SERIAL01'}
   const row={id:'p1',code:'QA01',name:'검증 '+view,categoryName:'식품',partnerType:'BOTH',unit:'EA',receipts:3,shipments:2,receiptProducts:2,shipmentProducts:1,receiptQuantity:12,shipmentQuantity:5,difference:7,lastProcessedAt:now}
   return json({...empty,items:[view==='detail'?fact:row],total:1,summary:{receipts:3,shipments:2,receiptProducts:2,shipmentProducts:1},trend:[{start:'2026-11-01',end:'2026-11-09',receipts:3,shipments:2}],start:'2026-11-01',end:'2026-11-09',today:'2026-11-09'})
  }
  if(p==='/reports/movement-stats')return json({...empty,summary:{receipts:0,shipments:0,receiptProducts:0,shipmentProducts:0},trend:[],start:'2026-11-01',end:'2026-11-09',today:'2026-11-09'})
  if(['/warehouses','/products','/receipts','/shipments','/partners','/stocktakes','/users','/support','/reports/stock-history','/inventory/movements','/inventory/adjustments'].includes(p))return json({...empty,monthlyPerUserKrw:0})
  if(p==='/api/admin/tenants')return paged(n=>({id:'t'+n,name:'QA 기업 '+n,businessRegistrationNumber:null,createdAt:now,version:'1',isActive:true,billingStatus:'Active',serviceStatus:'Active',userCount:1,estimatedMonthlyKrw:0,billingAccess:{state:'Active'},canReactivate:false,contacts:[]}))
  if(p==='/api/admin/support')return paged(n=>({...inquiry,id:'a'+n,number:'A'+n,title:'관리자 문의 '+n}))
  if(p==='/api/admin/overview')return json({tenantCount:0,activeTenantCount:0,activeUserCount:0,newTenantCount:0,inquiryCount:0,pendingInquiryCount:0})
  unknown.add(p);return json(empty)
 })
 const page=await context.newPage();const navigate=path=>page.goto(origin+path,{waitUntil:'domcontentloaded'});page.setDefaultTimeout(12000);page.on('pageerror',e=>{errors.push(e.message);console.log('RENDER ERROR',e.message)})

 if(process.env.WMS_UI_POLISH){
  for(const width of [360,390,430,768,1024,1440,1920]){
   await page.setViewportSize({width,height:900});await navigate('/app/inventory/adjustments')
   const status=page.getByLabel('재고 상태',{exact:true}),active=page.getByLabel('재고 사용 여부',{exact:true});await status.waitFor()
   const a=await status.boundingBox(),b=await active.boundingBox();assert(Math.min(a.x+a.width,b.x+b.width)<=Math.max(a.x,b.x)+1||Math.min(a.y+a.height,b.y+b.height)<=Math.max(a.y,b.y)+1,'inventory filters overlap '+width)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
   if(width>1024){
    const brand=await page.locator('.wms-company').boundingBox(),title=await page.locator('.wms-content h1').first().boundingBox();assert(Math.abs(brand.x-title.x)<1,'header brand aligns with page title '+width)
   }
   await page.locator('.wms-company').evaluate(el=>{const image=document.createElement('img');image.className='wms-company-logo';image.alt='QA logo';el.append(image)})
   assert.equal(await page.locator('.wms-company-logo').evaluate(el=>getComputedStyle(el).borderRadius),'8px')
   await navigate('/app/reports/history');const input=page.getByLabel('재고 이력 검색',{exact:true});await input.waitFor()
   assert.equal(await page.getByLabel('문서번호 검색',{exact:true}).count(),0)
   await input.fill('IN-QA-001');await Promise.all([page.waitForResponse(r=>r.url().includes('/reports/stock-history?')&&new URL(r.url()).searchParams.get('search')==='IN-QA-001'),page.getByRole('button',{name:'검색',exact:true}).click()])
   const request=requests.filter(r=>r.path==='/reports/stock-history').at(-1);assert.equal(request.params.page,'1');assert(!request.params.document)
   console.log('PASS inventory filters, header and unified history query '+width)
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[]);await browser.close();process.exit(0)
 }
 const checkPageSizeFooter=async(path)=>{
  const select=page.locator('.table-page-size select').first();await select.waitFor()
  const layout=await select.evaluate(el=>{
   const footer=el.closest('.wms-pagination'),nav=footer?.querySelector('.wms-pagination-buttons'),r=el.getBoundingClientRect(),n=nav?.getBoundingClientRect(),f=footer?.getBoundingClientRect()
   return {inside:!!footer,select:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height},nav:n&&{x:n.x,y:n.y,right:n.right,bottom:n.bottom},footer:f&&{x:f.x,right:f.right},overflow:document.documentElement.scrollWidth>innerWidth+1}
  })
  assert(layout.inside,path+' selector in pagination');assert.equal(layout.select.height,28,path+' compact height');assert.equal(layout.select.width,72,path+' compact width')
  assert(layout.select.x>=layout.nav.right+7,path+' selector to right of number buttons')
  assert(Math.abs(layout.select.right-layout.footer.right)<2,path+' selector right aligned')
  assert(layout.select.y>=layout.nav.y-2&&layout.select.bottom<=layout.nav.bottom+2,path+' same pagination row')
  assert(!layout.overflow,path+' no horizontal page overflow')
 }
 if(process.env.WMS_PC_PERIOD_ACTIONS){
  const check=async label=>{
   const form=page.locator('.list-search-filters:has(.report-period-fields)').first();await form.waitFor();await page.waitForTimeout(180)
   const geometry=await form.evaluate(form=>{
    const box=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}}
    const inputs=[...form.querySelectorAll('label > input:not([type=date])')].filter(el=>el.getBoundingClientRect().width>0)
    const input=inputs.at(-1),actions=form.querySelector('.list-search-actions'),buttons=[...actions.querySelectorAll('button')]
    return {input:box(input),actions:box(actions),buttons:buttons.map(box),align:getComputedStyle(actions).alignSelf,margin:getComputedStyle(actions).marginTop,label:getComputedStyle(input.parentElement).lineHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}
   })
   if(process.env.WMS_PC_PERIOD_INSPECT) console.log(label,JSON.stringify(geometry))
   else {
    for(const button of geometry.buttons)assert(Math.abs(button.y-geometry.input.y)<1,label+' vertical alignment '+JSON.stringify(geometry))
    assert(Math.abs(geometry.actions.x-geometry.input.right-8)<1,label+' buttons immediately right of search')
    assert(!geometry.overflow,label+' no page overflow')
   }
   await form.getByRole('button',{name:'7일',exact:true}).click()
   assert(await form.locator('input[type=date]').first().inputValue())
   const search=form.locator('label > input:not([type=date])').last();await search.fill('정렬 검증')
   await form.getByRole('button',{name:'검색',exact:true}).click()
   await form.getByRole('button',{name:'초기화',exact:true}).click()
   await page.getByRole('dialog',{name:'필터 초기화'}).getByRole('button',{name:'취소',exact:true}).click()
   assert.equal(await search.inputValue(),'정렬 검증')
   await form.getByRole('button',{name:'초기화',exact:true}).click()
   await page.getByRole('dialog',{name:'필터 초기화'}).getByRole('button',{name:'초기화',exact:true}).click()
   assert.equal(await search.inputValue(),'')
  }
  for(const width of (process.env.WMS_PC_PERIOD_WIDTHS||'1025,1280,1440,1920').split(',').map(Number)){
   await page.setViewportSize({width,height:1000});admin=false
   for(const path of ['/app/receipts','/app/shipments','/app/inventory/counts','/app/master/activity-log','/app/support','/app/reports/movements','/app/reports/history']){await navigate(path);await check(width+' '+path)}
   admin=true;await navigate('/admin');await page.getByRole('navigation',{name:'관리자 업무'}).waitFor()
   for(const menu of ['기업 관리','요금제 및 결제 현황','문의·피드백 관리']){
    const tab=page.getByRole('navigation',{name:'관리자 업무'}).getByRole('button',{name:menu,exact:true});if(await tab.count()){await tab.click();await check(width+' admin '+menu)}
   }
   console.log('PASS PC date-filter search/actions and search/reset '+width+'px')
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 }else if(process.env.WMS_PERMISSION_BAR){
  for(const width of [360,390,430,768,1440]){
   await page.setViewportSize({width,height:1000});await navigate('/app/master/permissions')
   const update=page.getByRole('checkbox',{name:'기업 관리자 상품관리 수정',exact:true});await update.waitFor()
   const bar=page.locator('.permission-viewbar'),save=bar.getByRole('button',{name:'저장',exact:true}),restore=bar.getByRole('button',{name:'안전한 기본값 복원',exact:true})
   const a=await save.boundingBox(),b=await restore.boundingBox(),r=await bar.boundingBox()
   assert(Math.abs(a.y+a.height/2-b.y-b.height/2)<1,'vertical centers')
   assert(Math.abs(b.x-a.x-a.width-8)<2,'save left of restore with 8px gap')
   assert(Math.abs(r.x+r.width-b.x-b.width)<2,'actions right aligned')
   const card=page.locator('.permission-settings').first(),rolebar=page.locator('.permission-role-toolbar'),choice=rolebar.locator('.searchable-choice'),count=rolebar.locator('.permission-change-count')
   const c=await card.boundingBox(),h=await rolebar.boundingBox(),left=await choice.boundingBox(),right=await count.boundingBox()
   assert(Math.abs(h.y-c.y-(left.x-c.x))<2,'top spacing matches left padding')
   assert(left.x+left.width<=right.x,'role and count do not overlap')
   assert(Math.abs(h.x+h.width-right.x-right.width)<2,'change count far right')
   assert.equal(await save.isDisabled(),true);await update.uncheck();assert.equal(await save.isEnabled(),true);await save.click()
   const dialog=page.getByRole('dialog',{name:'권한 변경 확인',exact:true});await dialog.waitFor();assert(await dialog.getByRole('button',{name:'확인 후 저장',exact:true}).isEnabled());await dialog.getByRole('button',{name:'계속 수정',exact:true}).click()
   await update.check();await restore.click();const restoreDialog=page.getByRole('dialog',{name:'안전한 기본값 복원',exact:true});await restoreDialog.waitFor();await restoreDialog.getByRole('button',{name:'취소',exact:true}).click()
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow')
   console.log('PASS permission save toolbar/review: '+width+'px')
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 }else if(process.env.WMS_PERIOD_AUDIT){
  const paths=['/app/receipts','/app/shipments','/app/inventory/counts','/app/reports/movements','/app/reports/history','/app/master/activity-log','/app/support']
  for(const width of (process.env.WMS_PERIOD_WIDTHS||'360,390,430,768,1280,1440').split(',').map(Number)) {
   await page.setViewportSize({width,height:1000})
   const check=async label=>{
    const period=page.locator('.report-period-fields').first();await period.waitFor();await page.waitForTimeout(250)
    const dates=await period.locator('.report-period-range').boundingBox(),tabs=await period.locator('.report-period-tabs').boundingBox()
    const controls=await period.locator('xpath=ancestor::form').evaluate(f=>[...f.querySelectorAll('input,select,button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}}))
    for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert(!(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1),'filter overlap '+width+' '+label)}
    const gap=Math.round(tabs.y-dates.y-dates.height)
    if(gap<0||gap>20||Math.abs(dates.x-tabs.x)>2)console.log('MISPLACED '+width+' '+label+' gap='+gap+' offset='+Math.round(tabs.x-dates.x))
    if(!process.env.WMS_PERIOD_INSPECT){assert(gap>=0&&gap<=20,label+' tabs below dates gap='+gap);assert(Math.abs(dates.x-tabs.x)<2,label+' tabs left aligned')}
    await period.getByRole('button',{name:'7일',exact:true}).click();assert(await period.locator('input[type=date]').first().inputValue(),label+' preset fills dates')
   }
   admin=false
   for(const path of paths){await navigate(path);await check(path)}
   admin=true;await navigate('/admin')
   for(const menu of ['기업 관리','요금제 및 결제 현황','문의·피드백 관리']) {
    const button=page.getByRole('navigation',{name:'관리자 업무'}).getByRole('button',{name:menu,exact:true})
    if(await button.count()){await button.click();await check('admin '+menu)}
   }
   console.log('PASS period placement: '+width+'px')
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 }else if(process.env.WMS_ITEM_HEADINGS){
  for(const width of [360,390,430,768,1440]) {
   await page.setViewportSize({width,height:1000});await navigate('/app/settings/items')
   for(const tab of ['부서 관리','직급 관리','권한 등급 관리']) {
    await page.getByRole('tab',{name:tab,exact:true}).click()
    const table=page.locator(tab==='권한 등급 관리'?'.permission-grades-list':'.organization-items-list'),cell=table.locator('tbody tr td[data-label]').first()
    await cell.waitFor()
    if(width<=600){
     assert.equal(await cell.evaluate(e=>getComputedStyle(e).fontSize),'17px')
     assert.equal(await cell.evaluate(e=>getComputedStyle(e,'::before').display),'none')
     if(tab==='부서 관리') {
      const rows=table.locator('tbody tr'),a=await rows.nth(0).boundingBox(),b=await rows.nth(1).boundingBox(),c=await rows.nth(2).boundingBox()
      assert(b.x>a.x&&c.x>b.x,'nested card indentation')
      assert.equal(await rows.nth(1).evaluate(e=>getComputedStyle(e,'::before').content),'""')
      assert((await rows.nth(1).innerText()).includes('물류본부'),'parent identity preserved')
      if(process.env.WMS_ITEM_VISUAL&&width===390)console.log('IMAGE:'+(await table.screenshot({type:'jpeg',quality:60})).toString('base64'))
     }
    }else {assert.equal(await table.evaluate(e=>getComputedStyle(e).display),'table');if(tab==='부서 관리')assert.equal(await table.locator('.mobile-department-child').first().evaluate(e=>getComputedStyle(e).marginLeft),'0px')}
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width+' '+tab)
   }
   console.log('PASS item headings/department hierarchy: '+width+'px')
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 }else if(process.env.WMS_USER_HEADINGS){
  for(const width of [360,390,430,768,1440]) {
   await page.setViewportSize({width,height:1000});await navigate('/app/settings/users')
   const table=page.locator('.organization-user-table');await table.locator('tbody tr [data-label="이름"]').first().waitFor()
   if(width<=600) {
    for(const n of [0,1]) {
     const row=table.locator('tbody tr').nth(n),name=row.locator('.user-card-name'),badges=row.locator('.user-card-mobile-badges')
     assert.equal(await name.evaluate(e=>getComputedStyle(e).fontSize),'17px')
     const t=await name.boundingBox(),b=await badges.boundingBox(),r=await row.boundingBox()
     assert(Math.abs(t.y-b.y)<2&&r.x+r.width-b.x-b.width<20,'badges upper right')
     assert(t.x+t.width<=b.x,'name/badge overlap')
     assert.equal(await row.locator('[data-label="계정 활성화"]').isVisible(),false)
     const pair=await badges.locator('.badge').all();const a=await pair[0].boundingBox(),z=await pair[1].boundingBox();assert(Math.abs(a.y+a.height/2-z.y-z.height/2)<1,'badge centers')
    }
    assert((await table.locator('tbody tr').nth(1).innerText()).includes('검증 협력사'))
    assert((await table.locator('tbody tr').nth(1).innerText()).includes('비밀번호 변경 필요'))
    if(process.env.WMS_USER_VISUAL&&width===390)console.log('IMAGE:'+(await table.locator('tbody tr').first().screenshot({type:'jpeg',quality:65})).toString('base64'))
   }else {assert.equal(await table.evaluate(e=>getComputedStyle(e).display),'table');assert.equal(await table.locator('.user-card-mobile-badges').first().isVisible(),false)}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width)
   console.log('PASS user name/type/status heading: '+width+'px')
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 }else if(process.env.WMS_ORG_TOOLBAR){
  for(const width of [360,390,430,768,1440]) {
   await page.setViewportSize({width,height:1000});await navigate('/app/settings/organization')
   const toolbar=page.locator('.org-chart-toolbar')
   await page.getByRole('button',{name:'전체 접기',exact:true}).waitFor()
   const buttons=await toolbar.locator('button').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,icon:e.classList.contains('wms-icon-button')}}))
   for(const b of buttons){assert.equal(b.h,36);if(b.icon)assert.equal(b.w,b.h)}
   for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i],b=buttons[j];assert(!(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1),'buttons overlap')}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow')
   await page.getByRole('button',{name:'100% 보기',exact:true}).click();assert.equal(await page.locator('.org-zoom-label').innerText(),'100%')
   await page.getByRole('button',{name:'조직도 확대',exact:true}).click();assert.equal(await page.locator('.org-zoom-label').innerText(),'110%')
   await page.getByRole('button',{name:'조직도 축소',exact:true}).click();assert.equal(await page.locator('.org-zoom-label').innerText(),'100%')
   await page.getByRole('button',{name:'전체 접기',exact:true}).click();await page.getByRole('button',{name:'전체 펼치기',exact:true}).click()
   await page.getByRole('button',{name:'전체 화면 맞춤',exact:true}).click()
   if(process.env.WMS_ORG_VISUAL&&width===390)console.log('IMAGE:'+(await toolbar.screenshot({type:'jpeg',quality:70})).toString('base64'))
   console.log('PASS organization toolbar alignment/actions: '+width+'px')
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 }else if(process.env.WMS_HISTORY_MOBILE){
  for(const width of [360,390,430,768,1440]) {
   await page.setViewportSize({width,height:1000});await navigate('/app/reports/history')
   const mobile=width<=1024,record=page.locator(mobile?'.history-mobile-list article':'.history-table tbody tr').first()
   await record.waitFor();assert.equal(await page.getByRole('button',{name:'새로 조회',exact:true}).count(),0)
   if(mobile) {
    const toggle=page.getByRole('button',{name:'상세 필터',exact:true});assert.equal(await toggle.getAttribute('aria-expanded'),'false')
    assert.equal(await page.locator('#history-filters').isVisible(),false)
    await toggle.click();assert(await page.locator('#history-filters').isVisible());await toggle.click()
    assert.equal(await page.locator('.overview-summary p').first().isVisible(),false)
    assert((await record.innerText()).includes('-12 EA'))
   } else {assert(await page.locator('#history-filters').isVisible());assert.equal(await page.locator('.history-mobile-list').count(),0)}
   const controls=await page.locator('#stock-history-filters').evaluate(f=>[...f.querySelectorAll('input,select,button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}}))
   for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert(!(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1),'filter overlap '+width)}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+width)
   await record.getByRole('button').click();await page.getByRole('dialog',{name:'재고 변동 상세',exact:true}).getByText('원본 업무 문서',{exact:false}).waitFor()
   await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click()
   await page.getByRole('textbox',{name:'재고 이력 검색',exact:true}).fill('검증')
   await Promise.all([page.waitForResponse(r=>r.url().includes('/reports/stock-history?')&&new URL(r.url()).searchParams.get('search')==='검증'),page.getByRole('button',{name:'검색',exact:true}).click()])
   assert.equal(requests.filter(r=>r.path==='/reports/stock-history').at(-1).params.page,'1')
   if(process.env.WMS_HISTORY_VISUAL&&width===390)console.log('IMAGE:'+(await page.locator('.stock-history').screenshot({type:'jpeg',quality:60})).toString('base64'))
   console.log('PASS history cards/filter/detail: '+width+'px')
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 }else if(process.env.WMS_STATS_MOBILE){
  for(const width of [360,390,430,768,1440]) {
   await page.setViewportSize({width,height:1000});await navigate('/app/reports/movements')
   const mobile=width<=1024
   await page.locator(mobile?'.stats-mobile-list article':'.stats-table tbody tr').first().waitFor()
   assert.equal(await page.getByRole('button',{name:'새로 조회',exact:true}).count(),0)
   if(mobile) {
    const toggle=page.getByRole('button',{name:'상세 필터',exact:true});assert.equal(await toggle.getAttribute('aria-expanded'),'false')
    assert.equal(await page.locator('#stats-filters').isVisible(),false)
    await toggle.click();assert(await page.locator('#stats-filters').isVisible());await toggle.click()
    const summary=await page.locator('.overview-summary').boundingBox(),filters=await page.locator('.stats-filter-row').boundingBox()
    assert(summary.y+summary.height<=filters.y,'summary before filters')
    assert.equal(await page.locator('.overview-summary p').first().isVisible(),false)
   } else {assert(await page.locator('#stats-filters').isVisible());assert.equal(await page.locator('.stats-mobile-list').count(),0)}
   for(const label of ['상품별 통계','창고별 통계','거래처별 통계','상세 내역']) {
    await page.getByRole('button',{name:label,exact:true}).click()
    await page.locator(mobile?'.stats-mobile-list article':'.stats-table tbody tr').first().waitFor()
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page overflow '+width+' '+label)
   }
   if(mobile) {
    await page.locator('.stats-mobile-actions button').first().click();await page.getByRole('dialog',{name:'입출고 실적 상세',exact:true}).waitFor()
    await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click()
   }
   await page.getByRole('textbox',{name:'입출고 통계 검색',exact:true}).fill('검증')
   await Promise.all([page.waitForResponse(r=>r.url().includes('/reports/movement-stats?')&&new URL(r.url()).searchParams.get('search')==='검증'),page.getByRole('button',{name:'검색',exact:true}).click()])
   assert.equal(requests.filter(r=>r.path==='/reports/movement-stats').at(-1).params.page,'1')
   if(process.env.WMS_STATS_VISUAL&&width===390)console.log('IMAGE:'+(await page.locator('.movement-stats').screenshot({type:'jpeg',quality:60})).toString('base64'))
   console.log('PASS stats responsive views/filter/detail: '+width+'px')
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 }else if(process.env.WMS_STOCKTAKE_HEADINGS){
  for(const width of [360,390,430,768,1440]) {
   await page.setViewportSize({width,height:1000});await navigate('/app/inventory/counts')
   const form=page.locator('.stocktake-search-filters'),table=page.locator('.stocktake-list'),row=table.locator('tbody tr').first(),title=row.locator('[data-label="실사번호"]')
   await title.waitFor();await page.waitForTimeout(80)
   if(width<768) {
    const dates=await form.locator('.report-period-range').boundingBox(),tabs=await form.locator('.report-period-tabs').boundingBox(),status=await form.locator('select').boundingBox()
    assert(tabs.y>=dates.y+dates.height&&tabs.y+tabs.height<=status.y,'period directly below dates')
   }
   if(width<=600) {
    const t=await title.boundingBox(),b=await row.locator('[data-label="진행 상태"] .status-badge').boundingBox(),r=await row.boundingBox()
    assert.equal(await title.locator('strong').evaluate(e=>getComputedStyle(e).fontSize),'17px')
    assert.equal(await title.evaluate(e=>getComputedStyle(e,'::before').display),'none')
    assert(Math.abs(t.y-b.y)<2&&r.x+r.width-b.x-b.width<20,'status upper right')
    if(process.env.WMS_STOCKTAKE_VISUAL&&width===390)for(const el of [form,row])console.log('IMAGE:'+(await el.screenshot({type:'jpeg',quality:65})).toString('base64'))
   } else assert.equal(await table.evaluate(e=>getComputedStyle(e).display),'table')
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+width)
   console.log('PASS stocktake period/card headings: '+width+'px')
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 }else if(process.env.WMS_INVENTORY_HEADINGS){
  for(const width of [360,390,430,768,1440]) {
   await page.setViewportSize({width,height:1000});await navigate('/app/inventory/adjustments')
   for(const history of [false,true]) {
    if(history)await page.getByRole('button',{name:'이동·조정 내역',exact:true}).click()
    const table=page.locator(history?'.inventory-history-list-table':'.inventory-table'),row=table.locator('tbody tr').first()
    const title=row.locator(history?'[data-label="처리번호 / 일시"]':'[data-label="상품명"]')
    await title.waitFor();await page.waitForTimeout(80)
    if(width<=600) {
     assert.equal(await title.evaluate(e=>getComputedStyle(e).fontSize),'17px')
     assert.equal(await title.evaluate(e=>getComputedStyle(e,'::before').display),'none')
     const t=await title.boundingBox(),r=await row.boundingBox()
     assert(t.y-r.y<20,'heading at card top')
     if(history) {
      const badge=row.locator('[data-label="구분"] .status-badge'),b=await badge.boundingBox()
      assert(Math.abs(t.y-b.y)<2&&r.x+r.width-b.x-b.width<20,'type upper right')
      assert.equal(await row.locator('[data-label="구분"]').evaluate(e=>getComputedStyle(e,'::before').display),'none')
     } else {
      const code=await row.locator('[data-label="상품코드"]').boundingBox();assert(code.y>=t.y+t.height,'product title before code')
     }
     if(process.env.WMS_INVENTORY_VISUAL&&width===390) console.log('IMAGE:'+(await row.screenshot({type:'jpeg',quality:65})).toString('base64'))
    } else assert.equal(await table.evaluate(e=>getComputedStyle(e).display),'table')
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+width)
   }
   console.log('PASS inventory card headings: '+width+'px')
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 }else if(process.env.WMS_RECEIPT_LAYOUT||process.env.WMS_SHIPMENT_LAYOUT){
  const kind=process.env.WMS_SHIPMENT_LAYOUT?'shipment':'receipt',label=kind==='shipment'?'출고':'입고',path='/app/'+kind+'s',endpoint='/'+kind+'s'

  for(const width of (process.env.WMS_RECEIPT_WIDTHS||'360,390,430,768,1440').split(',').map(Number)) {
   await page.setViewportSize({width,height:1000});await navigate(path)
   const form=page.locator('.'+kind+'-list-filters'),row=page.locator('.'+kind+'-list-table tbody tr').first()
   await row.locator(`[data-label="${label}번호"]`).waitFor();await page.waitForTimeout(100)
   const controls=await form.evaluate(f=>[...f.querySelectorAll('input,select,button')].filter(el=>el.getBoundingClientRect().width>0).map(el=>{const r=el.getBoundingClientRect();return {name:el.getAttribute('aria-label')||el.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom}}))
   for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++) {
    const a=controls[i],b=controls[j];assert(!(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1),`${width} filter overlap: ${JSON.stringify([a,b])}`)
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} overflow`)
   const title=row.locator(`[data-label="${label}번호"]`),status=row.locator('[data-label="상태"] .status-badge')
   if(width<=600) {
    const t=await title.boundingBox(),b=await status.boundingBox(),r=await row.boundingBox()
    assert.equal(await title.evaluate(e=>getComputedStyle(e).fontSize),'17px')
    assert.equal(await title.evaluate(e=>getComputedStyle(e,'::before').display),'none')
    const actions=row.locator('[data-label="관리"]'),button=actions.getByRole('button').first()
    assert.equal(await actions.evaluate(e=>getComputedStyle(e,'::before').display),'none')
    const a=await actions.boundingBox(),action=await button.boundingBox()
    assert(Math.abs(a.x+a.width-action.x-action.width)<2,'action right aligned')
    assert(action.y>t.y,'action below heading')
    assert(Math.abs(t.y-b.y)<2&&r.x+r.width-b.x-b.width<20,`${width} heading/status alignment`)
   } else assert.equal(await page.locator('.'+kind+'-list-table').evaluate(e=>getComputedStyle(e).display),'table')
   if(process.env.WMS_RECEIPT_VISUAL && width===390) {console.log('IMAGE:'+(await form.screenshot({type:'jpeg',quality:65})).toString('base64'));console.log('IMAGE:'+(await row.screenshot({type:'jpeg',quality:65})).toString('base64'))}
   console.log('PASS '+kind+' filters/card header/actions: '+width+'px')
  }
  await page.getByRole('textbox',{name:label+' 검색',exact:true}).fill('입고 QA')
  await Promise.all([page.waitForResponse(r=>r.url().includes(endpoint+'?')&&new URL(r.url()).searchParams.get('search')==='입고 QA'),page.getByRole('button',{name:'검색',exact:true}).click()])
  assert.equal(requests.filter(r=>r.path===endpoint).at(-1).params.page,'1')
  await page.getByRole('button',{name:'초기화',exact:true}).click();await page.getByRole('dialog',{name:'필터 초기화',exact:true}).getByRole('button',{name:'초기화',exact:true}).click()
  assert.equal(await page.getByRole('textbox',{name:label+' 검색',exact:true}).inputValue(),'')
  await page.setViewportSize({width:390,height:1000})
  for(const other of ['/app/receipts','/app/shipments','/app/inventory/counts','/app/inventory/adjustments','/app/partners']) {
   await navigate(other)
   const actions=page.locator('.mobile-record-table tbody td:is([data-label="관리"],[data-label="상세 보기"])').first()
   await actions.getByRole('button').first().waitFor()
   assert.equal(await actions.evaluate(e=>getComputedStyle(e,'::before').display),'none',other+' no action label')
   const a=await actions.boundingBox(),b=await actions.getByRole('button').first().boundingBox()
   assert(Math.abs(a.x+a.width-b.x-b.width)<2,other+' action right aligned')
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 }else if(process.env.WMS_USAGE_CARDS){
  const cases=[['/app/products',null,'.products-mobile-item','.products-mobile-status'],['/app/partners',null,'.mobile-management-table tbody tr','.partner-card-status'],['/app/settings/items','부서 관리','.mobile-management-table tbody tr','.mobile-usage-badge'],['/app/settings/items','직급 관리','.mobile-management-table tbody tr','.mobile-usage-badge'],['/app/settings/items','권한 등급 관리','.mobile-management-table tbody tr','.mobile-usage-badge'],['/app/reports/stock',null,'.mobile-stock-card','.mobile-usage-badge'],['/app/warehouses',null,'.warehouse-directory-item','.warehouse-status']]
  for(const width of (process.env.WMS_USAGE_WIDTHS||'360,390,430,768,1440').split(',').map(Number)) {
   await page.setViewportSize({width,height:1000})
   for(const [path,tab,cardSelector,badgeSelector] of cases) {
    await navigate(path);if(tab)await page.getByRole('tab',{name:tab,exact:true}).click()
    await page.locator('.table-page-size select').first().waitFor();await page.waitForTimeout(120)
    const card=page.locator(cardSelector).first(),badge=card.locator(badgeSelector)
    const mobile=path==='/app/products'?width<768:path==='/app/reports/stock'?width<=1024:path==='/app/warehouses'?true:width<=600
    if(mobile) {
     await badge.waitFor();const c=await card.boundingBox(),b=await badge.boundingBox()
     assert(b.y>=c.y&&b.y-c.y<(path==='/app/warehouses'?60:25),`${width} ${path} ${tab}: badge top`)
     assert(c.x+c.width-b.x-b.width<=(path==='/app/warehouses'?30:23),`${width} ${path} ${tab}: badge right`)
     if(path==='/app/products') {
      assert.equal(await card.locator('dt').filter({hasText:'사용여부'}).count(),0)
      const checkbox=card.getByRole('checkbox');await checkbox.check();assert(await checkbox.isChecked())
      const cb=await checkbox.boundingBox();assert(cb.y>=b.y+b.height,'checkbox below badge')
     }
     if(process.env.WMS_USAGE_VISUAL&&width===390&&['/app/products','/app/partners','/app/reports/stock'].includes(path))console.log('IMAGE:'+(await card.screenshot({type:'jpeg',quality:65})).toString('base64'))
    } else {
     await page.locator('.wms-content table:visible').first().waitFor().catch(e=>{console.log('Desktop table check',width,path,tab);throw e})
     assert.equal(await page.locator('.wms-content table:visible').first().evaluate(e=>getComputedStyle(e).display),'table')
     if(await badge.count())assert.equal(await badge.evaluate(e=>getComputedStyle(e.parentElement).position),'static')
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${path} overflow`)
   }
   console.log('PASS usage badge placement/selection/desktop '+width+'px')
  }
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 }else if(process.env.WMS_FILTER_ORDER){
  const paths=['/app/products','/app/partners','/app/warehouses','/app/receipts','/app/shipments','/app/inventory/counts','/app/inventory/adjustments','/app/settings/users','/app/support','/app/master/activity-log','/app/reports/stock','/app/reports/movements','/app/reports/history','/app/master/permissions']
  for(const width of (process.env.WMS_FILTER_WIDTHS||'360,390,430,768,1440').split(',').map(Number)) {
   await page.setViewportSize({width,height:1000})
   for(const path of paths) {
    await navigate(path)
    const form=page.locator('.list-search-filters').first();await form.waitFor()
    await page.waitForTimeout(120)
    const toggle=form.getByRole('button',{name:'상세 필터',exact:true});if(await toggle.isVisible())await toggle.click()
    const results=await form.evaluate(form=>{
     const visible=el=>el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0
     const selects=[...form.querySelectorAll('select,.searchable-choice-trigger')].filter(visible)
     const inputs=[...form.querySelectorAll('label > input:not([type=date])')].filter(visible)
     const before=(a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.top<y.top-2||(Math.abs(x.top-y.top)<2&&x.right<=y.left+1)}
     return {order:selects.every(a=>inputs.every(b=>before(a,b))),dom:selects.every(a=>inputs.every(b=>Boolean(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING))),fields:[...selects,...inputs].map(e=>({name:e.getAttribute('aria-label')||e.closest('label')?.textContent,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.getBoundingClientRect().width}))}
    })
    assert(results.order,`${width} ${path} visual order: ${JSON.stringify(results.fields)}`)
    assert(results.dom,`${width} ${path} keyboard order`)
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${path} overflow`)
    if(process.env.WMS_FILTER_VISUAL && width===390 && ['/app/products','/app/reports/stock'].includes(path))console.log('IMAGE:'+(await form.screenshot({type:'jpeg',quality:60})).toString('base64'))
   }
   console.log('PASS select-before-search: '+width+'px, '+paths.length+' pages')
  }
  await navigate('/app/receipts');const search=page.getByRole('textbox',{name:'입고 검색',exact:true});await search.fill('필터 순서 QA')
  await Promise.all([page.waitForResponse(r=>r.url().includes('/receipts?')&&new URL(r.url()).searchParams.get('search')==='필터 순서 QA'),page.getByRole('button',{name:'검색',exact:true}).click()])
  assert.equal(requests.filter(r=>r.path==='/receipts').at(-1).params.page,'1')
  await page.getByRole('button',{name:'초기화',exact:true}).click();await page.getByRole('dialog',{name:'필터 초기화',exact:true}).getByRole('button',{name:'초기화',exact:true}).click();assert.equal(await search.inputValue(),'')
  assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
  console.log('PASS search/reset and read-only API requests')
 }else if(process.env.WMS_LIST_VISUAL){
  for(const [width,path] of [[1280,'/app/reports/movements'],[390,'/app/receipts']]){await page.setViewportSize({width,height:750});await navigate(path);await page.locator('.table-page-size select').first().waitFor();await page.waitForTimeout(300);console.log('IMAGE:'+ (await page.screenshot()).toString('base64'))}
 }else{
 const cases=[['/app/products','/products'],['/app/partners','/partners'],['/app/warehouses','/warehouses'],['/app/receipts','/receipts'],['/app/shipments','/shipments'],['/app/inventory/counts','/stocktakes'],['/app/inventory/adjustments','/inventory'],['/app/settings/users','/users'],['/app/support','/support'],['/app/master/activity-log','/activity-log'],['/app/reports/stock','/reports/stock-overview'],['/app/reports/movements','/reports/movement-stats'],['/app/reports/history','/reports/stock-history'],['/app/settings/items',null]]
 const rows=()=>page.locator('.wms-content table tbody tr,.warehouse-directory-grid > article')
 if(!process.env.WMS_LIST_LAYOUT_ONLY){
 for(const [path,endpoint] of cases){
  await navigate(path);const select=page.locator('.table-page-size select').first();await select.waitFor().catch(async e=>{console.log(await page.locator('body').innerText());throw e});assert.equal(await select.inputValue(),'20',path)
  const box=await select.boundingBox();assert.equal(box.height,28);assert(box.width<100)
  assert.equal(await select.locator('..').locator('span').textContent(),'표시건수')
  const mainTable=page.locator('.wms-content table,.warehouse-directory-grid').first();await mainTable.waitFor();const a=await select.boundingBox(),b=await mainTable.boundingBox();assert(a.y>=b.y+b.height,path+' selector below table');await checkPageSizeFooter(path)
  const before=requests.length;await select.selectOption('50');await page.waitForTimeout(400)
  assert.equal(await select.inputValue(),'50');
  if(endpoint){const reads=requests.slice(before).filter(r=>r.path===endpoint);assert(reads.length,path+' refetches');assert.equal(reads[0].params.page,'1');if(['/warehouses','/stocktakes','/activity-log'].includes(endpoint))assert.deepEqual(reads.map(r=>+r.params.page),[1,2,3]);else assert.equal(reads.at(-1).params.pageSize,'50')}
  if(endpoint&&!endpoint.startsWith('/reports/')){
   await page.waitForFunction(()=>document.querySelectorAll('.wms-content table tbody tr,.warehouse-directory-grid > article').length===50)
   await page.getByRole('button',{name:'2페이지',exact:true}).click();await page.waitForTimeout(350);assert.equal(await rows().count(),50,path+' second page count')
   assert.match(await page.locator('.wms-pagination-summary').innerText(),/51–100/)
   await select.selectOption('100');await page.waitForTimeout(350);assert.equal(await rows().count(),100,path+' size change resets page');assert.match(await page.locator('.wms-pagination-summary').innerText(),/1–100/)
  }else if(!endpoint){assert.equal(await rows().count(),50);await page.getByRole('tab',{name:'직급 관리',exact:true}).click();assert.equal(await rows().count(),50);await page.getByRole('tab',{name:'권한 등급 관리',exact:true}).click();await page.locator('.table-page-size select').selectOption('50');await page.waitForFunction(()=>document.querySelectorAll('.wms-content table tbody tr').length===50);assert.equal(await rows().count(),50)}
  console.log('PASS page size',path)
 }
 // Secondary list tabs and system-admin lists use the same sizing control.
 await navigate('/app/inventory/adjustments');await page.getByRole('button',{name:'이동·조정 내역',exact:true}).click();await page.locator('.table-page-size select').selectOption('50');await page.waitForFunction(()=>document.querySelectorAll('.inventory-table').length===0&&document.querySelectorAll('.wms-content table tbody tr').length===50)
 await navigate('/app/master/permissions');await page.locator('.table-page-size select').selectOption('50');await page.waitForFunction(()=>document.querySelector('.permission-settings:has(.table-page-size) table tbody')?.children.length===50)
 admin=true;await navigate('/admin');await page.getByRole('navigation',{name:'관리자 업무'}).getByRole('button',{name:'기업 관리',exact:true}).click();await page.locator('.table-page-size select').selectOption('50');await page.waitForFunction(()=>document.querySelectorAll('.tenant-table tbody tr').length===50)
 await page.getByRole('navigation',{name:'관리자 업무'}).getByRole('button',{name:'문의·피드백 관리',exact:true}).click();await page.locator('.table-page-size select').selectOption('50');await page.waitForFunction(()=>document.querySelectorAll('.support-table tbody tr').length===50)
 admin=false;console.log('PASS inventory history, user permissions, admin tenant and inquiry list sizes')
 // Search applies the chosen size and resets the page without mixing draft filters.
 await navigate('/app/receipts');await page.locator('.table-page-size select').selectOption('50');await page.waitForTimeout(350);await page.getByRole('button',{name:'2페이지',exact:true}).click();await page.getByRole('textbox',{name:'입고 검색',exact:true}).fill('테스트');await page.getByRole('button',{name:'검색',exact:true}).click();await page.waitForTimeout(350)
 const searchRead=requests.filter(r=>r.path==='/receipts').at(-1);assert.equal(searchRead.params.search,'테스트');assert.equal(searchRead.params.page,'1');assert.equal(searchRead.params.pageSize,'50')
 }
 for(const width of [360,390,430,768,1440,1920]){
  await page.setViewportSize({width,height:1000})
  for(const path of ['/app/receipts','/app/shipments','/app/inventory/counts','/app/support','/app/master/activity-log','/app/reports/movements','/app/reports/history']){
   await navigate(path);const select=page.locator('.table-page-size select').first();await select.waitFor();await page.waitForTimeout(200)
   const rect=await select.boundingBox();assert.equal(rect.height,28);assert(rect.x>=0&&rect.x+rect.width<=width)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${path} page overflow`)
   await checkPageSizeFooter(path)
   if(width>=1280&&!process.env.WMS_PAGINATION_ONLY){const fields=await page.locator('.list-search-filters input,.list-search-filters > label select,.list-search-filters .searchable-choice-trigger,.list-search-actions button').all();const bounds=[];for(const el of fields){if(await el.isVisible())bounds.push(await el.boundingBox())}assert(bounds.every(b=>Math.abs(b.y-bounds[0].y)<1),`${width} ${path} filters not inline: ${JSON.stringify(bounds.map(b=>({x:b.x,y:b.y,w:b.width})))}`)}
  }
  console.log('PASS responsive list controls',width)
 }
 assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 console.log('PASS page-size controls, fixed-server-page windows, first-page reset, compact pagination-right UI. Read-only mocked APIs.')
 }
}finally{await browser.close()}
