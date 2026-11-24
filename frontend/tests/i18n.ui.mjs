import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import en from '../src/locales/en/common.json' with {type:'json'}
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://localhost:5176'
const id='12345678-1234-1234-1234-123456789012'
const requests=[];const errors=[],unknown=new Set(),now='2026-11-09T05:00:00Z',empty={items:[],total:0,page:1,pageSize:20}
const employee={userId:'employee',name:'QA 구성원',loginId:'employee001',email:'qa@example.test',role:'Employee',isActive:true,membershipIsActive:true,accountIsActive:true,accountType:'Internal',departmentId:null,positionId:null,permissionGradeId:'Employee',version:'1',registeredAt:now,billingStartsAt:now,billingStartMonth:'2026-11',mustChangePassword:false}
const partner={id:'partner',name:'QA 거래처',code:'PT01',type:'BOTH',isActive:true,version:'1',countryCode:'KR'}
const inquiry={id:'ticket',number:'QA01',title:'QA 문의',category:'Service',status:'Received',createdAt:now,author:'QA 구성원',company:'헤더 QA 기업',version:'1',message:'필수 업무 확인',answer:null,attachments:[],history:[]}
const permissions=Object.fromEntries(workspacePages.map(p=>[p.key,['menu','read','readAll','create','update','delete','confirm','count','manageUsers']]))
const workspace={id:'header-qa',name:'헤더 QA 기업',role:'Master',permissions,serviceStatus:'Active',billingStatus:'Active',billingAccess:{state:'Active',canAccessWms:true,hasRegisteredCard:true,freeUntil:'2027-01-01',firstChargeAt:'2027-01-01'},billingPolicy:{monthlyPerUserKrw:0,monthlyBaseKrw:0,includedUsers:1},canManageBilling:true,latestChange:null}
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
  const product=n=>({id:'p'+n,code:'PR'+n,name:'입고',unit:'EA',isActive:true,version:'v1',hasImage:false})
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
  if(p==='/subscription')return json({providerConfigured:false,billingPolicyVersion:2,trialStartedAt:now,trialEndsAt:'2026-12-01T00:00:00Z',firstChargeAt:'2026-12-01T00:00:00Z',billingAnchorDay:1,billingTimeZone:'Asia/Seoul',paidThrough:null,autoBillingCanceled:false,serviceEndsAt:null,daysUntilFirstCharge:3,currentUsers:10,estimatedMonthlyKrw:10000,firstChargeUsers:10,firstChargeEstimateKrw:10000,reminderVisible:false,access:{state:'Free',hasRegisteredCard:false,canAccessWms:true},invoices:[]})
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
  if(p==='/reports/stock-overview')return json({...empty,items:[{productId:'p1',productCode:'P01',productName:'모바일 재고 상품',unit:'EA',quantity:120,reservedQuantity:20,availableQuantity:100,globalAvailableQuantity:100,safetyStock:null,isActive:true,statuses:['정상'],warehouseId:'w1',warehouseName:'QA 창고'}],total:1,summary:{registeredProducts:0,matchingProducts:0,holdingProducts:0,lowProducts:0,reservedProducts:0},asOf:now,today:'2026-11-09'})
  if(p==='/reports/movement-stats')return json({...empty,summary:{receipts:0,shipments:0,receiptProducts:0,shipmentProducts:0},trend:[],start:'2026-11-01',end:'2026-11-09',today:'2026-11-09'})
  if(['/warehouses','/products','/receipts','/shipments','/partners','/stocktakes','/users','/support','/reports/stock-history','/inventory/movements','/inventory/adjustments'].includes(p))return json({...empty,monthlyPerUserKrw:0})
  if(p==='/api/admin/tenants')return paged(n=>({id:'t'+n,name:'QA 기업 '+n,businessRegistrationNumber:null,createdAt:now,version:'1',isActive:true,billingStatus:'Active',serviceStatus:'Active',userCount:1,estimatedMonthlyKrw:0,billingAccess:{state:'Active'},canReactivate:false,contacts:[]}))
  if(p==='/api/admin/support')return paged(n=>({...inquiry,id:'a'+n,number:'A'+n,title:'관리자 문의 '+n}))
  if(p==='/api/admin/overview')return json({tenantCount:0,activeTenantCount:0,activeUserCount:0,newTenantCount:0,inquiryCount:0,pendingInquiryCount:0})
  unknown.add(p);return json(empty)
 })
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR',m.text())});page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)})
 const selector=()=>({
  waitFor:()=>page.locator('.sidebar-language-trigger:visible,.mobile-header-menu:visible').first().waitFor(),
  inputValue:()=>page.locator('html').getAttribute('lang'),
  selectOption:async code=>{
   const trigger=page.locator('.sidebar-language-trigger:visible').first()
   if(!await trigger.count())await page.locator('.mobile-header-menu').click()
   await trigger.click();await page.getByRole('menuitemradio',{name:code==='en'?'English':'한국어',exact:true}).click()
   if(await page.locator('.mobile-all-menu').count())await page.locator('.mobile-all-menu .dialog-close').click()
  }
 })
 const externalLanguage=code=>page.evaluate(value=>{localStorage.setItem('ieble-wms.language',value);window.dispatchEvent(new StorageEvent('storage',{key:'ieble-wms.language',newValue:value}))},code)
 const routes=(process.env.I18N_LAYOUT_ONLY || process.argv.includes('--dialogs-only')) ? [] : ['/app/products','/app/warehouses','/app/receipts','/app/shipments','/app/inventory/counts','/app/partners','/app/support','/app/reports/stock','/app/reports/movements','/app/reports/history','/app/settings/users','/app/settings/items','/app/settings/company','/app/master/permissions','/app/barcode-lookup','/app/products/new','/app/receipts/new','/app/shipments/new','/app/master/billing']
 await page.goto(origin+'/app/products');await selector().waitFor();await page.waitForLoadState('networkidle');assert.equal(await selector().inputValue(),'ko')
 await page.getByLabel('상품 검색',{exact:true}).fill('메로나 원본');await selector().selectOption('en')
 assert.equal(await page.getByLabel('Search Products',{exact:true}).inputValue(),'메로나 원본')
 assert.equal(await page.locator('html').getAttribute('lang'),'en');await page.reload();assert.equal(await selector().inputValue(),'en')
 const untranslated=new Map()
 for(const path of routes){
  await page.goto(origin+path);await selector().waitFor();await page.waitForLoadState('networkidle')
  if(path==='/app/reports/stock')await page.locator('.stock-overview').waitFor();assert.equal(await page.locator('.app-recovery').count(),0,path)
  const raw=await page.locator('body').evaluate(body=>{const out=[];const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode,p=n.parentElement;if(p&&p.getClientRects().length&&!p.closest('script,style,option,.wms-language,.sidebar-language,.sidebar-language-menu')&&/[가-힣]/.test(n.textContent))out.push(n.textContent.trim())}for(const option of body.querySelectorAll('select:not(.wms-language select) option'))if(option.closest('select')?.getClientRects().length&&/[가-힣]/.test(option.textContent))out.push(option.textContent.trim());return [...new Set(out)]})
  untranslated.set(path,raw)
 }
 const businessText=/^(헤더 QA 기업|헤더 QA|입고|분류|창고(?: \d+)?|거래처(?: \d+)?|실사 \d+|담당자|문의 \d+|QA 구성원|모바일 재고 상품|구성원 \d+|부서 \d+)$/
 for(const [path,raw]of untranslated)assert.deepEqual(raw.filter(x=>!businessText.test(x)),[],path+' contains untranslated UI')
 console.log('PASS English UI text across',untranslated.size,'routes; business text unchanged'); assert.deepEqual(errors,[])
 for(const[path,action]of[['/app/partners','거래처 등록'],['/app/support','문의 등록'],['/app/warehouses','창고 등록']]){
  await page.goto(origin+path);await page.getByRole('button',{name:en[action],exact:true}).click();const dialog=path==='/app/warehouses'?page.locator('.warehouse-workspace-editor'):page.locator('dialog[open]').last();await dialog.waitFor()
  const raw=await dialog.innerText();assert.deepEqual(raw.match(/[^\n]*[가-힣][^\n]*/g)||[],[],path+' dialog translation')
  const field=dialog.locator('input:not([type=hidden]):not([disabled]):not([readonly]):not([type=checkbox]):not([type=radio]):not([type=date]):not([type=file]):not([type=number])').first();await field.fill('원본 유지')
  await externalLanguage('ko');assert.equal(await field.inputValue(),'원본 유지');await dialog.locator('h1,h2,h3').filter({hasText:/[가-힣]/}).first().waitFor()
  await externalLanguage('en');await dialog.locator('h1,h2,h3').filter({hasText:/[가-힣]/}).first().waitFor({state:'hidden'});assert.equal(await field.inputValue(),'원본 유지');console.log('PASS dialog translation and retained input',path)
 }

 for(const[width,height]of[[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/app/products');await selector().waitFor();await page.waitForLoadState('networkidle')
  const m=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,language:[...document.querySelectorAll('.sidebar-language-trigger')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{x:r.x,right:r.right,height:r.height}})}))
  if(m.scroll>width+1)console.log('OVERFLOW',await page.locator('body').evaluate(e=>[...e.querySelectorAll('*')].filter(x=>x.getClientRects().length&&x.getBoundingClientRect().right>innerWidth+1).map(x=>({tag:x.tagName,cls:x.className,text:x.textContent?.slice(0,80),right:x.getBoundingClientRect().right})).slice(-15)));assert(m.scroll<=width+1,JSON.stringify(m));assert(m.language.every(r=>r.x>=0&&r.right<=width&&r.height>=40),JSON.stringify(m));console.log('PASS EN viewport',width,height)
  await page.getByText('입고',{exact:true}).filter({visible:true}).first().waitFor()
  await selector().selectOption('ko');assert.equal(await page.locator('html').getAttribute('lang'),'ko');await selector().selectOption('en')
  for(const path of ['/app/receipts','/app/shipments','/app/partners','/app/products/new','/app/receipts/new','/app/shipments/new','/app/master/billing']) {
   await page.goto(origin+path);await selector().waitFor();await page.waitForLoadState('networkidle')
   const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
   assert.equal(await page.locator('.app-recovery').count(),0,path)
   assert(layout.scroll<=width+1,path+' '+JSON.stringify(layout))
  }
  console.log('PASS English list, registration and billing layouts',width,height)
 }
 assert.deepEqual(errors,[]);console.log('PASS persistence, input state, business data and responsive language selector; mocked APIs only')
}finally{await browser.close()}
