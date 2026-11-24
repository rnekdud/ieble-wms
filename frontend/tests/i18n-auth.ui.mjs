import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import en from '../src/locales/en/common.json' with {type:'json'}
const origin=process.env.WMS_UI_ORIGIN||'http://localhost:5176'
const browser=await chromium.launch({channel:'chrome',headless:true})
const errors=[], logins=[]
try {
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname
  const json=(data,status=200)=>route.fulfill({status,json:data})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p==='/api/auth/csrf')return json({token:'mock-only'})
  if(p==='/api/auth/me')return json({message:'로그인 필요'},401)
  if(p==='/api/auth/login'){logins.push(route.request().postDataJSON());return json({message:'이메일 또는 비밀번호를 확인해 주세요. 반복 실패 시 잠시 후 다시 시도해 주세요.'},401)}
  assert.fail('Unmocked API '+p)
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000)
 await page.goto(origin+'/login');const select=page.locator('.wms-language select');await select.waitFor();assert.equal(await select.inputValue(),'ko')
 await page.locator('input[name=email]').fill('qa-user')
 await page.locator('input[name=password]').fill('invalid-only')
 await select.selectOption('en')
 assert.equal(await page.locator('input[name=email]').inputValue(),'qa-user')
 assert.equal(await page.locator('input[name=password]').inputValue(),'invalid-only')
 await page.locator('.auth-card button[type=submit]').click()
 await page.getByText(en['이메일 또는 비밀번호를 확인해 주세요. 반복 실패 시 잠시 후 다시 시도해 주세요.'],{exact:true}).waitFor()
 assert.equal(logins.length,1)
 await select.selectOption('ko');await page.getByText('이메일 또는 비밀번호를 확인해 주세요. 반복 실패 시 잠시 후 다시 시도해 주세요.',{exact:true}).waitFor()
 await select.selectOption('en');await page.reload();await page.locator('.auth-card button[type=submit]').waitFor();await page.locator('input[name=email]').fill('qa-user')
 for(const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]) {
  await page.setViewportSize({width,height})
  const m=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,button:document.querySelector('.auth-card button[type=submit]').getBoundingClientRect().toJSON()}))
  assert(m.scroll<=width+1,JSON.stringify(m));assert(m.button.x>=0&&m.button.right<=width,JSON.stringify(m))
  if(width>height&&width<=932)assert(m.button.bottom<=height,JSON.stringify(m))
  assert.equal(await page.locator('input[name=email]').inputValue(),'qa-user');console.log('PASS EN login',width,height)
 }
 await page.reload();assert.equal(await select.inputValue(),'en')
 const raw=await page.locator('.auth-card').innerText();assert(!/[가-힣]/.test(raw),raw)
 await select.selectOption('ko');await page.getByRole('button',{name:'로그인',exact:true}).waitFor()
 assert.deepEqual(errors,[]);console.log('PASS anonymous language persistence, error localization, input preservation; login requests mocked')
} finally {await browser.close()}
