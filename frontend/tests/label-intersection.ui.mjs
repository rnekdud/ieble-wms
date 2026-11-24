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
  await field('편집 확대').selectOption(zoom);const v=await viewport().boundingBox();await page.mouse.move(v.x+8,v.y+8);await page.mouse.down();await page.mouse.move(v.x+23,v.y+18,{steps:3});await page.mouse.up();const pan=await viewport().getAttribute('data-pan-x')
  for(let i=0;i<5;i++){
   const o=original[i],x=Number(o.x),y=Number(o.y),w=Number(o.width),h=Number(o.height),a=[x-4,y-4],b=[x+w*.15,y+h+4]
   for(const [start,end] of [[a,b],[b,a],[[a[0],b[1]],[b[0],a[1]]],[[b[0],a[1]],[a[0],b[1]]]]){
    await marquee(start,end);assert.equal(await selected().count(),1,kinds[i]+' partial at '+zoom);assert.equal(await selected().first().getAttribute('data-object-id'),o['data-object-id']);assert.equal(await viewport().getAttribute('data-pan-x'),pan)
   }
   console.log('PASS 15% intersection '+kinds[i]+' at '+zoom+' / four directions after pan')
  }
  await marquee([1,30],[3,33]);assert.equal(await selected().count(),0)
  await marquee([1,1],[90,32]);assert.equal(await selected().count(),5);await moveGroup(2.5,1);assert.equal(await selected().count(),5);const moved=await geometry();moved.forEach((o,i)=>{assert.equal(Number(o.x)-Number(original[i].x),2.5);assert.equal(Number(o.y)-Number(original[i].y),1)})
  await button('실행 취소').click();assert.deepEqual(await geometry(),original);await viewport().focus();await page.keyboard.press('Delete');assert.equal(await objects().count(),0);await button('실행 취소').click();assert.deepEqual(await geometry(),original)
 }
 await field('편집 확대').selectOption('1');await objects().nth(2).click();await field('회전(°)').fill('45')
 await marquee([15,14],[18,30]);assert.equal(await selected().count(),1);assert.equal(await selected().first().getAttribute('data-object-id'),original[2]['data-object-id'])
 const box=await contentBox(objects().nth(2)),r=await canvas().boundingBox(),x=(box.x-r.x)*99.1/r.width,y=(box.y-r.y)*33.9/r.height
 await marquee([x-.4,y-.4],[x+.8,y+.8]);assert.equal(await selected().count(),0,'empty rotated AABB corner')
 await objects().nth(2).click();await field('회전(°)').fill('0');await objects().nth(0).dblclick();await field('라벨 텍스트 직접 편집').fill('직접 편집');await field('라벨 텍스트 직접 편집').press('Escape');assert.equal(await field('텍스트').inputValue(),'상품')
 assert.deepEqual(await geometry(),original);assert.deepEqual(errors,[])
 console.log('PASS rotated intersection / empty margins, five-object move/delete/undo and inline text; no API writes')
}finally{await browser.close()}
