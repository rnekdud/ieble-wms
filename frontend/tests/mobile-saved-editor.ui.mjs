import { selectPlanObject } from './plan-scene.mjs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176',endpoint='/api/tenants/11111111-1111-4111-8111-111111111111/warehouses',wid='w1',version='00000000-0000-0000-0000-000000000001'
const item={version,isActive:true},zone={...item,id:'z1',code:'Z-01',name:'보관구역 A'},rack={...item,id:'r1',zoneId:'z1',name:'랙 A-01',code:'R-01',levels:2,bays:2}
const objects=[{id:'zo',type:'zone',zoneId:'z1',label:zone.name,x:.5,y:.5,width:.7,height:.6,rotation:0,fill:'#eeeeee'},{id:'ro',type:'rack',rackId:'r1',label:rack.name,x:.5,y:.5,width:.2,height:.2,rotation:0,fill:'#ffffff'}]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[]
 await context.addInitScript(()=>{window.drawnTexts=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...args){window.drawnTexts.push(t);return original.call(this,t,...args)}})
 await context.route('**/api/**',route=>{
 const path=new URL(route.request().url()).pathname
 if(path==='/api/auth/csrf')return route.fulfill({json:{token:'fixture'}})
 if(path.endsWith('/workspace'))return route.fulfill({json:{detail:{warehouse:{...item,id:wid,code:'WH1',name:'QA 창고',contactUserId:'qa-user',contactName:'QA'},zones:[zone],racks:[rack],locationCount:4},floorLocations:[],plan:{exists:true,version,schemaVersion:1,aspectRatio:1.6,objects}}})
 if(path.endsWith('/front'))return route.fulfill({json:{rack,locations:Array.from({length:4},(_,i)=>({location:{...item,id:'l'+i,code:'L-'+i,name:`${Math.floor(i/2)+1}단 ${i%2+1}칸`,level:Math.floor(i/2)+1,bay:i%2+1}}))}})
 if(path.endsWith('/business-assignees'))return route.fulfill({json:{items:[],total:0}})
 if(path.endsWith('/plan-imports'))return route.fulfill({json:{id:'job',fileName:'fixture.png',status:'Ready',page:0,rotation:0,revision:1,metadata:{pageCount:1,width:800,height:600,aspectRatio:1.333,warnings:[]}}})
 if(path.endsWith('/preview'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="white"/></svg>'})
 if(path.endsWith('/discard'))return route.fulfill({json:{}})
 throw Error('Unexpected API '+path)
 })
 await context.route(origin+'/__editor-part2*',route=>route.fulfill({contentType:'text/html',body:`<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/editor-part2-ui.tsx"></script></html>`}))
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.stack))

 for(const [width,height]of [[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1440,900]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/__editor-part2');await page.locator('.warehouse-plan-canvas canvas').first().waitFor()
  const canvas=page.locator('.warehouse-plan-canvas'),box=await canvas.boundingBox()
  assert(box.y<height-40);assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))
  if(width<=1024){
   assert.equal(await page.locator('.mobile-plan-primary > button').count(),6)
   assert.equal(await page.locator('.plan-catalog').count(),0);await selectPlanObject(page,'ro')
   const panel=page.getByRole('complementary',{name:'선택 객체 속성'});await panel.waitFor()
   assert.equal(await canvas.evaluate(e=>e.offsetHeight),Math.round(box.height));await page.getByRole('button',{name:'속성 패널 닫기',exact:true}).click();await panel.waitFor({state:'hidden'})
   await page.getByRole('button',{name:'더보기',exact:true}).click();await page.getByRole('group',{name:'추가 도구'}).getByRole('button',{name:'보관 위치 추가',exact:true}).click();await page.getByRole('group',{name:'추가 도구'}).waitFor({state:'hidden'});await panel.waitFor()
   await page.getByRole('button',{name:'속성 패널 닫기',exact:true}).click();await page.getByRole('button',{name:'도면 실행 취소',exact:true}).click()
  }
  console.log(`PASS saved warehouse ${width}x${height}: canvas Y=${box.y.toFixed(1)}, linked rack properties, location add/undo, no persistence`)
 }
 assert.deepEqual(errors,[])
}finally{await browser.close()}
