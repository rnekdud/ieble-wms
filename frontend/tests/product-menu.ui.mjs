import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176'
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({serviceWorkers:'block',hasTouch:true}),page=await context.newPage(),errors=[],requests=[]
let permissions={products:['menu','read'],'stock-adjustments':['menu','read'],'org-chart':['menu','read']}
page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
await context.route('**/api/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;assert.equal(req.method(),'GET','Menu checks never write business data');requests.push(path)
 if(path==='/api/auth/me')return route.fulfill({json:{user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'격리 기업',role:'Employee',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'}})
 if(path==='/api/health/db')return route.fulfill({json:{status:'connected'}})
 if(path==='/api/tenants/fixture/workspace')return route.fulfill({json:{id:'fixture',name:'격리 기업',role:'Employee',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions}})
 if(path.startsWith('/api/tenants/fixture/pages/'))return route.fulfill({json:{}})
 if(path==='/api/tenants/fixture/products')return route.fulfill({json:{items:[],total:0,page:1,pageSize:20}})
 if(path==='/api/tenants/fixture/products/options')return route.fulfill({json:{categories:[],productTypes:[],units:['EA']}})
 throw new Error('Unexpected API '+path)
})
const text={ko:{product:'상품관리',label:'라벨링 출력',inventory:'재고관리',barcode:'바코드 조회',open:'전체 메뉴 열기'},en:{product:'Product Management',label:'Label Printing',inventory:'Inventory Management',barcode:'Barcode Lookup',open:'Open All Menus'}}
async function visibleCurrent(nav,mobile){await page.waitForFunction(mobile=>{const n=document.querySelector(mobile?'.mobile-all-menu .dialog-body':'.wms-business-nav'),c=n?.querySelector('[aria-current=page]');if(!c||!c.getClientRects().length)return false;const a=n.getBoundingClientRect(),b=c.getBoundingClientRect();return b.top>=a.top-1&&b.bottom<=a.bottom+1},mobile);assert.equal(await nav.locator('[aria-current=page]:visible').count(),1)}
try{
 for(const language of ['ko','en'])for(const [width,height] of [[1440,900],[1440,600],[390,844],[667,375]]){
  const t=text[language],mobile=width<=1024
  await page.setViewportSize({width,height});await page.addInitScript(l=>localStorage.setItem('ieble-wms.language',l),language);await page.goto(origin+'/app/label-editor');await page.locator('.label-edit-canvas').waitFor()
  const open=async()=>{if(mobile)await page.locator('.mobile-header-menu').click()};await open()
  const nav=page.locator(mobile?'.mobile-all-menu nav':'.wms-business-nav'),parent=nav.locator(mobile?'.mobile-menu-toggle':'.wms-nav-group > button').filter({hasText:new RegExp('^'+t.product+'$')}),groups=nav.locator(mobile?'.mobile-menu-toggle':'.wms-nav-group > button')
  const child=name=>nav.locator(mobile?'.mobile-menu-sublist > button':'.wms-subnav > a').filter({hasText:new RegExp('^'+name+'$')})
  assert.equal(await parent.count(),1);assert.equal(await parent.getAttribute('aria-expanded'),'true');assert.equal(await child(t.product).count(),1);assert.equal(await child(t.label).count(),1);await visibleCurrent(nav,mobile)
  assert.equal(await nav.locator(mobile?'.mobile-menu-list:not(.mobile-menu-sublist) > button':':scope > a').filter({hasText:new RegExp('^'+t.label+'$')}).count(),0)
  const labels=await nav.locator(mobile?'.mobile-menu-item:visible':'.wms-nav-link:visible').allTextContents();assert(labels.findIndex(x=>x.trim()===t.product)<labels.findIndex(x=>x.trim()===t.barcode),'product group must precede barcode')
  const before=requests.length;await parent.click();assert.equal(await parent.getAttribute('aria-expanded'),'false');assert.equal(new URL(page.url()).pathname,'/app/label-editor');await page.waitForTimeout(80);assert.equal(requests.length,before,'parent is only an accordion')
  await parent.focus();await page.keyboard.press('Enter');assert.equal(await parent.getAttribute('aria-expanded'),'true')
  await nav.getByRole('button',{name:t.inventory,exact:true}).click();assert.equal(await parent.getAttribute('aria-expanded'),'false');assert.equal(await groups.locator('xpath=self::*[@aria-expanded="true"]').count(),1)
  // A language rerender must not reopen the parent of the still-current label page.
  await page.evaluate(async language=>(await import('/src/i18n.ts')).setLanguage(language==='ko'?'en':'ko'),language);await page.waitForTimeout(50);await page.evaluate(async language=>(await import('/src/i18n.ts')).setLanguage(language),language);await page.waitForTimeout(50);assert.equal(await parent.getAttribute('aria-expanded'),'false')
  await parent.click();await child(t.product).click();await page.waitForURL(origin+'/app/products');await page.getByRole('heading',{name:t.product,exact:true}).waitFor();await open();assert.equal(await parent.getAttribute('aria-expanded'),'true');assert.equal(await child(t.product).getAttribute('aria-current'),'page')
  await child(t.label).click();await page.waitForURL(origin+'/app/label-editor');await page.locator('.label-edit-canvas').waitFor();await open();assert.equal(await parent.getAttribute('aria-expanded'),'true');assert.equal(await child(t.label).getAttribute('aria-current'),'page')
  const color=await child(t.label).evaluate(e=>getComputedStyle(e).backgroundColor);assert.notEqual(color,'rgba(0, 0, 0, 0)')
  await parent.click();await page.reload();await page.locator('.label-edit-canvas').waitFor();await open();assert.equal(await parent.getAttribute('aria-expanded'),'true');await visibleCurrent(nav,mobile)
  const container=mobile?page.locator('.mobile-all-menu .dialog-body'):nav;assert.equal(await container.evaluate(e=>getComputedStyle(e,'::-webkit-scrollbar').width),'3px')
  assert(await page.locator(mobile?'.mobile-all-menu .sidebar-language-trigger':'.wms-sidebar .sidebar-language-trigger').isVisible())
  if(!mobile){assert.equal(Math.round((await page.locator('.wms-sidebar').boundingBox()).width),232);await page.getByRole('button',{name:language==='ko'?'사이드바 접기':'Collapse sidebar',exact:true}).click();await parent.click();assert.equal(await parent.getAttribute('aria-expanded'),'true');await visibleCurrent(nav,false)}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  console.log(`PASS ${language} ${width}x${height}: group order, keyboard toggle, both routes, one-open policy, rerender, refresh, active highlight and scroll`)
 }
 for(const grants of [{products:['read']},{products:['menu']},{warehouses:['read']}]){
  permissions=grants;await page.setViewportSize({width:390,height:844});await page.goto(origin+'/app/barcode-lookup');await page.locator('.mobile-header-menu').click();assert.equal(await page.locator('.mobile-menu-toggle').count(),0);assert.equal(await page.locator('.mobile-menu-sublist').count(),0)
 }
 assert.deepEqual(errors,[]);console.log('PASS existing product menu/read grants; warehouse-only barcode access remains separate')
}finally{await browser.close()}
