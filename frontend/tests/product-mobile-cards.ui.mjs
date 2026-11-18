import assert from 'node:assert/strict'
import { chromium } from 'playwright'

let origin=process.env.WMS_UI_ORIGIN||'http://localhost:5176'
const now='2026-11-13T00:00:00Z', tenant='mobile-product-qa'
const permissions={products:['menu','read','delete','create']}
let role='Employee', fail=false
const workspace={id:tenant,name:'상품 카드 QA',permissions,serviceStatus:'Active',billingStatus:'Active',billingAccess:{state:'Active',canAccessWms:true,hasRegisteredCard:true},canManageBilling:false}
const products=Array.from({length:25},(_,i)=>({product:{id:`12345678-1234-1234-1234-${String(i+1).padStart(12,'0')}`,code:`PR${i+1}`,name:i===0?'농심 새우깡 90g':i===1?'긴 상품 이름으로 모바일 줄바꿈과 카드 너비를 확인하는 테스트 상품':i===2?'':`상품 ${i+1}`,modelNumber:i===0?'MODEL-01':null,unit:'EA',categoryId:'22222222-2222-4222-8222-222222222222',productTypeId:'type',isActive:i!==1,barcode:i===1?'880000000000000014880000000000000014':'88000000000014',barcodeType:'External',hasImage:i===0,images:[],barcodes:[],lotManaged:false,serialManaged:false,expiryManaged:false,version:'1',createdAt:now,updatedAt:now},categoryName:i===1?'길이가 아주 긴 가공식품 분류 이름':'가공식품',productTypeName:'원재품'}))
const options={categories:[{id:'22222222-2222-4222-8222-222222222222',name:'가공식품',parentId:null,isActive:true,version:'1'}],productTypes:[{id:'type',name:'원재품',isActive:true,version:'1'}],units:['EA']}
const queries=[],errors=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
 await context.routeWebSocket('**/*',()=>{})
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.replace(`/api/tenants/${tenant}`,'')
  assert.equal(url.origin,origin)
  if(!url.pathname.startsWith('/api/'))return route.continue()
  if(path==='/products/delete-check'){
   assert.equal(request.method(),'POST');const ids=request.postDataJSON().items.map(p=>p.id);assert.deepEqual(ids,[products[0].product.id]);return route.fulfill({json:{canDelete:true,items:products.filter(p=>ids.includes(p.product.id)).map(({product:p})=>({id:p.id,code:p.code,name:p.name,canDelete:true,reasons:[]}))}})
  }
  assert.equal(request.method(),'GET','No business data writes permitted')
  const json=data=>route.fulfill({json:data})
  if(path==='/api/auth/me')return json({user:{id:'qa',displayName:'QA 구성원',userName:'qa',email:'qa@example.test',systemRole:'User',mustChangePassword:false},memberships:[{tenantId:tenant,name:workspace.name,role,serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:tenant})
  if(path==='/api/auth/csrf')return json({token:'isolated-qa-token'})
  if(path==='/workspace')return json({...workspace,role})
  if(path==='/api/health/db')return json({status:'connected'})
  if(path==='/products/options')return json(options)
  if(path==='/products'){
   const q=Object.fromEntries(url.searchParams);queries.push(q)
   if(fail)return route.fulfill({status:500,json:{message:'QA 조회 실패'}})
   let items=products.filter(({product:p})=>(!q.search||`${p.name} ${p.code} ${p.barcode}`.includes(q.search))&&(!q.categoryId||p.categoryId===q.categoryId)&&(q.status==='all'||!q.status||(q.status==='active'?p.isActive:!p.isActive)))
   const page=Number(q.page)||1,pageSize=Number(q.pageSize)||20,total=items.length
   items=items.slice((page-1)*pageSize,page*pageSize)
   return json({items,total,page,pageSize})
  }
  if(path.endsWith('/image'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=','base64')})
  if(path.startsWith('/products/'))return json(products.find(p=>path.endsWith(p.product.id)))
  if(path.startsWith('/pages/'))return json({})
  return json({items:[],total:0,page:1,pageSize:20})
 })
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
 const load=async()=>{await page.goto(origin+'/app/products');await page.locator('.wms-pagination-summary').filter({hasText:'총 25건'}).waitFor()}
 const cards=()=>page.locator('.products-mobile-item')
 const checkIconSquares=async()=>{
  const buttons=await page.locator('button:visible').evaluateAll(nodes=>nodes.filter(e=>e.querySelector('svg')&&!e.innerText.trim()).map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')||e.title,width:r.width,height:r.height}}))
  for(const button of buttons)assert(Math.abs(button.width-button.height)<1,JSON.stringify(button))
 }
 for(const width of [360,390,430,768,1440]){
  await page.setViewportSize({width,height:900});await load()
  const mobile=width<768
  await checkIconSquares()
  assert.equal(await page.locator('.products-mobile-list').isVisible(),mobile)
  assert.equal(await page.locator('.products-desktop-list').isVisible(),!mobile)
  assert.equal(await page.locator('button[aria-label="농심 새우깡 90g 상세"]:visible').count(),1)
  const expectedOrder=products.slice(0,20).map(x=>x.product.code)
  assert.deepEqual(await cards().evaluateAll(es=>es.map(e=>e.querySelector('.products-mobile-identity > p')?.textContent||e.querySelector('h2').textContent)),expectedOrder,'mobile keeps API order')
  assert.deepEqual(await page.locator('.products-desktop-list tbody tr > td:nth-child(3)').allTextContents(),expectedOrder,'PC keeps the same API order')
  if(mobile){
   assert.equal(await page.locator('.products-mobile-select-all').evaluate(e=>getComputedStyle(e).flexDirection),'row')
   const box=selector=>page.locator(selector).boundingBox()
   const center=r=>r.y+r.height/2
   const title=await box('.wms-page-heading h1'),actions=await box('.wms-page-actions')
   assert(Math.abs(center(title)-center(actions))<1);assert(title.x+title.width<=actions.x)
   const search=await box('.products-toolbar input[aria-label="상품 검색"]'),category=await box('.products-toolbar .searchable-choice-trigger'),status=await box('.products-toolbar select'),buttons=await box('.products-toolbar .list-search-actions')
   assert.equal(search.height,40);assert.equal(category.height,40);assert.equal(status.height,40)
   // Shared filters now place category/status first and full-width search below.
   assert(Math.abs(category.y-status.y)<1);assert(category.x+category.width<=status.x)
   assert(search.y>=category.y+category.height);assert(buttons.y>=search.y+search.height)
   for(const r of [search,category,status,buttons])assert(r.x>=0&&r.x+r.width<=width+1)
   assert(Math.abs(search.x-category.x)<1);assert(Math.abs(search.width-status.x-status.width+category.x)<1)
   console.log('FILTER DOM',width,JSON.stringify({search,category,status,buttons}))
   assert.deepEqual(await cards().first().locator('dt').allTextContents(),['상품구분','카테고리','대표바코드'])
   const image=await cards().first().locator('img').boundingBox(),identity=await cards().first().locator('.products-mobile-identity').boundingBox(),check=await cards().first().locator('input').boundingBox()
   assert(image.x+image.width<=identity.x);assert(identity.x+identity.width<=check.x);assert(Math.abs(center(image)-center(identity))<1)
   assert.equal(await cards().first().locator('img').evaluate(e=>e.complete&&e.naturalWidth>0),true)
   assert.equal(await cards().nth(1).getByLabel('이미지 없음').count(),1)
   assert.equal(await cards().count(),20)
   assert.equal(await cards().first().locator('h2').textContent(),'농심 새우깡 90g')
   assert.equal(await cards().nth(2).locator('h2').textContent(),'PR3')
   assert.equal(await cards().nth(1).locator('.products-mobile-status').textContent(),'미사용')
   for(const card of await cards().all()){
    const geometry=await card.evaluate(e=>{const r=e.getBoundingClientRect(),button=e.querySelector('button').getBoundingClientRect();return {width:r.width,right:r.right,overflow:e.scrollWidth>e.clientWidth,radius:getComputedStyle(e).borderRadius,height:button.height,buttonRight:button.right}})
    assert(!geometry.overflow);assert(geometry.right<=width);assert.equal(geometry.radius,'12px');assert(geometry.height>=44);assert(geometry.buttonRight<geometry.right)
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  } else assert.equal(await page.locator('.products-desktop-list thead th').count(),10)
  assert.equal(await page.getByRole('button',{name:'선택 해제',exact:true}).count(),0)
  assert.equal(await page.locator('.product-selection-actions').count(),0)
  await page.getByRole('checkbox',{name:'농심 새우깡 90g 선택',exact:true}).check()
  await page.getByText('1개 선택됨',{exact:true}).waitFor()
  const layout=await page.locator('.products-list-controls').evaluate(e=>{const r=e.getBoundingClientRect(),left=innerWidth<768?e.querySelector('.products-mobile-select-all').getBoundingClientRect():null,right=e.querySelector('.product-selection-actions').getBoundingClientRect(),s=getComputedStyle(e.querySelector('.product-selection-actions'));return {left:left?left.x-r.x:0,right:r.right-right.right,leftRect:left?.toJSON(),rightRect:right.toJSON(),gap:s.gap,overflow:e.scrollWidth>e.clientWidth}})
  assert(Math.abs(layout.left)<1);assert(Math.abs(layout.right)<1);assert.equal(layout.gap,'8px');assert(!layout.overflow)
  if(layout.leftRect){assert(Math.abs(layout.leftRect.y+layout.leftRect.height/2-layout.rightRect.y-layout.rightRect.height/2)<1);assert(layout.leftRect.right<=layout.rightRect.x)}
  if(width===390&&process.env.PRODUCT_CARDS_VISUAL)console.log('IMAGE:'+(await page.screenshot({type:'jpeg',quality:75})).toString('base64'))
  await page.getByRole('checkbox',{name:'농심 새우깡 90g 선택',exact:true}).uncheck()
  if(!mobile&&process.env.PRODUCT_BASELINE_ORIGIN){
   const state=()=>page.evaluate(()=>['.wms-page-heading','.wms-page-actions','.products-toolbar','.products-list-controls','.products-desktop-list','.wms-pagination'].map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect(),s=getComputedStyle(e);return {selector,rect:[r.x,r.y,r.width,r.height],padding:s.padding,margin:s.margin,font:s.font}}))
   const expected=await state(),working=origin;origin=process.env.PRODUCT_BASELINE_ORIGIN;await load();assert.deepEqual(await state(),expected);origin=working;await load()
  }
  for(const destination of ['/app/products/new','/app/products/'+products[0].product.id]){
   await page.goto(origin+destination)
   const back=page.getByRole('button',{name:destination.endsWith('/new')?'뒤로가기':'목록으로 돌아가기',exact:true}),icon=back.locator('svg')
   await icon.waitFor();const b=await back.boundingBox(),i=await icon.boundingBox();assert(Math.abs(b.width-b.height)<1)
   assert(i.width>0&&i.height>0);assert(Math.abs(b.x+b.width/2-i.x-i.width/2)<1);assert(Math.abs(b.y+b.height/2-i.y-i.height/2)<1)
   await back.click();await page.waitForURL(origin+'/app/products');await page.locator('.wms-pagination-summary').filter({hasText:'총 25건'}).waitFor()
  }
  console.log('PASS product list layout',width)
 }
 await page.setViewportSize({width:390,height:844});await load()
 await page.getByRole('checkbox',{name:'농심 새우깡 90g 선택',exact:true}).check()
 await page.getByText('1개 선택됨',{exact:true}).waitFor()
 await page.getByRole('checkbox',{name:'농심 새우깡 90g 선택',exact:true}).uncheck()
 await page.getByRole('checkbox',{name:'현재 페이지 상품 전체 선택',exact:true}).check()
 await page.getByText('20개 선택됨',{exact:true}).waitFor()
 await page.getByRole('checkbox',{name:'현재 페이지 상품 전체 선택',exact:true}).uncheck()
 await page.getByRole('checkbox',{name:'농심 새우깡 90g 선택',exact:true}).check()
 await page.getByRole('button',{name:'선택 상품 삭제',exact:true}).click()
 const deletion=page.getByRole('dialog',{name:'선택한 상품을 삭제하시겠습니까?',exact:true})
 await deletion.getByText('삭제 가능 — 참조 이력 없음',{exact:true}).waitFor()
 assert.equal(await deletion.getByRole('button',{name:'선택 상품 삭제',exact:true}).isEnabled(),true)
 await deletion.getByRole('button',{name:'취소',exact:true}).click()
 assert.equal(await page.getByRole('checkbox',{name:'농심 새우깡 90g 선택',exact:true}).isChecked(),true)
 await page.getByRole('checkbox',{name:'농심 새우깡 90g 선택',exact:true}).uncheck()
 await page.getByRole('button',{name:'다음 페이지',exact:true}).click()
 await page.locator('.wms-pagination-summary').filter({hasText:'21–25건'}).waitFor();assert.equal(await cards().count(),5)
 await page.getByLabel('상품 검색',{exact:true}).fill('농심')
 await page.getByRole('button',{name:'검색',exact:true}).click()
 await page.locator('.wms-pagination-summary').filter({hasText:'총 1건'}).waitFor();assert.equal(queries.at(-1).page,'1');assert.equal(await cards().count(),1)
 await page.getByRole('button',{name:'초기화',exact:true}).click()
 await page.getByRole('dialog',{name:'필터 초기화',exact:true}).getByRole('button',{name:'초기화',exact:true}).click()
 await page.locator('.wms-pagination-summary').filter({hasText:'총 25건'}).waitFor()
 await page.getByLabel('사용 여부 필터').selectOption('inactive');await page.getByRole('button',{name:'검색',exact:true}).click()
 await page.locator('.wms-pagination-summary').filter({hasText:'총 1건'}).waitFor();assert.equal(await cards().first().locator('.products-mobile-status').textContent(),'미사용')
 await load();await page.locator('.products-toolbar .searchable-choice-trigger').click()
 await page.getByRole('option',{name:'가공식품',exact:true}).click();await Promise.all([page.waitForResponse(r=>r.url().includes('categoryId=22222222-2222-4222-8222-222222222222')),page.getByRole('button',{name:'검색',exact:true}).click()]);await page.locator('.wms-pagination-summary').filter({hasText:'총 25건'}).waitFor();assert.equal(queries.at(-1).categoryId,'22222222-2222-4222-8222-222222222222')
 await load();await page.getByLabel('페이지당 표시 건수').selectOption('50')
 await page.locator('.wms-pagination-summary').filter({hasText:'1–25건'}).waitFor();assert.equal(await cards().count(),25);assert.equal(queries.at(-1).pageSize,'50')
 await cards().first().getByRole('button',{name:'농심 새우깡 90g 상세',exact:true}).click()
 await page.waitForURL(origin+'/app/products/'+products[0].product.id)
 await page.getByRole('heading',{name:'상품 상세',exact:true}).waitFor()
 await load();await page.getByLabel('상품 검색',{exact:true}).fill('없는 상품')
 await page.getByRole('button',{name:'검색',exact:true}).click();await page.locator('.products-mobile-list').getByText('조회된 상품이 없습니다.',{exact:true}).waitFor()
 fail=true;await page.goto(origin+'/app/products');await page.locator('.products-mobile-list').getByText('목록을 불러오지 못했습니다.',{exact:true}).waitFor();fail=false
 permissions.products=['menu','read'];await load()
 assert.equal(await page.locator('.products-mobile-list input[type=checkbox],.products-mobile-select-all').count(),0)
 assert.deepEqual(errors,[])
 console.log('PASS search/reset, status, server pagination/page size, selection permissions, detail routing, fallback identity, empty/error states; isolated fixtures, delete review/cancel, no data writes')
}finally{await browser.close()}
