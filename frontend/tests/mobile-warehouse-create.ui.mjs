import { planObjects, selectPlanObject } from './plan-scene.mjs'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176'
const assignee={id:'qa-user',name:'QA 담당자',code:'물류팀',email:'qa@example.test'}
const permissions=Object.fromEntries(workspacePages.map(p=>[p.key,['menu','read','create','update']]))
const workspace={id:'qa',name:'QA 기업',role:'Master',permissions,currentAssignee:assignee,serviceStatus:'Active',billingStatus:'Active',billingAccess:{state:'Active',canAccessWms:true,hasRegisteredCard:true},billingPolicy:{monthlyPerUserKrw:0,monthlyBaseKrw:0,includedUsers:1},canManageBilling:false}
async function checkToolbar(page,mobile) {
 const root=page.locator('.warehouse-wizard .plan-studio')
 if(!mobile){assert.equal(await root.locator('.studio-tool-rail button').count(),10);assert.equal(await root.locator('.mobile-plan-primary').count(),0);return}
 const buttons=root.locator('.mobile-plan-primary > button');assert.equal(await buttons.count(),6)
 const boxes=await buttons.evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}))
 for(const b of boxes){assert(Math.abs(b.y-boxes[0].y)<1);assert.equal(b.h,50,JSON.stringify({boxes,viewport:page.viewportSize()}));assert(Math.abs(b.w-boxes[0].w)<1)}
 const icons=await root.locator('.plan-command-bar button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,w:r.width,h:r.height}}))
 assert.equal(icons.length,5);assert(icons.every(b=>b.w===36&&b.h===36&&Math.abs(b.y-icons[0].y)<1))
 assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))
}
async function extra(wizard,name){const more=wizard.getByRole('button',{name:'더보기',exact:true});if(await more.count())await more.click();await wizard.locator('.plan-editor-surface').getByRole('button',{name,exact:true}).click()}
async function closeProperties(wizard){const b=wizard.getByRole('button',{name:'속성 패널 닫기',exact:true});if(await b.count())await b.click()}
const browser=await chromium.launch({channel:'chrome',headless:true})
try{for(const width of [360,390,430,768,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<1025,serviceWorkers:'block'})
 await context.routeWebSocket('**/*',()=>{})
 if(width===390) await context.addInitScript(()=>{
  window.orientationQA={locks:0,unlocks:0,full:false}
  Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>window.orientationQA.full?document.documentElement:null})
  Element.prototype.requestFullscreen=async()=>{window.orientationQA.full=true}
  document.exitFullscreen=async()=>{window.orientationQA.full=false}
  screen.orientation.lock=async value=>{if(value!=='landscape')throw Error('Unexpected orientation');window.orientationQA.locks++}
  screen.orientation.unlock=()=>{window.orientationQA.unlocks++}
 })
 let saved=null,fail=true;const writes=[],unknown=[],errors=[]
 await context.route('**/*',route=>{
  const r=route.request(),u=new URL(r.url()),p=u.pathname.replace('/api/tenants/qa',''),json=(data,status=200)=>route.fulfill({json:data,status})
  if(u.origin!==origin)return route.abort()
  if(!u.pathname.startsWith('/api/'))return route.continue()
  if(r.method()==='POST'){
   writes.push({path:p,body:r.postDataJSON()})
   if(p==='/warehouses/workspace'&&fail){fail=false;return json({message:'QA 저장 오류'},409)}
   if(p==='/warehouses/workspace'){
    saved={...r.postDataJSON().warehouse,id:'new',code:'WH01',version:String(writes.length)};return json({warehouseId:'new',code:'WH01',zones:{},racks:{},floorLocations:{},rackLocations:{}})
   }
   unknown.push(p);return route.abort()
  }
  if(p==='/api/auth/csrf')return json({token:'qa'})
  if(p==='/api/auth/me')return json({user:{id:assignee.id,displayName:assignee.name,userName:'qa',email:assignee.email,systemRole:'User',mustChangePassword:false},memberships:[{tenantId:'qa',name:workspace.name,role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'qa'})
  if(p==='/workspace')return json(workspace)
  if(p==='/api/health/db')return json({status:'connected'})
  if(p.startsWith('/pages/'))return json({})
  if(p==='/warehouses')return json({items:saved?[{warehouse:saved,zoneCount:0,rackCount:0,locationCount:0}]:[],total:saved?1:0,page:1,pageSize:20})
  if(p==='/warehouses/new')return json({warehouse:saved,zones:[],racks:[],locationCount:0})
  if(p.startsWith('/assignees/'))return json(assignee)
  if(p==='/assignees')return json({items:[assignee],total:1,page:1,pageSize:20})
  unknown.push(p);return json({items:[],total:0,page:1,pageSize:20})
 })
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/app/warehouses');await page.getByRole('button',{name:'창고 등록',exact:true}).click()
 const wizard=page.locator('.warehouse-wizard')
 await wizard.getByRole('heading',{name:'새 창고 만들기'}).waitFor()
 assert.equal(await page.getByRole('dialog').count(),0,'registration is a page')
 const name=wizard.getByRole('textbox',{name:'창고명',exact:true})
 await name.fill('모바일 QA 창고')
 await wizard.getByLabel('창고 유형',{exact:true}).selectOption('냉장')
 await wizard.getByLabel('자체 창고 코드',{exact:true}).fill('MOBILE01')
 await wizard.getByLabel('비고',{exact:true}).fill('등록 검증')
 await wizard.getByRole('button',{name:'다음: 도면 구성'}).click()
 await page.locator('.warehouse-plan-canvas canvas').first().waitFor()
 assert.equal(await page.locator('.mobile-editor-notice').count(),0)
 await checkToolbar(page,width<1025)
 if(process.env.WMS_TOOLBAR_VISUAL&&width===390){for(const selector of ['.studio-tool-rail','.plan-command-bar'])console.log('IMAGE:'+(await wizard.locator(selector).screenshot({type:'jpeg'})).toString('base64'))}
 if(width<1025){
  await wizard.locator('.mobile-plan-resources > summary').click();await page.locator('.editor-landscape-hint').waitFor();await wizard.locator('.mobile-plan-resources > summary').click()
  await page.setViewportSize({width:1000,height:width})
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.editor-landscape-hint')).display==='none')
  await checkToolbar(page,true)
 }
 await extra(wizard,'벽 추가')
 await page.getByRole('complementary',{name:'선택 객체 속성'}).waitFor();await closeProperties(wizard)
 const count=async()=>(await planObjects(page)).length
 const afterAdd=await count()
 await wizard.getByRole('button',{name:'도면 실행 취소',exact:true}).click();assert.equal(await count(),afterAdd-1)
 await wizard.getByRole('button',{name:'도면 다시 실행',exact:true}).click();assert.equal(await count(),afterAdd)
 // Select the newly created wall again after undo cleared its selection.
 await selectPlanObject(page,'last')
 await closeProperties(wizard);await extra(wizard,'복제');await closeProperties(wizard);assert.equal(await count(),afterAdd+1)
 await extra(wizard,'맨 앞으로')
 await extra(wizard,'맨 뒤로')
 await extra(wizard,'삭제')
 const canvas=page.locator('.warehouse-plan-canvas')
 const scale=await canvas.getAttribute('data-view-scale')
 await wizard.getByRole('button',{name:'도면 확대',exact:true}).click()
 assert.notEqual(await canvas.getAttribute('data-view-scale'),scale)
 await wizard.getByRole('button',{name:'도면 축소',exact:true}).click()
 await wizard.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click()
 if(width<1025)await wizard.getByRole('button',{name:'더보기',exact:true}).click()
 for(const label of ['격자','자동 정렬']) {const checkbox=wizard.getByRole('checkbox',{name:label,exact:true});const checked=await checkbox.isChecked();await checkbox.click();assert.equal(await checkbox.isChecked(),!checked);await checkbox.click()}

 if(width<1025)await wizard.getByRole('button',{name:'더보기',exact:true}).click()
 await wizard.getByRole('button',{name:'이전 단계',exact:true}).click()
 assert.equal(await name.inputValue(),'모바일 QA 창고','rotation and previous step preserve values')
 if(width===390) assert(await page.evaluate(()=>window.orientationQA.locks>0&&window.orientationQA.unlocks>0&&!window.orientationQA.full),'orientation acquired and released')
 await wizard.getByRole('button',{name:'다음: 도면 구성'}).click()
 await wizard.getByRole('button',{name:'창고 저장',exact:true}).click()
 const confirm=page.getByRole('dialog',{name:'창고 및 도면 저장 확인',exact:true})
 await confirm.getByRole('button',{name:'확인',exact:true}).click()
 await wizard.getByRole('alert').waitFor()
 await wizard.getByRole('button',{name:'창고 저장',exact:true}).click()
 await confirm.getByRole('button',{name:'확인',exact:true}).click()
 await page.locator('.warehouse-detail-header h2').waitFor()
 assert.equal(writes.length,2)
 const body=writes[1].body
 assert.equal(body.warehouse.contactUserId,assignee.id);assert.equal(body.warehouse.type,'냉장');assert.equal(body.warehouse.customCode,'MOBILE01');assert.equal(body.warehouse.notes,'등록 검증')
 assert(body.plan.objects.length>0,'existing drawing included in atomic workspace save')
 assert.deepEqual(unknown,[]);assert.deepEqual(errors,[])
 console.log(`PASS ${width}px page registration, landscape editing, workspace save; all API calls intercepted`)
 await context.close()
}}finally{await browser.close()}
