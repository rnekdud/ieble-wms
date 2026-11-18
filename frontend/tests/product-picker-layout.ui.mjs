import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176'
const categories=[{id:'a',name:'식품',parentId:null},{id:'b',name:'간식',parentId:'a'},{id:'c',name:'과자',parentId:'b'},{id:'d',name:'생활',parentId:null}].map(x=>({...x,isActive:true}))
const products=Array.from({length:121},(_,i)=>({id:'p'+i,name:i===0?'아주 긴 상품명과 공백없는상품명이이어지는모바일상품선택레이아웃검증용상품':'상품 '+i,code:'P'+String(i).padStart(3,'0'),unit:'EA',categoryId:'c',productTypeName:'완제품',barcode:'8801234567890'+(i===0?'0123456789012345678901234567890123456789':''),hasImage:i===1,physical:10,reserved:0,available:10,requestable:10,ownReserved:0}))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const mode of ['receipt','shipment']){
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),errors=[],batches=[]
  await context.route(origin+'/__product-picker**',route=>route.fulfill({contentType:'text/html',body:`<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/product-picker-ui.tsx"></script></html>`}))
  await context.route('**/api/**',route=>{
   assert.equal(route.request().method(),'GET');if(new URL(route.request().url()).pathname.endsWith('/image'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="#197b79"/></svg>'});const q=new URL(route.request().url()).searchParams
   if(q.get('kind')==='product-options')return route.fulfill({json:{categories,productTypes:[{id:'t',name:'완제품',isActive:true}]}})
   const ids=q.getAll('ids');if(ids.length){assert(ids.length<=100);batches.push(ids.length)}
   const page=Number(q.get('page')||1),size=Number(q.get('pageSize')||20),search=q.get('search')||''
   const selected=products.filter(p=>(!ids.length||ids.includes(p.id))&&(!search||p.name.includes(search)||p.code.includes(search))&&q.get('categoryId')!=='d')
   return route.fulfill({json:{items:selected.slice((page-1)*size,page*size),total:selected.length,page,pageSize:size}})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/__product-picker?mode='+mode)
  await page.addStyleTag({url:origin+'/src/components/mobile/mobile.css'})
  const dialog=page.getByRole('dialog',{name:'상품 추가',exact:true}),filter=dialog.locator('.product-selection-filters')
  await dialog.getByRole('checkbox',{name:'P000 선택',exact:true}).waitFor()
  assert.equal(await dialog.getByRole('button',{name:'현재 페이지 선택 해제',exact:true}).count(),0);assert.equal(await dialog.getByRole('button',{name:'전체 선택 해제',exact:true}).count(),0)
  const cat=n=>dialog.getByLabel(`상품 추가 ${n}차 카테고리`,{exact:true})
  assert(await cat(2).isDisabled());assert(await cat(3).isDisabled());await cat(1).selectOption('a');await cat(2).selectOption('b');await cat(3).selectOption('c')
  assert.deepEqual(await cat(3).locator('option').allTextContents(),['전체 3차 카테고리','과자'])
  await dialog.getByRole('checkbox',{name:'P000 선택',exact:true}).check()
  await cat(1).selectOption('d');assert.equal(await cat(2).inputValue(),'');assert.equal(await cat(3).inputValue(),'');assert(await cat(3).isDisabled())
  await dialog.getByRole('button',{name:'필터 초기화',exact:true}).click();let confirm=page.getByRole('dialog',{name:'필터 초기화',exact:true});await confirm.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await cat(1).inputValue(),'d')
  await dialog.getByRole('button',{name:'필터 초기화',exact:true}).click();await confirm.getByRole('button',{name:'초기화',exact:true}).click();assert.equal(await cat(1).inputValue(),'');await dialog.getByRole('checkbox',{name:'P000 선택',exact:true}).waitFor();assert(await dialog.getByRole('checkbox',{name:'P000 선택',exact:true}).isChecked())
  for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1280,900],[1440,900],[1920,900]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const content=dialog.locator('.product-selection-content');await content.evaluate(e=>e.scrollTop=0)
   const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1)
   assert(!await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),'no dialog horizontal overflow')
   if(width<=1024){
    assert.equal(await dialog.locator('.product-selection-table').count(),0,'no desktop table in mobile')
    assert.equal(await dialog.locator('.product-selection-all').evaluate(e=>getComputedStyle(e).flexDirection),'row')
    const typeField=dialog.getByLabel('상품 추가 구분',{exact:true});assert(Math.abs((await typeField.boundingBox()).width-(await typeField.locator('..').boundingBox()).width)<1,'filter uses its grid column')
    const cards=dialog.locator('.product-selection-card');assert.equal(await cards.count(),20)
    assert(await cards.first().getByText(products[0].name,{exact:true}).isVisible())
    assert(await cards.first().getByText(products[0].barcode,{exact:true}).isVisible())
    const first=await cards.first().boundingBox(),contentBox=await content.boundingBox()
    assert(first.y<contentBox.y+contentBox.height-40,'first product is visible before scrolling')
    assert(!await content.evaluate(e=>e.scrollWidth>e.clientWidth+1),'no body horizontal overflow')
    const nested=await content.evaluate(e=>[...e.querySelectorAll('*')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1).map(n=>n.className))
    assert.deepEqual(nested,[],'only body has vertical scroll')
    const check=dialog.getByRole('checkbox',{name:'P000 선택',exact:true});assert(await check.isChecked())
    await cards.first().getByText(products[0].name,{exact:true}).click();assert(!await check.isChecked(),'card toggles once')
    await check.check();assert(await check.isChecked(),'checkbox toggles once')
    await check.focus();await page.keyboard.press('Space');assert(!await check.isChecked());await page.keyboard.press('Space');assert(await check.isChecked())
    const second=dialog.getByRole('checkbox',{name:'P001 선택',exact:true});await second.check()
    await dialog.getByRole('status').filter({hasText:'선택 2건'}).waitFor();await second.uncheck()
    const accordion=dialog.locator('.product-selection-categories');assert.equal(await accordion.getAttribute('open'),null)
    const search=await dialog.getByLabel('상품 추가 검색',{exact:true}).boundingBox(),camera=await dialog.getByRole('button',{name:'카메라 스캔',exact:true}).boundingBox()
    assert(camera.x>=search.x+search.width+7);assert(Math.abs(camera.y-search.y)<2)
    for(const field of [dialog.getByLabel('상품 추가 검색',{exact:true}),dialog.getByLabel('상품 추가 구분',{exact:true})])assert.equal(Math.round((await field.boundingBox()).height),40)
    await accordion.locator('summary').click();assert(await cat(1).isVisible());await cat(1).selectOption('a');await cat(2).selectOption('b');await cat(3).selectOption('c');await accordion.locator('summary').click()
    await dialog.getByRole('checkbox',{name:'P000 선택',exact:true}).waitFor();assert(await check.isChecked(),'selection survives accordion')
    await cards.first().hover();await page.mouse.wheel(0,450);await page.waitForTimeout(120);assert(await content.evaluate(e=>e.scrollTop>0),'body scrolls over card')
    const footer=await dialog.locator('.dialog-actions').boundingBox();assert(footer.y+footer.height<=height,'footer within viewport')
    const addBox=await dialog.getByRole('button',{name:'선택 상품 추가',exact:true}).boundingBox();assert(addBox.x>=0&&addBox.x+addBox.width<=width&&addBox.y>=footer.y)
    assert(await dialog.getByRole('button',{name:'선택 상품 추가',exact:true}).evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'footer clickable without scrolling')
    await content.evaluate(e=>e.scrollTop=e.scrollHeight)
    const sizes=await dialog.locator('.wms-pagination-buttons button').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height}}));assert(sizes.length>4);assert(sizes.every(r=>Math.abs(r.w-r.h)<0.1))
   }else{
    assert.equal(await dialog.locator('.product-selection-card').count(),0)
    const presentation=await dialog.locator('.product-selection-table').evaluate(t=>({header:getComputedStyle(t.tHead).display,row:getComputedStyle(t.tBodies[0].rows[0]).display,cell:getComputedStyle(t.tBodies[0].rows[0].cells[0]).display}))
    assert.deepEqual(presentation,{header:'table-header-group',row:'table-row',cell:'table-cell'})
    const rects=await filter.locator(':scope > *').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));assert(Math.abs(rects[0].bottom-rects[5].bottom)<2);for(let i=1;i<5;i++)assert(Math.abs(rects[i].left-rects[i-1].right-8)<2)
   }
   console.log(`PASS ${mode} ${width}x${height}: layout, selection, scroll and footer`)
  }
  // Reduced viewport simulates available space with a keyboard; native IME remains a device check.
  await page.setViewportSize({width:390,height:320});await dialog.getByLabel('상품 추가 검색',{exact:true}).fill('P001');await dialog.getByRole('checkbox',{name:'P001 선택',exact:true}).waitFor();
  assert((await dialog.locator('.dialog-actions').boundingBox()).y+(await dialog.locator('.dialog-actions').boundingBox()).height<=320)
  await dialog.getByRole('button',{name:'필터 초기화',exact:true}).click();await page.getByRole('dialog',{name:'필터 초기화',exact:true}).getByRole('button',{name:'초기화',exact:true}).click()
  await dialog.getByRole('checkbox',{name:'P000 선택',exact:true}).waitFor()
  await page.setViewportSize({width:1440,height:1000})
  for(let n=1;n<=6;n++){
   if(n>1)await dialog.getByRole('button',{name:'다음 페이지',exact:true}).click()
   await dialog.getByRole('checkbox',{name:`P${String((n-1)*20).padStart(3,'0')} 선택`,exact:true}).waitFor()
   await dialog.getByRole('checkbox',{name:'현재 페이지 전체 선택',exact:true}).check()
  }
  await dialog.getByRole('status').filter({hasText:'선택 120건'}).waitFor();await dialog.getByRole('button',{name:'선택 상품 추가',exact:true}).click();await dialog.waitFor({state:'hidden'})
  assert.equal(await page.getByLabel('문서 상품 수').textContent(),'120');assert.deepEqual(batches,[100,20])
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'상품 추가 열기',exact:true}).click();await dialog.getByRole('checkbox',{name:'P000 선택',exact:true}).waitFor();assert.equal(await dialog.getByRole('checkbox',{name:'P000 선택',exact:true}).isDisabled(),mode==='receipt');await dialog.getByLabel('상품 추가 검색',{exact:true}).fill('P120');await dialog.getByRole('checkbox',{name:'P120 선택',exact:true}).check();await dialog.getByRole('button',{name:'선택 상품 추가',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.getByLabel('문서 상품 수').textContent(),'121')
  assert.deepEqual(errors,[]);console.log(`PASS ${mode}: cascading categories/reset, left alignment, removed clear buttons, 120 selected across pages, bounded revalidation and repeat add beyond 100. Mock reads only.`);await context.close()
 }
}finally{await browser.close()}
