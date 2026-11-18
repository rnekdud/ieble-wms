import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176'
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.pathname.startsWith('/api/'))throw Error('Live postcode test must not call business APIs')
  if(url.origin===origin&&url.pathname==='/__address-live')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/address-search-ui.tsx"></script></html>'})
  return route.continue()
 })
 const page=await context.newPage();page.setDefaultTimeout(20000)
 for(const [width,query,choice] of [[1440,'판교역로 166','경기 성남시 분당구 판교역로 166'],[390,'백현동 532','경기 성남시 분당구 백현동 532']]) {
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/__address-live');await page.getByRole('button',{name:'주소 검색',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('.address-search-embed iframe'))
  await page.waitForTimeout(1500)
  const search=page.frames().find(f=>f.url().startsWith('https://postcode.map.kakao.com/search'))
  assert(search,'official Kakao search iframe')
  await search.getByRole('textbox').fill(query)
  await search.getByRole('button',{name:'검색',exact:true}).click()
  await search.getByRole('button',{name:new RegExp('^'+choice)}).first().click()
  await page.getByRole('dialog',{name:'주소 검색',exact:true}).waitFor({state:'hidden'})
  assert.equal(await page.getByLabel('우편번호',{exact:true}).inputValue(),'13529')
  assert.match(await page.getByLabel('기본주소',{exact:true}).inputValue(),/판교역로 166/)
  assert.equal(await page.getByLabel('상세주소',{exact:true}).inputValue(),'')
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='상세주소').catch(async error=>{console.log('FOCUS',await page.evaluate(()=>document.activeElement?.outerHTML));throw error})
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  console.log('PASS official Kakao live search/selection',width,query,'postcode/base/detail focus; no business API calls')
 }
}finally{await browser.close()}
