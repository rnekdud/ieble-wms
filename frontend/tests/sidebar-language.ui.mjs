import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://localhost:5176'
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[]
try {
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/api/**',route=>{
  const request=route.request(),p=new URL(request.url()).pathname
  assert.equal(request.method(),'GET','Only mocked reads allowed')
  const json=data=>route.fulfill({json:data})
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'QA',userName:'qa',email:'qa@example.test',systemRole:'User',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'QA',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p.endsWith('/workspace'))return json({id:'fixture',name:'QA',role:'Master',permissions:Object.fromEntries(workspacePages.map(p=>[p.key,['menu','read','readAll','create','update']])),serviceStatus:'Active',billingStatus:'Active',billingAccess:{state:'Active',canAccessWms:true,hasRegisteredCard:true},billingPolicy:{monthlyPerUserKrw:0},canManageBilling:true})
  if(p.endsWith('/products/options'))return json({categories:[],productTypes:[],units:['EA']})
  if(p.endsWith('/products'))return json({items:[{product:{id:'p1',name:'입고',code:'PR01',unit:'EA',isActive:true,version:'1'},categoryName:'분류'}],total:1,page:1,pageSize:20})
  return json({items:[],total:0,page:1,pageSize:20})
 })
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 const drawer=()=>page.locator('.mobile-all-menu'),trigger=()=>page.locator('.sidebar-language-trigger:visible').first()
 async function expose(){await page.locator('.sidebar-language-trigger:visible,.mobile-header-menu:visible').first().waitFor();if(!await trigger().count())await page.locator('.mobile-header-menu').click();await trigger().waitFor()}
 async function closeDrawer(){if(await drawer().count())await drawer().locator('.dialog-close').click()}
 for(const [width,height]of[[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/app/products');await page.getByText('입고',{exact:true}).filter({visible:true}).first().waitFor()
  assert.equal(await page.locator('header .wms-language,header .sidebar-language').count(),0)
  const search=page.locator('input[aria-label="상품 검색"],input[aria-label="Search Products"]');await search.fill('원본 입력')
  await expose();const current=(await trigger().innerText()).trim();assert(['한국어','English'].includes(current))
  await trigger().click();const menu=page.getByRole('menu');await menu.waitFor()
  assert.equal(await menu.getByRole('menuitemradio',{checked:true}).innerText(),current)
  await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});assert(await trigger().isVisible());if(width<768)assert(await drawer().isVisible())
  await trigger().click();await menu.getByRole('menuitemradio',{name:'English',exact:true}).click();await menu.waitFor({state:'hidden'});assert.equal((await trigger().innerText()).trim(),'English')
  const bounds=await trigger().boundingBox();assert(bounds.width>=44&&bounds.height>=44);assert(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1,JSON.stringify(bounds))
  const scroller=page.locator('.mobile-all-menu > .dialog-body:visible,.wms-sidebar .wms-business-nav:visible').first()
  await scroller.evaluate(e=>{e.scrollTop=0});const before=await trigger().boundingBox();await scroller.evaluate(e=>{e.scrollTop=e.scrollHeight});const after=await trigger().boundingBox();assert.equal(before.y,after.y)
  await trigger().click();await menu.waitFor();await page.locator('.mobile-all-menu .organization-dialog-heading:visible,.wms-sidebar-caption:visible').first().click({position:{x:4,y:4}});await menu.waitFor({state:'hidden'})
  await closeDrawer();assert.equal(await search.inputValue(),'원본 입력');assert.equal(await page.locator('html').getAttribute('lang'),'en')
  await page.reload();await expose();assert.equal((await trigger().innerText()).trim(),'English')
  if(await page.locator('.wms-sidebar:visible').count()) {
   const toggle=page.locator('.wms-sidebar-bottom > button');await toggle.click();assert(await page.locator('.wms-sidebar.is-collapsed').count())
   assert.equal(await trigger().innerText(),'');assert.equal(await trigger().getAttribute('aria-label'),'English')
   await trigger().click();await menu.waitFor();const m=await menu.boundingBox();assert(m.x>=0&&m.x+m.width<=width)
   await page.keyboard.press('Home');await page.keyboard.press('Enter');await menu.waitFor({state:'hidden'});assert.equal(await trigger().getAttribute('aria-label'),'한국어')
   await toggle.click();assert.equal((await trigger().innerText()).trim(),'한국어');assert.equal(await page.locator('.wms-sidebar-bottom > .wms-side-label').count(),0)
  } else {
   await trigger().click();await menu.getByRole('menuitemradio',{name:'한국어',exact:true}).click();assert.equal((await trigger().innerText()).trim(),'한국어');await closeDrawer()
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
  console.log('PASS sidebar language',width,height,'menu, Escape/outside, persistence, fixed footer and original input')
 }
 assert.deepEqual(errors,[])
}finally{await browser.close()}
