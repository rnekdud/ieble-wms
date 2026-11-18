import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',root='/api/tenants/fixture'
const product={id:'11111111-1111-4111-8111-111111111111',code:'PR06',name:'가나디 무드등 가습기',unit:'EA',isActive:true,version:'v1',images:[],innerPackQuantity:10,outerPackQuantity:5,outerPackUnit:'INNER',palletPackQuantity:20,createdAt:'2026-11-11',updatedAt:'2026-11-11',barcodes:['EA','INNER','OUTER','PALLET'].map((packageCode,i)=>({id:'b'+i,value:'QA-'+packageCode,packageCode,isPrimary:i===0,barcodeType:'External'}))}
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
  if(u.pathname===root+'/workspace')return route.fulfill({json:{id:'fixture',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{products:mode==='readonly'?['menu','read']:['menu','read','create','update'],'stock-overview':['menu','read']}}})
  if(u.pathname===root+'/pages/barcode-lookup'||u.pathname===root+'/pages/products')return route.fulfill({json:{}})
  if(u.pathname===root+'/barcodes/lookup')return route.fulfill({json:{kind:'product',item:product,inventoryAvailable:mode!=='denied'}})
  if(u.pathname===root+'/products/11111111-1111-4111-8111-111111111111')return route.fulfill({json:{product,canViewCost:false}})
  if(u.pathname.endsWith('/barcodes/check'))return route.fulfill({json:{available:true}})
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
 for(const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height})
  for(const source of ['product','barcode']){
   await page.goto(origin+(source==='product'?'/app/products/'+product.id:'/app/barcode-lookup'))
   if(source==='barcode'){
    await page.getByRole('textbox',{name:'조회 바코드'}).fill('QA-PALLET');await page.getByRole('button',{name:'조회',exact:true}).click();await page.getByRole('region',{name:'바코드 조회 결과'}).waitFor()
   }else await page.getByRole('textbox',{name:'상품명',exact:true}).waitFor()
   const button=page.getByRole('button',{name:'라벨 인쇄',exact:true}).first();await button.waitFor()
   await page.getByLabel('라벨 크기',{exact:true}).first().selectOption('100')
   await page.evaluate(()=>window.qaRoot=document.getElementById('root'))
   const before=await snapshot()
   if(width<=1024){
    for(let n=1;n<=2;n++){
     await button.click();await page.waitForFunction(n=>window.qaPrint.count===n,n)
     await page.waitForFunction(()=>!document.querySelector('iframe[title="바코드 라벨 인쇄 문서"]'))
     assert.deepEqual(await snapshot(),before,'cancel/reprint preserves origin and form '+source+' '+width)
    }
    await page.evaluate(()=>window.qaPrint.cancel=false)
    await button.click();await page.waitForFunction(()=>window.qaPrint.count===3)
    const frame=page.frames().find(f=>f!==page.mainFrame());assert(frame)
    await verifyLabel(frame);assert.equal(await frame.locator('svg').count(),1);assert(Math.abs(await frame.locator('.label').evaluate(e=>e.getBoundingClientRect().width)-100*96/25.4)<1)
    await button.click();await page.waitForFunction(()=>window.qaPrint.count===4)
    assert.equal(page.frames().length,2,'old print document released before retry')
    const current=page.frames().find(f=>f!==page.mainFrame());await current.evaluate(()=>window.dispatchEvent(new Event('afterprint')))
    await page.waitForFunction(()=>!document.querySelector('iframe[title="바코드 라벨 인쇄 문서"]'))
    assert.deepEqual(await snapshot(),before)
   }else{
    const opened=context.waitForEvent('page');await button.click();const popup=await opened
    await popup.waitForFunction(()=>window.qaPrint.count===1)
    await verifyLabel(popup);assert.equal(await popup.locator('svg').count(),1)
    await popup.getByRole('button',{name:'라벨 인쇄',exact:true}).click();await popup.waitForFunction(()=>window.qaPrint.count===2)
    const closed=popup.waitForEvent('close');await popup.getByRole('button',{name:'WMS로 돌아가기',exact:true}).click();await closed
    assert.deepEqual(await snapshot(),before,'desktop popup cancel/reprint/close preserves WMS')
   }
   assert(await page.evaluate(()=>window.qaRoot===document.getElementById('root')))
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
   console.log('PASS print cancel/retry/state',source,width)
  }
 }
 await page.setViewportSize({width:1440,height:900})
 await page.goto(origin+'/app/products/'+product.id)
 const name=page.getByRole('textbox',{name:'상품명',exact:true})
 const print=page.getByRole('button',{name:'라벨 인쇄',exact:true}).first()
 async function openAndCheck(expected,title=expected){
  const expectedBarcode=await page.locator('.rack-barcode-value').first().textContent()
  const event=context.waitForEvent('page');await print.click();const popup=await event;await popup.waitForFunction(()=>window.qaPrint.count===1);await verifyLabel(popup,expected,title);assert.equal(await popup.locator('svg text').textContent(),expectedBarcode);const y=await popup.locator('svg').evaluate(e=>e.getBoundingClientRect().y-document.querySelector('.label').getBoundingClientRect().y);await popup.close();return y
 }
 const originalY=await openAndCheck(product.name+' · '+product.code)
 const longName='한글 Mixed Name 123 무드등 가습기 '.repeat(7).slice(0,190)
 await name.fill(longName);const longY=await openAndCheck(longName.trim()+' · '+product.code);assert(Math.abs(originalY-longY)<1,'long caption preserves barcode position')
 await name.fill('한글 & <제품> / A');await openAndCheck('한글 & <제품> / A · PR06','한글 & _제품_ _ A · PR06')
 await name.fill('변경된 상품명');await openAndCheck('변경된 상품명 · PR06')
 await page.getByRole('textbox',{name:'상품코드',exact:true}).fill('');await openAndCheck('변경된 상품명')
 await name.fill('');await page.getByRole('textbox',{name:'상품코드',exact:true}).fill('pr06');await openAndCheck('pr06')
 await page.getByRole('textbox',{name:'상품코드',exact:true}).fill('');await print.click();await page.getByRole('alert').filter({hasText:'상품명 또는 상품코드'}).waitFor()
 // A fresh lookup uses the latest returned product, independent of prior editor drafts.
 product.name='다른 상품 & 새 이름';product.code='pR07'
 await page.goto(origin+'/app/barcode-lookup');await page.getByRole('textbox',{name:'조회 바코드'}).fill('QA-EA');await page.getByRole('button',{name:'조회',exact:true}).click()
 for(const barcode of product.barcodes){await page.getByRole('group',{name:'등록된 상품 바코드'}).getByRole('button').filter({hasText:barcode.value}).click();await openAndCheck(product.name+' · '+product.code)}
 mode='readonly';await page.goto(origin+'/app/products/'+product.id);await page.getByRole('heading',{name:'상품 상세',exact:true}).waitFor();await openAndCheck(product.name+' · '+product.code)
 mode='normal';await page.goto(origin+'/app/products/new');await page.getByRole('textbox',{name:'상품명',exact:true}).fill('등록 중 새 상품');await page.getByRole('textbox',{name:'상품코드',exact:true}).fill('Pr08');await page.getByRole('button',{name:'+ 바코드 추가',exact:true}).click();await page.getByRole('textbox',{name:'상품 바코드 1',exact:true}).fill('QA-EA');await openAndCheck('등록 중 새 상품 · Pr08')
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS real product and barcode routes, no history entries/redirects, cancellation and reprint, PC popup return; browser print dialog simulated; no API writes')
}finally{await browser.close()}
