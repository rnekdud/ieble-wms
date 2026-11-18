import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',root='/api/tenants/fixture'
const shape=(type,x,y,width,height,extra={})=>({id:`${type}-${x}-${y}`,type,x,y,width,height,rotation:0,shape:'rectangle',label:type,rackId:null,zoneId:null,locationId:null,fill:type==='rack'?'#a7ccdf':'#ddd',...extra})
const objects=[shape('door',.5,.95,.12,.025,{label:'하단 출입구'}),shape('zone',.5,.28,.84,.32),shape('zone',.5,.72,.84,.32),shape('wall',.5,.05,.94,.016),shape('wall',.04,.5,.01,.9),shape('wall',.96,.5,.01,.9),shape('wall',.24,.95,.4,.016),shape('wall',.76,.95,.4,.016)]
for(let i=0;i<6;i++)objects.push(shape('rack',[.22,.5,.78][i%3],i<3?.28:.72,.18,.2,{id:'obj-r'+i,rackId:'r'+i,label:'R-0'+(i+1)}))
const plan={exists:true,version:'v1',schemaVersion:1,aspectRatio:1.6,objects}
const product={id:'p',code:'PR03',name:'경로 QA 상품',unit:'EA',isActive:true,version:'v1',images:[],innerPackQuantity:10,outerPackQuantity:5,outerPackUnit:'INNER',palletPackQuantity:20,createdAt:'2026-11-11',updatedAt:'2026-11-11',barcodes:['EA','PALLET'].map((packageCode,i)=>({id:'b'+i,value:'QA-'+packageCode,packageCode,isPrimary:i===0,barcodeType:'External'}))}
const row={productId:'p',unit:'EA',warehouseId:'w1',warehouseName:'냉동 QA 창고',zoneId:'z1',zoneName:'냉동 구역',rackId:'r0',rackCode:'R-01',rackName:'냉동 랙',locationId:'l1',locationName:'1단 2칸',locationCode:'BIN-01',quantity:300,reservedQuantity:30,availableQuantity:270}
let mode='normal';const errors=[],reads=[],unexpected=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',hasTouch:true})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;assert.equal(u.origin,origin)
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
    items=w==='w1'?[row,{...row,quantity:200,reservedQuantity:20,availableQuantity:180,lotNumber:'B'},{...row,rackId:'r4',rackCode:'R-05',locationId:'l2',locationName:'2단 1칸',locationCode:'BIN-02',quantity:200,reservedQuantity:10,availableQuantity:190}]:[{...row,warehouseId:'w2',rackId:'r2',rackCode:'R-03',locationId:'l3',quantity:500}]
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
 const inspectMotion=()=>page.evaluate(()=>{
  const stage=window.qaKonva.stages.find(s=>s.container().isConnected),layer=stage.findOne('.barcode-route-layer'),trail=stage.findOne('.barcode-route-trail'),line=stage.findOne('.barcode-route-line'),dot=stage.findOne('.barcode-route-motion')
  return {paint:layer.getCanvas()._canvas.toDataURL(),visible:trail.isVisible(),frame:trail.getAttr('trailFrame'),dot:dot.position(),dotColor:dot.fill(),dotOpacity:dot.opacity(),dotVisible:dot.isVisible(),diameter:dot.radius()*2*stage.scaleX(),lineWidth:line.strokeWidth()*stage.scaleX(),color:line.stroke(),join:line.lineJoin(),tension:line.tension(),points:line.points(),dots:stage.find('.barcode-route-motion').length,fixed:stage.find('.barcode-route-start').length+stage.find('.barcode-route-end').length,curves:stage.find('Path').length,chevrons:stage.find('.barcode-route-chevron').length,running:[...window.qaKonva.Animation.animations].filter(a=>a.getLayers().includes(layer)).length}
 })
 const close=async()=>{await page.getByRole('dialog').locator('footer').getByRole('button',{name:'닫기',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'})}
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/app/barcode-lookup');await scan()
  await page.getByLabel('상품 전체 재고').locator('dd').first().waitFor()
  assert.deepEqual(await page.getByLabel('상품 전체 재고').locator('dd').allTextContents(),['1,200개','100개','1,100개'])
  assert.equal(await canvas.count(),0,'no inline map added')
  const initial=await page.locator('.barcode-product-layout').boundingBox()
  if(width>=1280){const title=await page.locator('.barcode-result-heading h2').boundingBox(),button=await page.getByRole('button',{name:'상품 위치 찾기'}).boundingBox();assert(button.x>=title.x+title.width&&button.y<title.y+title.height,'button right beside product title')}
  const beforeReads=reads.length;await open();await routeReady()
  await page.evaluate(()=>import('/tests/fixtures/plan-rotation-probe.ts'))
  await page.waitForFunction(()=>window.qaKonva.stages.some(s=>s.container().isConnected&&s.findOne('.barcode-route-trail')))
  const routePoints=JSON.parse(await canvas.getAttribute('data-route-points'))
  assert(routePoints.length<=5,'staircase replaced by long orthogonal interior legs')
  const motion=await inspectMotion()
  assert.equal(motion.running,1);assert.equal(motion.lineWidth,1);assert.equal(motion.dots,1,'one moving point');assert.equal(motion.fixed,0,'no endpoint markers')
  assert.equal(motion.join,'miter');assert.equal(motion.tension,0);assert.equal(motion.curves,0);assert.equal(motion.chevrons,0)
  assert.equal(motion.diameter,9);assert.equal(motion.dotColor,'#258BFF')
  assert.deepEqual(motion.points,routePoints.flatMap(p=>[p.x*1200,p.y*1200/1.6]),'every original coordinate unchanged')
  await page.waitForFunction(()=>{const f=window.qaKonva.stages.find(s=>s.container().isConnected)?.findOne('.barcode-route-trail')?.getAttr('trailFrame');return f?.distance>40&&f.distance<150})
  const moving=await inspectMotion();await page.waitForTimeout(300);const later=await inspectMotion()
  assert(later.frame.distance>moving.frame.distance,'point advances from entrance to destination');assert.notDeepEqual(later.dot,moving.dot);assert.notEqual(later.paint,moving.paint,'canvas pixels animate')
  for(const state of [moving,later]){
   assert.deepEqual(state.dot,state.frame.point);assert.equal(state.dotOpacity,state.frame.opacity)
   assert(state.frame.trail.every(p=>p.distance<=state.frame.distance),'tail never ahead of point')
   const tail=state.frame.trail;assert.deepEqual({x:tail.at(-1).x,y:tail.at(-1).y},state.dot)
   for(let i=1;i<tail.length;i++)assert(tail[i].alpha>=tail[i-1].alpha,'tail fades backwards')
  }
  assert.notDeepEqual(later.frame.trail,moving.frame.trail,'trail position and opacity change with point')
  if(width===1920){
   await page.waitForFunction(()=>{const f=window.qaKonva.stages.find(s=>s.container().isConnected)?.findOne('.barcode-route-trail')?.getAttr('trailFrame');return f?.trail.length>=3&&f.opacity===1})
   const corner=await inspectMotion();assert(corner.frame.trail.length>=3,'actual animated trail retains a bend')
   await page.waitForFunction(()=>{const f=window.qaKonva.stages.find(s=>s.container().isConnected)?.findOne('.barcode-route-trail')?.getAttr('trailFrame'),line=window.qaKonva.stages.find(s=>s.container().isConnected)?.findOne('.barcode-route-line'),p=line?.points();return f&&Math.hypot(f.point.x-p.at(-2),f.point.y-p.at(-1))<.001&&f.opacity>.05&&f.opacity<.8})
   const arrival=await inspectMotion();assert(arrival.dotOpacity>0&&arrival.dotOpacity<1,'arrival fades')
   await page.waitForFunction(()=>window.qaKonva.stages.find(s=>s.container().isConnected)?.findOne('.barcode-route-motion')?.opacity()===0)
   await page.waitForFunction(()=>{const f=window.qaKonva.stages.find(s=>s.container().isConnected)?.findOne('.barcode-route-trail')?.getAttr('trailFrame');return f?.distance>0&&f.distance<40&&f.opacity>.1})
   const restart=await inspectMotion();assert.equal(restart.dots,1);assert(restart.frame.distance<40,'restarts at entrance after pause')
  }
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.waitForFunction(()=>window.qaKonva.Animation.animations.size===0)
  const reduced=await inspectMotion();assert.equal(reduced.visible,false);assert.equal(reduced.chevrons,0);assert.equal(reduced.dotVisible,false);assert.deepEqual(reduced.points,motion.points,'static original path remains with reduced motion');assert.equal(reduced.color,'#258BFF')
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.waitForFunction(()=>window.qaKonva.Animation.animations.size===1)

  assert.equal(reads.slice(beforeReads).some(p=>p.endsWith('/w2/plan')),false,'load only selected warehouse plan')
  const dialog=page.getByRole('dialog'),bounds=await dialog.boundingBox()
  assert(bounds.width<=width&&bounds.height<=901,'responsive dialog within viewport')
  assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'no modal horizontal overflow')
  assert.equal(await dialog.getByText('2D 창고 도면',{exact:true}).count(),0)
  assert.equal(await dialog.getByRole('heading',{name:/창고:/}).count(),0)
  const inside=await dialog.locator('.barcode-location-map').evaluate(el=>{const map=el.getBoundingClientRect();return [...el.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=map.left&&r.right<=map.right&&r.top>=map.top&&r.bottom<=map.bottom})});assert(inside,'map controls stay inside drawing')
  assert.equal(await dialog.getByLabel('선택한 보관위치').count(),0,'redundant location caption removed')
  const heading=await dialog.getByRole('heading',{name:'보관 위치 상세'}).boundingBox(),table=await dialog.locator('.barcode-location-table').boundingBox();assert(table.y-heading.y-heading.height<=5,'table close to heading')
  const tableStyle=await dialog.locator('.barcode-location-table').evaluate(el=>{const th=getComputedStyle(el.querySelector('th')),td=getComputedStyle(el.querySelector('td'));return {border:getComputedStyle(el).borderTopWidth,headPadding:th.padding,headSize:th.fontSize,cellPadding:td.padding,cellSize:td.fontSize}})
  if(width>600)assert.deepEqual(tableStyle,{border:'1px',headPadding:'12px 14px',headSize:'12px',cellPadding:'13px 14px',cellSize:'13px'},'shared business table design')
  assert.equal(await page.locator('.barcode-location-table tbody tr').count(),2)
  assert.match(await page.locator('.barcode-location-table tbody tr').first().innerText(),/500 EA/,'LOT rows aggregated once')
  await page.locator('.barcode-location-table').getByRole('button',{name:/2단 1칸 BIN-02/}).click()
  const before=await canvas.getAttribute('data-route-points');assert.equal((await inspectMotion()).running,1,'rack change replaces animation')
  await dialog.getByRole('button',{name:'도면 확대',exact:true}).click();assert.equal(await canvas.getAttribute('data-route-points'),before);assert(Math.abs((await inspectMotion()).diameter-9)<1e-6,'zoom preserves point diameter')
  await dialog.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click()
  await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox(),scale=Number(await canvas.getAttribute('data-view-scale'))
  const x=box.x+box.width/2+(.22-.5)*1200*scale,y=box.y+box.height/2+(.28-.5)*1200/1.6*scale
  if(width===390)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y)
  await page.waitForFunction(()=>document.querySelector('.barcode-location-table tr[aria-selected=true]')?.textContent.includes('R-01'))
  assert.notEqual(await canvas.getAttribute('data-route-points'),before,'rack hit testing changes route')
  await dialog.getByRole('button',{name:/창고 선택/}).click();await page.getByRole('option',{name:/상온 QA 창고/}).click();await routeReady()
  assert.match(await page.locator('.barcode-location-table tbody').innerText(),/R-03/)
  await close();assert.equal(await page.evaluate(()=>window.qaKonva.Animation.animations.size),0,'closing stops animation');assert.deepEqual(await page.locator('.barcode-product-layout').boundingBox(),initial,'closing restores unchanged results layout')
  assert.match(await page.getByLabel('조회한 바코드 포장 단위').innerText(),/QA-PALLET · 파레트 · 1,000 EA/)
  await open();await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  console.log('PASS '+width+'px: popup, locations, rack click, route, zoom, warehouse switch, close/ESC and original UI')
 }
 for(const [m,message] of [['zero','현재 보관 중인 재고가 없습니다.'],['no-door','이동 가능한 경로를 찾을 수 없습니다.'],['missing','등록된 창고 도면이 없습니다.'],['floor','미배치 재고 · 랙 미지정'],['location-error','서버 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'],['plan-error','도면을 조회할 수 없습니다.']]){
  mode=m;await scan();await open();await page.getByRole('dialog').getByText(message,{exact:false}).first().waitFor();assert.equal(await page.locator('.warehouse-plan-canvas[data-route-points]').count(),0);await close()
 }
 mode='blocked';await scan();await open();await page.getByText('이동 가능한 경로를 찾을 수 없습니다.',{exact:true}).waitFor();await page.locator('.barcode-location-table').getByRole('button',{name:/2단 1칸 BIN-02/}).click();await routeReady();await close()
 mode='pages';await scan();await open();await page.getByRole('button',{name:'2페이지',exact:true}).waitFor();assert(reads.some(r=>r.includes('view=location')&&r.includes('page=2')));await page.getByRole('button',{name:'2페이지',exact:true}).click();assert.equal(await page.locator('.barcode-location-table tbody tr').count(),20);await close()
 mode='denied';const before=reads.filter(r=>r.includes('stock-overview')).length;await scan();await page.getByText('재고 현황 조회 권한이 없습니다.',{exact:true}).waitFor();assert.equal(reads.filter(r=>r.includes('stock-overview')).length,before);assert.equal(await page.getByRole('button',{name:'상품 위치 찾기',exact:true}).count(),0)
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS empty stock, missing/blocked paths, no plan, denied access, floor stock, pagination; all API requests read-only and mocked '+origin)
}finally{await browser.close()}
