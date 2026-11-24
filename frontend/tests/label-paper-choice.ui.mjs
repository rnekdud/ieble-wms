import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176'
const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];let allow=true,billing=true,permissionChecks=0
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
await context.route('**/api/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;assert.equal(request.method(),'GET','shell test cannot write to any API')
 if(path==='/api/auth/me')return route.fulfill({json:{user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'격리 기업',role:'Employee',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'}})
 if(path==='/api/health/db')return route.fulfill({json:{status:'connected'}})
 if(path==='/api/tenants/fixture/workspace')return route.fulfill({json:{id:'fixture',name:'격리 기업',role:'Employee',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:billing},permissions:{products:allow?['menu','read','create','update']:[]}}})
 if(path==='/api/tenants/fixture/pages/products'){permissionChecks++;return route.fulfill({json:{}})}
 throw new Error('Unexpected API blocked '+path)
})

const store=new Map();let writes=0,failList=false
await context.route('**/api/auth/csrf',r=>r.fulfill({json:{token:'mock'}}))
await context.route('**/api/tenants/fixture/label-designs**',async r=>{
 const req=r.request(),url=new URL(req.url()),id=url.pathname.split('/label-designs/')[1]
 if(req.method()==='GET'){
  if(id)return store.has(id)?r.fulfill({json:store.get(id)}):r.fulfill({status:404,json:{message:'해당 템플릿을 찾을 수 없습니다.'}})
  if(failList)return r.fulfill({status:503,json:{message:'offline'}})
  assert.equal(url.searchParams.get('kind'),'paper')
  const rows=[...store.values()].filter(x=>x.name.includes(url.searchParams.get('search')||'')),page=Number(url.searchParams.get('page')||1)
  return r.fulfill({json:{items:rows.slice((page-1)*20,page*20).map(({id,name})=>({id,name})),total:rows.length,page,pageSize:20}})
 }
 assert.equal(req.method(),'POST');writes++;const body=req.postDataJSON();assert.equal(body.kind,'paper')
 const saved={...body,id:'paper-'+writes,version:String(writes),updatedAt:new Date().toISOString(),paperName:body.document.paper.name};store.set(saved.id,saved);return r.fulfill({json:saved})
})
const trigger=()=>page.locator('.label-paper-choice .searchable-choice-trigger')
const select=async name=>{await trigger().click();await page.getByRole('option',{name,exact:true}).click()}
try{
 await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/app/label-editor');await page.locator('.label-edit-canvas').waitFor()
 await page.getByRole('button',{name:'용지 설정',exact:true}).click();await page.getByLabel('용지 이름',{exact:true}).fill('내 업무 용지');await page.getByRole('button',{name:'용지 저장 후 사용',exact:true}).click()
 await page.locator('dialog').waitFor({state:'detached'});assert.equal(writes,1);assert((await trigger().innerText()).includes('내 업무 용지'))
 const saved=structuredClone(store.get('paper-1'));assert.equal(saved.document.paper.labelWidth,99.1)
 await select('A4 일반 용지');assert((await page.locator('.label-paper-summary').innerText()).includes('1칸'))
 await select('내 업무 용지');await page.waitForFunction(()=>document.querySelector('.label-paper-summary').textContent.includes('99.1×33.9'))
 await page.reload();await select('내 업무 용지');await page.waitForFunction(()=>document.querySelector('.label-paper-choice').textContent.includes('내 업무 용지'));assert.equal(await page.locator('.label-slot').count(),16)
 for(let n=2;n<=45;n++)store.set('paper-'+n,{...saved,id:'paper-'+n,name:'보관 용지 '+n})
 await trigger().click();await page.getByRole('button',{name:'2페이지',exact:true}).click();await page.getByRole('option',{name:'보관 용지 16',exact:true}).waitFor();await page.getByRole('combobox',{name:'라벨 용지 검색'}).fill('보관 용지 45');await page.getByRole('option',{name:'보관 용지 45',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.label-paper-choice').textContent.includes('보관 용지 45'))
 store.get('paper-45').name='바뀐 용지 이름';await trigger().click();await page.getByRole('combobox',{name:'라벨 용지 검색'}).fill('바뀐 용지 이름');await page.getByRole('option',{name:'바뀐 용지 이름',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.label-paper-choice').textContent.includes('바뀐 용지 이름'))
 for(const [width,height] of [[360,800],[390,844],[1440,900]]){
  await page.setViewportSize({width,height});await trigger().click();await page.getByRole('combobox',{name:'라벨 용지 검색'}).fill('내 업무 용지');await page.getByRole('option',{name:'내 업무 용지',exact:true}).waitFor();
  const box=await page.locator('.searchable-choice-popup').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  await page.getByRole('combobox',{name:'라벨 용지 검색'}).press('Enter');await page.waitForFunction(()=>document.querySelector('.label-paper-choice').textContent.includes('내 업무 용지'))
 }
 failList=true;await trigger().click();await page.getByRole('alert').filter({hasText:'저장된 용지를 불러오지 못했습니다.'}).waitFor();await page.getByRole('option',{name:'폼텍 3107',exact:true}).click();failList=false;await trigger().click();await page.getByRole('option',{name:'내 업무 용지',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.searchable-choice-popup').count(),0)
 assert.equal(writes,1);assert.deepEqual(errors,[]);console.log('PASS saved paper immediate selection/reload/search/server pagination/rename refresh/mobile keyboard/error recovery; real app route with mocked API')
}finally{await browser.close()}
