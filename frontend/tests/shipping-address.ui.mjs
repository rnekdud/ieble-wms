import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',endpoint='/api/tenants/fixture/shipments',id='12345678-1234-1234-1234-123456789012'
const choice=(id,name,unit=null)=>({id,name,code:id.toUpperCase(),unit,lotManaged:false,expiryManaged:false,serialManaged:false})
const products=[{...choice('p1','상품 A','EA'),retailPrice:5000,currency:'KRW'},{...choice('p2','상품 B','kg'),retailPrice:8000,currency:'KRW'},{...choice('p3','가격 미등록 상품','EA'),retailPrice:null,currency:'KRW'}].map(p=>({...p,physical:50,reserved:10,available:40,requestable:40,ownReserved:0}))
const racks=[{...choice('a','RACK-A01','EA'),rackAvailable:40,rackPhysical:50,rackRequestable:40},{...choice('b','RACK-B02','EA'),rackAvailable:80,rackPhysical:90,rackRequestable:80},{...choice('c','RACK-C03','EA'),rackAvailable:60,rackPhysical:70,rackRequestable:60}],now=()=>new Date().toISOString()
const initial=()=>({shipment:{id,number:'OUT-QA',requestDate:'2026-11-06',expectedDate:'2026-11-06',shippingPostalCode:'01234',shippingAddress:'서울 저장주소',shippingAddressDetail:'기존 상세',partnerId:'customer',partnerName:'거래처',warehouseId:'w',warehouseName:'출고창고',contactName:'담당자',status:'Requested',version:'v1',pickedAt:null,inspectedAt:null,confirmedAt:null},lines:products.slice(0,2).map((p,i)=>({id:'l'+i,productId:p.id,productCode:p.code,productName:p.name,unit:p.unit,retailPrice:p.retailPrice,currency:p.currency,plannedRackId:'a',plannedRackName:racks[0].name,plannedRackCode:'A',requestedQuantity:i?2.5:10,serials:[],lotNumber:null,expiryDate:null})),allocations:[{id:'a1',lineId:'l0',stockId:'s1',locationId:'loc-a',locationCode:'A-1-1',rackCode:'RACK-A01',quantity:5},{id:'a2',lineId:'l0',stockId:'s2',locationId:'loc-b',locationCode:'B-2-1',rackCode:'RACK-B02',quantity:5},{id:'a3',lineId:'l1',stockId:'s3',locationId:'loc-b',locationCode:'B-2-1',rackCode:'RACK-B02',quantity:2.5}].map(a=>({...a,warehouseId:'w',warehouseName:'출고창고',pickedQuantity:0,inspectedQuantity:0,confirmedQuantity:0,state:'Active',pickedAt:null,inspectedAt:null,pickedByName:null})),movements:[]})
let partnerRows=[],failSave=false
let data=initial(),reads=[],writes=[],failConfirm=false,routeUnavailable=false,serial=2
const errors=[],replays=new Set()
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:Number(process.env.WMS_WORK_WIDTH||1440),height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),q=url.searchParams,path=url.pathname
  assert.equal(url.origin,origin)
  if(path==='/__shipment-ui')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/shipping-address-ui.tsx"></script></html>'})
  if(!path.startsWith('/api/'))return route.continue()
  const json=value=>route.fulfill({json:value})
  if(path==='/api/auth/csrf')return json({token:'fixture'})
  if(req.method()==='GET'){reads.push(url.href)
   if(path===endpoint+'/choices'){
    const kind=q.get('kind'),search=(q.get('search')||'').toLowerCase(),ids=q.getAll('ids')
    if(kind==='product-options')return json({categories:[],productTypes:[]})
    let items=kind==='warehouses'?[choice('w','출고창고'),choice('w2','다른 창고')]:kind==='partners'?[{...choice('customer','거래처 A'),defaultShippingPostalCode:'12345',defaultShippingAddress:'안양 기본주소',defaultShippingAddressDetail:'1층'},{...choice('b','거래처 B'),defaultShippingPostalCode:'54321',defaultShippingAddress:'부산 기본주소',defaultShippingAddressDetail:'2층'},choice('c','거래처 C')]:kind==='racks'?(q.get('warehouseId')==='w'?racks:[]):products
    if(kind==='racks'&&q.get('sort')==='stock')items=[...items].sort((a,b)=>b.rackRequestable-a.rackRequestable)
    items=items.filter(p=>(kind!=='racks'||!q.get('rackId')||p.id===q.get('rackId'))&&(!ids.length||ids.includes(p.id))&&(!q.get('exactName')||p.name===q.get('exactName'))&&[p.name,p.code].join(' ').toLowerCase().includes(search))
    return json({recommendedRack:kind==='racks'&&!q.get('shipmentId')&&!(routeUnavailable&&q.get('sort')==='route')?items[0]:null,items,total:items.length,page:1,pageSize:20,routeNotice:'출입구 정보가 없습니다. 랙 코드 순으로 표시합니다.'})
   }
   if(path===endpoint+'/'+id)return json(data)
   if(path==='/api/tenants/fixture/partners')return json({items:partnerRows,total:partnerRows.length,page:1,pageSize:20})
   if(path==='/api/tenants/fixture/partners/partner-qa')return json(partnerRows[0])
   if(path===endpoint)return json({items:[],total:0,page:1,pageSize:20})
  }
  const body=req.postDataJSON();writes.push({path,body})
  if(path==='/api/tenants/fixture/partners'||path==='/api/tenants/fixture/partners/partner-qa'){const partner={...body,id:'partner-qa',code:'BP01',version:'v',createdAt:'2026-11-18',updatedAt:'2026-11-18'};partnerRows=[partner];return json({partner,warning:null})}
  if(failSave&&path===endpoint+'/'+id)return route.fulfill({status:409,json:{message:'격리 저장 실패'}})
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
 await context.addInitScript(()=>{window.daum={Postcode:class{constructor(options){this.options=options}embed(host){const button=document.createElement('button');button.textContent='격리 주소 선택';button.onclick=()=>this.options.oncomplete({zonecode:'45678',roadAddress:'검색 기본주소',jibunAddress:'',address:'검색 기본주소'});host.append(button);this.options.onresize({width:300,height:400})}}}})
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 const field=name=>page.getByRole('textbox',{name,exact:true})
 async function choose(name){await page.getByRole('button',{name:/^매출 거래처 /}).click();await page.getByRole('combobox',{name:'매출 거래처 검색',exact:true}).fill(name);await page.getByRole('option').filter({hasText:name}).click()}
 async function layout(label,width){
  const m=await page.locator('.shipping-address-fields').evaluate(e=>({overflow:e.scrollWidth>e.clientWidth+1,controls:[...e.querySelectorAll('input,button')].map(x=>{const b=x.getBoundingClientRect();return {x:b.x,right:b.right,w:b.width,h:b.height,disabled:x.disabled,readonly:x.readOnly}})}))
  assert(Math.abs(m.controls[2].w - m.controls[3].w) <= 1, 'detail address must use full width');assert(!m.overflow);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  for(const c of m.controls){assert(c.x>=0&&c.right<=width+1,JSON.stringify(c));assert(!c.disabled&&!c.readonly);assert(c.h>=40)}
  console.log('PASS',label,width,JSON.stringify(m.controls.map(c=>[Math.round(c.w),Math.round(c.h)])))
 }
 for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/__shipment-ui?mode=new');await choose('거래처 A');assert.equal(await field('출고지 우편번호').inputValue(),'12345');assert.equal(await field('출고지 기본주소').inputValue(),'안양 기본주소');await layout('shipment',width)
  await choose('거래처 B');assert.equal(await field('출고지 우편번호').inputValue(),'54321');assert.equal(await field('출고지 기본주소').inputValue(),'부산 기본주소')
  await field('출고지 기본주소').fill('직접 수정 주소');await choose('거래처 C');await page.getByRole('button',{name:'변경 취소',exact:true}).click();assert.equal(await field('출고지 기본주소').inputValue(),'직접 수정 주소');assert.match(await page.getByRole('button',{name:/^매출 거래처 /}).innerText(),/거래처 B/)
  await choose('거래처 C');await page.getByRole('button',{name:'기본 출고지 적용',exact:true}).click();assert.equal(await field('출고지 기본주소').inputValue(),'');assert.equal(await field('출고지 우편번호').inputValue(),'')
  await field('출고지 상세주소').fill('회전 보존');await page.setViewportSize({width:height,height:width});assert.equal(await field('출고지 상세주소').inputValue(),'회전 보존');await page.setViewportSize({width,height})
  await page.goto(origin+'/__shipment-ui?partners');await page.getByRole('button',{name:'거래처 등록',exact:true}).click();await field('기본 출고지 기본주소').fill('선택 입력 주소');await layout('partner',width)
 }
 await page.getByRole('button',{name:'기본 출고지 주소 검색',exact:true}).click();await page.getByRole('button',{name:'격리 주소 선택',exact:true}).click();assert.equal(await field('기본 출고지 우편번호').inputValue(),'45678');assert.equal(await field('기본 출고지 기본주소').inputValue(),'검색 기본주소');await field('기본 출고지 기본주소').fill('선택 입력 주소')
 await field('거래처명').fill('기본주소 거래처');await field('기본 출고지 상세주소').fill('2층');await field('기본 출고지 우편번호').fill('45678')
 async function savePartner(){await page.getByRole('button',{name:'거래처 저장',exact:true}).click();await page.getByRole('alertdialog',{name:'거래처 저장 확인'}).getByRole('button',{name:'확인',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#partner-editor'))}
 await savePartner();assert.equal(writes.at(-1).body.defaultShippingAddress,'선택 입력 주소');assert.equal(writes.at(-1).body.address,null);assert.equal(writes.at(-1).body.defaultShippingPostalCode,'45678')
 await page.getByRole('button',{name:'기본주소 거래처 수정',exact:true}).click();assert.equal(await field('기본 출고지 기본주소').inputValue(),'선택 입력 주소');await field('기본 출고지 기본주소').fill('수정 기본주소');await savePartner();assert.equal(partnerRows[0].defaultShippingAddress,'수정 기본주소')
 data=initial();await page.goto(origin+'/__shipment-ui');await page.getByRole('button',{name:'출고 요청 수정',exact:true}).click();assert.equal(await field('출고지 기본주소').inputValue(),'서울 저장주소')
 assert.equal(await field('출고지 우편번호').inputValue(),'01234');await field('출고지 우편번호').fill('99999');await field('출고지 기본주소').fill('최종 출고지');await field('출고지 상세주소').fill('배송동')
 async function saveShipment(){await page.getByRole('button',{name:'출고 요청 저장',exact:true}).click();await page.getByRole('alertdialog',{name:'출고 저장 확인'}).getByRole('button',{name:'확인',exact:true}).click()}
 failSave=true;await saveShipment();await page.getByText('격리 저장 실패',{exact:true}).waitFor();assert.equal(await field('출고지 기본주소').inputValue(),'최종 출고지');failSave=false;await saveShipment();await page.getByRole('heading',{name:'출고 상세',exact:true}).waitFor()
 assert.equal(writes.at(-1).body.shippingPostalCode,'99999');assert.equal(writes.at(-1).body.shippingAddress,'최종 출고지');assert.equal(writes.at(-1).body.shippingAddressDetail,'배송동');assert.equal(writes.at(-1).body.lines.length,2)
 await page.reload();await page.getByText('[99999] 최종 출고지 배송동',{exact:true}).waitFor();await page.getByRole('button',{name:'출고 요청 수정',exact:true}).click();assert.equal(await field('출고지 기본주소').inputValue(),'최종 출고지')
 assert.deepEqual(errors,[]);console.log('PASS defaults, manual override, confirmation/cancel, empty defaults, rotation, stored snapshot save/reload and editable fields')
}finally{await browser.close()}
