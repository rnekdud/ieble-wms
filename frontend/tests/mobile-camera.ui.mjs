import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://localhost:5176'
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin||u.pathname.startsWith('/api/'))return route.abort();if(u.pathname==='/__mobile-camera')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/mobile-camera.tsx"></script></html>'});return route.continue()})
 await context.addInitScript(()=>{
  window.qa={codes:[],stopped:0,requests:[],constraints:[],denied:false,release:null}
  navigator.mediaDevices.getUserMedia=async constraints=>{window.qa.requests.push(constraints);if(window.qa.requests.length===1)await new Promise(resolve=>window.qa.release=resolve);if(window.qa.denied)throw new DOMException('denied','NotAllowedError');const c=document.createElement('canvas');c.width=640;c.height=240;c.getContext('2d').fillRect(0,0,640,240);const stream=c.captureStream(10);for(const track of stream.getTracks()){const settings={zoom:3,focusMode:'manual'};track.getCapabilities=()=>({zoom:{min:1,max:8},focusMode:['manual','single-shot','continuous']});track.getSettings=()=>settings;track.applyConstraints=async c=>{window.qa.constraints.push(c);Object.assign(settings,c.advanced[0])};const stop=track.stop.bind(track);track.stop=()=>{window.qa.stopped++;stop()}}return stream}
  window.BarcodeDetector=class {static async getSupportedFormats(){return ['ean_13','code_128']}async detect(){return window.qa.codes.map(rawValue=>({rawValue}))}}
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/__mobile-camera')
 await page.getByRole('button',{name:'카메라 스캔',exact:true}).click();await page.getByRole('dialog',{name:'바코드 스캔',exact:true}).waitFor();await page.waitForFunction(()=>window.qa.requests.length===1)
 assert.equal(await page.locator('video').evaluate(e=>getComputedStyle(e).visibility),'hidden')
 assert.equal(await page.locator('video').evaluate(e=>e.controls),false)
 await page.evaluate(()=>window.qa.release())
 await page.waitForFunction(()=>document.querySelector('video')?.dataset.ready==='true')
 assert.equal(await page.locator('video').evaluate(e=>getComputedStyle(e).visibility),'visible')
 assert.equal(await page.evaluate(()=>window.qa.requests[0].video.facingMode.ideal),'environment')
 assert.equal(await page.evaluate(()=>window.qa.requests[0].video.width.ideal),1920)
 assert.equal(await page.evaluate(()=>window.qa.requests[0].video.zoom.ideal),1)
 await page.waitForFunction(()=>window.qa.constraints.length===2)
 assert.deepEqual(await page.evaluate(()=>window.qa.constraints.map(c=>c.advanced[0])),[{zoom:1},{focusMode:'continuous'}])
 await page.getByRole('status').filter({hasText:'1배 · 연속 자동초점'}).waitFor()
 assert.equal(await page.locator('video').evaluate(el=>getComputedStyle(el).objectFit),'contain')
 await page.getByRole('button',{name:'초점 다시 맞추기',exact:true}).click()
 await page.getByRole('button',{name:'초점 맞추는 중…',exact:true}).waitFor()
 await page.getByRole('button',{name:'초점 다시 맞추기',exact:true}).waitFor()
 assert.deepEqual(await page.evaluate(()=>window.qa.constraints.slice(-2).map(c=>c.advanced[0].focusMode)),['single-shot','continuous'])
 await page.evaluate(()=>window.qa.codes=['8801234567893']);await page.waitForFunction(()=>document.querySelector('output').textContent==='8801234567893');await page.waitForTimeout(500)
 assert.equal(await page.locator('output').textContent(),'8801234567893');assert.equal(await page.locator('dialog[open]').count(),0);assert(await page.evaluate(()=>window.qa.stopped>0))
 await page.evaluate(()=>{window.qa.codes=[];window.qa.denied=true});await page.getByRole('button',{name:'카메라 스캔',exact:true}).click();await page.getByRole('alert').waitFor();await page.getByRole('textbox',{name:'작업 바코드'}).fill('MANUAL');await page.getByRole('textbox',{name:'작업 바코드'}).press('Enter');assert.match(await page.locator('output').textContent(),/MANUAL/)
 await page.evaluate(()=>window.qa.denied=false);await page.getByRole('button',{name:'카메라 스캔',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'직접 입력하기',exact:true}).click();await page.waitForTimeout(200);assert.equal(await page.locator('dialog[open]').count(),0)
 const stopped=await page.evaluate(()=>window.qa.stopped)
 await page.getByRole('button',{name:'카메라 스캔',exact:true}).click();await page.getByRole('dialog').waitFor();await page.waitForFunction(()=>document.querySelector('video')?.srcObject)
 await page.evaluate(()=>document.querySelector('main > button').click());await page.waitForFunction(old=>window.qa.stopped>old,stopped);assert.equal(await page.locator('dialog[open]').count(),0,'unmount releases stream')
 // Decode an actual EAN-13 bitmap through the Safari fallback, not a mocked decoder.
 const decoded=await page.evaluate(async()=>{
  delete window.BarcodeDetector;const c=document.createElement('canvas');window.cameraQA.JsBarcode(c,'5901234123457',{format:'EAN13',width:3,height:120,margin:30,displayValue:false})
  const video=document.createElement('video');video.muted=true;video.playsInline=true;document.body.append(video);const stream=c.captureStream(10);video.srcObject=stream;await video.play();const engine=await window.cameraQA.createCameraDecoder();try{return await engine.detect(video)}finally{engine.dispose();stream.getTracks().forEach(t=>t.stop());video.remove()}
 });assert.deepEqual(decoded,['5901234123457']);assert.deepEqual(errors,[])
 console.log('PASS camera rear preference, one-shot scan, stream cleanup, permission denial/manual entry, real EAN-13 fallback decode; physical device not tested')
}finally{await browser.close()}
