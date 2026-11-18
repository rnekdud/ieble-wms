import { selectPlanObject } from './plan-scene.mjs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const fullApp=process.env.WMS_FULL_APP==='1'
const tenant='11111111-1111-4111-8111-111111111111'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',version='00000000-0000-0000-0000-000000000001'
const zone={id:'z1',code:'Z-01',name:'보관구역 A',version,isActive:true}
const rack={id:'r1',code:'R-01',name:'랙 A-01',zoneId:'z1',levels:3,bays:4,version,isActive:true}
let plan={exists:true,version,schemaVersion:1,aspectRatio:1.5,objects:[{id:'zo',type:'zone',label:zone.name,x:.5,y:.5,width:.8,height:.8,rotation:0,fill:'#eeeeee',shape:'rectangle',zoneId:'z1',rackId:null,locationId:null},{id:'ro',type:'rack',label:rack.name,x:.5,y:.5,width:.24,height:.1,rotation:0,fill:'#ffc107',shape:'rectangle',rackId:'r1',zoneId:null,locationId:null}]}
const original=structuredClone(plan),writes=[],errors=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname
  assert.equal(u.origin,origin)
  if(p==='/__rotation')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/plan-rotation-ui.tsx"></script></html>'})
  if(!p.startsWith('/api/'))return route.continue()
  const json=v=>route.fulfill({json:v})
  if(p==='/api/auth/csrf')return json({token:'mock'})
  if(p==='/api/auth/me')return json({user:{id:'qa-user',displayName:'QA',userName:'QA',email:'qa@example.test',systemRole:'User',mustChangePassword:false},memberships:[{tenantId:tenant,name:'회전 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:tenant})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p===`/api/tenants/${tenant}/workspace`)return json({id:tenant,name:'회전 QA 기업',role:'Master',permissions:{warehouses:['menu','read','readAll','create','update','delete']},serviceStatus:'Active',billingAccess:{canAccessWms:true},canManageBilling:false})
  if(p.includes('/pages/'))return json({})

  if(req.method()==='POST'){
   assert(p.endsWith('/w1/workspace'));const body=req.postDataJSON();writes.push(body);plan={...body.plan,exists:true};return json({warehouseId:'w1',code:'WH1',zones:{z1:'z1'},racks:{r1:'r1'},floorLocations:{},rackLocations:{}})
  }
  assert.equal(req.method(),'GET')
  if(p.endsWith('/workspace'))return json({detail:{warehouse:{id:'w1',code:'WH1',name:'회전 QA 창고',contactUserId:'qa-user',contactName:'QA',isActive:true,version},zones:[zone],racks:[rack],locationCount:12},floorLocations:[],plan})
  if(p.endsWith('/warehouses'))return json({items:[],total:0,page:1,pageSize:20})
  if(p.endsWith('/warehouses/w1'))return json({warehouse:{id:'w1',code:'WH1',name:'회전 QA 창고',contactUserId:'qa-user',contactName:'QA',isActive:true,version},zones:[zone],racks:[rack],locationCount:12})
  if(p.endsWith('/locations'))return json({items:[],total:0,page:1,pageSize:20,inventoryAvailable:true})
  if(p.endsWith('/front'))return json({rack,locations:Array.from({length:12},(_,i)=>({location:{id:'l'+i,code:'L-'+i,name:`${Math.floor(i/4)+1}단 ${i%4+1}칸`,level:Math.floor(i/4)+1,bay:i%4+1,isActive:true,version}}))})
  if(p.includes('assignees'))return json({items:[],total:0})
  throw Error('Unexpected request '+p)
 })
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 async function openEditor(){if(fullApp){await page.getByRole('button',{name:'도면 편집',exact:true}).click();await page.evaluate(()=>import('/tests/fixtures/plan-rotation-probe.ts'))}await page.locator('.workspace-structure-tree').waitFor()}
 await page.goto(fullApp?origin+'/app/warehouses?warehouseId=w1&tab=plan':origin+'/__rotation');await openEditor()
 const scene=()=>page.evaluate(()=>{const stage=window.qaKonva.stages.find(s=>s.container().isConnected),node=stage.findOne('#ro'),tr=stage.findOne('Transformer'),anchor=tr.findOne('.rotater'),box=stage.container().getBoundingClientRect(),p=node.getAbsolutePosition(),a=anchor.getAbsolutePosition();return {center:{x:box.x+p.x,y:box.y+p.y},handle:{x:box.x+a.x,y:box.y+a.y},rotation:node.rotation(),size:{width:node.findOne('Rect').width(),height:node.findOne('Rect').height()},anchorWidth:anchor.width(),visible:anchor.isVisible(),fill:node.findOne('Rect').fill()}})
 const canvas=page.locator('.warehouse-plan-canvas'),props=page.getByRole('complementary',{name:'선택 객체 속성'}),angle=props.getByLabel('객체 회전',{exact:true})
 const select=async()=>{await canvas.scrollIntoViewIfNeeded();const s=await scene();await page.mouse.click(s.center.x,s.center.y);await angle.waitFor()}
 await select()
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});await props.scrollIntoViewIfNeeded()
  const layout=await props.evaluate(el=>{const rect=selector=>{const e=el.querySelector(selector),r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};return {code:rect('[aria-label="랙 코드"]'),zone:rect('[aria-label="랙 소속 구역"]'),rotation:rect('[aria-label="객체 회전"]'),color:rect('.plan-color-control'),check:rect('.rack-active-field'),overflow:el.scrollWidth>el.clientWidth+1,gap:getComputedStyle(el.querySelector('.rack-secondary-row')).gap}})
  assert.equal(layout.overflow,false);assert.equal(layout.code.y,layout.zone.y);assert.equal(layout.rotation.y,layout.color.y);assert.equal(layout.rotation.height,40);assert.equal(layout.color.height,40);assert(Math.abs(layout.rotation.width-layout.color.width)<1);assert.equal(layout.gap,'16px 12px');assert(layout.check.y>=layout.color.bottom);assert(layout.rotation.y>layout.code.bottom)
  assert.equal(await props.getByLabel('객체 색상',{exact:true}).count(),1)
  console.log('PASS properties',width)
 }
 await page.setViewportSize({width:1440,height:1000});await canvas.scrollIntoViewIfNeeded();await page.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click()
 const start=await scene();assert(start.visible);assert.equal(start.anchorWidth,22)
 assert(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName==='CANVAS',start.handle),'rotation handle is not hidden by DOM label')
 const radius=Math.hypot(start.handle.x-start.center.x,start.handle.y-start.center.y),initial=Math.atan2(start.handle.y-start.center.y,start.handle.x-start.center.x)
 await page.mouse.move(start.handle.x,start.handle.y);await page.mouse.down()
 for(let i=1;i<=12;i++){const a=initial+Math.PI/2*i/12;await page.mouse.move(start.center.x+radius*Math.cos(a),start.center.y+radius*Math.sin(a))}
 assert(Math.abs(Number(await angle.inputValue())-90)<1,'live rotation in panel before mouseup');assert.equal(writes.length,0)
 await page.mouse.up();assert(Math.abs((await scene()).rotation-90)<1);assert.deepEqual((await scene()).size,start.size);assert(Math.abs((await scene()).center.x-start.center.x)<.1);assert(Math.abs((await scene()).center.y-start.center.y)<.1)
 await page.getByRole('button',{name:'도면 실행 취소',exact:true}).click();assert.equal((await scene()).rotation,0);assert(await page.getByRole('button',{name:'도면 실행 취소',exact:true}).isDisabled(),'one drag is one history entry')
 await page.getByRole('button',{name:'도면 다시 실행',exact:true}).click();assert(Math.abs((await scene()).rotation-90)<1)
 await angle.fill('37.25');assert.equal((await scene()).rotation,37.25)
 const color=props.getByLabel('객체 색상',{exact:true});await color.fill('#123456');assert.equal((await scene()).fill,'#123456');assert.equal(await props.locator('.plan-color-control > span').innerText(),'#123456')
 await props.getByRole('checkbox',{name:'랙 사용'}).uncheck();await props.getByRole('checkbox',{name:'랙 사용'}).check()
 await selectPlanObject(page,'zo');await angle.fill('5');assert.equal(await angle.inputValue(),'5');await selectPlanObject(page,'ro');assert.equal(await angle.inputValue(),'37.25');await selectPlanObject(page,'zo');await angle.fill('0');await selectPlanObject(page,'ro');
 assert.equal(writes.length,0)
 await page.getByRole('button',{name:'창고 저장',exact:true}).click();const response=page.waitForResponse(r=>r.url().endsWith('/workspace')&&r.request().method()==='POST');await page.getByRole('dialog',{name:'창고 및 도면 저장 확인'}).getByRole('button',{name:'확인',exact:true}).click();assert.equal((await response).status(),200)
 assert.equal(writes.length,1)
 const saved=writes[0].plan.objects.find(o=>o.id==='ro');assert.equal(saved.rotation,37.25);assert.equal(saved.fill,'#123456');assert.deepEqual({...saved,rotation:0,fill:'#ffc107'},original.objects[1]);assert.deepEqual(writes[0].plan.objects.find(o=>o.id==='zo'),original.objects[0]);assert.equal(writes[0].racks[0].id,'r1');assert.equal(writes[0].racks[0].levels,3);assert.equal(writes[0].racks[0].bays,4)
 await page.reload();await openEditor();await select();assert.equal(await angle.inputValue(),'37.25');assert.equal((await scene()).rotation,37.25)
 // A new out-of-bounds rotation is rejected without moving/deleting the existing object.
 await angle.fill('0');await props.getByLabel('객체 y',{exact:true}).fill('6');await angle.fill('90');await page.getByRole('alert').filter({hasText:'도면 밖'}).waitFor();assert.equal((await scene()).rotation,0);assert.equal(await angle.inputValue(),'0')
 assert.deepEqual(errors,[]);console.log('PASS actual mouse rotation, preview sync, stable center/size, one undo entry, field/color updates, ID-preserving save/reload and invalid rotation rollback. Business APIs mocked.',origin)
}finally{await browser.close()}
