import { planObjects, selectPlanObject, waitPlanCount } from './plan-scene.mjs'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176'
const browser=await chromium.launch({channel:'chrome',headless:true})
const endpoint='/api/tenants/11111111-1111-4111-8111-111111111111/warehouses',wid='22222222-2222-4222-8222-222222222222',rid='33333333-3333-4333-8333-333333333333',oid='44444444-4444-4444-8444-444444444444',sid='55555555-5555-4555-8555-555555555555',v1='66666666-6666-4666-8666-666666666666',v2='77777777-7777-4777-8777-777777777777'
const item={version:v1,isActive:true,createdAt:'2026-11-10T00:00:00Z',updatedAt:'2026-11-10T00:00:00Z'}
const object={x:.3,y:.3,width:.2,height:.1,rotation:0,fill:'#ffffff',shape:'rectangle',zoneId:null,locationId:null}
try {
 for(const mode of ['workspace','saved']) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
  let calls=0,finishDelete,reachedDelete,deleted=false,saveBody
  const errors=[]
  const detail=()=>({warehouse:{...item,id:wid,name:'QA 창고',code:'WH-0001',contactUserId:'qa-user',contactName:'QA'},zones:[],racks:deleted?[]:[{...item,id:rid,name:'삭제 랙',code:'R-01',levels:1,bays:1}],locationCount:deleted?0:1})
  const plan=()=>({exists:true,version:deleted?v2:v1,schemaVersion:1,aspectRatio:1.5,objects:[...deleted?[]:[{...object,id:oid,type:'rack',label:'삭제 랙',rackId:rid}],{...object,id:sid,type:'shape',label:'보존 도형',rackId:null}]})
  await context.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname
   if(path==='/api/auth/csrf')return route.fulfill({json:{token:'mock'}})
   if(path.endsWith('/racks/delete')){calls++;reachedDelete?.();const body=route.request().postDataJSON();assert.deepEqual(body,{planVersion:v1,racks:[{id:rid,version:v1}]});await new Promise(resolve=>{finishDelete=resolve});if(calls===1)return route.fulfill({status:409,json:{message:'해당 랙에 재고 또는 진행 중인 작업이 있어 삭제할 수 없습니다.'}});deleted=true;return route.fulfill({json:{rackIds:[rid],locationIds:[],objectIds:[oid],planVersion:v2}})}
   if(route.request().method()==='POST'&&(path.endsWith('/workspace')||path.endsWith('/plan'))){saveBody=route.request().postDataJSON();return route.fulfill({json:path.endsWith('/workspace')?{warehouseId:wid,code:'WH-0001',zones:{},racks:{},floorLocations:{},rackLocations:{}}:{...plan(),...saveBody}})}
   if(path.endsWith('/workspace'))return route.fulfill({json:{detail:detail(),plan:plan(),floorLocations:[]}})
   if(path.endsWith('/plan'))return route.fulfill({json:plan()})
   if(path===endpoint+'/'+wid)return route.fulfill({json:detail()})
   if(path.endsWith('/front'))return route.fulfill({json:{rack:detail().racks[0],locations:[],inventoryAvailable:false}})
   if(path.endsWith('/locations'))return route.fulfill({json:{items:[],total:0,page:1,pageSize:20}})
   if(path.endsWith('/business-assignees'))return route.fulfill({json:{items:[],total:0}})
   errors.push('Unexpected API '+path);return route.fulfill({status:404,json:{message:'unmocked'}})
  })
  await context.route('**/__rack-delete',route=>route.fulfill({contentType:'text/html',body:`<html><body><div id="root"></div><script type="module">
   import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
   const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
   await import('/src/index.css');await import('/src/components/workspace/workspace.css');await import('/src/design-tokens.css');await import('/src/theme.css');
   const {default:Editor}=await import('/src/components/workspace/${mode==='workspace'?'WarehouseWorkspaceEditor':'WarehousePlanEditor'}.tsx');
   const {BusinessAssigneeContext}=await import('/src/business-assignee.ts');
   createRoot(document.getElementById('root')).render(React.createElement(BusinessAssigneeContext.Provider,{value:{tenantId:'11111111-1111-4111-8111-111111111111',current:{id:'qa-user',name:'QA',code:'QA'}}},React.createElement(Editor,{endpoint:${JSON.stringify(endpoint+(mode==='saved'?'/'+wid:''))},warehouseId:${JSON.stringify(wid)},initialStep:2,canCreate:true,canUpdate:true,canEdit:true,canDelete:true,onBack:()=>{},onSaved:()=>{document.body.dataset.saved='true'}})));
  </script></body></html>`}))
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin+'/__rack-delete');await waitPlanCount(page,2)
  await selectPlanObject(page,sid);await page.getByLabel('객체 이름',{exact:true}).fill('보존한 편집')
  await selectPlanObject(page,oid)
  const remove=page.locator('button[aria-label="삭제"]');const firstDelete=new Promise(resolve=>{reachedDelete=resolve});await remove.click();await firstDelete
  await page.waitForFunction(()=>document.querySelector('button[aria-label="삭제"]').disabled)
  assert.equal(calls,1);assert.equal(await page.getByRole('dialog').count(),0)
  assert((await planObjects(page)).some(n=>n.id===oid));assert.equal(saveBody,undefined)
  finishDelete();await page.getByRole('alert').filter({hasText:'재고 또는 진행 중인 작업'}).waitFor()
  assert.equal((await planObjects(page)).filter(n=>n.id===oid).length,1)
  const secondDelete=new Promise(resolve=>{reachedDelete=resolve});await remove.click();await secondDelete;await page.waitForFunction(()=>document.querySelector('button[aria-label="삭제"]').disabled)
  assert.equal(calls,2);finishDelete();await page.getByRole('status').filter({hasText:'삭제했습니다'}).waitFor().catch(async()=>{await page.getByText(/다른 미저장 편집은 유지됩니다/).waitFor()})
  assert.equal((await planObjects(page)).filter(n=>n.id===oid).length,0)
  assert.equal((await planObjects(page)).filter(n=>n.id===sid&&n.text.includes('보존한 편집')).length,1)
  await page.getByRole('button',{name:'도면 실행 취소',exact:true}).click();assert.equal((await planObjects(page)).filter(n=>n.id===oid).length,0)
  await page.getByRole('button',{name:'도면 다시 실행',exact:true}).click()
  if(mode==='workspace') {await page.getByRole('button',{name:'창고 저장',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'확인',exact:true}).click()}
  else await page.getByRole('button',{name:'도면 저장',exact:true}).click()
  await page.waitForFunction(()=>document.body.dataset.saved==='true')
  const savedPlan=mode==='workspace'?saveBody.plan:saveBody
  assert.equal(savedPlan.version,v2);assert.equal(savedPlan.objects.length,1);assert.equal(savedPlan.objects[0].label,'보존한 편집')
  if(mode==='workspace')assert.equal(saveBody.racks.length,0)
  await page.reload();await waitPlanCount(page,1);assert.equal((await planObjects(page)).filter(n=>n.id===oid).length,0)
  assert.deepEqual(errors,[]);await context.close()
 }
 console.log('PASS both editors: immediate delete, no confirmation/full save, failure retains rack, busy guard, unrelated edits, undo/redo and version retained; reload stays deleted. APIs mocked, no DB writes.')
}finally{await browser.close()}
