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
let receiptStatus='Planned', inspectedAt=null
const admin=false
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',route=>{
  const r=route.request(),u=new URL(r.url()),p=u.pathname.replace('/api/tenants/header-qa','')
  assert.equal(u.origin,origin)
  if(!u.pathname.startsWith('/api/'))return route.continue()
  if(p==='/products/delete-check')return route.fulfill({json:{canDelete:false,items:[{id,code:'PR01',name:'QA 상품',canDelete:false,reasons:['QA 이력 존재']}]}})
  assert.equal(r.method(),'GET','Unexpected fixture write '+p)
  const json=data=>route.fulfill({json:data})
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'헤더 QA',userName:'qa',email:'qa@example.test',systemRole:admin?'IebleAdministrator':'User',mustChangePassword:false},memberships:[{tenantId:workspace.id,name:workspace.name,role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:workspace.id})
  if(p==='/api/auth/csrf')return json({token:'fixture'})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p==='/workspace')return json(workspace)
  if(p.startsWith('/pages/'))return json({})
  if(p==='/dashboard/warehouses')return json({warehouses:[],asOf:now})
  if(p.endsWith('/choices'))return json({...empty,warehouses:[],partners:[],products:[],locations:[]})
  if(p.endsWith('/inspection-history'))return json(empty)
  if(p==='/inventory/history')return json({...empty,total:1,items:[{id:'op1',number:'OP01',type:'Move',productName:'QA 상품',unit:'EA',quantity:1,occurredAt:now}]})
  if(p==='/inventory/history/op1')return json({operation:{id:'op1',number:'OP01',type:'Move',productName:'QA 상품',unit:'EA',quantity:1,beforeSource:2,afterSource:1,beforeDestination:0,afterDestination:1,occurredAt:now,createdAt:now},movements:[]})
  if(p==='/inventory')return json(empty)
  if(p==='/warehouses/w1')return json({warehouse:{id:'w1',code:'WH01',name:'헤더 QA 창고',isActive:true,version:'1'},zones:[],racks:[],locationCount:0})
  if(p==='/warehouses/w1/workspace')return json({detail:{warehouse:{id:'w1',code:'WH01',name:'헤더 QA 창고',isActive:true,version:'1'},zones:[],racks:[],locationCount:0},floorLocations:[],plan:{exists:false,objects:[],aspectRatio:1.6}})
  if(p==='/products/'+id)return json({product:{id,code:'PR01',name:'헤더 QA 상품',unit:'EA',isActive:true,version:'1',images:[],barcodes:[],lotManaged:false,serialManaged:false,expiryManaged:false},categoryName:null})
  if(p==='/receipts/'+id)return json({receipt:{id,number:'IN01',warehouseId:'w1',warehouseName:'QA 창고',partnerId:'p1',partnerName:'QA 거래처',expectedDate:'2026-11-09',status:receiptStatus,inspectedAt,version:'1',createdAt:now},lines:[]})
  if(p==='/shipments/'+id)return json({shipment:{id,number:'PK01',warehouseId:'w1',warehouseName:'QA 창고',partnerId:'p1',partnerName:'QA 거래처',requestDate:'2026-11-09',expectedDate:'2026-11-09',status:'Picking',version:'1',createdAt:now},lines:[],allocations:[],movements:[]})
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

 async function check(label,code){
  const header=page.locator('.work-detail-header').last();await header.waitFor()
  if(code)await header.locator('.work-detail-code').filter({hasText:code}).waitFor()
  const r=await header.evaluate(el=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,cy:r.y+r.height/2}}
   const title=el.querySelector('.work-detail-main > h1,.work-detail-main > h2'),actions=el.querySelector('.work-detail-actions'),meta=el.querySelector('.work-detail-meta')
   return {title:rect(title),actions:rect(actions),buttons:[...actions.querySelectorAll('button')].map(rect),meta:meta&&rect(meta),items:meta&&[...meta.children].map(rect),overflow:el.scrollWidth>el.clientWidth+1,viewport:innerWidth,rootOverflow:document.documentElement.scrollWidth>innerWidth+1}
  })
  assert(Math.abs(r.title.cy-r.actions.cy)<1,label+' title/action centers');assert(r.title.w>10,label+' title visible');assert(r.title.right<=r.actions.x+1,label+' overlap');assert(!r.overflow&&!r.rootOverflow,label+' overflow')
  for(const b of r.buttons){assert(Math.abs(b.cy-r.title.cy)<1,label+' button row');assert(b.x>=0&&b.right<=r.viewport+1,label+' clipped action')}
  if(r.meta){assert(r.meta.y>=r.title.bottom,label+' separate metadata row');if(r.items.length===2){const[a,b]=r.items;assert(Math.abs(a.cy-b.cy)<1,label+' metadata centers');assert(Math.abs(b.x-a.right-8)<1,label+' metadata gap')}}
  for(const submit of await header.locator('button[type=submit]').all())assert(await submit.evaluate(el=>!!el.form),'header submit connected to form')
  const back=await header.locator('.registration-back').boundingBox();assert.equal(back.width,36);assert.equal(back.height,36)
 }
 for(const width of (process.env.WMS_DETAIL_WIDTHS ? process.env.WMS_DETAIL_WIDTHS.split(',').map(Number) : [360,375,390,430,768,1440])){
  await page.setViewportSize({width,height:900});receiptStatus='Planned';inspectedAt=null
  await navigate('/app/receipts/'+id);await check('입고 상세','IN01')
  receiptStatus='Inspecting';await navigate('/app/receipts/'+id);await check('입고 검수','IN01')
  if(width<=1024){const help=page.locator('.receipt-inspection-help details');assert.equal(await help.count(),3);for(const d of await help.all()){assert.equal(await d.getAttribute('open'),null);await d.locator('summary').click();assert(await d.locator('p').isVisible());await d.locator('summary').click();assert(!await d.locator('p').isVisible())}}
  inspectedAt=now;await navigate('/app/receipts/'+id);await page.getByRole('button',{name:'보관 위치 지정',exact:true}).click();await check('입고 배치','IN01')
  await navigate('/app/shipments/'+id);await check('출고 상세','PK01');await page.getByRole('button',{name:'피킹 진행',exact:true}).click();await check('출고 피킹','PK01')
  await navigate('/app/products/'+id);await check('상품 수정','PR01');assert.equal(await page.getByRole('button',{name:'변경사항 저장',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'상품 삭제',exact:true}).count(),1)
  await page.getByRole('button',{name:'상품 삭제',exact:true}).click();await page.getByRole('dialog').last().waitFor();await page.getByRole('dialog').last().getByRole('button',{name:'취소',exact:true}).click()
  await navigate('/app/inventory/counts/'+id);await check('실사 상세','ST01')
  await navigate('/app/warehouses?warehouseId=w1');await check('창고 상세','WH01');await page.locator('.work-detail-header h2').evaluate(el=>el.textContent='길이가 아주 긴 창고 상세 제목으로 버튼 겹침과 말줄임을 확인합니다');await check('긴 제목','WH01')
  await navigate('/app/partners');await page.getByRole('button',{name:'QA 거래처 상세',exact:true}).click();await check('거래처 상세','PT01');await page.getByRole('button',{name:'거래처 수정',exact:true}).click();await check('거래처 수정','PT01');assert.equal(await page.getByRole('button',{name:'거래처 저장',exact:true}).count(),1)
  await page.getByRole('dialog').getByRole('button',{name:'뒤로가기',exact:true}).click()
  await navigate('/app/settings/users');await page.getByRole('button',{name:'QA 구성원 수정',exact:true}).click();await check('사용자 수정','employee001');assert.equal(await page.getByRole('button',{name:'사용자 정보 저장',exact:true}).count(),1)
  await page.getByRole('dialog').getByRole('button',{name:'뒤로가기',exact:true}).click()
  await navigate('/app/inventory/adjustments');await page.getByRole('button',{name:'이동·조정 내역',exact:true}).click();await page.getByRole('button',{name:'OP01 상세',exact:true}).click();await check('이동 조정 상세','OP01')
  await navigate('/app/support');await page.getByRole('button',{name:'상세',exact:true}).click();await check('문의 상세','QA01')
  console.log('PASS detail headers, metadata, actions and guides '+width+'px')
 }
 await navigate('/app/products/'+id);await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();await page.getByRole('alertdialog',{name:'상품 저장 확인',exact:true}).waitFor();await page.getByRole('button',{name:'계속 편집',exact:true}).click();assert.equal(await page.getByRole('alertdialog',{name:'상품 저장 확인',exact:true}).count(),0)
 permissions.products=['menu','read'];await navigate('/app/products/'+id);await check('읽기 전용 상품','PR01');assert.equal(await page.getByRole('button',{name:'변경사항 저장',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'상품 삭제',exact:true}).count(),0)
 assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
}finally{await browser.close()}
