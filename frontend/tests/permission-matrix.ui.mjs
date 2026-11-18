import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',root='/api/tenants/fixture'
const feature=(key,label,actions,implementedActions=actions)=>({key,label,actions,implementedActions,roleActions:{Administrator:actions,Employee:key==='users'?['menu','read']:actions}})
const features=[feature('dashboard','대시보드',['menu','read']),feature('warehouses','창고관리',['menu','read','create','update','delete'],['menu','read','create','update']),feature('products','상품관리',['menu','read','create','update','delete']),feature('receipts','입고관리',['menu','read','create','update','confirm']),feature('stock-adjustments','재고 이동 및 조정',['menu','read','move','adjust']),feature('stocktake','재고 실사/조사',['menu','read','create','count','confirm']),feature('stock-overview','재고 현황',['menu','read']),feature('users','사용자 관리',['menu','read','create','update','manageUsers']),feature('support','문의하기',['menu','read','create','readAll'])]
const clone=x=>structuredClone(x),roles={Administrator:Object.fromEntries(features.map(f=>[f.key,f.actions])),Employee:Object.fromEntries(features.map(f=>[f.key,['menu','read']]))}
let settings={version:'v1',features,roles:clone(roles),defaults:clone(roles)},denied=false,writes=[]
const external=features.filter(f=>['warehouses','products','receipts','stock-adjustments'].includes(f.key)).map(f=>({...f,actions:f.implementedActions}))
let collaborator={id:'company1',name:'QA 협력사',version:'c1',isActive:true,partnerActive:true,memberCount:1,features:external,grants:Object.fromEntries(external.map(f=>[f.key,f.actions]))}
let individual={useIndividualPermissions:true,version:'u1',features:external,grants:clone(collaborator.grants),ceiling:{...clone(collaborator.grants),products:['menu','read']},collaboratorName:'QA 협력사'}
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[]
try{
 const context=await browser.newContext({serviceWorkers:'block'});await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;assert.equal(url.origin,origin)
  if(path==='/__permission-ui')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/permission-ui.tsx"></script></html>'})
  if(!path.startsWith('/api/'))return route.continue()
  const json=value=>route.fulfill({json:value})
  if(path==='/api/auth/csrf')return json({token:'fixture'})
  if(request.method()==='GET'){
   if(path===root+'/permissions')return json(settings)
   if(path===root+'/users')return json({items:[{userId:'user1',name:'QA 사용자',loginId:'qa',accountType:'External',companyName:'QA 협력사',isActive:true}],pageSize:20,total:1})
   if(path===root+'/permissions/users/user1')return json(individual)
   if(path===root+'/collaborators/choices')return json({items:[{id:'company1',name:'QA 협력사',code:'QA'}],total:1,pageSize:30})
   if(path===root+'/collaborators/company1')return json(collaborator)
   if(path.endsWith('/members'))return json({items:[],total:0,pageSize:20})
  }else{
   const body=request.postDataJSON();writes.push({path,body})
   if(denied)return route.fulfill({status:403,json:{message:'권한이 없습니다.'}})
   if(path===root+'/permissions'){settings={...settings,...body,version:'v2'};return json(settings)}
   if(path===root+'/permissions/users/user1'){individual={...individual,...body,version:'u2'};return json(individual)}
   if(path===root+'/collaborators/company1/permissions'){collaborator={...collaborator,...body,version:'c2'};return json(collaborator)}
  }
  throw Error('Unexpected API '+path)
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 const admin=()=>page.getByRole('region',{name:'기업 관리자 기능별 권한',exact:true})
 async function checkLayout(matrix){
  const headers=await matrix.locator('thead th').allTextContents();assert.deepEqual(headers.slice(0,6),['메뉴','메뉴 접근','조회','등록','수정','삭제']);assert.doesNotMatch(await matrix.innerText(),/허용|준비\s?중/)
  assert.ok(await matrix.locator('tbody td').evaluateAll(cells=>cells.every(c=>c.querySelectorAll('input').length<=1)))
  assert.ok(await matrix.locator('input').evaluateAll(inputs=>inputs.every(i=>{const a=i.getBoundingClientRect(),b=i.closest('td').getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<1&&Math.abs(a.y+a.height/2-b.y-b.height/2)<1&&a.width===18&&a.height===18})))
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
 }
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/__permission-ui');await admin().waitFor();await checkLayout(admin())
  assert.equal(await admin().getByRole('checkbox',{name:'기업 관리자 창고관리 삭제',exact:true}).count(),0)
  assert.equal(await admin().getByRole('checkbox',{name:'기업 관리자 대시보드 등록',exact:true}).count(),0)
  assert.ok(await admin().locator('.permission-child').count()>0)
  const first=admin().locator('thead th').first(),x=(await first.boundingBox()).x
  await admin().evaluate(e=>{e.scrollLeft=180;e.scrollTop=80});assert.ok(Math.abs((await first.boundingBox()).x-x)<1)
  console.log('PASS '+width+'px: matrix headers, centered checkboxes, unsupported cells, sidebar groups and contained scrolling')
 }
 await page.setViewportSize({width:1440,height:1000});await page.reload();await admin().waitFor()
 const update=admin().getByRole('checkbox',{name:'기업 관리자 상품관리 수정',exact:true});await update.uncheck();await page.getByRole('button',{name:'저장',exact:true}).click();await page.getByRole('button',{name:'확인 후 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'권한 설정을 저장했습니다.'}).waitFor()
 assert.ok(!settings.roles.Administrator.products.includes('update'));assert.ok(settings.roles.Administrator.warehouses.includes('delete'),'hidden legacy grants must remain unchanged');await page.reload();await admin().waitFor();assert.equal(await update.isChecked(),false)
 const menu=admin().getByRole('checkbox',{name:'기업 관리자 상품관리 메뉴 접근',exact:true});await menu.uncheck();for(const a of ['조회','등록','삭제'])assert.equal(await admin().getByRole('checkbox',{name:'기업 관리자 상품관리 '+a,exact:true}).isChecked(),false)
 const create=admin().getByRole('checkbox',{name:'기업 관리자 상품관리 등록',exact:true});await create.focus();await page.keyboard.press('Space');assert.equal(await menu.isChecked(),true);assert.equal(await create.isChecked(),true)
 await page.reload();await page.getByRole('button',{name:/^설정할 권한 /}).click();await page.getByRole('option').filter({hasText:'일반 직원'}).click();const employee=page.getByRole('region',{name:'일반 직원 기능별 권한'});assert.equal(await employee.getByRole('checkbox',{name:'일반 직원 사용자 관리 등록',exact:true}).count(),0)
 await page.getByRole('button',{name:'QA 사용자 접근 권한',exact:true}).click();const personal=page.getByRole('region',{name:'QA 사용자 개인별 업무 권한'});await personal.waitFor();await page.setViewportSize({width:390,height:1000});await checkLayout(personal);await page.setViewportSize({width:1440,height:1000});assert.equal(await personal.getByRole('checkbox',{name:'상품관리 등록',exact:true}).isEnabled(),false)
 await personal.getByRole('checkbox',{name:'창고관리 수정',exact:true}).uncheck();await page.getByRole('button',{name:'권한 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'저장했습니다.'}).waitFor();assert.ok(!individual.grants.warehouses.includes('update'));await page.getByRole('button',{name:'닫기',exact:true}).click()
 await page.getByRole('tab',{name:'외부 협력사',exact:true}).click();await page.getByRole('button',{name:/^외부 협력사 선택 /}).click();await page.getByRole('option').filter({hasText:'QA 협력사'}).click();const company=page.getByRole('region',{name:'QA 협력사 메뉴·기능 접근 권한'});await company.waitFor();for(const width of [1920,1440,1280,768,390]){await page.setViewportSize({width,height:1000});await checkLayout(company)}await page.setViewportSize({width:1440,height:1000});console.log('PASS collaborator matrix at all five widths and individual-access dialog at 390px')
 await company.getByRole('checkbox',{name:'입고관리 최종 확정',exact:true}).uncheck();await page.getByRole('button',{name:'권한 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'협력사 권한을 저장했습니다.'}).waitFor();assert.ok(!collaborator.grants.receipts.includes('confirm'))
 denied=true;await company.getByRole('checkbox',{name:'상품관리 수정',exact:true}).uncheck();await page.getByRole('button',{name:'권한 저장',exact:true}).click();await page.getByRole('alert').filter({hasText:'권한이 없습니다.'}).waitFor();assert.equal(await company.getByRole('checkbox',{name:'상품관리 수정',exact:true}).isChecked(),false);assert.ok(collaborator.grants.products.includes('update'))
 assert.equal(writes.length,4);assert.deepEqual(errors,[]);console.log('PASS role save/reload, hidden grant preservation, existing dependency rules, keyboard toggle, employee restrictions, individual ceiling, collaborator save/reload and denied save; real APIs never called')
}finally{await browser.close()}
