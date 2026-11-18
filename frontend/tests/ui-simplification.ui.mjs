import assert from 'node:assert/strict'
import { checkDateStocktakeLayout } from './date-stocktake-layout.mjs'
import { chromium } from 'playwright'
let input='';for await(const chunk of process.stdin)input+=chunk
const fixture=JSON.parse(input),origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',root=`/api/tenants/${fixture.tenant}`
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],requests=[]
let context,page
try {
 context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.origin!==origin)return route.abort()
  if(u.pathname==='/__qa-login')return route.fulfill({contentType:'text/html',body:'<html><body>격리 QA</body></html>'})
  if(!u.pathname.startsWith('/api/'))return route.continue()
  requests.push({path:u.pathname,query:u.search,method:req.method()})
  // Serve real 5176/5174 UI; authenticate and query only the isolated SQLite fixture.
  const response=await context.request.fetch('http://localhost:5086'+u.pathname+u.search,{method:req.method(),headers:req.headers(),data:req.postDataBuffer()||undefined,failOnStatusCode:false})
  if(response.status()>=500 && !(u.pathname==='/api/health/db' && response.status()===503))errors.push(`API ${response.status()} ${u.pathname}`)
  return route.fulfill({status:response.status(),headers:response.headers(),body:await response.body()})
 })
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/__qa-login')
 assert.equal(await page.evaluate(async password=>{const csrf=await(await fetch('/api/auth/csrf')).json();return(await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':csrf.token},body:JSON.stringify({email:'Master',password})})).status},fixture.password),200)
 const visit=async path=>{await page.goto(origin+path,{waitUntil:'domcontentloaded'});try{await page.locator('.wms-page-header h1,.wms-page-header h2').first().waitFor()}catch(e){throw Error(path+' '+e.message+' '+(await page.locator('main').innerText()).slice(0,500))}}
 if(process.env.WMS_DATE_LAYOUT_ONLY==='1') { await checkDateStocktakeLayout(page,visit,root);assert.deepEqual(errors,[]) } else {
 const cases=[['/app/products',['엑셀 대량등록','상품 등록'],'상품 검색','products'],['/app/warehouses',['창고 등록'],'창고 검색','warehouses'],['/app/receipts',['입고 등록'],'입고 검색','receipts'],['/app/shipments',['출고 등록'],'출고 검색','shipments'],['/app/inventory/counts',['실사 등록'],'실사 검색','stocktakes'],['/app/partners',['거래처 등록'],'거래처 검색','partners'],['/app/settings/users',['사용자 등록','마스터 위임'],'사용자 검색','users'],['/app/support',['문의 등록'],'문의 검색','support'],['/app/inventory/adjustments',['재고 이동','재고 조정'],'재고 검색','inventory'],['/app/reports/stock',['Excel 다운로드','CSV 다운로드'],'재고 현황 검색','reports/stock-overview'],['/app/reports/movements',['Excel 다운로드','CSV 다운로드'],'입출고 통계 검색','reports/movement-stats'],['/app/reports/history',['Excel 다운로드','CSV 다운로드'],'재고 이력 검색','reports/stock-history']]

 // All existing list search conditions stay visible and submit explicitly.
 for(const [path,,label,resource] of cases){
  await visit(path)
  const form=page.locator('form').filter({has:page.getByRole('button',{name:'검색',exact:true})}).first()
  await form.waitFor();assert.equal(await form.locator('details').count(),0,path)
  assert.equal(await form.getByRole('button',{name:/상세 필터/}).count(),0,path)
  const search=form.getByRole('button',{name:'검색',exact:true});await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='검색')?.disabled)
  const field=page.getByRole('textbox',{name:label,exact:true});assert((await field.boundingBox()).width<=280,path+' search input too wide');const before=requests.filter(r=>r.path===root+'/'+resource).length
  await field.fill('검색검증');await page.waitForTimeout(220);assert.equal(requests.filter(r=>r.path===root+'/'+resource).length,before,path+' no auto request')
  const response=page.waitForResponse(r=>new URL(r.url()).pathname===root+'/'+resource&&new URL(r.url()).searchParams.get('search')==='검색검증')
  await field.press('Enter');assert.equal((await response).status(),200)
  assert.equal(new URLSearchParams(requests.filter(r=>r.path===root+'/'+resource).at(-1).query).get('page'),'1')
  await search.waitFor();await page.waitForFunction(()=>!document.querySelector('.list-search-reset')?.disabled)
  const reset=form.getByRole('button',{name:'초기화',exact:true}),searchBox=await search.boundingBox(),resetBox=await reset.boundingBox();assert.equal(searchBox.height,40);assert.equal(searchBox.y,resetBox.y);assert(Math.abs(resetBox.x-searchBox.x-searchBox.width-8)<1)
  await reset.click();let confirmation=page.getByRole('alertdialog',{name:'필터 초기화'});if(!await confirmation.count())confirmation=page.getByRole('dialog',{name:'필터 초기화'});
  await confirmation.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await field.inputValue(),'검색검증')
  await reset.click();const resetResponse=page.waitForResponse(r=>new URL(r.url()).pathname===root+'/'+resource&&!new URL(r.url()).searchParams.get('search'));await confirmation.getByRole('button',{name:'초기화',exact:true}).click();assert.equal((await resetResponse).status(),200);assert.equal(await field.inputValue(),'')
  assert.equal(new URLSearchParams(requests.filter(r=>r.path===root+'/'+resource).at(-1).query).get('page'),'1')
  for(const control of await page.locator('select,.searchable-choice-trigger:not(.is-title-trigger)').all()) {
   if(!await control.isVisible())continue
   const style=await control.evaluate(e=>{const s=getComputedStyle(e);return {height:e.getBoundingClientRect().height,radius:s.borderRadius,bg:s.backgroundColor,padding:s.paddingLeft,color:s.color}})
   assert.equal(style.height,40,path+JSON.stringify(style));assert.equal(style.radius,'8px',path);assert.equal(style.padding,'12px',path);assert.equal(style.color,'rgb(22, 52, 95)',path)
  }
  if(path==='/app/warehouses') { const boxes=await Promise.all([field,page.getByRole('combobox',{name:'창고 상태 필터'}),search,reset].map(e=>e.boundingBox()));for(let i=1;i<boxes.length;i++){assert(Math.abs(boxes[i].x-boxes[i-1].x-boxes[i-1].width-8)<1,'warehouse adjacent '+JSON.stringify(boxes));assert.equal(boxes[i].height,40)} }
  const period=page.locator('.report-period-fields');if(await period.count()) {
   const dates=period.locator('.report-period-dates'),tabs=period.locator('.report-period-tabs');const a=await dates.boundingBox(),b=await tabs.boundingBox();assert(b.y>=a.y+a.height&&b.y-a.y-a.height<=9,path+' tabs must be below dates')
   const fields=dates.locator('input'); const left=await fields.nth(0).boundingBox(),right=await fields.nth(1).boundingBox(),separator=await dates.locator(':scope > span').boundingBox();assert(Math.abs(left.width-right.width)<1,path+' date widths');assert(Math.abs(separator.x-left.x-left.width-8)<1,path+' left date gap');assert(Math.abs(right.x-separator.x-separator.width-8)<1,path+' right date gap');assert.equal((await fields.nth(0).boundingBox()).y,(await fields.nth(1).boundingBox()).y)
   await tabs.getByRole('button',{name:'7일',exact:true}).click();assert.equal((Date.parse(await fields.nth(1).inputValue())-Date.parse(await fields.nth(0).inputValue()))/86400000,6)
   await fields.nth(0).fill('2099-01-01');assert.equal(await fields.nth(0).evaluate(e=>e.validity.valid),false);await tabs.getByRole('button',{name:'오늘',exact:true}).click()
  }
  assert.equal(await form.getByRole('textbox',{name:/^(LOT 번호 검색|시리얼 번호 검색)$/}).count(),0)
  assert.equal(await page.locator('.wms-breadcrumb').evaluate(e=>getComputedStyle(e).gap),'4px');assert.equal(await page.locator('.wms-breadcrumb').evaluate(e=>getComputedStyle(e).marginBottom),'5px')
  assert.equal(await page.locator('.wms-footer button,.wms-footer .dot').count(),0)
  assert.equal(await page.getByRole('columnheader',{name:/^(단위|재고 단위|수량 단위|기준 단위)$/}).count(),0)
  const pagination=page.locator('.wms-pagination').first();if(await pagination.count()){assert.equal(await pagination.evaluate(e=>getComputedStyle(e).marginTop),'10px');assert.equal(await pagination.evaluate(e=>getComputedStyle(e).paddingTop),'0px')}


 }
 for(const resource of ['receipts','shipments']){
  await visit('/app/'+resource);const picker=page.getByRole('button',{name:/^창고 /});await picker.waitFor();assert.equal(await page.getByRole('combobox',{name:'창고 검색',exact:true}).count(),0)
  await picker.click();await page.getByRole('combobox',{name:'창고 검색',exact:true}).fill('SEARCH-WAREHOUSE');await page.getByRole('option').filter({hasText:'SEARCH-WAREHOUSE'}).click()
  const applied=page.waitForResponse(r=>new URL(r.url()).pathname===root+'/'+resource&&new URL(r.url()).searchParams.get('warehouseId')===fixture.warehouse);await page.getByRole('button',{name:'검색',exact:true}).click();assert.equal((await applied).status(),200)
  await picker.click();await page.getByRole('option',{name:'전체 창고',exact:true}).click();assert.match(await picker.innerText(),/창고/)
 }
 await visit('/app/reports/stock');await page.getByRole('button',{name:/^상품 분류 /}).click();await page.getByRole('combobox',{name:'상품 분류 검색',exact:true}).waitFor();await page.getByRole('option',{name:'전체 분류',exact:true}).click()
 await page.getByRole('button',{name:/^조회 창고 /}).click();await page.getByRole('combobox',{name:'조회 창고 검색',exact:true}).fill('SEARCH-WAREHOUSE');await page.getByRole('option').filter({hasText:'SEARCH-WAREHOUSE'}).click()
 await visit('/app/receipts/new')
 const assignee=page.getByRole('button',{name:/^입고 담당자 /});await assignee.filter({hasText:'김철수'}).waitFor();await assignee.click()
 const memberSearch=page.getByRole('combobox',{name:'입고 담당자 검색',exact:true});await memberSearch.fill('물류관리팀')
 await page.getByRole('option').filter({hasText:'이영희'}).waitFor();assert.match(await page.getByRole('option').innerText(),/물류관리팀 · logistics@qa.test/)
 await memberSearch.fill('logistics@qa.test');await page.getByRole('option').filter({hasText:'이영희'}).click();assert.match(await assignee.innerText(),/이영희/)
 await page.getByRole('textbox',{name:'입고 비고',exact:true}).fill('선택 유지');assert.match(await assignee.innerText(),/이영희/)
 await visit('/app/partners');await page.getByRole('button',{name:'QA물류00 상세',exact:true}).click()
 let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'거래처 수정',exact:true}).waitFor()
 assert.equal(await dialog.getByText('등록일',{exact:true}).count(),0);assert.equal(await dialog.getByText('수정일',{exact:true}).count(),0)
 const close=dialog.getByRole('button',{name:'닫기',exact:true}),edit=dialog.getByRole('button',{name:'거래처 수정',exact:true})
 const a=await close.boundingBox(),b=await edit.boundingBox();assert.equal(a.y,b.y);assert(Math.abs(b.x-a.x-a.width-8)<1);assert.equal(a.height,b.height)
 assert.equal(await close.evaluate(e=>getComputedStyle(e).paddingLeft),'14px')
 await edit.click();await dialog.getByRole('textbox',{name:'거래처명',exact:false}).waitFor();await dialog.getByRole('button',{name:'취소',exact:true}).click();await close.click()
 await visit('/app/settings/users');await page.getByRole('button',{name:'사용자 등록',exact:true}).click()
 dialog=page.getByRole('dialog');await dialog.getByRole('combobox',{name:'계정 유형',exact:true}).selectOption('External')
 await dialog.getByRole('textbox',{name:'담당자명',exact:true}).fill('거래처 연결 QA')
 const login='ui-partner-'+Date.now();await dialog.getByRole('textbox',{name:'로그인 아이디',exact:true}).fill(login);await dialog.getByRole('textbox',{name:'이메일',exact:true}).fill(login+'@qa.test')
 await dialog.getByRole('combobox',{name:'기존 거래처 연결 여부',exact:true}).selectOption('existing')
 assert.equal(await dialog.getByRole('textbox',{name:'거래처 검색',exact:true}).count(),0)
 const partnerButton=dialog.getByRole('button',{name:/^기존 거래처 /});await partnerButton.click()
 const optionList=dialog.getByRole('listbox',{name:'기존 거래처 선택 목록',exact:true});await optionList.getByRole('option').first().waitFor()
 assert.equal(await dialog.locator('.wms-pagination').count(),0)
 await optionList.evaluate(e=>e.scrollTop=e.scrollHeight)
 await optionList.getByRole('option').filter({hasText:'QA물류24'}).waitFor();await optionList.getByRole('option').filter({hasText:'QA물류24'}).click()
 assert.equal(await dialog.getByRole('textbox',{name:'소속 업체명',exact:true}).inputValue(),'QA물류24')
 assert.equal(await dialog.getByRole('textbox',{name:'사업자등록번호 (선택)',exact:true}).inputValue(),'123-45-67890')
 assert.equal(await dialog.getByRole('textbox',{name:'업체 연락처 (선택)',exact:true}).inputValue(),'02-1234-5678')
 assert.equal(await dialog.getByRole('textbox',{name:'주소',exact:true}).inputValue(),'서울특별시 QA동')
 // Changing the selection clears both copied values and the linked ID; dropdown search stays internal.
 await partnerButton.click();await dialog.getByRole('combobox',{name:'기존 거래처 검색',exact:true}).fill('QA물류00')
 await dialog.getByRole('option').filter({hasText:'QA물류00'}).click();assert.equal(await dialog.getByRole('textbox',{name:'소속 업체명',exact:true}).inputValue(),'QA물류00')
 await dialog.getByRole('combobox',{name:'기존 거래처 연결 여부',exact:true}).selectOption('new');assert.equal(await dialog.locator('input[name=partnerId]').inputValue(),'')
 assert.equal(await dialog.getByRole('textbox',{name:'소속 업체명',exact:true}).evaluate(e=>e.readOnly),false)
 await dialog.getByRole('combobox',{name:'기존 거래처 연결 여부',exact:true}).selectOption('existing');await partnerButton.click();await dialog.getByRole('combobox',{name:'기존 거래처 검색',exact:true}).fill('QA물류24');await dialog.getByRole('option').filter({hasText:'QA물류24'}).click()
 const partnerId=await dialog.locator('input[name=partnerId]').inputValue();assert(partnerId)
 await dialog.getByText('사용 가능한 로그인 아이디입니다.',{exact:true}).waitFor();await dialog.getByRole('button',{name:'계정 생성',exact:true}).click()
 await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).waitFor();const created=page.waitForResponse(r=>new URL(r.url()).pathname===root+'/users'&&r.request().method()==='POST');await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click()
 const saved=await created;assert.equal(saved.status(),201,await saved.text());assert.equal((await saved.json()).user.partnerId,partnerId)
 await page.getByRole('button',{name:'확인하고 닫기',exact:true}).click()
 for(const [path,prefix] of [['/app/reports/movements','통계'],['/app/reports/history','이력']]){
  await visit(path);assert.equal(await page.locator('.wms-page-header').getByRole('button',{name:'새로 조회',exact:true}).count(),1);await page.getByRole('button',{name:'7일',exact:true}).click();const start=page.getByLabel(prefix+' 시작일',{exact:true}),end=page.getByLabel(prefix+' 종료일',{exact:true});assert.equal((Date.parse(await end.inputValue())-Date.parse(await start.inputValue()))/86400000,6)
  await start.fill('2099-01-01');assert.equal(await start.evaluate(e=>e.validity.valid),false);assert.equal(await page.getByRole('button',{name:'직접 설정',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'오늘',exact:true}).click();assert.equal(await start.inputValue(),await end.inputValue())
 }
 await visit('/app/settings/organization');await page.getByRole('button',{name:'전체 접기',exact:true}).click();assert.equal(await page.getByRole('button',{name:'전체 펼치기',exact:true}).count(),1);await page.getByRole('button',{name:'전체 펼치기',exact:true}).click();await page.getByRole('button',{name:'검수팀 접기',exact:true}).click();assert.equal(await page.getByRole('button',{name:'전체 펼치기',exact:true}).count(),1)
 assert.equal(await page.locator('#org-chart-help').count(),0);assert.equal(await page.getByText('인원수는 활성 계정의 직속 소속 기준입니다.',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'조직도 새로고침',exact:true}).count(),0)
 for(const label of ['조직도 확대','조직도 축소']){const b=await page.getByRole('button',{name:label,exact:true}).boundingBox();assert.equal(b.width,36);assert.equal(b.height,36)}
 const checkControls=async scope=>{
  for(const c of await scope.locator('input:not([type=checkbox],[type=radio],[type=file],[type=range],[type=hidden],[type=color]),select:not([multiple]),.searchable-choice-trigger:not(.is-title-trigger)').all()){
   if(!await c.isVisible())continue
   const actual=await c.evaluate(e=>{const s=getComputedStyle(e);return [e.getBoundingClientRect().height,s.borderRadius,s.paddingLeft,s.color]});assert.deepEqual(actual,[40,'8px','12px','rgb(22, 52, 95)'],page.url()+' '+await c.evaluate(e=>e.outerHTML.slice(0,150)))
  }
  for(const field of await scope.locator('.searchable-choice:not(.is-title-picker)').all()) {
   const label=field.locator(':scope > label'),trigger=field.locator(':scope > button');if(!await label.count()||!await trigger.count()||!await label.isVisible()||!await trigger.isVisible())continue
   if(await label.evaluate(e=>getComputedStyle(e).position==='absolute'))continue
   const a=await label.boundingBox(),b=await trigger.boundingBox();assert(Math.abs(b.y-a.y-a.height-5)<1,'label gap '+await label.innerText()+' '+JSON.stringify({a,b}))
  }
 }
 for(const route of ['/app','/app/barcode-lookup','/app/settings/items','/app/settings/company','/app/master/billing','/app/master/permissions','/app/products/new','/app/shipments/new','/app/inventory/counts/new','/app/master/activity-log',`/app/products/${fixture.product}`]){
  await visit(route);await checkControls(page)
 }
 await visit('/app/master/activity-log');await page.getByRole('button',{name:'변경 내용',exact:true}).first().click();await page.getByRole('dialog',{name:'활동 로그 상세'}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click()
 await visit('/app/settings/company');assert.equal(await page.getByText('기업 정보 변경 이력',{exact:true}).count(),0)
 await visit('/app/inventory/counts');assert.equal(await page.getByText('기타 작업',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'전체 재고 실사',exact:true}).count(),0)
 await visit('/app/master/permissions');await page.getByRole('button',{name:/^설정할 권한 /}).waitFor();assert.equal(await page.getByText('기본 제공',{exact:true}).count(),0);const bar=page.locator('.permission-viewbar');assert.equal(await bar.getByRole('button',{name:'안전한 기본값 복원',exact:true}).count(),1);await bar.getByRole('button',{name:'안전한 기본값 복원',exact:true}).click();await page.getByRole('dialog',{name:'안전한 기본값 복원',exact:true}).getByRole('button',{name:'취소',exact:true}).click()
 await visit('/app/settings/items')
 for(const tab of ['부서 관리','직급 관리','권한 등급 관리']){
  await page.getByRole('tab',{name:tab,exact:true}).click();const form=page.locator('.list-search-filters');await form.waitFor();const input=await form.locator('input').boundingBox(),search=await form.getByRole('button',{name:'검색',exact:true}).boundingBox();assert(Math.abs(search.x-input.x-input.width-8)<1,tab+' search spacing');assert.equal(input.y,search.y)
  for(const row of await page.locator('.organization-card .organization-row-actions').all())assert.equal(await row.evaluate(e=>getComputedStyle(e).borderTopWidth),'0px')
 }
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000})
  for(const [path] of cases){
   await visit(path);const form=page.locator('form').filter({has:page.getByRole('button',{name:'검색',exact:true})}).first();await form.waitFor()
   const metrics=await form.evaluate(f=>{const fields=[...f.querySelectorAll('input,select,button.searchable-choice-trigger,button[type=submit],button.list-search-submit')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}});return {fields,width:innerWidth,scroll:document.documentElement.scrollWidth}})
   for(const range of await form.locator('.report-period-dates').all()) {const l=await range.locator('input').nth(0).boundingBox(),r=await range.locator('input').nth(1).boundingBox(),sep=await range.locator(':scope > span').boundingBox();assert(Math.abs(sep.x-l.x-l.width-8)<1&&Math.abs(r.x-sep.x-sep.width-8)<1,path+' date gap '+width);assert(Math.abs(l.width-r.width)<1,path+' date equal width '+width)}
   for(const tabs of await page.locator('.wms-segmented').all()){if(await tabs.isVisible()){assert.equal(await tabs.evaluate(e=>getComputedStyle(e).borderRadius),'10px');assert.equal(await tabs.locator(':scope > button').first().evaluate(e=>getComputedStyle(e).borderRadius),'8px',path+' '+await tabs.getAttribute('class'))}}
   assert(metrics.fields.every(r=>r.x>=0&&r.right<=width+1),path+' '+width+' field overflow '+JSON.stringify(metrics));assert(metrics.scroll<=width+1,path+' document overflow '+width)
   for(let i=0;i<metrics.fields.length;i++)for(let j=i+1;j<metrics.fields.length;j++){const a=metrics.fields[i],b=metrics.fields[j];assert(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1,path+' overlapping fields '+width)}
  }
  for(const route of ['/app/settings/items','/app/settings/company','/app/master/permissions','/app/settings/organization','/app/products/new','/app/receipts/new','/app/shipments/new','/app/inventory/counts/new','/app/master/activity-log']){await visit(route);await checkControls(page);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' '+width)}
  await visit('/app/partners');await page.getByRole('button',{name:'QA물류00 상세',exact:true}).click();const d=page.getByRole('dialog');await d.getByRole('button',{name:'닫기',exact:true}).waitFor();const box=await d.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);await d.getByRole('button',{name:'닫기',exact:true}).click()
 }
 await page.goto(origin+'/__qa-login')
 await page.evaluate(async password=>{const csrf=await(await fetch('/api/auth/csrf')).json();await fetch('/api/auth/logout',{method:'POST',headers:{'X-CSRF-TOKEN':csrf.token}});const next=await(await fetch('/api/auth/csrf')).json();const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':next.token},body:JSON.stringify({email:'UiAdmin',password})});if(!r.ok)throw Error('QA admin login '+r.status)},fixture.password)
 await page.goto(origin+'/admin');await page.getByRole('button',{name:'기업 관리',exact:true}).click();await page.locator('.admin-filters').waitFor();await checkControls(page)
 const adminPeriod=page.locator('.report-period-fields');assert.equal(await adminPeriod.count(),1);await adminPeriod.getByRole('button',{name:'7일',exact:true}).click()
 for(const width of [1920,1440,1280,768,390]){await page.setViewportSize({width,height:1000});await checkControls(page);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'admin '+width)}
 assert.deepEqual(errors,[])
 console.log('PASS real API: department/email search, partner detail actions, scroll-only partner selection/autofill/save, all list filters, Enter, five widths; isolated SQLite writes only')
}
}finally{if(page&&!page.isClosed())await page.goto('about:blank');if(context)await context.unrouteAll({behavior:'wait'});await browser.close()}
