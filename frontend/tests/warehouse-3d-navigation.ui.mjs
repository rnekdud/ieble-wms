import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',errors=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]))
try {
 const context=await browser.newContext({hasTouch:true,serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());assert.equal(url.origin,origin)
  assert(!url.pathname.startsWith('/api/'),'fixture must not access business APIs')
  if(url.pathname==='/__navigation-ui')return route.fulfill({contentType:'text/html',body:'<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:12px}.warehouse-scene{height:calc(100dvh - 100px);min-height:240px}output{display:block;height:22px}</style><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/warehouse-3d-navigation-ui.tsx"></script></html>'})
  return route.continue()
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 const state=()=>page.locator('.warehouse-scene').evaluate(e=>JSON.parse(e.dataset.camera))
 const project=point=>page.evaluate(p=>window.qaProject(p),point)
 const settled=()=>page.waitForFunction(()=>document.querySelector('.warehouse-scene')?.dataset.panning==='false')
 const unchangedView=(a,b)=>{assert(Math.abs(a.zoom-b.zoom)<1e-9);assert(Math.abs(a.position[1]-b.position[1])<1e-8);assert(Math.abs(a.target[1]-b.target[1])<1e-8);assert(distance(a.position.map((v,i)=>v-a.target[i]),b.position.map((v,i)=>v-b.target[i]))<1e-7)}
 async function centre(point){await page.waitForFunction(point=>{const p=window.qaProject(point),b=document.querySelector('canvas').getBoundingClientRect();return document.querySelector('.warehouse-scene').dataset.panning==='false'&&Math.abs(p.x-b.x-b.width/2)<1&&Math.abs(p.y-b.y-b.height/2)<1},point);const p=await project(point),b=await page.locator('canvas').boundingBox();assert(Math.abs(p.x-(b.x+b.width/2))<1,JSON.stringify({p,b}));assert(Math.abs(p.y-(b.y+b.height/2))<1)}
 async function fit(){await page.getByRole('button',{name:'맞춤',exact:true}).click();await page.waitForTimeout(100)}
 for(const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1440,900]]) {
  await page.setViewportSize({width,height});await page.goto(origin+'/__navigation-ui');await page.locator('.warehouse-scene[data-ready=true][data-camera]').waitFor()
  const original=await page.evaluate(()=>JSON.stringify(window.qaPlan)),before=await state(),point=[-10,-.02,5],p=await project(point)
  await page.mouse.click(p.x,p.y);await page.waitForFunction(()=>document.querySelector('.warehouse-scene').dataset.panning==='true');const mid=await state();assert(distance(mid.target,before.target)>0);unchangedView(before,mid);await settled();await centre(point);unchangedView(before,await state())
  await fit();const aisle=[-6,.065,0],ap=await project(aisle);await page.touchscreen.tap(ap.x,ap.y);await settled();await centre(aisle)
  await fit();const a=await project([-10,-.02,5]);await page.mouse.click(a.x,a.y);await page.waitForTimeout(60);const b=await project([-7,.065,-3]);await page.mouse.move(b.x,b.y);await page.mouse.down();await settled();const clicked=await page.evaluate(p=>window.qaGround(p.x,p.y,.065),b);await page.mouse.up();await centre(clicked)
  await fit();const canvas=await page.locator('canvas').boundingBox(),empty={x:canvas.x+3,y:canvas.y+3},noMove=await state();await page.mouse.click(empty.x,empty.y);await page.waitForTimeout(600);assert(distance(noMove.target,(await state()).target)<1e-9)
  // Shelf 3 / bay 1 retains its actual rack and slot selection, never a floor pan.
  await fit();const shelf=await project([2.7,1.7925,-2.8125]),prePick=await state();await page.mouse.click(shelf.x,shelf.y);await page.waitForFunction(()=>document.querySelector('#pick').dataset.count==='1');const pick=JSON.parse(await page.locator('#pick').innerText());assert.equal(pick.rackId,'qa-rack');assert.equal(pick.level,3);assert.equal(pick.bay,1);unchangedView(prePick,await state());assert(distance(prePick.target,(await state()).target)<1e-8)
  await fit();const start=await project([-10,-.02,5]),preDrag=await state();await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+45,start.y+15,{steps:8});await page.mouse.up();await page.waitForTimeout(700);assert.equal(await page.locator('.warehouse-scene').getAttribute('data-panning'),'false');assert(distance(preDrag.position,(await state()).position)>.1);assert.equal(await page.locator('#pick').getAttribute('data-count'),'1')
  await fit();const preRight=await state(),rp=await project([-10,-.02,5]);await page.mouse.move(rp.x,rp.y);await page.mouse.down({button:'right'});await page.mouse.move(rp.x+35,rp.y+10,{steps:6});await page.mouse.up({button:'right'});await page.waitForTimeout(700);assert(distance(preRight.target,(await state()).target)>.1);assert.equal(await page.locator('.warehouse-scene').getAttribute('data-panning'),'false')
  await fit();const wp=await project([-10,-.02,5]);await page.mouse.move(wp.x,wp.y);const preZoom=await state();await page.mouse.wheel(0,-120);await page.waitForTimeout(400);assert((await state()).zoom>preZoom.zoom);await page.getByRole('button',{name:'상단',exact:true}).click();await page.waitForTimeout(100);const top=await state(),tp=await project([-10,-.02,5]);await page.mouse.click(tp.x,tp.y);await settled();await centre([-10,-.02,5]);unchangedView(top,await state())
  assert.equal(await page.evaluate(()=>JSON.stringify(window.qaPlan)),original)
  console.log(`PASS ${width}x${height}: animated floor/aisle centre, preserved pose/zoom/height, retarget, outside ignored, exact shelf pick, rotate/right-pan/wheel/top view; no data changes`)
 }
 // Native browser touch events exercise the same OrbitControls gesture path as a device.
 await fit();const cdp=await context.newCDPSession(page),start=await project([-10,-.02,5]),beforeTouch=await state()
 const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:1,radiusY:1,force:1}))})
 await touch('touchStart',[[0,start.x,start.y]]);for(let n=1;n<=6;n++)await touch('touchMove',[[0,start.x+n*8,start.y+n*3]]);await touch('touchEnd',[]);await page.waitForTimeout(700);assert(distance(beforeTouch.position,(await state()).position)>.1);assert.equal(await page.locator('.warehouse-scene').getAttribute('data-panning'),'false')
 await fit();const c=await page.locator('canvas').boundingBox(),x=c.x+c.width/2,y=c.y+c.height/2,prePinch=await state()
 await touch('touchStart',[[0,x-30,y],[1,x+30,y]]);await touch('touchMove',[[0,x-65,y],[1,x+65,y]]);await touch('touchEnd',[]);await page.waitForTimeout(700);assert((await state()).zoom>prePinch.zoom);assert.equal(await page.locator('.warehouse-scene').getAttribute('data-panning'),'false')
 await fit();const p=await project([-10,-.02,5]);await page.mouse.click(p.x,p.y);await page.waitForTimeout(50);await page.getByRole('button',{name:'맞춤',exact:true}).click();await page.waitForTimeout(650);const restored=await state();assert(distance(restored.target,prePinch.target)<1e-8)
 assert.deepEqual(errors,[]);console.log('PASS touch drag/pinch suppression and interrupt-by-fit; headless touch simulation, no native device claim')
} finally {await browser.close()}
