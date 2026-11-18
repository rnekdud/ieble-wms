import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',baseline=process.env.BASELINE_ORIGIN,endpoint='/api/tenants/fixture-tenant/products'
let product={id:'11111111-1111-4111-8111-111111111111',code:'PACK-01',name:'격리 비쵸비',unit:'EA',isActive:true,version:'v1',images:[],barcodes:[{id:'b1',value:'EXISTING-001',packageCode:'EA',isPrimary:true,description:'제조사',barcodeType:'External',isGenerated:false},{id:'b2',value:'EXISTING-002',packageCode:'EA',isPrimary:false,description:'포장',barcodeType:'External',isGenerated:false}],barcode:'EXISTING-001',barcodeType:'Internal',lotManaged:false,expiryManaged:false,serialManaged:false,createdAt:'2026-11-06',updatedAt:'2026-11-06'}
let userId='qa',tenant='fixture-tenant',total=131
const requests=[]
const categoryId='22222222-2222-4222-8222-222222222222'
const errors=[],unexpected=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.replace('/tenants/'+tenant+'/', '/tenants/fixture-tenant/')
  if(url.origin!==origin&&url.origin!==baseline){unexpected.push(url.origin);return route.abort()}
  if(!path.startsWith('/api/'))return route.continue()
  const json=value=>route.fulfill({json:value})
  if(path==='/api/auth/me')return json({user:{id:userId,displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:tenant,name:'격리 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:tenant})
  if(path==='/api/health/db')return json({status:'connected'})
  if(path==='/api/tenants/fixture-tenant/workspace')return json({id:'fixture-tenant',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{products:['menu','read','create','update','delete']}})
  if(path==='/api/tenants/fixture-tenant/pages/products')return json({})
  if(path==='/api/auth/csrf')return json({token:'fixture'})
  if(req.method()==='GET'){
   if(path===endpoint+'/options')return json({units:['EA','BOX','kg'],categories:[{id:categoryId,name:'가공식품',parentId:null}],productTypes:[]})
   if(path.startsWith(endpoint+'/')&&!path.includes('/barcodes/'))return json({product:{...product,id:path.split('/').at(-1)},canViewCost:true})
   if(path===endpoint){requests.push(Object.fromEntries(url.searchParams));const page=Number(url.searchParams.get('page')),pageSize=Number(url.searchParams.get('pageSize'));return json({items:Array.from({length:Math.max(0,Math.min(pageSize,total-(page-1)*pageSize))},(_,i)=>({product:{...product,id:'11111111-1111-4111-8111-'+String((page-1)*pageSize+i+1).padStart(12,'0'),name:'메로나 '+((page-1)*pageSize+i+1)},categoryName:'가공식품'})),total,page,pageSize})}
   if(path.endsWith('/barcodes/check'))return json(url.searchParams.get('value')==='TAKEN'?{available:false,conflict:{kind:'product',id:'other-product',code:'OTHER',name:'중복 상품명이 매우 긴 격리 QA 상품'}}:{available:true})
  }else{

   throw new Error('Unexpected write: '+path)
  }
  unexpected.push(path);return route.fulfill({status:404,json:{message:'Unexpected fixture request'}})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)

 const list='/app/products'
 const ready=()=>page.locator('.wms-pagination-buttons[aria-busy=false]').waitFor()
 const details=()=>page.locator('.products-mobile-cards button:visible,.products-desktop-list tbody button:visible').first()
 const back=()=>page.locator('.work-detail-header .registration-back')
 const assertList=async()=>{await ready();assert.equal(await page.getByLabel('상품 검색',{exact:true}).inputValue(),'메로나');assert.equal(await page.getByLabel('사용 여부 필터').inputValue(),'active');assert.equal(await page.getByLabel('페이지당 표시 건수').inputValue(),'50');assert.equal(await page.getByRole('button',{name:'3페이지',exact:true}).getAttribute('aria-current'),'page');assert.match(await page.getByRole('button',{name:/상품 분류/}).innerText(),/가공식품/);assert.deepEqual(requests.at(-1),{search:'메로나',categoryId,status:'active',page:'3',pageSize:'50'})}
 const openDetail=async()=>{await details().click();await page.getByRole('textbox',{name:'상품명',exact:true}).waitFor()}
 for(const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto(origin+list);await ready()
  assert.equal(await page.getByLabel('상품 검색',{exact:true}).inputValue(),'')
  await page.getByLabel('상품 검색',{exact:true}).fill('메로나');await page.getByLabel('사용 여부 필터').selectOption('active');await page.getByRole('button',{name:/상품 분류/}).click();await page.getByRole('option',{name:'가공식품',exact:true}).click();await page.getByRole('button',{name:'검색',exact:true}).click();await ready()
  await page.getByLabel('페이지당 표시 건수').selectOption('50');await ready();await page.getByRole('button',{name:'3페이지',exact:true}).click();await assertList()
  const returnUrl=page.url();await openDetail();const detailUrl=page.url();const savedY=await page.evaluate(()=>history.state.__iebleProductList.returnTo.scroll)
  const b=await back().evaluate(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,hit:getComputedStyle(e,'::after').width}));assert.equal(b.w,36);assert.equal(b.h,36);if(width<=1024)assert.equal(b.hit,'44px')
  await back().click();await page.waitForURL(returnUrl);await assertList();await page.waitForFunction(y=>Math.abs(scrollY-Math.min(y,document.documentElement.scrollHeight-innerHeight))<2,savedY)
  await page.goForward();await page.waitForURL(detailUrl);await page.getByRole('textbox',{name:'상품명',exact:true}).waitFor();await page.reload();await page.getByRole('textbox',{name:'상품명',exact:true}).waitFor();await back().click();await page.waitForURL(returnUrl);await assertList()
  await openDetail();await page.goBack();await page.waitForURL(returnUrl);await assertList();await page.goForward();await page.getByRole('textbox',{name:'상품명',exact:true}).waitFor()
  console.log('PASS',width,height,'query, category, status, page 3, size 50, header/browser back/forward, detail reload, scroll and touch target')
 }
 // Removing rows while detail is open clamps the restored page using the server total.
 total=21;await back().click();await ready();await page.waitForFunction(()=>document.querySelector('.wms-pagination button[aria-current=page]')?.getAttribute('aria-label')==='1페이지');await ready();assert.equal(requests.at(-1).page,'1');assert.equal(requests.at(-1).search,'메로나')
 total=0;await page.reload();await ready();assert(await page.getByText('조회된 상품이 없습니다.',{exact:true}).count());assert.equal(requests.at(-1).page,'1')
 total=131;await page.goto(origin+list+'?page=-9&pageSize=999&status=invalid&categoryId=invalid');await ready();assert.equal(requests.at(-1).page,'1');assert.equal(requests.at(-1).pageSize,'20');assert.equal(requests.at(-1).status,'all');assert.equal(requests.at(-1).categoryId,'')
 await page.goto(origin+list+'?search=직접접근&page=3&pageSize=50');await ready();assert.equal(requests.at(-1).search,'직접접근');assert.equal(requests.at(-1).page,'3')
 await openDetail();userId='other-user';await page.reload();await page.getByRole('textbox',{name:'상품명',exact:true}).waitFor();await back().click();await ready();assert.equal(await page.getByLabel('상품 검색',{exact:true}).inputValue(),'');assert.equal(requests.at(-1).page,'1')
 await page.goto(origin+list+'?search=기업전환&page=2');await ready();await openDetail();tenant='other-tenant';await page.reload();await page.getByRole('textbox',{name:'상품명',exact:true}).waitFor();await back().click();await ready();assert.equal(await page.getByLabel('상품 검색',{exact:true}).inputValue(),'')
 await page.goto(origin+list+'?search=이전사용자');await ready();userId='third-user';await page.reload();await ready();assert.equal(await page.getByLabel('상품 검색',{exact:true}).inputValue(),'');assert.equal(new URL(page.url()).search,'')
 await page.goto(origin+list+'/'+product.id);await page.getByRole('textbox',{name:'상품명',exact:true}).waitFor();await back().click();await page.waitForURL(origin+list);await ready();assert.equal(requests.at(-1).page,'1')

 await page.goto(origin+list+'?search=적용완료&page=3');await ready();await page.getByLabel('상품 검색',{exact:true}).fill('아직 적용하지 않은 검색');await openDetail();await back().click();await ready();assert.equal(await page.getByLabel('상품 검색',{exact:true}).inputValue(),'아직 적용하지 않은 검색');assert.equal(requests.at(-1).search,'적용완료')
 await page.getByRole('button',{name:'2페이지',exact:true}).click();await ready();assert.equal(await page.getByLabel('상품 검색',{exact:true}).inputValue(),'아직 적용하지 않은 검색');assert.equal(requests.at(-1).search,'적용완료')
 await page.getByRole('button',{name:'초기화',exact:true}).click();await page.getByRole('dialog',{name:'필터 초기화',exact:true}).getByRole('button',{name:'초기화',exact:true}).click();await ready();assert.equal(await page.getByLabel('상품 검색',{exact:true}).inputValue(),'');assert.equal(requests.at(-1).page,'1');assert.equal(requests.at(-1).search,'');assert.equal(new URL(page.url()).search,'')
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])

 console.log('PASS changed totals/empty, malformed/direct query, direct detail fallback, user/tenant isolation; all API traffic mocked, no writes')
}finally{await browser.close()}
