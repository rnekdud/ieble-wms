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
 for(const language of ['ko','en'])for(const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});await page.addInitScript(language=>localStorage.setItem('ieble-wms.language',language),language);await page.goto(origin+'/app/label-editor');await page.locator('.label-edit-canvas').waitFor();
  const layout=await page.evaluate(()=>{
   const bounds=selector=>[...document.querySelectorAll(selector)].filter(e=>e.getBoundingClientRect().width).map(e=>e.getBoundingClientRect().toJSON());
   return {pageWidth:document.documentElement.scrollWidth,actions:bounds('.label-editor > .wms-page-heading .wms-page-actions > button'),zoom:bounds('.label-zoom-toolbar > button,.label-zoom-toolbar > select'),commands:bounds('.label-toolbar button'),viewport:bounds('.label-canvas-scroll')[0],canvas:bounds('.label-edit-canvas')[0]}
  });assert(layout.pageWidth<=width+1);
  for(const boxes of [layout.actions,layout.zoom,layout.commands])for(let i=0;i<boxes.length;i++){
   const a=boxes[i];assert(a.x>=0&&a.right<=width+1);
   for(let j=i+1;j<boxes.length;j++){const b=boxes[j];assert(Math.min(a.right,b.right)<=Math.max(a.left,b.left)+1||Math.min(a.bottom,b.bottom)<=Math.max(a.top,b.top)+1,'overlapping controls')}
  }
  if(width<=1100){for(const a of layout.actions)assert(Math.abs(a.y-layout.actions[0].y)<1);for(const a of [...layout.actions,...layout.zoom,...layout.commands])assert(a.height>=43,'touch target '+JSON.stringify(a));for(const a of layout.zoom)assert(Math.abs(a.y-layout.zoom[0].y)<1)}
  if(width<=430&&language==='ko')assert(layout.viewport.y<590,'canvas is pushed too far down');
  assert(Math.abs(layout.canvas.width/layout.canvas.height-99.1/33.9)<.001);
  const tabs=page.getByRole('tab',{name:language==='ko'?'편집 도구':'Editing tools',exact:true});await tabs.click();await page.getByRole('button',{name:language==='ko'?'텍스트 추가':'Add Text',exact:true}).click();await page.locator('#label-object-text').fill('모바일 라벨 000123');
  assert.equal(await page.locator('.label-edit-canvas text').textContent(),'모바일 라벨 000123');
  await page.getByRole('button',{name:language==='ko'?'미리보기·출력':'Preview & print',exact:true}).click();await page.locator('.label-preview-sheet').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.getByRole('button',{name:language==='ko'?'편집으로 돌아가기':'Back to editing',exact:true}).click();
  console.log('PASS organized mobile editor, usable controls and preview '+language+' '+width+'x'+height)
 }
 assert.deepEqual(errors,[])
}finally{await browser.close()}
