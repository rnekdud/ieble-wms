import assert from 'node:assert/strict'
import { chromium } from 'playwright'
let input='';for await(const chunk of process.stdin)input+=chunk
const fixture=JSON.parse(input),origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',root=`/api/tenants/${fixture.tenant}`
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],requests=[]
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
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
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/__qa-login')
 assert.equal(await page.evaluate(async password=>{const csrf=await(await fetch('/api/auth/csrf')).json();return(await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':csrf.token},body:JSON.stringify({email:'Master',password})})).status},fixture.password),200)
 const visit=async path=>{await page.goto(origin+path,{waitUntil:'domcontentloaded'});await page.locator('.wms-page-header h1,.wms-page-header h2').first().waitFor()}
 const cases=[['/app/products',['엑셀 대량등록','상품 등록'],'상품 검색','products'],['/app/warehouses',['창고 등록'],'창고 검색','warehouses'],['/app/receipts',['입고 등록'],'입고 검색','receipts'],['/app/shipments',['출고 등록'],'출고 검색','shipments'],['/app/inventory/counts',['실사 등록'],'실사 검색','stocktakes'],['/app/partners',['거래처 등록'],'거래처 검색','partners'],['/app/settings/users',['사용자 등록','마스터 위임'],'사용자 검색','users'],['/app/support',['문의 등록'],'문의 검색','support'],['/app/inventory/adjustments',['재고 이동','재고 조정'],'재고 검색','inventory'],['/app/reports/stock',['Excel 다운로드','CSV 다운로드'],'재고 현황 검색','reports/stock-overview'],['/app/reports/movements',['Excel 다운로드','CSV 다운로드'],'입출고 통계 검색','reports/movement-stats'],['/app/reports/history',['Excel 다운로드','CSV 다운로드'],'재고 이력 검색','reports/stock-history']]
 for(const [path,buttons,label,resource] of cases){
  await visit(path)
  for(const name of buttons)assert.equal(await page.locator('.wms-page-actions').getByRole('button',{name,exact:true}).count(),1,path+' '+name)
  const search=page.getByRole('button',{name:'검색',exact:true}).first();await search.waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='검색')?.disabled)
  const field=page.getByRole('textbox',{name:label,exact:true});const before=requests.filter(r=>r.path===root+'/'+resource).length
  await field.fill('검색검증');if(path==='/app/products')await page.getByRole('combobox',{name:'사용 여부 필터',exact:true}).selectOption('inactive');await page.waitForTimeout(300)
  assert.equal(requests.filter(r=>r.path===root+'/'+resource).length,before,path+' must not auto-search')
  const response=page.waitForResponse(r=>new URL(r.url()).pathname===root+'/'+resource&&new URL(r.url()).searchParams.get('search')==='검색검증');if(path==='/app/products')await search.click();else await field.press('Enter');assert.equal((await response).status(),200)
  await page.waitForTimeout(250);assert.equal(requests.filter(r=>r.path===root+'/'+resource).length,before+1,path+' one submit only')
  const applied=new URLSearchParams(requests.filter(r=>r.path===root+'/'+resource).at(-1).query);assert.equal(applied.get('page'),'1');if(path==='/app/products')assert.equal(applied.get('status'),'inactive')
 }
 await visit('/app/settings/users');await page.getByRole('cell',{name:'김철수',exact:true}).waitFor()
 const headers=await page.locator('.organization-user-table th').allTextContents();assert(headers.includes('권한 등급'));assert(!headers.some(t=>/최근 로그인|과금 시작일/.test(t)))
 assert.equal(await page.getByText('마스터 보호',{exact:true}).count(),0)
 const tag=page.locator('.organization-user-table .badge').filter({hasText:'내부 직원'}).first();assert.equal((await tag.innerText()).trim(),'내부 직원');assert.equal((await tag.locator('..').locator('.badge').filter({hasText:'활성'}).innerText()).trim(),'활성')
 await page.getByRole('button',{name:'사용자 등록',exact:true}).click();const dialog=page.getByRole('dialog');const login=dialog.getByRole('textbox',{name:'로그인 아이디',exact:true}),password=dialog.getByRole('textbox',{name:'비밀번호',exact:true})
 let a=await login.boundingBox(),b=await password.boundingBox();assert(Math.abs(a.y-b.y)<1&&b.x>a.x,'credentials two columns '+JSON.stringify({a,b}));assert.equal(await password.inputValue(),'자동 생성 · 직접 입력 불가');assert(await password.evaluate(e=>e.readOnly));assert.equal(await page.locator('#employee-login-id-help').count(),0)
 await page.setViewportSize({width:390,height:844});a=await login.boundingBox();b=await password.boundingBox();assert(b.y>a.y,'credentials stack on mobile')
 await page.setViewportSize({width:1440,height:1000});await visit('/app/settings/items')
 for(const tab of ['부서 관리','직급 관리','권한 등급 관리']){await page.getByRole('tab',{name:tab,exact:true}).click();assert.equal(await page.locator('caption').count(),0);assert.equal(await page.getByText(/직급은 시스템 접근 권한과 별개|새 권한은 업무 접근 없이/).count(),0);assert.equal(await page.locator('.wms-page-actions button').count(),1)}
 await visit('/app/reports/stock');await page.getByRole('button',{name:'창고별 재고',exact:true}).click();const warehouses=page.getByRole('table',{name:'창고별 재고',exact:true});await warehouses.getByRole('cell',{name:'2종',exact:true}).waitFor();assert.equal(await warehouses.locator('tbody tr').count(),1);assert.match(await warehouses.innerText(),/10 kg/);assert.match(await warehouses.innerText(),/3개/)
 await warehouses.getByRole('button',{name:'창고 상품별 재고',exact:true}).click();await page.getByRole('dialog').getByText('BULK',{exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:/BULK.*상세/}).click();await page.getByRole('dialog').getByRole('cell',{name:/FLOOR-1/}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click()
 await page.getByRole('button',{name:'상품별 재고',exact:true}).click();await page.getByRole('button',{name:/BULK.*상세/}).click();await page.getByRole('dialog').getByRole('button',{name:/BULK.*상세/}).click();await page.getByRole('dialog').getByRole('cell',{name:/FLOOR-1/}).waitFor()
 await visit('/app/products/'+fixture.product);assert.equal(await page.getByText('재고 단위',{exact:true}).count(),0);await page.getByRole('spinbutton',{name:'안전재고 수량',exact:true}).waitFor()
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000})
  for(const path of ['/app/products','/app/settings/users','/app/settings/items','/app/warehouses']){
   await visit(path);await page.waitForTimeout(250)
   const metrics=await page.locator('.wms-content').evaluate(main=>{const h=main.querySelector('.wms-page-heading'),title=h.querySelector('h1'),crumb=main.querySelector('.wms-breadcrumb'),actions=h.querySelector('.wms-page-actions');const t=title.getBoundingClientRect(),a=actions?.getBoundingClientRect(),c=crumb.getBoundingClientRect();return {breadcrumbVisible:getComputedStyle(crumb).display!=='none',gap:t.top-c.bottom,left:t.left-c.left,overlap:a&&!(a.left>=t.right||a.top>=t.bottom),width:document.documentElement.scrollWidth,viewport:innerWidth,buttons:[...h.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return r.right<=innerWidth&&r.left>=0})}})
   if(metrics.breadcrumbVisible){assert(Math.abs(metrics.gap-5)<1,`${path} ${width} breadcrumb ${metrics.gap}`);assert(Math.abs(metrics.left)<1)};assert(!metrics.overlap,`${path} ${width} title overlaps actions`);assert(metrics.width<=width+1,`${path} ${width} overflow ${metrics.width}`);assert(metrics.buttons.every(Boolean))
  }
 }
 assert.deepEqual(errors,[])
 assert(requests.filter(r=>r.method!=='GET'&&r.path!=='/api/auth/login').length===0,'UI audit must not write business records')
 console.log('PASS real API/UI: list header actions, explicit Enter search, user columns/credentials, item tabs, warehouse/product stock drilldown, five widths; no business writes')
}finally{await browser.close()}
