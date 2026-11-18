import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',root='/api/tenants/fixture'
const shape=(type,x,y,width,height,extra={})=>({id:`${type}-${x}-${y}`,type,x,y,width,height,rotation:0,shape:'rectangle',label:type,rackId:null,zoneId:null,locationId:null,fill:type==='rack'?'#a7ccdf':'#ddd',...extra})
const objects=[shape('door',.5,.95,.12,.025,{label:'하단 출입구'}),shape('zone',.5,.28,.84,.32),shape('zone',.5,.72,.84,.32),shape('wall',.5,.05,.94,.016),shape('wall',.04,.5,.01,.9),shape('wall',.96,.5,.01,.9),shape('wall',.24,.95,.4,.016),shape('wall',.76,.95,.4,.016)]
for(let i=0;i<6;i++)objects.push(shape('rack',[.22,.5,.78][i%3],i<3?.28:.72,.18,.2,{id:'obj-r'+i,rackId:'r'+i,label:'R-0'+(i+1)}))
const plan={exists:true,version:'v1',schemaVersion:1,aspectRatio:1.6,objects}
const product={id:'p',code:'PR03',name:'경로 QA 상품 '+('긴 상품 이름 '.repeat(8)),unit:'EA',isActive:true,version:'v1',images:[],innerPackQuantity:10,outerPackQuantity:5,outerPackUnit:'INNER',palletPackQuantity:20,createdAt:'2026-11-11',updatedAt:'2026-11-11',barcodes:['EA','PALLET'].map((packageCode,i)=>({id:'b'+i,value:'QA-'+packageCode,packageCode,isPrimary:i===0,barcodeType:'External'}))}
const row={productId:'p',unit:'EA',warehouseId:'w1',warehouseName:'냉동 QA 창고',zoneId:'z1',zoneName:'냉동 구역',rackId:'r0',rackCode:'R-01',rackName:'냉동 랙',locationId:'l1',locationName:'1단 2칸 '+('긴 위치명 '.repeat(8)),locationCode:'BIN-01-'+('LONG'.repeat(8)),quantity:300,reservedQuantity:30,availableQuantity:270}
let mode='normal';const errors=[],reads=[],unexpected=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',hasTouch:true})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;assert([origin,process.env.BASELINE_ORIGIN].includes(u.origin))
  if(!p.startsWith('/api/'))return route.continue()
  assert.equal(req.method(),'GET','No business writes in barcode lookup');reads.push(p+u.search)
  const json=data=>route.fulfill({json:data})
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'격리 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p===root+'/workspace')return json({id:'fixture',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{products:['menu','read'],'stock-overview':['menu','read'],warehouses:['menu','read']}})
  if(p===root+'/pages/barcode-lookup')return json({})
  if(p===root+'/barcodes/lookup')return json({kind:'product',item:product,inventoryAvailable:mode!=='denied'})
  if(p===root+'/products/p')return json({product,canViewCost:false})
  if(p===root+'/products/options')return json({units:['EA'],categories:[],productTypes:[]})
  if(p===root+'/reports/stock-overview'){
   assert.equal(u.searchParams.get('productId'),'p')
   const view=u.searchParams.get('view'),w=u.searchParams.get('warehouseId'),page=Number(u.searchParams.get('page')||1),pageSize=Number(u.searchParams.get('pageSize')||20)
   let items=[]
   if(view==='product')items=[{...row,quantity:mode==='zero'?0:1200,reservedQuantity:mode==='zero'?0:100,availableQuantity:mode==='zero'?0:1100}]
   else if(view==='warehouse')items=mode==='zero'?[]:[{...row,quantity:700},{...row,warehouseId:'w2',warehouseName:'상온 QA 창고',quantity:500}]
   else if(view==='location'){
    assert(['w1','w2'].includes(w));assert.equal(pageSize,100)
    if(mode==='location-error')return route.fulfill({status:503,json:{message:'위치 조회 실패'}})
    items=w==='w1'?[row,{...row,quantity:200,reservedQuantity:20,availableQuantity:180,lotNumber:'B'},{...row,rackId:'r4',rackCode:'R-05',locationId:'l2',locationName:'2단 1칸',locationCode:'BIN-02',quantity:200,reservedQuantity:10,availableQuantity:190},{...row,locationId:'l4',locationName:'같은 랙의 별도 위치',locationCode:'BIN-04',quantity:40}]:[{...row,warehouseId:'w2',rackId:'r2',rackCode:'R-03',locationId:'l3',quantity:500}]
    if(mode==='floor')items=[{...row,rackId:null,rackCode:null,locationName:'바닥 보관',locationId:'floor'}]
    if(mode==='pages')items=Array.from({length:101},(_,i)=>({...row,locationId:'loc'+i,locationCode:'BIN-'+i,locationName:'위치 '+i,quantity:1}))
   }else throw Error('Unexpected view '+view)
   return json({items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pageSize})
  }
  if(p.endsWith('/plan')){
   if(mode==='plan-error')return route.fulfill({status:403,json:{message:'창고 도면 조회 권한이 없습니다.'}})
   if(mode==='missing')return json({...plan,exists:false,objects:[]})
   if(mode==='no-door')return json({...plan,objects:objects.filter(o=>o.type!=='door')})
   if(mode==='blocked')return json({...plan,objects:[...objects,shape('wall',.5,.5,.94,.01)]})
   return json(plan)
  }
  if(p.endsWith('/front'))return json({rack:{id:p.split('/').at(-2),code:'R',levels:3,bays:4},locations:['l1','l2','l3'].map((id,i)=>({location:{id,name:'위치 '+id,code:'BIN-0'+(i+1),level:i+1,bay:2}}))})
  unexpected.push(p);return route.fulfill({status:404,json:{message:'Unexpected API'}})
 })
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
 const scan=async(value='QA-PALLET')=>{await page.getByRole('textbox',{name:'조회 바코드'}).fill(value);await page.getByRole('textbox',{name:'조회 바코드'}).press('Enter');await page.getByRole('region',{name:'바코드 조회 결과'}).waitFor()}
 const canvas=page.getByLabel('창고 2D 도면 캔버스',{exact:true})
 const routeReady=()=>page.waitForFunction(()=>document.querySelector('.warehouse-plan-canvas')?.getAttribute('data-route-points'))
 const open=async()=>{await page.getByRole('button',{name:'상품 위치 찾기',exact:true}).click();await page.getByRole('dialog').waitFor()}
 const dialog=page.getByRole('dialog'),table=dialog.locator('.barcode-location-table')
 const close=async()=>{await dialog.locator('footer').getByRole('button',{name:'닫기',exact:true}).click();await dialog.waitFor({state:'detached'})}
 const baseline=process.env.BASELINE_ORIGIN,old=baseline?await context.newPage():null
 const metrics=async d=>d.evaluate(el=>{
  const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}}
  const table=el.querySelector('.barcode-location-table'),row=table.querySelector('tbody tr')
  return {dialog:r(el),body:r(el.querySelector('.dialog-body')),footer:r(el.querySelector('footer')),table:r(table),row:r(row),display:getComputedStyle(row).display,overflow:table.scrollWidth>table.clientWidth+1,dialogOverflow:el.scrollWidth>el.clientWidth+1,tableOverflowY:getComputedStyle(table).overflowY,cells:[...row.cells].map(e=>({box:r(e),overflow:e.scrollWidth>e.clientWidth+1})),buttons:[...table.querySelectorAll('button')].map(r),map:r(el.querySelector('.barcode-location-map')),heading:r(el.querySelector('.organization-dialog-heading'))}
 })
 for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/app/barcode-lookup');await scan();await open();await routeReady();await dialog.locator('.dialog-body').evaluate(e=>e.scrollTop=0)
  const cards=width<=600||(width<=1024&&height<=500),m=await metrics(dialog)
  assert.equal(m.display,cards?'grid':'table-row');assert(!m.dialogOverflow);assert(m.dialog.x>=0&&m.dialog.right<=width);assert(m.dialog.y>=0&&m.dialog.bottom<=height+1);assert(m.footer.bottom<=height+1)
  assert.equal(await table.locator('tbody tr').count(),3)
  assert.match(await table.locator('tbody tr').nth(0).innerText(),/500 EA/);assert.match(await table.locator('tbody tr').nth(1).innerText(),/200 EA/);assert.match(await table.locator('tbody tr').nth(2).innerText(),/40 EA/)
  if(cards){assert(!m.overflow);assert.equal(m.tableOverflowY,'visible');for(const c of m.cells)assert(!c.overflow);for(const b of m.buttons){assert(b.x>=0&&b.right<=width);assert(b.h>=44)};assert.equal(await dialog.locator('.barcode-location-mobile-action:visible').count(),3)}
  else {assert.equal(await dialog.locator('.barcode-location-mobile-action:visible').count(),0)}
  if(old){await old.setViewportSize({width,height});await old.goto(baseline+'/app/barcode-lookup');await old.getByRole('textbox',{name:'조회 바코드'}).fill('QA-PALLET');await old.getByRole('textbox',{name:'조회 바코드'}).press('Enter');await old.getByRole('button',{name:'상품 위치 찾기',exact:true}).click();await old.locator('.warehouse-plan-canvas[data-route-points]').waitFor();const oldDialog=old.getByRole('dialog');await oldDialog.locator('.dialog-body').evaluate(e=>e.scrollTop=0);const b=await metrics(oldDialog)
   if(!cards){delete b.cells;const current={...m};delete current.cells;assert.deepEqual(current,b,'tablet/PC geometry unchanged')}
   console.log('GEOMETRY',width,height,'table',b.table.w,'->',m.table.w,'row',m.row.w,'overflow',b.overflow,'->',m.overflow)
  }
  // Every location has its own selected key, including two different cells in rack r0.
  const routes=[]
  for(let i=0;i<3;i++){
   const tr=table.locator('tbody tr').nth(i);await tr.locator('button').click();assert.equal(await tr.getAttribute('aria-selected'),'true');assert.equal(await table.locator('tr[aria-selected=true]').count(),1);assert.equal(await tr.locator('button').getAttribute('aria-pressed'),'true');routes.push(await canvas.getAttribute('data-route-points'))
  }
  assert.notEqual(routes[0],routes[1]);assert.equal(routes[0],routes[2],'two distinct locations in the same rack retain the same rack path')
  await dialog.getByRole('button',{name:'도면 확대',exact:true}).click();assert.equal(await canvas.getAttribute('data-route-points'),routes[2]);await dialog.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click()
  await dialog.getByRole('button',{name:/창고 선택/}).click();await page.getByRole('option',{name:/상온 QA 창고/}).click();await routeReady();await table.locator('tbody tr').first().waitFor();assert.equal(await table.locator('tbody tr').count(),1);assert.match(await table.innerText(),/R-03/);assert.match(await table.innerText(),/500 EA/)
  await close();assert.match(await page.getByLabel('조회한 바코드 포장 단위').innerText(),/QA-PALLET · 파레트 · 1,000 EA/)
  console.log('PASS',width,height,'layout, current quantities, independent location keys, routes, warehouse switch, zoom and close')
 }
 mode='pages';await scan();await open();await page.getByRole('button',{name:'2페이지',exact:true}).waitFor();await page.getByRole('button',{name:'2페이지',exact:true}).click();assert.equal(await table.locator('tbody tr').count(),20);assert.match(await table.locator('tbody tr').first().innerText(),/위치 20/);await table.locator('tbody tr').last().locator('button').click();assert.match(await table.locator('tr[aria-selected=true]').innerText(),/위치 39/);await close()
 mode='zero';await scan();await open();await dialog.getByText('현재 보관 중인 재고가 없습니다.',{exact:true}).waitFor();assert.equal(await table.count(),0);await close()
 mode='floor';await scan();await open();await table.getByText('미배치 재고 · 랙 미지정',{exact:true}).waitFor();await table.locator('button').click();assert.equal(await canvas.getAttribute('data-route-points'),null);await close()
 mode='denied';const before=reads.filter(r=>r.includes('stock-overview')).length;await scan();await page.getByText('재고 현황 조회 권한이 없습니다.',{exact:true}).waitFor();assert.equal(reads.filter(r=>r.includes('stock-overview')).length,before);assert.equal(await page.getByRole('button',{name:'상품 위치 찾기',exact:true}).count(),0)
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log('PASS bounded pagination, floor/empty stock, denied permission; read-only mocked API only')
}finally{await browser.close()}
