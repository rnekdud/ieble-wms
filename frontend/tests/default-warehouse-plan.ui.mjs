import { waitPlanCount } from './plan-scene.mjs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176'
const version='00000000-0000-0000-0000-000000000001'
const template={schemaVersion:1,aspectRatio:2,zones:[],racks:[],objects:[{type:'wall',label:'사용자 벽',x:.3,y:.3,width:.2,height:.02,rotation:0,fill:'#536460',shape:'rectangle',rackIndex:null,zoneIndex:null}]}
const saved={id:'saved-wall',type:'wall',label:'기존 창고 벽',x:.4,y:.2,width:.4,height:.02,rotation:15,fill:'#536460',shape:'rectangle',rackId:null,zoneId:null,locationId:null}
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),writes=[],errors=[]
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname
  assert.equal(u.origin,origin)
  if(p==='/__default-plan')return route.fulfill({contentType:'text/html',body:`<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/editor-part2-ui.tsx"></script></html>`})
  if(!p.startsWith('/api/'))return route.continue()
  const json=value=>route.fulfill({json:value})
  if(p==='/api/auth/csrf')return json({token:'isolated'})
  if(req.method()!=='GET'){
   const body=req.postDataJSON();writes.push({path:p,body})
   if(p.endsWith('/workspace'))return json({warehouseId:'qa-only',code:'WH-QA',zones:{},racks:{},floorLocations:{},rackLocations:{}})
   throw Error('Unexpected write '+p)
  }
  if(p.endsWith('/workspace'))return json({detail:{warehouse:{id:'w1',code:'WH-EXISTING',name:'기존 창고',contactUserId:'qa-user',contactName:'QA',version,isActive:true},zones:[],racks:[],locationCount:0},floorLocations:[],plan:{exists:true,version,schemaVersion:1,aspectRatio:2.25,objects:[saved]}})
  if(p.endsWith('/warehouse-templates'))return json({items:[{id:'custom',name:'사용자 정의 도면',description:null,rackCount:0,version,createdAt:'2026-11-01',updatedAt:'2026-11-01'}],total:1,page:1,pageSize:20})
  if(p.endsWith('/warehouse-templates/custom'))return json({id:'custom',name:'사용자 정의 도면',description:null,rackCount:0,version,document:template})
  throw Error('Unexpected API '+p)
 })
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 const canvas=page.locator('.warehouse-workspace-plan .warehouse-plan-canvas')
 const count=n=>waitPlanCount(page,n)
 await page.goto(origin+'/__default-plan?new');await count(16)
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});assert.equal(await canvas.getAttribute('data-plan-ratio'),'1.6')
  assert.equal(await page.locator('.workspace-zone-node').count(),2)
 }
 await page.setViewportSize({width:1440,height:1000})
 await page.getByRole('button',{name:'빈 도면으로 시작',exact:true}).click()
 await page.getByRole('dialog',{name:'작성 중인 도면 교체'}).getByRole('button',{name:'변경 버리고 계속'}).click();await count(0)
 await page.getByRole('button',{name:'이전 단계',exact:true}).click()
 await page.getByLabel('창고명',{exact:true}).fill('격리 검증 창고')
 await page.getByRole('button',{name:'다음: 도면 구성',exact:true}).click()
 await page.getByRole('button',{name:'벽 추가',exact:true}).click();await count(1)
 await page.locator('button[title="선택 객체 삭제"]').click();await count(0)
 await page.getByRole('button',{name:'구역 추가',exact:true}).click();await count(1)
 await page.getByLabel('구역 이름',{exact:true}).fill('새 구역')
 await page.locator('button[title="선택 객체 삭제"]').click();await count(0)
 await page.getByRole('button',{name:'랙 추가',exact:true}).click()
 await page.getByLabel('랙 이름',{exact:true}).fill('직접 만든 랙')
 await page.getByLabel('랙 코드',{exact:true}).fill('R-QA')
 await page.getByRole('button',{name:'랙 생성',exact:true}).click();await count(1)
 await page.locator('button[title="선택 객체 삭제"]').click();await count(0)
 await page.getByRole('button',{name:'템플릿 불러오기',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'도면 템플릿 불러오기'})
 await dialog.getByRole('button',{name:/사용자 정의 도면/}).click()
 await dialog.getByRole('button',{name:'불러오기',exact:true}).click();await count(1)
 assert.equal(await canvas.getAttribute('data-plan-ratio'),'2')
 await page.getByRole('button',{name:'기본 도면 사용',exact:true}).click()
 await page.getByRole('dialog',{name:'작성 중인 도면 교체'}).getByRole('button',{name:'변경 버리고 계속'}).click()
 await count(16);assert.equal(await canvas.getAttribute('data-plan-ratio'),'1.6')
 await page.getByRole('button',{name:'빈 도면으로 시작',exact:true}).click()
 await page.getByRole('dialog',{name:'작성 중인 도면 교체'}).getByRole('button',{name:'변경 버리고 계속'}).click();await count(0)
 assert.equal(await canvas.getAttribute('data-plan-ratio'),'1.5')
 // Capture a normal save request without creating a real warehouse.
 await page.getByRole('button',{name:'이전 단계',exact:true}).click()
 await page.getByLabel('창고명',{exact:true}).fill('격리 검증 창고')
 await page.getByRole('button',{name:'다음: 도면 구성',exact:true}).click()
 await page.getByRole('button',{name:'벽 추가',exact:true}).click();await count(1)
 await page.getByRole('button',{name:'창고 저장',exact:true}).click()
 const savedResponse=page.waitForResponse(r=>r.url().endsWith('/workspace')&&r.request().method()==='POST')
 await page.getByRole('dialog',{name:'창고 및 도면 저장 확인'}).getByRole('button',{name:'확인',exact:true}).click()
 assert.equal((await savedResponse).status(),200)
 assert.equal(writes.length,1);assert.equal(writes[0].body.plan.aspectRatio,1.5)
 assert.equal(writes[0].body.plan.objects.length,1);assert.equal(writes[0].body.plan.objects[0].type,'wall')
 assert.deepEqual(writes[0].body.racks,[]);assert.deepEqual(writes[0].body.zones,[])
 const existingPage=await context.newPage();existingPage.on('pageerror',e=>errors.push(e.message))
 await existingPage.goto(origin+'/__default-plan');await waitPlanCount(existingPage,1)
 assert.equal(await existingPage.locator('.warehouse-workspace-plan .warehouse-plan-canvas').getAttribute('data-plan-ratio'),'2.25')
 assert.equal(await existingPage.getByRole('button',{name:'기본 도면 사용',exact:true}).count(),0)
 assert.equal(writes.length,1);assert.deepEqual(errors,[])
 console.log('PASS',origin,'populated 1.6 default (16 objects), explicit empty 1.5 option, manual wall/zone/rack add/delete, custom template load, default reset, isolated save payload and existing saved layout preserved. All business APIs mocked.')
}finally{await browser.close()}
