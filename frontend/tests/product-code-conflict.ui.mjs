import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',root='/api/tenants/fixture'
const product={id:'11111111-1111-4111-8111-111111111111',code:'PR06',name:'가나디 무드등 가습기',unit:'EA',isActive:true,version:'v1',images:[],innerPackQuantity:10,outerPackQuantity:5,outerPackUnit:'INNER',palletPackQuantity:20,createdAt:'2026-11-11',updatedAt:'2026-11-11',barcodes:['EA','INNER','OUTER','PALLET'].map((packageCode,i)=>({id:'b'+i,value:'QA-'+packageCode,packageCode,isPrimary:i===0,barcodeType:'External'}))}
let mode='normal',stockRequests=0,writes=0, conflictAvailable=false
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
   writes++;assert.equal(req.postDataJSON().code,'RACE');conflictAvailable=true
   return route.fulfill({status:409,json:{message:'현재 기업에서 이미 사용 중인 상품코드입니다.'}})
  }
  assert.equal(req.method(),'GET','unexpected write')
  if(u.pathname==='/api/auth/me')return route.fulfill({json:{user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'격리 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'}})
  if(u.pathname==='/api/health/db')return route.fulfill({json:{status:'connected'}})
  if(u.pathname===root+'/workspace')return route.fulfill({json:{id:'fixture',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{products:mode==='readonly'?['menu','read']:['menu','read','create','update'],'stock-overview':['menu','read']}}})
  if(u.pathname===root+'/pages/barcode-lookup'||u.pathname===root+'/pages/products')return route.fulfill({json:{}})
  if(u.pathname===root+'/barcodes/lookup')return route.fulfill({json:{kind:'product',item:{...product,code:'PR06'},inventoryAvailable:mode!=='denied'}})
  if(u.pathname===root+'/products/11111111-1111-4111-8111-111111111111')return route.fulfill({json:{product,canViewCost:false}})
  if(u.pathname.endsWith('/barcodes/check'))return route.fulfill({json:{available:true}})
  if(u.pathname===root+'/products'){
   const search=(u.searchParams.get('search')||'').trim().normalize('NFKC').toUpperCase()
   if(search==='FAIL')return route.fulfill({status:503,json:{message:'일시적인 조회 오류'}})
   if(search==='SLOW')await new Promise(resolve=>setTimeout(resolve,800))
   const duplicate=['PR10','SLOW'].includes(search)||(search==='RACE'&&conflictAvailable)
   const other={...product,id:'22222222-2222-4222-8222-222222222222',code:search,name:'중복 대상 메로나 아주 긴 상품 이름 '.repeat(3),isActive:false}
   return route.fulfill({json:{items:duplicate?[{product:other}]:[],total:duplicate?1:0,page:Number(u.searchParams.get('page')||1),pageSize:100}})
  }
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
 const code=page.getByRole('textbox',{name:'상품코드',exact:true}),toast=page.locator('.product-error-toast'),hint=page.locator('.product-code-check.error')
 for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/app/products/'+product.id);await code.fill(' pr10 ')
  await hint.waitFor();assert.equal(await toast.count(),0);assert.match(await hint.innerText(),/중복 대상 메로나/);assert.match(await hint.innerText(),/PR10/)
  assert.equal(await hint.getByRole('link').getAttribute('href'),'/app/products/22222222-2222-4222-8222-222222222222')
  assert.equal(await code.evaluate(e=>e.validity.customError),true)
  const geom=await page.evaluate(()=>{const h=document.querySelector('.product-code-check'),i=document.querySelector('[aria-label="상품코드"]');return {hint:h.getBoundingClientRect().toJSON(),width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,input:i.getBoundingClientRect().width,column:i.parentElement.getBoundingClientRect().width}})
  assert(geom.hint.right<=width+1);assert.equal(geom.overflow,false);assert(Math.abs(geom.input-geom.column)<2)
  await code.evaluate(e=>e.addEventListener('invalid',event=>queueMicrotask(()=>{window.lastInvalidPrevented=event.defaultPrevented})))
  const before=writes;await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();assert.equal(await toast.count(),0);assert.equal(writes,before);assert.equal(await page.getByRole('alertdialog',{name:'상품 저장 확인'}).count(),0)
  await page.waitForTimeout(200)
  assert.equal(await page.evaluate(()=>window.lastInvalidPrevented),true,'browser validation bubble suppressed')
  assert.equal(await code.evaluate(e=>document.activeElement===e),true)
  assert.equal(await code.evaluate(e=>getComputedStyle(e).outlineWidth),'2px')
  assert.equal(await page.locator('.product-code-field .registration-field-error').count(),0)
  assert.equal(await page.getByText('이미 중복 대상', {exact:false}).count(),1)
  await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();assert.equal(await hint.count(),1);assert.equal(await page.locator('.product-code-field .registration-field-error').count(),0);assert.equal(writes,before)
  await code.fill('PR11');await page.waitForTimeout(450);assert.equal(await hint.count(),0);assert.equal(await code.evaluate(e=>e.validity.customError),false);assert.equal(await page.locator('.product-code-field .registration-field-error').count(),0)
  console.log(`PASS ${width}x${height}: exact conflicting product/link, single inline message, focus outline, blocked duplicate, corrected value, no overflow`)
 }
 await code.fill('SLOW');await page.waitForTimeout(400);await code.fill('NEW');await page.waitForTimeout(900);assert.equal(await hint.count(),0);assert.equal(await code.evaluate(e=>e.validity.customError),false)
 await code.fill('FAIL');await page.getByText('중복 여부를 확인하지 못했습니다. 저장 시 다시 검증합니다.',{exact:true}).waitFor();assert.equal(await code.evaluate(e=>e.validity.customError),false)
 await code.fill('RACE');await page.waitForTimeout(450);await page.waitForFunction(()=>document.querySelector('#product-registration').checkValidity())
 await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();await page.getByRole('button',{name:'확인',exact:true}).click();await hint.waitFor();assert.equal(await toast.count(),0);assert.equal(writes,1);assert.equal(await code.inputValue(),'RACE');assert.equal(await page.locator('.registration-page > div > .alert.error').count(),0)
 assert.equal(await page.getByRole('textbox',{name:'상품명',exact:true}).inputValue(),product.name)
 await code.fill('PR06');await page.waitForTimeout(450);assert.equal(await hint.count(),0);assert.equal(await code.evaluate(e=>e.validity.customError),false)
 await page.goto(origin+'/app/products/new');await page.getByRole('button',{name:'상품 등록',exact:true}).click();assert.equal(await toast.count(),0);assert.equal(await page.getByRole('textbox',{name:'상품명',exact:true}).evaluate(e=>e.validity.valueMissing),true);assert.equal(writes,1);assert(await page.locator('.registration-field-error').count()>0,'other required errors remain visible')
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS stale response, lookup failure, server race 409 → named conflict, input retention, own code, existing required-field validation; no toast; only mocked write')
}finally{await browser.close()}
