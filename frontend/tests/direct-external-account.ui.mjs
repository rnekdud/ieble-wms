import assert from 'node:assert/strict'
import { chromium } from 'playwright'
let input='';for await(const chunk of process.stdin)input+=chunk
const fixture=JSON.parse(input),origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176'
let stage='start'
const watchdog=setTimeout(()=>{console.error('Timeout stage:',stage);process.exit(1)},60000)
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[]
try {
 async function actor(login){ const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.origin!==origin)return route.abort()
  if(u.pathname==='/__assignee-login')return route.fulfill({contentType:'text/html',body:'<html><body>격리 QA</body></html>'})
  if(!u.pathname.startsWith('/api/'))return route.continue()
  assert.ok(!/account-links|company-links/.test(u.pathname),'Retired API requested: '+u.pathname)
  // The real app and auth flow use an isolated SQLite API, never the QA company's DB.
  const response=await context.request.fetch('http://localhost:5086'+u.pathname+u.search,{method:req.method(),headers:req.headers(),data:req.postDataBuffer()||undefined,failOnStatusCode:false})
  // The PostgreSQL-only health probe returns 503 in this intentionally SQLite-backed fixture.
  if(response.status()>=500 && !(u.pathname==='/api/health/db' && response.status()===503))errors.push(`API ${response.status()} ${u.pathname}`)
  return route.fulfill({status:response.status(),headers:response.headers(),body:await response.body()})
 })
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/__assignee-login')
 const post=(path,body)=>page.evaluate(async({path,body})=>{const csrf=await(await fetch('/api/auth/csrf')).json();const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':csrf.token},body:JSON.stringify(body)});return {status:r.status,text:await r.text()}},{path,body})

 if(login)assert.equal((await post('/api/auth/login',{email:login,password:fixture.password})).status,200)
 await page.goto(origin+'/app')
 return {page,post,context}
 }
 const manager=await actor(fixture.ownerB),page=manager.page
 stage='direct registration';await page.goto(origin+'/app/settings/users')
 await page.getByRole('button',{name:'사용자 등록',exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'협력사 계정 연결',exact:true}).count(),0)
 await page.getByRole('button',{name:'사용자 프로필 메뉴',exact:true}).click()
 assert.equal(await page.getByRole('button',{name:/기업 선택 · 연결 요청|기업 전환/}).count(),0)
 await page.getByRole('button',{name:'사용자 프로필 메뉴',exact:true}).click()
 await page.getByRole('button',{name:'사용자 등록',exact:true}).click()
 await page.getByRole('combobox',{name:'계정 유형',exact:true}).selectOption('External')
 await page.getByRole('textbox',{name:'담당자명',exact:true}).fill('신규 협력사 직원')
 const id='partner-ui-'+Date.now()
 await page.getByRole('textbox',{name:'로그인 아이디',exact:true}).fill(id)
 await page.getByRole('textbox',{name:'이메일',exact:true}).fill(id+'@direct.test')
 await page.getByRole('button',{name:/^등록된 외부 협력사 /}).click()
 await page.getByRole('combobox',{name:'등록된 외부 협력사 검색',exact:true}).fill('ABC물류')
 await page.getByRole('option').filter({hasText:'ABC물류 B관계'}).click()
 await page.getByRole('textbox',{name:'소속 업체명',exact:true}).waitFor()
 await page.getByText('사용 가능한 로그인 아이디입니다.',{exact:true}).waitFor()
 await page.getByRole('button',{name:'계정 생성',exact:true}).click()
 const created=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/tenants/${fixture.b}/users`&&r.request().method()==='POST')
 await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click()
 const response=await created;assert.equal(response.status(),201);const data=await response.json();assert.equal(data.user.accountType,'External');assert.equal(data.user.collaboratorId,fixture.groupB)
 await page.getByRole('button',{name:'확인하고 닫기',exact:true}).click()
 stage='external login';const employee=await actor(null)
 assert.equal((await employee.post('/api/auth/login',{email:id,password:id})).status,200)
 assert.equal((await employee.post('/api/auth/change-password',{currentPassword:id,newPassword:fixture.password,confirmPassword:fixture.password})).status,200)
 await employee.page.goto(origin+'/app')
 await employee.page.getByRole('button',{name:'사용자 프로필 메뉴',exact:true}).click()
 assert.equal(await employee.page.getByRole('button',{name:/기업 선택 · 연결 요청|기업 전환/}).count(),0)
 const session=await employee.page.evaluate(async()=>await(await fetch('/api/auth/me')).json());assert.equal(session.memberships.length,1);assert.equal(session.selectedTenantId,fixture.b)
 assert.equal((await employee.post('/api/auth/select-tenant',{tenantId:fixture.a})).status,403)
 assert.deepEqual(errors,[])
 console.log('PASS link UI absent, collaborator selection, direct registration, initial password change, own-company login and foreign-company denial; isolated API only')
}catch(error){console.error('Stage:',stage);throw error}finally{await browser.close();clearTimeout(watchdog)}
