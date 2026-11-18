import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',root='/api/tenants/qa-items/organization-items'
const entry=(id,name,parentId=null,sortOrder=0,extra={})=>({id,name,parentId,sortOrder,version:'v1',isActive:true,memberCount:0,childCount:0,...extra})
const data={departments:[entry('part','입고1파트','team',0),entry('root-b','경영본부',null,20),entry('team','입고팀','root-a',1,{childCount:1}),entry('root-a','물류본부',null,10,{childCount:2,memberCount:2}),entry('team-b','출고팀','root-a',2)],positions:[entry('position','팀장')]}
let grades=[{id:'grade',name:'QA 권한',description:'기존 설명',version:'v1',isActive:true,isBuiltIn:false,memberCount:0}]
const writes=[],errors=[],browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;assert.equal(url.origin,origin)
  if(path==='/__items')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/organization-items-ui.tsx"></script></html>'})
  if(!path.startsWith('/api/'))return route.continue()
  const json=v=>route.fulfill({json:v})
  if(path==='/api/auth/csrf')return json({token:'qa'})
  assert(path.startsWith(root),path)
  if(request.method()==='GET')return json(path===root?data:grades)
  const body=request.postDataJSON();writes.push({path,body})
  const [kind,id,action]=path.slice(root.length+1).split('/')
  if(kind==='permission-grades'){
   if(id)grades=grades.map(g=>g.id===id?{...g,...body}:g)
   else grades.push({...body,id:'new-grade',isBuiltIn:false,memberCount:0})
  }else{
   if(action==='delete')data[kind]=data[kind].filter(x=>x.id!==id)
   else if(id)data[kind]=data[kind].map(x=>x.id===id?{...x,...body}:x)
   else data[kind].push({...entry('new-'+kind,body.name),...body})
  }
  return json({version:'v2'})
 })
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 await page.goto(origin+'/__items')
 const table=page.getByRole('table',{name:'부서 목록',exact:true})
 await table.getByRole('cell',{name:'입고1파트',exact:true}).waitFor()
 assert.deepEqual(await table.locator('tbody .organization-department-name').evaluateAll(nodes=>nodes.map(n=>n.textContent)),['물류본부','입고팀','입고1파트','출고팀','경영본부'])
 const indent=await table.locator('tbody .organization-department-name').evaluateAll(nodes=>nodes.map(n=>parseFloat(getComputedStyle(n).paddingInlineStart)))
 assert.deepEqual(indent,[0,18,36,18,0])
 assert(await page.getByRole('button',{name:'물류본부 삭제',exact:true}).isDisabled())
 await page.getByLabel('부서 검색',{exact:true}).fill('입고1');await page.getByRole('button',{name:'검색',exact:true}).click()
 assert.equal(await table.locator('tbody tr').count(),1);await table.getByText('물류본부 › 입고팀',{exact:true}).waitFor()
 await page.getByRole('button',{name:'초기화',exact:true}).click();await page.getByRole('dialog',{name:'필터 초기화'}).getByRole('button',{name:'초기화',exact:true}).click()
 await table.getByRole('cell',{name:'물류본부',exact:true}).first().waitFor()
 const cases=[{tab:'부서 관리',add:'부서 등록',title:'부서 등록',save:'부서 저장'},{tab:'직급 관리',add:'직급 등록',title:'직급 등록',save:'직급 저장'},{tab:'권한 등급 관리',add:'권한 등급 추가',title:'권한 등급 추가',save:'등록'}]
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});let reference
  for(const c of cases){
   await page.getByRole('tab',{name:c.tab,exact:true}).click();await page.getByRole('button',{name:c.add,exact:true}).click()
   const dialog=page.getByRole('dialog',{name:c.title,exact:true});await dialog.waitFor()
   assert.equal(await dialog.getByRole('heading',{level:3}).count(),0)
   const layout=await dialog.evaluate(d=>{
    const field=d.querySelector('fieldset'),label=field.querySelector('label'),input=field.querySelector('input:not([type=checkbox])'),select=field.querySelector('select'),actions=d.querySelector('.dialog-actions'),buttons=[...actions.querySelectorAll('button')],box=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right}}
    return {gap:getComputedStyle(field).rowGap,labelGap:getComputedStyle(label).gap,padding:getComputedStyle(field).paddingInlineStart,radius:getComputedStyle(input).borderRadius,border:getComputedStyle(input).borderColor,input:box(input),select:select&&box(select),buttons:buttons.map(box),actionGap:getComputedStyle(actions).gap,checkbox:box(field.querySelector('input[type=checkbox]')),field:box(field)}
   })
   assert.equal(layout.gap,'16px');assert.equal(layout.labelGap,'5px');assert.equal(layout.actionGap,'8px')
   assert.equal(layout.input.h,40);assert(layout.buttons.every(b=>b.h===40));assert(layout.buttons[1].x>=layout.buttons[0].right+7)
   if(layout.select)assert.equal(layout.select.h,layout.input.h)
   if(c.save!=='등록')assert(layout.buttons[1].w>layout.buttons[0].w+10)
   assert.equal(Math.round(layout.checkbox.x),Math.round(layout.input.x))
   const common=[layout.padding,layout.radius,layout.border,layout.input.h]
   if(reference)assert.deepEqual(common,reference);else reference=common
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
   await dialog.getByRole('button',{name:'취소',exact:true}).click()
  }
  console.log('PASS item dialogs '+width+'px')
 }
 await page.setViewportSize({width:1440,height:1000})
 // All writes below go only to in-memory fixtures.
 for(const [index,c] of cases.entries()){
  await page.getByRole('tab',{name:c.tab,exact:true}).click();await page.getByRole('button',{name:c.add,exact:true}).click()
  let dialog=page.getByRole('dialog',{name:c.title,exact:true});await dialog.locator('input[name=name]').fill('QA '+index)
  if(index===0)await dialog.locator('select[name=parentId]').selectOption('team')
  if(index<2)await dialog.getByLabel('정렬 순서',{exact:true}).fill('7')
  else await dialog.getByLabel('설명 (선택)').fill('새 설명')
  await dialog.getByRole('checkbox',{name:'사용',exact:true}).uncheck()
  await dialog.getByRole('button',{name:c.save,exact:true}).click();await page.getByRole('cell',{name:'QA '+index,exact:true}).waitFor()
  assert.equal(writes.at(-1).body.isActive,false)
  if(index===0)assert.equal(writes.at(-1).body.parentId,'team')
  await page.getByRole('button',{name:`QA ${index} 수정`,exact:true}).click();dialog=page.getByRole('dialog')
  assert.equal(await dialog.getByRole('checkbox',{name:'사용',exact:true}).isChecked(),false)
  await dialog.locator('input[name=name]').fill('수정 QA '+index);await dialog.getByRole('checkbox',{name:'사용',exact:true}).check()
  await dialog.getByRole('button',{name:index===2?'저장':c.save,exact:true}).click();await page.getByRole('cell',{name:'수정 QA '+index,exact:true}).waitFor()
  assert.equal(writes.at(-1).body.isActive,true)
  if(index<2){await page.getByRole('button',{name:`수정 QA ${index} 삭제`,exact:true}).click();await page.getByRole('cell',{name:'수정 QA '+index,exact:true}).waitFor({state:'detached'})}
 }
 await page.getByRole('tab',{name:'부서 관리',exact:true}).click();await page.getByRole('button',{name:'물류본부 수정',exact:true}).click()
 const edit=page.getByRole('dialog',{name:'부서 수정'});assert.deepEqual(await edit.locator('select[name=parentId] option').evaluateAll(options=>options.map(o=>o.value)),['','root-b'])
 await edit.getByRole('button',{name:'취소',exact:true}).click()
 const count=writes.length
 await page.goto(origin+'/__items?readOnly');await table.waitFor();assert.equal(await page.getByRole('button',{name:/부서 등록|수정|삭제/}).count(),0)
 assert.equal(writes.length,count);assert.equal(count,8);assert.deepEqual(errors,[])
 assert.equal(data.departments.find(d=>d.id==='part').parentId,'team')
 console.log('PASS hierarchy/search/reset, create/edit/delete, checkbox payloads, parent safeguards, permissions; all APIs mocked. '+origin)
}finally{await browser.close()}
