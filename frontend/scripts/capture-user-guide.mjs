// Product assets only: real React screens, isolated API fixtures, headless browser.
// Reuses the same fixture setup as UI regression tests; no production API requests.
import {readFileSync,mkdirSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
const origin='http://localhost:5176'
mkdirSync('public/guide',{recursive:true})
const shot=String.raw`
async function shot(name,selector='.wms-content') {
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500)
 assert.equal(await page.locator('vite-error-overlay').count(),0,'No dev error overlay in guide assets')
 const target=page.locator(selector).first();await target.waitFor()
 const viewport=page.viewportSize()
 if(selector==='.wms-content'||selector==='.auth-card'){
  const box=await target.boundingBox();await page.setViewportSize({width:viewport.width,height:Math.max(viewport.height,Math.ceil(box.height+160))})
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(200)
 }
 await target.screenshot({path:'public/guide/'+name+'.jpg',type:'jpeg',quality:90})
 await page.setViewportSize(viewport)
 console.log('Captured '+name)
}
`
const jobs=[
{key:'general',file:'page-header-routes.ui.mjs',cut:' const cases=',body:String.raw`
await navigate('/app/warehouses');await page.getByRole('button',{name:'창고 등록',exact:true}).waitFor()
await page.getByRole('button',{name:'창고 등록',exact:true}).click();await page.getByRole('heading',{name:'새 창고 만들기',exact:true}).waitFor();await shot('warehouse-create')
for(const [path,name] of [['/app/settings/company','company'],['/app/master/billing','billing'],['/app/reports/movements','movement-stats'],['/app/reports/history','stock-history'],['/app/settings/users','users'],['/app/support','support']]){
 await navigate(path);await page.locator('.wms-page-header').first().waitFor();if(!['users','support'].includes(name))await shot(name)
 if(name==='company'){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'public/guide/workspace.jpg',type:'jpeg',quality:90,fullPage:true})}
}
await page.getByRole('button',{name:'문의 등록',exact:true}).click();await shot('support-form','dialog')
await navigate('/app/settings/users');await page.getByRole('button',{name:'사용자 등록',exact:true}).click();await shot('user-form','dialog')
`},
{key:'auth',file:'login-layout.ui.mjs',cut:" await page.goto(origin+'/login')",body:String.raw`
await page.setViewportSize({width:1440,height:1100});await page.goto(origin+'/login');await page.getByRole('button',{name:'로그인',exact:true}).waitFor();await shot('login','.auth-card')
await page.getByRole('link',{name:'회원가입',exact:true}).click();await page.getByRole('heading',{name:'기업 회원가입',exact:true}).waitFor();await shot('register','.auth-card')
`},
{key:'password',file:'password-gate.ui.mjs',cut:' for(const width of',body:String.raw`
await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/app/products/new');await dialog.waitFor();await shot('password','dialog')
`},
{key:'editor',file:'plan-rotation.ui.mjs',cut:' for(const width of',body:String.raw`
await shot('warehouse-editor','.wms-content')
await page.getByRole('button',{name:'템플릿 저장',exact:true}).click();await shot('warehouse-template','dialog')
`},
{key:'product',file:'product-packaging.ui.mjs',cut:' for(const width of',body:String.raw`
await page.setViewportSize({width:1440,height:1100});await goto('edit');await shot('product-form')
for(const [label,value] of [['인박스 수량','10'],['아웃박스 수량','5'],['파레트당 아웃박스','20']])await page.getByRole('spinbutton',{name:label,exact:true}).fill(value)
await shot('product-packaging','.product-packaging-section')
await page.getByRole('button',{name:'+ 바코드 추가',exact:true}).click()
const row=page.getByRole('region',{name:'바코드 1 영역',exact:true})
await row.getByRole('combobox',{name:'바코드 1 포장 단위'}).selectOption('OUTER')
await row.locator('.rack-barcode-input-row input').fill('GUIDE-BOX-001')
await shot('product-barcode', '[aria-label="바코드 1 영역"]')
`},
{key:'receipt',file:'receipt-inspection-layout.ui.mjs',cut:' await page.clock.install()',body:String.raw`
const pickLocation=async(label,text)=>{await page.getByRole('button',{name:new RegExp('^'+label+' ')}).click();await page.getByRole('combobox',{name:label+' 검색',exact:true}).fill(text);await page.getByRole('option').filter({hasText:text}).first().click()}
await page.goto(origin+'/app/receipts/new');await page.getByLabel('입고 예정일',{exact:true}).waitFor();await shot('receipt-form')
data=initial();data.receipt.status='Inspecting';data.lines[0].inspectedQuantity=20;data.lines[1].inspectedQuantity=2.5
await page.goto(origin+'/app/receipts/11111111-1111-4111-8111-111111111111');await page.getByRole('textbox',{name:'검수 바코드',exact:true}).waitFor();await shot('receipt-inspection')
await page.getByRole('button',{name:/LOT.*관리/}).first().click()
const tracking=page.getByRole('dialog');await tracking.getByRole('button',{name:'+ LOT 추가',exact:true}).click()
await tracking.getByLabel('LOT 번호 1',{exact:true}).fill('GUIDE-LOT-001');await tracking.getByLabel('LOT 수량 1',{exact:true}).fill('20');await tracking.getByLabel('LOT 유통기한 1',{exact:true}).fill('2028-05-10');await shot('receipt-tracking','dialog')
await tracking.getByRole('tab',{name:/시리얼/}).click();await tracking.getByLabel('시리얼 일괄 입력',{exact:true}).fill('GUIDE-SN-001\nGUIDE-SN-002');await tracking.getByLabel('추가 시리얼 LOT',{exact:true}).selectOption({label:'GUIDE-LOT-001 · 2028-05-10'});await tracking.getByRole('button',{name:'목록에 추가',exact:true}).click();await shot('receipt-serial','dialog');await page.getByRole('dialog').getByRole('button',{name:'취소',exact:true}).click()
data.receipt.inspectedAt='2026-11-12T03:00:00Z';await page.reload();await page.getByRole('button',{name:'보관 위치 지정',exact:true}).click();await page.getByRole('button',{name:'위치 추가 1',exact:true}).click()
await pickLocation('보관 위치 1-1','RACK-A01');await page.getByRole('spinbutton',{name:'배치 수량 1-1',exact:true}).fill('20')
await page.getByRole('button',{name:'위치 추가 2',exact:true}).click();await pickLocation('보관 위치 2-1','RACK-B02');await page.getByRole('spinbutton',{name:'배치 수량 2-1',exact:true}).fill('2.5');await shot('receipt-placement')
`},
{key:'stock',file:'stock-location-table.ui.mjs',cut:" await page.goto(origin+'/app/reports/stock')",body:String.raw`
await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/app/reports/stock');await page.getByRole('button',{name:'상품별 재고',exact:true}).waitFor();await shot('stock-product')
await page.getByRole('button',{name:'창고별 재고',exact:true}).click();await shot('stock-warehouse')
await page.getByRole('button',{name:'보관 위치별 재고',exact:true}).click();await shot('stock-location')
`},
{key:'barcode',file:'barcode-location-dialog.ui.mjs',cut:' for(const width of',body:String.raw`
await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/app/barcode-lookup');await scan();await shot('barcode');await open();await routeReady();await shot('barcode-location','dialog')
`},
{key:'shipment',file:'shipment-picking-route.ui.mjs',cut:' for(const width of',body:String.raw`
await page.setViewportSize({width:1440,height:1000});await work();await shot('shipment-picking');await open();await ready();await shot('shipment-route','dialog')
`},
{key:'shipment-form',file:'shipment-workflow.ui.mjs',cut:' for(const width of',body:String.raw`
await page.goto(origin+'/__shipment-ui?mode=new');await choose('출고 창고','출고창고');await choose('기본 출고 랙','RACK-A01');await add(['p1']);await page.getByRole('spinbutton',{name:'수량 1',exact:true}).fill('10');await shot('shipment-form')
`},
{key:'stocktake',file:'simple-stocktake.ui.mjs',cut:' for(const width of',body:String.raw`
await page.setViewportSize({width:1440,height:1000});await start();await add(['p1']);await page.getByLabel('실제 수량 1',{exact:true}).fill('18');await shot('stocktake')
`},
{key:'partner',file:'partner-registration.ui.mjs',cut:' for(const width of',body:String.raw`
await page.setViewportSize({width:1440,height:1100});await open();await shot('partner','dialog')
`},
{key:'organization',file:'organization-items.ui.mjs',cut:" await page.goto(origin+'/__items')",body:String.raw`
await page.goto(origin+'/__items');await page.getByRole('tab',{name:'부서 관리',exact:true}).waitFor();await shot('organization')
`},
{key:'permission',file:'permission-matrix.ui.mjs',cut:' for(const width of',body:String.raw`
await page.setViewportSize({width:1440,height:1100});await page.goto(origin+'/__permission-ui');await admin().waitFor();await shot('permissions')
`},
{key:'move',file:'inventory-move-confirm.ui.mjs',cut:' for(const width of',body:String.raw`
await page.setViewportSize({width:1440,height:1000});await shot('inventory-move','dialog')
`},
]
const only=process.argv.slice(2)
for(const job of jobs.filter(j=>!only.length||only.includes(j.key))){
 let source=readFileSync('tests/'+job.file,'utf8'),index=source.indexOf(job.cut)
 if(index<0)throw Error('Capture checkpoint missing '+job.file)
 source=source.slice(0,index).replaceAll("'../src/","'./src/")
 if(job.key==='stocktake'){
  source=source.replace("page.goto(origin+'/__stocktake-ui')","page.goto(origin+'/app/inventory/counts')")
  source=source.replace("if(path==='/api/auth/csrf')",`if(path==='/api/auth/me')return json({user:{id:'qa',displayName:'가이드 담당자',userName:'guide',email:'guide@example.test',systemRole:'User',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'가이드 예시 기업',role:'Master',serviceStatus:'Active'}],selectedTenantId:'fixture',tenantResolution:'resolved'})
 if(path==='/api/health/db')return json({status:'connected'})
 if(path==='/api/tenants/fixture/workspace')return json({id:'fixture',name:'가이드 예시 기업',role:'Master',permissions:{stocktake:['menu','read','create','update','count','confirm']},serviceStatus:'Active',billingAccess:{canAccessWms:true},canManageBilling:false,currentAssignee:{id:'qa',name:'가이드 담당자',code:'QA'}})
 if(path==='/api/tenants/fixture/pages/stocktake')return json({})
 if(path==='/api/auth/csrf')`)
 }
 source=source.replaceAll("canManageBilling:false,latestChange:null","canManageBilling:false,currentAssignee:{id:'qa',name:'가이드 담당자',code:'QA'},latestChange:null")
 source=source.replaceAll('헤더 QA 기업','가이드 예시 기업').replaceAll('헤더 QA 창고','예시 상온 창고')
 source+="\nawait context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{});\n"+shot+job.body+"\nassert.deepEqual(errors,[]);\n}finally{await browser.close()}\n"
 const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module'],{input:source,encoding:'utf8',env:{...process.env,UI_ORIGIN:origin,WMS_UI_ORIGIN:origin,WMS_FULL_APP:'1'},stdio:['pipe','pipe','pipe']})
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'')
 if(result.status!==0)throw Error('Capture failed: '+job.key)
}
