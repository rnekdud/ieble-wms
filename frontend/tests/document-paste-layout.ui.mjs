import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176'
const sizes=[[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 for(const mode of ['receipt','shipment']) {
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']})
  let fail=false,reads=0;const errors=[]
  await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());assert.equal(url.origin,origin)
   if(url.pathname==='/__paste'||url.pathname==='/__paste-consumer')return route.fulfill({contentType:'text/html',body:`<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/${url.pathname==='/__paste'?'document-paste':mode}-ui.tsx"></script></html>`})
   if(!url.pathname.startsWith('/api/'))return route.continue()
   assert.equal(route.request().method(),'GET','paste never writes to API');reads++
   if(fail)return route.fulfill({status:503,json:{message:'QA 조회 실패'}})
   if(!url.searchParams.has('exactName'))return route.fulfill({json:{items:[],total:0,page:1,pageSize:20}})
   const name=url.searchParams.get('exactName'),p=Number(url.searchParams.get('page')||1),total=name==='중복'?21:name==='미등록'?0:1
   const all=Array.from({length:total},(_,i)=>({id:name+'-'+i,name,code:'P'+i,unit:name==='밀가루'?'kg':'EA',modelNumber:'모델 '+i}))
   return route.fulfill({json:{items:all.slice((p-1)*20,p*20),total,page:p,pageSize:20}})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin+'/__paste?mode='+mode)
  const dialog=page.getByRole('dialog',{name:'엑셀 붙여넣기',exact:true}),input=dialog.getByRole('textbox'),add=dialog.getByRole('button',{name:'추가',exact:true})
  assert(await add.isDisabled());await input.fill('메로나\t1');await add.waitFor();await page.waitForFunction(()=>!document.querySelector('footer .primary').disabled)
  const measurements=[]
  for(const [width,height] of sizes){
   await page.setViewportSize({width,height});await dialog.locator('.dialog-body').evaluate(e=>e.scrollTop=0)
   const d=await dialog.boundingBox(),t=await input.boundingBox(),label=await input.locator('..').boundingBox(),button=await add.boundingBox()
   assert(Math.abs(t.width-label.width)<1,'textarea fills available width')
   assert(d.x>=0&&d.x+d.width<=width+1&&d.y>=0&&d.y+d.height<=height+1)
   assert(button.y+button.height<=height&&button.x+button.width<=width,'footer on screen')
   assert(await add.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'footer hit target')
   for(const el of [dialog,dialog.locator('.dialog-body'),dialog.locator('.document-paste-preview')])assert(await el.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'no horizontal overflow')
   const cards=width<=600||(width<=1024&&height<=500&&width>height)
   assert.equal(await dialog.locator('tbody tr').evaluate(e=>getComputedStyle(e).display),cards?'grid':'table-row')
   assert.equal(await input.inputValue(),'메로나\t1','rotation retains input')
   measurements.push(`${width}x${height}:input=${Math.round(t.width)},footerBottom=${Math.round(button.y+button.height)}`)
  }
  console.log(mode,measurements.join(' | '))
  await page.setViewportSize({width:390,height:844})
  for(const count of [1,10,50,100]){
   const text=Array.from({length:count},(_,i)=>`메로나\t${i+1}`).join('\n');await input.fill(text)
   await page.waitForFunction(()=>!document.querySelector('footer .primary').disabled)
   assert.equal(await dialog.locator('tbody tr').count(),count)
   assert.equal(await dialog.getByRole('status').textContent().then(t=>t.includes(`정상 ${count}건`)),true)
   assert.equal(Math.round((await input.boundingBox()).height),112)
   const nested=await dialog.locator('.dialog-body').evaluate(e=>[...e.querySelectorAll('*:not(textarea)')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1).map(n=>n.className))
   assert.deepEqual(nested,[],'only dialog body and textarea scroll vertically')
  }
  await input.fill('긴상품명'.repeat(40)+'\t2');await page.waitForFunction(()=>!document.querySelector('footer .primary').disabled)
  assert(await dialog.locator('tbody tr').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'long Korean name wraps without expanding card')
  await input.fill(Array.from({length:101},()=>`메로나\t1`).join('\n'));await dialog.getByRole('alert').waitFor();assert(await add.isDisabled());assert((await input.inputValue()).split('\n').length===101)
  const oversize='가'.repeat(66000)
  await input.focus();await page.evaluate(text=>navigator.clipboard.writeText(text),oversize);await page.keyboard.press(process.platform==='darwin'?'Meta+A':'Control+A');await page.keyboard.press(process.platform==='darwin'?'Meta+V':'Control+V')
  await page.waitForFunction(()=>document.querySelector('textarea').value.length===66000);assert(await add.isDisabled());assert.match(await dialog.getByRole('alert').textContent(),/65,536/)
  await input.fill('상품명\t수량\n메로나\t1\n\t2\n밀가루\t2027-01-02\n미등록\t3');await page.waitForFunction(()=>document.querySelector('.document-paste-summary').textContent.includes('오류 3건'))
  assert.equal(await dialog.locator('tr[data-state=error]').count(),3);assert(await add.isDisabled())
  assert.deepEqual(await dialog.locator('tbody td:first-child').allTextContents(),['2','3','4','5'])
  await input.fill('중복\t3');await dialog.getByRole('button',{name:'1행 상품 선택',exact:true}).click()
  const candidates=dialog.getByRole('region',{name:'중복 상품 선택'})
  await candidates.getByRole('button',{name:'2페이지',exact:true}).click();await candidates.getByRole('button',{name:'P20 · 중복 · 모델 20 · EA',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('footer .primary').disabled)
  fail=true;await dialog.getByRole('button',{name:'상품 다시 조회',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.document-paste-summary').textContent.includes('오류 1건'));assert(await add.isDisabled())
  fail=false;await input.fill('상품명\t수량\n메로나\t1\n밀가루\t5.5\n메로나\t2');await page.waitForFunction(()=>!document.querySelector('footer .primary').disabled)
  await page.setViewportSize({width:844,height:220});await input.scrollIntoViewIfNeeded();await input.focus();assert.equal(await input.inputValue(),'상품명\t수량\n메로나\t1\n밀가루\t5.5\n메로나\t2');assert((await add.boundingBox()).y+(await add.boundingBox()).height<=220)
  await page.setViewportSize({width:390,height:844});await add.evaluate(e=>{e.click();e.click()});await dialog.waitFor({state:'detached'})
  assert.deepEqual(JSON.parse(await page.getByLabel('추가 결과').textContent()),[{id:'메로나-0',quantity:'1'},{id:'밀가루-0',quantity:'5.5'},{id:'메로나-0',quantity:'2'}])
  await page.getByRole('button',{name:'붙여넣기 열기'}).click();await input.fill('취소할 상품\t2');await dialog.getByRole('button',{name:'취소',exact:true}).click();assert.equal(JSON.parse(await page.getByLabel('추가 결과').textContent()).length,3)
  await page.goto(origin+'/__paste-consumer?mode=new')
  await page.getByRole('button',{name:'엑셀 붙여넣기',exact:true}).click();await input.fill('메로나\t7');await page.waitForFunction(()=>!document.querySelector('dialog footer .primary').disabled);await add.click();await dialog.waitFor({state:'detached'})
  assert(await page.getByText('메로나',{exact:true}).count()>0,'consumer receives pasted product')
  assert(await page.locator('input').evaluateAll(nodes=>nodes.some(n=>n.value==='7')),'consumer receives pasted quantity')
  assert.deepEqual(errors,[]);assert(reads>0);await context.close()
 }
 console.log('PASS paste layout, native clipboard, 1/10/50/100 rows, limits, validation, candidate paging, errors, local add/cancel; no API writes')
} finally {await browser.close()}
