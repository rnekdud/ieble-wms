import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176'
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',hasTouch:true})
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());assert.equal(u.origin,origin)
  if(u.pathname==='/__menu-scroll')return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/menu-scroll-ui.tsx"></script>'})
  assert(!u.pathname.startsWith('/api/'),'No business APIs allowed');return route.continue()
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 const settle=()=>page.waitForTimeout(100)
 async function invoke(text){await page.getByRole('button',{name:new RegExp('^'+text)}).evaluate(e=>e.click());await settle()}
 async function visible(selector){await page.waitForFunction(s=>{const c=document.querySelector(s),t=c?.querySelector('[aria-current=page]');if(!c||!t||!t.getClientRects().length)return false;const a=c.getBoundingClientRect(),b=t.getBoundingClientRect();return b.top>=a.top+c.clientTop-1&&b.bottom<=a.top+c.clientTop+c.clientHeight+1},selector)}
 for(const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/__menu-scroll');const mobile=width<=1024,selector=mobile?'.mobile-all-menu > .dialog-body':'.wms-business-nav'
  await page.evaluate(()=>window.scrollTo(0,350));const main=await page.evaluate(()=>scrollY)
  if(mobile)await page.getByRole('button',{name:'전체 메뉴 열기'}).click()
  await visible(selector);assert.equal(await page.evaluate(()=>scrollY),main)
  const nav=page.locator(selector),start=await nav.evaluate(e=>e.scrollTop)
  await invoke('재렌더');assert.equal(await nav.evaluate(e=>e.scrollTop),start)
  await nav.evaluate(e=>{e.scrollTop=0});await settle();await invoke('재렌더');assert.equal(await nav.evaluate(e=>e.scrollTop),0,'manual scroll survives rerender')
  // Opening an unrelated accordion must not bring the selected menu back.
  const unrelated=mobile?page.getByRole('button',{name:'재고관리',exact:true}):page.getByRole('button',{name:'재고관리',exact:true})
  await unrelated.evaluate(e=>e.click());await settle()
  const groups=()=>page.locator(mobile?'.mobile-menu-toggle':'.wms-nav-group > button')
  assert.equal(await groups().filter({has:page.locator('span')}).locator('xpath=self::*[@aria-expanded="true"]').count(),1)
  assert.equal(await page.getByRole('button',{name:'조직관리',exact:true}).getAttribute('aria-expanded'),'false')
  const revealed=await unrelated.boundingBox(),viewport=await nav.boundingBox()
  assert(revealed.y>=viewport.y-1&&revealed.y+revealed.height<=viewport.y+viewport.height+1,'clicked group remains visible')
  await invoke('재렌더');assert.equal(await unrelated.getAttribute('aria-expanded'),'true','active page must not reopen a previous group')
  await invoke('항목 경로');await visible(selector);assert.equal(await page.evaluate(()=>scrollY),main)
  const organization=page.getByRole('button',{name:'조직관리',exact:true})
  await organization.evaluate(e=>e.click());await settle();assert.equal(await organization.getAttribute('aria-expanded'),'false')
  // A new sub-route opens the parent even after the user collapsed it previously.
  await invoke('권한 경로');await visible(selector)
  await invoke('항목 경로');assert.equal(await organization.getAttribute('aria-expanded'),'true');await visible(selector)
  // Only the latest toggle stays open, including rapid clicks in one task.
  await page.evaluate(()=>{for(const label of ['재고관리','통계 및 보고서','조직관리']){const b=[...document.querySelectorAll('.mobile-menu-toggle,.wms-nav-group > button')].find(e=>e.textContent.trim()===label);b.click()}});await settle()
  assert.equal(await groups().locator('xpath=self::*[@aria-expanded="true"]').count(),1)
  assert.equal(await organization.getAttribute('aria-expanded'),'true')
  const user=page.locator(mobile?'.mobile-menu-list > button':'.wms-subnav > a').filter({hasText:/^사용자 관리$/})
  await user.click();if(mobile)await page.getByRole('button',{name:'전체 메뉴 열기'}).click();await visible(selector)
  assert.equal(await organization.getAttribute('aria-expanded'),'true');assert.equal(await groups().locator('xpath=self::*[@aria-expanded="true"]').count(),1)
  const partner=mobile?page.getByRole('button',{name:'거래처관리',exact:true}):page.getByRole('link',{name:'거래처관리',exact:true})
  await partner.click();if(mobile)await page.getByRole('button',{name:'전체 메뉴 열기'}).click();await visible(selector)
  assert.equal(await groups().locator('xpath=self::*[@aria-expanded="true"]').count(),0,'standalone navigation closes every group')
  await unrelated.evaluate(e=>e.click());await settle();assert.equal(await unrelated.getAttribute('aria-expanded'),'true')
  await partner.click();if(mobile)await page.getByRole('button',{name:'전체 메뉴 열기'}).click();await visible(selector)
  assert.equal(await groups().locator('xpath=self::*[@aria-expanded="true"]').count(),0,'same standalone route also closes groups')
  await invoke('항목 경로');await visible(selector)
  const position=await nav.evaluate(e=>e.scrollTop)
  if(mobile){await page.getByRole('button',{name:'닫기',exact:true}).click();await page.getByRole('button',{name:'전체 메뉴 열기'}).click();await visible(selector);await settle();assert(Math.abs(await nav.evaluate(e=>e.scrollTop)-position)<=1,'mobile reopen preserves visible position')}
  else {await page.getByRole('button',{name:'사이드바 접기'}).click();await settle();await page.getByRole('button',{name:'사이드바 펼치기'}).click();await visible(selector);await settle();assert(Math.abs(await nav.evaluate(e=>e.scrollTop)-position)<=1)}
  const rail=await nav.evaluate(e=>({width:getComputedStyle(e,'::-webkit-scrollbar').width,track:getComputedStyle(e,'::-webkit-scrollbar-track').backgroundColor,standard:getComputedStyle(e).scrollbarColor,gutter:e.offsetWidth-e.clientWidth-parseFloat(getComputedStyle(e).borderLeftWidth)-parseFloat(getComputedStyle(e).borderRightWidth)}))
  assert.equal(rail.width,'3px');assert.equal(rail.track,'rgba(0, 0, 0, 0)');assert.equal(rail.standard,'auto');assert(rail.gutter<=3.1,JSON.stringify(rail))
  assert.notEqual(await page.locator('[data-other-scroll]').evaluate(e=>getComputedStyle(e,'::-webkit-scrollbar').width),'3px')
  assert.equal(await page.evaluate(()=>scrollY),main)
  if(mobile){await page.getByRole('button',{name:'닫기',exact:true}).click()}
  await page.reload();if(mobile)await page.getByRole('button',{name:'전체 메뉴 열기'}).click();await visible(selector)
  console.log('PASS',width+'x'+height,'single group, rapid toggles, standalone routes, current-item reveal, manual/main scroll preserved; scrollbar',JSON.stringify(rail))
 }
 // The active menu can load after initial permission resolution.
 await page.setViewportSize({width:1440,height:600});await page.goto(origin+'/__menu-scroll?delayed');await invoke('권한 로드');await visible('.wms-business-nav')
 await page.setViewportSize({width:390,height:600});await page.goto(origin+'/__menu-scroll');await page.getByRole('button',{name:'전체 메뉴 열기'}).click();await visible('.mobile-all-menu > .dialog-body');await settle()
 const body=page.locator('.mobile-all-menu > .dialog-body'),before=await body.evaluate(e=>e.scrollTop),box=await body.boundingBox()
 const cdp=await context.newCDPSession(page),x=box.x+box.width/2,y=box.y+60
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
 for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*20}]})
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();assert(await body.evaluate(e=>e.scrollTop)<before,'touch drag scrolls only menu')
 await page.getByRole('button',{name:'조직관리',exact:true}).evaluate(e=>e.click());await page.getByRole('button',{name:'닫기',exact:true}).click();await page.getByRole('button',{name:'전체 메뉴 열기'}).click();await visible('.mobile-all-menu > .dialog-body');assert.equal(await page.getByRole('button',{name:'조직관리',exact:true}).getAttribute('aria-expanded'),'true')
 console.log('PASS emulated touch scrolling and reopening collapsed active group')
 assert.deepEqual(errors,[])
 console.log('PASS delayed permitted menus; no business API requests')
}finally{await browser.close()}
