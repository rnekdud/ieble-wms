import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176'
const members=[{id:'u1',name:'김철수',code:'kim',customCode:'물류관리팀',email:'kim@example.test'},{id:'u2',name:'이영희',code:'lee',customCode:null,email:'lee@example.test'}]
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'}),errors=[]
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());assert.equal(u.origin,origin)
  if(u.pathname==='/__common-ui')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/common-input-ui.tsx"></script></html>'})
  if(!u.pathname.startsWith('/api/'))return route.continue()
  assert.equal(req.method(),'GET')
  if(u.pathname.includes('/assignees/')&&!u.pathname.endsWith('/choices'))return route.fulfill({json:members.find(m=>u.pathname.endsWith('/'+m.id))})
  const items=u.pathname.endsWith('/assignees/choices')?members:[{id:'w1',name:'아이블 냉동 창고',code:'WH02',customCode:'냉동 보관'}]
  return route.fulfill({json:{items,total:items.length}})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/__common-ui')
 const dialog=page.getByRole('dialog'),field=label=>dialog.getByRole('button',{name:new RegExp('^'+label+' ')})
 await field('담당자').getByText('물류관리팀 · kim@example.test').waitFor()
 await field('입고 창고').getByText('WH02 · 냉동 보관').waitFor()
 assert.equal(await page.locator('.searchable-choice-selected-meta').count(),0)
 assert(await page.getByRole('button',{name:/^미선택 담당자 /}).isDisabled())
 for(const label of ['입고 창고','거래처','랙','보관위치','담당자'])assert.equal(await field(label).locator('small').count(),1)
 assert.equal(await page.getByRole('button',{name:/^도면 창고 /}).locator('small').count(),0)
 for(const width of [1920,1440,1280,768,390]) {
  await page.setViewportSize({width,height:800})
  const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width)
  assert(await dialog.locator('.dialog-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1), JSON.stringify({width,overflow:await dialog.locator('.dialog-body').evaluate(el=>Array.from(el.querySelectorAll('*')).filter(e=>e.getBoundingClientRect().right>el.getBoundingClientRect().right).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width})).slice(0,12))}))
  for(const control of await dialog.locator('input:not([type=checkbox],[type=radio],[type=hidden]),select:not([multiple]),.searchable-choice-trigger').all()) {
   assert.equal((await control.boundingBox()).height,40)
   assert.equal(await control.evaluate(el=>getComputedStyle(el).borderRadius),'8px')
  }
  for(const label of ['입고 창고','거래처','랙','보관위치','담당자','긴 선택 정보']) {
   const choice=field(label),name=await choice.locator('strong').boundingBox(),meta=await choice.locator('small').boundingBox(),arrow=await choice.locator('svg').boundingBox(),box=await choice.boundingBox()
   assert(Math.abs(name.y+name.height/2-meta.y-meta.height/2)<1,'inline metadata center')
   assert(Math.abs(arrow.y+arrow.height/2-box.y-box.height/2)<1,'fixed arrow center')
   assert(name.x+name.width<=meta.x);assert(meta.x+meta.width<=arrow.x)
   assert.equal(await choice.locator('small').evaluate(el=>getComputedStyle(el).textOverflow),'ellipsis')
   assert((await choice.getAttribute('title')).includes(await choice.locator('small').innerText()))
  }
  await field('긴 선택 정보').focus();await field('긴 선택 정보').press('Enter')
  const full=dialog.locator('.searchable-choice-current');assert(await full.isVisible());assert.match(await full.innerText(),/long-address@example.test/);assert.equal(await full.evaluate(el=>getComputedStyle(el).whiteSpace),'normal')
  await dialog.getByRole('combobox',{name:'긴 선택 정보 검색'}).press('Escape')
  assert.equal((await field('긴 선택 정보').boundingBox()).height,40)
  assert((await page.getByLabel('특수 메모').boundingBox()).height>40)

  const filter=page.locator('.list-search-filters .searchable-choice-trigger');assert.equal((await filter.boundingBox()).height,40);assert(!(await filter.locator('small').isVisible()))
  const footer=dialog.locator(':scope > footer'), buttons=await footer.locator('button').all();const a=await buttons[0].boundingBox(),b=await buttons[1].boundingBox()
  assert.equal(a.height,b.height);assert(b.width>a.width);assert(Math.abs(b.x-a.x-a.width-8)<1);assert(b.y+b.height<=800)
  const icon=await dialog.getByRole('button',{name:'행 삭제',exact:true}).boundingBox();assert.equal(icon.width,36);assert.equal(icon.height,36)
  const text=await dialog.getByRole('button',{name:'상품 추가',exact:true}).boundingBox();assert(text.width>text.height)
  for(const nav of await page.locator('.wms-pagination-buttons button:has(svg)').all()){const rect=await nav.boundingBox();assert.equal(rect.width,36);assert.equal(rect.height,36)}
 }
 await page.setViewportSize({width:390,height:600})
 await field('담당자').click();const popup=dialog.locator('.searchable-choice-popup:popover-open');await popup.getByRole('option',{name:/김철수/}).waitFor()
 const pop=await popup.boundingBox(),trigger=await field('담당자').boundingBox();assert(pop.y>=0&&pop.y+pop.height<=600);assert(pop.y<trigger.y,'open above near footer')
 assert(await popup.getByRole('option').first().evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'option is above footer')
 await popup.getByRole('combobox').press('Escape');assert.equal(await dialog.count(),1);assert.equal(await dialog.locator(':popover-open').count(),0)
 await field('담당자').click();await popup.getByRole('option').nth(1).waitFor();await page.getByRole('combobox',{name:'담당자 검색'}).press('ArrowDown');await page.getByRole('combobox',{name:'담당자 검색'}).press('Enter');await field('담당자').getByText('lee@example.test',{exact:true}).waitFor();assert.equal((await field('담당자').boundingBox()).height,40)
 const ea=page.getByLabel('EA 수량',{exact:true})
 assert.equal(await ea.evaluate(el=>getComputedStyle(el).appearance),'textfield')
 await ea.fill('12')
 for(const key of ['.', '-', '+', 'e', 'E', ',']) {await ea.press(key);assert.equal(await ea.inputValue(),'12')}
 assert(!(await ea.evaluate(el=>el.checkValidity())))
 await ea.fill('13');await ea.fill('1.5');assert.equal(await ea.inputValue(),'13')
 await ea.fill('14');await ea.fill('-10');assert.equal(await ea.inputValue(),'14')
 for(const text of ['0.25','-1','+1','1e3']) {
  const blocked=await ea.evaluate((el,text)=>{const clipboardData=new DataTransfer();clipboardData.setData('text/plain',text);return !el.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}))},text)
  assert(blocked);assert.equal(await ea.inputValue(),'14')
 }
 const dropBlocked=await ea.evaluate(el=>{const dataTransfer=new DataTransfer();dataTransfer.setData('text/plain','-2');return !el.dispatchEvent(new DragEvent('drop',{dataTransfer,bubbles:true,cancelable:true}))});assert(dropBlocked)
 await ea.fill('');assert.equal(await ea.inputValue(),'');await ea.pressSequentially('120');assert.equal(await ea.inputValue(),'120')
 await ea.press('ControlOrMeta+A');await ea.press('Backspace');assert.equal(await ea.inputValue(),'')
 await ea.fill('15');await ea.press('.')
 await dialog.getByRole('button',{name:'업무 저장',exact:true}).click();assert.equal(await page.getByLabel('저장 횟수').textContent(),'0')
 await ea.fill('10');await ea.evaluate(el=>{const clipboardData=new DataTransfer();clipboardData.setData('text/plain','0.25');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}))});assert.equal(await ea.inputValue(),'10');await dialog.getByRole('alert').filter({hasText:'정수'}).waitFor()
 await ea.fill('11');await page.getByLabel('계량 수량',{exact:true}).fill('1.25');assert(await page.getByLabel('계량 수량',{exact:true}).evaluate(el=>el.checkValidity()));assert.equal(await page.getByLabel('가격').inputValue(),'100.25')
 await dialog.getByRole('button',{name:'업무 저장',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.getByLabel('저장 횟수').textContent(),'1')
 await page.getByRole('button',{name:'등록 다시 열기'}).click();await field('담당자').getByText('lee@example.test',{exact:true}).waitFor();assert.equal((await field('담당자').boundingBox()).height,40);assert.equal(await ea.inputValue(),'11')
 assert.deepEqual(errors,[])
 console.log('PASS common selected metadata, saved UserId hydration, missing department, warehouse code hydration, compact filters/title picker, five viewports, footer/scroll/upward popover/keyboard, icon squares, typed/pasted fractional EA block, kg/price decimals preserved. No real writes. '+origin)
 await context.close()
}finally{await browser.close()}
