import assert from 'node:assert/strict'
import {chromium} from 'playwright'

// All business requests are intercepted. This test never connects to a real API/database.
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',endpoint='/api/tenants/fixture/receipts'
const choice=(id,name,unit=null)=>({id,name,code:id.toUpperCase(),unit,lotManaged:false,expiryManaged:false,serialManaged:false})
const products=[{...choice('p1','상품 A','EA'),retailPrice:5000,currency:'KRW'},{...choice('p2','상품 B','kg'),retailPrice:8000,currency:'KRW'},{...choice('p3','가격 미등록 상품','EA'),retailPrice:null,currency:'KRW'}]
const racks=[choice('a','RACK-A01'),choice('b','RACK-B02')]
const locations=[{...choice('la','A 위치'),rackId:'a',rackName:'RACK-A01',rackCode:'A',level:1,bay:1},{...choice('lb','B 위치'),rackId:'b',rackName:'RACK-B02',rackCode:'B',level:2,bay:1}]
const initial=()=>({receipt:{id:'r',number:'IN-TEST',expectedDate:'2026-11-06',partnerId:'supplier',partnerName:'공급사',warehouseId:'w',warehouseName:'창고',contactName:'담당자',notes:null,status:'Planned',version:'v1',createdAt:'2026-11-06',inspectedAt:null,confirmedAt:null},lines:products.slice(0,2).map((p,index)=>({id:'l'+index,productId:p.id,productCode:p.code,productName:p.name,unit:p.unit,retailPrice:p.retailPrice,currency:p.currency,plannedRackId:racks[index].id,plannedRackName:racks[index].name,plannedRackCode:racks[index].code,expectedQuantity:index?2.5:20,inspectedQuantity:null,lotNumber:null,expiryDate:null,serials:[],placements:[],lotManaged:false,expiryManaged:false,serialManaged:false}))})
let data=initial(),serial=1
const writes=[],unexpected=[],errors=[],visuals=[],replays=new Set()
const visual=!!process.env.UI_VISUAL||process.argv.includes('--visual')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,q=url.searchParams
  if(url.origin!==origin){unexpected.push(req.url());return route.abort()}
  if(path==='/__receipt-ui')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/receipt-ui.tsx"></script></html>'})
  if(!path.startsWith('/api/'))return route.continue()
  const json=value=>route.fulfill({json:value})
  if(path==='/api/auth/csrf')return json({token:'fixture'})
  if(req.method()==='GET'){
   if(path===endpoint+'/photo-options')return json({maxCount:10,maxBytes:5242880,formats:['image/jpeg','image/png','image/webp']})
   if(path===endpoint+'/choices'){
    const kind=q.get('kind'),search=(q.get('search')||'').toLowerCase(),ids=q.getAll('ids')
    if(kind==='product-options')return json({categories:[],productTypes:[]})
    let items=kind==='warehouses'?[choice('w','창고'),choice('w2','다른 창고')]:kind==='partners'?[choice('supplier','공급사')]:kind==='racks'?(q.get('warehouseId')==='w'?racks:[]):kind==='locations'?locations:products
    items=items.filter(p=>(!ids.length||ids.includes(p.id))&&[p.name,p.code,p.rackName,p.rackCode].filter(Boolean).join(' ').toLowerCase().includes(search))
    if(kind==='locations')items=[...items].sort((a,b)=>Number(b.rackId===q.get('rackId'))-Number(a.rackId===q.get('rackId')))
    return json({items,total:items.length,page:1,pageSize:30})
   }
   if(path===endpoint+'/r')return json(data)
   if(path===endpoint+'/r/photos')return json({photos:[],version:data.receipt.version,photosVersion:'empty'})
   if(path.endsWith('/business-assignees'))return json({items:[{id:'qa-user',name:'QA 담당자',code:'QA',isActive:true}],total:1,page:1,pageSize:20})
   if(path.endsWith('/inspection-history'))return json({items:[],page:1,pageSize:30,total:0})
   if(path.endsWith('/stock'))return json({balances:data.lines.map(l=>({id:l.id,quantity:l.inspectedQuantity,unit:l.unit})),movements:[{}]})
  }else{
   const body=req.postDataJSON();writes.push({path,body});data.receipt.version='v'+(++serial)
   if(path===endpoint){data={receipt:{...initial().receipt,...body},lines:body.lines.map((l,index)=>{const p=products.find(p=>p.id===l.productId),rack=racks.find(r=>r.id===l.plannedRackId);return {...initial().lines[0],...l,id:'l'+index,productName:p.name,productCode:p.code,unit:p.unit,retailPrice:p.retailPrice,currency:p.currency,plannedRackName:rack?.name,plannedRackCode:rack?.code}})};return json(data)}
   if(path.endsWith('/start-inspection')){data.receipt.status='Inspecting';return json(data)}
   if(path.endsWith('/scan-inspection')||path.endsWith('/inspection-quantity')){
    const line=path.endsWith('/inspection-quantity')?data.lines.find(l=>l.id===body.lineId):data.lines.find(l=>l.productId===(body.barcode==='BAR-A'?'p1':'p2'))
    let outcome='applied'
    if(!replays.has(body.requestId)){
     if(body.quantity!=null){line.inspectedQuantity=body.quantity;replays.add(body.requestId)}
     else if(line.unit!=='EA')outcome='manual'
     else if((line.inspectedQuantity||0)+1>line.expectedQuantity)outcome='over-limit'
     else{line.inspectedQuantity=(line.inspectedQuantity||0)+1;replays.add(body.requestId)}
    }
    return json({outcome,detail:data,lineId:line.id,candidateLineIds:[],requestId:body.requestId,replayed:false})
   }
   if(path.endsWith('/tracking')){for(const input of body.lines){const line=data.lines.find(l=>l.id===input.lineId);line.trackingAllocations=input.allocations;line.lotNumber=input.allocations.length===1?input.allocations[0].lotNumber:null;line.expiryDate=input.allocations.length===1?input.allocations[0].expiryDate:null;line.serials=input.allocations.flatMap(a=>a.serials)}return json(data)}
   if(path.endsWith('/inspection')){for(const input of body.lines){const line=data.lines.find(l=>l.id===input.lineId);Object.assign(line,{inspectedQuantity:input.quantity,lotNumber:input.lotNumber,expiryDate:input.expiryDate,serials:input.serials})}data.receipt.inspectedAt='2026-11-06T03:00:00Z';return json(data)}
   if(path.endsWith('/placements')){for(const input of body.lines)data.lines.find(l=>l.id===input.lineId).placements=input.placements;return json(data)}
   if(path.endsWith('/confirm')){data.receipt.status='Confirmed';data.receipt.confirmedAt='2026-11-06T04:00:00Z';return json(data)}
  }
  unexpected.push(path);return route.fulfill({status:404,json:{message:'Unexpected fixture API'}})
 })
 context.setDefaultTimeout(10000)
 const page=await context.newPage();page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE ERROR:',error.message)});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE:',m.text())});page.on('response',r=>{if(r.status()>=400)console.log('HTTP:',r.status(),r.url())})
 const goto=mode=>page.goto(`${origin}/__receipt-ui?mode=${mode||'detail'}`)
 const choose=async(label,text)=>{await page.getByRole('button',{name:new RegExp('^'+label+' ')}).click();const input=page.getByRole('combobox',{name:label+' 검색',exact:true});await input.fill(text);await page.getByRole('option').filter({hasText:text}).first().click()}
 async function addProducts(ids){await page.getByRole('button',{name:'상품 추가',exact:true}).click();for(const id of ids)await page.getByRole('checkbox',{name:id.toUpperCase()+' 선택',exact:true}).check();await page.getByRole('button',{name:'선택 상품 추가',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})}
 if(process.env.WMS_RECEIPT_LINES){
  products[0].name='농심 새우깡 90g 긴 상품명 가독성 확인'
  for(const width of [360,390,430,768,1440]){
   await page.setViewportSize({width,height:1000});await goto('new')
   await page.addStyleTag({url:origin+'/src/components/mobile/mobile.css'})
   await page.getByRole('button',{name:'상품 추가',exact:true}).waitFor()
   await choose('입고 창고','창고');await addProducts(['p1','p2'])
   await page.getByLabel('수량 1',{exact:true}).fill('0')
   assert.equal(await page.getByText('수량은 양수이며 소수점 3자리 이내여야 합니다.',{exact:true}).count(),0)
   assert.equal(await page.getByLabel('수량 1',{exact:true}).getAttribute('aria-invalid'),'true')
   assert(await page.getByRole('button',{name:'추적 정보 입력(선택) 1',exact:true}).isDisabled())
   await page.getByLabel('수량 1',{exact:true}).fill('10');await page.getByLabel('수량 2',{exact:true}).fill('2.5')
   const table=page.locator('.receipt-registration-products'),rows=table.locator('tbody > tr')
   assert.equal(await rows.count(),2)
   assert.match(await table.locator('tfoot').innerText(),/70,000 원/)
   assert.deepEqual(await table.locator('.receipt-quantity-unit').allTextContents(),['EA','kg'])
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow')
   if(width<=600){
    const layout=await rows.first().evaluate(e=>{
     const b=s=>{const r=e.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}
     return {title:b('.document-product'),quantity:b('.document-quantity'),rack:b('.receipt-rack-choice'),price:b('[data-label="소비자가"]'),total:b('[data-label="참고 금액"]'),tracking:b('.document-tracking'),trackingButton:b('.document-tracking button'),actions:b('.document-actions'),font:getComputedStyle(e.querySelector('.document-product strong')).fontSize,cells:[...e.cells].map(c=>({x:c.getBoundingClientRect().x,right:c.getBoundingClientRect().right}))}
    })
    assert.equal(layout.font,'16px');assert(layout.quantity.y>layout.title.y)
    assert(Math.abs(layout.quantity.y-layout.rack.y)<1);assert(Math.abs(layout.price.y-layout.total.y)<1)
    assert(layout.trackingButton.y-layout.tracking.y>=12,'tracking button gap above border');assert(layout.tracking.y>layout.price.y);assert(layout.actions.y>layout.tracking.y)
    assert(layout.cells.every(c=>c.x>=0&&c.right<=width),'card cells in bounds')
    if(visual&&width===390)console.log('IMAGE:'+(await rows.first().screenshot({type:'jpeg'})).toString('base64'))
   }else assert.equal(await table.locator('thead').evaluate(e=>getComputedStyle(e).display),'table-header-group')
   await page.getByRole('button',{name:'추적 정보 입력(선택) 1',exact:true}).click()
   await page.getByRole('dialog').last().getByRole('button',{name:'취소',exact:true}).click()
   assert.equal(await page.getByLabel('수량 1',{exact:true}).inputValue(),'10')
   await page.getByRole('button',{name:'상품 2 제거',exact:true}).click();assert.equal(await rows.count(),1)
   assert.equal(await page.locator('.registration-header-actions').getByRole('button',{name:'취소',exact:true}).count(),0)
   await page.getByRole('button',{name:'뒤로가기',exact:true}).click()
   await page.getByRole('button',{name:'계속 편집',exact:true}).click()
   assert.equal(await page.getByLabel('수량 1',{exact:true}).inputValue(),'10')
   await page.getByRole('button',{name:'뒤로가기',exact:true}).click()
   await page.getByRole('button',{name:'변경 버리고 계속',exact:true}).click()
   await page.getByText('목록 이동 완료',{exact:true}).waitFor()
   console.log(`PASS ${width}px: receipt item hierarchy, totals, tracking, removal, no data writes`)
  }
  await goto('view')
  await page.getByRole('button',{name:'입고 정보 수정',exact:true}).click()
  await page.getByRole('button',{name:'뒤로가기',exact:true}).click()
  await page.getByRole('heading',{name:'입고 상세',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'변경 버리고 계속',exact:true}).count(),0)
  console.log('PASS back cancels editing to original detail; no prompt for unchanged data')
  assert.deepEqual(writes,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[])
 }else{
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});await goto('new');try{await page.getByRole('button',{name:/^입고 담당자 /}).waitFor()}catch(e){console.log(await page.locator('body').innerText());throw e}
  assert(await page.getByRole('button',{name:/^기본 입고 랙 /}).isDisabled())
  await choose('입고 창고','창고');await choose('기본 입고 랙','RACK-A01');await addProducts(['p1','p2'])
  assert.match(await page.getByRole('button',{name:/^입고 랙 1 /}).innerText(),/RACK-A01/)
  await choose('입고 랙 2','RACK-B02');await choose('기본 입고 랙','RACK-B02')
  assert.match(await page.getByRole('button',{name:/^입고 랙 1 /}).innerText(),/RACK-A01/)
  await page.getByRole('spinbutton',{name:'수량 1',exact:true}).fill('10');await page.getByRole('spinbutton',{name:'수량 2',exact:true}).fill('2.5')
  assert.match(await page.locator('tfoot').innerText(),/70,000 원/);assert.match(await page.locator('tfoot').innerText(),/10 EA.*2.5 kg/)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} registration overflow`)
  await page.getByRole('button',{name:/^입고 랙 1 /}).click();const popup=page.locator('.searchable-choice-popup');await popup.getByRole('option').first().waitFor()
  const box=await popup.boundingBox();assert(box.x>=0&&box.x+box.width<=width)
  await page.getByRole('combobox',{name:'입고 랙 1 검색',exact:true}).press('Escape')
  if(visual&&width===1440){await page.locator('.document-line-scroll').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));visuals.push((await page.locator('.document-line-scroll').screenshot({type:'jpeg',quality:45})).toString('base64'))}
  console.log(`PASS ${width}px: registration, default/individual racks, reference totals, dropdown and page overflow`)
 }
 await page.setViewportSize({width:1440,height:1000});await choose('매입 거래처','공급사');assert.match(await page.getByRole('button',{name:/^입고 담당자 /}).innerText(),/QA 담당자/)
 await addProducts(['p3']);await page.getByRole('spinbutton',{name:'수량 3',exact:true}).fill('1');assert.match(await page.locator('tfoot').innerText(),/미산정 1행/);assert.match(await page.getByRole('button',{name:/^입고 랙 3 /}).innerText(),/RACK-B02/)
 await page.getByRole('button',{name:'입고 등록',exact:true}).click();await page.getByRole('alertdialog',{name:'입고 저장 확인',exact:true}).getByRole('button',{name:'확인',exact:true}).click();await page.getByText('목록 이동 완료',{exact:true}).waitFor()
 assert.deepEqual(writes.find(w=>w.path===endpoint).body.lines.map(l=>l.plannedRackId),['a','b','b'])
 data=initial();await goto();await page.getByRole('button',{name:'검수 시작',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'목록으로',exact:true}).count(),0)
 assert.equal(await page.getByRole('button',{name:'보관 위치 지정',exact:true}).count(),0)
 await page.getByRole('button',{name:'검수 시작',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click()
 const scanner=page.getByRole('textbox',{name:'검수 바코드',exact:true})
 async function scan(value){await scanner.fill(value);await scanner.press('Enter');await page.waitForFunction(()=>!document.body.innerText.includes('건 처리 대기'))}
 for(let i=0;i<10;i++)await scan('BAR-A')
 assert.equal(await page.getByRole('spinbutton',{name:'검수 수량 1',exact:true}).inputValue(),'10')
 await page.getByRole('spinbutton',{name:'검수 수량 1',exact:true}).fill('15');await page.getByRole('spinbutton',{name:'검수 수량 1',exact:true}).press('Enter');await page.waitForFunction(()=>!document.querySelector('input[aria-label="검수 바코드"]').disabled);await scan('BAR-A')
 assert.equal(await page.getByRole('spinbutton',{name:'검수 수량 1',exact:true}).inputValue(),'16')
 await scan('BAR-B');await page.getByRole('spinbutton',{name:'검수 수량 2',exact:true}).fill('2.5');await page.getByRole('spinbutton',{name:'검수 수량 2',exact:true}).press('Tab');await page.waitForFunction(()=>!document.querySelector('input[aria-label="검수 바코드"]').disabled)
 assert.equal(await page.getByRole('button',{name:'보관 위치 지정',exact:true}).count(),0)
 for(const width of [1920,1440,1280,768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} inspection overflow`)}
 await page.setViewportSize({width:1440,height:1000});if(visual)visuals.push((await page.locator('.receipt-scan-table').screenshot({type:'jpeg',quality:45})).toString('base64'))
 await page.getByRole('button',{name:'상품 A LOT 관리',exact:true}).click();await page.getByRole('button',{name:'+ LOT 추가',exact:true}).click();await page.getByRole('textbox',{name:'LOT 번호 1',exact:true}).fill('QA-LOT');await page.getByRole('spinbutton',{name:'LOT 수량 1',exact:true}).fill('16');await page.getByRole('dialog').getByRole('button',{name:'저장',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})
 await page.getByRole('button',{name:'검수 확정',exact:true}).click();await page.getByRole('button',{name:'보관 위치 지정',exact:true}).waitFor()
 assert.equal(await scanner.count(),0);assert.equal(await page.getByRole('button',{name:'검수 확정',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'입고 최종 확정',exact:true}).count(),0)
 await page.getByRole('button',{name:'보관 위치 지정',exact:true}).click();await page.getByRole('button',{name:'위치 추가 1',exact:true}).click()
 await choose('보관 위치 1-1','RACK-A01');await page.getByRole('spinbutton',{name:'배치 수량 1-1',exact:true}).fill('21')
 assert.match(await page.locator('.receipt-placement-status').first().innerText(),/5 EA 초과/)
 const before=writes.length;await page.getByRole('button',{name:'배치 확정',exact:true}).click();assert.match(await page.getByRole('alert').first().innerText(),/초과/);assert.equal(writes.length,before)
 await page.getByRole('spinbutton',{name:'배치 수량 1-1',exact:true}).fill('11');assert.match(await page.locator('.receipt-placement-status').first().innerText(),/5 EA 부족/)
 await page.getByRole('button',{name:'배치 확정',exact:true}).click();assert.match(await page.getByRole('alert').first().innerText(),/부족/);assert.equal(writes.length,before)
 await page.getByRole('button',{name:'위치 추가 1',exact:true}).click();await choose('보관 위치 1-2','RACK-B02');await page.getByRole('spinbutton',{name:'배치 수량 1-2',exact:true}).fill('5');assert.match(await page.locator('.receipt-placement-status').first().innerText(),/일치/)
 await page.getByRole('button',{name:'위치 추가 2',exact:true}).click();await choose('보관 위치 2-1','RACK-B02');await page.getByRole('spinbutton',{name:'배치 수량 2-1',exact:true}).fill('2.5')
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} placement overflow`)
  await page.getByRole('button',{name:/^보관 위치 1-1 /}).click();const search=page.getByRole('combobox',{name:'보관 위치 1-1 검색',exact:true});await search.fill('없는 위치');await page.getByRole('status').filter({hasText:'검색 결과가 없습니다.'}).waitFor();await search.fill('');await page.getByRole('option').first().waitFor();await search.press('ArrowDown');await search.press('ArrowUp');await search.press('Enter')
 }
 await page.setViewportSize({width:1440,height:1000});if(visual)visuals.push((await page.locator('.receipt-placement-cell').first().screenshot({type:'jpeg',quality:45})).toString('base64'))
 await page.getByRole('button',{name:'배치 확정',exact:true}).click();await page.getByRole('alertdialog',{name:'입고 저장 확인',exact:true}).getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('button',{name:'입고 최종 확정',exact:true}).waitFor()
 assert.equal(data.lines[0].placements.length,2);assert.equal(data.receipt.status,'Inspecting')
 await page.getByRole('button',{name:'입고 최종 확정',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click();await page.getByText('재고 반영 결과',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'보관 위치 지정',exact:true}).count(),0);assert.equal(data.receipt.status,'Confirmed')
 assert.equal(data.lines[0].lotNumber,'QA-LOT')
 data=initial();await page.goto(`${origin}/__receipt-ui?readonly=1`);await page.getByRole('heading',{name:'입고 상세',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'검수 시작',exact:true}).count(),0)
 await goto('new');await choose('입고 창고','창고');await choose('기본 입고 랙','RACK-A01');await addProducts(['p1']);await choose('입고 창고','다른 창고')
 assert.doesNotMatch(await page.getByRole('button',{name:/^입고 랙 1 /}).innerText(),/RACK-A01/);assert.doesNotMatch(await page.getByRole('button',{name:/^기본 입고 랙 /}).innerText(),/RACK-A01/)
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS scan 10 → manual 15 → scan 16, weighted input, staged buttons, split placement over/under/matched, keyboard search, final confirmation; APIs mocked')
 if(visual)console.log('VISUALS:'+JSON.stringify(visuals))
 }
}finally{await browser.close()}
