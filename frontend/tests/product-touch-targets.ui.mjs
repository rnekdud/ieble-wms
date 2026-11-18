import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',baseline=process.env.BASELINE_ORIGIN,endpoint='/api/tenants/fixture-tenant/products'
let readOnly=false
const writes=[]
let product={id:'11111111-1111-4111-8111-111111111111',code:'PACK-01',name:'격리 비쵸비',unit:'EA',isActive:true,version:'v1',images:[],barcodes:[{id:'b1',value:'EXISTING-001',packageCode:'EA',isPrimary:true,description:'제조사',barcodeType:'External',isGenerated:false},{id:'b2',value:'EXISTING-002',packageCode:'EA',isPrimary:false,description:'포장',barcodeType:'External',isGenerated:false}],barcode:'EXISTING-001',barcodeType:'Internal',lotManaged:false,expiryManaged:false,serialManaged:false,createdAt:'2026-11-06',updatedAt:'2026-11-06'}
const errors=[],unexpected=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname
  if(url.origin!==origin&&url.origin!==baseline){unexpected.push(url.origin);return route.abort()}
  if(!path.startsWith('/api/'))return route.continue()
  const json=value=>route.fulfill({json:value})
  if(path==='/api/auth/me')return json({user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture-tenant',name:'격리 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture-tenant'})
  if(path==='/api/health/db')return json({status:'connected'})
  if(path==='/api/tenants/fixture-tenant/workspace')return json({id:'fixture-tenant',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{products:readOnly?['menu','read']:['menu','read','create','update','delete']}})
  if(path==='/api/tenants/fixture-tenant/pages/products')return json({})
  if(path==='/api/auth/csrf')return json({token:'fixture'})
  if(req.method()==='GET'){
   if(path===endpoint+'/options')return json({units:['EA','BOX','kg'],categories:[],productTypes:[]})
   if(path===endpoint+'/'+product.id)return json({product,canViewCost:true})
   if(path===endpoint)return json({items:[{product}],total:40,page:Number(url.searchParams.get('page')||1),pageSize:20})
   if(path.endsWith('/barcodes/check'))return json(url.searchParams.get('value')==='TAKEN'?{available:false,conflict:{kind:'product',id:'other-product',code:'OTHER',name:'중복 상품명이 매우 긴 격리 QA 상품'}}:{available:true})
  }else{
   if(req.method()==='POST'&&path===endpoint+'/'+product.id){writes.push(req.postDataJSON());return json({...product,barcodes:product.barcodes.filter(b=>req.postDataJSON().barcodes.some(saved=>saved.id===b.id)),version:'v2'})}
   if(path===endpoint+'/barcode-candidates')return json({value:'WMS12345678901234567',proof:'fixture-proof'})
   throw new Error('Unexpected write: '+path)
  }
  unexpected.push(path);return route.fulfill({status:404,json:{message:'Unexpected fixture request'}})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 const goto=async(mode)=>{await page.goto(origin+(mode==='list'?'/app/products':mode==='new'?'/app/products/new':'/app/products/'+product.id));await page.getByRole(mode==='list'?'button':'textbox',{name:mode==='list'?'엑셀 대량등록':'상품명',exact:true}).waitFor()}

 const back=()=>page.locator('.work-detail-header .registration-back')
 const trash=()=>page.locator('.product-barcode-delete')
 const measure=async button=>{
  await button.scrollIntoViewIfNeeded()
  return button.evaluate(e=>{
   const b=e.getBoundingClientRect(),s=getComputedStyle(e),a=getComputedStyle(e,'::after'),svg=e.querySelector('svg').getBoundingClientRect()
   const w=a.content==='none'?b.width:parseFloat(a.width),h=a.content==='none'?b.height:parseFloat(a.height)
   const hit={left:b.x+(b.width-w)/2,top:b.y+(b.height-h)/2,right:b.x+(b.width+w)/2,bottom:b.y+(b.height+h)/2,w,h}
   const points=[[0,0],[-w/2+1,0],[w/2-1,0],[0,-h/2+1],[0,h/2-1],[-w/2+(a.content==='none'?8:1),-h/2+(a.content==='none'?8:1)],[w/2-(a.content==='none'?8:1),h/2-(a.content==='none'?8:1)]].map(([x,y])=>({x:b.x+b.width/2+x,y:b.y+b.height/2+y}))
   const overlaps=[...e.closest('.work-detail-actions,.product-barcode-heading').querySelectorAll('button,input,a')].filter(n=>n!==e).filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.height&&r.left<hit.right&&r.right>hit.left&&r.top<hit.bottom&&r.bottom>hit.top}).length
   return {box:{w:b.width,h:b.height,x:b.x,y:b.y},icon:{w:svg.width,h:svg.height},hit,points,hits:points.map(p=>e.contains(document.elementFromPoint(p.x,p.y))),overlaps,visual:[s.backgroundColor,s.borderColor,s.borderRadius,s.padding],header:e.closest('.work-detail-header')?.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth+1}
  })
 }
 const verify=async(button,width)=>{const m=await measure(button);assert.equal(m.box.w,36);assert.equal(m.box.h,36);assert.equal(m.hit.w,width<=1024?44:36);assert.equal(m.hit.h,width<=1024?44:36);assert(m.hits.every(Boolean),JSON.stringify(m));assert.equal(m.overlaps,0);assert(!m.overflow);return m}
 for(const [width,height] of (process.env.FLOW_ONLY?[]:[[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]])){
  await page.setViewportSize({width,height});await goto('edit')
  const b=await verify(back(),width);assert.equal(b.icon.w,18)
  if(baseline){await page.goto(baseline+'/app/products/'+product.id);await page.getByRole('textbox',{name:'상품명',exact:true}).waitFor();const prev=await measure(back());assert.deepEqual(b.visual,prev.visual);assert.deepEqual(b.icon,prev.icon);assert.equal(b.header,prev.header);await goto('edit')}
  const hit=await verify(back(),width);await page.mouse.click(hit.points[1].x,hit.points[1].y);await page.waitForURL('**/app/products');assert.equal(await page.getByRole('dialog').count(),0)
  for(const mode of ['new','edit']){
   await goto(mode)
   if(mode==='new'){
    await page.getByRole('button',{name:'+ 바코드 추가',exact:true}).click();await page.getByLabel('상품 바코드 1',{exact:true}).fill('NEW-FIRST')
    await page.getByRole('button',{name:'+ 바코드 추가',exact:true}).click();await page.getByLabel('상품 바코드 2',{exact:true}).fill('NEW-SECOND')
   }
   // Count events on the actual button to detect double execution; no synthetic handler.
   const target=trash().nth(1),m=await verify(target,width);assert.equal(m.icon.w,16)
   await target.evaluate(e=>{window.trashClicks=0;e.addEventListener('click',()=>window.trashClicks++)})
   const p=m.points[6];await page.mouse.click(p.x,p.y)
   assert.equal(await page.evaluate(()=>window.trashClicks),1);assert.equal(await trash().count(),1)
   assert.equal(await page.getByLabel('상품 바코드 1',{exact:true}).inputValue(),mode==='new'?'NEW-FIRST':'EXISTING-001')
   // Native disabled fieldset must reject even an expanded-edge pointer click.
   await trash().evaluate(e=>e.closest('fieldset').disabled=true)
   const disabled=await measure(trash());await page.mouse.click(disabled.points[1].x,disabled.points[1].y);assert.equal(await trash().count(),1)
   await trash().evaluate(e=>e.closest('fieldset').disabled=false)
   await trash().focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert(await trash().evaluate(e=>e===document.activeElement));assert(await trash().evaluate(e=>{const s=getComputedStyle(e);return s.outlineStyle!=='none'||s.boxShadow!=='none'}))
   await page.keyboard.press('Space');assert.equal(await trash().count(),0)
  }
  await goto('edit');await back().focus();await page.keyboard.press('Enter');await page.waitForURL('**/app/products')
  console.log('PASS',width,height,'36px appearance; '+(width<=1024?'44':'36')+'px hit area, every edge/corner hit, no neighbor overlap, back, exact draft deletion, keyboard and disabled')
 }
 // Read-only product detail uses the same isolated target rule.
 readOnly=true;await page.setViewportSize({width:390,height:844});await page.goto(origin+'/app/products/'+product.id);await page.locator('.product-master-detail').waitFor();await verify(back(),390);await back().click();await page.waitForURL('**/app/products');readOnly=false


 const returnState=async base=>{
  await page.goto(base+'/app/products');await page.getByLabel('상품 검색',{exact:true}).fill('격리');await page.getByLabel('사용 여부 필터').selectOption('active');await page.getByRole('button',{name:'검색',exact:true}).click();await page.getByRole('button',{name:'2페이지',exact:true}).click()
  await page.locator('.products-mobile-cards').getByRole('button',{name:product.name+' 상세',exact:true}).click();await page.getByRole('textbox',{name:'상품명',exact:true}).waitFor();await back().click();await page.waitForURL(url=>url.pathname==='/app/products');await page.getByRole('button',{name:'2페이지',exact:true}).waitFor()
  return {search:await page.getByLabel('상품 검색',{exact:true}).inputValue(),status:await page.getByLabel('사용 여부 필터').inputValue(),page:await page.locator('.wms-pagination button[aria-current=page]').getAttribute('aria-label')}
 }
 const previousState={search:'격리',status:'active',page:'2페이지'}
 const currentState=await returnState(origin);assert.deepEqual(currentState,previousState,'list search/filter/page restored');console.log('RESTORED list return state',currentState)
 await page.locator('.products-mobile-cards').getByRole('button',{name:product.name+' 상세',exact:true}).click();await page.getByRole('textbox',{name:'상품명',exact:true}).waitFor();await trash().nth(1).click();await back().click()
 const discard=page.getByRole('dialog',{name:'저장하지 않은 변경사항',exact:true});await discard.getByRole('button',{name:'계속 편집',exact:true}).click();assert.equal(await trash().count(),1)
 await page.waitForFunction(()=>document.querySelector('.barcode-check.available'));await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();await page.getByRole('alertdialog',{name:'상품 저장 확인'}).getByRole('button',{name:'확인',exact:true}).click();await page.getByText('변경사항을 저장했습니다.',{exact:true}).waitFor()
 assert.equal(writes.length,1);assert.deepEqual(writes[0].barcodes.map(b=>b.id),['b1']);assert.equal(writes[0].barcodes[0].isPrimary,true);assert.equal(writes[0].barcodes[0].packageCode,'EA')
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])

 console.log('PASS read-only detail, restored list search/filter/page, unsaved confirmation, saved barcode IDs in mock API only; no real data access')
}finally{await browser.close()}
