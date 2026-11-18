import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',baseline=process.env.BASELINE_ORIGIN
const browser=await chromium.launch({channel:'chrome',headless:true})
const errors=[],logins=[]
let authenticated=false,status=401
try {
 const context=await browser.newContext({serviceWorkers:'block',hasTouch:true})
 for(const base of [origin,baseline].filter(Boolean))await context.routeWebSocket(base.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname
  assert([origin,baseline].includes(url.origin),'No external requests')
  if(!path.startsWith('/api/'))return route.continue()
  const respond=(json,code=200)=>route.fulfill({status:code,json})
  if(path==='/api/health/db')return respond({status:'connected'})
  if(path==='/api/auth/csrf')return respond({token:'isolated-ui-token'})
  if(path==='/api/auth/me')return authenticated?respond({user:{id:'mock-admin',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'IebleAdministrator',mustChangePassword:false},memberships:[],selectedTenantId:null,tenantResolution:'no_membership'}):respond({message:'로그인 필요'},401)
  if(path==='/api/auth/login'){logins.push(request.postDataJSON());authenticated=status===200;return respond({message:authenticated?'로그인되었습니다.':'아이디 또는 비밀번호를 확인해 주세요.'},status)}
  if(path==='/api/admin/overview')return respond({tenantCount:0,activeTenantCount:0,activeUserCount:0,newTenantCount:0,inquiryCount:0,pendingInquiryCount:0})
  errors.push('Unexpected API '+path);return respond({message:'Unexpected'},404)
 })
 const page=await context.newPage(),old=baseline?await context.newPage():null
 page.on('pageerror',e=>errors.push(e.message))
 const open=async(p,base,width,height)=>{await p.setViewportSize({width,height});await p.goto(base+'/login');await p.getByRole('button',{name:'로그인',exact:true}).waitFor();await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>scrollTo(0,0))}
 const measure=p=>p.evaluate(()=>{
  const rect=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom,display:getComputedStyle(e).display}}
  return {viewport:[innerWidth,innerHeight],shell:rect('.login-shell'),image:rect('.login-image-panel'),form:rect('.auth-card'),id:rect('[name=email]'),password:rect('[name=password]'),button:rect('[type=submit]'),title:rect('.auth-form-title'),header:rect('.auth-header'),copyright:rect('.login-copyright'),scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}
 })
 for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await open(page,origin,width,height)
  const m=await measure(page),landscape=width<=1024&&height<=500&&width>height
  assert(m.scrollWidth<=m.clientWidth)
  if(landscape){assert.equal(m.image.display,'none');assert(m.id.y>=0&&m.password.y>=m.id.bottom);assert(m.button.y>=m.password.bottom);assert(m.button.bottom<=height,'submit within initial viewport '+JSON.stringify(m));assert.equal(m.id.h,40);assert.equal(m.password.h,40);assert.equal(m.button.h,44);assert(await page.locator('.auth-header img').evaluate(e=>e.complete&&e.naturalWidth>0));assert(await page.locator('[type=submit]').evaluate(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}))}
  if(old){await open(old,baseline,width,height);const before=await measure(old);if(!landscape)assert.deepEqual(m,before,'portrait/tablet/PC unchanged');console.log('DOM',width,height,'image',before.image.h,'->',m.image.h,'submit Y',before.button.y,'->',m.button.y,'bottom',m.button.bottom)}
  else console.log('DOM',width,height,JSON.stringify(m))
 }
 await page.setViewportSize({width:844,height:390})
 const id=page.getByRole('textbox',{name:'아이디',exact:true}),password=page.locator('[name=password]'),submit=page.getByRole('button',{name:'로그인',exact:true})
 await submit.click();assert.equal(logins.length,0);assert(await id.evaluate(e=>e.validity.valueMissing))
 await id.fill('isolated-qa');await password.fill('Test-password!2026')
 await page.getByRole('button',{name:'비밀번호 표시',exact:true}).click();assert.equal(await password.getAttribute('type'),'text')
 await page.getByRole('button',{name:'비밀번호 숨기기',exact:true}).click();assert.equal(await password.getAttribute('type'),'password')
 await password.press('Enter');await page.getByRole('alert').getByText('아이디 또는 비밀번호를 확인해 주세요.',{exact:true}).waitFor();assert.equal(logins.length,1)
 const alert=await page.getByRole('alert').boundingBox(),form=await page.locator('form').boundingBox();assert(alert.y+alert.height<=form.y)
 await submit.scrollIntoViewIfNeeded();assert(await submit.evaluate(e=>{const b=e.getBoundingClientRect();return b.y>=0&&b.bottom<=innerHeight}))
 await password.focus()
 // Reduced viewport tests scrolling only, not a real Android keyboard.
 for(const [width,height] of [[844,190],[390,844],[932,430],[844,390]]){
  await page.setViewportSize({width,height});assert.equal(await id.inputValue(),'isolated-qa');assert.equal(await password.inputValue(),'Test-password!2026');assert(await password.evaluate(e=>e===document.activeElement));await password.scrollIntoViewIfNeeded();const p=await password.boundingBox();assert(p.y>=-1&&p.y+p.height<=height+1);await submit.scrollIntoViewIfNeeded();const b=await submit.boundingBox();assert(b.y>=-1&&b.y+b.height<=height+1,JSON.stringify({width,height,button:b,scroll:await page.evaluate(()=>({y:scrollY,height:document.documentElement.scrollHeight,overflow:getComputedStyle(document.body).overflowY}))}));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 }
 await page.getByRole('button',{name:'비밀번호를 잊으셨나요?',exact:true}).click();await page.getByRole('dialog',{name:'비밀번호 찾기'}).waitFor();await page.keyboard.press('Escape')
 status=200;await submit.click();await page.waitForURL('**/admin');await page.getByRole('heading',{name:'아이블 관리자',exact:true}).waitFor();assert.equal(logins.length,2);assert.equal(logins[0].email,'isolated-qa');assert.equal(logins[1].email,'isolated-qa');assert.deepEqual(errors,[])
 console.log('PASS 10 viewports, validation, password toggle, Enter/error/click/success, help, rotation input/focus, reduced-height scrolling; APIs mocked')
}finally{await browser.close()}
