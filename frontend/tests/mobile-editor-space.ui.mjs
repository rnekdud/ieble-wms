import { planObjects } from './plan-scene.mjs'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176'
const assignee={id:'qa-user',name:'QA 담당자',code:'물류팀',email:'qa@example.test'}
const permissions=Object.fromEntries(workspacePages.map(p=>[p.key,['menu','read','create','update']]))
const workspace={id:'qa',name:'QA 기업',role:'Master',permissions,currentAssignee:assignee,serviceStatus:'Active',billingStatus:'Active',billingAccess:{state:'Active',canAccessWms:true,hasRegisteredCard:true},billingPolicy:{monthlyPerUserKrw:0,monthlyBaseKrw:0,includedUsers:1},canManageBilling:false}
const browser=await chromium.launch({channel:'chrome',headless:true})
try{for(const [width,height] of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1440,900]]){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<1025,serviceWorkers:'block'})
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

 const boxes=await wizard.evaluate(e=>{const box=s=>{const r=e.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};return {rail:box('.mobile-plan-tools,.studio-tool-rail'),commands:box('.plan-command-bar'),canvas:box('.warehouse-plan-canvas'),overflow:document.documentElement.scrollWidth>innerWidth}})

 assert(!boxes.overflow)
 if(width<=1024){
  assert(boxes.rail.h<=58);assert(boxes.commands.h<=44);assert(boxes.canvas.y<height-40,JSON.stringify(boxes));assert(boxes.canvas.h>=280)
  assert.equal(await wizard.locator('.plan-catalog').count(),0);assert.equal(await wizard.locator('.workspace-structure-list').getAttribute('open'),null)
  const zoom=wizard.getByRole('button',{name:'도면 확대',exact:true}),zb=await zoom.boundingBox(),zc=wizard.locator('.warehouse-plan-canvas'),scale=await zc.getAttribute('data-view-scale')
  assert(await zoom.evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.left-3,r.top+r.height/2)?.closest('button')===e}),'expanded icon hit area')
  await page.mouse.click(zb.x-3,zb.y+zb.height/2);assert.notEqual(await zc.getAttribute('data-view-scale'),scale);await wizard.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click()
  const more=wizard.getByRole('button',{name:'더보기',exact:true}),extra=wizard.getByRole('group',{name:'추가 도구'})
  await more.click();await extra.waitFor();const eb=await extra.boundingBox();assert(eb.y>=0&&eb.y+eb.height<=height+1,'more panel fits viewport');assert(Math.abs((await wizard.locator('.warehouse-plan-canvas').boundingBox()).y-boxes.canvas.y)<1,'popover must not push canvas')
  await page.keyboard.press('Escape');await extra.waitFor({state:'hidden'});await more.click();await wizard.locator('.wizard-heading-title').click();await extra.waitFor({state:'hidden'})
  await more.click();await extra.getByRole('button',{name:'통로 추가',exact:true}).click();await extra.waitFor({state:'hidden'})
  assert.equal(await more.innerText(),'통로')
  const canvas=wizard.locator('.warehouse-plan-canvas'),before=await canvas.boundingBox(),panel=wizard.getByRole('complementary',{name:'선택 객체 속성'});await panel.waitFor()
  assert(Math.abs((await canvas.boundingBox()).height-before.height)<1)
  const pb=await panel.boundingBox();assert(pb.x>=0&&pb.x+pb.width<=width+1&&pb.y>=0&&pb.y+pb.height<=height+1)
  await wizard.getByLabel('객체 이름',{exact:true}).fill('유지되는 통로');await wizard.getByRole('button',{name:'속성 패널 닫기',exact:true}).click();await panel.waitFor({state:'hidden'})
  await wizard.getByRole('button',{name:/속성 열기/}).click();assert.equal(await wizard.getByLabel('객체 이름',{exact:true}).inputValue(),'유지되는 통로');await wizard.getByRole('button',{name:'속성 패널 닫기',exact:true}).click()
  await page.setViewportSize({width:height,height:width});await page.setViewportSize({width,height});await wizard.getByRole('button',{name:/속성 열기/}).click();assert.equal(await wizard.getByLabel('객체 이름',{exact:true}).inputValue(),'유지되는 통로');await wizard.getByRole('button',{name:'속성 패널 닫기',exact:true}).click()
  await wizard.getByRole('button',{name:'랙 추가',exact:true}).click();const creation=wizard.getByRole('complementary',{name:'랙 생성 설정'});await creation.waitFor();await creation.getByRole('button',{name:'랙 생성 설정 접기',exact:true}).click();await creation.waitFor({state:'hidden'});await wizard.getByRole('button',{name:'랙 생성 설정 열기',exact:true}).click();await creation.getByRole('button',{name:'생성 취소',exact:true}).click()
  const count=(await planObjects(page)).length;await wizard.getByRole('button',{name:'랙 추가',exact:true}).click();await creation.getByRole('textbox',{name:'랙 이름',exact:true}).fill('모바일 생성 QA');await creation.getByRole('button',{name:'랙 생성',exact:true}).click();await creation.waitFor({state:'hidden'});assert.equal((await planObjects(page)).length,count+1);await wizard.getByRole('button',{name:'속성 패널 닫기',exact:true}).click()
 }else{
  assert.equal(boxes.rail.w,68);assert.equal(boxes.commands.h,57);assert(Math.abs(boxes.canvas.y-334.375)<1);assert(Math.abs(boxes.canvas.w-1082)<1)
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);assert.equal(writes.length,0)
 console.log(`PASS ${width}x${height}: tools ${boxes.rail.h}px, commands ${boxes.commands.h}px, canvas Y=${boxes.canvas.y.toFixed(1)} height=${boxes.canvas.h}; overlay, properties, rotation, no business writes`);await context.close()
}}finally{await browser.close()}
