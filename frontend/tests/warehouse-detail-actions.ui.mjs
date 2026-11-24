import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',root='/api/tenants/qa',errors=[],unknown=[],writes=[]
const initial={id:'w1',code:'WH01',name:'QA 상온 창고',type:'일반/상온',customCode:'QA01',isActive:true,version:'1',address:'',addressDetail:'',contactUserId:null,contactName:'',notes:'원본 메모'}
let warehouse={...initial},fail=false,canUpdate=true
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.routeWebSocket('**/*',()=>{})
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url()),p=u.pathname,json=(data,status=200)=>route.fulfill({json:data,status})
  assert.equal(u.origin,origin)
  if(!p.startsWith('/api/'))return route.continue()
  if(p==='/api/auth/csrf')return json({token:'fixture'})
  if(r.method()==='POST'){
   assert.equal(p,root+'/warehouses/w1');assert(canUpdate);const body=r.postDataJSON();assert.equal('code' in body,false);writes.push(body)
   await new Promise(resolve=>setTimeout(resolve,150))
   if(fail)return json({message:'QA 저장 실패'},409)
   warehouse={...warehouse,...body,version:String(Number(warehouse.version)+1)};return json(warehouse)
  }
  assert.equal(r.method(),'GET')
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'QA',userName:'qa',email:'qa@example.test',systemRole:'User',mustChangePassword:false},memberships:[{tenantId:'qa',name:'QA 기업',role:canUpdate?'Master':'Employee',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'qa'})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p===root+'/workspace')return json({id:'qa',name:'QA 기업',role:canUpdate?'Master':'Employee',permissions:{warehouses:canUpdate?['menu','read','create','update']:['menu','read']},serviceStatus:'Active',billingAccess:{canAccessWms:true},canManageBilling:false})
  if(p.startsWith(root+'/pages/'))return json({})
  if(p===root+'/warehouses')return json({items:[{warehouse,zoneCount:0,rackCount:0,locationCount:0}],total:1,page:1,pageSize:20})
  if(p===root+'/warehouses/w1')return json({warehouse,zones:[],racks:[],locationCount:0})
  if(p===root+'/warehouses/w1/workspace')return json({detail:{warehouse,zones:[],racks:[],locationCount:0},floorLocations:[],plan:{exists:false,objects:[],schemaVersion:1,aspectRatio:1.6,version:'1'}})
  if(p===root+'/assignees')return json({items:[],total:0,page:1,pageSize:20})
  unknown.push(p);return json({message:'Unexpected mock route'},404)
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 const header=page.locator('.warehouse-detail-header'),form=page.locator('.warehouse-inline-basics'),name=page.getByRole('textbox',{name:'창고명',exact:true})
 const cancel=page.getByRole('button',{name:'변경 취소',exact:true}),save=page.getByRole('button',{name:'변경사항 저장',exact:true}),back=page.getByRole('button',{name:'창고 목록으로',exact:true})
 for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]) {
  warehouse={...initial};await page.setViewportSize({width,height});await page.goto(origin+'/app/warehouses?warehouseId=w1');await name.waitFor();await save.waitFor()
  assert.equal(await header.getByRole('button').count(),3);assert.equal(await form.getByRole('button',{name:/변경 취소|변경사항 저장/}).count(),0);assert(await cancel.isDisabled());assert(await save.isDisabled())
  const boxes=await header.locator('.work-detail-actions button').evaluateAll(es=>es.map(e=>({name:e.getAttribute('aria-label')||e.textContent,rect:e.getBoundingClientRect().toJSON()})))
  assert.deepEqual(boxes.map(b=>b.name),['창고 목록으로','변경 취소','변경사항 저장'])
  for(let i=0;i<3;i++){const r=boxes[i].rect;assert(r.x>=0&&r.right<=width+1);assert.equal(r.height,40);if(i){assert(r.y>=boxes[i-1].rect.y);if(Math.abs(r.y-boxes[i-1].rect.y)<1)assert(Math.abs(r.x-boxes[i-1].rect.right-8)<1)}}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  await name.fill('변경 중');assert(await cancel.isEnabled());await cancel.click();assert.equal(await name.inputValue(),initial.name);assert(await save.isDisabled())
  await name.fill('');await save.click();assert(await name.evaluate(e=>e.validity.valueMissing));assert.equal(writes.length,0)
  await name.fill('미저장 창고');await back.click();const dialog=page.getByRole('dialog',{name:'저장하지 않은 창고 작업',exact:true});await dialog.waitFor();await dialog.getByRole('button',{name:'계속 편집'}).click();assert.equal(await name.inputValue(),'미저장 창고')
  await cancel.click();await page.getByRole('tab',{name:'창고 도면',exact:true}).click();await page.locator('#warehouse-panel-plan').waitFor();assert.equal(await cancel.count(),0);assert.equal(await save.count(),0);await page.getByRole('tab',{name:'창고 정보',exact:true}).click();await save.waitFor();assert(await save.isDisabled())
  console.log(`PASS ${width}x${height}: ordered header buttons, matched 40px heights/8px gaps, no footer duplicate/overflow, reset, validation, unsaved guard and tab lifecycle`)
 }
 await name.fill('저장 검증 창고');fail=true;await save.click();await page.getByRole('button',{name:'저장 중…',exact:true}).waitFor();assert(await cancel.isDisabled());await page.getByRole('alert').filter({hasText:'QA 저장 실패'}).waitFor();assert.equal(await name.inputValue(),'저장 검증 창고');assert(await cancel.isEnabled());assert.equal(writes.length,1)
 fail=false;await save.click();await page.waitForFunction(()=>document.querySelector('.warehouse-detail-header h2')?.textContent==='저장 검증 창고');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent==='변경사항 저장'&&e.disabled));assert.equal(writes.length,2);assert.equal(warehouse.code,'WH01');await page.reload();await name.waitFor();assert.equal(await name.inputValue(),'저장 검증 창고')
 await name.fill('버릴 변경');await back.click();await page.getByRole('button',{name:'변경 버리고 계속',exact:true}).click();await page.getByRole('button',{name:'창고 등록',exact:true}).waitFor();assert.equal(warehouse.name,'저장 검증 창고')
 // Registration keeps its existing wizard and has no detail-only actions.
 await page.getByRole('button',{name:'창고 등록',exact:true}).click();await page.locator('.warehouse-wizard').waitFor();assert.equal(await cancel.count(),0);assert.equal(await save.count(),0);assert.equal(await page.getByRole('button',{name:'다음: 도면 구성',exact:true}).count(),1)
 canUpdate=false;await page.goto(origin+'/app/warehouses?warehouseId=w1');await name.waitFor();assert(await name.isDisabled());assert.equal(await cancel.count(),0);assert.equal(await save.count(),0);assert.equal(await back.count(),1)
 assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);console.log('PASS mocked failure/retry/save/reload, immutable code, discard, unchanged registration and read-only permissions; no real writes')
}finally{await browser.close()}
