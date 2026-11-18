import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176'
const baselineOrigin=process.env.WMS_BASELINE_ORIGIN||'http://localhost:5174'
const writes=[];let failSave=false
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
  assert([origin,baselineOrigin].includes(u.origin))
  if(!u.pathname.startsWith('/api/'))return route.continue()
  if(p==='/products/delete-check')return route.fulfill({json:{canDelete:false,items:[{id,code:'PR01',name:'QA 상품',canDelete:false,reasons:['QA 이력 존재']}]}})
  if(p==='/support'&&r.method()==='POST'){writes.push(r.postData()||'');return failSave?route.fulfill({status:500,json:{message:'QA 저장 오류'}}):route.fulfill({json:{id:'ticket'}})}
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


 const widths=process.env.WMS_FORM_WIDTHS?.split(',').map(Number)||[360,390,430,768,1024,1280,1440,1920]
 const cases=[['/app/support','문의 등록'],['/app/settings/users','사용자 등록'],['/app/settings/users','QA 구성원 수정']]
 async function open(path,button,server=origin){await page.goto(server+path);await page.getByRole('button',{name:button,exact:true}).click();const d=page.getByRole('dialog').last();await d.waitFor();await page.waitForTimeout(100);return d}
 async function metrics(d){return d.evaluate(d=>{
  const rect=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right}}
  const controls=[...d.querySelectorAll('.dialog-section-fields label > input:not([type]),.dialog-section-fields label > input[type=text],.dialog-section-fields label > input[type=email],.dialog-section-fields label > input[type=tel],.dialog-section-fields label > select,.dialog-section-fields label > textarea')].filter(e=>e.getClientRects().length)
  return {contentHeight:d.querySelector('.dialog-form-scroll').scrollHeight,box:rect(d),overflow:d.scrollWidth>d.clientWidth+1,controls:controls.map(e=>({name:e.getAttribute('aria-label')||e.name||e.tagName,tag:e.tagName,rect:rect(e),parent:rect(e.parentElement),height:getComputedStyle(e).height,radius:getComputedStyle(e).borderRadius,border:getComputedStyle(e).borderColor,grid:getComputedStyle(e.parentElement).gridTemplateColumns,justify:getComputedStyle(e.parentElement).justifyContent,resize:getComputedStyle(e).resize})),buttons:[...d.querySelectorAll('.dialog-actions button,.work-detail-actions button')].filter(e=>e.getClientRects().length).map(e=>({name:e.textContent,...rect(e)})),checkboxes:[...d.querySelectorAll('input[type=checkbox]')].map(rect),file:[...d.querySelectorAll('input[type=file]')].map(rect)}
 })}
 for(const width of widths){await page.setViewportSize({width,height:900});for(const[path,button]of cases){
  const old=await metrics(await open(path,button,baselineOrigin));const d=await open(path,button);const current=await metrics(d)
  if(button==='문의 등록'){
   assert.equal(current.box.w,old.box.w);assert.equal(current.box.x,old.box.x);assert(current.box.h<=old.box.h);assert(current.contentHeight<=old.contentHeight)
   const withoutY=({y,...rest})=>rest
   assert.deepEqual(current.buttons.map(withoutY),old.buttons.map(withoutY));assert.deepEqual(current.file.map(withoutY),old.file.map(withoutY))
   assert.equal(await d.getByRole('heading',{name:'문의 내용',exact:true}).count(),0);assert.equal(await d.getByRole('heading',{name:'첨부파일',exact:true}).count(),0)
   assert.equal(await d.locator('.form-label-text').filter({hasText:/^문의 내용\s*\*$/}).count(),1);assert.equal(await d.locator('label:has(input[type=file])').count(),1)
   assert(await d.getByRole('textbox',{name:'문의 내용',exact:true}).isVisible());assert.equal(await d.locator('textarea').getAttribute('required'),'')
   assert.equal(await d.locator('label:has(textarea) .form-required-mark').count(),1);assert.equal(await d.locator('label:has(input[type=file]) .form-required-mark').count(),0)
   const groups=await d.locator('.dialog-section-fields').evaluate(e=>{
    const labels=[...e.querySelectorAll(':scope > label')],r=el=>el.getBoundingClientRect()
    return {gap:getComputedStyle(e).rowGap,gaps:labels.slice(2).map((el,i)=>r(el).top-r(labels[i+1]).bottom),labelGap:getComputedStyle(labels[2]).rowGap,starts:labels.map(el=>r(el).left)}
   })
   assert.equal(groups.gap,'16px');assert(groups.gaps.every(x=>x===16));assert([4,5,6].includes(parseFloat(groups.labelGap)));assert(groups.starts.every(x=>x===groups.starts[0]))
   for(let i=0;i<current.controls.length;i++)assert.equal(current.controls[i].rect.w,old.controls[i].rect.w,'preserve existing field width')
   console.log(`PASS ${width}px inquiry content height ${old.contentHeight} -> ${current.contentHeight}; single labels, required/accessibility, 16px groups`)
  }else{assert.deepEqual(current.box,old.box,button+' popup size');assert.deepEqual(current.buttons,old.buttons,button+' action geometry');assert.deepEqual(current.file,old.file)}
  assert.deepEqual(current.checkboxes,old.checkboxes)
  assert(!current.overflow);assert(current.box.x>=0&&current.box.right<=width)
  assert.equal(current.controls.length,old.controls.length)
  for(let i=0;i<current.controls.length;i++){const c=current.controls[i],b=old.controls[i];assert(Math.abs(c.rect.w-c.parent.w)<1,button+' '+c.name+' fills its column '+JSON.stringify(c));assert.equal(c.rect.x,c.parent.x);assert(c.rect.right<=current.box.right);assert.equal(c.radius,b.radius);assert.equal(c.border,b.border);assert.equal(c.rect.h,b.rect.h);if(c.tag!=='TEXTAREA')assert.equal(c.rect.h,40);else assert.equal(c.resize,'vertical')}
  const scroll=d.locator('.dialog-form-scroll');await scroll.evaluate(e=>e.scrollTop=e.scrollHeight);const actions=d.locator('.dialog-actions button,.work-detail-actions button');for(const b of await actions.all()){const r=await b.boundingBox();assert(r.y>=0&&r.y+r.height<=900)}
  if(button==='문의 등록'){const input=current.controls.find(c=>c.name==='제목'),text=current.controls.find(c=>c.tag==='TEXTAREA');assert.equal(input.rect.x,text.rect.x);assert.equal(input.rect.right,text.rect.right);console.log(`PASS ${width}px inquiry title ${old.controls.find(c=>c.name==='제목').rect.w} -> ${input.rect.w}; textarea ${old.controls.find(c=>c.tag==='TEXTAREA').rect.w} -> ${text.rect.w}`)}
 }
 console.log('PASS account create/edit geometry, inquiry field widths/heights and footer design preserved '+width)
 }
 // Other dialogs stay unchanged. Partner fields have separate coverage in partner-registration.ui.mjs.
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});for(const[path,button]of [['/app/receipts/new'],['/app/products/new'],['/app/support']]){
  const read=async server=>{await page.goto(server+path);await page.locator('.wms-content h1,.wms-content h2').first().waitFor();if(button)await page.getByRole('button',{name:button,exact:true}).click();await page.waitForTimeout(120);return page.locator('input,select,textarea').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>({name:e.name||e.getAttribute('aria-label'),type:e.type,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))) }
  assert.deepEqual(await read(origin),await read(baselineOrigin),path+' intentional field sizes '+width)
 }}
 await page.setViewportSize({width:390,height:850});let d=await open('/app/support','문의 등록')
 await d.getByRole('button',{name:'문의 등록',exact:true}).click();assert.equal(writes.length,0);assert(await d.locator('input[required]').evaluate(e=>!e.validity.valid))
 const title='긴 제목 '.repeat(30),message='긴 문의 내용을 줄바꿈하여 확인합니다.\n'.repeat(50)
 await d.getByRole('textbox',{name:'제목',exact:true}).fill(title);await d.locator('textarea').fill(message)
 await d.getByLabel('첨부파일',{exact:true}).setInputFiles({name:'isolated-qa.txt',mimeType:'text/plain',buffer:Buffer.from('isolated attachment QA')});assert(await d.getByText(/isolated-qa.txt/).isVisible())
 await d.getByLabel('첨부파일',{exact:true}).setInputFiles([]);assert.equal(await d.getByText(/isolated-qa.txt/).count(),0)
 await d.getByLabel('첨부파일',{exact:true}).setInputFiles({name:'isolated-qa.txt',mimeType:'text/plain',buffer:Buffer.from('isolated attachment QA')});assert(await d.getByText(/isolated-qa.txt/).isVisible())
 await d.getByRole('button',{name:'취소',exact:true}).click();await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'계속 편집',exact:true}).click();assert.equal(await d.getByRole('textbox',{name:'제목',exact:true}).inputValue(),title);assert.equal(await d.locator('textarea').inputValue(),message)
 await page.setViewportSize({width:390,height:500});await d.locator('textarea').scrollIntoViewIfNeeded();assert(await d.locator('.dialog-form-scroll').evaluate(e=>e.scrollHeight>e.clientHeight));const footer=await d.locator('.dialog-actions').boundingBox();assert(footer.y>=0&&footer.y+footer.height<=500)
 failSave=true;await d.getByRole('button',{name:'문의 등록',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click();await d.getByRole('alert').filter({hasText:'서버 요청을 처리하지 못했습니다.'}).waitFor();assert.equal(await d.locator('textarea').inputValue(),message);assert.equal(await d.getByLabel('첨부파일',{exact:true}).evaluate(e=>e.files.length),1)
 failSave=false;await d.getByRole('button',{name:'문의 등록',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('dialog',{name:'문의 상세',exact:true}).waitFor();assert.equal(writes.length,2);assert(writes.every(body=>body.includes('isolated-qa.txt')&&body.includes('isolated attachment QA')&&body.includes('name="title"')&&body.includes('name="message"')))
 assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 console.log('PASS inquiry required validation, attachment, unsaved draft, short viewport scroll, failed save retention and successful retry; API mocked only')
}finally{await browser.close()}
