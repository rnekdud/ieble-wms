import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',root='/api/tenants/fixture'
const product={id:'p',code:'PACK-01',name:'포장 재고 QA',unit:'EA',isActive:true,version:'v1',images:[],innerPackQuantity:10,outerPackQuantity:5,outerPackUnit:'INNER',palletPackQuantity:20,createdAt:'2026-11-11',updatedAt:'2026-11-11',barcodes:['EA','INNER','OUTER','PALLET'].map((packageCode,i)=>({id:'b'+i,value:'QA-'+packageCode,packageCode,isPrimary:i===0,barcodeType:'External'}))}
let mode='normal',stockRequests=0
const errors=[],unexpected=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.origin!==origin){unexpected.push(u.origin);return route.abort()}
  if(!u.pathname.startsWith('/api/'))return route.continue()
  assert.equal(req.method(),'GET','barcode lookup must never write')
  if(u.pathname==='/api/auth/me')return route.fulfill({json:{user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'격리 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'}})
  if(u.pathname==='/api/health/db')return route.fulfill({json:{status:'connected'}})
  if(u.pathname===root+'/workspace')return route.fulfill({json:{id:'fixture',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{products:['menu','read','create','update'],'stock-overview':['menu','read']}}})
  if(u.pathname===root+'/pages/barcode-lookup'||u.pathname===root+'/pages/products')return route.fulfill({json:{}})
  if(u.pathname===root+'/barcodes/lookup')return route.fulfill({json:{kind:'product',item:product,inventoryAvailable:mode!=='denied'}})
  if(u.pathname===root+'/products/p')return route.fulfill({json:{product,canViewCost:false}})
  if(u.pathname===root+'/products/options')return route.fulfill({json:{units:['EA'],categories:[],productTypes:[]}})
  if(u.pathname===root+'/reports/stock-overview'){
   stockRequests++;assert.equal(u.searchParams.get('productId'),'p');assert.equal(u.searchParams.get('view'),'product');assert.equal(u.searchParams.has('warehouseId'),false)
   if(mode==='error')return route.fulfill({status:503,json:{message:'재고 조회 실패'}})
   const row={productId:'p',unit:product.unit,quantity:mode==='zero'?0:1200,reservedQuantity:mode==='zero'?0:100,availableQuantity:mode==='zero'?0:1100}
   const items=mode==='mixed'?[row,{...row,unit:'BOX',quantity:7,reservedQuantity:2,availableQuantity:5}]:[row]
   return route.fulfill({json:{items,total:items.length,page:1,pageSize:20}})
  }
  unexpected.push(u.pathname);return route.fulfill({status:404,json:{message:'Unexpected request'}})
 })
 await context.addInitScript(()=>{
  window.qaCamera={codes:[],stops:0,denied:false,fixed:false,focus:[]}
  navigator.mediaDevices.getUserMedia=async()=>{
   if(window.qaCamera.denied)throw new DOMException('denied','NotAllowedError')
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;canvas.getContext('2d').fillRect(0,0,640,480);const stream=canvas.captureStream(10)
   for(const track of stream.getTracks()){
    const settings={focusMode:'continuous'}
    track.getCapabilities=()=>({focusMode:window.qaCamera.fixed?['manual']:['manual','single-shot','continuous']})
    track.getSettings=()=>settings
    track.applyConstraints=async c=>{window.qaCamera.focus.push(c.advanced[0].focusMode);Object.assign(settings,c.advanced[0])}
    const stop=track.stop.bind(track);track.stop=()=>{window.qaCamera.stops++;stop()}
   }
   return stream
  }
  window.BarcodeDetector=class{static async getSupportedFormats(){return ['code_128']}async detect(){return window.qaCamera.codes.map(rawValue=>({rawValue}))}}
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/app/barcode-lookup')
  const camera=page.getByRole('button',{name:'카메라 스캔',exact:true}),dialog=page.getByRole('dialog',{name:'바코드 스캔',exact:true})
  await camera.click();await dialog.waitFor();await page.waitForFunction(()=>document.querySelector('video')?.srcObject)
  const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);assert(box.y>=0&&box.y+box.height<=height+1)
  assert.equal(await dialog.locator('video').evaluate(e=>getComputedStyle(e).objectFit),'contain')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  const heading=dialog.locator('.organization-dialog-heading');assert.equal(await heading.getByRole('button',{name:'초점 다시 맞추기',exact:true}).count(),1)
  const titleBox=await heading.getByRole('heading',{name:'바코드 스캔'}).boundingBox(),focusBox=await heading.getByRole('button',{name:'초점 다시 맞추기',exact:true}).boundingBox()
  assert(Math.abs(titleBox.y+titleBox.height/2-focusBox.y-focusBox.height/2)<1,'title and focus button share a row')
  assert(focusBox.x-titleBox.x-titleBox.width>=6&&focusBox.x-titleBox.x-titleBox.width<=16,'focus button next to title')
  await dialog.getByRole('button',{name:'초점 다시 맞추기',exact:true}).click();await dialog.getByRole('button',{name:'초점 맞추는 중…',exact:true}).waitFor();await dialog.getByRole('button',{name:'초점 다시 맞추기',exact:true}).waitFor()
  assert.deepEqual(await page.evaluate(()=>window.qaCamera.focus.slice(-2)),['single-shot','continuous'])
  const footer=dialog.locator('.dialog-actions');const buttons=await footer.locator('button').all();const a=await buttons[0].boundingBox(),b=await buttons[1].boundingBox();assert.equal(b.x-a.x-a.width,8);assert.equal(await buttons[1].evaluate(e=>getComputedStyle(e).marginRight),'12px');assert(b.x+b.width<=width);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert(await page.evaluate(()=>window.qaCamera.stops>0))
  await camera.click();await dialog.waitFor();await page.evaluate(()=>window.qaCamera.codes=['QA-PALLET'])
  await page.getByRole('region',{name:'바코드 조회 결과'}).waitFor();await dialog.waitFor({state:'detached'})
  assert.match(await page.getByLabel('조회한 바코드 포장 단위').innerText(),/QA-PALLET/)
  await page.waitForTimeout(300);assert.equal(await page.getByRole('region',{name:'바코드 조회 결과'}).count(),1)
  await page.evaluate(()=>window.qaCamera.codes=[]);await camera.click();await dialog.waitFor();await dialog.getByRole('button',{name:'직접 입력하기',exact:true}).click();await dialog.waitFor({state:'detached'});await page.waitForFunction(()=>document.activeElement?.id==='barcode-lookup-input')
  await page.evaluate(()=>window.qaCamera.fixed=true);await camera.click();await dialog.waitFor();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);assert(await dialog.getByRole('button',{name:'초점 다시 맞추기',exact:true}).isDisabled());assert.match(await dialog.getByRole('button',{name:'초점 다시 맞추기',exact:true}).getAttribute('title'),/지원하지/);await dialog.getByRole('button',{name:'닫기',exact:true}).click();await dialog.waitFor({state:'detached'})
  await page.evaluate(()=>window.qaCamera.denied=true);await camera.click();await page.getByRole('alert').filter({hasText:'카메라 권한이 거부'}).waitFor()
  assert.equal(page.url(),origin+'/app/barcode-lookup')
  console.log('PASS camera popup, refocus, Escape/manual/denial, one-shot product lookup',width)
 }
 await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/app/products/new');await page.getByRole('button',{name:'카메라 스캔',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'바코드 스캔',exact:true});await dialog.waitFor()
 const manual=await dialog.getByRole('button',{name:'직접 입력하기',exact:true}).boundingBox(),close=await dialog.getByRole('button',{name:'카메라 종료',exact:true}).boundingBox();assert.equal(close.x-manual.x-manual.width,8);assert.equal(await dialog.getByRole('button',{name:'카메라 종료',exact:true}).evaluate(e=>getComputedStyle(e).marginRight),'12px')
 await page.waitForFunction(()=>document.querySelector('video')?.srcObject);await dialog.getByRole('button',{name:'카메라 종료',exact:true}).click();await dialog.waitFor({state:'detached'});assert(await page.evaluate(()=>window.qaCamera.stops>0))
 console.log('PASS desktop camera 종료 12px right margin, original 8px button gap and track cleanup')
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
}finally{await browser.close()}
