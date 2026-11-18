import assert from 'node:assert/strict'
import { chromium } from 'playwright'
let input='';for await(const chunk of process.stdin)input+=chunk
const fixture=JSON.parse(input),origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',apiOrigin='http://localhost:5086'
assert(['http://127.0.0.1:5176','http://localhost:5174'].includes(origin))
const endpoint=`/api/tenants/${fixture.tenant}/products`,errors=[]
let statusOverride=0, failNext=false, apiQueue=Promise.resolve()
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'})
 // Real API on 5086 and real SQLite; routing changes only the API destination when checking deployed 5174 source.
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url())
  if(u.origin!==origin)return route.abort()
  if(u.pathname==='/__import-live')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/product-import-live.tsx"></script></html>'})
  if(u.pathname.startsWith('/api/')) {
   // The existing in-memory SQLite fixture owns one connection; serialize fixture HTTP requests.
   const previous=apiQueue;let release;apiQueue=new Promise(resolve=>{release=resolve});await previous
   try {
   if(failNext && u.pathname.endsWith('/import-preview')){failNext=false;return route.abort('connectionfailed')}
   const response=await route.fetch({url:apiOrigin+u.pathname+u.search})
   if(response.status()>=500)errors.push(`Unexpected API ${response.status()}: ${u.pathname}`)
   if(statusOverride && /\/import(?:-preview)?$/.test(u.pathname)){const status=statusOverride;statusOverride=0;return route.fulfill({response,status})}
   return await route.fulfill({response})
   } finally {release()}
  }
  return route.continue()
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000)
 await page.goto(origin+'/__import-live?tenant='+fixture.tenant)
 const post=async(path,body)=>page.evaluate(async({path,body})=>{const csrf=await(await fetch('/api/auth/csrf')).json();const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':csrf.token},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}},{path,body})
 assert.equal((await post('/api/auth/login',{email:'Master',password:fixture.password})).status,200)
 await page.reload();await page.getByRole('button',{name:'엑셀 대량등록',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'상품 엑셀 대량등록'}),table=dialog.locator('table'),register=dialog.getByRole('button',{name:'최종 일괄등록'})
 const upload=async(name,base64)=>{
  const response=page.waitForResponse(r=>r.url().endsWith('/import-preview'))
  await dialog.getByLabel('상품 등록 파일',{exact:true}).setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(base64,'base64')})
  const r=await response;const body=await r.json();await page.waitForTimeout(150);return{status:r.status(),body}
 }
 const result=await upload('오류3개.xlsx',fixture.files.three)
 assert.equal(result.body.errors.length,3);assert.deepEqual(result.body.errors.map(e=>e.row),[5,8,12]);assert.equal(await table.locator('tbody tr').count(),3)
 const errorRegion=dialog.getByRole('region',{name:'오류 내역',exact:true})
 const visibleResults=async()=>{
  assert.equal(await errorRegion.count(),1)
  await page.waitForFunction(()=>{const e=document.querySelector('.product-import-errors');if(!e)return false;const r=e.getBoundingClientRect(),p=e.closest('.product-import-scroll').getBoundingClientRect();return r.top>=p.top&&r.top+Math.min(r.height,60)<=p.bottom},undefined,{timeout:5000})
 }
 await visibleResults();assert(await register.isDisabled())
 statusOverride=400;const http400=await upload('오류HTTP400.xlsx',fixture.files.three);assert.equal(http400.status,400);assert.equal(await table.locator('tbody tr').count(),3);await visibleResults()
 for(const [row,name,column,value] of [[5,'STRAWBERRY','상품명','(빈 값)'],[8,'바나나','소비자가','삼천원'],[12,'사과','인박스 수량','-5']]){
  const line=table.locator('tbody tr').filter({has:page.getByRole('cell',{name:`${row}행`,exact:true})})
  for(const text of [name,column,value])assert((await line.innerText()).includes(text))
 }
 assert.match(await dialog.getByRole('status').innerText(),/오류 3건/)
 for(const [file,fields,rows] of [['dependent',['2차 카테고리','3차 카테고리'],[35,38]],['duplicate',['상품코드','낱개 바코드'],[15]],['classification',['상품 구분','1차 카테고리','2차 카테고리','3차 카테고리'],[18,19,20]],['numbers',['소비자가','매입단가','아웃박스 수량','파레트당 아웃박스'],[21]],['inFile',['상품코드','낱개 바코드'],[25]],['missingHeader',['상품명'],[1]],['blank',['상품명'],[2]],['limit',['파일'],[0]]]){
  const r=await upload(file+'.xlsx',fixture.files[file]);assert(r.body.errors.length>0)
  assert.equal(await table.locator('tbody tr').count(),r.body.errors.length)
  for(const field of fields)assert(r.body.errors.some(e=>e.column===field),`${file}: ${field}`)
  for(const row of rows)assert(r.body.errors.some(e=>e.row===row),`${file}: ${row}`)
  assert(await register.isDisabled());await visibleResults()
 }
 const malformed=await upload('잘못된양식.xlsx',Buffer.from('not an xlsx').toString('base64'))
 assert(malformed.body.errors.some(e=>e.column==='파일 구조'));await visibleResults()
 for(const [name,buffer] of [['빈파일.xlsx',Buffer.alloc(0)],['지원안함.csv',Buffer.from('상품명,상품코드')]]){
  await dialog.getByLabel('상품 등록 파일',{exact:true}).setInputFiles({name,mimeType:'application/octet-stream',buffer})
  await dialog.getByRole('cell',{name:'파일 전체',exact:true}).waitFor();assert.equal(await table.locator('tbody tr').count(),1);assert(await register.isDisabled());await visibleResults()
 }
 await upload('많은오류.xlsx',fixture.files.many)
 assert.equal(await table.locator('tbody tr').count(),40);assert(await errorRegion.evaluate(e=>e.scrollHeight>e.clientHeight));await visibleResults()
 assert.equal((await page.evaluate(async path=>(await(await fetch(path)).json()).total,endpoint)),1,'preview must not write products')
 await upload('등록직전충돌.xlsx',fixture.files.late);await dialog.locator('summary').click()
 assert.equal((await post(endpoint,{requestId:crypto.randomUUID(),code:'LATE',name:'외부 등록',unit:'EA',barcode:{mode:'manual',value:'BAR-LATE'}})).status,201)
 statusOverride=409
 const committedResponse=page.waitForResponse(r=>r.url().endsWith('/import'));await register.click();await committedResponse
 await errorRegion.waitFor();assert.equal(await table.locator('tbody tr').count(),2);assert(await register.isDisabled());await visibleResults()
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:900});await upload('오류3개.xlsx',fixture.files.three);await visibleResults()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 }
 const download=page.waitForEvent('download');await dialog.getByRole('link',{name:'엑셀 양식 다운로드',exact:true}).click();const file=await download
 assert.equal(file.suggestedFilename(),'아이블WMS_상품대량등록_양식.xlsx');assert.equal(await file.failure(),null)
 const stream=await file.createReadStream();let length=0;for await(const chunk of stream)length+=chunk.length;assert(length>1000)
 failNext=true
 await dialog.getByLabel('상품 등록 파일',{exact:true}).setInputFiles({name:'연결실패.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(fixture.files.valid,'base64')})
 await dialog.getByRole('alert').filter({hasText:'네트워크'}).waitFor();assert.equal(await table.count(),0);assert(await register.isDisabled())
 const good=await upload('수정완료.xlsx',fixture.files.valid);assert.deepEqual(good.body.errors,[]);assert.equal(await errorRegion.count(),0);assert(await register.isEnabled())
 assert.equal((await page.evaluate(async path=>(await(await fetch(path)).json()).total,endpoint)),2)
 await register.click();await dialog.waitFor({state:'hidden'})
 await page.getByRole('status').filter({hasText:'2개 상품을 등록했습니다.'}).waitFor()
 assert.equal((await page.evaluate(async path=>(await(await fetch(path)).json()).total,endpoint)),4)
 const registered=await page.evaluate(async path=>(await(await fetch(path)).json()).items,endpoint)
 for(const [name,id] of [['정상 등록 A',fixture.categoryIds[0]],['정상 등록 B',fixture.categoryIds[1]]]){
  const item=registered.find(x=>x.product.name===name);assert(item);const detail=await page.evaluate(async path=>(await(await fetch(path)).json()).product,endpoint+'/'+item.product.id);assert.equal(detail.categoryId,id)
 }
 console.log('PASS real XLSX → actual authenticated 5086 API → SQLite → visible row/field/value/product errors; missing fields, prices, packaging, duplicates, classification, headers, malformed/empty files; 40 errors scroll; late conflict auto-opens; retry clears errors; two-product atomic import and list refresh. Origin='+origin)
 assert.deepEqual(errors,[])
}finally{await browser.close()}
