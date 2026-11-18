import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',errors=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
 await context.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url());assert.equal(u.origin,origin)
  if(u.pathname==='/__product-barcode-scan')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/product-barcode-scan-ui.tsx"></script></html>'})
  if(u.pathname.startsWith('/api/')){assert.equal(req.method(),'GET');assert(u.pathname.endsWith('/barcodes/check'));return route.fulfill({json:{available:u.searchParams.get('value')!=='TAKEN'}})}
  return route.continue()
 })
 await context.addInitScript(()=>{
  window.qa={codes:[],stopped:0,denied:false}
  navigator.mediaDevices.getUserMedia=async()=>{if(window.qa.denied)throw new DOMException('denied','NotAllowedError');const c=document.createElement('canvas');c.width=640;c.height=240;c.getContext('2d').fillRect(0,0,640,240);const s=c.captureStream(10);for(const t of s.getTracks()){const stop=t.stop.bind(t);t.stop=()=>{window.qa.stopped++;stop()}}return s}
  window.BarcodeDetector=class{static async getSupportedFormats(){return ['ean_13','code_128']}async detect(){return window.qa.codes.map(rawValue=>({rawValue}))}}
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/__product-barcode-scan')
 const scan=page.getByRole('textbox',{name:'등록할 바코드 스캔',exact:true}),count=page.getByLabel('바코드 개수'),saved=page.getByLabel('저장 결과')
 await page.getByRole('button',{name:'+ 바코드 추가',exact:true}).click()
 const emptyBarcode=page.getByLabel('상품 바코드 1',{exact:true})
 assert.equal(await page.locator('.barcode-check.error').count(),0,'new empty row has no premature error')
 assert.equal(await emptyBarcode.getAttribute('aria-invalid'),'false')
 await page.getByRole('button',{name:'상품 저장',exact:true}).click()
 await page.getByText('바코드를 입력하거나 빈 행을 삭제해 주세요.',{exact:true}).waitFor()
 assert.equal(await saved.textContent(),'','empty barcode still blocks saving')
 assert.equal(await emptyBarcode.getAttribute('aria-invalid'),'true')
 await scan.fill('001234');await scan.press('Enter');await page.getByLabel('상품 바코드 1',{exact:true}).waitFor();assert.equal(await count.textContent(),'1');assert.equal(await page.getByLabel('상품 바코드 1',{exact:true}).inputValue(),'001234');assert.equal(await saved.textContent(),'')
 await scan.fill('001234');await scan.press('Enter');assert.equal(await count.textContent(),'1');await page.getByRole('alert').filter({hasText:'이미 목록'}).waitFor()
 await scan.fill('SECOND');await scan.press('Tab');assert.equal(await count.textContent(),'2');assert.equal(await saved.textContent(),'')
 assert.equal(await page.getByRole('button',{name:'이미지 선택',exact:true}).count(),0)
 await page.getByRole('button',{name:'+ 바코드 추가',exact:true}).click();await page.getByLabel('바코드 3 포장 단위',{exact:true}).selectOption('INNER')
 await scan.fill('INNER001');await scan.press('Enter');assert.equal(await count.textContent(),'3');assert.equal(await page.getByLabel('바코드 3 포장 단위',{exact:true}).inputValue(),'INNER')
 await page.getByRole('button',{name:'카메라 스캔',exact:true}).click();await page.getByRole('dialog',{name:'바코드 스캔',exact:true}).waitFor();await page.evaluate(()=>window.qa.codes=['8801234567893']);await page.getByLabel('상품 바코드 4',{exact:true}).waitFor();await page.waitForTimeout(400);assert.equal(await count.textContent(),'4');assert(await page.evaluate(()=>window.qa.stopped>0));assert.equal(await page.getByRole('dialog').count(),0)
 await page.waitForFunction(()=>[...document.querySelectorAll('.barcode-check')].every(e=>e.classList.contains('available')))
 await page.getByRole('button',{name:'상품 저장',exact:true}).click();const payload=JSON.parse(await saved.textContent());assert.equal(payload.length,4);assert(payload.every(r=>r.change.mode==='manual'&&r.barcodeType==='External'));assert.equal(payload[0].change.value,'001234');assert.equal(payload[2].packageCode,'INNER');assert.equal(payload.filter(r=>r.isPrimary).length,1)
 await scan.fill('TAKEN');await scan.press('Enter');await page.getByLabel('상품 바코드 5',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="상품 바코드 5"]').validationMessage.includes('사용할 수 없는'));await page.getByRole('button',{name:'상품 저장',exact:true}).click();assert.equal(JSON.parse(await saved.textContent()).length,4,'server duplicate blocks submit')
 await page.evaluate(()=>{window.qa.codes=[];window.qa.denied=true});await page.getByRole('button',{name:'카메라 스캔',exact:true}).click();await page.getByRole('alert').filter({hasText:'권한이 거부'}).waitFor()
 await scan.fill('MANUAL-RECOVERY');await scan.press('Enter');assert.equal(await count.textContent(),'6')
 for(const width of [360,390,430,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'overflow '+width+' '+JSON.stringify(await page.locator('body *').evaluateAll(nodes=>nodes.filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right})))) )}
 await page.getByRole('button',{name:'잠금 전환',exact:true}).click();assert(await scan.isDisabled());assert(await page.getByRole('button',{name:'카메라 스캔',exact:true}).isDisabled());await page.getByRole('button',{name:'잠금 전환',exact:true}).click()
 await page.getByRole('button',{name:'기존 30개',exact:true}).click();await scan.fill('OVERLIMIT');await scan.press('Enter');assert.equal(await count.textContent(),'30');await page.getByRole('alert').filter({hasText:'최대 30개'}).waitFor();assert.equal(await page.getByLabel('상품 바코드 1',{exact:true}).inputValue(),'EXISTING0')
 await page.evaluate(()=>window.qa.denied=false);await page.getByRole('button',{name:'카메라 스캔',exact:true}).click();await page.getByRole('button',{name:'카메라 종료',exact:true}).waitFor();const stops=await page.evaluate(()=>window.qa.stopped);await page.getByRole('button',{name:'스캐너 전환',exact:true}).evaluate(button=>button.click());await page.waitForFunction(n=>window.qa.stopped>n,stops)
 assert.deepEqual(errors,[]);console.log('PASS Enter/Tab, leading zero, camera one-shot/cleanup/denial, duplicate checks, draft-only registration, packaging, primary, limit and mobile/desktop layout; no real API writes')
}finally{await browser.close()}
