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
 const manager=await actor(fixture.ownerB),guest=await actor(null),page=guest.page
 stage='signup form';await page.goto(origin+'/register')
 const login=page.getByRole('textbox',{name:'로그인 아이디',exact:true}),submit=page.getByRole('button',{name:'기업 계정 만들기',exact:true})
 await login.fill(fixture.login.toUpperCase());await page.getByText('이미 사용 중인 로그인 아이디입니다. 다른 아이디를 입력해 주세요.',{exact:true}).waitFor();assert.equal(await submit.isDisabled(),true)
 const first='signup-ui-'+Date.now();await login.fill(first);await page.getByText('사용 가능한 로그인 아이디입니다.',{exact:true}).waitFor()
 await page.getByRole('textbox',{name:'기업명',exact:true}).fill('회원가입 QA')
 await page.locator('input[name=businessRegistrationNumber]').fill('2345678901')
 await page.getByRole('textbox',{name:'담당자 이름',exact:true}).fill('가입 담당자')
 await page.getByRole('textbox',{name:'연락처',exact:true}).fill('010-1234-5678')
 await page.getByRole('textbox',{name:'이메일',exact:true}).fill(first+'@signup.test')
 await page.getByLabel('비밀번호',{exact:true}).fill(fixture.password)
 await page.getByLabel('비밀번호 확인',{exact:true}).fill(fixture.password)
 stage='server recheck'
 assert.equal((await manager.post(`/api/tenants/${fixture.b}/users`,{name:'동시 등록자',loginId:first,email:'member-'+first+'@signup.test',role:'Employee',accountType:'Internal'})).status,201)
 await submit.click();await page.getByRole('alert').filter({hasText:'이미 사용 중인 로그인 아이디입니다.'}).waitFor();assert.equal(await submit.isDisabled(),true)
 await login.fill(first+'-new');await page.getByText('사용 가능한 로그인 아이디입니다.',{exact:true}).waitFor()
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.ok(await login.evaluate(e=>e.getBoundingClientRect().right<=innerWidth));}
 stage='signup save';await submit.click();await page.getByText('기업 가입이 완료되었습니다. 로그인하여 활성화 상태를 확인해 주세요.',{exact:true}).waitFor()
 const duplicate=await manager.post(`/api/tenants/${fixture.b}/users/login-id-check`,{loginId:(first+'-new').toUpperCase()});assert.equal(duplicate.status,200);assert.equal(JSON.parse(duplicate.text).available,false)
 assert.deepEqual(errors,[])
 console.log('PASS actual signup: member ID blocked, input changes rechecked, save-time race reported inline and blocks submit, corrected ID signup, reverse member duplicate, desktop/mobile; isolated API only')
}catch(error){console.error('Stage:',stage);throw error}finally{await browser.close();clearTimeout(watchdog)}
