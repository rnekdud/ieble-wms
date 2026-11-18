import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {chromium} from 'playwright'
let input='';for await(const chunk of process.stdin)input+=chunk
const fixture=JSON.parse(input),origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',root=`/api/tenants/${fixture.tenant}/company`
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],writes=[]
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.origin!==origin){errors.push('Unexpected external request');return route.abort()}
  if(!u.pathname.startsWith('/api/'))return route.continue()
  // This deployment-health endpoint is PostgreSQL-only; business/auth requests use the real SQLite fixture.
  if(u.pathname==='/api/health/db')return route.fulfill({json:{status:'connected',database:'isolated SQLite fixture'}})
  if(req.method()!=='GET')writes.push(u.pathname)
  const response=await context.request.fetch('http://localhost:5086'+u.pathname+u.search,{method:req.method(),headers:req.headers(),data:req.postDataBuffer()||undefined,failOnStatusCode:false})
  if(response.status()>=500)errors.push(`API ${response.status()} ${u.pathname}`)
  await route.fulfill({status:response.status(),headers:response.headers(),body:await response.body()})
 })
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 await page.goto(origin+'/login');await page.locator('input[name=email]').waitFor();assert.equal(await page.title(),'아이블 WMS · 로그인');assert.match(await page.locator('footer').innerText(),/아이블소프트\(주\)/)
 await page.locator('input[name=email]').fill('Master@org.test');await page.locator('input[name=password]').fill(fixture.password);await page.getByRole('button',{name:'로그인',exact:true}).click();await page.locator('.wms-layout').waitFor()
 await page.goto(origin+'/app/settings/company');await page.getByRole('button',{name:'로고 등록',exact:true}).waitFor();assert.equal(await page.title(),'아이블 WMS · 기업 관리')
 assert.equal(await page.locator('.wms-company img').count(),0);assert.equal(await page.locator('.wms-company svg').count(),1)
 assert.equal(await page.getByRole('link',{name:'아이블 WMS 대시보드',exact:true}).count(),1);assert(!/IEBLE/.test(await page.locator('body').innerText()))
 // Service artwork remains byte-identical to the supplied assets; LOGO.svg is actually PNG.
 const favicon=await page.locator('link[rel="icon"]').getAttribute('href');assert.equal(favicon,'/SIMBOL.svg')
 for(const [url,original,mime] of [['/SIMBOL.svg','SIMBOL.svg','image/svg+xml'],['/LOGO.png','LOGO.svg','image/png']]){
  const asset=await context.request.get(origin+url);assert.equal(asset.status(),200);assert.match(asset.headers()['content-type'],new RegExp(mime.replace('+','\\+')));assert.deepEqual(await asset.body(),await readFile(new URL('../public/'+original,import.meta.url)))
 }
 async function artwork(symbol=false){
  const logo=page.locator('.wms-brand img');await logo.waitFor();await logo.evaluate(e=>e.decode())
  assert.equal(await logo.getAttribute('src'),symbol?'/SIMBOL.svg':'/LOGO.png');assert.equal(await page.locator('.wms-brand').innerText(),'')
  const size=await logo.evaluate(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {w:e.naturalWidth,h:e.naturalHeight,fit:getComputedStyle(e).objectFit,inside:r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom}})
  assert.equal(size.w,symbol?49:212);assert.equal(size.h,44);assert.equal(size.fit,'contain');assert(size.inside)
 }
 await artwork();await page.getByRole('button',{name:'사이드바 접기',exact:true}).click();await artwork(true);await page.getByRole('button',{name:'사이드바 펼치기',exact:true}).click();await artwork()
 for(const width of [1920,1440,1280,768,390]){await page.setViewportSize({width,height:1000});await artwork()}
 await page.setViewportSize({width:1440,height:1000})
 const buffers=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=60;const x=c.getContext('2d');x.fillStyle='#17223b';x.fillRect(0,0,200,60);x.fillStyle='#ffcc33';x.fillRect(200,0,40,60);return ['image/png','image/webp','image/jpeg'].map(type=>c.toDataURL(type).split(',')[1])})
 let prior=''
 for(const [i,extension,mime] of [[0,'png','image/png'],[1,'webp','image/webp'],[2,'jpg','image/jpeg']]){
  await page.getByLabel('기업 로고 파일').setInputFiles({name:'logo.'+extension,mimeType:mime,buffer:Buffer.from(buffers[i],'base64')});await page.locator('.company-logo-preview img[src^="data:"]').waitFor()
  const response=page.waitForResponse(r=>r.url().endsWith(root)&&r.request().method()==='POST');await page.getByRole('button',{name:'기업 정보 저장',exact:true}).click();assert.equal((await response).status(),200)
  await page.waitForFunction(previous=>{const img=document.querySelector('.wms-company img');return img&&img.getAttribute('src')!==previous&&img.complete&&img.naturalWidth>0},prior);prior=await page.locator('.wms-company img').getAttribute('src')
  await page.waitForFunction(()=>!document.querySelector('.company-logo-preview img')?.src.startsWith('data:'))
  assert.equal(await page.locator('.wms-company img').evaluate(e=>getComputedStyle(e).objectFit),'contain')
 }
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});const box=await page.locator('.wms-company img').boundingBox();assert(box&&box.width===36&&box.height===36);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
 }
 await page.setViewportSize({width:1440,height:1000})
 const before=writes.length;await page.getByLabel('기업 로고 파일').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await page.getByRole('alert').filter({hasText:'2MB 이하'}).waitFor();assert.equal(writes.length,before);assert.equal(await page.locator('.wms-company img').getAttribute('src'),prior)
 // Central route title changes through real sidebar navigation and a direct refresh.
 await page.getByRole('link',{name:'상품관리',exact:true}).click();await page.waitForFunction(()=>document.title==='아이블 WMS · 상품관리');await page.reload();await page.waitForFunction(()=>document.title==='아이블 WMS · 상품관리')
 for(const [path,title] of [['/app/receipts','입고관리'],['/app/shipments','출고관리'],['/app/support','문의하기'],['/app/master/permissions','권한 설정']]){await page.goto(origin+path);await page.waitForFunction(t=>document.title===t,'아이블 WMS · '+title)}
 await page.goto(origin+'/app/settings/company');await page.locator('.company-logo-preview').hover();await page.getByRole('button',{name:'로고 제거',exact:true}).click();assert.equal(await page.locator('.company-logo-preview img').count(),0);assert.equal(await page.locator('.wms-company img').count(),1)
 const removed=page.waitForResponse(r=>r.url().endsWith(root)&&r.request().method()==='POST');await page.getByRole('button',{name:'기업 정보 저장',exact:true}).click();assert.equal((await removed).status(),200);await page.waitForFunction(()=>!document.querySelector('.wms-company img'));assert.equal(await page.locator('.wms-company svg').count(),1)
 assert.deepEqual(errors,[])
 console.log('PASS: original service logo/favicon assets, collapse/expand and responsive sizing; actual App/login/navigation, Korean branding/titles/copyright, PNG/WEBP/JPG logo preview/save/replace/remove/header fallback, 5 viewport widths, invalid upload preserves logo; all APIs use isolated authenticated SQLite')
}finally{await browser.close()}
