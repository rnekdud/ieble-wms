import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',endpoint='/api/tenants/fixture-tenant/products'
let product={id:'11111111-1111-4111-8111-111111111111',code:'PACK-01',name:'격리 비쵸비',unit:'EA',isActive:true,version:'v1',images:[],barcodes:[],barcode:null,barcodeType:'Internal',lotManaged:false,expiryManaged:false,serialManaged:false,createdAt:'2026-11-06',updatedAt:'2026-11-06'}
let invalid=false,commits=0,previewId='',submitted,downloads=0
const errors=[],unexpected=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname
  if(url.origin!==origin){unexpected.push(url.origin);return route.abort()}
  if(!path.startsWith('/api/'))return route.continue()
  const json=value=>route.fulfill({json:value})
  if(path==='/api/auth/me')return json({user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture-tenant',name:'격리 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture-tenant'})
  if(path==='/api/health/db')return json({status:'connected'})
  if(path==='/api/tenants/fixture-tenant/workspace')return json({id:'fixture-tenant',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{products:['menu','read','create','update','delete']}})
  if(path==='/api/tenants/fixture-tenant/pages/products')return json({})
  if(path==='/api/auth/csrf')return json({token:'fixture'})
  if(req.method()==='GET'){
   if(path===endpoint+'/import-template'){downloads++;return route.fulfill({contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',body:Buffer.from('xlsx-response-fixture')})}
   if(path===endpoint+'/options')return json({units:['EA','BOX','kg'],categories:[],productTypes:[]})
   if(path===endpoint+'/'+product.id)return json({product,canViewCost:true})
   if(path===endpoint)return json({items:[{product}],total:1,pageSize:20})
   if(path.endsWith('/barcodes/check'))return json({available:true})
  }else{
   const body=req.postDataJSON()
   if(path===endpoint+'/import-preview'){
    previewId=body.requestId;assert(body.fileBase64)
    return json({committed:false,total:1,errors:invalid?[{row:8,column:'인박스 수량',value:'ABC',message:'1 이상의 정수를 입력해 주세요.'},{row:8,column:'소비자가',value:'ABC',message:'숫자로 입력해 주세요.'}]:[],rows:[{row:2,name:'비쵸비',code:'',innerPackQuantity:10,outerPackQuantity:5,outerPackUnit:'INNER',palletPackQuantity:20}]})
   }
   if(path===endpoint+'/import'){assert.equal(body.requestId,previewId);commits++;return json({committed:true,total:1,errors:[],rows:[]})}
   if(path===endpoint+'/'+product.id||path===endpoint){submitted=body;product={...product,...body,barcodes:body.barcodes.map((b,i)=>({...b,id:b.id||'b'+i,value:b.change?.value||product.barcodes.find(old=>old.id===b.id)?.value||''}))};product.barcode=product.barcodes.find(b=>b.isPrimary)?.value||null;return json(product)}
  }
  unexpected.push(path);return route.fulfill({status:404,json:{message:'Unexpected fixture request'}})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 const goto=async(mode)=>{await page.goto(origin+(mode==='list'?'/app/products':mode==='new'?'/app/products/new':'/app/products/'+product.id));await page.getByRole(mode==='list'?'button':'textbox',{name:mode==='list'?'엑셀 대량등록':'상품명',exact:true}).waitFor()}

 const baselineProduct=structuredClone(product)
 for(const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});await goto('new')
  await page.getByRole('textbox',{name:'상품명',exact:true}).fill('포장 입력 QA')
  await page.getByRole('button',{name:'+ 바코드 추가',exact:true}).click()
  const row=page.getByRole('region',{name:'바코드 1 영역',exact:true}),select=row.getByLabel('바코드 1 포장 단위',{exact:true}),barcode=row.locator('.rack-barcode-input-row input')
  const master=label=>page.getByRole('spinbutton',{name:label,exact:true}),inline=label=>row.getByRole('spinbutton',{name:'바코드 1 '+label,exact:true})
  for(const code of ['INNER','OUTER'])assert.equal(await select.locator('option[value='+code+']').isDisabled(),false)
  assert.equal(await select.locator('option[value=PALLET]').isDisabled(),false)
  await select.selectOption('PALLET');assert.equal(await row.locator('.barcode-packaging-inputs input').count(),3,'pallet offers missing hierarchy')
  await row.getByLabel('바코드 1 아웃박스 구성',{exact:true}).selectOption('EA');assert.equal(await row.locator('.barcode-packaging-inputs input').count(),2,'direct outer only needs outer and pallet')
  await row.getByLabel('바코드 1 아웃박스 구성',{exact:true}).selectOption('INNER')
  await select.selectOption('OUTER');assert.equal(await row.locator('.barcode-packaging-inputs input').count(),2,'outer using inner offers both missing dependencies')
  await select.selectOption('INNER');await barcode.fill('INLINE-QA')
  await row.getByText('사용 가능한 바코드입니다.',{exact:true}).waitFor()
  assert.equal(await select.evaluate(e=>e.checkValidity()),false)
  const pending=submitted
  await page.getByRole('button',{name:'상품 등록',exact:true}).click();assert.equal(submitted,pending);assert.equal(await page.getByRole('alertdialog').count(),0)
  await inline('인박스 수량').fill('0');assert.equal(await select.evaluate(e=>e.checkValidity()),false)
  await inline('인박스 수량').fill('1000000000');assert.equal(await select.evaluate(e=>e.checkValidity()),false)
  await inline('인박스 수량').fill('');await inline('인박스 수량').pressSequentially('12')
  assert.equal(await inline('인박스 수량').inputValue(),'12','multi-digit entry retains input and focus')
  assert.equal(await master('인박스 수량').inputValue(),'12');await barcode.focus();assert.equal(await inline('인박스 수량').count(),0)
  await master('인박스 수량').fill('');await inline('인박스 수량').waitFor();await master('인박스 수량').fill('10');assert.equal(await inline('인박스 수량').count(),0)
  await select.selectOption('OUTER');assert.equal(await inline('인박스 수량').count(),0);await inline('아웃박스 수량').waitFor()
  await row.getByLabel('바코드 1 아웃박스 구성',{exact:true}).selectOption('EA');assert.equal(await page.getByLabel('아웃박스 구성',{exact:true}).inputValue(),'EA')
  await inline('아웃박스 수량').fill('4');await barcode.focus();assert.equal(await inline('아웃박스 수량').count(),0);assert.match(await row.getByLabel('바코드 1 환산 수량',{exact:true}).textContent(),/4 EA/)
  await select.selectOption('EA');await select.selectOption('INNER');assert.equal(await master('아웃박스 수량').inputValue(),'4');assert.equal(await row.locator('.barcode-packaging-inputs').count(),0)
  await master('인박스 수량').fill('');await select.selectOption('OUTER');assert.equal(await select.evaluate(e=>e.checkValidity()),true,'direct EA outer does not require inner')
  await page.getByLabel('아웃박스 구성',{exact:true}).selectOption('INNER');await inline('인박스 수량').fill('5');await barcode.focus()
  assert.match(await row.getByLabel('바코드 1 환산 수량',{exact:true}).textContent(),/20 EA/)
  await master('아웃박스 수량').fill('');await inline('아웃박스 수량').waitFor()
  await inline('아웃박스 수량').fill('3');await inline('아웃박스 수량').press('.')
  assert.equal(await master('아웃박스 수량').inputValue(),'3','existing integer input rejects decimal key')
  await inline('아웃박스 수량').fill('4');await barcode.focus()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await master('아웃박스 수량').fill('');
  for(const control of await row.locator('.barcode-packaging-inputs :is(input,select)').all()){
   const r=await control.boundingBox();assert(r.x>=0&&r.x+r.width<=width);assert.equal(r.height,40)
  }
  await inline('아웃박스 수량').fill('4');await barcode.focus()
  await select.selectOption('PALLET');await inline('파레트당 아웃박스').waitFor()
  assert.equal(await select.evaluate(e=>e.checkValidity()),false)
  await inline('파레트당 아웃박스').fill('0');assert.equal(await select.evaluate(e=>e.checkValidity()),false)
  await inline('파레트당 아웃박스').fill('1000000000');assert.equal(await select.evaluate(e=>e.checkValidity()),false)
  await inline('파레트당 아웃박스').fill('');await inline('파레트당 아웃박스').pressSequentially('12')
  assert.equal(await master('파레트당 아웃박스').inputValue(),'12');await barcode.focus()
  assert.equal(await row.locator('.barcode-packaging-inputs').count(),0)
  assert.match(await row.getByLabel('바코드 1 환산 수량',{exact:true}).textContent(),/240 EA/)
  await page.getByLabel('아웃박스 구성',{exact:true}).selectOption('EA')
  assert.match(await row.getByLabel('바코드 1 환산 수량',{exact:true}).textContent(),/48 EA/)
  await page.getByLabel('아웃박스 구성',{exact:true}).selectOption('INNER')
  await master('파레트당 아웃박스').fill('');await inline('파레트당 아웃박스').fill('12');await barcode.focus()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  if(width===1440){
   await page.getByRole('button',{name:'+ 바코드 추가',exact:true}).click()
   const second=page.getByRole('region',{name:'바코드 2 영역',exact:true})
   await second.getByLabel('바코드 2 포장 단위',{exact:true}).selectOption('OUTER')
   await master('아웃박스 수량').fill('')
   await inline('아웃박스 수량').fill('6')
   assert.equal(await second.locator('.barcode-packaging-inputs input').count(),0,'other barcode uses shared valid quantity')
   assert.match(await second.getByLabel('바코드 2 환산 수량',{exact:true}).textContent(),/30 EA/)
   await second.getByRole('button',{name:'바코드 삭제',exact:true}).click()
  }
  if(width===390){
   await page.getByRole('button',{name:'상품 등록',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click()
   await page.getByRole('alertdialog').waitFor({state:'hidden'});await page.waitForURL(origin+'/app/products')
   assert.equal(submitted.innerPackQuantity,5);assert.equal(submitted.outerPackQuantity,4);assert.equal(submitted.outerPackUnit,'INNER');assert.equal(submitted.barcodes[0].packageCode,'PALLET');assert.equal(submitted.palletPackQuantity,12)
   await goto('edit');assert.equal(await row.locator('.barcode-packaging-inputs').count(),0)
   await master('아웃박스 수량').fill('');await inline('아웃박스 수량').fill('7');await barcode.focus()
   await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'변경 버리고 계속',exact:true}).click()
   await goto('edit');assert.equal(await master('아웃박스 수량').inputValue(),'4','cancel did not save changed packaging')
   product=structuredClone(baselineProduct)
  }
  console.log('PASS inline packaging',width,height,'free selection, invalid guards, shared draft, EA/INNER outer, focus and layout')
 }
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});await goto('new')
  assert.equal(await page.getByRole('combobox',{name:'기준 단위',exact:true}).count(),0)
  for(const [label,value] of [['인박스 수량','10'],['아웃박스 수량','5'],['파레트당 아웃박스','20']])await page.getByRole('spinbutton',{name:label,exact:true}).fill(value)
  assert.match(await page.locator('.product-packaging-section').innerText(),/아웃박스 1개 = 50개.*파레트 1개 = 1,000개/)
  await page.getByRole('spinbutton',{name:'인박스 수량',exact:true}).fill('8')
  assert.match(await page.locator('.product-packaging-section').innerText(),/아웃박스 1개 = 40개/)
  await page.getByRole('button',{name:'+ 바코드 추가',exact:true}).click()
  assert.equal(await page.getByRole('combobox',{name:'바코드 1 포장 단위'}).locator('option[value=PALLET]').isDisabled(),false)
  await page.getByRole('combobox',{name:'바코드 1 포장 단위',exact:true}).selectOption('OUTER')
  assert.match(await page.getByRole('region',{name:'바코드 1 영역',exact:true}).innerText(),/40 EA/)
  const row=page.getByRole('region',{name:'바코드 1 영역',exact:true})
  await row.locator('.rack-barcode-input-row input').fill('QA-OUTER')
  await page.getByRole('spinbutton',{name:'아웃박스 수량',exact:true}).fill('')
  await row.getByRole('alert').waitFor()
  assert.equal(await row.getByRole('combobox',{name:'바코드 1 포장 단위'}).inputValue(),'OUTER')
  assert.equal(await row.locator('.rack-barcode-input-row input').inputValue(),'QA-OUTER')
  assert.equal(await row.getByRole('combobox',{name:'바코드 1 포장 단위'}).evaluate(el=>el.checkValidity()),false)
  await page.getByRole('spinbutton',{name:'아웃박스 수량',exact:true}).fill('5')
  assert.equal(await row.getByRole('combobox',{name:'바코드 1 포장 단위'}).evaluate(el=>el.checkValidity()),true)
  if(width>=1440){
   const select=await row.getByRole('combobox',{name:'바코드 1 포장 단위'}).boundingBox(),input=await row.locator('.rack-barcode-input-row input').boundingBox()
   assert(input.y>select.y+select.height,'barcode value has its own row')
   const factor=await row.getByLabel('바코드 1 환산 수량',{exact:true}).boundingBox()
   assert(Math.abs(select.y-factor.y)<2,'unit and conversion share a row')
   assert(Math.abs(select.height-input.height)<2,'barcode control heights')
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} packaging overflow`)
  await goto('list');await page.getByRole('button',{name:'엑셀 대량등록',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'상품 엑셀 대량등록',exact:true});await dialog.waitFor()
  assert.equal(await dialog.getByRole('link',{name:width<=1024?'엑셀 양식':'엑셀 양식 다운로드',exact:true}).getAttribute('href'),endpoint+'/import-template')
  if(width===1440){const downloaded=page.waitForEvent('download');await dialog.getByRole('link',{name:'엑셀 양식 다운로드',exact:true}).click();const file=await downloaded;assert.equal(file.suggestedFilename(),'아이블WMS_상품대량등록_양식.xlsx');assert.equal(await file.failure(),null)}
  await dialog.getByLabel('상품 등록 파일',{exact:true}).setInputFiles({name:'products.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('mock-parser-input')})
  await dialog.getByRole('status').filter({hasText:'오류 0건'}).waitFor()
  const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=width&&box.height<=1000)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} import overflow`)
  await dialog.getByRole('button',{name:'취소',exact:true}).click()
  console.log(`PASS ${width}px EA/packaging live factors, barcode package selector, import dialog`)
 }
 await page.setViewportSize({width:1440,height:1000});await goto('edit')
 await page.getByRole('spinbutton',{name:'인박스 수량',exact:true}).fill('10');await page.getByRole('spinbutton',{name:'아웃박스 수량',exact:true}).fill('5')
 await page.getByRole('spinbutton',{name:'파레트당 아웃박스',exact:true}).fill('20')
 for(const [i,code] of ['EA','INNER','OUTER','PALLET'].entries()){
  if(code==='EA'){const scan=page.getByRole('textbox',{name:'등록할 바코드 스캔',exact:true});await scan.fill('QA-EA');await scan.press('Enter')}else await page.getByRole('button',{name:'+ 바코드 추가',exact:true}).click()
  const row=page.getByRole('region',{name:`바코드 ${i+1} 영역`,exact:true})
  await row.locator('.rack-barcode-input-row input').fill('QA-'+code)
  await row.getByRole('combobox',{name:`바코드 ${i+1} 포장 단위`}).selectOption(code)
  await row.getByText('사용 가능한 바코드입니다.',{exact:true}).waitFor()
 }
 await page.locator('.work-detail-actions').getByRole('button',{name:'변경사항 저장',exact:true}).click()
 await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click()
 await page.getByRole('status').filter({hasText:'변경사항을 저장했습니다.'}).waitFor()
 assert.deepEqual(submitted.barcodes.map(b=>b.packageCode),['EA','INNER','OUTER','PALLET']);
 assert.equal(submitted.barcodes[0].barcodeType,'External');assert.equal(submitted.barcodes[0].change.value,'QA-EA');assert.equal(submitted.unit,'EA');assert.equal(submitted.innerPackQuantity,10);assert.equal(submitted.outerPackQuantity,5)
 await goto('edit');assert.equal(await page.getByRole('spinbutton',{name:'인박스 수량',exact:true}).inputValue(),'10')
 for(const [i,code] of ['EA','INNER','OUTER','PALLET'].entries())assert.equal(await page.getByRole('combobox',{name:`바코드 ${i+1} 포장 단위`}).inputValue(),code)
 product.unit='BOX';product.innerPackQuantity=null;product.outerPackQuantity=null;await goto('edit')
 assert(await page.getByRole('spinbutton',{name:'인박스 수량',exact:true}).isDisabled());product.unit='EA'
 await goto('list');await page.getByRole('button',{name:'엑셀 대량등록',exact:true}).click()
 const dialog=page.getByRole('dialog');invalid=true
 const upload=()=>dialog.getByLabel('상품 등록 파일',{exact:true}).setInputFiles({name:'products.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('fixture')})
 await upload();await dialog.getByRole('cell',{name:'8행',exact:true}).first().waitFor();assert.match(await dialog.getByRole('status').innerText(),/전체 1건 \/ 정상 0건 \/ 오류 2건/);assert.equal(await dialog.getByRole('cell',{name:'8행',exact:true}).count(),2);assert(await dialog.getByRole('button',{name:'최종 일괄등록'}).isDisabled())
 invalid=false;await upload();await dialog.getByRole('status').filter({hasText:'오류 0건'}).waitFor()
 await dialog.getByRole('button',{name:'최종 일괄등록'}).click();await dialog.waitFor({state:'hidden'});assert.equal(commits,1)
 assert.equal(downloads,1);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS save/reload, legacy protection, error rows block bulk import, stable request ID and successful refresh; no real writes')
}catch(e){console.error({errors,unexpected,body:await browser.contexts()[0]?.pages()[0]?.locator('body').innerText()});throw e}finally{await browser.close()}
