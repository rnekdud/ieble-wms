import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
let origin=process.env.WMS_UI_ORIGIN||'http://localhost:5176'
const id='12345678-1234-1234-1234-123456789012'
let holdSnapshot,failSnapshot=false
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
 const context=await browser.newContext({hasTouch:true,viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.addInitScript(()=>localStorage.clear())
 await context.routeWebSocket('**/*',()=>{})
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url()),p=u.pathname.replace('/api/tenants/header-qa','')
  assert([origin,process.env.WMS_BASELINE_ORIGIN].includes(u.origin))
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
  if(p==='/warehouses')return json({items:[1,2].map(n=>({warehouse:{id:'w'+n,name:'모바일 QA 창고 '+n,code:'WH0'+n}})),total:2,pageSize:20})
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
  if(p==='/dashboard/warehouses')return json({warehouses:[1,2].map(n=>({id:'w'+n,name:'모바일 QA 창고 '+n,code:'WH0'+n})),asOf:now})
  if(/^\/dashboard\/warehouses\/w[12]$/.test(p)){if(holdSnapshot)await holdSnapshot;if(failSnapshot)return route.fulfill({status:500,json:{message:'QA error'}})}
  if(/^\/dashboard\/warehouses\/w[12]$/.test(p))return json({asOf:snapshotTime,warehouse:{id:p.endsWith('w2')?'w2':'w1',name:'모바일 QA 창고 '+(p.endsWith('w2')?'2':'1'),code:p.endsWith('w2')?'WH02':'WH01'},racks:[{id:'r1',code:'R01',name:'보관 랙'}],rackTotals:[{rackId:'r1',unit:'EA',quantity:90}],plan:{exists:true,aspectRatio:1.6,objects:[{id:'rack1',type:'rack',rackId:'r1',label:'R01',x:.5,y:.5,width:.2,height:.2,rotation:0,fill:'#ddd'}]},risk:{lowProducts:2,expiryProducts:1,todayReceipts:3,todayShipments:5,counts:{safe:1,warning:0,danger:0,review:0,empty:0},racks:[],detail:null},detail:null})
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


 const baseline=process.env.WMS_BASELINE_ORIGIN
 const refresh=()=>page.getByRole('button',{name:'관제 새로고침',exact:true})
 const stats=()=>({list:requests.filter(r=>r.path==='/dashboard/warehouses').length,snapshot:requests.filter(r=>/^\/dashboard\/warehouses\/w[12]$/.test(r.path)).length})
 async function ready(){for(let i=0;i<100;i++){if(await refresh().isEnabled())return;await new Promise(r=>setTimeout(r,20))}throw Error('Refresh not ready')}
 const visual=()=>page.evaluate(()=>{
  const selectors=['.dashboard-summary-heading','.warehouse-dashboard-title','.warehouse-dashboard-updated','.warehouse-dashboard-controls','.warehouse-dashboard-controls > button','.warehouse-dashboard-controls > button svg','.dashboard-today-work','.warehouse-live-map']
  return selectors.map(s=>{const e=document.querySelector(s),b=e.getBoundingClientRect(),c=getComputedStyle(e);const refresh=s==='.warehouse-dashboard-controls > button',visual=getComputedStyle(e,'::before'),expanded=refresh&&visual.content!=='none';return {s,box:{x:b.x,y:expanded?b.y+parseFloat(visual.top):b.y,w:expanded?parseFloat(visual.width):b.width,h:expanded?parseFloat(visual.height):b.height},font:c.font,line:c.lineHeight,gap:c.gap,padding:c.padding,margin:refresh?undefined:c.margin,border:c.border,bg:c.backgroundColor,radius:expanded?visual.borderRadius:c.borderRadius}})
 })
 await page.clock.install()
 for(const width of [360,390,430,768,1440]){
  await page.clock.resume();await page.setViewportSize({width,height:1000});snapshotTime='2026-11-09T05:00:00Z'
  let old
  if(baseline){await page.goto(baseline+'/app');await page.locator('.warehouse-live-map canvas').first().waitFor();await ready();await page.evaluate(()=>document.fonts.ready);old=await visual()}
  await navigate('/app');await page.locator('.warehouse-live-map canvas').first().waitFor();await ready();await page.evaluate(()=>document.fonts.ready);await page.mouse.move(0,0)
  const current=await visual();if(old)assert.deepEqual(current,old,'all visual geometry/styles unchanged '+width)
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))
  if(width===1440){assert.equal(await refresh().evaluate(e=>getComputedStyle(e,'::before').content),'none');console.log('PASS desktop geometry and hit area unchanged');continue}
  const b=await refresh().boundingBox();assert.equal(b.width,44);assert.equal(b.height,44)
  const hit=await refresh().evaluate(e=>{const s=getComputedStyle(e,'::before');return{w:parseFloat(s.width),h:parseFloat(s.height),top:s.top,left:s.left}})
  assert.deepEqual(hit,{w:24,h:24,top:'-10px',left:'0px'})
  const icon=await refresh().locator('svg').boundingBox();assert.equal(icon.width,15);assert.equal(icon.height,15);assert.equal(icon.x+7.5,b.x+12);assert.equal(icon.y+7.5,b.y+2)
  const picker=page.locator('.dashboard-title-with-warehouse .searchable-choice-trigger'),p=await picker.boundingBox()
  assert(p.y+p.height<=b.y,'no overlap with warehouse selector')
  const label=await page.locator('.warehouse-dashboard-updated').boundingBox();assert(label.x+label.width<b.x)
  for(const [x,y] of [[1,1],[22,1],[43,1],[1,22],[43,22],[1,43],[22,43],[43,43],[12,12]]){
   assert(await refresh().evaluate((e,{x,y})=>e.contains(document.elementFromPoint(x,y)),{x:b.x+x,y:b.y+y}),'hit test '+width+' '+x+','+y)
  }
  // Pause polling so each real touchscreen tap can be counted independently.
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));await ready()
  let minute=1
  for(const [x,y] of [[12,2],[43,22],[22,43],[1,43],[43,43],[43,1]]){
   const before=stats();snapshotTime=`2026-11-09T05:${String(minute++).padStart(2,'0')}:00Z`
   await page.touchscreen.tap(b.x+x,b.y+y);await page.clock.runFor(1);await ready();await new Promise(r=>setTimeout(r,50))
   const after=stats();assert.equal(after.list,before.list+1,'list tap '+width+' '+x+','+y+' '+JSON.stringify({before,after,disabled:await refresh().isDisabled(),initialBox:b,currentBox:await refresh().boundingBox(),pickerOpen:await picker.getAttribute('aria-expanded'),target:await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.outerHTML.slice(0,200),{x:b.x+x,y:b.y+y})}));assert.equal(after.snapshot,before.snapshot+1)
   assert.match(await page.locator('.warehouse-dashboard-updated').innerText(),new RegExp('14:'+String(minute-1).padStart(2,'0')))
  }
  // Loading preserves disabled behavior even over the invisible extension.
  let release;holdSnapshot=new Promise(r=>release=r);await page.touchscreen.tap(b.x+43,b.y+43);await page.clock.runFor(1);await new Promise(r=>setTimeout(r,30));assert(await refresh().isDisabled());const held=stats();await page.touchscreen.tap(b.x+43,b.y+43);await page.clock.runFor(1);assert.deepEqual(stats(),held);release();holdSnapshot=undefined;await ready()
  failSnapshot=true;await page.touchscreen.tap(b.x+43,b.y+43);await page.clock.runFor(1);await ready();assert(await page.getByRole('alert').filter({hasText:'갱신하지 못했습니다.'}).isVisible());failSnapshot=false;await page.touchscreen.tap(b.x+43,b.y+43);await page.clock.runFor(1);await ready()
  await refresh().focus();assert(await refresh().evaluate(e=>e===document.activeElement));const keyboard=stats();await page.keyboard.press('Enter');await page.clock.runFor(1);await ready();assert.equal(stats().snapshot,keyboard.snapshot+1)
  // The neighboring warehouse control still owns its bottom edge, opens, and switches warehouses.
  assert(await picker.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.right-2,r.bottom-2))}))
  await picker.click();await page.clock.runFor(300);await page.getByRole('option').filter({hasText:'모바일 QA 창고 2'}).click();await page.clock.runFor(1);await ready();assert.match(await picker.innerText(),/창고 2/)
  const currentWarehouse=stats();await page.touchscreen.tap(b.x+43,b.y+43);await page.clock.runFor(1);await ready();assert.equal(stats().snapshot,currentWarehouse.snapshot+1);assert.equal(requests.filter(r=>/^\/dashboard\/warehouses\/w[12]$/.test(r.path)).at(-1).path,'/dashboard/warehouses/w2')
  // Every refresh restarts the same 15-second timer; test the boundary after the last manual refresh.
  const auto=stats();await page.clock.runFor(14998);assert.deepEqual(stats(),auto);await page.clock.runFor(2);await ready();assert.equal(stats().snapshot,auto.snapshot+1);assert.equal(stats().list,auto.list+1)
  console.log(`PASS ${width}px: 24px visual / 15px icon unchanged; 44px hit area, edge taps once, loading/error/keyboard, adjacent picker, current warehouse and 15s poll`)
 }
 assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
}finally{await browser.close()}
