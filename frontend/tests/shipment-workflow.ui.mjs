import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',endpoint='/api/tenants/fixture/shipments',id='12345678-1234-1234-1234-123456789012'
const choice=(id,name,unit=null)=>({id,name,code:id.toUpperCase(),unit,lotManaged:false,expiryManaged:false,serialManaged:false})
const products=[{...choice('p1','상품 A','EA'),retailPrice:5000,currency:'KRW'},{...choice('p2','상품 B','kg'),retailPrice:8000,currency:'KRW'},{...choice('p3','가격 미등록 상품','EA'),retailPrice:null,currency:'KRW'}].map(p=>({...p,physical:50,reserved:10,available:40,requestable:40,ownReserved:0}))
const racks=[{...choice('a','RACK-A01','EA'),rackAvailable:40,rackPhysical:50,rackRequestable:40},{...choice('b','RACK-B02','EA'),rackAvailable:80,rackPhysical:90,rackRequestable:80},{...choice('c','RACK-C03','EA'),rackAvailable:60,rackPhysical:70,rackRequestable:60}],now=()=>new Date().toISOString()
const initial=()=>({shipment:{id,number:'OUT-QA',requestDate:'2026-11-06',expectedDate:'2026-11-06',partnerId:'customer',partnerName:'거래처',warehouseId:'w',warehouseName:'출고창고',contactName:'담당자',status:'Requested',version:'v1',pickedAt:null,inspectedAt:null,confirmedAt:null},lines:products.slice(0,2).map((p,i)=>({id:'l'+i,productId:p.id,productCode:p.code,productName:p.name,unit:p.unit,retailPrice:p.retailPrice,currency:p.currency,plannedRackId:'a',plannedRackName:racks[0].name,plannedRackCode:'A',requestedQuantity:i?2.5:10,serials:[],lotNumber:null,expiryDate:null})),allocations:[{id:'a1',lineId:'l0',stockId:'s1',locationId:'loc-a',locationCode:'A-1-1',rackCode:'RACK-A01',quantity:5},{id:'a2',lineId:'l0',stockId:'s2',locationId:'loc-b',locationCode:'B-2-1',rackCode:'RACK-B02',quantity:5},{id:'a3',lineId:'l1',stockId:'s3',locationId:'loc-b',locationCode:'B-2-1',rackCode:'RACK-B02',quantity:2.5}].map(a=>({...a,warehouseId:'w',warehouseName:'출고창고',pickedQuantity:0,inspectedQuantity:0,confirmedQuantity:0,state:'Active',pickedAt:null,inspectedAt:null,pickedByName:null})),movements:[]})
let data=initial(),reads=[],writes=[],failConfirm=false,routeUnavailable=false,serial=2
const errors=[],replays=new Set()
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:Number(process.env.WMS_WORK_WIDTH||1440),height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),q=url.searchParams,path=url.pathname
  assert.equal(url.origin,origin)
  if(path==='/__shipment-ui')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/shipment-ui.tsx"></script></html>'})
  if(!path.startsWith('/api/'))return route.continue()
  const json=value=>route.fulfill({json:value})
  if(path==='/api/auth/csrf')return json({token:'fixture'})
  if(req.method()==='GET'){reads.push(url.href)
   if(path===endpoint+'/choices'){
    const kind=q.get('kind'),search=(q.get('search')||'').toLowerCase(),ids=q.getAll('ids')
    if(kind==='product-options')return json({categories:[],productTypes:[]})
    let items=kind==='warehouses'?[choice('w','출고창고'),choice('w2','다른 창고')]:kind==='partners'?[choice('customer','거래처')]:kind==='racks'?(q.get('warehouseId')==='w'?racks:[]):products
    if(kind==='racks'&&q.get('sort')==='stock')items=[...items].sort((a,b)=>b.rackRequestable-a.rackRequestable)
    items=items.filter(p=>(kind!=='racks'||!q.get('rackId')||p.id===q.get('rackId'))&&(!ids.length||ids.includes(p.id))&&(!q.get('exactName')||p.name===q.get('exactName'))&&[p.name,p.code].join(' ').toLowerCase().includes(search))
    return json({recommendedRack:kind==='racks'&&!q.get('shipmentId')&&!(routeUnavailable&&q.get('sort')==='route')?items[0]:null,items,total:items.length,page:1,pageSize:20,routeNotice:'출입구 정보가 없습니다. 랙 코드 순으로 표시합니다.'})
   }
   if(path===endpoint+'/'+id)return json(data)
   if(path===endpoint)return json({items:[],total:0,page:1,pageSize:20})
  }
  const body=req.postDataJSON();writes.push({path,body})
  if(path===endpoint||path===endpoint+'/'+id){data=initial();data.shipment={...data.shipment,...body};data.lines=body.lines.map((l,i)=>({...data.lines[i%2],...l,id:'l'+i,productName:products.find(p=>p.id===l.productId).name}));return route.fulfill({status:path===endpoint?201:200,json:data})}
  if(path.endsWith('/start-picking'))data.shipment.status='Picking'
  else if(path.endsWith('/scan-picking')||path.endsWith('/scan-inspection')){
   const inspect=path.endsWith('/scan-inspection'),replayed=replays.has(body.requestId);replays.add(body.requestId)
   if(body.barcode==='LOCATION-A')return json({outcome:'location',locationId:'loc-a',locationCode:'A-1-1',detail:data,requestId:body.requestId,candidateAllocationIds:[]})
   const a=data.allocations.find(a=>a.locationId===body.locationId&&a.lineId==='l0');assert.ok(a)
   if(!replayed){a[inspect?'inspectedQuantity':'pickedQuantity']++;a[inspect?'inspectedAt':'pickedAt']=now();a.pickedByName='QA 담당자';data.shipment.version='v'+serial++}
   return json({outcome:'applied',detail:data,allocationId:a.id,requestId:body.requestId,replayed,candidateAllocationIds:[]})
  }else if(path.endsWith('/picking')||path.endsWith('/inspection')){
   const inspect=path.endsWith('/inspection')
   for(const line of body.allocations){const a=data.allocations.find(a=>a.id===line.allocationId);a[inspect?'inspectedQuantity':'pickedQuantity']=line.quantity;a[inspect?'inspectedAt':'pickedAt']=now();a.pickedByName='QA 담당자'}
   if(body.complete){data.shipment.status=inspect?'Inspected':'Picked';data.shipment[inspect?'inspectedAt':'pickedAt']=now()}
  }else if(path.endsWith('/confirm')){
   if(failConfirm)return route.fulfill({status:409,json:{message:'예약 수량이 변경되었습니다.'}})
   assert.equal(data.shipment.status,'Inspected');data.shipment.status='Confirmed';data.shipment.confirmedAt=now();for(const a of data.allocations){a.state='Consumed';a.confirmedQuantity=a.quantity}data.movements=[{id:1,quantity:-5},{id:2,quantity:-5},{id:3,quantity:-2.5}]
  }else throw Error('Unexpected API '+path)
  data.shipment.version='v'+serial++;return json(data)
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 async function choose(label,text){await page.getByRole('button',{name:new RegExp('^'+label+' ')}).click();await page.getByRole('combobox',{name:label+' 검색',exact:true}).fill(text);await page.getByRole('option').filter({hasText:text}).first().click()}
 async function add(ids){await page.getByRole('button',{name:'상품 추가',exact:true}).click();const dialog=page.getByRole('dialog',{name:'상품 추가',exact:true});assert.equal(await dialog.locator('input[type=number]').count(),0);for(const id of ids)await dialog.getByRole('checkbox',{name:id.toUpperCase()+' 선택',exact:true}).check();await dialog.getByRole('button',{name:'선택 상품 추가',exact:true}).click();await dialog.waitFor({state:'hidden'})}
 if(process.env.WMS_SHIPMENT_LINES){
  products[0].name='농심 새우깡 90g 긴 상품명 가독성 확인'
  for(const width of [360,390,430,768,1440]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+'/__shipment-ui?mode=new')
   await choose('출고 창고','출고창고');await add(['p1','p2'])
   const table=page.locator('.shipment-registration-products'),rows=table.locator('tbody > tr')
   assert.equal(await rows.count(),2)
   await page.getByLabel('수량 1',{exact:true}).fill('0')
   assert.equal(await page.getByText('수량은 양수이며 소수점 3자리 이내여야 합니다.',{exact:true}).count(),0)
   assert.equal(await page.getByLabel('수량 1',{exact:true}).getAttribute('aria-invalid'),'true')
   await page.getByLabel('수량 1',{exact:true}).fill('10');await page.getByLabel('수량 2',{exact:true}).fill('2.5')
   await choose('지정 출고 랙 2','RACK-B02')
   assert.match(await table.locator('tfoot').innerText(),/70,000 원/)
   assert.deepEqual(await table.locator('.receipt-quantity-unit').allTextContents(),['EA','kg'])
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow')
   if(width<=600){
    const layout=await rows.first().evaluate(e=>{
     const b=s=>{const r=e.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}
     return {title:b('.document-product'),quantity:b('.document-quantity'),rack:b('.shipment-rack-choice'),price:b('[data-label="소비자가"]'),total:b('[data-label="참고 금액"]'),stock:b('.document-stock-number'),rackstock:b('.shipment-rack-stock'),tracking:b('.document-tracking'),button:b('.document-tracking button'),actions:b('.document-actions'),font:getComputedStyle(e.querySelector('.document-product strong')).fontSize,cells:[...e.cells].map(c=>({x:c.getBoundingClientRect().x,right:c.getBoundingClientRect().right}))}
    })
    assert.equal(layout.font,'16px');assert(layout.quantity.y>layout.title.y)
    assert(Math.abs(layout.quantity.y-layout.rack.y)<1);assert(Math.abs(layout.price.y-layout.total.y)<1)
    assert(Math.abs(layout.stock.y-layout.rackstock.y)<1);assert(layout.tracking.y>layout.stock.y)
    assert(layout.button.y-layout.tracking.y>=12);assert(layout.actions.y>layout.tracking.y)
    assert(layout.cells.every(c=>c.x>=0&&c.right<=width),'card cells in bounds')
    if(process.env.UI_VISUAL&&width===390)console.log('IMAGE:'+(await rows.first().screenshot({type:'jpeg'})).toString('base64'))
   }else assert.equal(await table.locator('thead').evaluate(e=>getComputedStyle(e).display),'table-header-group')
   await page.getByLabel('수량 1',{exact:true}).fill('100')
   await rows.first().getByRole('alert').filter({hasText:'초과'}).waitFor()
   await page.getByLabel('수량 1',{exact:true}).fill('10')
   await page.getByRole('button',{name:'상품 2 제거',exact:true}).click();assert.equal(await rows.count(),1)
   assert.equal(await page.locator('.registration-header-actions').getByRole('button',{name:'취소',exact:true}).count(),0)
   await page.getByRole('button',{name:'뒤로가기',exact:true}).click()
   await page.getByRole('button',{name:'계속 편집',exact:true}).click()
   assert.equal(await page.getByLabel('수량 1',{exact:true}).inputValue(),'10')
   await page.getByRole('button',{name:'뒤로가기',exact:true}).click()
   await page.getByRole('button',{name:'변경 버리고 계속',exact:true}).click()
   await page.waitForFunction(()=>document.documentElement.dataset.documentPath==='/app/shipments')
   console.log(`PASS ${width}px: shipment registration layout, units, totals, stock validation, rack selection and removal`)
  }
  await page.goto(origin+'/__shipment-ui')
  await page.getByRole('button',{name:'출고 요청 수정',exact:true}).click()
  await page.getByRole('button',{name:'뒤로가기',exact:true}).click()
  await page.getByRole('heading',{name:'출고 상세',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'변경 버리고 계속',exact:true}).count(),0)
  console.log('PASS back cancels editing to original detail; no prompt for unchanged data')
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[])
 }else{
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/__shipment-ui?mode=new');await choose('출고 창고','출고창고');await choose('기본 출고 랙','RACK-A01');await add(['p1','p2']);await page.getByRole('spinbutton',{name:'수량 1',exact:true}).fill('10');await page.getByRole('spinbutton',{name:'수량 2',exact:true}).fill('2.5');await choose('지정 출고 랙 2','RACK-B02');await choose('기본 출고 랙','RACK-B02');assert.match(await page.getByRole('button',{name:/^지정 출고 랙 1 /}).innerText(),/RACK-A01/);assert.match(await page.locator('tfoot').innerText(),/70,000 원/);assert.match(await page.locator('tfoot').innerText(),/10 EA.*2.5 kg/);assert.equal(await page.locator('#shipment-registration > .dialog-actions').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));console.log('PASS '+width+'px: receipt-style layout, default/individual racks, mixed-unit retail totals and no page overflow')
 }
 await page.getByLabel('랙 선택 기준',{exact:true}).selectOption('stock')
 await page.getByText('2개 상품의 지정 랙을 갱신했습니다.',{exact:true}).waitFor()
 assert.match(await page.getByRole('button',{name:/^지정 출고 랙 1 /}).innerText(),/RACK-B02/)
 await page.getByRole('button',{name:/^지정 출고 랙 1 /}).click()
 await page.locator('[role=option]').first().waitFor();assert.match(await page.locator('[role=option]').first().innerText(),/RACK-B02.*80/s)
 await page.getByRole('combobox',{name:'지정 출고 랙 1 검색',exact:true}).press('Escape')
 await page.getByLabel('랙 선택 기준',{exact:true}).selectOption('route');await page.waitForFunction(()=>Array.from(document.querySelectorAll('.shipment-rack-choice button')).every(x=>x.textContent.includes('RACK-A01')));assert.equal(await page.getByRole('spinbutton',{name:'수량 2',exact:true}).inputValue(),'2.5');await choose('지정 출고 랙 2','RACK-B02')
 const headers=await page.locator('#shipment-registration thead th').allTextContents();assert.equal(headers.indexOf('지정 출고 랙'),headers.indexOf('LOT·유통기한·시리얼')+1);assert.equal(headers.indexOf('랙 재고'),headers.indexOf('지정 출고 랙')+1)
 await page.getByRole('spinbutton',{name:'수량 1',exact:true}).fill('100');await page.getByText('랙 가용량 부족 · 다른 랙 선택 또는 다중 랙 분할 피킹',{exact:true}).waitFor();await page.getByRole('spinbutton',{name:'수량 1',exact:true}).fill('10')
 await page.getByRole('button',{name:'상품 추가',exact:true}).click();const stockDialog=page.getByRole('dialog',{name:'상품 추가',exact:true});await stockDialog.getByRole('button',{name:'필터 초기화',exact:true}).waitFor();await stockDialog.getByRole('checkbox',{name:'P1 선택',exact:true}).waitFor();assert.ok(reads.some(x=>x.includes('stockOnly=true')&&x.includes('rackId=b')));await stockDialog.getByRole('button',{name:'필터 초기화',exact:true}).click();await page.getByRole('dialog',{name:'필터 초기화',exact:true}).getByRole('button',{name:'초기화',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[aria-labelledby] h2')?.textContent.includes('필터 초기화'));await stockDialog.getByRole('checkbox',{name:'P1 선택',exact:true}).waitFor();assert.ok(reads.some(x=>x.includes('kind=product-table')&&x.includes('stockOnly=true')&&!x.includes('rackId=')));await stockDialog.getByRole('button',{name:'취소',exact:true}).click()
 console.log('PASS warehouse/rack stock queries, filter clear, stock/route automatic assignment and manual override, stock warning and column order')
 await page.setViewportSize({width:Number(process.env.WMS_WORK_WIDTH||1440),height:1000});await choose('매출 거래처','거래처');await page.getByRole('button',{name:/^출고 담당자 QA 담당자/}).waitFor();await page.getByRole('button',{name:'엑셀 붙여넣기',exact:true}).click();await page.getByLabel('엑셀 붙여넣기 입력',{exact:true}).fill('상품명\t수량\n가격 미등록 상품\t1');await page.getByRole('dialog',{name:'엑셀 붙여넣기',exact:true}).getByRole('button',{name:/^추가/}).click();assert.match(await page.getByRole('button',{name:/^지정 출고 랙 3 /}).innerText(),/RACK-B02/);assert.match(await page.locator('tfoot').innerText(),/미산정 1행/)
 await page.getByRole('button',{name:'출고 등록',exact:true}).click();await page.getByRole('alertdialog',{name:'출고 저장 확인'}).getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('heading',{name:'출고 상세',exact:true}).waitFor();const create=writes.find(w=>w.path===endpoint);assert.deepEqual(create.body.lines.map(l=>l.plannedRackId),['a','b','b']);assert.equal(await page.evaluate(()=>document.documentElement.dataset.documentPath),'/app/shipments/'+id)
 data=initial();await page.goto(origin+'/__shipment-ui');await page.getByText('실제 피킹 위치 미지정',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'출고 확정',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'목록으로',exact:true}).count(),0)
 await page.getByRole('button',{name:'피킹 시작',exact:true}).click();await page.getByRole('alertdialog',{name:'피킹 시작 확인'}).getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('heading',{name:'출고 피킹',exact:true}).waitFor()
 async function scan(label,value){const input=page.getByLabel(label,{exact:true});await input.fill(value);await input.press('Enter');await page.waitForFunction(()=>!document.body.innerText.includes('건 처리 대기'))}
 await scan('피킹 바코드','LOCATION-A');await scan('피킹 바코드','PRODUCT-A');await page.waitForFunction(()=>document.querySelector('input[aria-label="작업 수량 1"]').value==='1')
 for(const [i,q] of [5,5,2.5].entries())await page.getByRole('spinbutton',{name:'작업 수량 '+(i+1),exact:true}).fill(String(q))
 await page.getByRole('button',{name:'피킹 완료',exact:true}).click();await page.getByRole('heading',{name:'최종 검수',exact:true}).waitFor();assert.equal(data.shipment.status,'Picked');assert.equal(await page.getByRole('button',{name:'출고 확정',exact:true}).count(),0)
 for(const [i,q] of [5,5,2.5].entries())await page.getByRole('spinbutton',{name:'작업 수량 '+(i+1),exact:true}).fill(String(q))
 await page.getByRole('button',{name:'검수 완료',exact:true}).click();await page.getByRole('heading',{name:'출고 상세',exact:true}).waitFor();await page.getByRole('button',{name:'출고 확정',exact:true}).waitFor();assert.equal(data.shipment.status,'Inspected');assert.equal(data.movements.length,0)
 const history=page.getByRole('region',{name:'출고 위치 내역'});assert.equal(await history.locator('tbody tr').count(),3);assert.match(await history.innerText(),/RACK-B02/);assert.match(await history.innerText(),/미확정/)
 await page.reload();await page.getByRole('button',{name:'출고 확정',exact:true}).waitFor();failConfirm=true;await page.getByRole('button',{name:'출고 확정',exact:true}).click();await page.getByRole('alertdialog',{name:'출고 확정 확인'}).getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('alert').filter({hasText:'예약 수량이 변경되었습니다.'}).waitFor();assert.equal(data.shipment.status,'Inspected');failConfirm=false
 await page.getByRole('button',{name:'출고 확정',exact:true}).click();await page.getByRole('alertdialog',{name:'출고 확정 확인'}).getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('status').filter({hasText:'출고 확정 · 예약 해제 완료'}).waitFor();assert.equal(await page.getByRole('button',{name:'출고 확정',exact:true}).count(),0);assert.equal(await history.locator('tbody tr').count(),3);assert.doesNotMatch(await history.innerText(),/미확정/)
 data=initial();data.shipment.status='Inspected';await page.goto(origin+'/__shipment-ui?readonly');await page.getByRole('heading',{name:'출고 상세',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'출고 확정',exact:true}).count(),0)
 await page.goto(origin+'/__shipment-ui?mode=new');await choose('출고 창고','출고창고');await choose('기본 출고 랙','RACK-A01');await add(['p1']);await choose('출고 창고','다른 창고');assert.doesNotMatch(await page.getByRole('button',{name:/^기본 출고 랙 /}).innerText(),/RACK-A01/);assert.doesNotMatch(await page.getByRole('button',{name:/^지정 출고 랙 1 /}).innerText(),/RACK-A01/)
 data=initial();await page.goto(origin+'/__shipment-ui');await page.getByRole('button',{name:'출고 요청 수정',exact:true}).click();await page.getByLabel('랙 선택 기준',{exact:true}).selectOption('stock');await page.getByText('저장된 출고 건은 옵션 정렬만 변경합니다. 지정 랙은 유지됩니다.',{exact:true}).waitFor();assert.match(await page.getByRole('button',{name:/^지정 출고 랙 1 /}).innerText(),/RACK-A01/)
 await page.goto(origin+'/__shipment-ui?mode=new');await choose('출고 창고','출고창고');await add(['p1']);await page.getByLabel('랙 선택 기준',{exact:true}).selectOption('stock');await page.getByText('1개 상품의 지정 랙을 갱신했습니다.',{exact:true}).waitFor();routeUnavailable=true;await page.getByLabel('랙 선택 기준',{exact:true}).selectOption('route');await page.getByText(/경로 또는 가용 재고를 확인할 수 없는 상품은 기존 선택을 유지합니다/).waitFor();assert.match(await page.getByRole('button',{name:/^지정 출고 랙 1 /}).innerText(),/RACK-B02/)
 console.log('PASS saved shipment never auto-reassigned; unavailable route preserves manual selection')
 assert.deepEqual(errors,[]);console.log('PASS Excel paste, rack persistence, scan/manual picking → final inspection → exact document detail, confirm retry/read-only, multi-location history, warehouse switch and permissions; all business APIs mocked')
}
}finally{await browser.close()}
