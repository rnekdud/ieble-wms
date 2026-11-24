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
try{
 await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/__label-editor');await canvas().waitFor()
 assert.equal(await page.getByRole('tab',{name:'라벨 목록',exact:true}).getAttribute('aria-selected'),'true')
 assert.equal(await page.locator('.label-slot').count(),16)
 const list=page.locator('.label-sheet-map');const layout=await list.evaluate(e=>({cols:getComputedStyle(e).gridTemplateColumns.split(' ').length,scroll:e.scrollHeight>e.clientHeight,thumb:e.querySelector('svg').getBoundingClientRect().width}));assert.equal(layout.cols,1);assert(layout.scroll);assert(layout.thumb>150)
 await button('텍스트 추가').click();await field('텍스트').fill('농심 새우깡 90g');await field('너비(mm)').fill('70');await field('높이(mm)').fill('20')
 const originalGeometry=await Promise.all(['가로 위치(mm)','세로 위치(mm)','너비(mm)','높이(mm)','회전(°)'].map(x=>field(x).inputValue()))
 console.log('PASS sidebar layout and object setup');
 const inline=()=>field('라벨 텍스트 직접 편집'),object=()=>objects().first()
 for(const zoom of ['0.5','1','2']){console.log('CHECK inline zoom',zoom);
  await field('편집 확대').selectOption(zoom);const viewport=page.locator('.label-canvas-scroll'),vr=await viewport.boundingBox();await page.mouse.move(vr.x+30,vr.y+30);await page.mouse.down();await page.mouse.move(vr.x+60,vr.y+50,{steps:3});await page.mouse.up()
  await object().dblclick();await inline().waitFor();console.log('CHECK editing opened');const box=await contentBox(object()),textBox=await inline().boundingBox();for(const k of ['x','y','width','height'])assert(Math.abs(box[k]-textBox[k])<1,k+' inline coordinates '+zoom+' '+JSON.stringify({box,textBox,style:await inline().getAttribute('style')}))
  const view=await viewport.getAttribute('data-pan-x'),scale=await viewport.getAttribute('data-zoom')
  await inline().fill('농심 새우깡 120g');assert.equal(await field('텍스트').inputValue(),'농심 새우깡 120g')
  await inline().press('End');await inline().press('Space');await inline().press('Backspace');await inline().press('Enter');await inline().pressSequentially('second line');assert.equal(await objects().count(),1)
  await page.mouse.wheel(0,-100);assert.equal(await viewport.getAttribute('data-zoom'),scale);assert.equal(await viewport.getAttribute('data-pan-x'),view)
  // Simulate IME composition ordering. Real device keyboard/IME still requires device QA.
  await inline().dispatchEvent('compositionstart');await inline().fill('한글 조합');await inline().dispatchEvent('keydown',{key:'Escape',code:'Escape',isComposing:true});assert(await inline().isVisible());await inline().dispatchEvent('compositionend');await inline().press('Escape');await inline().waitFor({state:'detached'});assert.equal(await field('텍스트').inputValue(),'농심 새우깡 90g')
  await object().dblclick();await inline().fill('농심 새우깡 120g');await viewport.click({position:{x:10,y:10}});assert.equal(await field('텍스트').inputValue(),'농심 새우깡 120g');await button('실행 취소').click();assert.equal(await field('텍스트').inputValue(),'농심 새우깡 90g');await button('다시 실행').click();assert.equal(await field('텍스트').inputValue(),'농심 새우깡 120g');await button('실행 취소').click()
  assert.deepEqual(await Promise.all(['가로 위치(mm)','세로 위치(mm)','너비(mm)','높이(mm)','회전(°)'].map(x=>field(x).inputValue())),originalGeometry)
 }
 await field('편집 확대').selectOption('1');await field('회전(°)').fill('8');await object().dblclick();const rotated=await contentBox(object()),overlay=await inline().boundingBox();for(const k of ['x','y','width','height'])assert(Math.abs(rotated[k]-overlay[k])<1);await inline().press('Escape');await field('회전(°)').fill('0')
 await object().dblclick();await inline().fill('저장에 반영된 문구');await button('템플릿 저장').click();await field('템플릿명').fill('인라인 QA');await page.locator('dialog').getByRole('button',{name:'저장',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});assert.equal([...store.values()][0].document.labels[0].objects[0].text,'저장에 반영된 문구')
 const pan=await page.locator('.label-canvas-scroll').getAttribute('data-pan-x'),zoom=await field('편집 확대').inputValue();await pane('labels');const height=await list.evaluate(e=>e.clientHeight);await pane('products');await button('상품 선택').click();await page.locator('.label-product-list').getByRole('button',{name:'선택',exact:true}).click();await pane('labels');assert.equal(await list.evaluate(e=>e.clientHeight),height);assert.equal(await field('편집 확대').inputValue(),zoom);assert.equal(await page.locator('.label-canvas-scroll').getAttribute('data-pan-x'),pan)
 await list.evaluate(e=>e.scrollTop=e.scrollHeight);const scroll=await list.evaluate(e=>e.scrollTop);await field('텍스트').fill('오른쪽 속성 입력');assert.equal(await list.evaluate(e=>e.scrollTop),scroll);assert.equal(await canvas().locator('text').textContent(),'오른쪽 속성 입력')
 await button('라벨 복사').click();await button('라벨 2').click();await button('라벨 붙여넣기').click();assert.equal(await canvas().locator('text').textContent(),'오른쪽 속성 입력');await button('라벨 1').click();await objects().first().click();assert.equal(await field('텍스트').inputValue(),'오른쪽 속성 입력')
 for(const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});await button('화면 맞춤').click();await object().click();await button('텍스트 편집').click();await inline().fill('모바일 입력');await button('편집 완료').click();await inline().waitFor({state:'detached'});assert.equal(await canvas().locator('text').textContent(),'모바일 입력')
  await pane('labels');assert(await list.isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  assert(await button('용지 한 장 추가').isVisible());console.log('PASS tabs / inline edit / Done / viewport '+width+'x'+height)
 }
 if(process.env.INLINE_VISUAL){await page.setViewportSize({width:1440,height:900});await pane('labels');await button('화면 맞춤').click();await object().dblclick();await page.screenshot({path:process.env.INLINE_VISUAL})}
 assert.deepEqual(errors,[]);console.log('PASS inline position 50/100/200%, pan/rotation, IME event ordering, Esc, one-step undo/redo, properties sync, save, independent copy and sidebar state; all APIs mocked')
}finally{await browser.close()}
