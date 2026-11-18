import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const origin=process.env.WMS_UI_ORIGIN||'http://localhost:5176',tenant='camera-qa'
const browser=await chromium.launch({channel:'chrome',headless:true})
const lookups=[],errors=[]
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
 await context.routeWebSocket('**/*',()=>{})
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.replace(`/api/tenants/${tenant}`,'')
  assert.equal(url.origin,origin)
  if(!url.pathname.startsWith('/api/'))return route.continue()
  assert.equal(request.method(),'GET','UI checks must not write business data')
  const json=data=>route.fulfill({json:data})
  if(path==='/api/auth/me')return json({user:{id:'qa',displayName:'카메라 QA',userName:'qa',email:'qa@example.test',systemRole:'User',mustChangePassword:false},memberships:[{tenantId:tenant,name:'카메라 QA',role:'Employee',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:tenant})
  if(path==='/workspace')return json({id:tenant,name:'카메라 QA',role:'Employee',permissions:{products:['menu','read']},serviceStatus:'Active',billingStatus:'Active',billingAccess:{state:'Active',canAccessWms:true,hasRegisteredCard:true},canManageBilling:false})
  if(path==='/barcodes/lookup'){lookups.push(url.searchParams.get('value'));return route.fulfill({status:404,json:{message:'QA 바코드 조회 확인'}})}
  return json({items:[],total:0,page:1,pageSize:20})
 })
 await context.addInitScript(()=>{
  window.qa={codes:[],stopped:0,requests:0,denied:false}
  navigator.mediaDevices.getUserMedia=async()=>{
   window.qa.requests++;if(window.qa.denied)throw new DOMException('denied','NotAllowedError')
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=240;canvas.getContext('2d').fillRect(0,0,640,240)
   const stream=canvas.captureStream(10)
   for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{window.qa.stopped++;stop()}}
   return stream
  }
  window.BarcodeDetector=class {static async getSupportedFormats(){return ['ean_13','code_128']}async detect(){return window.qa.codes.map(rawValue=>({rawValue}))}}
 })
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
 const load=async()=>{await page.goto(origin+'/app/barcode-lookup');await page.getByRole('heading',{name:'바코드 조회',exact:true}).waitFor()}
 const button=()=>page.getByRole('button',{name:'카메라 스캔',exact:true}),dialog=()=>page.getByRole('dialog',{name:'바코드 스캔',exact:true})
 const open=async()=>{await button().click();await dialog().waitFor();await page.waitForFunction(()=>document.querySelector('.mobile-camera-dialog video')?.srcObject)}
 for(const width of [360,390,430,768,1440]){
  await page.setViewportSize({width,height:844});await load()
  if(width===1440){assert.equal(await button().count(),0);continue}
  assert.equal(await button().count(),1)
  const title=await page.getByRole('heading',{name:'바코드 조회',exact:true}).boundingBox(),b=await button().boundingBox(),heading=await page.locator('.barcode-lookup-page > .wms-page-heading').boundingBox()
  assert(title.x+title.width<=b.x);assert(Math.abs(b.x+b.width-heading.x-heading.width)<1);assert(Math.abs(title.y+title.height/2-b.y-b.height/2)<1)
  await page.getByLabel('조회 바코드',{exact:true}).fill('KEEP')
  await open();const stopped=await page.evaluate(()=>window.qa.stopped)
  const footer=dialog().locator('footer');assert.equal(await footer.getByRole('button',{name:'닫기',exact:true}).count(),1)
  const bounds=await dialog().boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1)
  await footer.getByRole('button',{name:'닫기',exact:true}).click()
  await dialog().waitFor({state:'detached'});assert(await page.evaluate(old=>window.qa.stopped>old,stopped))
  assert.equal(await page.getByLabel('조회 바코드',{exact:true}).inputValue(),'KEEP');assert.equal(lookups.length,0)
  console.log('PASS header action alignment, close button, preserved input and stream release',width)
 }
 await page.setViewportSize({width:390,height:844});await load();await open()
 let stopped=await page.evaluate(()=>window.qa.stopped)
 await page.keyboard.press('Escape');await dialog().waitFor({state:'detached'});assert(await page.evaluate(old=>window.qa.stopped>old,stopped))
 await open();await dialog().getByRole('button',{name:'직접 입력하기',exact:true}).click();await dialog().waitFor({state:'detached'})
 await page.waitForFunction(()=>document.activeElement?.id==='barcode-lookup-input')
 await page.evaluate(()=>window.qa.denied=true);await button().click();await page.getByRole('alert').waitFor()
 assert.equal(await page.locator('.wms-page-actions [role=alert]').count(),0)
 await page.evaluate(()=>{window.qa.denied=false;window.qa.codes=['8801234567893']});await button().click()
 await page.getByText('QA 바코드 조회 확인',{exact:true}).waitFor();await dialog().waitFor({state:'detached'})
 assert.deepEqual(lookups,['8801234567893'])
 await page.evaluate(()=>window.qa.codes=[]);await open();stopped=await page.evaluate(()=>window.qa.stopped)
 await page.setViewportSize({width:1440,height:900});await page.waitForFunction(old=>window.qa.stopped>old,stopped);assert.equal(await dialog().count(),0)
 assert.deepEqual(errors,[])
 console.log('PASS Escape, manual focus, camera denial, one-shot lookup, unmount cleanup; isolated camera mocks, no physical-device claim')
}finally{await browser.close()}
