import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176'
const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(15000)
await context.addInitScript(()=>{window.labelPrintCount=0;window.print=()=>{window.top.labelPrintCount++}})
const errors=[],store=new Map(),pdfJobs=[];let posts=0,deny=false
page.on('pageerror',e=>errors.push(e.message))
await context.route('**/api/**',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname,body=req.method()==='POST'?req.postDataJSON():null
 if(path==='/api/auth/csrf')return route.fulfill({json:{token:'mock'}})
 assert(path.startsWith('/api/tenants/qa-tenant/'),'unexpected tenant API')
 if(path.endsWith('/products'))return route.fulfill({json:{items:[{product:{id:'product-1',name:'실제 상품명',code:'0000123',barcode:'8801234567890',modelNumber:'규격 A'}}],total:1,page:1,pageSize:20}})
 if(path.endsWith('/products/product-1'))return route.fulfill({json:{product:{id:'product-1',name:'갱신된 상품명',code:'0000123',barcode:'8801234567890',modelNumber:'규격 A'}}})
 assert(path.includes('/label-designs'),'unexpected API '+path)
 if(body){assert.equal(req.headers()['x-csrf-token'],'mock');posts++;if(deny)return route.fulfill({status:403,json:{message:'저장 권한이 없습니다.'}})}
 if(path.endsWith('/pdf')){pdfJobs.push(body);return route.fulfill({contentType:'application/pdf',body:'%PDF-1.4\n%%EOF'})}
 const parts=path.split('/label-designs')[1].split('/').filter(Boolean),id=parts[0]
 if(req.method()==='GET'){
  if(id)return store.has(id)?route.fulfill({json:store.get(id)}):route.fulfill({status:404,json:{message:'없음'}})
  const items=[...store.values()].filter(s=>s.kind===url.searchParams.get('kind')&&s.name.includes(url.searchParams.get('search')||''));return route.fulfill({json:{items,total:items.length,page:1,pageSize:20}})
 }
 if(parts[1]==='archive'){assert.equal(body.version,store.get(id).version);store.delete(id);return route.fulfill({json:{id}})}
 if(id)assert.equal(body.version,store.get(id).version)
 const saved={...body,id:id||'template-'+posts,version:String(posts),paperName:body.document.paper.name,updatedAt:new Date().toISOString()};store.set(saved.id,saved);return route.fulfill({status:id?200:201,json:saved})
})
await context.route(origin+'/__label-editor*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
localStorage.setItem('ieble-wms.language',new URLSearchParams(location.search).get('language')||'ko');
import Refresh from '/@react-refresh';Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
for(const file of ['index.css','components/workspace/workspace.css','business-ui.css','design-tokens.css','theme.css'])await import('/src/'+file);
const {default:Editor}=await import('/src/label-editor/LabelEditor.tsx');const {default:MobileRuntime}=await import('/src/components/mobile/MobileRuntime.tsx');
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement(MobileRuntime),React.createElement('div',{className:'wms-layout',style:{display:'block'}},React.createElement('main',{className:'wms-content',style:{margin:0,padding:16}},React.createElement(Editor,{tenantId:'qa-tenant',grants:['read','create','update']})))));
</script></html>`}))
async function pane(key){if(!await page.locator('.label-sidebar-tabs').isVisible())await page.getByRole('button',{name:'편집 패널',exact:true}).click();await page.getByRole('tab',{name:{tools:'편집 도구',labels:'라벨 목록',products:'상품 데이터'}[key],exact:true}).click()}
const button=name=>{const locator=page.getByRole('button',{name,exact:true}),click=locator.click.bind(locator);locator.click=async(...args)=>{if(['텍스트 추가','바코드 추가','이미지 추가','사각형 추가','선 추가','객체 붙여넣기'].includes(name))await pane('tools');if(/^라벨 \d+$/.test(name)||name==='용지 한 장 추가')await pane('labels');if(['상품 선택','상품명 넣기','상품코드 넣기','대표 바코드 넣기','모델·규격 넣기'].includes(name))await pane('products');return click(...args)};return locator},field=name=>page.getByLabel(name,{exact:true})
const canvas=()=>page.locator('.label-edit-canvas'),objects=()=>canvas().locator('[data-object-id]')
async function contentBox(locator){return locator.evaluate(e=>{const b=e.getBBox(),m=e.getScreenCTM(),points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return{x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y}})}
const selected=()=>canvas().locator('[data-selected=true]'),viewport=()=>page.locator('.label-canvas-scroll')
const geometry=()=>objects().evaluateAll(es=>es.map(e=>Object.fromEntries(['data-object-id','x','y','width','height'].map(k=>[k,e.getAttribute(k)]))))
async function marquee(a,b,shift=false){const r=await canvas().boundingBox(),at=([x,y])=>({x:r.x+x*r.width/99.1,y:r.y+y*r.height/33.9});const x=at(a),y=at(b);if(shift)await page.keyboard.down('Shift');await page.mouse.move(x.x,x.y);await page.mouse.down();await page.mouse.move(y.x,y.y,{steps:5});assert.equal(await canvas().locator('[data-marquee]').count(),1);await page.mouse.up();if(shift)await page.keyboard.up('Shift');assert.equal(await canvas().locator('[data-marquee]').count(),0)}
async function moveGroup(dx,dy){const r=await contentBox(objects().first()),c=await canvas().boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+dx*c.width/99.1,r.y+r.height/2+dy*c.height/33.9,{steps:5});await page.mouse.up()}
async function position(x,y,w,h){await field('너비(mm)').fill(String(w));await field('높이(mm)').fill(String(h));await field('가로 위치(mm)').fill(String(x));await field('세로 위치(mm)').fill(String(y))}
try{
 await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/__label-editor');await canvas().waitFor()
 await button('텍스트 추가').click();await field('텍스트').fill('상품');await position(5,5,20,6)
 await pane('tools');await field('라벨 이미지').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});await position(5,17,10,10)
 await button('바코드 추가').click();await field('바코드 값').fill('8801234567890');await position(30,18,50,10)
 await button('사각형 추가').click();await position(85,5,8,5)
 await button('라벨 복사').click();await button('라벨 2').click();await button('라벨 붙여넣기').click();const other=await geometry();await button('라벨 1').click()
 const original=await geometry()
 for(const zoom of ['0.5','1','2']){
  await field('편집 확대').selectOption(zoom);const vr=await viewport().boundingBox();await page.mouse.move(vr.x+8,vr.y+8);await page.mouse.down();await page.mouse.move(vr.x+28,vr.y+18,{steps:3});await page.mouse.up()
  const pan=await viewport().getAttribute('data-pan-x');await marquee([1,1],[82,31]);assert.equal(await selected().count(),3);assert.equal(await canvas().locator('[data-selection-bounds]').count(),1);assert.equal(await viewport().getAttribute('data-pan-x'),pan)
  await moveGroup(2.5,1);const moved=await geometry();moved.slice(0,3).forEach((o,i)=>{assert(Math.abs(Number(o.x)-Number(original[i].x)-2.5)<1e-8);assert(Math.abs(Number(o.y)-Number(original[i].y)-1)<1e-8)});assert.deepEqual(moved[3],original[3]);assert.equal(await selected().count(),3)
  await button('실행 취소').click();assert.deepEqual(await geometry(),original);await button('다시 실행').click();assert.deepEqual(await geometry(),moved);await button('실행 취소').click()
  await viewport().focus();await page.keyboard.press('Delete');assert.equal(await objects().count(),1);await button('실행 취소').click();assert.deepEqual(await geometry(),original)
  console.log('PASS marquee, common delta, one-step move/delete undo at zoom '+zoom)
 }
 await objects().nth(0).click();await objects().nth(1).click({modifiers:['Shift']});assert.equal(await selected().count(),2);await objects().nth(0).click({modifiers:['Shift']});assert.equal(await selected().count(),1);await objects().nth(2).click();assert.equal(await selected().count(),1)
 await viewport().focus();await page.keyboard.press('ControlOrMeta+a');assert.equal(await selected().count(),4);await objects().nth(0).click();assert.equal(await selected().count(),1)
 await objects().nth(0).dblclick();const inline=field('라벨 텍스트 직접 편집');await inline.waitFor();await inline.press('ControlOrMeta+a');await inline.press('Backspace');assert.equal(await objects().count(),4);await inline.fill('직접 편집 유지');await inline.press('Escape');assert.equal(await field('텍스트').inputValue(),'상품')
 // Reverse rectangle includes full rotated bounds; a partial rectangle also selects the image.
 await objects().nth(1).click();await field('회전(°)').fill('25');await marquee([82,32],[1,1]);assert.equal(await selected().count(),3);await marquee([6,18],[14,25]);assert.equal(await selected().count(),1);await objects().nth(1).click();await field('회전(°)').fill('0')
 await marquee([1,1],[82,31]);await moveGroup(100,100);const edge=await geometry();assert.equal(Number(edge[2].x)+Number(edge[2].width),99.1);assert(Math.abs(Number(edge[2].y)+Number(edge[2].height)-33.9)<1e-8);await button('실행 취소').click();assert.deepEqual(await geometry(),original)
 await button('선택 객체 삭제').click();assert.equal(await objects().count(),1);await button('실행 취소').click();await button('라벨 2').click();assert.deepEqual(await geometry(),other);await button('라벨 1').click()
 await marquee([1,1],[82,31]);await moveGroup(2.5,1);if(process.env.MULTI_VISUAL)await page.screenshot({path:process.env.MULTI_VISUAL});const persisted=await geometry();await button('템플릿 저장').click();await field('템플릿명').fill('다중 QA');await page.locator('dialog').getByRole('button',{name:'저장',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});assert.equal([...store.values()][0].document.labels[0].objects[0].x,7.5)
 await page.reload();await button('템플릿 불러오기').click();await page.locator('.label-template-list li').getByRole('button',{name:'불러오기',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});assert.deepEqual(await geometry(),persisted)
 await button('미리보기·출력').click();const download=page.waitForEvent('download');await button('PDF 다운로드').click();await download;assert.equal(pdfJobs.at(-1).paper.labelWidth,99.1);assert.equal(pdfJobs.at(-1).labels.length,2);await button('편집으로 돌아가기').click()
 // Mobile multi-select uses real Chromium touch dispatch, with no native device attached.
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});await page.setViewportSize({width:390,height:844});await button('화면 맞춤').click();await button('다중 선택').click();await viewport().scrollIntoViewIfNeeded()
 const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});await page.waitForTimeout(30)}
 async function tap(i){const b=await contentBox(objects().nth(i));await touch('touchStart',[[1,b.x+b.width/2,b.y+b.height/2]]);await touch('touchEnd',[])}
 await objects().nth(0).click();await tap(1);assert.equal(await selected().count(),2)
 const beforeTouch=await geometry(),b=await contentBox(objects().first()),c=await canvas().boundingBox(),cx=b.x+b.width/2,cy=b.y+b.height/2
 await touch('touchStart',[[1,cx,cy]]);await touch('touchMove',[[1,cx+2*c.width/99.1,cy+1*c.height/33.9]]);await touch('touchEnd',[]);assert.equal(await selected().count(),2);const afterTouch=await geometry();for(let i=0;i<2;i++)assert(Math.abs(Number(afterTouch[i].x)-Number(beforeTouch[i].x)-2)<1e-8)
 await tap(1);assert.equal(await selected().count(),1);await tap(1);await button('선택 객체 삭제').click();assert.equal(await objects().count(),2);await button('실행 취소').click();assert.equal(await objects().count(),4)
 for(const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900],[1920,1080]]){await page.setViewportSize({width,height});await button('화면 맞춤').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)}
 assert.deepEqual(errors,[]);console.log('PASS Shift/click/select-all, inline text, rotated bounds, edge clamp, other label, save/reload/PDF, mobile touch toggle/group/delete and 10 responsive viewports; APIs mocked')
}finally{await browser.close()}
