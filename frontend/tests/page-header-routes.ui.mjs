import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176', audit=process.env.WMS_HEADER_AUDIT==='1'
const id='12345678-1234-1234-1234-123456789012'
const errors=[],unknown=new Set(),now='2026-11-09T05:00:00Z',empty={items:[],total:0,page:1,pageSize:20}
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
 const cases=[...workspacePages,...['products','receipts','shipments','inventory/counts'].flatMap(name=>[{path:'/app/'+name+'/new'},{path:'/app/'+name+'/'+id}]),{path:'/app/warehouses?warehouseId=w1'}]
 async function checkHeader(label){
  const result=await page.locator('.wms-content').evaluate(main=>{const h=main.querySelector('.wms-page-header'),t=h.querySelector('h1,h2'),b=main.querySelector('.wms-breadcrumb');const shell=h.parentElement.matches('.simple-stocktake-heading,.dashboard-heading')?h.parentElement:h;let next=shell.nextElementSibling; const r=t.getBoundingClientRect(),c=b.getBoundingClientRect();return{title:t.textContent,description:h.querySelector('p')?.textContent||'',gap:r.y-c.bottom,left:r.x-c.x,bodyGap:next?next.getBoundingClientRect().y+(next.matches('.detail-content')?parseFloat(getComputedStyle(next).paddingTop):0)-shell.getBoundingClientRect().bottom:null,body:main.innerText,headerClass:h.className}})
  assert.equal(result.description,'',label)
  if(!audit){assert(Math.abs(result.gap-5)<.6,`${label}: breadcrumb gap ${result.gap}`);assert(Math.abs(result.left)<.6,`${label}: left ${result.left}`);if(result.bodyGap!==null)assert(result.bodyGap>=16&&result.bodyGap<=20,`${label}: body gap ${result.bodyGap}`)}
  console.log(label,JSON.stringify({...result,body:undefined}))
  assert(!result.body.includes('창고와 구역·랙·보관 위치를 관리하세요.'))
  assert(!result.body.includes('내부 직원과 외부 협력사의 계정·소속·활성 상태를 관리하세요.'))
 }
 for(const item of cases){
  await navigate(item.path);await page.locator('.wms-page-header h1,.wms-page-header h2').first().waitFor().catch(async e=>{console.log('FAILED ROUTE',item.path,await page.locator('body').innerText());throw e});await page.waitForTimeout(350)
  await checkHeader(item.path)
 }
 // Native in-page warehouse editing retains its breadcrumb and title alignment.
 await navigate('/app/warehouses');await page.getByRole('button',{name:'창고 등록',exact:true}).click();await page.getByRole('heading',{name:'새 창고 만들기',exact:true}).waitFor();await checkHeader('창고 등록')
 await navigate('/app/warehouses?warehouseId=w1');await page.getByRole('button',{name:'창고·도면 함께 수정',exact:true}).click();await page.getByRole('heading',{name:'창고 정보 수정',exact:true}).waitFor();await checkHeader('창고 수정')
 async function dialogCheck(){const d=page.getByRole('dialog');await d.waitFor();assert.equal(await d.locator('.organization-dialog-heading p').count(),0);assert.equal(await d.locator('.wms-breadcrumb').count(),0);return d}
 for(const [path,button] of [['/app/settings/users','사용자 등록'],['/app/settings/users','QA 구성원 수정'],['/app/partners','거래처 등록'],['/app/partners','QA 거래처 상세'],['/app/support','문의 등록'],['/app/support','상세']]){
  await navigate(path);await page.getByRole('button',{name:button,exact:true}).click();const d=await dialogCheck();
  if(path.includes('users')){assert.equal(await d.getByRole('textbox',{name:'비밀번호',exact:true}).inputValue(),'자동 생성 · 직접 입력 불가');assert(await d.getByText(/초기 비밀번호는 로그인 아이디/).isVisible())}
  if(button==='QA 거래처 상세'){await d.getByRole('button',{name:'거래처 수정',exact:true}).click();await dialogCheck()}
  console.log('PASS dialog',button)
 }
 await navigate('/app/settings/items');await page.getByRole('tab',{name:'권한 등급 관리',exact:true}).click();await page.getByRole('button',{name:'권한 등급 추가',exact:true}).click();await dialogCheck()
 // Sidebar navigation uses the real app router; no page replacement fixture.
 await navigate('/app/warehouses');await page.getByRole('link',{name:'상품관리',exact:true}).click();await page.getByRole('heading',{name:'상품관리',exact:true}).waitFor();await checkHeader('사이드바 상품관리')
 await page.getByRole('button',{name:'조직관리',exact:true}).click();await page.getByRole('link',{name:'사용자 관리',exact:true}).click();await page.getByRole('heading',{name:'사용자 관리',exact:true}).waitFor();await checkHeader('사이드바 사용자 관리')
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});for(const path of ['/app/warehouses','/app/settings/users','/app/products/new','/app/receipts/'+id,'/app/inventory/counts','/app/support']){
   await navigate(path);await page.locator('.wms-page-header h1,.wms-page-header h2').first().waitFor();await page.waitForTimeout(350);await checkHeader(`${width}px ${path}`)
   const header=page.locator('.wms-page-header').first();assert(await header.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   const title=await header.locator('h1,h2').first().boundingBox();for(const b of await header.locator('button').all()){if(!await b.isVisible())continue;const r=await b.boundingBox();assert(r.x>=0&&r.x+r.width<=width+1);assert(!(r.x<title.x+title.width&&r.x+r.width>title.x&&r.y<title.y+title.height&&r.y+r.height>title.y),'action overlaps title')}
  }
 }
 admin=true;await navigate('/admin');await page.getByRole('heading',{name:'아이블 관리자',exact:true}).waitFor();assert.equal(await page.locator('.wms-page-heading p').count(),0)
 assert.deepEqual([...unknown],[],'Unmapped APIs');assert.deepEqual(errors,[])
 console.log('PASS actual application route headers, mocked read-only API responses; no accounts or DB writes')
}finally{await browser.close()}
