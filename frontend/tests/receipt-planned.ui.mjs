import assert from 'node:assert/strict'
import {chromium} from 'playwright'
let input='';for await(const chunk of process.stdin)input+=chunk
const fixture=JSON.parse(input),origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',root=`/api/tenants/${fixture.tenant}/receipts`
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],writes=[]
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.origin!==origin)return route.abort()
  if(u.pathname==='/__receipt-login')return route.fulfill({contentType:'text/html',body:'<html><body>격리 QA</body></html>'})
  if(u.pathname==='/__receipt-group')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/receipt-group-live.tsx"></script></html>'})
  if(!u.pathname.startsWith('/api/'))return route.continue()
  if(req.method()!=='GET'&&u.pathname.startsWith(root))writes.push({path:u.pathname,body:req.postDataJSON()})
  const response=await context.request.fetch('http://localhost:5086'+u.pathname+u.search,{method:req.method(),headers:req.headers(),data:req.postDataBuffer()||undefined,failOnStatusCode:false})
  if(response.status()>=500)errors.push(`API ${response.status()} ${u.pathname}`)
  return route.fulfill({status:response.status(),headers:response.headers(),body:await response.body()})
 })
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/__receipt-login')
 const post=(path,body)=>page.evaluate(async({path,body})=>{const csrf=await(await fetch('/api/auth/csrf')).json();const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':csrf.token},body:JSON.stringify(body)});return {status:r.status,text:await r.text()}},{path,body})
 assert.equal((await post('/api/auth/login',{email:'Master',password:fixture.password})).status,200)
 const visit=(receipt='',extra='')=>page.goto(`${origin}/__receipt-group?tenant=${fixture.tenant}&receipt=${receipt}${extra}`)
 const choose=async(label,text)=>{await page.getByRole('button',{name:new RegExp('^'+label+' ')}).click();await page.getByRole('combobox',{name:label+' 검색',exact:true}).fill(text);await page.getByRole('option').filter({hasText:text}).first().click()}
 await visit('','&new')
 await choose('입고 창고','창고');await choose('매입 거래처','매입처');await page.getByRole('textbox',{name:'입고 담당자',exact:true}).fill('격리 검수 담당')
 await page.getByRole('button',{name:'상품 추가',exact:true}).click();await page.getByRole('checkbox',{name:'SERIAL 선택',exact:true}).check();await page.getByRole('button',{name:'선택 상품 추가',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})
 await page.getByRole('spinbutton',{name:'수량 1',exact:true}).fill('100')
 assert.equal(await page.locator('.document-line-table input[type=date]').count(),0)
 assert.equal(await page.getByRole('textbox',{name:'LOT 1',exact:true}).count(),0)
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))}
 await page.setViewportSize({width:1440,height:1000})
 const before=writes.length
 await page.getByRole('button',{name:'추적 정보 입력(선택) 1',exact:true}).click()
 let dialog=page.getByRole('dialog');await dialog.getByText(/· 예정 수량 100 EA$/).waitFor()
 for(const [i,lot,expiry,amount] of [[1,'PRE-A','2027-05-10','60'],[2,'PRE-B','2027-06-15','40']]){await dialog.getByRole('button',{name:'+ LOT 추가',exact:true}).click();await dialog.getByRole('textbox',{name:`LOT 번호 ${i}`,exact:true}).fill(lot);await dialog.locator(`input[aria-label="LOT 유통기한 ${i}"]`).fill(expiry);await dialog.getByRole('spinbutton',{name:`LOT 수량 ${i}`,exact:true}).fill(amount)}
 await dialog.getByRole('tab',{name:'시리얼 (0)',exact:true}).click();await dialog.locator('.receipt-serial-bulk > summary').click();await dialog.getByRole('combobox',{name:'추가 시리얼 LOT',exact:true}).selectOption({label:'PRE-A · 2027-05-10'});await dialog.getByRole('textbox',{name:'시리얼 일괄 입력',exact:true}).fill('PRE-S1\nPRE-S2');await dialog.getByRole('button',{name:'목록에 추가',exact:true}).click();await dialog.getByRole('button',{name:'저장',exact:true}).click();await dialog.waitFor({state:'hidden'})
 assert.equal(writes.length,before,'planned popup is local until receipt save')
 assert.match(await page.locator('.document-line-table').innerText(),/예정 LOT 2개 · 시리얼 2개/)
 await page.getByRole('button',{name:'입고 등록',exact:true}).click()
 const createdResponse=page.waitForResponse(r=>new URL(r.url()).pathname===root&&r.request().method()==='POST')
 await page.getByRole('button',{name:'확인',exact:true}).click();const created=await(await createdResponse).json(),receipt=created.receipt.id,lineId=created.lines[0].id,receiptUrl=root+'/'+receipt
 assert.equal(created.lines.length,1);assert.equal(created.lines[0].trackingAllocations.length,2);assert.equal(created.lines[0].inspectedQuantity,null)
 await visit(receipt);await page.getByRole('button',{name:'입고 정보 수정',exact:true}).click();assert.equal(await page.locator('tr[aria-label^="입고 상품 "]').count(),1)
 await page.getByRole('textbox',{name:'입고 비고',exact:true}).fill('원본 행 유지 확인');await page.getByRole('button',{name:'입고 저장',exact:true}).click();await page.getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('button',{name:'검수 시작',exact:true}).waitFor()
 let detail=await page.evaluate(async u=>(await fetch(u)).json(),receiptUrl);assert.equal(detail.lines[0].id,lineId);assert.equal(detail.lines[0].trackingAllocations.length,2)
 await page.getByRole('button',{name:'검수 시작',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('spinbutton',{name:'검수 수량 1',exact:true}).fill('100');await page.getByRole('button',{name:'수량 반영',exact:true}).click();await page.getByText('100 EA 저장 완료',{exact:false}).waitFor()
 await page.getByRole('button',{name:'추적 상품 LOT 관리',exact:true}).click();dialog=page.getByRole('dialog');assert.equal(await dialog.getByRole('textbox',{name:'LOT 번호 1',exact:true}).inputValue(),'PRE-A');assert.equal(await dialog.getByRole('spinbutton',{name:'LOT 수량 1',exact:true}).inputValue(),'60')
 await dialog.getByRole('textbox',{name:'LOT 번호 1',exact:true}).fill('ACTUAL-A');await dialog.getByRole('textbox',{name:'LOT 번호 2',exact:true}).fill('ACTUAL-B');await dialog.getByRole('button',{name:'시리얼 2개',exact:true}).click();assert.equal(await dialog.getByRole('textbox',{name:'시리얼 번호 1',exact:true}).inputValue(),'PRE-S1');await dialog.getByRole('textbox',{name:'시리얼 번호 1',exact:true}).fill('ACTUAL-S1');await dialog.getByRole('button',{name:'저장',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.getByRole('spinbutton',{name:'검수 수량 1',exact:true}).inputValue(),'100')
 await page.getByRole('button',{name:'검수 확정',exact:true}).click();await page.getByRole('button',{name:'보관 위치 지정',exact:true}).click()
 const rows=page.locator('tr[aria-label^="입고 상품 "]');assert.equal(await rows.count(),2)
 for(let i=0;i<2;i++){const row=rows.nth(i);await row.getByRole('button',{name:`위치 추가 ${i+1}`,exact:true}).click();await choose(`보관 위치 ${i+1}-1`,'FLOOR');await row.getByRole('spinbutton',{name:`배치 수량 ${i+1}-1`,exact:true}).fill(i?'40':'60');if(!i)await row.getByRole('textbox',{name:'배치 시리얼 1-1',exact:true}).fill('ACTUAL-S1\nPRE-S2')}
 await page.getByRole('button',{name:'배치 확정',exact:true}).click();await page.getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('button',{name:'입고 최종 확정',exact:true}).waitFor()
 const stock=await page.evaluate(async u=>(await fetch(u+'/stock')).json(),receiptUrl);assert.equal(stock.balances.length,0)
 await page.getByRole('button',{name:'입고 최종 확정',exact:true}).click();await page.getByRole('button',{name:'확인',exact:true}).click();await page.locator('.receipt-confirm').getByText(/100 EA/).waitFor()
 detail=await page.evaluate(async u=>(await fetch(u)).json(),receiptUrl);assert.equal(detail.lines[0].id,lineId);assert.equal(detail.receipt.status,'Confirmed')
 const legacyResponse=await post(root,{requestId:crypto.randomUUID(),expectedDate:'2026-11-09',warehouseId:fixture.warehouse,partnerId:fixture.partner,contactName:'기존 문서 QA',lines:[{productId:fixture.product,expectedQuantity:30,lotNumber:'OLD-A'},{productId:fixture.product,expectedQuantity:70,lotNumber:'OLD-B'}]})
 assert.equal(legacyResponse.status,201);const legacy=JSON.parse(legacyResponse.text),oldIds=legacy.lines.map(l=>l.id)
 await visit(legacy.receipt.id);await page.getByRole('button',{name:'입고 정보 수정',exact:true}).click();assert.equal(await page.locator('tr[aria-label^="입고 상품 "]').count(),1);assert.equal(await page.getByRole('spinbutton',{name:'수량 1',exact:true}).inputValue(),'100')
 await page.getByRole('button',{name:'추적 정보 입력(선택) 1',exact:true}).click();dialog=page.getByRole('dialog');assert.equal(await dialog.getByRole('textbox',{name:'LOT 번호 1',exact:true}).inputValue(),'OLD-A');assert.equal(await dialog.getByRole('textbox',{name:'LOT 번호 2',exact:true}).inputValue(),'OLD-B');await dialog.getByRole('button',{name:'취소',exact:true}).click()
 await page.getByRole('textbox',{name:'입고 비고',exact:true}).fill('기존 ID 보존');await page.getByRole('button',{name:'입고 저장',exact:true}).click();await page.getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('button',{name:'검수 시작',exact:true}).waitFor()
 const preserved=await page.evaluate(async u=>(await fetch(u)).json(),root+'/'+legacy.receipt.id);assert.deepEqual(preserved.lines.map(l=>l.id),oldIds);assert.deepEqual(preserved.lines.map(l=>l.expectedQuantity),[30,70]);assert.deepEqual(preserved.lines.map(l=>l.trackingAllocations[0].lotNumber),['OLD-A','OLD-B'])
 assert.deepEqual(errors,[])
 console.log('PASS: actual receipt registration UI -> planned multiple LOT/serial local popup -> create/edit ID preservation -> actual inspection correction -> placement -> final 100 EA; isolated authenticated SQLite only')
}finally{await browser.close()}
