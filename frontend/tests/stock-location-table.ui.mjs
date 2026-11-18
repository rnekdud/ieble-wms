import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',root='/api/tenants/fixture',endpoint=root+'/reports/stock-overview'
const base={productId:'p0',productCode:'P000',productName:'상품 0',barcode:'BAR-0',categoryId:'c1',categoryName:'식품',warehouseId:'w1',warehouseName:'같은 창고명',zoneId:'z1',zoneName:'보관구역 A',rackId:'r1',rackCode:'R-01',rackName:'같은 랙명',locationId:'l1',locationCode:'BIN-01',locationName:'1단 1칸',lotNumber:'LOT-0',expiryDate:'2028-05-10',serialNumber:null,unit:'EA',quantity:100,reservedQuantity:10,availableQuantity:90,globalAvailableQuantity:100,safetyStock:null,safetyComparable:true,isLow:false,isActive:true,hasExpired:false,hasExpiring:false,statuses:['정상']}
const rows=Array.from({length:23},(_,i)=>({...base,productId:'p'+i,productCode:'P'+String(i).padStart(3,'0'),productName:'상품 '+i,barcode:'BAR-'+i,lotNumber:'LOT-'+i,serialNumber:i===22?'SN-22':null,categoryId:i%2?'c2':'c1'}))
rows.push({...base,productId:'p23',productCode:'P023',locationId:'l2',locationCode:'BIN-02',locationName:'1단 2칸'},...['p24','p25'].map(productId=>({...base,productId,productCode:productId.toUpperCase(),rackId:'r2',locationId:'l3'})),...['p26','p27'].map(productId=>({...base,productId,productCode:productId.toUpperCase(),warehouseId:'w2',zoneId:'z2',rackId:'r3',locationId:'l4'})),...['p28','p29'].map(productId=>({...base,productId,productCode:productId.toUpperCase(),warehouseId:'w2',zoneId:null,zoneName:null,rackId:null,rackCode:null,rackName:null,locationId:null,locationCode:null,locationName:null})))
const requests=[],unexpected=[],errors=[];let lastDetail
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),path=u.pathname,q=u.searchParams,json=value=>route.fulfill({json:value})
  if(u.origin!==origin){unexpected.push(req.url());return route.abort()}
  if(!path.startsWith('/api/'))return route.continue()
  assert.equal(req.method(),'GET','stock overview is read-only')
  if(path==='/api/auth/me')return json({user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'격리 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'})
  if(path==='/api/health/db')return json({status:'connected'})
  if(path===root+'/workspace')return json({id:'fixture',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{'stock-overview':['menu','read']}})
  if(path===root+'/pages/stock-overview')return json({})
  if(path===endpoint+'/choices'){
   const kind=q.get('kind'),term=(q.get('search')||'').toLowerCase()
   const items=(kind==='warehouses'?[{id:'w1',code:'WH-1',name:'같은 창고명'},{id:'w2',code:'WH-2',name:'같은 창고명'}]:kind==='categories'?[{id:'c1',code:'C1',name:'식품'},{id:'c2',code:'C2',name:'기타'}]:[]).filter(r=>(r.name+r.code).toLowerCase().includes(term))
   return json({items,total:items.length,page:1})
  }
  if(path.startsWith(endpoint+'/products/')){
   lastDetail=Object.fromEntries(q);const item=rows.find(r=>r.productId===path.split('/').at(-1))
   return json({product:{id:item.productId,code:item.productCode,name:item.productName,barcode:item.barcode,unit:item.unit,safetyStock:null,isActive:true,lotManaged:true,expiryManaged:true,serialManaged:false},items:[item],total:1,page:1,pageSize:20,recentReceipts:[],recentShipments:[],recentChanges:[]})
  }
  if(path===endpoint||path===endpoint+'/warehouse-summary'){
   requests.push(Object.fromEntries(q));const view=q.get('view'),term=(q.get('search')||'').toLowerCase(),page=Number(q.get('page')||1),pageSize=Number(q.get('pageSize')||20)
   assert([20,50,100].includes(pageSize))
   let items=rows.filter(r=>(!q.get('warehouseId')||q.get('warehouseId')===r.warehouseId)&&(!q.get('categoryId')||q.get('categoryId')===r.categoryId)&&(!term||[r.productName,r.productCode,r.barcode,r.lotNumber,r.serialNumber].some(v=>v?.toLowerCase().includes(term))))
   if(view==='product')items=[{...base,warehouseId:null,warehouseName:null,zoneId:null,rackId:null,locationId:null}]
   if(path.endsWith('/warehouse-summary'))items=[{warehouseId:'w1',warehouseName:'같은 창고명',productCount:26,quantities:[{unit:'EA',quantity:2600,reservedQuantity:260,availableQuantity:2340}]}]
   return json({items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pageSize,summary:{registeredProducts:30,matchingProducts:items.length,holdingProducts:items.length,lowProducts:0,reservedProducts:items.length},asOf:'2026-11-11T00:00:00Z',today:'2026-11-11',timeZone:'Asia/Seoul',expirySoonDays:30,maxExportRows:20000})
  }
  unexpected.push(path);return route.fulfill({status:404,json:{message:'Unexpected API'}})
 })
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/app/reports/stock');await page.getByRole('button',{name:'보관 위치별 재고',exact:true}).click()
 const table=page.locator('.overview-location-groups'),pager=page.getByRole('navigation',{name:'재고 현황 페이지'}),search=page.getByRole('textbox',{name:'재고 현황 검색'})
 await table.locator('tbody tr').nth(19).waitFor()
 assert.deepEqual((await table.locator('thead th').allTextContents()).slice(0,7),['창고','구역 / 랙','보관위치','상품 정보','현재고','예약 수량','가용 재고'])
 assert.deepEqual(await table.locator('tbody tr').first().locator('td[rowspan]').evaluateAll(els=>els.map(e=>e.rowSpan)),[20,20,20])
 await pager.getByRole('button',{name:'2페이지',exact:true}).click();await page.getByText('총 30건 · 21–30건 표시',{exact:true}).waitFor()
 assert.equal(await table.locator('tbody tr').count(),10)
 assert.deepEqual(await table.locator('tbody tr').first().locator('td[rowspan]').evaluateAll(els=>els.map(e=>e.rowSpan)),[6,4,3])
 await page.getByRole('combobox',{name:'페이지당 표시 건수'}).selectOption('50');await page.getByText('총 30건 · 1–30건 표시',{exact:true}).waitFor()
 assert.equal(await table.locator('tbody tr').count(),30);assert.equal(await table.locator('.overview-warehouse-cell').count(),2)
 assert.deepEqual(await table.locator('.overview-location-cell').evaluateAll(els=>els.filter(e=>e.textContent.includes('BIN-01')).map(e=>e.rowSpan)),[23,2,2])
 assert.equal(await table.getByText('미배치',{exact:true}).count(),2)
 // Resolve HTML row spans into logical columns; no overlap, hole, or cross-page span is permitted.
 const matrix=await table.evaluate(t=>{const occupied=[],out=[];for(const [ri,tr] of [...t.tBodies[0].rows].entries()){occupied[ri]??=[];let ci=0;for(const cell of tr.cells){while(occupied[ri][ci])ci++;for(let j=ri;j<ri+cell.rowSpan;j++){occupied[j]??=[];if(occupied[j][ci])throw Error('overlapping rowSpan');occupied[j][ci]=cell.textContent}ci++}out.push(occupied[ri])}return out})
 assert.equal(matrix.length,30);assert(matrix.every(r=>r.length===15&&r.every(v=>v!==undefined)));assert(matrix.every(r=>r[4]==='100'&&r[5]==='10'&&r[6]==='90'))
 await table.getByRole('button',{name:/P000 .* 상세/}).click();const dialog=page.getByRole('dialog',{name:'재고 현황 상세',exact:true});await dialog.getByText('LOT-0',{exact:true}).waitFor();assert.equal(lastDetail.locationId,'l1');assert.equal(lastDetail.trace,'true');assert.equal(lastDetail.lotExact,'LOT-0');await dialog.getByRole('button',{name:'닫기',exact:true}).click()
 const choose=async(label,text)=>{await page.getByRole('button',{name:new RegExp('^'+label+' ')}).click();await page.getByRole('combobox',{name:label+' 검색',exact:true}).fill(text);await page.getByRole('option').filter({hasText:text}).first().click()}
 await choose('조회 창고','WH-2');await page.getByRole('button',{name:'검색',exact:true}).click();await page.getByText('총 4건 · 1–4건 표시',{exact:true}).waitFor();assert.equal(requests.at(-1).warehouseId,'w2');assert.equal(await table.locator('.overview-warehouse-cell').count(),1)
 await choose('상품 분류','식품');await page.getByRole('button',{name:'검색',exact:true}).click();await page.getByText('총 4건 · 1–4건 표시',{exact:true}).waitFor()
 await page.getByRole('button',{name:'초기화',exact:true}).click();await page.getByRole('dialog',{name:'필터 초기화',exact:true}).getByRole('button',{name:'초기화',exact:true}).click();await page.getByRole('combobox',{name:'페이지당 표시 건수'}).selectOption('50');await search.fill('SN-22');await page.getByRole('button',{name:'검색',exact:true}).click();await page.getByText('총 1건 · 1–1건 표시',{exact:true}).waitFor();assert.equal(await table.getByText('SN-22',{exact:true}).count(),1);assert.equal(await table.locator('td[rowspan="1"]').count(),3);assert.equal(requests.at(-1).page,'1')
 await search.fill('없음');await page.getByRole('button',{name:'검색',exact:true}).click();await table.getByText('조회된 재고가 없습니다',{exact:true}).waitFor();assert.equal(await table.locator('tbody td').getAttribute('colspan'),'15')
 await search.fill('');await page.getByRole('button',{name:'검색',exact:true}).click();await table.locator('tbody tr').nth(29).waitFor()
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});if(width<760&&await page.getByRole('button',{name:'사이드바 닫기',exact:true}).isVisible())await page.getByRole('button',{name:'사이드바 닫기',exact:true}).click()
  if(width<=1024) await page.locator('.mobile-stock-list').waitFor(); else await table.waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} page overflow`)
  assert(await table.locator('.overview-location-cell').evaluateAll(els=>els.every(e=>getComputedStyle(e).verticalAlign==='top')))
  assert(await table.locator('td.quantity').evaluateAll(els=>els.every(e=>getComputedStyle(e).textAlign==='right')))
  assert(await table.locator('td:first-child').evaluateAll(els=>els.every(e=>getComputedStyle(e).position==='static')))
 }
 await page.setViewportSize({width:1440,height:1000})
 if(process.env.UI_VISUAL)console.log('VISUAL:'+ (await page.locator('.overview-scroll').screenshot({type:'jpeg',quality:45})).toString('base64'))
 await page.getByRole('button',{name:'상품별 재고',exact:true}).click();await page.locator('.overview-table:not(.overview-location)').waitFor();assert.equal(await page.locator('.overview-table thead th').first().innerText(),'상품코드 / 상품명');assert.equal(await page.locator('.overview-location-groups').count(),0)
 await page.getByRole('button',{name:'창고별 재고',exact:true}).click();await page.getByText('2,600개',{exact:true}).waitFor();assert.equal(await page.locator('.overview-location-groups').count(),0)
 for (const width of [360,390,430,768,1440]) {
  await page.setViewportSize({width,height:1000})
  assert.equal(await page.getByRole('button',{name:'필터 초기화',exact:true}).count(),0)
  const toggle=page.getByRole('button',{name:'상세 필터',exact:true}),advanced=page.locator('#overview-advanced')
  if(width<=1024) {
   await toggle.waitFor({state:'visible'})
   assert.equal(await toggle.getAttribute('aria-expanded'),'false')
   assert.equal(await advanced.isVisible(),false)
   await toggle.click();assert.equal(await advanced.isVisible(),true)
   await choose('조회 창고','WH-2')
   assert.equal(await advanced.getByRole('button',{name:/^조회 위치 /}).isVisible(),true)
   if(width===390 && process.env.STOCK_VISUAL) { await advanced.scrollIntoViewIfNeeded();console.log('IMAGE:'+(await page.screenshot({type:'jpeg',quality:55})).toString('base64')) }
   await toggle.click();assert.equal(await advanced.isVisible(),false)
   await Promise.all([page.waitForResponse(r=>r.url().includes('/warehouse-summary?')&&new URL(r.url()).searchParams.get('warehouseId')==='w2'),page.getByRole('button',{name:'검색',exact:true}).click()])
   await toggle.click();assert.match(await advanced.innerText(),/같은 창고명/)
   await page.getByRole('button',{name:'초기화',exact:true}).click()
   await page.getByRole('dialog',{name:'필터 초기화',exact:true}).getByRole('button',{name:'초기화',exact:true}).click()
   await page.waitForFunction(()=>!document.querySelector('#overview-advanced').textContent.includes('같은 창고명'))
   await toggle.click()
  } else {await toggle.waitFor({state:'detached'});assert.equal(await toggle.count(),0);assert.equal(await advanced.isVisible(),true)}
  for (const view of ['상품별 재고','보관 위치별 재고','창고별 재고']) {
   await page.getByRole('button',{name:view,exact:true}).click()
   const list=page.locator('.stock-overview > .products-card > .mobile-stock-list')
   if(width<=1024) {
    await list.locator('article').first().waitFor()
    const metrics=await list.locator('article').first().evaluate(el=>({padding:getComputedStyle(el).padding,border:getComputedStyle(el).borderTopWidth,radius:getComputedStyle(el).borderRadius,gap:getComputedStyle(el.parentElement).gap}))
    assert.deepEqual(metrics,{padding:'16px',border:'1px',radius:'12px',gap:'12px'})
    const summary=page.locator('.overview-summary')
    assert.equal(await summary.locator('p:visible').count(),0)
    assert.equal(await summary.locator('strong').count(),4)
    assert(await summary.locator(':scope > div').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height<95)))
    assert.deepEqual(await list.locator('article').first().locator('dd').allTextContents(),view==='창고별 재고'?['2,600개','260개','2,340개']:['100 EA','10 EA','90 EA','미설정'])
    if(view==='창고별 재고') {
     await list.getByRole('button',{name:'같은 창고명 상품별 재고'}).click()
     const detail=page.getByRole('dialog',{name:'같은 창고명 · 상품별 재고',exact:true})
     await detail.getByRole('heading',{name:'상품 0',exact:true}).first().waitFor()
     await detail.getByRole('button',{name:'닫기',exact:true}).click()
    }
   } else {
    await page.locator('.stock-overview > .products-card > .table-scroll table').waitFor()
    assert.equal(await list.count(),0)
    assert.equal(await page.locator('.overview-summary p:visible').count(),4)
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} ${view} overflow`)
  }
  if(width===390 && process.env.STOCK_VISUAL) { await page.locator('.overview-summary').scrollIntoViewIfNeeded(); console.log('IMAGE:'+(await page.screenshot({type:'jpeg',quality:55})).toString('base64')); await page.locator('.mobile-stock-list').scrollIntoViewIfNeeded(); console.log('IMAGE:'+(await page.screenshot({type:'jpeg',quality:55})).toString('base64')) }
  console.log(`PASS stock cards/summary/detail/desktop: ${width}px`)
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS hierarchy columns/rowSpan, page boundaries, identical names/different IDs, unplaced rows, exact quantities, detail/trace, filters/search/empty state, unchanged product/warehouse views and five responsive widths. APIs mocked/read-only.')
}finally{await browser.close()}
