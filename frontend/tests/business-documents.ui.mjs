import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176'
const sizes=[[320,568],[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]
const browser=await chromium.launch({channel:'chrome',headless:true})
const errors=[],requests=[]
try {
 const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true,hasTouch:true})
 let fail=false,delay=false,release
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname
  assert.equal(url.origin,origin)
  if(path==='/__documents')return route.fulfill({contentType:'text/html',body:`<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/business-documents-ui.tsx"></script></html>`})
  if(!path.startsWith('/api/'))return route.continue()
  assert.equal(route.request().method(),'GET','document UI must never write business data')
  if(path.includes('/documents/')){
   assert.ok(['ko','en'].includes(url.searchParams.get('language')),'document language must be explicit')
   requests.push(url.pathname+url.search)
   if(delay)await new Promise(resolve=>{release=resolve})
   if(fail)return route.fulfill({status:503,json:{message:'fixture unavailable'}})
   const format=url.searchParams.get('format'),pdf=format==='pdf',kind=path.split('/').at(-1),language=url.searchParams.get('language')
   return route.fulfill({contentType:pdf?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers:{'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(`서류_${kind}_0001_${language.toUpperCase()}.${format}`)}`},body:Buffer.from(pdf?'%PDF-1.7\nfixture':'PK\x03\x04fixture')})
  }
  if(path.endsWith('/r'))return route.fulfill({json:{receipt:{id:'r',number:'GR0001',expectedDate:'2026-11-20',status:'Planned',warehouseId:'w',warehouseName:'한글 창고',partnerName:'한글 거래처',contactName:'담당자',version:'v1'},lines:[]}})
  if(path.endsWith('/s'))return route.fulfill({json:{shipment:{id:'s',number:'SO0001',requestDate:'2026-11-20',expectedDate:'2026-11-20',status:'Requested',warehouseId:'w',warehouseName:'한글 창고',partnerName:'한글 거래처',contactName:'담당자',version:'v1',shippingAddress:'저장된 주소'},lines:[],allocations:[],movements:[]}})
  if(path.endsWith('/photos'))return route.fulfill({json:{photos:[],available:true}})
  return route.fulfill({json:{items:[],total:0,page:1,pageSize:20}})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 const names=(type,language)=>type==='receipts'?(language==='en'?['Goods Receipt Note (GRN)','Receiving Inspection Report']:['입고 명세서','입고 검수표']):(language==='en'?['Outbound Order','Packing List','Picking List']:['출고지시서','출고 패킹리스트','출고 피킹리스트'])
 const trigger=language=>page.getByRole('button',{name:language==='en'?'Download documents':'서류 다운로드',exact:true})
 const dialog=()=>page.getByRole('dialog')
 const checkBounds=async(width,height)=>{
  const m=await dialog().evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,scroll:el.scrollWidth,client:el.clientWidth}})
  assert.ok(m.left>=0&&m.right<=width&&m.top>=0&&m.bottom<=height,JSON.stringify(m));assert.ok(m.scroll<=m.client+1)
 }
 for(const [width,height] of sizes){
  await page.setViewportSize({width,height})
  for(const type of ['receipts','shipments']){
   await page.goto(origin+'/__documents?type='+type)
   await page.getByRole('button',{name:'Korean fixture',exact:true}).click()
   await trigger('ko').click();await checkBounds(width,height)
   assert.equal(await dialog().getByRole('group').count(),0,'choose a document before its language/format')
   const anchor=await trigger('ko').boundingBox()
   const position=await dialog().boundingBox()
   for(const name of names(type,'ko')){
    await dialog().getByRole('button',{name,exact:true}).click()
    assert.equal(await dialog().getByRole('group').count(),1)
    assert.equal(await dialog().getByRole('group',{name,exact:true}).getByRole('button').count(),4)
    await checkBounds(width,height)
    assert.equal(await dialog().locator('.business-document-kind').count(),0,'replace the list; never nest or expand it')
    const next=await dialog().boundingBox();assert.equal(next.x,position.x);assert.equal(next.y,position.y)
    assert.deepEqual(await trigger('ko').boundingBox(),anchor,'detail header must not move')
    const boxes=await dialog().getByRole('group').getByRole('button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {width:r.width,height:r.height}}))
    assert.ok(boxes.every(b=>b.height>=44&&Math.abs(b.width-boxes[0].width)<1))
    if(process.env.WMS_DOCUMENT_MENU_REVIEW_DIR && [390,1440].includes(width)&&name===names(type,'ko')[0])await page.screenshot({path:`${process.env.WMS_DOCUMENT_MENU_REVIEW_DIR}/${type}-${width}-formats.png`})
    await dialog().getByRole('button',{name:'뒤로가기',exact:true}).click()
    assert.equal(await dialog().getByRole('group').count(),0)
    assert.equal(await dialog().getByRole('button',{name,exact:true}).evaluate(el=>el===document.activeElement),true)
   }
   if(process.env.WMS_DOCUMENT_MENU_REVIEW_DIR && [390,1440].includes(width))await page.screenshot({path:`${process.env.WMS_DOCUMENT_MENU_REVIEW_DIR}/${type}-${width}-list.png`})
   await page.keyboard.press('Escape');assert.equal(await dialog().count(),0)
   assert.equal(await trigger('ko').evaluate(el=>el===document.activeElement),true)
  }
 }
 for(const [width,height] of [[390,844],[1440,900]]){
  await page.setViewportSize({width,height})
  for(const type of ['receipts','shipments'])for(const uiLanguage of ['ko','en']){
   await page.goto(origin+'/__documents?type='+type)
   await page.getByRole('button',{name:uiLanguage==='en'?'English fixture':'Korean fixture',exact:true}).click()
   const initial=await page.evaluate(()=>({lang:document.documentElement.lang,stored:localStorage.getItem('ieble-wms.language')}))
   for(const name of names(type,uiLanguage))for(const language of ['ko','en'])for(const format of ['Excel','PDF']){
    // Avoid Chromium's burst-download throttle while testing a single mounted page.
    await page.waitForTimeout(1100)
    await trigger(uiLanguage).click();await dialog().getByRole('button',{name,exact:true}).click()
    const button=dialog().getByRole('button',{name:`${name} ${language==='ko'?'한국어':'English'} ${format}`,exact:true})
    const event=page.waitForEvent('download');if(width===390)await button.tap();else await button.click();const download=await event
    assert.equal(new URL(requests.at(-1),origin).searchParams.get('language'),language)
    assert.match(download.suggestedFilename(),new RegExp('_'+language.toUpperCase()+'\\.'+(format==='PDF'?'pdf':'xlsx')+'$'))
    await download.delete();await dialog().waitFor({state:'hidden'})
    assert.deepEqual(await page.evaluate(()=>({lang:document.documentElement.lang,stored:localStorage.getItem('ieble-wms.language')})),initial,'download must not change screen or persisted language')
   }
  }
 }
 // Keyboard: document selection focuses Back; Tab reaches the first download option.
 await trigger('en').focus();await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Tab')
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Outbound Order 한국어 Excel')
 await page.keyboard.press('Shift+Tab');await page.keyboard.press('Enter')
 assert.equal(await dialog().getByRole('group').count(),0)
 assert.equal(await dialog().getByRole('button',{name:'Outbound Order',exact:true}).evaluate(el=>el===document.activeElement),true)
 await page.keyboard.press('Enter');await page.keyboard.press('Escape');assert.equal(await dialog().count(),0)
 await trigger('en').click();assert.equal(await dialog().getByRole('group').count(),0);await page.getByRole('button',{name:'English fixture',exact:true}).click();assert.equal(await dialog().count(),0)
 // Busy locking, error recovery and retry preserve the chosen document language.
 await trigger('en').click();await dialog().getByRole('button',{name:'Outbound Order',exact:true}).click()
 delay=true;const count=requests.length;await dialog().getByRole('button',{name:'Outbound Order English PDF',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('.business-document-formats button')?.disabled)
 assert.equal(await dialog().getByRole('button',{name:'Back',exact:true}).isDisabled(),true)
 assert.equal(requests.length,count+1);assert.equal(await dialog().getByRole('button',{name:'Outbound Order 한국어 Excel',exact:true}).isDisabled(),true)
 fail=true;delay=false;release();await page.getByRole('alert').waitFor()
 fail=false;const event=page.waitForEvent('download');await dialog().getByRole('button',{name:'Outbound Order English PDF',exact:true}).click();await (await event).delete()
 assert.equal(new URL(requests.at(-1),origin).searchParams.get('language'),'en')
 assert.equal(await page.evaluate(()=>document.documentElement.lang),'en')
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: all 20 document combinations in BOTH screen languages on desktop/mobile; unchanged UI language; 10 resolutions; two-step navigation/back, stable positioning, 44px targets, keyboard, Escape, outside click, busy/error/retry; zero API writes.')
 await context.close()
} finally {await browser.close()}
