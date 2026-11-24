import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',root='/api/tenants/fixture'
const product={id:'11111111-1111-4111-8111-111111111111',code:'PR06',name:'가나디 무드등 가습기',unit:'EA',isActive:true,version:'v1',images:[],innerPackQuantity:10,outerPackQuantity:5,outerPackUnit:'INNER',palletPackQuantity:20,createdAt:'2026-11-11',updatedAt:'2026-11-11',barcodes:['EA','INNER','OUTER','PALLET'].map((packageCode,i)=>({id:'b'+i,value:'QA-'+packageCode,packageCode,isPrimary:i===0,barcodeType:'External'}))}
let mode='normal',stockRequests=0,writes=0
const errors=[],unexpected=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.origin!==origin){unexpected.push(u.origin);return route.abort()}
  if(!u.pathname.startsWith('/api/'))return route.continue()
  if(u.pathname==='/api/auth/csrf')return route.fulfill({json:{token:'fixture'}})
  if(req.method()==='POST'&&u.pathname===root+'/products/'+product.id){
   const body=req.postDataJSON();assert.equal(body.code,'PR10');assert.equal(body.name,product.name);assert.equal(body.barcodes.length,4);assert(body.barcodes.every(b=>!b.change||b.change.mode==='keep'))
   product.code=body.code;product.version='v'+(++writes+1);return route.fulfill({json:product})
  }
  assert.equal(req.method(),'GET','unexpected write')
  if(u.pathname==='/api/auth/me')return route.fulfill({json:{user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'격리 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'}})
  if(u.pathname==='/api/health/db')return route.fulfill({json:{status:'connected'}})
  if(u.pathname===root+'/workspace')return route.fulfill({json:{id:'fixture',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{products:mode==='readonly'?['menu','read']:['menu','read','create','update'],'stock-overview':['menu','read']}}})
  if(u.pathname===root+'/pages/barcode-lookup'||u.pathname===root+'/pages/products')return route.fulfill({json:{}})
  if(u.pathname===root+'/barcodes/lookup')return route.fulfill({json:{kind:'product',item:{...product,code:'PR06'},inventoryAvailable:mode!=='denied'}})
  if(u.pathname===root+'/products/11111111-1111-4111-8111-111111111111')return route.fulfill({json:{product,canViewCost:false}})
  if(u.pathname.endsWith('/barcodes/check'))return route.fulfill({json:{available:true}})
  if(u.pathname===root+'/products')return route.fulfill({json:{items:u.searchParams.get('search')==='PR06'?[]:[{product}],total:u.searchParams.get('search')==='PR06'?0:1,page:1,pageSize:20}})
  if(u.pathname===root+'/products/options')return route.fulfill({json:{units:['EA'],categories:[],productTypes:[]}})
  if(u.pathname===root+'/reports/stock-overview'){
   stockRequests++;assert.equal(u.searchParams.get('productId'),product.id);assert.equal(u.searchParams.get('view'),'product');assert.equal(u.searchParams.has('warehouseId'),false)
   if(mode==='error')return route.fulfill({status:503,json:{message:'재고 조회 실패'}})
   const row={productId:'p',unit:product.unit,quantity:mode==='zero'?0:1200,reservedQuantity:mode==='zero'?0:100,availableQuantity:mode==='zero'?0:1100}
   const items=mode==='mixed'?[row,{...row,unit:'BOX',quantity:7,reservedQuantity:2,availableQuantity:5}]:[row]
   return route.fulfill({json:{items,total:items.length,page:1,pageSize:20}})
  }
  unexpected.push(u.pathname);return route.fulfill({status:404,json:{message:'Unexpected request'}})
 })
 await context.addInitScript(()=>{
  window.qaPrint={count:0,cancel:true};
  window.print=()=>{
   const host=window.top!==window?window.top:window;
   host.qaPrint.count++;
   if(host.qaPrint.cancel)window.dispatchEvent(new Event('afterprint'));
  };
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());page.setDefaultTimeout(10000)
 async function verifyLabel(doc, expected=product.name+' · '+product.code, title=expected){
  assert.equal(await doc.title(),title)
  assert.equal(await doc.locator('.caption').textContent(),expected)
  const layout=await doc.evaluate(()=>{const label=document.querySelector('.label').getBoundingClientRect(),caption=document.querySelector('.caption-text').getBoundingClientRect(),svg=document.querySelector('svg').getBoundingClientRect();return {label:label.toJSON(),caption:caption.toJSON(),svg:svg.toJSON(),value:document.querySelector('svg text').textContent}})
  assert(layout.caption.x>=layout.label.x&&layout.caption.right<=layout.label.right+1)
  assert(layout.caption.y>=layout.label.y+3*96/25.4-1,'full caption fits above barcode inside padding')
  assert(layout.caption.bottom<layout.svg.y,'caption does not overlap barcode')
  assert.equal(Math.round(layout.svg.height),Math.round(32*96/25.4))
  assert(product.barcodes.some(b=>b.value===layout.value),'selected barcode unchanged')
 }
 const snapshot=()=>page.evaluate(()=>({url:location.href,title:document.title,history:history.length,fields:[...document.querySelectorAll('input,select,textarea')].map(e=>e.value),label:document.querySelector('.rack-barcode-label')?.textContent}))
 for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  product.code='PR06';await page.setViewportSize({width,height});await page.goto(origin+'/app/products/'+product.id)
  const code=page.getByRole('textbox',{name:'상품코드',exact:true});await code.fill('PR10');await page.waitForFunction(()=>document.querySelector('#product-registration')?.checkValidity());await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();await page.getByRole('button',{name:'확인',exact:true}).click();await page.getByText('변경사항을 저장했습니다.',{exact:true}).waitFor();assert.equal(await code.inputValue(),'PR10')
  await page.reload();await code.waitFor();assert.equal(await code.inputValue(),'PR10')
  await page.goto(origin+'/app/products?search=PR10');await page.getByRole('button',{name:product.name+' 상세',exact:true}).filter({visible:true}).waitFor();assert.match(await page.locator(width<=600?'.products-mobile-list':'.products-desktop-list').innerText(),/PR10/)
  await page.goto(origin+'/app/barcode-lookup');await page.getByRole('textbox',{name:'조회 바코드'}).fill('QA-EA');await page.getByRole('button',{name:'조회',exact:true}).click();await page.getByRole('region',{name:'바코드 조회 결과'}).waitFor()
  assert.match(await page.locator('.barcode-result-heading h2').innerText(),/PR10/);assert.doesNotMatch(await page.locator('.barcode-result-heading h2').innerText(),/PR06/)
  const mainTitle=await page.title();const print=page.getByRole('button',{name:'라벨 인쇄',exact:true}).first();await page.evaluate(()=>window.qaPrint.cancel=false)
  if(width<=1024){await print.click();await page.waitForFunction(()=>window.qaPrint.count===1);const frame=page.frames().find(f=>f!==page.mainFrame());assert(frame);await verifyLabel(frame);await frame.evaluate(()=>window.dispatchEvent(new Event('afterprint')))}
  else{const event=context.waitForEvent('page');await print.click();const popup=await event;await popup.waitForFunction(()=>window.qaPrint.count===1);await verifyLabel(popup);await popup.close()}
  assert.equal(await page.title(),mainTitle);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  console.log(`PASS ${width}x${height}: mocked PR06 → PR10 save, detail/reload/list, latest lookup heading, print title/caption; barcode unchanged`)
 }
 assert.equal(writes,10);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
}finally{await browser.close()}
