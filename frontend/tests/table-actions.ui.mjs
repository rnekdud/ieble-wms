import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176'
const baselineOrigin=process.env.WMS_BASELINE_ORIGIN||'http://localhost:5174'
const requests=[];let readOnly=false,holdOptions
const id='12345678-1234-1234-1234-123456789012'
const errors=[],unknown=new Set(),now='2026-11-09T05:00:00Z',empty={items:[],total:0,page:1,pageSize:20}
const employee={userId:'employee',name:'QA 구성원',loginId:'employee001',email:'qa@example.test',role:'Employee',isActive:true,membershipIsActive:true,accountIsActive:true,accountType:'Internal',departmentId:null,positionId:null,permissionGradeId:'Employee',version:'1',registeredAt:now,billingStartsAt:now,billingStartMonth:'2026-11',mustChangePassword:false}
const partner={id:'partner',name:'QA 거래처',code:'PT01',type:'BOTH',isActive:true,version:'1',countryCode:'KR'}
const inquiry={id:'ticket',number:'QA01',title:'QA 문의',category:'Service',status:'Received',createdAt:now,author:'QA 구성원',company:'헤더 QA 기업',version:'1',message:'필수 업무 확인',answer:null,attachments:[],history:[]}
const permissions=Object.fromEntries(workspacePages.map(p=>[p.key,['menu','read','readAll','create','update','delete','confirm','count','manageUsers']]))
const workspace={id:'header-qa',name:'헤더 QA 기업',role:'Master',permissions,serviceStatus:'Active',billingStatus:'Active',billingAccess:{state:'Active',canAccessWms:true,hasRegisteredCard:true,freeUntil:'2027-01-01',firstChargeAt:'2027-01-01'},billingPolicy:{monthlyPerUserKrw:0,monthlyBaseKrw:0,includedUsers:1},canManageBilling:false,latestChange:null}
let receiptStatus='Planned', inspectedAt=null
const stock={id:'s1',productId:id,productCode:'PR1',productName:'QA 상품',unit:'EA',warehouseName:'QA 창고',warehouseId:'w1',rackCode:'R1',locationCode:'L1',quantity:10,reservedQuantity:1,availableQuantity:9,isActive:true}
const operation={id:'op1',number:'OP1',type:'Move',productName:'QA 상품',productCode:'PR1',sourceLabel:'출발 위치',destinationLabel:'도착 위치',quantity:1,unit:'EA',beforeSource:10,afterSource:9,beforeDestination:0,afterDestination:1,reason:'QA 이동',actorName:'QA',occurredAt:now,createdAt:now}
const admin=false
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',route=>{
  const r=route.request(),u=new URL(r.url()),p=u.pathname.replace('/api/tenants/header-qa','')
  assert([origin,baselineOrigin].includes(u.origin))
  if(!u.pathname.startsWith('/api/'))return route.continue()
  if(p==='/products/delete-check')return route.fulfill({json:{canDelete:false,items:[{id,code:'PR01',name:'QA 상품',canDelete:false,reasons:['QA 이력 존재']}]}})

  assert.equal(r.method(),'GET','Unexpected fixture write '+p)
  const json=data=>route.fulfill({json:data})
  requests.push({path:p,params:Object.fromEntries(u.searchParams)})
  const paged=factory=>{const page=Number(u.searchParams.get('page')||1),pageSize=Number(u.searchParams.get('pageSize')||20);return json({items:Array.from({length:Math.min(pageSize,45-(page-1)*pageSize)},(_,i)=>factory(i+(page-1)*pageSize+1)),page,pageSize,total:45,monthlyPerUserKrw:0})}
  if(p==='/inventory')return paged(n=>({...stock,id:'s'+n,productCode:'PR'+n}))
  if(p==='/inventory/s1')return json({stock,productTotals:[stock]})
  if(p==='/inventory/history')return paged(n=>({...operation,id:'op'+n,number:'OP'+n}))
  if(p==='/inventory/history/op1')return json({operation,movements:[]})
  if(p==='/users')return paged(n=>({...employee,userId:'u'+n,name:'QA 구성원 '+n,loginId:'employee'+n}))
  if(p==='/users/organization-options'&&holdOptions)return holdOptions.then(()=>json({departments:[],positions:[]}))
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'헤더 QA',userName:'qa',email:'qa@example.test',systemRole:admin?'IebleAdministrator':'User',mustChangePassword:false},memberships:[{tenantId:workspace.id,name:workspace.name,role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:workspace.id})
  if(p==='/api/auth/csrf')return json({token:'fixture'})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p==='/workspace')return json(readOnly?{...workspace,role:'Employee',permissions:{...permissions,users:['menu','read']}}:workspace)
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


 const widths=process.env.WMS_TABLE_WIDTHS?.split(',').map(Number)||[360,390,430,600,601,768,1024,1280,1440,1920]
 const kinds=['stocks','history','users']
 const table=k=>page.locator(k==='users'?'.organization-user-table':k==='history'?'.inventory-history-list-table':'.inventory-table')
 async function open(k,server=origin){await page.goto(server+(k==='users'?'/app/settings/users':'/app/inventory/adjustments'));if(k==='history')await page.getByRole('button',{name:'이동·조정 내역',exact:true}).click();await table(k).locator('td[data-label="관리"] button').first().waitFor();await page.waitForTimeout(100);await table(k).locator('tbody tr').first().evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY-100));return table(k)}
 const geometry=t=>t.evaluate(t=>{
  const r=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right}},s=t.parentElement,c=t.querySelector('td[data-label="관리"]'),h=t.querySelector('th:last-child'),row=c.parentElement
  return{scroll:s.scrollLeft,max:s.scrollWidth-s.clientWidth,container:r(s),cell:r(c),header:r(h),position:getComputedStyle(c).position,bg:getComputedStyle(c).backgroundColor,rowBg:getComputedStyle(row).backgroundColor,headerBg:getComputedStyle(h).backgroundColor,z:Number(getComputedStyle(c).zIndex),hz:Number(getComputedStyle(h).zIndex),tableWidth:r(t).w,rowDisplay:getComputedStyle(row).display,firstX:r(row.firstElementChild).x,columns:t.querySelectorAll('thead th').length,buttons:[...c.querySelectorAll('button')].map(b=>({...r(b),text:b.textContent,disabled:b.disabled,hit:b.contains(document.elementFromPoint(r(b).x+r(b).w/2,r(b).y+r(b).h/2))}))}
 })
 for(const width of widths){await page.setViewportSize({width,height:1000});for(const k of kinds){
  let old
  if(process.env.WMS_TABLE_COMPARE==='1')old=await geometry(await open(k,baselineOrigin))
  const t=await open(k),before=await geometry(t)
  assert.equal(before.scroll,0);assert.equal(before.columns,k==='stocks'?12:k==='history'?9:10)
  if(width<=600){assert.equal(before.position,'static');assert.equal(before.rowDisplay,'grid');if(old)assert.deepEqual(before,old);console.log('PASS mobile card unchanged',width,k);continue}
  assert.equal(before.position,'sticky');assert(before.buttons.every(b=>b.x>=before.container.x&&b.right<=before.container.right+1&&b.hit),'visible/clickable '+width+' '+k+JSON.stringify(before));assert(Math.abs(before.cell.x-before.header.x)<1);assert(Math.abs(before.cell.w-before.header.w)<1);assert(before.hz>before.z);assert.notEqual(before.bg,'rgba(0, 0, 0, 0)');assert.notEqual(before.headerBg,'rgba(0, 0, 0, 0)');assert(before.cell.w<260)
  await t.locator('tbody tr').first().hover();let hover=await geometry(t);assert.equal(hover.bg,hover.rowBg)
  for(const ratio of [.5,1]){await t.evaluate((t,ratio)=>t.parentElement.scrollLeft=(t.parentElement.scrollWidth-t.parentElement.clientWidth)*ratio,ratio);await page.waitForTimeout(30);const after=await geometry(t);assert(Math.abs(after.cell.x-before.cell.x)<1);assert(Math.abs(after.header.x-before.header.x)<1);assert(after.buttons.every(b=>b.hit));if(before.max>1)assert(after.firstX<before.firstX)}
  await t.evaluate(t=>t.parentElement.scrollLeft=0)
  console.log(`PASS ${width}px ${k}: action width ${before.cell.w.toFixed(1)}, right ${before.cell.right.toFixed(1)}, scroll range ${before.max}${old?', previous action right '+old.cell.right.toFixed(1):''}`)
 }}
 // Existing action handlers: open and cancel only, without real or mock password writes.
 await page.setViewportSize({width:1280,height:1000});let t=await open('users')
 await t.getByRole('button',{name:'QA 구성원 1 수정',exact:true}).click();let d=page.getByRole('dialog');await d.getByRole('textbox',{name:'사용자 이름',exact:true}).waitFor();await page.keyboard.press('Escape');await d.waitFor({state:'detached'})
 let confirmed=0;page.on('dialog',async dialog=>{assert.equal(dialog.type(),'confirm');assert.match(dialog.message(),/비밀번호를 초기화/);confirmed++;await dialog.dismiss()})
 await t.getByRole('button',{name:'QA 구성원 1 비밀번호 초기화',exact:true}).click();assert.equal(confirmed,1)
 await page.getByRole('navigation',{name:'사용자 목록 페이지'}).getByRole('button',{name:'2페이지',exact:true}).click();await t.getByRole('button',{name:'QA 구성원 21 수정',exact:true}).waitFor()
 await page.getByLabel('사용자 검색',{exact:true}).fill('QA');await page.getByRole('button',{name:'검색',exact:true}).click();await t.getByRole('button',{name:'QA 구성원 1 수정',exact:true}).waitFor();assert(requests.some(r=>r.path==='/users'&&r.params.search==='QA'&&r.params.page==='1'))
 readOnly=true;t=await open('stocks');await page.goto(origin+'/app/settings/users');await page.getByText('QA 구성원 1',{exact:true}).first().waitFor();assert.equal(await table('users').locator('td[data-label="관리"] button').count(),0);readOnly=false
 let release;holdOptions=new Promise(resolve=>release=resolve);t=await open('users');assert(await t.getByRole('button',{name:'QA 구성원 1 수정',exact:true}).isDisabled());release();holdOptions=undefined;await page.waitForFunction(()=>!document.querySelector('.organization-user-table td[data-label="관리"] button').disabled)
 t=await open('stocks');await t.locator('td[data-label="관리"] button').first().click();d=page.getByRole('dialog',{name:'재고 상세',exact:true});await d.getByRole('heading',{name:'QA 상품',exact:false}).waitFor();await page.keyboard.press('Escape');await d.waitFor({state:'detached'})
 await page.getByRole('navigation',{name:'재고 목록 페이지'}).getByRole('button',{name:'2페이지',exact:true}).click();await t.getByRole('cell',{name:'PR21',exact:true}).waitFor();await page.getByRole('textbox',{name:'재고 검색',exact:true}).fill('QA');await page.getByRole('button',{name:'검색',exact:true}).click();await t.getByRole('cell',{name:'PR1',exact:true}).waitFor();assert(requests.some(r=>r.path==='/inventory'&&r.params.search==='QA'&&r.params.page==='1'))
 t=await open('history');await t.locator('td[data-label="관리"] button').first().click();d=page.getByRole('dialog',{name:'이동·조정 상세',exact:true});await d.getByText('QA 이동',{exact:true}).waitFor();await page.keyboard.press('Escape');await d.waitFor({state:'detached'})
 await page.getByRole('navigation',{name:'이동 조정 내역 페이지'}).getByRole('button',{name:'2페이지',exact:true}).click();await t.getByRole('button',{name:'OP21 상세',exact:true}).waitFor()
 await page.goto(origin+'/app/support');await page.getByRole('button',{name:'상세',exact:true}).waitFor();assert.equal(await page.locator('.support-table td[data-label="관리"]').evaluate(e=>getComputedStyle(e).position),'static')
 assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 console.log('PASS detail/edit dialogs, password confirmation canceled without writes, permissions, disabled state, server pagination/search and unrelated table')
}finally{await browser.close()}
