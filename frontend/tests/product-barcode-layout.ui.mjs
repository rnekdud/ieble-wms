import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',baseline=process.env.BASELINE_ORIGIN,endpoint='/api/tenants/fixture-tenant/products'
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
  if(path==='/api/tenants/fixture-tenant/workspace')return json({id:'fixture-tenant',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{products:['menu','read','create','update','delete']}})
  if(path==='/api/tenants/fixture-tenant/pages/products')return json({})
  if(path==='/api/auth/csrf')return json({token:'fixture'})
  if(req.method()==='GET'){
   if(path===endpoint+'/options')return json({units:['EA','BOX','kg'],categories:[],productTypes:[]})
   if(path===endpoint+'/'+product.id)return json({product,canViewCost:true})
   if(path===endpoint)return json({items:[{product}],total:1,pageSize:20})
   if(path.endsWith('/barcodes/check'))return json(url.searchParams.get('value')==='TAKEN'?{available:false,conflict:{kind:'product',id:'other-product',code:'OTHER',name:'중복 상품명이 매우 긴 격리 QA 상품'}}:{available:true})
  }else{
   if(path===endpoint+'/barcode-candidates')return json({value:'WMS12345678901234567',proof:'fixture-proof'})
   throw new Error('Unexpected write: '+path)
  }
  unexpected.push(path);return route.fulfill({status:404,json:{message:'Unexpected fixture request'}})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 const goto=async(mode)=>{await page.goto(origin+(mode==='list'?'/app/products':mode==='new'?'/app/products/new':'/app/products/'+product.id));await page.getByRole(mode==='list'?'button':'textbox',{name:mode==='list'?'엑셀 대량등록':'상품명',exact:true}).waitFor()}
 const otherFields=()=>page.locator('.product-master-sections > .dialog-section:not(.product-barcode-section)').evaluateAll(sections=>sections.map(section=>({name:section.getAttribute('aria-label'),fields:[...section.querySelectorAll('input,select,textarea')].map(e=>({name:e.getAttribute('aria-label')||e.type,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,x:e.getBoundingClientRect().x,value:e.value}))})))
 const widths=process.env.UI_WIDTHS?.split(',').map(Number)||[360,390,430,768,1024,1280,1440,1920]
 for(const width of widths){
  await page.setViewportSize({width,height:1000})
  for(const mode of ['new','edit']){
   let before
   if(baseline){await page.goto(baseline+(mode==='new'?'/app/products/new':'/app/products/'+product.id));await page.getByRole('textbox',{name:'상품명',exact:true}).waitFor();before=await otherFields()}
   await goto(mode)
   if(before)assert.deepEqual(await otherFields(),before,'other product fields unchanged')
   const section=page.getByRole('region',{name:'바코드 관리 영역',exact:true})
   if(mode==='new'){
    await section.getByLabel('등록할 바코드 스캔',{exact:true}).fill('8809557989330')
    await section.getByRole('button',{name:'바코드 추가',exact:true}).click()
    await section.getByRole('button',{name:'+ 바코드 추가',exact:true}).click()
    await section.getByLabel('상품 바코드 2',{exact:true}).fill('SECOND-001')
   }
   await page.waitForFunction(()=>document.querySelectorAll('.barcode-check.available').length===2)
   await section.scrollIntoViewIfNeeded()
   const m=await section.evaluate(e=>{
    const r=el=>{const b=el.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}}
    const one=s=>r(e.querySelector(s)),many=s=>[...e.querySelectorAll(s)].map(r)
    return {box:r(e),title:one('h3'),add:one('.product-barcode-toolbar button'),inputs:one('.product-barcode-inputs'),preview:one('.product-barcode-preview'),scan:many('.barcode-input-row input,.barcode-input-row > button'),controls:many('.product-barcode-row input:not([type=checkbox]),.product-barcode-row select,.rack-barcode-input-row button,.rack-barcode-label select,.rack-barcode-label button'),deletes:many('.product-barcode-delete'),unit:one('.product-barcode-entry select'),factor:one('.product-barcode-factor output'),value:one('.rack-barcode-input-row'),meta:one('.product-barcode-meta'),image:one('.rack-barcode-label img'),label:one('.rack-barcode-label > label'),select:one('.rack-barcode-label select'),overflow:document.documentElement.scrollWidth>innerWidth+1,previewBg:getComputedStyle(e.querySelector('.product-barcode-preview')).backgroundColor}
   })
   assert(!m.overflow,`${mode} ${width} document overflow`)
   for(const box of [...m.scan,...m.controls,...m.deletes,m.image,m.preview])assert(box.x>=m.box.x-1&&box.right<=m.box.right+1,`${width} control contained ${JSON.stringify(box)}`)
   assert(Math.abs(m.title.y+m.title.h/2-m.add.y-m.add.h/2)<1,'toolbar same row')
   assert(m.deletes.every(b=>b.w===36&&b.h===36),'36px trash icon '+JSON.stringify(m.deletes))
   assert(m.controls.every(b=>b.h===40),'40px controls '+JSON.stringify(m.controls))
   assert(m.scan.every(b=>b.h===40),'40px scan controls')
   if(width>600)assert(m.scan.every(b=>Math.abs(b.y-m.scan[0].y)<1),'scan same row')
   assert(Math.abs(m.unit.y-m.factor.y)<1,'unit/conversion aligned')
   assert(m.value.y>=m.unit.bottom+15,'barcode own row')
   assert(m.meta.y>m.value.bottom,'purpose/type below value')
   assert.equal(m.select.w,m.label.w,'label size full width')
   assert.equal(m.previewBg,'rgb(255, 255, 255)')
   if(width>1024){assert(Math.abs(m.preview.y-m.inputs.y)<1);assert(Math.abs(m.inputs.w/m.preview.w-1.5)<0.02);assert(m.preview.h<m.inputs.h,'preview not stretched')}
   else{assert(m.preview.y>=m.inputs.bottom+15);assert(Math.abs(m.preview.w-m.inputs.w)<1)}
   const second=section.getByRole('region',{name:'바코드 2 영역',exact:true})
   await second.getByRole('checkbox',{name:'대표',exact:true}).check()
   assert.equal(await section.locator('input[type=checkbox]:checked').count(),1)
   await section.getByRole('img',{name:mode==='new'?'상품 바코드 SECOND-001':'상품 바코드 EXISTING-002',exact:true}).waitFor()
   await second.getByRole('button',{name:'바코드 삭제',exact:true}).click()
   assert.equal(await section.locator('.product-barcode-row').count(),1)
   await section.getByRole('img',{name:mode==='new'?'상품 바코드 8809557989330':'상품 바코드 EXISTING-001',exact:true}).waitFor()
   const value=section.getByLabel('상품 바코드 1',{exact:true})
   await value.fill('TAKEN')
   const link=section.getByRole('link',{name:'상품 확인 ↗',exact:true});await link.waitFor()
   assert.equal(await link.getAttribute('href'),'/app/products/other-product')
   assert.equal(await value.evaluate(e=>e.checkValidity()),false)
   assert.equal(await section.locator('.product-barcode-value-field .barcode-check.error').count(),1)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'long duplicate message wraps')
   await value.fill('RESTORED-001')
   await page.waitForFunction(()=>document.querySelector('.barcode-check.available'))
   console.log(`PASS ${width}px ${mode}: toolbar, scan, 40px fields, 36px trash, ${width>1024?'60/40 preview':'stacked preview'}, primary/delete/duplicate and no overflow`)
  }
 }
 await page.getByRole('button',{name:'자동 생성',exact:true}).click()
 const confirm=page.getByRole('dialog',{name:'바코드 자동 생성 확인',exact:true});await confirm.waitFor()
 await confirm.getByRole('button',{name:'확인',exact:true}).click()
 await page.getByRole('img',{name:'상품 바코드 WMS12345678901234567',exact:true}).waitFor()
 assert.equal(await page.locator('.product-barcode-meta select').isDisabled(),true)
 await page.getByRole('button',{name:'이미지 다운로드',exact:true}).click()
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'SVG 다운로드',exact:true}).click();const file=await pending
 assert(file.suggestedFilename().endsWith('.svg'));assert.equal(await file.failure(),null)
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS mocked generation confirmation/proof, generated type lock, SVG download; all API requests intercepted, no real data writes')
}finally{await browser.close()}
