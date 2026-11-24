import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {mkdir} from 'node:fs/promises'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',review=process.env.LABEL_LAYOUT_REVIEW_DIR
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[]
page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
await context.addInitScript(()=>{localStorage.setItem('ieble-wms.language','ko');window.labelLayoutErrors=[];window.addEventListener('error',event=>window.labelLayoutErrors.push(event.message))})
await context.route('**/api/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;assert.equal(req.method(),'GET','layout tests never write to an API')
 if(path==='/api/auth/me')return route.fulfill({json:{user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'격리 기업',role:'Employee',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'}})
 if(path==='/api/health/db')return route.fulfill({json:{status:'connected'}})
 if(path==='/api/tenants/fixture/workspace')return route.fulfill({json:{id:'fixture',name:'격리 기업',role:'Employee',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{products:['menu','read','create','update']}}})
 if(path==='/api/tenants/fixture/pages/products')return route.fulfill({json:{}})
 throw new Error('Unexpected API '+path)
})
const btn=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByLabel(name,{exact:true}),canvas=page.locator('.label-edit-canvas'),viewport=page.locator('.label-canvas-scroll')
async function pane(name){if(name==='객체 속성'){const toggle=page.locator('.label-mobile-panels').getByRole('button',{name,exact:true});if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();return}if(!await page.locator('.label-sidebar-tabs').isVisible())await btn('편집 패널').click();await page.getByRole('tab',{name,exact:true}).click()}
async function fitGeometry(){
 await page.waitForFunction(()=>{const v=document.querySelector('.label-canvas-scroll'),s=document.querySelector('.label-edit-canvas');if(!s||!v||v.dataset.zoomMode!=='fit')return false;const a=s.getBoundingClientRect(),b=v.getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<2&&Math.abs(a.y+a.height/2-b.y-b.height/2)<2&&Math.min(Math.abs(a.width-(v.clientWidth-48)),Math.abs(a.height-(v.clientHeight-48)))<2})
 const state=await viewport.evaluate(v=>{const s=v.querySelector('svg'),a=s.getBoundingClientRect(),b=v.getBoundingClientRect(),w=document.querySelector('.label-workspace').getBoundingClientRect(),map=document.querySelector('.label-sheet-map');return{width:a.width,height:a.height,viewport:b.toJSON(),scrollWidth:v.scrollWidth,clientWidth:v.clientWidth,bottom:w.bottom,pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,screenWidth:innerWidth,screenHeight:innerHeight,mapHeight:map.clientHeight,mapScroll:map.scrollHeight}})
 assert(Math.abs(state.width/state.height-99.1/33.9)<.001);assert(state.width<=state.clientWidth-47);assert(state.scrollWidth<=state.clientWidth+1);assert(state.pageWidth<=state.screenWidth+1)
 if(state.screenWidth>1100){assert(state.bottom<state.screenHeight);assert(state.pageHeight<=state.screenHeight+2,'desktop page overflow '+JSON.stringify(state));if(state.mapHeight)assert(state.mapHeight>=80)}
}
async function revealViewport(){await viewport.evaluate(e=>window.scrollTo(0,window.scrollY+e.getBoundingClientRect().top-85))}
async function panBy(dx,dy,button='middle'){
 await revealViewport();const v=await viewport.boundingBox();const x=button==='left'?v.x+10:v.x+v.width/2,y=button==='left'?v.y+10:v.y+v.height/2
 await page.mouse.move(x,y);await page.mouse.down({button});await page.mouse.move(x+dx,y+dy,{steps:5});await page.mouse.up({button})
}
async function centerTarget(target){await revealViewport();const v=await viewport.boundingBox(),o=await target.boundingBox();await panBy(v.x+v.width/2-o.x-o.width/2,v.y+v.height/2-o.y-o.height/2)}
async function panState(){return viewport.evaluate(e=>({x:Number(e.dataset.panX),y:Number(e.dataset.panY),zoom:Number(e.dataset.zoom)}))}
const near=(actual,expected)=>assert(Math.abs(actual-expected)<.15,`${actual} != ${expected}`)
async function screenshot(name){if(review){await mkdir(review,{recursive:true});await page.screenshot({path:review+'/'+name+'.png'})}}
try{
 for(const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/app/label-editor');await canvas.waitFor();await fitGeometry();assert.equal(await page.locator('.label-slot').count(),16)
  if([390,1440,1920].includes(width))await screenshot('initial-'+width)
  await pane('편집 도구');await btn('텍스트 추가').click();await field('텍스트').fill('라벨 편집 테스트');await field('너비(mm)').fill('35');await field('높이(mm)').fill('10')
  for(const mode of ['fit','.5','1','2']){
   await field('편집 확대').selectOption(mode==='.5'?'0.5':mode);await pane('객체 속성');await field('가로 위치(mm)').fill('2');await field('세로 위치(mm)').fill('2');await centerTarget(canvas.locator('[data-object-id]').first())
   const box=await canvas.boundingBox(),target=await canvas.locator('[data-object-id]').first().boundingBox(),scale=box.width/99.1,before=await panState()
   const start={x:target.x+target.width/2,y:target.y+target.height/2}
   await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+7.5*scale,start.y+3*scale,{steps:5});await page.mouse.up();await pane('객체 속성')
   assert.equal(Number(await field('가로 위치(mm)').inputValue()),9.5);assert.equal(Number(await field('세로 위치(mm)').inputValue()),5);assert.deepEqual(await panState(),before)
   assert.equal(Number(await field('너비(mm)').inputValue()),35);assert.equal(Number(await field('높이(mm)').inputValue()),10)
   if(mode==='.5'){const tiny=await canvas.locator('[data-object-id]').first().boundingBox();await page.mouse.move(tiny.x+tiny.width/2,tiny.y+tiny.height/2);await page.mouse.down();await page.mouse.move(tiny.x+tiny.width/2+.5*scale,tiny.y+tiny.height/2);await page.mouse.up();assert.equal(Number(await field('가로 위치(mm)').inputValue()),10);await field('가로 위치(mm)').fill('9.5')}
   await centerTarget(canvas.locator('[data-resize-handle]'));const h=await canvas.locator('[data-resize-handle]').boundingBox()
   await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+5*scale,h.y+h.height/2+2*scale,{steps:4});await page.mouse.up();await pane('객체 속성');assert.equal(Number(await field('너비(mm)').inputValue()),40);assert.equal(Number(await field('높이(mm)').inputValue()),12);await field('너비(mm)').fill('35');await field('높이(mm)').fill('10')
  }
  await btn('화면 맞춤').click();await fitGeometry();await revealViewport();const beforeBlank=await canvas.boundingBox();await panBy(30,15,'left');let after=await canvas.boundingBox();near(after.x-beforeBlank.x,30);near(after.y-beforeBlank.y,15)
  await centerTarget(canvas.locator('[data-object-id]').first());const t=await canvas.locator('[data-object-id]').first().boundingBox();await page.mouse.click(t.x+t.width/2,t.y+t.height/2);await page.mouse.move(t.x+t.width/2,t.y+t.height/2);const beforeSpace=await panState();await btn('100%').focus();await page.keyboard.down('Space');assert.equal(await viewport.evaluate(e=>getComputedStyle(e).cursor),'grab');await page.mouse.down();assert.equal(await viewport.evaluate(e=>getComputedStyle(e).cursor),'grabbing');await page.mouse.move(t.x+t.width/2+24,t.y+t.height/2-12,{steps:4});await page.mouse.up();await page.keyboard.up('Space');after=await panState();near(after.x-beforeSpace.x,24);near(after.y-beforeSpace.y,-12);near(after.zoom,beforeSpace.zoom)
  await pane('객체 속성');assert.equal(Number(await field('가로 위치(mm)').inputValue()),9.5);assert.equal(Number(await field('세로 위치(mm)').inputValue()),5)
  const stable=await panState();await field('텍스트').focus();await page.keyboard.press('End');await page.keyboard.press('Space');assert((await field('텍스트').inputValue()).endsWith(' '));await field('텍스트').fill('라벨 편집 테스트');assert.deepEqual(await panState(),stable)
  await revealViewport();const v=await viewport.boundingBox(),pointer={x:Math.round(v.x+v.width/2+15),y:Math.round(v.y+v.height/2+10)},oldBox=await canvas.boundingBox(),oldView=await panState(),scroll=await page.evaluate(()=>window.scrollY)
  await page.mouse.move(pointer.x,pointer.y);await page.mouse.wheel(0,-100);await page.waitForFunction(z=>Number(document.querySelector('.label-canvas-scroll').dataset.zoom)>z,oldView.zoom);const newBox=await canvas.boundingBox();near(newBox.x+(pointer.x-oldBox.x)/oldBox.width*newBox.width,pointer.x);near(newBox.y+(pointer.y-oldBox.y)/oldBox.height*newBox.height,pointer.y);assert.equal(await page.evaluate(()=>window.scrollY),scroll)
  assert.equal(await viewport.evaluate(e=>getComputedStyle(e).overflow),'clip');assert.equal(await viewport.evaluate(e=>e.scrollLeft+e.scrollTop),0);if(width===1440)await screenshot('panned-1440')

  const zoom=await viewport.getAttribute('data-zoom');await pane('라벨 목록');await btn('라벨 2').click();assert.equal((await panState()).x,0);assert.equal((await panState()).y,0);assert.equal(await canvas.locator('[data-object-id]').count(),0);assert.equal(await viewport.getAttribute('data-zoom'),zoom);await btn('라벨 1').click();assert.equal(await canvas.locator('[data-object-id]').count(),1);assert.equal(await viewport.getAttribute('data-zoom'),zoom)
  await page.setViewportSize({width:width+10,height});await page.waitForTimeout(80);assert.equal(await viewport.getAttribute('data-zoom'),zoom);await page.setViewportSize({width,height});await btn('화면 맞춤').click();await fitGeometry()
  await canvas.locator('[data-object-id]').click();await pane('객체 속성');assert.equal(await field('텍스트').inputValue(),'라벨 편집 테스트');if([390,1440,1920].includes(width)){await page.evaluate(()=>window.scrollTo(0,0));await screenshot('selected-'+width)}
  console.log(`PASS ${width}x${height}: initial fit, centering, ratio, manual zoom retained, blank/Space/middle pan, pointer wheel zoom, snap drag/resize at fit/50%/100%/200%, independent labels and responsive panels`)
 }
 // Fit also follows an actual width change, unlike manual zoom.
 await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/app/label-editor');await canvas.waitFor();await fitGeometry();const initial=Number(await viewport.getAttribute('data-zoom'));await page.setViewportSize({width:1920,height:1080});await fitGeometry();assert(Number(await viewport.getAttribute('data-zoom'))>initial)
 await btn('100%').click();assert.equal(await viewport.getAttribute('data-zoom'),'1');await btn('라벨 확대').click();assert.equal(await viewport.getAttribute('data-zoom'),'1.25');await btn('라벨 축소').click();assert.equal(await viewport.getAttribute('data-zoom'),'1');await btn('화면 맞춤').click();await fitGeometry()
 // A deliberately collapsed property panel stays collapsed during selection/drag.
 await pane('편집 도구');await btn('텍스트 추가').click();await field('너비(mm)').fill('35');await field('높이(mm)').fill('10');await field('가로 위치(mm)').fill('2');await field('세로 위치(mm)').fill('2');await btn('속성').click();await fitGeometry()
 const hiddenBox=await canvas.boundingBox(),hiddenScale=hiddenBox.width/99.1
 await page.mouse.move(hiddenBox.x+10*hiddenScale,hiddenBox.y+6*hiddenScale);await page.mouse.down();await page.mouse.move(hiddenBox.x+17.5*hiddenScale,hiddenBox.y+9*hiddenScale,{steps:5});await page.mouse.up();assert.equal(await page.locator('.label-properties').count(),0);await btn('속성').click();await fitGeometry();assert.equal(Number(await field('가로 위치(mm)').inputValue()),9.5);assert.equal(Number(await field('세로 위치(mm)').inputValue()),5)
 console.log('PASS collapsed properties preserve pointer geometry; fit follows resizing and manual zoom controls')
 // Chromium's touch input pipeline, without writing any real API data.
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2})
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/app/label-editor');await canvas.waitFor();await fitGeometry();await pane('편집 도구');await btn('텍스트 추가').click();await field('텍스트').fill('터치 검증');await field('너비(mm)').fill('25');await field('높이(mm)').fill('10');await centerTarget(canvas.locator('[data-object-id]').first())
 const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});await page.waitForTimeout(30)}
 await btn('화면 맞춤').click();await fitGeometry();await revealViewport();let tv=await viewport.boundingBox(),pv=await panState(),sy=await page.evaluate(()=>scrollY)
 await touch('touchStart',[[1,tv.x+10,tv.y+10]]);await touch('touchMove',[[1,tv.x+45,tv.y+30]]);await touch('touchEnd',[]);let now=await panState();near(now.x-pv.x,35);near(now.y-pv.y,20);assert.equal(await page.evaluate(()=>scrollY),sy)
 for(const z of ['0.5','1','2']){
  await field('편집 확대').selectOption(z);await pane('객체 속성');await field('가로 위치(mm)').fill('2');await field('세로 위치(mm)').fill('2');await centerTarget(canvas.locator('[data-object-id]').first());const o=await canvas.locator('[data-object-id]').first().boundingBox(),b=await canvas.boundingBox(),sc=b.width/99.1,x=o.x+o.width/2,y=o.y+o.height/2,pv=await panState()
  await touch('touchStart',[[1,x,y]]);await touch('touchMove',[[1,x+7.5*sc,y+3*sc]]);await touch('touchEnd',[]);await pane('객체 속성');assert.equal(Number(await field('가로 위치(mm)').inputValue()),9.5);assert.equal(Number(await field('세로 위치(mm)').inputValue()),5);assert.deepEqual(await panState(),pv)
 }
 await centerTarget(canvas.locator('[data-object-id]').first());tv=await viewport.boundingBox();pv=await panState();const cx=tv.x+tv.width/2,cy=tv.y+tv.height/2
 await touch('touchStart',[[1,cx-40,cy],[2,cx+40,cy]]);await touch('touchMove',[[1,cx-40,cy+10],[2,cx+80,cy+10]]);await touch('touchEnd',[]);now=await panState();near(now.zoom,pv.zoom*1.5);near(now.x,pv.x*1.5+20);near(now.y,pv.y*1.5+10);near(await page.evaluate(()=>visualViewport.scale),1)
 await pane('객체 속성');assert.equal(Number(await field('가로 위치(mm)').inputValue()),9.5)
 // A second finger must cancel the pending object preview instead of committing it.
 await field('편집 확대').selectOption('1');await centerTarget(canvas.locator('[data-object-id]').first());const obj=await canvas.locator('[data-object-id]').first().boundingBox(),cx2=obj.x+obj.width/2,cy2=obj.y+obj.height/2
 await touch('touchStart',[[1,cx2,cy2]]);await touch('touchMove',[[1,cx2+8,cy2]]);await touch('touchStart',[[1,cx2+8,cy2],[2,cx2+65,cy2]]);await touch('touchMove',[[1,cx2+15,cy2+12],[2,cx2+72,cy2+12]]);await touch('touchEnd',[]);await pane('객체 속성');assert.equal(Number(await field('가로 위치(mm)').inputValue()),9.5);assert.equal(Number(await field('세로 위치(mm)').inputValue()),5)
 await btn('화면 맞춤').click();await fitGeometry();await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false})
 console.log('PASS touch pan, object drag at 50/100/200%, two-finger pan/pinch and object-to-pinch cancellation; native devices not exercised')
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.labelLayoutErrors),[])
}catch(error){console.error('Layout failure:',await page.locator('.label-editor').innerText());if(review)await screenshot('failure');throw error}finally{await browser.close()}
