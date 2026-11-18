import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',root='/api/tenants/fixture'
const guide='초기 비밀번호는 로그인 아이디와 동일하게 생성됩니다. 구성원에게 로그인 정보를 안내하고, 첫 로그인 후 반드시 비밀번호를 변경하도록 안내해 주세요.'
let member={userId:'employee',name:'QA 직원',loginId:'employee001',email:'qa@example.test',role:'Employee',isActive:true,membershipIsActive:true,accountIsActive:true,accountType:'Internal',departmentId:null,positionId:null,permissionGradeId:null,version:'v1',registeredAt:'2026-11-01',billingStartsAt:'2026-11-01',billingStartMonth:'2026-11',mustChangePassword:false}
const writes=[],errors=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block'});await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());assert.equal(u.origin,origin)
  if(u.pathname==='/__member-account')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/member-account-ui.tsx"></script></html>'})
  if(!u.pathname.startsWith('/api/'))return route.continue()
  const json=x=>route.fulfill({json:x})
  if(u.pathname==='/api/auth/csrf')return json({token:'fixture'})
  if(u.pathname===root+'/users/login-id-check')return json({available:true,message:'사용 가능한 로그인 아이디입니다.'})
  if(req.method()==='GET'){
   if(u.pathname===root+'/users/organization-options')return json({departments:[],positions:[]})
   if(u.pathname.endsWith('/permission-grades'))return json(['Administrator','Employee'].map((id,i)=>({id,name:i?'일반 직원':'기업 관리자',isBuiltIn:true,isActive:true,memberCount:1,version:'v1'})))
   if(u.pathname===root+'/users')return json({items:[member],total:1,page:1,pageSize:20,monthlyPerUserKrw:0,billMasterAccounts:false})
  }else{
   const body=req.postDataJSON();writes.push({path:u.pathname,body});assert(!Object.keys(body).some(k=>/password/i.test(k)))
   if(u.pathname===root+'/users')return json({user:{...member,...body,userId:'new',mustChangePassword:true}})
   if(u.pathname===root+'/users/employee'){member={...member,...body,membershipIsActive:body.isActive,version:'v'+writes.length};return json(member)}
  }
  throw new Error('Unexpected API '+req.method()+' '+u.pathname)
 })
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 for(const role of ['master','admin']){
  await page.goto(`${origin}/__member-account?role=${role}`)
  await page.getByRole('button',{name:'사용자 등록',exact:true}).click()
  let dialog=page.getByRole('dialog'),field=dialog.getByRole('textbox',{name:'비밀번호',exact:true})
  assert.equal(await field.inputValue(),'자동 생성 · 직접 입력 불가');assert(await field.evaluate(e=>e.readOnly));assert.equal(await field.getAttribute('name'),null)
  assert.match(await dialog.innerText(),new RegExp(guide.replaceAll('.','\\.')))
  await field.focus();await page.keyboard.type('NotAllowed');assert.equal(await field.inputValue(),'자동 생성 · 직접 입력 불가')
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert(await field.evaluate(e=>e.getBoundingClientRect().width>100));assert.equal(await dialog.locator('#employee-password-help').evaluate(e=>getComputedStyle(e).fontSize),'13px')}
  await dialog.getByLabel('사용자 이름',{exact:true}).fill('신규 직원');await dialog.getByLabel('로그인 아이디',{exact:true}).fill('employee002');await dialog.getByLabel('이메일',{exact:true}).fill('new@example.test')
  assert(await dialog.getByRole('checkbox',{name:'계정 활성화',exact:true}).isChecked())
  await dialog.getByRole('button',{name:'계정 생성',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('button',{name:'확인하고 닫기',exact:true}).click()
  await page.getByRole('button',{name:'QA 직원 수정',exact:true}).click();dialog=page.getByRole('dialog');field=dialog.getByRole('textbox',{name:'비밀번호',exact:true})
  assert.equal(await field.inputValue(),'자동 생성 · 직접 입력 불가');assert(await field.evaluate(e=>e.readOnly));assert.match(await dialog.innerText(),/초기 비밀번호는 로그인 아이디와 동일하며, 첫 로그인 후 변경해야 합니다/);assert(await dialog.getByLabel('로그인 아이디',{exact:true}).evaluate(e=>e.readOnly))
  assert.equal(await dialog.locator('input[type=password]').count(),0);assert.equal(await dialog.getByRole('button',{name:/비밀번호/}).count(),0)
  await dialog.getByRole('checkbox',{name:'계정 활성화',exact:true}).uncheck();await dialog.getByRole('button',{name:'사용자 정보 저장',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(member.membershipIsActive,false)
  await page.getByRole('button',{name:'QA 직원 수정',exact:true}).click();await page.getByRole('dialog').getByRole('checkbox',{name:'계정 활성화',exact:true}).check();await page.getByRole('button',{name:'사용자 정보 저장',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(member.membershipIsActive,true)
  assert.equal(member.role,'Employee');assert.equal(await page.getByRole('columnheader',{name:'계정 활성화',exact:true}).count(),1);assert.equal(await page.getByText('기업 소속 활성 상태',{exact:true}).count(),0)
 }
 await page.goto(`${origin}/__member-account?role=reader`);await page.getByText('QA 직원',{exact:true}).first().waitFor();assert.equal(await page.getByRole('button',{name:'사용자 등록',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'QA 직원 수정',exact:true}).count(),0)
 assert.deepEqual(errors,[]);assert.equal(writes.length,6)
 console.log('PASS: master/admin readonly guidance, create/edit payload excludes password, activation toggle/labels, reader restrictions, responsive widths; all API writes mocked')
}finally{await browser.close()}
