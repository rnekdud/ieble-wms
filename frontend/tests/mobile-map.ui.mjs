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

 const cdp=await context.newCDPSession(page)
 const send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,id)=>({id,x:p.x,y:p.y,radiusX:2,radiusY:2}))})
 for(const width of [360,390,430,768,1024]){
  await page.setViewportSize({width,height:900});await page.goto(origin+'/app/barcode-lookup');await scan();await open();await routeReady();await canvas.scrollIntoViewIfNeeded()
  await page.evaluate(()=>import('/tests/fixtures/plan-rotation-probe.ts'))
  const box=await canvas.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2
  const initial={x:Number(await canvas.getAttribute('data-view-x')),scale:Number(await canvas.getAttribute('data-view-scale')),route:await canvas.getAttribute('data-route-points')}
  await send('touchStart',[{x,y}]);await send('touchMove',[{x:x+30,y:y+20}]);await page.waitForTimeout(80);await send('touchEnd',[])
  assert(Math.abs(Number(await canvas.getAttribute('data-view-x'))-initial.x-30)<2,'single finger pans')
  await send('touchStart',[{x:x-30,y},{x:x+30,y}]);await send('touchMove',[{x:x-55,y},{x:x+55,y}]);await page.waitForTimeout(80);await send('touchEnd',[])
  assert(Number(await canvas.getAttribute('data-view-scale'))>initial.scale*1.7,'two finger pinch zooms')
  assert.equal(await canvas.getAttribute('data-route-points'),initial.route,'touch does not change path/document')
  const motion1=await inspectMotion();await page.waitForTimeout(250);const motion2=await inspectMotion();assert.equal(motion1.dots,1);assert.notDeepEqual(motion1.dot,motion2.dot);assert.equal(motion1.dotColor,'#258BFF')
  await page.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click();assert(Math.abs(Number(await canvas.getAttribute('data-view-scale'))-initial.scale)<.001)
  await close();assert.equal(await page.evaluate(()=>window.qaKonva.Animation.animations.size),0)
  console.log('PASS synthetic touch pan/pinch, stable route and one blue animation',width)
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
}finally{await browser.close()}
