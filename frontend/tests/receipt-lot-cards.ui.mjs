import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',baseline=process.env.BASELINE_ORIGIN
const root='/api/tenants/fixture',url=root+'/receipts/11111111-1111-4111-8111-111111111111'
const initial=()=>({receipt:{id:'11111111-1111-4111-8111-111111111111',number:'IN-QA',status:'Inspecting',warehouseId:'w',warehouseName:'QA',expectedDate:'2026-11-17',version:'1',inspectedAt:null},lines:[{id:'l1',productId:'p1',productCode:'P1',productName:'QA 상품',unit:'EA',expectedQuantity:100,inspectedQuantity:100,lotNumber:null,expiryDate:null,serials:[],placements:[],trackingAllocations:[]}]})
let data=initial(),fail=false
const errors=[],unexpected=[],writes=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block'})
 for(const server of [origin,baseline].filter(Boolean))await context.routeWebSocket(server.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname,json=value=>route.fulfill({json:value})
  assert([origin,baseline].includes(u.origin))
  if(!p.startsWith('/api/'))return route.continue()
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'})
  if(p==='/api/auth/csrf')return json({token:'mock'})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p===root+'/workspace')return json({id:'fixture',name:'QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{receipts:['menu','read','create','update','confirm']}})
  if(p===root+'/pages/receipts')return json({})
  if(req.method()==='GET'){
   if(p===url)return json(data)
   if(p.endsWith('/inspection-history')||p.endsWith('/choices'))return json({items:[],total:0,page:1,pageSize:20})
  }
  if(req.method()==='POST'&&p===url+'/tracking'){
   const body=req.postDataJSON();writes.push(body)
   if(fail)return route.fulfill({status:500,json:{message:'QA 저장 실패'}})
   data.lines[0].trackingAllocations=body.lines[0].allocations;data.receipt.version=String(Number(data.receipt.version)+1);return json(data)
  }
  unexpected.push(p);return route.abort()
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 const open=async(p=page,server=origin)=>{await p.goto(server+'/app/receipts/11111111-1111-4111-8111-111111111111');await p.getByRole('button',{name:'QA 상품 LOT 관리',exact:true}).click();return p.getByRole('dialog',{name:'추적 정보 관리',exact:true})}
 const dialog=page.getByRole('dialog',{name:'추적 정보 관리',exact:true})
 const add=()=>dialog.getByRole('button',{name:'+ LOT 추가',exact:true}).click()
 const fill=async(n,number,qty)=>{await dialog.getByLabel('LOT 번호 '+n,{exact:true}).fill(number);await dialog.getByLabel('LOT 유통기한 '+n,{exact:true}).fill('2027-05-10');await dialog.getByLabel('LOT 수량 '+n,{exact:true}).fill(qty)}
 const lot=()=>dialog.getByRole('tab',{name:/LOT/}).click(),serial=()=>dialog.getByRole('tab',{name:/시리얼/}).click(),save=()=>dialog.getByRole('button',{name:'저장',exact:true}).click()
 const metrics=async d=>d.evaluate(el=>{
  const r=e=>{const b=e.getBoundingClientRect();return [b.x,b.y,b.width,b.height]}
  return {dialog:r(el),body:r(el.querySelector('.dialog-body')),footer:r(el.querySelector('footer')),controls:[...el.querySelectorAll('input,select,textarea,button')].filter(e=>e.getClientRects().length).map(e=>[e.getAttribute('aria-label')||e.textContent.trim(),...r(e)]),table:el.querySelector('table')?r(el.querySelector('table')):null}
 })
 const oldPage=baseline?await context.newPage():null
 for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1440,900]]){
  data=initial();await page.setViewportSize({width,height});await open();assert.equal(await dialog.getByRole('status').count(),0)
  await add();await fill(1,'LOT-001','50');await add();await fill(2,'LOT-002','50')
  await dialog.getByRole('status').filter({hasText:'LOT 검수수량 합계 100 EA'}).waitFor()
  await dialog.locator('.dialog-body').evaluate(e=>e.scrollTop=0)
  const geometry=await dialog.evaluate(el=>{
   const body=el.querySelector('.dialog-body'),scroller=el.querySelector('.receipt-lot-scroll'),row=el.querySelector('tbody tr'),r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}}
   return {dialog:r(el),body:r(body),footer:r(el.querySelector('footer')),overflow:el.scrollWidth>el.clientWidth+1,tableOverflow:scroller.scrollWidth>scroller.clientWidth+1,rowDisplay:getComputedStyle(row).display,scrollOverflow:getComputedStyle(scroller).overflowY,fields:[...row.querySelectorAll('input')].map(e=>({rect:r(e),parent:r(e.parentElement),mode:e.inputMode})),delete:r(row.querySelector('button')),hit:parseFloat(getComputedStyle(row.querySelector('button'),'::before').left),title:getComputedStyle(row.querySelector('strong')).display}
  })
  assert(!geometry.overflow);assert(!geometry.tableOverflow);assert(geometry.dialog.x>=0&&geometry.dialog.right<=width+1);assert(geometry.footer.bottom<=height&&geometry.footer.y>=0)
  if(width<=1024){
   assert.equal(geometry.rowDisplay,'grid');assert.equal(geometry.scrollOverflow,'visible');assert.equal(geometry.delete.w,36);assert.equal(geometry.delete.h,36);assert.equal(geometry.hit,-4)
   for(const c of geometry.fields){assert.equal(c.rect.h,40);assert(Math.abs(c.rect.w-c.parent.w)<1);assert(c.rect.x>=geometry.body.x&&c.rect.right<=geometry.body.right)}
   assert.equal(geometry.fields[2].mode,'numeric');assert.notEqual(geometry.title,'none')
   // Scroll into view then verify and click the transparent part of the 44px hit area.
   const button=dialog.getByRole('button',{name:'LOT 2 삭제',exact:true});await button.scrollIntoViewIfNeeded();const b=await button.boundingBox(),x=b.x-2,y=b.y+b.height/2
   assert(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('button')?.getAttribute('aria-label')==='LOT 2 삭제',{x,y}))
   await page.mouse.click(x,y);assert.equal(await dialog.getByLabel('LOT 번호 2',{exact:true}).count(),0);await add();await fill(2,'LOT-002','50')
  }else assert.equal(geometry.rowDisplay,'table-row')
  if(oldPage){
   await oldPage.setViewportSize({width,height});const old=await open(oldPage,baseline)
   for(let n=1;n<=2;n++){await old.getByRole('button',{name:'+ LOT 추가',exact:true}).click();await old.getByLabel('LOT 번호 '+n,{exact:true}).fill('LOT-00'+n);await old.getByLabel('LOT 유통기한 '+n,{exact:true}).fill('2027-05-10');await old.getByLabel('LOT 수량 '+n,{exact:true}).fill('50')}
   if(width===1440){await dialog.locator('.dialog-body').evaluate(e=>e.scrollTop=0);assert.deepEqual(await metrics(dialog),await metrics(old),'PC table geometry unchanged')}
   await serial();await old.getByRole('tab',{name:/시리얼/}).click();await dialog.locator('.dialog-body').evaluate(e=>e.scrollTop=0);await old.locator('.dialog-body').evaluate(e=>e.scrollTop=0);assert.deepEqual(await metrics(dialog),await metrics(old),'serial tab geometry unchanged '+width);await lot()
  }
  await serial();await dialog.getByLabel('추가 시리얼 LOT',{exact:true}).selectOption({label:'LOT-001 · 2027-05-10'});await dialog.getByLabel('시리얼 일괄 입력',{exact:true}).fill('SN1\nSN2');await dialog.getByRole('button',{name:'목록에 추가',exact:true}).click();await lot()
  assert.equal(await dialog.getByLabel('LOT 번호 1',{exact:true}).inputValue(),'LOT-001')
  await save();await dialog.waitFor({state:'hidden'});assert.equal(writes.at(-1).lines[0].allocations.length,2);assert.deepEqual(writes.at(-1).lines[0].allocations[0].serials,['SN1','SN2'])
  await open();assert.equal(await dialog.getByLabel('LOT 수량 2',{exact:true}).inputValue(),'50');await dialog.getByRole('button',{name:'취소',exact:true}).click()
  console.log(`PASS ${width}x${height}: ${geometry.rowDisplay}, fields fit, no horizontal/nested LOT scroll, footer visible, delete edge, tabs/serial link/mock save/reload`)
 }
 await page.setViewportSize({width:390,height:500});data=initial();await open();await add();await save();await dialog.getByRole('alert').filter({hasText:'LOT 번호 또는 유통기한'}).waitFor()
 await fill(1,'LOT-A','101');await save();await dialog.getByRole('alert').filter({hasText:'초과'}).waitFor();await dialog.getByLabel('LOT 수량 1',{exact:true}).fill('50')
 await serial();await dialog.getByLabel('추가 시리얼 LOT',{exact:true}).selectOption({label:'LOT-A · 2027-05-10'});await dialog.getByLabel('시리얼 일괄 입력',{exact:true}).fill('SERIAL');await dialog.getByRole('button',{name:'목록에 추가',exact:true}).click();await lot()
 await dialog.getByRole('button',{name:'LOT 1 삭제',exact:true}).click();await serial();assert.equal(await dialog.getByLabel('시리얼 LOT 1',{exact:true}).inputValue(),'');assert.equal(await dialog.getByLabel('시리얼 번호 1',{exact:true}).inputValue(),'SERIAL');await lot()
 await add();await fill(1,'KEEP','50');fail=true;await save();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('LOT 번호 1',{exact:true}).inputValue(),'KEEP');fail=false;await save();await dialog.waitFor({state:'hidden'})
 await open();await dialog.getByLabel('LOT 번호 1',{exact:true}).fill('DISCARD');await dialog.getByRole('button',{name:'취소',exact:true}).click();await open();assert.equal(await dialog.getByLabel('LOT 번호 1',{exact:true}).inputValue(),'KEEP')
 for(let n=2;n<=8;n++){await add();await fill(n,'LONG-LOT-'+n,'1')}
 await dialog.getByLabel('LOT 수량 8',{exact:true}).focus();await dialog.getByLabel('LOT 수량 8',{exact:true}).scrollIntoViewIfNeeded();const input=await dialog.getByLabel('LOT 수량 8',{exact:true}).boundingBox(),footer=await dialog.locator('footer').boundingBox();assert(input.y>=0&&input.y+input.height<=footer.y);assert(footer.y+footer.height<=500)
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log('PASS empty/over-quantity errors, LOT deletion preserves serials, failure retains draft, cancel discards, short viewport input and footer access; all API mocked')
}finally{await browser.close()}
