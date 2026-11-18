import assert from 'node:assert/strict'
import { chromium } from 'playwright'
let input='';for await(const chunk of process.stdin)input+=chunk
const fixture=JSON.parse(input),origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',root=`/api/tenants/${fixture.tenant}`
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[]
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.origin!==origin)return route.abort()
  if(u.pathname==='/__assignee-login')return route.fulfill({contentType:'text/html',body:'<html><body>격리 QA</body></html>'})
  if(!u.pathname.startsWith('/api/'))return route.continue()
  // The real app and auth flow use an isolated SQLite API, never the QA company's DB.
  const response=await context.request.fetch('http://localhost:5086'+u.pathname+u.search,{method:req.method(),headers:req.headers(),data:req.postDataBuffer()||undefined,failOnStatusCode:false})
  // The PostgreSQL-only health probe returns 503 in this intentionally SQLite-backed fixture.
  if(response.status()>=500 && !(u.pathname==='/api/health/db' && response.status()===503))errors.push(`API ${response.status()} ${u.pathname}`)
  return route.fulfill({status:response.status(),headers:response.headers(),body:await response.body()})
 })
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/__assignee-login')
 const post=(path,body)=>page.evaluate(async({path,body})=>{const csrf=await(await fetch('/api/auth/csrf')).json();const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':csrf.token},body:JSON.stringify(body)});return {status:r.status,text:await r.text()}},{path,body})
 assert.equal((await post('/api/auth/login',{email:'Master',password:fixture.password})).status,200)
 const visit=path=>page.goto(origin+path,{waitUntil:'domcontentloaded'})
 const field=label=>page.getByRole('button',{name:new RegExp('^'+label+' ')})
 async function choose(label,search){await field(label).click();await page.getByRole('combobox',{name:label+' 검색',exact:true}).fill(search);await page.getByRole('option').filter({hasText:search}).first().click()}
 await visit('/app/receipts/new');await field('입고 담당자').filter({hasText:'김철수'}).waitFor()
 assert.equal(await page.getByRole('textbox',{name:'입고 담당자',exact:true}).count(),0)
 await choose('입고 담당자','Reader');assert.match(await field('입고 담당자').locator('..').innerText(),/물류관리팀 · reader@qa.test/);assert.match(await field('입고 담당자').innerText(),/이영희/)
 await choose('입고 창고','창고');await choose('매입 거래처','매입처')
 await page.getByRole('button',{name:'상품 추가',exact:true}).click();await page.getByRole('checkbox',{name:'BULK 선택',exact:true}).check();await page.getByRole('button',{name:'선택 상품 추가',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})
 await page.getByRole('spinbutton',{name:'수량 1',exact:true}).fill('2')
 await page.getByRole('textbox',{name:'입고 비고',exact:true}).fill('담당자 유지 확인')
 await page.evaluate(()=>window.dispatchEvent(new Event('wms-access-changed')))
 assert.match(await field('입고 담당자').innerText(),/이영희/)
 await page.getByRole('button',{name:'입고 등록',exact:true}).click()
 let response=page.waitForResponse(r=>new URL(r.url()).pathname===root+'/receipts'&&r.request().method()==='POST')
 await page.getByRole('button',{name:'확인',exact:true}).click();let result=await response;assert.equal(result.status(),201);let data=await result.json();const id=data.receipt.id
 assert.equal(data.receipt.contactUserId,fixture.reader);assert.equal(data.receipt.createdByUserId,fixture.actor)
 await visit('/app/receipts/'+id);await page.getByText('매입처 / 이영희',{exact:true}).waitFor();await page.locator('.business-assignee-detail').filter({hasText:'물류관리팀 · reader@qa.test'}).waitFor();await page.reload();await page.locator('.business-assignee-detail').filter({hasText:'물류관리팀 · reader@qa.test'}).waitFor()
 await page.getByRole('button',{name:'입고 정보 수정',exact:true}).click();await field('입고 담당자').locator('..').filter({hasText:'물류관리팀 · reader@qa.test'}).waitFor();assert.match(await field('입고 담당자').innerText(),/이영희/)
 await choose('입고 담당자','Master');await page.getByRole('button',{name:'입고 저장',exact:true}).click()
 response=page.waitForResponse(r=>new URL(r.url()).pathname===root+'/receipts/'+id&&r.request().method()==='POST');await page.getByRole('button',{name:'확인',exact:true}).click();result=await response;assert.equal(result.status(),200);data=await result.json();assert.equal(data.receipt.contactUserId,fixture.actor)
 await visit('/app/receipts/'+id);await page.getByText('매입처 / 김철수',{exact:true}).waitFor()
 for(const [path,label] of [['/app/shipments/new','출고 담당자'],['/app/inventory/counts/new','실사 담당자']]) {
  await visit(path);await field(label).filter({hasText:'김철수'}).waitFor();await choose(label,'Reader');assert.match(await field(label).innerText(),/이영희/)
 }
 await visit('/app/warehouses');await page.getByRole('button',{name:'창고 등록',exact:true}).click();await field('창고 담당자').filter({hasText:'김철수'}).waitFor();await choose('창고 담당자','Reader');assert.match(await field('창고 담당자').innerText(),/이영희/)
 for(const label of ['재고 이동','재고 조정']) {
  await visit('/app/inventory/adjustments');await page.getByRole('button',{name:label,exact:true}).click();await field('업무 담당자').filter({hasText:'김철수'}).waitFor();await choose('업무 담당자','Reader');assert.match(await field('업무 담당자').innerText(),/이영희/)
 }
 await page.setViewportSize({width:390,height:844});await field('업무 담당자').click();await page.getByRole('combobox',{name:'업무 담당자 검색',exact:true}).fill('Master');await page.getByRole('option').filter({hasText:'Master'}).waitFor();await page.getByRole('combobox',{name:'업무 담당자 검색',exact:true}).press('Enter');assert.match(await field('업무 담당자').innerText(),/김철수/)
 assert.deepEqual(errors,[])
 console.log('PASS real login, automatic assignee on six forms, name/login search, change persistence, receipt save/detail/edit, actor identity, mobile keyboard; isolated SQLite only')
}finally{await browser.close()}
