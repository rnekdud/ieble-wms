import assert from 'node:assert/strict'
import {chromium} from 'playwright'

// All business requests are intercepted. This test never connects to a real API/database.
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',endpoint='/api/tenants/fixture/receipts'
const choice=(id,name,unit=null)=>({id,name,code:id.toUpperCase(),unit,lotManaged:false,expiryManaged:false,serialManaged:false})
const products=[{...choice('p1','상품 A','EA'),retailPrice:5000,currency:'KRW'},{...choice('p2','상품 B','kg'),retailPrice:8000,currency:'KRW'},{...choice('p3','가격 미등록 상품','EA'),retailPrice:null,currency:'KRW'}]
const racks=[choice('a','RACK-A01'),choice('b','RACK-B02')]
const locations=[{...choice('la','A 위치'),rackId:'a',rackName:'RACK-A01',rackCode:'A',level:1,bay:1},{...choice('lb','B 위치'),rackId:'b',rackName:'RACK-B02',rackCode:'B',level:2,bay:1}]
const initial=()=>({receipt:{id:'r',number:'IN-TEST',expectedDate:'2026-11-06',partnerId:'supplier',partnerName:'공급사',warehouseId:'w',warehouseName:'창고',contactName:'담당자',notes:null,status:'Planned',version:'v1',createdAt:'2026-11-06',inspectedAt:null,confirmedAt:null},lines:products.slice(0,2).map((p,index)=>({id:'l'+index,productId:p.id,productCode:p.code,productName:p.name,unit:p.unit,retailPrice:p.retailPrice,currency:p.currency,plannedRackId:racks[index].id,plannedRackName:racks[index].name,plannedRackCode:racks[index].code,expectedQuantity:index?2.5:20,inspectedQuantity:null,lotNumber:null,expiryDate:null,serials:[],placements:[],lotManaged:false,expiryManaged:false,serialManaged:false}))})
let data=initial(),serial=1,readonly=false,quantityGate=null,quantityStarted=null,quantityFailure=0,detailReads=0
const writes=[],unexpected=[],errors=[],visuals=[],replays=new Set()
const visual=!!process.env.UI_VISUAL||process.argv.includes('--visual')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:Number(process.env.WMS_WORK_WIDTH||1440),height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,q=url.searchParams
  if(url.origin!==origin){unexpected.push(req.url());return route.abort()}
  if(!path.startsWith('/api/'))return route.continue()
  const json=value=>route.fulfill({json:value})
  if(path==='/api/auth/me')return json({user:{id:'qa',displayName:'담당자',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'격리 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'})
  if(path==='/api/health/db')return json({status:'connected'})
  if(path==='/api/tenants/fixture/workspace')return json({id:'fixture',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{receipts:readonly?['menu','read']:['menu','read','create','update','confirm']},currentAssignee:{id:'qa',name:'담당자',code:'QA'}})
  if(path==='/api/tenants/fixture/pages/receipts')return json({})
  if(path==='/api/auth/csrf')return json({token:'fixture'})
  if(req.method()==='GET'){
   if(path===endpoint+'/choices'){
    const kind=q.get('kind'),search=(q.get('search')||'').toLowerCase(),ids=q.getAll('ids')
    if(kind==='product-options')return json({categories:[],productTypes:[]})
    let items=kind==='warehouses'?[choice('w','창고'),choice('w2','다른 창고')]:kind==='partners'?[choice('supplier','공급사')]:kind==='racks'?(q.get('warehouseId')==='w'?racks:[]):kind==='locations'?locations:products
    items=items.filter(p=>(!ids.length||ids.includes(p.id))&&[p.name,p.code,p.rackName,p.rackCode].filter(Boolean).join(' ').toLowerCase().includes(search))
    if(kind==='locations')items=[...items].sort((a,b)=>Number(b.rackId===q.get('rackId'))-Number(a.rackId===q.get('rackId')))
    return json({items,total:items.length,page:1,pageSize:30})
   }
   if(path===endpoint+'/r'||path===endpoint+'/11111111-1111-4111-8111-111111111111'){detailReads++;return json(data)}
   if(path.endsWith('/inspection-history'))return json({items:[],page:1,pageSize:30,total:0})
   if(path.endsWith('/stock'))return json({balances:data.lines.map(l=>({id:l.id,quantity:l.inspectedQuantity,unit:l.unit})),movements:[{}]})
  }else{
   const body=req.postDataJSON();if(body.reason==='예정 수량으로 검수수량 일괄 입력'&&!replays.has(body.requestId))assert.equal(body.version,data.receipt.version,'bulk uses latest server version');writes.push({path,body});if(path.endsWith('/inspection-quantity')){quantityStarted?.();if(quantityGate)await quantityGate;if(quantityFailure){const status=quantityFailure;quantityFailure=0;return route.fulfill({status,json:{message:'QA 수량 저장 실패'}})}}data.receipt.version='v'+(++serial)
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
 await page.clock.install()
 const goto=()=>page.goto(origin+'/app/receipts/11111111-1111-4111-8111-111111111111')
 const choose=async(label,text)=>{await page.getByRole('button',{name:new RegExp('^'+label+' ')}).click();const input=page.getByRole('combobox',{name:label+' 검색',exact:true});await input.fill(text);await page.getByRole('option').filter({hasText:text}).first().click()}
 data=initial();await goto();await page.getByRole('button',{name:'검수 시작',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'목록으로',exact:true}).count(),0)
 assert.equal(await page.getByRole('button',{name:'보관 위치 지정',exact:true}).count(),0)
 await page.getByRole('button',{name:'검수 시작',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click()
 const scanner=page.getByRole('textbox',{name:'검수 바코드',exact:true})
 async function scan(value){await scanner.fill(value);await scanner.press('Enter');await page.waitForFunction(()=>!document.body.innerText.includes('건 처리 대기'))}
 for(let i=0;i<10;i++)await scan('BAR-A')
 assert.equal(await page.getByRole('spinbutton',{name:'검수 수량 1',exact:true}).inputValue(),'10')
 const quantity=page.getByRole('spinbutton',{name:'검수 수량 1',exact:true}), corrections=()=>writes.filter(w=>w.path.endsWith('/inspection-quantity'))
 const settled=()=>page.waitForFunction(()=>!document.body.innerText.includes('건 처리 대기'))
 await quantity.fill('15')
 assert(await page.getByRole('button',{name:'예정 수량 일괄 입력',exact:true}).isDisabled(),'do not overwrite manual draft')
 assert.equal(await page.getByRole('button',{name:'수량 반영',exact:true}).count(),0)
 assert.equal(await page.getByRole('textbox',{name:'검수 수정 사유'}).count(),0)
 assert.equal(await page.locator('.receipt-quantity-actions').count(),0)
 const reads=detailReads;await page.clock.fastForward(15001);assert.equal(detailReads,reads);assert.equal(await quantity.inputValue(),'15');assert.equal(corrections().length,0)
 const started=new Promise(resolve=>{quantityStarted=resolve});let releaseQuantity;quantityGate=new Promise(resolve=>{releaseQuantity=resolve})
 await quantity.press('Enter');await started;quantityStarted=null;await page.waitForFunction(()=>document.body.innerText.includes('건 처리 대기'))
 await quantity.evaluate(el=>el.blur());assert.equal(await page.getByRole('button',{name:'검수 확정',exact:true}).isDisabled(),true)
 assert.equal(corrections().length,1);releaseQuantity();quantityGate=null;await settled()
 assert.equal(corrections()[0].body.reason,'검수수량 직접 수정');assert.equal(data.lines[0].inspectedQuantity,15)
 await quantity.fill('15.0');await quantity.press('Tab');assert.equal(corrections().length,1)
 await scan('BAR-A');assert.equal(await quantity.inputValue(),'16')
 // A rejected save restores the last confirmed quantity; the user can immediately correct it.
 quantityFailure=400;await quantity.fill('17');await quantity.press('Tab');await page.getByRole('alert').filter({hasText:'QA 수량 저장 실패'}).waitFor();await settled();assert.equal(await quantity.inputValue(),'16')
 await quantity.fill('18');await quantity.press('Tab');await settled();assert.equal(data.lines[0].inspectedQuantity,18)
 // An uncertain result keeps its event ID; retry cannot submit a fresh correction.
 quantityFailure=503;await quantity.fill('16');await quantity.press('Enter');await page.getByRole('button',{name:'같은 요청 재시도',exact:true}).waitFor()
 const retryId=corrections().at(-1).body.requestId;await page.getByRole('button',{name:'같은 요청 재시도',exact:true}).click();await settled();assert.equal(corrections().at(-1).body.requestId,retryId);assert.equal(data.lines[0].inspectedQuantity,16)
 await goto();await quantity.waitFor();assert.equal(await quantity.inputValue(),'16')
 await scan('BAR-B');await page.getByRole('spinbutton',{name:'검수 수량 2',exact:true}).fill('2.5');await page.getByRole('spinbutton',{name:'검수 수량 2',exact:true}).press('Tab');await settled()
 assert.equal(await page.getByRole('button',{name:'보관 위치 지정',exact:true}).count(),0)
 for(const width of [1920,1440,1280,1024,768,430,390,360]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);if(width<760&&await page.getByRole('button',{name:'사이드바 닫기',exact:true}).isVisible())await page.getByRole('button',{name:'사이드바 닫기',exact:true}).click()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} inspection overflow`)
  const box=await scanner.boundingBox(),buttons=await page.locator('.barcode-input-row > button').all()
  const bulkButton=page.getByRole('button',{name:'예정 수량 일괄 입력',exact:true});assert.equal(await bulkButton.count(),1)
  assert(await bulkButton.evaluate(el=>el.previousElementSibling?.textContent==='카메라 스캔'&&el.parentElement.classList.contains('barcode-input-row')))
  if(width>=768){const camera=await page.getByRole('button',{name:'카메라 스캔',exact:true}).boundingBox(),bulkBox=await bulkButton.boundingBox();assert(Math.abs(bulkBox.x-camera.x-camera.width-8)<1);assert(Math.abs(bulkBox.y-camera.y)<1)}
  for(const button of buttons){const b=await button.boundingBox();assert(Math.abs(b.height-box.height)<1,`${width} scan heights ${b.height} / ${box.height}`);if(width>=768)assert(Math.abs(b.y-box.y)<1,`${width} scan baseline`)}
  assert.equal(await page.locator('.receipt-inspection-help h3').count(),3)
  assert.equal(await page.getByText('사전 입력한 추적 정보는 예정 정보입니다.',{exact:false}).count(),0)
  assert(await page.locator('.receipt-product-table thead th').evaluateAll(els=>els.every(el=>getComputedStyle(el).textAlign==='center')))
  assert.equal(await page.locator('.receipt-inspection-lots').first().evaluate(el=>getComputedStyle(el).textAlign),'left')
 }
 await page.setViewportSize({width:Number(process.env.WMS_WORK_WIDTH||1440),height:1000});if(visual)visuals.push((await page.locator('.receipt-scan-station').screenshot({type:'jpeg',quality:45})).toString('base64'),(await page.locator('.receipt-scan-table').screenshot({type:'jpeg',quality:45})).toString('base64'))
 const dialog=page.getByRole('dialog',{name:'추적 정보 관리',exact:true}), openLot=()=>page.getByRole('button',{name:'상품 A LOT 관리',exact:true}).click(), openSerial=()=>page.getByRole('button',{name:'상품 A 시리얼 관리',exact:true}).click()
 const lotTab=()=>dialog.getByRole('tab',{name:/LOT/}).click(),serialTab=()=>dialog.getByRole('tab',{name:/시리얼/}).click(),saveTracking=async()=>{await dialog.getByRole('button',{name:'저장',exact:true}).click();await dialog.waitFor({state:'hidden'})}
 await openLot();assert.equal(await dialog.locator('table').count(),0);assert((await dialog.boundingBox()).height<450)
 await dialog.getByText('상품 A · 검수수량 16 EA',{exact:true}).waitFor()
 await serialTab();assert.equal(await dialog.locator('table').count(),0);assert.equal(await dialog.getByRole('status').count(),0)
 for(const width of [1920,1440,1280,1024,768,430,390,360]){
  await page.setViewportSize({width,height:900});const serialBounds=await dialog.boundingBox(),area=await dialog.getByLabel('시리얼 일괄 입력',{exact:true}).boundingBox(),body=await dialog.locator('.dialog-body').boundingBox()
  assert(area.width>body.width-60,`textarea ${width}: ${area.width}/${body.width} ${await dialog.getByLabel("시리얼 일괄 입력",{exact:true}).evaluate(el=>[el,el.parentElement,el.parentElement.parentElement,el.parentElement.parentElement.parentElement].map(e=>[e.className,getComputedStyle(e).display,getComputedStyle(e).width,getComputedStyle(e).maxWidth]).join(";"))}`);assert(area.height>=90&&area.height<=110)
  const select=await dialog.getByLabel('추가 시리얼 LOT',{exact:true}).boundingBox(),add=await dialog.getByRole('button',{name:'목록에 추가',exact:true}).boundingBox()
  assert(Math.abs(select.y-add.y)<1);assert(Math.abs(add.x-select.x-select.width-8)<1);assert(Math.abs(select.height-add.height)<1)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  const footer=await dialog.locator(':scope > footer').boundingBox();assert(footer.y+footer.height<=900)
  await lotTab();assert.equal((await dialog.boundingBox()).width,serialBounds.width);await serialTab()
 }
 await page.setViewportSize({width:Number(process.env.WMS_WORK_WIDTH||1440),height:1000});await lotTab()
 await dialog.getByRole('button',{name:'+ LOT 추가',exact:true}).click();await dialog.getByLabel('LOT 번호 1',{exact:true}).fill('QA-LOT');await dialog.getByLabel('LOT 수량 1',{exact:true}).fill('16');await dialog.getByLabel('LOT 유통기한 1',{exact:true}).fill('2028-05-10')
 await serialTab();const paste=dialog.getByLabel('시리얼 일괄 입력',{exact:true});await paste.fill(' SN-001 \n\nSN-002');await dialog.getByLabel('추가 시리얼 LOT',{exact:true}).selectOption({label:'QA-LOT · 2028-05-10'});await dialog.getByRole('button',{name:'목록에 추가',exact:true}).click()
 await dialog.getByRole('tab',{name:'시리얼 (2)',exact:true}).waitFor();await paste.fill('SN-001');await dialog.getByRole('button',{name:'목록에 추가',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'중복'}).waitFor();assert.equal(await paste.inputValue(),'SN-001');await lotTab();assert.equal(await dialog.getByRole('alert').count(),0);await serialTab();await dialog.getByRole('alert').filter({hasText:'중복'}).waitFor();assert.equal(await paste.inputValue(),'SN-001');await paste.fill('');assert.equal(await dialog.getByRole('alert').count(),0)
 await lotTab();assert.equal(await dialog.getByLabel('LOT 번호 1',{exact:true}).inputValue(),'QA-LOT');await saveTracking()
 await openSerial();assert.equal(await dialog.getByRole('tab',{name:'시리얼 (2)',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await dialog.getByLabel('시리얼 번호 1',{exact:true}).inputValue(),'SN-001')
 await dialog.getByRole('button',{name:'시리얼 2 삭제',exact:true}).click();await dialog.getByRole('button',{name:'취소',exact:true}).click();await openSerial();assert.equal(await dialog.getByLabel('시리얼 번호 2',{exact:true}).inputValue(),'SN-002')
 if(visual)visuals.push((await dialog.screenshot({type:'jpeg',quality:45})).toString('base64'))
 await dialog.getByRole('button',{name:'시리얼 2 삭제',exact:true}).click();await dialog.getByRole('button',{name:'시리얼 1 삭제',exact:true}).click();await saveTracking()
 assert.match(await page.locator('.receipt-inspection-lot-list').innerText(),/QA-LOT[\s\S]*2028-05-10/);
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
 for(const width of [1920,1440,1280,1024,768,430,390,360]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);if(width<760&&await page.getByRole('button',{name:'사이드바 닫기',exact:true}).isVisible())await page.getByRole('button',{name:'사이드바 닫기',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} placement overflow`)
  const cards=page.locator('.receipt-placement-products > tbody > tr')
  assert.equal(await cards.count(),2)
  assert.equal(await cards.first().evaluate(el=>getComputedStyle(el).display),width<=1024?'grid':'table-row')
  if(width<=1024){
   assert.equal(await cards.first().evaluate(el=>getComputedStyle(el).borderRadius),'12px')
   assert.equal(await page.locator('.document-line-scroll').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,`${width} card overflow`)
   assert.equal(await page.getByRole('spinbutton',{name:'배치 수량 1-1',exact:true}).inputValue(),'11')
   assert.equal(await page.getByRole('spinbutton',{name:'배치 수량 1-2',exact:true}).inputValue(),'5')
  }
  if(width>1024){
   const select=await page.getByRole('button',{name:/^보관 위치 1-1 /}).boundingBox(),input=await page.getByRole('spinbutton',{name:'배치 수량 1-1',exact:true}).boundingBox()
   assert(Math.abs(select.y-input.y)<1,`${width} placement baseline ${select.y} / ${input.y}`);assert(Math.abs(select.height-input.height)<1,`${width} placement heights ${select.height} / ${input.height}`)
  }
  assert.equal(await page.getByRole('spinbutton',{name:'배치 수량 1-1',exact:true}).getAttribute('step'),'1')
  assert.equal(await page.getByRole('spinbutton',{name:'배치 수량 2-1',exact:true}).getAttribute('step'),'0.001')
  await page.getByRole('button',{name:/^보관 위치 1-1 /}).click();const search=page.getByRole('combobox',{name:'보관 위치 1-1 검색',exact:true});await search.fill('없는 위치');await page.getByRole('status').filter({hasText:'검색 결과가 없습니다.'}).waitFor();await search.fill('');await page.getByRole('option').first().waitFor();await search.press('ArrowDown');await search.press('ArrowUp');await search.press('Enter')
 }
 await page.setViewportSize({width:Number(process.env.WMS_WORK_WIDTH||1440),height:1000});if(visual)visuals.push((await page.locator('.receipt-placement-cell').first().screenshot({type:'jpeg',quality:45})).toString('base64'))
 await page.getByRole('button',{name:'배치 확정',exact:true}).click();await page.getByRole('alertdialog',{name:'입고 저장 확인',exact:true}).getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('button',{name:'입고 최종 확정',exact:true}).waitFor()
 assert.equal(data.lines[0].placements.length,2);assert.equal(data.receipt.status,'Inspecting')
 await page.getByRole('button',{name:'입고 최종 확정',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click();await page.getByText('재고 반영 결과',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'보관 위치 지정',exact:true}).count(),0);assert.equal(data.receipt.status,'Confirmed')
 assert.equal(data.lines[0].lotNumber,'QA-LOT')
 // Bulk fill uses only correction requests; no inspection confirmation or stock writes.
 data=initial();data.receipt.status='Inspecting';data.lines[0].lotNumber='KEEP-LOT';data.lines[0].serials=['KEEP-SERIAL']
 await goto();const bulk=()=>page.getByRole('button',{name:'예정 수량 일괄 입력',exact:true})
 await bulk().waitFor();const bulkBefore=writes.length,readsBefore=detailReads
 let releaseBulk;quantityGate=new Promise(resolve=>{releaseBulk=resolve});const bulkStarted=new Promise(resolve=>{quantityStarted=resolve})
 await bulk().click();await bulkStarted;quantityStarted=null
 assert(await page.getByRole('button',{name:'수량 저장 중…',exact:true}).isDisabled())
 assert(await page.getByRole('button',{name:'검수 확정',exact:true}).isDisabled());assert(await scanner.isDisabled())
 await page.getByRole('button',{name:'수량 저장 중…',exact:true}).evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})))
 await page.clock.fastForward(15001);assert.equal(detailReads,readsBefore);assert.equal(writes.length,bulkBefore+1)
 releaseBulk();quantityGate=null;await page.getByRole('status').filter({hasText:'2종 상품의 검수 수량을 예정 수량으로 저장했습니다.'}).waitFor()
 assert.deepEqual(data.lines.map(l=>l.inspectedQuantity),[20,2.5]);assert.equal(data.receipt.inspectedAt,null);assert.equal(data.receipt.confirmedAt,null)
 assert.equal(data.lines[0].lotNumber,'KEEP-LOT');assert.deepEqual(data.lines[0].serials,['KEEP-SERIAL'])
 assert(writes.slice(bulkBefore).every(w=>w.path.endsWith('/inspection-quantity')&&w.body.groupByProduct&&w.body.reason==='예정 수량으로 검수수량 일괄 입력'))
 assert.equal(new Set(writes.slice(bulkBefore).map(w=>w.body.requestId)).size,2);assert(await bulk().isDisabled())
 await goto();assert.equal(await quantity.inputValue(),'20');assert(await bulk().isDisabled())
 // Uncertain save preserves request ID. Retrying the button only fills remaining products.
 data=initial();data.receipt.status='Inspecting';await goto();await bulk().waitFor();quantityFailure=503
 const failedBefore=writes.length;await bulk().click();await page.getByRole('button',{name:'같은 요청 재시도',exact:true}).waitFor()
 assert.equal(writes.length,failedBefore+1);assert(await bulk().isDisabled());const failedId=writes.at(-1).body.requestId
 await page.getByRole('button',{name:'같은 요청 재시도',exact:true}).click();await settled();assert.equal(writes.at(-1).body.requestId,failedId)
 await bulk().click();await page.getByRole('status').filter({hasText:'1종 상품의 검수 수량을 예정 수량으로 저장했습니다.'}).waitFor()
 assert.deepEqual(data.lines.map(l=>l.inspectedQuantity),[20,2.5])
 // A conflict stops subsequent products, retaining completed quantities.
 data=initial();data.receipt.status='Inspecting';data.lines.push({...data.lines[0],id:'l2',productId:'p3',productName:'상품 C',productCode:'P3',expectedQuantity:7})
 await goto();await bulk().waitFor();let attempt=0;quantityStarted=()=>{if(++attempt===2)quantityFailure=409}
 const conflictBefore=writes.length;await bulk().click();await page.getByRole('status').filter({hasText:'1/3종 저장 완료.'}).waitFor();quantityStarted=null
 assert.equal(writes.length,conflictBefore+2);assert.deepEqual(data.lines.map(l=>l.inspectedQuantity),[20,null,null])
 await bulk().click();await page.getByRole('status').filter({hasText:'2종 상품의 검수 수량을 예정 수량으로 저장했습니다.'}).waitFor()
 assert.deepEqual(data.lines.map(l=>l.inspectedQuantity),[20,2.5,7]);assert.equal(data.receipt.inspectedAt,null)
 data=initial();readonly=true;await goto();await page.getByRole('heading',{name:'입고 상세',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'검수 시작',exact:true}).count(),0)
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS five viewport layouts; Enter/blur/Tab autosave, unchanged/double submit guards, polling draft protection, rejected save restoration, same-ID retry, reload, scanning, tracking empty/bulk/duplicate/tab/cancel/reopen, placement and final confirmation; APIs mocked')
 if(visual)console.log('VISUALS:'+JSON.stringify(visuals))
}finally{await browser.close()}
