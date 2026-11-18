import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176'
const browser=await chromium.launch({channel:'chrome',headless:true})
let required=true,authenticated=true,fail=true,changes=0,logouts=0,release
const errors=[],businessReads=[],name='격리 QA 사용자',old='qa-initial',next='Qa-personal!2026'
try{
 const context=await browser.newContext({serviceWorkers:'block'});await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());assert.equal(u.origin,origin)
  if(!u.pathname.startsWith('/api/'))return route.continue()
  const json=value=>route.fulfill({json:value}),path=u.pathname
  if(path==='/api/auth/me')return authenticated?json({user:{id:'qa-user',displayName:name,userName:'qa-initial',email:'qa@example.test',systemRole:'User',mustChangePassword:required},memberships:[{tenantId:'gate-qa',name:'격리 QA 기업',role:'Employee',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'gate-qa'}):route.fulfill({status:401,json:{message:'로그인이 필요합니다.'}})
  if(path==='/api/auth/csrf')return json({token:'qa'})
  if(path==='/api/auth/logout'){assert.equal(r.method(),'POST');logouts++;authenticated=false;return json({})}
  if(path==='/api/auth/change-password'){
   assert.equal(r.method(),'POST');changes++;assert.deepEqual(r.postDataJSON(),{currentPassword:old,newPassword:next,confirmPassword:next})
   if(fail)return route.fulfill({status:400,json:{message:'현재 비밀번호를 확인해 주세요.'}})
   await new Promise(resolve=>{release=resolve});required=false;return json({})
  }
  assert.equal(r.method(),'GET');if(path.startsWith('/api/tenants/')){assert.equal(required,false,'business API blocked before password change');businessReads.push(path)}
  if(path.endsWith('/workspace'))return json({id:'gate-qa',name:'격리 QA 기업',role:'Employee',serviceStatus:'Active',billingAccess:{canAccessWms:true},canManageBilling:false,permissions:{dashboard:['menu','read']}})
  if(path.endsWith('/dashboard/warehouses'))return json({warehouses:[],asOf:new Date().toISOString()})
  return json({})
 })
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
 const dialog=page.getByRole('dialog'),submit=page.getByRole('button',{name:'비밀번호 변경 후 시작',exact:true}),logout=page.getByRole('button',{name:'로그아웃',exact:true})
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:900});await page.goto(origin+'/app/products/new');await dialog.waitFor()
  const intro=dialog.locator('.password-change-intro');assert.equal(await intro.locator('br').count(),1)
  assert.equal(await intro.innerText(),`${name}님, 비밀번호 변경이 필요한 계정입니다.\n변경을 완료해야 업무를 시작할 수 있습니다.`)
  const css=await intro.evaluate(el=>{const s=getComputedStyle(el);return {ratio:parseFloat(s.lineHeight)/parseFloat(s.fontSize),font:s.fontSize,margin:s.marginBottom}})
  assert(Math.abs(css.ratio-1.4)<.01);assert.equal(css.font,'14px');assert.equal(css.margin,'20px')
  const d=await dialog.boundingBox(),l=await logout.boundingBox(),s=await submit.boundingBox();assert(Math.abs(l.x+l.width/2-d.x-d.width/2)<1);assert.equal(Math.round(l.y-s.y-s.height),14);assert(l.height>=40)
  assert.equal(await logout.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(247, 247, 247)')
  assert.equal(await submit.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 193, 7)')
  const fields=await dialog.locator('.password-field input').all();for(const input of fields)assert.equal((await input.boundingBox()).height,40)
  for(const field of await dialog.locator('.password-field').all()){const label=await field.locator('label').boundingBox(),input=await field.locator('input').boundingBox();assert(Math.abs(input.y-label.y-label.height-5)<1)}
  assert(d.x>=0&&d.x+d.width<=width+1);assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
  await page.keyboard.press('Escape');assert(await dialog.isVisible());await page.mouse.click(2,2);assert(await dialog.isVisible());assert.equal(await page.locator('.wms-layout').count(),0)
 }
 assert.equal(businessReads.length,0)
 await page.getByLabel('현재 비밀번호',{exact:true}).fill(old);await page.getByRole('button',{name:'현재 비밀번호 표시',exact:true}).click();assert.equal(await page.getByLabel('현재 비밀번호',{exact:true}).getAttribute('type'),'text');await page.getByRole('button',{name:'현재 비밀번호 숨기기',exact:true}).click()
 await page.getByLabel('새 비밀번호',{exact:true}).fill(next);await page.getByLabel('새 비밀번호 확인',{exact:true}).fill('Mismatch!2026');await submit.click();await page.getByRole('alert').filter({hasText:'일치하지 않습니다'}).waitFor();assert.equal(changes,0)
 await page.getByLabel('새 비밀번호 확인',{exact:true}).fill(next);await submit.click();await page.getByRole('alert').filter({hasText:'현재 비밀번호를 확인'}).waitFor();assert.equal(changes,1);assert(await dialog.isVisible())
 fail=false;await submit.click();await page.getByRole('button',{name:'변경 중…',exact:true}).waitFor();assert(await logout.isDisabled());assert(await page.getByLabel('새 비밀번호',{exact:true}).isDisabled());await page.keyboard.press('Escape');assert(await dialog.isVisible());assert.equal(businessReads.length,0)
 await page.waitForFunction(()=>document.querySelector('fieldset')?.disabled);while(!release)await page.waitForTimeout(10);release();await dialog.waitFor({state:'hidden'});await page.locator('.wms-layout').waitFor();assert.equal(changes,2);assert(businessReads.length>0)
 required=true;await page.reload();await dialog.waitFor();await logout.click();await page.getByRole('heading',{name:'로그인',exact:true}).waitFor();assert.equal(logouts,1);assert.equal(await dialog.count(),0)
 assert.deepEqual(errors,[]);console.log('PASS five viewport gate layout, dynamic name, sentence break/line-height, centered gray logout, 40px fields, visibility, mismatch/API error, busy state, ESC/backdrop and business-access guards, successful auth refresh and logout. All API responses mocked; no real account changes. '+origin)
}finally{await browser.close()}
