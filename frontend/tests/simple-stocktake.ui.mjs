import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',endpoint='/api/tenants/fixture/stocktakes',id='12345678-1234-1234-1234-123456789012'
const choice=(id,name,unit=null)=>({id,name,code:id.toUpperCase(),unit,lotManaged:false,expiryManaged:false,serialManaged:false})
const warehouse=choice('w','A창고'), products=[choice('p1','사탕','EA'),choice('p2','밀가루','kg'),choice('p3','시리얼 상품','EA')]
const stock=(id,p,code,qty,extra={})=>({id,stockId:id,stockVersion:'version-'+id,productId:p.id,productName:p.name,productCode:p.code,warehouseId:'w',warehouseName:'A창고',locationId:code,locationCode:code,rackCode:'RACK-'+code,unit:p.unit,baselineQuantity:qty,baselineReserved:0,...extra})
const stocks=[stock('s1',products[0],'A01',20),stock('s2',products[1],'B01',50,{lotNumber:'LOT-A'}),stock('s3',products[1],'B02',10,{lotNumber:'LOT-B'}),stock('s4',products[2],'C01',1,{serialNumber:'SERIAL-1'})]
let documents=[],writes=[],requests=[],failConfirm=false
const errors=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:Number(process.env.WMS_WORK_WIDTH||1440),height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),q=url.searchParams,path=url.pathname
  if(url.origin!==origin)throw Error('Unexpected external request: '+request.url())
  if(path==='/__stocktake-ui')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/stocktake-ui.tsx"></script></html>'})
  if(!path.startsWith('/api/'))return route.continue()
  const json=value=>route.fulfill({json:value});requests.push({path,query:Object.fromEntries(q)})
  if(path==='/api/auth/csrf')return json({token:'fixture'})
  if(request.method()==='GET'){
   if(path===endpoint+'/choices'){
    if(q.get('kind')==='product-options')return json({categories:[],productTypes:[]})
    let items=q.get('kind')==='product-table'?products:[warehouse]
    const search=(q.get('search')||'').toLowerCase(),ids=q.getAll('ids')
    items=items.filter(p=>(!ids.length||ids.includes(p.id))&&[p.name,p.code,'BAR-'+p.id].join(' ').toLowerCase().includes(search))
    return json({items,total:items.length,page:1,pageSize:20})
   }
   if(path===endpoint+'/candidates'){
    assert.ok(q.get('productId'),'simple registration must query selected product only')
    const term=(q.get('search')||'').toLowerCase()
    const items=stocks.filter(s=>s.productId===q.get('productId')&&[s.rackCode,s.locationCode,s.lotNumber,s.serialNumber].filter(Boolean).join(' ').toLowerCase().includes(term))
    return json({items,total:items.length,page:1,pageSize:20})
   }
   if(path===endpoint)return json({items:documents.map(d=>({...d,productCount:1,targetCount:d.summary.total,differenceCount:d.summary.differences})),total:documents.length,page:1})
   if(path.endsWith('/items'))return json({items:documents.at(-1)?.selectedItems || [],total:documents.at(-1)?.selectedItems.length || 0,page:1})
   if(path.endsWith('/history'))return json({items:[],total:0,page:1})
   if(path===endpoint+'/'+id)return json(documents.at(-1))
  }
  const body=request.postDataJSON();writes.push({path,body})
  function selected(input,index,previous){const st=stocks.find(s=>s.id===input.stockId);return {...st,...previous,id:previous?.id || 'target-'+index,baselineVersion:st.stockVersion,countedQuantity:input.quantity,observedSerial:input.observedSerial,reason:input.reason,originalQuantity:st.baselineQuantity,originalReserved:st.baselineReserved,originalSnapshotAt:new Date().toISOString(),baselineAt:new Date().toISOString(),excluded:false}}
  function summarize(d){const rows=d.selectedItems,missing=rows.filter(r=>r.countedQuantity===null).length,shortages=rows.filter(r=>r.countedQuantity!==null&&r.countedQuantity<r.baselineQuantity).length,excesses=rows.filter(r=>r.countedQuantity!==null&&r.countedQuantity>r.baselineQuantity).length;d.summary={total:rows.length,counted:rows.length-missing,missing,differences:shortages+excesses,shortages,excesses,matches:rows.length-missing-shortages-excesses}}
  if(path===endpoint){
   const d={document:{...body,id,number:'CT-QA',version:'v1',warehouseName:'A창고',status:'Counting',scopeLabel:'선택 상품 실사',createdAt:new Date().toISOString(),snapshotAt:new Date().toISOString()},selectedItems:body.selection.map((input,i)=>selected(input,i)),conflicts:[],incoming:false};summarize(d)
   documents.push(d);return route.fulfill({status:201,json:d})
  }
  if(path.endsWith('/draft')){const d=documents.at(-1);assert.equal(body.version,d.document.version);d.selectedItems=body.items.map((item,i)=>selected(item.selection,i,item.targetId?d.selectedItems.find(t=>t.id===item.targetId):undefined));Object.assign(d.document,{contactName:body.contactName,notes:body.notes,basisAt:body.basisAt,version:'v'+writes.length});summarize(d);return json(d)}
  if(path.endsWith('/confirm-selected')){
   if(failConfirm)return route.fulfill({status:409,json:{message:'기준 이후 재고가 변경되었습니다.'}})
   const d=documents.at(-1);d.document.status='Confirmed';d.document.confirmedAt=new Date().toISOString();return json(d)
  }
  throw Error('Unexpected API '+request.method()+' '+path)
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 async function start(){documents=[];writes=[];requests=[];failConfirm=false;await page.goto(origin+'/__stocktake-ui');await page.getByRole('button',{name:'실사 등록',exact:true}).click();try{await page.getByRole('button',{name:'+ 상품 추가',exact:true}).waitFor({state:'visible',timeout:5000})}catch(e){throw Error(e.message+' '+JSON.stringify(errors)+' '+await page.locator('body').innerText())}}
 async function add(ids){const button=page.getByRole('button',{name:'+ 상품 추가',exact:true});await button.click();const dialog=page.getByRole('dialog',{name:'상품 추가',exact:true});assert.equal(await dialog.locator('input[type=number]').count(),0);for(const id of ids)await dialog.getByRole('checkbox',{name:id.toUpperCase()+' 선택',exact:true}).check();await dialog.getByRole('button',{name:'선택 상품 추가',exact:true}).click();await dialog.waitFor({state:'hidden'})}
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});await start();assert.match(await page.getByRole('button',{name:/^실사 담당자 /}).innerText(),/실사 담당자 QA/);assert.equal(await page.getByLabel('실사 방식',{exact:true}).count(),0)
  await add(['p1']);await page.getByLabel('실제 수량 1',{exact:true}).fill('0');await page.getByText('20 EA 부족 (-20)',{exact:true}).waitFor();assert.equal(writes.length,0)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'page overflow '+width)
  console.log('PASS '+width+'px: independent registration page, single product/location, zero quantity and no page overflow')
 }
 await page.setViewportSize({width:Number(process.env.WMS_WORK_WIDTH||1440),height:1000});await start();await add(['p1']);await page.getByLabel('실제 수량 1',{exact:true}).fill('18')
 await page.getByRole('button',{name:'실사 저장',exact:true}).click();await page.getByText('CT-QA',{exact:true}).waitFor();await page.getByRole('button',{name:'+ 상품 추가',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'재고 실사',exact:true}).count(),1);assert.equal(await page.locator('progress').count(),0);assert.equal(await page.getByLabel('실제 수량 1',{exact:true}).inputValue(),'18');assert.ok(page.url().includes(id));assert.equal(documents.length,1)
 await add(['p2']);await page.getByRole('button',{name:'실사 확정',exact:true}).click();await page.getByText('각 상품의 보관 위치·추적 재고를 선택하세요.',{exact:true}).waitFor()
 async function position(index,code){await page.getByRole('button',{name:new RegExp('보관 위치 '+index)}).click();await page.getByRole('combobox',{name:'보관 위치 '+index+' 검색'}).fill(code);await page.getByRole('option').filter({hasText:code}).click()}
 await position(2,'B01');await page.getByLabel('실제 수량 2',{exact:true}).fill('52');await page.getByText('2 kg 초과 (+2)',{exact:true}).waitFor();await page.getByRole('button',{name:'실사 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'실사를 저장했습니다.'}).waitFor();assert.equal(documents[0].selectedItems.length,2);assert.equal(documents[0].selectedItems[0].countedQuantity,18)
 await page.reload();await page.getByLabel('실제 수량 2',{exact:true}).waitFor();assert.equal(await page.getByLabel('실제 수량 1',{exact:true}).inputValue(),'18');assert.equal(await page.getByLabel('실제 수량 2',{exact:true}).inputValue(),'52');assert.equal(await page.getByRole('button',{name:'실사 시작',exact:true}).count(),0)
 await add(['p3']);await page.getByLabel('실제 수량 3',{exact:true}).fill('1');await page.getByRole('button',{name:'실사 저장',exact:true}).click();assert.equal(documents[0].selectedItems.length,2);await page.getByRole('checkbox',{name:'시리얼 확인 3'}).check();await page.getByRole('button',{name:'실사 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'실사를 저장했습니다.'}).waitFor();assert.equal(documents[0].selectedItems.length,3);assert.equal(documents.length,1)
 await page.getByRole('button',{name:'위치 추가 2',exact:true}).click();await position(4,'B01');await page.getByText('이미 추가한 위치·LOT·시리얼 재고입니다. 기존 행에서 수량을 수정하세요.',{exact:true}).waitFor();await position(4,'B02');await page.getByLabel('실제 수량 4',{exact:true}).fill('9');await page.getByRole('button',{name:'상품 행 제거 4',exact:true}).click()
 await page.getByRole('button',{name:'상품 행 제거 3',exact:true}).click();await page.getByRole('button',{name:'실사 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'실사를 저장했습니다.'}).waitFor();assert.equal(documents[0].selectedItems.length,2)
 await page.getByLabel('실제 수량 1',{exact:true}).fill('0');await page.getByRole('button',{name:'실사 확정',exact:true}).click();failConfirm=true;await page.getByRole('dialog',{name:'실사 확정',exact:true}).getByRole('button',{name:'실사 확정',exact:true}).click();await page.getByRole('alert').filter({hasText:'기준 이후 재고가 변경되었습니다.'}).waitFor();assert.equal(documents[0].document.status,'Counting');assert.equal(documents[0].selectedItems[0].countedQuantity,0);assert.equal(await page.getByLabel('실제 수량 1',{exact:true}).inputValue(),'0')
 failConfirm=false;await page.getByRole('button',{name:'실사 확정',exact:true}).click();await page.getByRole('dialog',{name:'실사 확정',exact:true}).getByRole('button',{name:'실사 확정',exact:true}).click();await page.getByRole('heading',{name:'재고 실사/조사 상세'}).waitFor();assert.equal(documents[0].document.status,'Confirmed');assert.equal(writes.filter(w=>w.path===endpoint).length,1);for(const name of ['실사 저장','실사 확정','+ 상품 추가'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);assert.equal(await page.locator('progress').count(),0)
 await page.reload();await page.getByRole('heading',{name:'재고 실사/조사 상세'}).waitFor();assert.equal(await page.getByLabel('실제 수량 1',{exact:true}).count(),0)
 await page.getByRole('button',{name:'목록으로 돌아가기',exact:true}).click();await page.getByRole('button',{name:'실사 등록',exact:true}).click();assert.equal(await page.getByLabel('실제 수량 1',{exact:true}).count(),0)
 await start();await add(['p1']);await page.getByRole('button',{name:'실사 확정',exact:true}).click();await page.getByText('실제로 확인한 최종 수량을 입력하세요.',{exact:true}).waitFor();assert.equal(writes.length,0)
 await page.getByRole('button',{name:'실사 저장',exact:true}).click();await page.getByText('CT-QA',{exact:true}).waitFor();assert.equal(documents[0].selectedItems[0].countedQuantity,null)
 await start();await add(['p1']);await page.getByLabel('실제 수량 1',{exact:true}).fill('18');failConfirm=true;await page.getByRole('button',{name:'실사 확정',exact:true}).click();await page.getByRole('dialog',{name:'실사 확정',exact:true}).getByRole('button',{name:'실사 확정',exact:true}).click();await page.getByRole('alert').filter({hasText:'기준 이후 재고가 변경되었습니다.'}).waitFor();assert.equal(await page.getByLabel('실제 수량 1',{exact:true}).inputValue(),'18');assert.ok(page.url().includes(id));assert.equal(documents.length,1)
 await page.goto(origin+'/__stocktake-ui?readonly');assert.equal(await page.getByRole('button',{name:'실사 등록',exact:true}).count(),0)
 assert.deepEqual(errors,[])
 console.log('PASS repeated A/B/C saves, stable document and URL, refresh/resume, missing versus zero, serial validation, duplicate location prevention, row removal, unsaved final save, conflict retry and read-only confirmation; all business APIs mocked')
}finally{await browser.close()}
