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
try{
 for(const language of ['ko','en'])for(const [width,height] of [[1440,900],[390,844]]){
  await page.setViewportSize({width,height});await page.addInitScript(language=>localStorage.setItem('ieble-wms.language',language),language);await page.goto(origin+'/app/label-editor');await page.locator('.label-edit-canvas').waitFor();assert(await page.locator('.label-editor').isVisible());assert.equal(await page.locator('.label-slot').count(),16)
  await page.getByRole('tab',{name:language==='ko'?'편집 도구':'Editing tools',exact:true}).click();
  await page.getByRole('button',{name:language==='ko'?'텍스트 추가':'Add Text',exact:true}).click();await page.locator('#label-object-text').fill('데이터 원문');assert.equal(await page.locator('.label-edit-canvas text').textContent(),'데이터 원문');
  await page.evaluate(async()=>{const {requestNavigation}=await import('/src/navigation-guard.ts');window.labelNavigated=false;requestNavigation(()=>window.labelNavigated=true)})
  await page.getByRole('button',{name:language==='ko'?'계속 편집':'Continue Editing',exact:true}).click();assert.equal(await page.evaluate(()=>window.labelNavigated),false);assert.equal(await page.locator('#label-object-text').inputValue(),'데이터 원문')
  await page.evaluate(async()=>{const {requestNavigation}=await import('/src/navigation-guard.ts');requestNavigation(()=>window.labelNavigated=true)})
  await page.getByRole('button',{name:language==='ko'?'변경 버리고 계속':'Discard and Continue',exact:true}).click();assert.equal(await page.evaluate(()=>window.labelNavigated),true)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  console.log('PASS full WMS shell, product permissions, language and unsaved navigation '+language+' '+width)
 }
 allow=false;await page.goto(origin+'/app/label-editor');await page.waitForFunction(()=>document.body.innerText.toLowerCase().includes('permission')||document.body.innerText.toLowerCase().includes('access')||document.body.innerText.includes('권한'));assert.equal(await page.locator('.label-editor').count(),0)
 allow=true;billing=false;await page.goto(origin+'/app/label-editor');await page.waitForTimeout(500);assert.equal(await page.locator('.label-editor').count(),0);assert(permissionChecks>=4);assert.deepEqual(errors,[])
 console.log('PASS missing product grants and billing restriction remain enforced')
}finally{await browser.close()}
