import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',root='/api/tenants/fixture'
const product={id:'p',code:'PACK-01',name:'포장 재고 QA',unit:'EA',isActive:true,version:'v1',images:[],innerPackQuantity:10,outerPackQuantity:5,outerPackUnit:'INNER',palletPackQuantity:20,createdAt:'2026-11-11',updatedAt:'2026-11-11',barcodes:['EA','INNER','OUTER','PALLET'].map((packageCode,i)=>({id:'b'+i,value:'QA-'+packageCode,packageCode,isPrimary:i===0,barcodeType:'External'}))}
let mode='normal',stockRequests=0
const errors=[],unexpected=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.origin!==origin){unexpected.push(u.origin);return route.abort()}
  if(!u.pathname.startsWith('/api/'))return route.continue()
  assert.equal(req.method(),'GET','barcode lookup must never write')
  if(u.pathname==='/api/auth/me')return route.fulfill({json:{user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'격리 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'}})
  if(u.pathname==='/api/health/db')return route.fulfill({json:{status:'connected'}})
  if(u.pathname===root+'/workspace')return route.fulfill({json:{id:'fixture',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{products:['menu','read','create','update'],'stock-overview':['menu','read']}}})
  if(u.pathname===root+'/pages/barcode-lookup')return route.fulfill({json:{}})
  if(u.pathname===root+'/barcodes/lookup')return route.fulfill({json:{kind:'product',item:product,inventoryAvailable:mode!=='denied'}})
  if(u.pathname===root+'/products/p')return route.fulfill({json:{product,canViewCost:false}})
  if(u.pathname===root+'/products/options')return route.fulfill({json:{units:['EA'],categories:[],productTypes:[]}})
  if(u.pathname===root+'/reports/stock-overview'){
   stockRequests++;assert.equal(u.searchParams.get('productId'),'p');assert.equal(u.searchParams.get('view'),'product');assert.equal(u.searchParams.has('warehouseId'),false)
   if(mode==='error')return route.fulfill({status:503,json:{message:'재고 조회 실패'}})
   const row={productId:'p',unit:product.unit,quantity:mode==='zero'?0:1200,reservedQuantity:mode==='zero'?0:100,availableQuantity:mode==='zero'?0:1100}
   const items=mode==='mixed'?[row,{...row,unit:'BOX',quantity:7,reservedQuantity:2,availableQuantity:5}]:[row]
   return route.fulfill({json:{items,total:items.length,page:1,pageSize:20}})
  }
  unexpected.push(u.pathname);return route.fulfill({status:404,json:{message:'Unexpected request'}})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 const scan=async(value)=>{await page.getByRole('textbox',{name:'조회 바코드'}).fill(value);await page.getByRole('button',{name:'조회',exact:true}).click();await page.getByRole('region',{name:'바코드 조회 결과'}).waitFor()}
 const totals=page.getByRole('region',{name:'상품 전체 재고'})
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/app/barcode-lookup');await scan('QA-PALLET')
  await totals.locator('dd').first().waitFor();assert.deepEqual(await totals.locator('dd').allTextContents(),['1,200개','100개','1,100개'])
  assert.match(await page.getByLabel('조회한 바코드 포장 단위').innerText(),/QA-PALLET · 파레트 · 1,000 EA/)
  assert.equal(await page.locator('.barcode-result-heading p').count(),0,'duplicate scanned number removed')
  const positions=await page.evaluate(()=>{
   const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}}
   return {heading:box('.barcode-result-heading'),pack:box('.barcode-package-summary'),image:box('.product-gallery'),stock:box('.barcode-product-stock'),details:box('.product-master-sections'),stockDirect:document.querySelector('.product-gallery').nextElementSibling.classList.contains('barcode-product-stock'),inlineStock:[...document.querySelectorAll('.barcode-stock-totals > div')].every(row=>{const label=row.querySelector('dt').getBoundingClientRect(),value=row.querySelector('dd').getBoundingClientRect();return label.right<=value.left&&label.top<value.bottom&&value.top<label.bottom}),panelPosition:getComputedStyle(document.querySelector('.barcode-label-panel')).position}
  })
  assert(Math.abs(positions.pack.top-positions.heading.bottom-6)<2,'package closer to name')
  assert(Math.abs(positions.image.top-positions.pack.bottom-12)<2,'compact space before image')
  assert.equal(positions.image.height,200,'existing image size unchanged')
  assert(positions.stockDirect&&positions.stock.top>=positions.image.bottom&&positions.stock.bottom<=positions.details.top,'stock directly below image before product details')
  assert(positions.inlineStock,'stock labels and values share one line')
  assert.equal(positions.panelPosition,width>1000?'sticky':'static','sticky only beside product information')
  if(width>1000){
   await page.setViewportSize({width,height:700})
   await page.evaluate(()=>window.scrollTo(0,350));await page.waitForTimeout(100)
   const top=await page.locator('.barcode-label-panel').evaluate(el=>el.getBoundingClientRect().top)
   assert(Math.abs(top-94)<2,'label panel follows scroll below header')
   await page.evaluate(()=>window.scrollTo(0,0))
   await page.setViewportSize({width,height:1000})
  }

  await page.getByRole('group',{name:'등록된 상품 바코드'}).getByRole('button',{name:/QA-INNER/}).click()
  assert.match(await page.getByRole('complementary',{name:'상품 바코드 라벨 및 목록'}).innerText(),/인박스 · 10 EA/)
  assert.match(await page.getByLabel('조회한 바코드 포장 단위').innerText(),/파레트 · 1,000 EA/,'preview does not replace scanned package')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} overflow`)
  console.log(`PASS ${width}px barcode packaging and aggregate stock`)
 }
 mode='zero';await scan('QA-EA');await totals.locator('dd').first().waitFor();assert.deepEqual(await totals.locator('dd').allTextContents(),['0개','0개','0개'])
 mode='error';await scan('QA-OUTER');await totals.getByRole('alert').waitFor();assert.equal(await totals.locator('dd').count(),0)
 mode='normal';await totals.getByRole('button',{name:'다시 조회'}).click();await totals.locator('dd').first().waitFor()
 mode='denied';const before=stockRequests;await scan('QA-EA');await page.getByText('재고 현황 조회 권한이 없습니다.',{exact:true}).waitFor();assert.equal(stockRequests,before);assert.equal(await totals.count(),0)
 mode='mixed';await scan('QA-EA');await totals.locator('dd').nth(5).waitFor();assert.deepEqual(await totals.locator('dd').allTextContents(),['1,200개','100개','1,100개','7BOX','2BOX','5BOX'])
 mode='normal';product.unit='BOX';await scan('QA-EA');await totals.locator('dd').first().waitFor();assert.match(await page.getByLabel('조회한 바코드 포장 단위').innerText(),/1 BOX \(자동 환산 없음\)/);assert.deepEqual(await totals.locator('dd').allTextContents(),['1,200BOX','100BOX','1,100BOX'])
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS empty stock, denied stock without request, errors/retry, legacy/mixed units; all API calls mocked/read-only')
}finally{await browser.close()}
