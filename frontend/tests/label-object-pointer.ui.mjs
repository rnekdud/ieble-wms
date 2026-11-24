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
 if(path==='/api/auth/me')return route.fulfill({json:{user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'qa-tenant',name:'검증 기업',role:'Employee',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'qa-tenant'}})
 if(path==='/api/health/db')return route.fulfill({json:{status:'connected'}})
 if(path.endsWith('/workspace'))return route.fulfill({json:{id:'qa-tenant',name:'검증 기업',role:'Employee',accountType:'Internal',serviceStatus:'Active',billingAccess:{canAccessWms:true},permissions:{products:['menu','read','create','update']}}})
 if(path.endsWith('/pages/products'))return route.fulfill({json:{}})
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
 await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/app/label-editor');await canvas().waitFor()
 await button('텍스트 추가').click();await field('텍스트').fill('상품');await position(4,4,18,7)
 await button('바코드 추가').click();await field('바코드 값').fill('8801234567890');await position(30,4,55,10)
 await pane('tools');await field('라벨 이미지').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});await position(4,17,10,10)
 await button('사각형 추가').click();await position(25,19,15,8)
 await button('선 추가').click();await position(50,24,25,.2)
 const original=await geometry(),kinds=['text','barcode','image','rectangle','line']
 for(const zoom of ['0.5','1','2']){
  await field('편집 확대').selectOption(zoom);const v=await viewport().boundingBox();await page.mouse.move(v.x+8,v.y+8);await page.mouse.down();await page.mouse.move(v.x+23,v.y+18,{steps:3});await page.mouse.up()
  for(let i=0;i<5;i++){
   await objects().nth(i).click();assert.equal(await selected().count(),1)
   await viewport().click({position:{x:8,y:8}});assert.equal(await selected().count(),0)
   const b=await contentBox(objects().nth(i)),c=await canvas().boundingBox(),before=await geometry(),pan=await viewport().getAttribute('data-pan-x')
   const x=b.x+b.width/2,y=b.y+b.height/2
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+2.5*c.width/99.1,y+1*c.height/33.9,{steps:5});await page.mouse.up()
   const after=await geometry();assert.equal(await selected().count(),1);assert(Math.abs(Number(after[i].x)-Number(before[i].x)-2.5)<1e-8,kinds[i]+' x at '+zoom);assert(Math.abs(Number(after[i].y)-Number(before[i].y)-1)<1e-8,kinds[i]+' y at '+zoom);assert.equal(await viewport().getAttribute('data-pan-x'),pan)
   for(let j=0;j<5;j++)if(i!==j)assert.deepEqual(after[j],before[j]);assert.equal(after[i]['data-object-id'],before[i]['data-object-id']);assert.equal(after[i].width,before[i].width);assert.equal(after[i].height,before[i].height)
   await button('실행 취소').click();assert.deepEqual(await geometry(),before);await button('다시 실행').click();assert.deepEqual(await geometry(),after);await button('실행 취소').click()
   console.log('PASS actual pointer '+kinds[i]+' at '+zoom)
  }
  await marquee([1,1],[90,32]);assert.equal(await selected().count(),5);
  for(let i=0;i<5;i++){
   const b=await contentBox(objects().nth(i)),c=await canvas().boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+2.5*c.width/99.1,y+c.height/33.9,{steps:5});await page.mouse.up()
   assert.equal(await selected().count(),5);const moved=await geometry();moved.forEach((o,j)=>{assert(Math.abs(Number(o.x)-Number(original[j].x)-2.5)<1e-8);assert(Math.abs(Number(o.y)-Number(original[j].y)-1)<1e-8)})
   await button('실행 취소').click();assert.deepEqual(await geometry(),original)
  }
  await viewport().focus();await page.keyboard.press('Delete');assert.equal(await objects().count(),0);await button('실행 취소').click();assert.deepEqual(await geometry(),original)
 }
 // A frame added above the barcode/image must not swallow their visible interiors.
 await field('편집 확대').selectOption('1');await objects().nth(3).click();await position(2,2,90,29)
 for(const i of [0,1,2,4]){
  const b=await contentBox(objects().nth(i)),c=await canvas().boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2,before=await geometry()
  await page.mouse.click(x,y);assert.equal(await selected().first().getAttribute('data-object-id'),original[i]['data-object-id'],'transparent frame hit '+kinds[i])
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+2.5*c.width/99.1,y+c.height/33.9,{steps:5});await page.mouse.up();assert.equal(Number((await geometry())[i].x)-Number(before[i].x),2.5);await button('실행 취소').click()
 }
 // A thin line must be reachable a few screen pixels away without changing its print thickness.
 await objects().nth(3).click({position:{x:1,y:1}});await position(25,19,15,8)
 const line=await contentBox(objects().nth(4));await page.mouse.click(line.x+line.width/2,line.y+line.height/2+3)
 assert.equal(await selected().first().getAttribute('data-object-id'),original[4]['data-object-id'],'thin line hit area')

 // Rotation and existing inline editing are exercised through the same visual pointer layer.
 for(let i=0;i<5;i++){
  await objects().nth(i).click();await field('회전(°)').fill('7');const before=await geometry(),b=await contentBox(objects().nth(i)),c=await canvas().boundingBox()
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+2.5*c.width/99.1,b.y+b.height/2+c.height/33.9,{steps:4});await page.mouse.up()
  assert.equal(Number((await geometry())[i].x)-Number(before[i].x),2.5);assert.equal(await field('회전(°)').inputValue(),'7');await button('실행 취소').click();await field('회전(°)').fill('0')
 }
 await objects().nth(0).dblclick();await field('라벨 텍스트 직접 편집').fill('상품명');await field('라벨 텍스트 직접 편집').press('Escape');assert.equal(await field('텍스트').inputValue(),'상품')
 await objects().nth(0).click();await objects().nth(1).click({modifiers:['Shift']});assert.equal(await selected().count(),2);await objects().nth(1).click({modifiers:['Shift']});assert.equal(await selected().count(),1)
 await viewport().focus();await page.keyboard.press('ControlOrMeta+a');assert.equal(await selected().count(),5);await moveGroup(2.5,1);const persisted=await geometry()
 await button('템플릿 저장').click();await field('템플릿명').fill('5종 포인터 QA');await page.locator('dialog').getByRole('button',{name:'저장',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'})
 const saved=structuredClone([...store.values()][0]);assert.equal(saved.document.labels[0].objects.length,5);saved.document.labels[0].objects.forEach((o,i)=>{assert.equal(o.id,persisted[i]['data-object-id']);assert.equal(o.x,Number(persisted[i].x));assert.equal(o.y,Number(persisted[i].y))})
 await page.reload();await button('템플릿 불러오기').click();await page.locator('.label-template-list li').getByRole('button',{name:'불러오기',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});assert.deepEqual(await geometry(),persisted)
 await button('미리보기·출력').click();const download=page.waitForEvent('download');await button('PDF 다운로드').click();await download;const output=structuredClone(pdfJobs.at(-1));assert.equal(output.paper.labelWidth,99.1);assert.equal(output.paper.labelHeight,33.9);await button('편집으로 돌아가기').click()
 await field('편집 확대').selectOption('2');const view=await viewport().boundingBox();await page.mouse.move(view.x+8,view.y+8);await page.mouse.down();await page.mouse.move(view.x+30,view.y+20,{steps:3});await page.mouse.up();await button('미리보기·출력').click();const again=page.waitForEvent('download');await button('PDF 다운로드').click();await again;assert.deepEqual(pdfJobs.at(-1),output)
 console.log('PASS all five group initiators, rotated objects, frame pass-through, thin-line hit area, Shift/all-selection, inline text, save/reload and identical print raster/mm after pan/zoom')
 assert.deepEqual(errors,[])
}finally{await browser.close()}
