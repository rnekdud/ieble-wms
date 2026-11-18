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
 await page.goto(origin+'/__editor-part2');await page.locator('.workspace-structure-tree').waitFor().catch(async e=>{console.log(errors,await page.locator('body').innerText());throw e})
 for(const width of [1920,1440,1280,768,390]){
 await page.setViewportSize({width,height:1000})
 await page.waitForFunction(()=>document.querySelector('.plan-studio')?.classList.contains('mobile-plan-studio')===matchMedia('(max-width: 1024px)').matches)
 const rail=page.locator('.studio-tool-rail')
 if(await rail.count()){
  const tools=await rail.locator('button').evaluateAll(es=>es.map(e=>{const box=e.getBoundingClientRect();return {label:e.getAttribute('aria-label'),x:box.x,y:box.y,w:box.width,h:box.height,children:[...e.children].filter(c=>c.getClientRects().length).map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})}}))
  assert.equal(tools.length,10)
  for(const t of tools){
   assert.equal(t.h,56,JSON.stringify(t));assert(Math.abs(t.w-tools[0].w)<1);assert.equal(t.x,tools[0].x)
   for(const c of t.children){assert(Math.abs(c.x+c.w/2-t.x-t.w/2)<1,JSON.stringify(t));assert(c.y>=t.y&&c.y+c.h<=t.y+t.h,JSON.stringify(t))}
  }
  assert.equal(await rail.getByRole('button',{name:'보관 위치 추가',exact:true}).innerText(),'보관위치')
  await rail.getByRole('button',{name:'화면 이동',exact:true}).click();assert.equal(await rail.getByRole('button',{name:'화면 이동',exact:true}).getAttribute('aria-pressed'),'true')
  await rail.getByRole('button',{name:'객체 선택',exact:true}).click();assert.equal(await rail.getByRole('button',{name:'객체 선택',exact:true}).getAttribute('aria-pressed'),'true')
 }

 const structures=page.locator('.workspace-structure-list');if(await structures.getAttribute('open')===null)await structures.locator(':scope > summary').click()
 const tree=page.locator('.workspace-structure-tree'),zoneNode=tree.locator('.workspace-zone-node'),rackNode=zoneNode.locator('.workspace-rack-node')
 assert.equal(await rackNode.count(),1);await zoneNode.locator(':scope > summary').getByRole('button',{name:'정보 수정',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'구역 정보 수정'}),check=dialog.getByRole('checkbox',{name:'구역 사용'})
 await check.waitFor();assert(await check.isChecked());await check.uncheck();await check.check()
 const buttons=await dialog.locator('footer button').allTextContents();assert.deepEqual(buttons,['입력 완료','닫기'])
 const b=await dialog.boundingBox();assert(b.x>=0&&b.x+b.width<=width+1)
 const css=await check.evaluate(e=>{const s=getComputedStyle(e.parentElement);return {align:s.justifyContent,direction:s.flexDirection}});assert.equal(css.align,'flex-start');assert.equal(css.direction,'row')
 await dialog.getByRole('button',{name:'입력 완료',exact:true}).click()
 const resources=page.locator('.mobile-plan-resources');if(await resources.count()&&await resources.getAttribute('open')===null)await resources.locator(':scope > summary').click()
 await page.getByRole('button',{name:'템플릿 저장',exact:true}).click();const template=page.getByRole('dialog',{name:'도면 템플릿 저장'})
 const sizes=await template.locator('.template-dialog-body > label').evaluateAll(labels=>labels.map(l=>{const r=l.getBoundingClientRect(),i=l.querySelector('input,textarea').getBoundingClientRect();return {left:Math.abs(i.x-r.x),right:Math.abs(i.right-r.right)}}));assert(sizes.every(s=>s.left<1&&s.right<1),JSON.stringify(sizes))
 await template.getByRole('button',{name:'취소',exact:true}).click()
 assert.equal(await page.getByRole('button',{name:'작업 내용 파일로 보관',exact:true}).count(),0)
 console.log('PASS editor dialogs, template widths, checkbox and tree at',width)
 }
 await page.setViewportSize({width:1440,height:1000});const tree=page.locator('.workspace-structure-tree'),rn=tree.locator('.workspace-rack-node')
 await rn.locator('summary').getByRole('button',{name:/랙 A-01/}).click();await rn.locator('.workspace-location-codes li').first().waitFor();assert.equal(await rn.locator('.workspace-location-codes li').count(),4);assert(await rn.evaluate(e=>e.classList.contains('is-selected')))
 await page.waitForFunction(()=>window.drawnTexts.includes('랙 A-01')&&window.drawnTexts.includes('R-01'))
 await rn.locator(':scope > summary').click({position:{x:3,y:10}});assert.equal(await rn.getAttribute('open'),null)
 await page.goto(origin+'/__editor-part2?new');await page.getByRole('button',{name:'도면 파일 불러오기',exact:true}).click().catch(async e=>{console.log(errors,await page.locator('body').innerText());throw e});const upload=page.getByRole('dialog',{name:'도면 파일 불러오기'});let box=await upload.boundingBox();assert(box.width>=480&&box.width<=560)
 await upload.getByLabel('도면 파일',{exact:true}).setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZP1sAAAAASUVORK5CYII=','base64')})
 await upload.getByAltText('업로드 도면 원본 미리보기').waitFor();assert((await upload.boundingBox()).width>box.width)
 for(const width of [768,390]){await page.setViewportSize({width,height:1000});box=await upload.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1)}
 assert.deepEqual(errors,[]);console.log('PASS selected rack/locations and name/code canvas rendering; compact upload expands for preview. All API responses mocked.')
}finally{await browser.close()}
