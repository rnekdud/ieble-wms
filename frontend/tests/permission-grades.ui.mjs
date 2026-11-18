import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',root='/api/tenants/fixture',custom='11111111-1111-4111-8111-111111111111'
const features=[['receipts','입고관리'],['shipments','출고관리']].map(([key,label])=>({key,label,actions:['menu','read','create','update','confirm'],implementedActions:['menu','read','create','update','confirm'],roleActions:{Administrator:['menu','read','create','update','confirm'],Employee:['menu','read','create','update','confirm'],[custom]:['menu','read','create','update','confirm']}}))
let grades=['Administrator','Employee'].map((id,i)=>({id,name:i?'일반 직원':'기업 관리자',isBuiltIn:true,isActive:true,memberCount:1,version:'v1'}))
let settings={version:'v1',features,roles:Object.fromEntries(grades.map(g=>[g.id,Object.fromEntries(features.map(f=>[f.key,['menu','read']]))])),defaults:Object.fromEntries(grades.map(g=>[g.id,Object.fromEntries(features.map(f=>[f.key,['menu','read']]))]))}
let member={userId:'employee',name:'QA 직원',loginId:'qa.employee',email:'qa@example.test',role:'Employee',isActive:true,membershipIsActive:true,accountIsActive:true,accountType:'Internal',departmentId:null,positionId:null,permissionGradeId:null,version:'v1',registeredAt:'2026-11-01',billingStartsAt:'2026-11-01',billingStartMonth:'2026-11',mustChangePassword:false}
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],writes=[]
try{
 const context=await browser.newContext({serviceWorkers:'block'});await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;assert.equal(url.origin,origin)
  if(path==='/__permission-grades')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/permission-grades-ui.tsx"></script></html>'})
  if(!path.startsWith('/api/'))return route.continue()
  const json=x=>route.fulfill({json:x})
  if(path==='/api/auth/csrf')return json({token:'fixture'})
  if(req.method()==='GET'){
   if(path===root+'/organization-items'||path===root+'/users/organization-options')return json({departments:[],positions:[]})
   if(path.endsWith('/permission-grades'))return json(grades)
   if(path===root+'/permissions')return json({...settings,grades})
   if(path===root+'/users')return json({items:[member],total:1,page:1,pageSize:20,monthlyPerUserKrw:0,billMasterAccounts:false})
  }else{
   const body=req.postDataJSON();writes.push({path,body})
   if(path===root+'/organization-items/permission-grades'){
    const grade={...body,id:custom,isBuiltIn:false,memberCount:0,version:'v2'};grades.push(grade);settings.roles[custom]={receipts:[],shipments:[]};settings.defaults[custom]={receipts:[],shipments:[]};return json(grade)
   }
   if(path===root+'/permissions'){settings={...settings,...body,version:'v3'};return json(settings)}
   if(path===root+'/users/employee'){member={...member,...body,version:'v4'};return json(member)}
   if(path===root+'/organization-items/permission-grades/'+custom){grades=grades.map(g=>g.id===custom?{...g,...body,version:'v5'}:g);return json(grades.find(g=>g.id===custom))}
  }
  throw new Error('Unexpected API '+req.method()+' '+path)
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 await page.goto(origin+'/__permission-grades');await page.getByRole('tab',{name:'권한 등급 관리'}).click();await page.getByRole('button',{name:'권한 등급 추가',exact:true}).click()
 let dialog=page.getByRole('dialog');await dialog.getByLabel('권한명',{exact:true}).fill('입고 담당자');await dialog.getByLabel('설명 (선택)').fill('입고 업무');await dialog.getByRole('button',{name:'등록',exact:true}).click();await page.getByRole('cell',{name:'입고 담당자',exact:true}).waitFor()
 await page.getByRole('navigation',{name:'QA 화면'}).getByRole('button',{name:'권한',exact:true}).click();await page.getByRole('button',{name:/^설정할 권한 /}).click();await page.getByRole('combobox',{name:'설정할 권한 검색'}).fill('입고');await page.getByRole('option').filter({hasText:'입고 담당자'}).click()
 const matrix=page.getByRole('region',{name:'입고 담당자 기능별 권한'});await matrix.waitFor();assert.equal(await matrix.locator('input:checked').count(),0)
 await matrix.getByRole('checkbox',{name:'입고 담당자 입고관리 등록',exact:true}).check();assert.equal(await matrix.getByRole('checkbox',{name:'입고 담당자 입고관리 조회',exact:true}).isChecked(),true)
 await page.getByRole('button',{name:'저장',exact:true}).click();await page.getByRole('button',{name:'확인 후 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'권한 설정을 저장했습니다.'}).waitFor();assert.deepEqual(new Set(settings.roles[custom].receipts),new Set(['menu','read','create']));assert.deepEqual(settings.roles[custom].shipments,[])
 for(const width of [1920,1440,1280,768,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await matrix.locator('input').evaluateAll(inputs=>inputs.every(i=>{const a=i.getBoundingClientRect(),b=i.closest('td').getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<1})));console.log('PASS grade matrix '+width+'px')}
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('navigation',{name:'QA 화면'}).getByRole('button',{name:'사용자',exact:true}).click()
 const row=page.getByRole('row').filter({hasText:'QA 직원'});await row.getByRole('button',{name:'QA 직원 수정',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:/^권한 등급 /}).click();await page.getByRole('combobox',{name:'권한 등급 검색'}).fill('입고');await page.getByRole('option').filter({hasText:'입고 담당자'}).waitFor();await page.keyboard.press('Enter');await dialog.getByRole('button',{name:'뒤로가기',exact:true}).click();await page.getByRole('dialog',{name:'저장하지 않은 변경사항',exact:true}).getByRole('button',{name:'계속 편집',exact:true}).click();await dialog.getByRole('button',{name:'사용자 정보 저장',exact:true}).click()
 await page.getByRole('alertdialog',{name:'사용자 변경 확인'}).getByRole('button',{name:'확인',exact:true}).click();await row.getByRole('cell',{name:'입고 담당자',exact:true}).waitFor();assert.equal(member.permissionGradeId,custom);assert.equal(member.role,'Employee')
 await page.getByRole('navigation',{name:'QA 화면'}).getByRole('button',{name:'항목',exact:true}).click();await page.getByRole('tab',{name:'권한 등급 관리'}).click();await page.getByRole('button',{name:'입고 담당자 수정',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('권한명',{exact:true}).fill('입고·검수 담당자');await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await dialog.getByRole('button',{name:'저장',exact:true}).click();await page.getByRole('cell',{name:'입고·검수 담당자',exact:true}).waitFor();assert.equal(member.permissionGradeId,custom);assert.ok(settings.roles[custom].receipts.includes('create'))
 assert.deepEqual(errors,[]);assert.equal(writes.length,4);console.log('PASS create zero-access grade, searchable matrix, save, user assignment, stable rename, responsive modal; all API writes mocked')
}finally{await browser.close()}
