import assert from 'node:assert/strict'
import {chromium} from 'playwright'
let input='';for await(const chunk of process.stdin)input+=chunk
const fixture=JSON.parse(input),origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176'
assert(['http://127.0.0.1:5176','http://localhost:5174'].includes(origin))
const root=`/api/tenants/${fixture.tenant}/products`,errors=[],writes=[]
let queue=Promise.resolve()
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 async function context(mobile=false) {
  const ctx=await browser.newContext({viewport:{width:mobile?390:1440,height:1000},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'})
  await ctx.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url())
   if(u.origin!==origin)return route.abort()
   if(u.pathname==='/__gallery-live')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/product-gallery-live.tsx"></script></html>'})
   if(!u.pathname.startsWith('/api/'))return route.continue()
   const previous=queue;let release;queue=new Promise(resolve=>{release=resolve});await previous
   try {
    if(req.method()!=='GET'&&u.pathname.startsWith(root))writes.push({path:u.pathname,body:req.postDataJSON()})
    const r=await ctx.request.fetch('http://localhost:5086'+u.pathname+u.search,{method:req.method(),headers:req.headers(),data:req.postDataBuffer()||undefined,failOnStatusCode:false})
    if(r.status()>=500)errors.push(`Server ${r.status()} ${u.pathname}`)
    await route.fulfill({status:r.status(),headers:r.headers(),body:await r.body()})
   }finally{release()}
  })
  const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin+'/__gallery-live?login=1')
  assert.equal(await page.evaluate(async password=>{const csrf=await(await fetch('/api/auth/csrf')).json();return(await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':csrf.token},body:JSON.stringify({email:'Master',password})})).status},fixture.password),200)
  return {page,ctx}
 }
 const {page}=await context()
 const url=extra=>`${origin}/__gallery-live?tenant=${fixture.tenant}&product=${fixture.product}${extra||''}`
 const gallery=page.locator('.product-gallery'),thumb=name=>gallery.getByRole('button',{name:name+' 선택',exact:true}),tile=name=>thumb(name).locator('..')
 const left=gallery.getByRole('button',{name:'선택 이미지 왼쪽으로 이동',exact:true}),right=gallery.getByRole('button',{name:'선택 이미지 오른쪽으로 이동',exact:true})
 const order=async()=>gallery.locator('.product-gallery-select').evaluateAll(nodes=>nodes.map(n=>n.title))
 const primary=async()=>gallery.locator('.product-gallery-select').filter({hasText:'대표'}).getAttribute('title')
 const active=async name=>assert.equal(await thumb(name).getAttribute('aria-pressed'),'true')
 const load=async()=>{await page.goto(url());await thumb('A.png').waitFor()}
 const save=async()=>{await page.locator('.registration-header-actions').getByRole('button',{name:'변경사항 저장',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('status').filter({hasText:'변경사항을 저장했습니다.'}).waitFor()}
 await load();assert(await left.isDisabled());assert(await right.isDisabled())
 assert.equal(await gallery.locator('.product-gallery-order button').count(),2)
 assert.equal(await gallery.locator('.product-gallery-actions button').filter({hasText:/←|→/}).count(),0)
 await page.mouse.move(0,0)
 assert.equal(await tile('B.png').locator('.product-gallery-actions').evaluate(e=>getComputedStyle(e).opacity),'0')
 await thumb('B.png').hover({position:{x:5,y:5}})
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.product-gallery-item:nth-child(2) .product-gallery-actions')).opacity==='1')
 assert.equal(await tile('B.png').locator('.product-gallery-actions').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0.55)')
 await thumb('B.png').click({position:{x:5,y:5}});await active('B.png');assert.equal(await primary(),'A.png')
 await right.click();assert.deepEqual(await order(),['A.png','C.png','B.png']);await active('B.png');assert(await right.isDisabled())
 await left.click();await left.click();assert.deepEqual(await order(),['B.png','A.png','C.png']);await active('B.png');assert(await left.isDisabled());assert.equal(await primary(),'A.png')
 await thumb('C.png').hover({position:{x:5,y:5}});await gallery.getByRole('button',{name:'C.png 대표 지정',exact:true}).click();await active('B.png');assert.equal(await primary(),'C.png')
 await gallery.getByRole('button',{name:'C.png 제거',exact:true}).click();assert.deepEqual(await order(),['B.png','A.png']);assert.equal(await primary(),'B.png');await active('B.png')
 await thumb('A.png').hover({position:{x:5,y:5}});await gallery.getByRole('button',{name:'A.png 제거',exact:true}).click();assert(await left.isDisabled());assert(await right.isDisabled())
 await thumb('B.png').hover({position:{x:5,y:5}});await gallery.getByRole('button',{name:'B.png 제거',exact:true}).click();assert(await left.isDisabled());assert(await right.isDisabled());assert.equal(writes.length,0)
 await load();await thumb('B.png').focus();await page.keyboard.press('Enter');await active('B.png')
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'B.png 대표 지정');await page.keyboard.press('Enter');assert.equal(await primary(),'B.png')
 await right.click();await active('B.png');await save();await load();assert.deepEqual(await order(),['A.png','C.png','B.png']);assert.equal(await primary(),'B.png')
 assert.deepEqual(writes[0].body.images.map(i=>i.id),[fixture.images[0].id,fixture.images[2].id,fixture.images[1].id])
 for(const width of [1920,1440,1280,768,390]) {
  await page.setViewportSize({width,height:1000});await thumb('A.png').hover({position:{x:5,y:5}})
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  const boxes=await gallery.locator('.product-gallery-select,.product-gallery-add').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})))
  assert(boxes.every(b=>Math.abs(b.w-boxes[0].w)<1&&Math.abs(b.h-boxes[0].h)<1))
  assert(await tile('A.png').locator('.product-gallery-actions button').evaluateAll(nodes=>nodes.every(n=>{const b=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return b.left>=p.left&&b.right<=p.right&&b.top>=p.top&&b.bottom<=p.bottom})))
  console.log('PASS gallery layout '+width+'px')
 }
 await page.setViewportSize({width:1440,height:1000});await thumb('B.png').hover({position:{x:5,y:5}});await gallery.getByRole('button',{name:'B.png 제거',exact:true}).click();assert.equal(await primary(),'A.png');await save();await load();assert.deepEqual(await order(),['A.png','C.png'])
 await page.goto(url('&readonly=1'));await gallery.getByRole('link',{name:'A.png 원본 보기',exact:true}).waitFor();assert.equal(await gallery.locator('.product-gallery-order,.product-gallery-actions').count(),0)
 await page.goto(`${origin}/__gallery-live?tenant=${fixture.tenant}&new=1`);await gallery.getByRole('button',{name:'이미지 추가',exact:true}).waitFor()
 await gallery.getByLabel('상품 이미지 파일',{exact:true}).setInputFiles({name:'new.png',mimeType:'image/png',buffer:Buffer.from(fixture.png,'base64')});await thumb('new.png').waitFor();await thumb('new.png').click({position:{x:5,y:5}});assert(await left.isDisabled());assert(await right.isDisabled());assert.equal(await primary(),'new.png')
 const mobile=await context(true),mp=mobile.page
 await mp.goto(url());const mg=mp.locator('.product-gallery'),mt=mg.getByRole('button',{name:'C.png 선택',exact:true})
 await mt.tap();await mg.getByRole('button',{name:'C.png 대표 지정',exact:true}).tap();assert.equal(await mt.getAttribute('aria-pressed'),'true')
 await mg.getByRole('button',{name:'선택 이미지 왼쪽으로 이동',exact:true}).tap()
 const overlay=mt.locator('..').locator('.product-gallery-actions')
 await mp.waitForFunction(()=>getComputedStyle(document.querySelector('.product-gallery-item.is-selected .product-gallery-actions')).opacity==='1')
 assert.equal(await overlay.evaluate(e=>getComputedStyle(e).opacity),'1')
 await mp.locator('.registration-header-actions').getByRole('button',{name:'변경사항 저장',exact:true}).tap();await mp.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).tap();await mp.getByRole('status').filter({hasText:'변경사항을 저장했습니다.'}).waitFor()
 await mp.reload();await mg.getByRole('button',{name:'C.png 선택',exact:true}).waitFor();assert.deepEqual(await mg.locator('.product-gallery-select').evaluateAll(ns=>ns.map(n=>n.title)),['C.png','A.png'])
 assert.equal(await mg.locator('.product-gallery-select').filter({hasText:'대표'}).getAttribute('title'),'C.png')
 assert.equal(writes.length,3);assert(writes.every(w=>w.path===root+'/'+fixture.product));assert.deepEqual(errors,[])
 console.log('PASS hover/keyboard/touch, shared arrows, selection/primary independence, removal fallback, unchanged IDs, real SQLite save/reload, read-only and new product. Origin='+origin)
}finally{await browser.close()}
