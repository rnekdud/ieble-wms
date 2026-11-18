import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',id='12345678-1234-1234-1234-123456789012'
const make=()=>({shipment:{id,number:'OUT-QA',warehouseId:'w',status:'Picking',version:'v1'},lines:[{id:'l1',productId:'p1',productName:'메로나',productCode:'P1',unit:'EA'},{id:'l2',productId:'p2',productName:'다른 상품',productCode:'P2',unit:'EA'}],allocations:[{id:'a1',lineId:'l1',quantity:10,pickedQuantity:0,inspectedQuantity:0,locationCode:'A-01',state:'Active',lotNumber:'LOT1'},{id:'a2',lineId:'l2',quantity:10,pickedQuantity:1,inspectedQuantity:0,locationCode:'A-02',state:'Active'}],movements:[]})
let data=make(),calls=[],manualFailure='',scanLost=false,version=1;const replays=new Set(),errors=[];let barcodeFailure=false,barcodeLookups=0;const longBarcode='8801234567890'+'1234567890'.repeat(5)
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin)
  if(url.pathname==='/__mixed')return route.fulfill({contentType:'text/html',body:`<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/shipment-mixed-input-ui.tsx"></script></html>`})
  if(!url.pathname.startsWith('/api/'))return route.continue()
  if(url.pathname==='/api/auth/csrf')return route.fulfill({json:{token:'mock'}})
  if(url.pathname.endsWith('/choices')){
   assert.equal(req.method(),'GET');assert.equal(url.searchParams.get('kind'),'product-table');assert.equal(url.searchParams.get('warehouseId'),'w');assert(!url.searchParams.has('shipmentId'));assert.deepEqual(url.searchParams.getAll('ids'),['p1','p2']);barcodeLookups++
   if(barcodeFailure)return route.fulfill({status:503,json:{message:'mock barcode failure'}})
   return route.fulfill({json:{items:[{id:'p1',barcode:longBarcode},{id:'p2',barcode:null}],total:2,page:1,pageSize:100}})
  }
  if(req.method()==='GET')return route.fulfill({json:data})
  const body=req.postDataJSON();calls.push({path:url.pathname,body});const fail=(status,message)=>route.fulfill({status,json:{message}})
  if(url.pathname.endsWith('/picking')){
   if(manualFailure==='400')return fail(400,'수량 검증 실패')
   if(manualFailure==='409'){data.shipment.version='v'+(++version);return fail(409,'다른 작업에서 변경된 문서입니다.')}
   if(body.version!==data.shipment.version)return fail(409,'다른 작업에서 변경된 문서입니다.')
   assert.equal(body.allocations.length,2)
   for(const item of body.allocations){const a=data.allocations.find(a=>a.id===item.allocationId);if(!Number.isInteger(item.quantity)||item.quantity<a.pickedQuantity||item.quantity>a.quantity)return fail(400,'수량 검증 실패')}
   for(const item of body.allocations)data.allocations.find(a=>a.id===item.allocationId).pickedQuantity=item.quantity
   data.shipment.version='v'+(++version)
   if(body.complete){assert(data.allocations.every(a=>a.pickedQuantity===a.quantity));data.shipment.status='Picked'}
   if(manualFailure==='lost')return fail(503,'저장 응답 손실')
   return route.fulfill({json:data})
  }
  assert(url.pathname.endsWith('/scan-picking'),'no other writes')
  const a=data.allocations[body.barcode==='OTHER'?1:0],factor=body.barcode==='PACK'?2:1,replayed=replays.has(body.requestId)
  const outcome=replayed?'applied':a.pickedQuantity+factor>a.quantity?'over-limit':'applied'
  if(outcome==='applied'&&!replayed){a.pickedQuantity+=factor;replays.add(body.requestId);data.shipment.version='v'+(++version)}
  if(scanLost){scanLost=false;return fail(503,'스캔 응답 손실')}
  await new Promise(r=>setTimeout(r,30))
  return route.fulfill({json:{outcome,detail:data,allocationId:a.id,requestId:body.requestId,replayed,candidateAllocationIds:[],locationId:null}})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 const barcode=page.getByLabel('피킹 바코드',{exact:true}),qty=page.getByLabel('작업 수량 1',{exact:true}),other=page.getByLabel('작업 수량 2',{exact:true})
 const ready=async()=>page.waitForFunction(()=>{const q=document.querySelector('input[aria-label="작업 수량 1"]');return q&&!q.disabled&&!document.body.innerText.includes('건 처리 대기')})
 async function reset(query=''){data=make();calls=[];manualFailure='';scanLost=false;version=1;replays.clear();await page.goto(origin+'/__mixed'+query);await qty.waitFor()}
 async function scan(code='EA',key='Enter'){await barcode.fill(code);await barcode.press(key);await ready()}
 for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await reset();await page.locator('.shipment-product-barcode').filter({hasText:longBarcode}).waitFor();assert(await page.locator('.shipment-product-barcode').filter({hasText:/^미등록$/}).isVisible());await qty.fill('5');await page.waitForTimeout(60)
  assert(await qty.evaluate(e=>e===document.activeElement),'manual typing keeps focus');assert.equal(calls.length,0,'typing alone never saves');assert(await barcode.isEnabled())
  await scan();assert.equal(await qty.inputValue(),'6');assert.equal(await other.inputValue(),'1');assert(await barcode.evaluate(e=>e===document.activeElement),'scan returns focus')
  assert.deepEqual(calls.map(c=>c.path.split('/').at(-1)),['picking','scan-picking']);assert.equal(calls[0].body.complete,false);assert.equal(calls[0].body.allocations[0].quantity,5)
  await scan('EA','Tab');assert.equal(await qty.inputValue(),'7');await qty.fill('8');await scan('PACK');assert.equal(await qty.inputValue(),'10')
  await scan();assert.equal(await qty.inputValue(),'10');assert(await barcode.isEnabled());assert.match(await page.getByRole('alert').innerText(),/초과/)
  const before=calls.length;await qty.fill('9');await barcode.fill('EA');await barcode.press('Enter');assert.equal(calls.length,before);assert.equal(await barcode.inputValue(),'EA');assert.equal(await qty.inputValue(),'9')
  await qty.fill('10');await scan('OTHER');assert.equal(await other.inputValue(),'2');assert.equal(await qty.inputValue(),'10')
  const box=await barcode.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  console.log(`PASS ${width}x${height}: manual 5 → scan 6 → Tab 7 → manual 8 + package 2 = 10; excess/reduction blocked, other row preserved`)
 }
 await reset();await scan();await scan();await scan();await qty.fill('5');await scan();assert.equal(await qty.inputValue(),'6')
 await reset();for(let i=0;i<3;i++){await barcode.fill('EA');await barcode.press('Enter')}await ready();assert.equal(await qty.inputValue(),'3');assert.equal(new Set(calls.map(c=>c.body.requestId)).size,3)
 for(const failure of ['400','409','lost']){
  await reset();manualFailure=failure;await qty.fill('5');await barcode.fill('EA');await barcode.press('Enter');await page.getByRole('alert').filter({hasText:'바코드를 처리하지 않았습니다'}).waitFor();await ready()
  assert.equal(calls.filter(c=>c.path.includes('scan-')).length,0);assert.equal(await qty.inputValue(),'5');assert(await barcode.isEnabled())
  manualFailure='';if(failure!=='400')await page.getByRole('button',{name:'입력 취소·최신 수량 조회',exact:true}).click()
  await ready();if(failure==='409')await qty.fill('5');await scan();assert.equal(await qty.inputValue(),'6')
 }
 await reset();await qty.fill('5');scanLost=true;await barcode.fill('EA');await barcode.press('Enter');await page.getByRole('button',{name:'같은 요청 재시도',exact:true}).waitFor();assert.equal(data.allocations[0].pickedQuantity,6)
 await page.getByRole('button',{name:'같은 요청 재시도',exact:true}).click();await ready();assert.equal(await qty.inputValue(),'6');const scans=calls.filter(c=>c.path.includes('scan-'));assert.equal(scans[0].body.requestId,scans[1].body.requestId)
 await other.fill('10');await qty.fill('10');await page.getByRole('button',{name:'피킹 완료',exact:true}).click();await page.getByText('완료',{exact:true}).waitFor();assert.equal(data.shipment.status,'Picked')
 data=make();data.shipment.status='Confirmed';await page.reload();await qty.waitFor();assert(await qty.isDisabled());assert(await barcode.isDisabled())
 data=make();data.shipment.status='Picked';data.allocations[0].pickedQuantity=5;await page.goto(origin+'/__mixed?inspect');await qty.waitFor();await qty.fill('1');assert(await page.getByLabel('출고 검수 바코드',{exact:true}).isDisabled(),'inspection policy unchanged')
 assert.equal(await page.locator('.shipment-product-barcode').count(),0,'inspection UI unchanged')
 barcodeFailure=true;await reset();await page.locator('.shipment-product-barcode').filter({hasText:/^조회 실패$/}).first().waitFor();assert(await barcode.isEnabled(),'barcode lookup failure does not block scanning');assert.equal(await page.locator('.shipment-product-barcode').filter({hasText:/^미등록$/}).count(),0)
 assert(barcodeLookups>0);assert.deepEqual(errors,[]);console.log('PASS alternation, rapid scans, failures/conflicts/lost responses, replay IDs, completion and inspection restrictions; all APIs mocked')
}finally{await browser.close()}
