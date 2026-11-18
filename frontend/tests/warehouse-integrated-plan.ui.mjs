import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {generalWarehouseTemplate} from '../src/warehouse-templates.ts'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',tenant='qa-part3',version='00000000-0000-0000-0000-000000000001'
const item=(id,name,code,extra={})=>({id,name,code,isActive:true,version,barcode:'QA-'+id,createdAt:'2026-11-01',updatedAt:'2026-11-01',...extra})
const zones=[item('z1','상단 구역','A'),item('z2','하단 구역','B')]
const racks=Array.from({length:6},(_,i)=>item(`r${i+1}`,`랙 ${i+1}`,`R-0${i+1}`,{zoneId:i<3?'z1':'z2',levels:3,bays:4}))
const floor=item('floor','바닥 위치','F-01',{zoneId:'z1',rackId:null})
const detail={warehouse:item('w1','통합 QA 창고','WH-QA'),zones,racks,locationCount:73,rackLocationCounts:Object.fromEntries(racks.map(r=>[r.id,12]))}
const template=generalWarehouseTemplate()
const plan={exists:true,version,schemaVersion:1,aspectRatio:template.aspectRatio,objects:template.objects.map((o,i)=>({...o,id:`o${i}`,zoneId:o.zoneIndex===null?null:zones[o.zoneIndex].id,rackId:o.rackIndex===null?null:racks[o.rackIndex].id,locationId:null}))}
plan.objects.push({id:'floor-object',type:'shape',shape:'rectangle',label:'바닥 위치',x:.1,y:.5,width:.08,height:.06,rotation:0,fill:'#cccccc',zoneId:'z1',rackId:null,locationId:'floor'})
const locations=racks.flatMap(r=>Array.from({length:12},(_,i)=>item(`${r.id}-l${i+1}`,`${Math.floor(i/4)+1}단 ${i%4+1}칸`,`${r.code}-BIN-${i+1}`,{rackId:r.id,zoneId:r.zoneId,level:Math.floor(i/4)+1,bay:i%4+1})))
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),errors=[],writes=[],requests=[]
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname
  assert.equal(u.origin,origin)
  if(p==='/__integrated-plan')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/warehouse-integrated-plan-ui.tsx"></script></html>'})
  if(!p.startsWith('/api/'))return route.continue()
  requests.push(p+u.search)
  if(req.method()!=='GET'){writes.push(p);return route.abort()}
  const root=`/api/tenants/${tenant}/warehouses`,json=v=>route.fulfill({json:v})
  if(p===root)return json({items:[{warehouse:detail.warehouse,zoneCount:2,rackCount:6,locationCount:73}],total:1,page:1,pageSize:20})
  if(p.startsWith(`/api/tenants/${tenant}/barcodes/locations/`)&&p.endsWith('/stock'))return json({items:[],total:0,page:1,pageSize:20,summary:{holdingProducts:0}})
  assert(p.startsWith(root+'/'),p)
  const id=p.slice(root.length+1).split('/')[0],data=id==='w1'?detail:{warehouse:item('w2','다른 QA 창고','WH-OTHER'),zones:[],racks:[],locationCount:0}
  if(p===root+'/'+id)return json(data)
  if(p.endsWith('/workspace'))return json({detail:data,floorLocations:id==='w1'?[floor]:[],plan:id==='w1'?plan:{exists:false,version,schemaVersion:1,aspectRatio:1.5,objects:[]}})
  if(p.endsWith('/locations')){
   let items=id==='w1'?[...locations,floor]:[]
   if(u.searchParams.get('rackId'))items=items.filter(l=>l.rackId===u.searchParams.get('rackId'))
   if(u.searchParams.get('zoneId'))items=items.filter(l=>l.zoneId===u.searchParams.get('zoneId'))
   if(u.searchParams.get('search'))items=items.filter(l=>(l.code+' '+l.name).includes(u.searchParams.get('search')))
   return json({items:items.slice((Number(u.searchParams.get('page')||1)-1)*20,Number(u.searchParams.get('page')||1)*20).map(location=>({location,effectiveActive:true,quantities:[]})),inventoryAvailable:true,total:items.length,page:Number(u.searchParams.get('page')||1),pageSize:20})
  }
  if(p.endsWith('/stock'))return json({items:[],total:0,page:1,pageSize:20,summary:{holdingProducts:0}})
  if(p.endsWith('/front')){const rack=racks.find(r=>p.endsWith(`/racks/${r.id}/front`));assert(rack,p);return json({rack,locations:locations.filter(l=>l.rackId===rack.id).map(location=>({location,effectiveActive:true})),inventoryAvailable:true})}
  throw Error('Unexpected API '+p)
 })

 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message)})
 const url=(id='w1',access='edit',extra='')=>`${origin}/__integrated-plan?tenant=${tenant}&warehouseId=${id}&access=${access}&tab=structure${extra}`
 await page.goto(url())
 const panel=page.getByRole('tabpanel',{name:'창고 도면',exact:true}),inspector=panel.getByRole('complementary',{name:'선택 정보 패널'}),map=panel.getByRole('region',{name:'창고 구조맵'}),tree=panel.getByRole('region',{name:'전체 보관 구조'})
 await panel.locator('canvas').first().waitFor()
 assert.equal(await page.getByRole('tab').count(),2)
 assert.equal(new URL(page.url()).searchParams.get('tab'),'plan')
 assert.equal(await tree.locator('.workspace-rack-node[open]').count(),0)
 assert.equal(await tree.locator('.workspace-zone-node[open]').count(),0)
 assert.equal(await panel.getByRole('region',{name:'구조 검색 결과'}).count(),0)
 assert.equal(requests.filter(p=>p.includes('/locations?')).length,0)
 const search=panel.getByLabel('구조 검색',{exact:true})
 await search.fill('R');await panel.getByText('2글자 이상 입력해 주세요.',{exact:true}).waitFor()
 await page.waitForTimeout(200)
 assert.equal(requests.filter(p=>p.includes('/locations?')).length,0)
 await search.fill('R-');await panel.getByRole('region',{name:'구조 검색 결과'}).getByText('검색 결과 78건',{exact:true}).waitFor()
 assert.equal(requests.filter(p=>p.includes('/locations?')).length,1)
 await search.fill('');assert.equal(await panel.getByRole('region',{name:'구조 검색 결과'}).count(),0)
 const reads=requests.filter(p=>p.includes('/locations?')).length
 await search.fill('1');await page.waitForTimeout(100);assert.equal(requests.filter(p=>p.includes('/locations?')).length,reads)
 await search.fill('')
 async function clickObject(o){
  const host=map.locator('.warehouse-plan-canvas');await host.scrollIntoViewIfNeeded()
  const position=await host.evaluate((host,o)=>{
   const w=host.clientWidth,h=host.clientHeight,ratio=Number(host.dataset.planRatio),padding=Math.min(16,Math.max(4,Math.min(w,h)*.025)),scale=Math.min((w-padding*2)/1200,(h-padding*2)/(1200/ratio))
   return {x:host.clientLeft+(w-1200*scale)/2+(o.type==='zone'?o.x-o.width*.4:o.x)*1200*scale,y:host.clientTop+(h-1200/ratio*scale)/2+(o.type==='zone'?o.y-o.height*.35:o.y)*1200/ratio*scale}
  },o)
  await host.click({position})
 }
 await clickObject(plan.objects[0]);await inspector.getByRole('heading',{name:'구역 상세',exact:true}).waitFor();await inspector.getByText('37개',{exact:true}).waitFor()
 await clickObject(plan.objects[10]);await inspector.getByRole('heading',{name:'랙 상세',exact:true}).waitFor()
 await tree.locator('.workspace-rack-node.is-selected').waitFor()
 const slots=tree.locator('[data-rack-id="r1"]').getByRole('region',{name:'R-01 보관위치 구성'})
 assert.equal(await map.locator('.structure-slot-grid').count(),0)
 assert.equal(await tree.locator('.workspace-location-codes').count(),0)
 assert.equal(await panel.locator('.structure-location-list').count(),0)
 assert.equal(await slots.getByRole('button').count(),12)
 assert.equal(await slots.getByRole('button').first().getAttribute('aria-label'),'3단 1칸 R-01-BIN-9')
 await page.waitForFunction(()=>{const r=document.querySelector('[data-rack-id="r1"] summary').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})
 await slots.getByRole('button',{name:'1단 1칸 R-01-BIN-1',exact:true}).click()
 await inspector.getByText('r1-l1',{exact:true}).waitFor()
 await tree.locator('.workspace-zone-node').first().locator(':scope > summary').click()
 await clickObject(plan.objects[11]);await tree.getByRole('button',{name:'랙 2 R-02',exact:true}).waitFor({state:'visible'})
 await tree.getByRole('button',{name:'랙 2 R-02',exact:true}).click();await inspector.getByRole('heading',{name:'랙 2',exact:true}).waitFor()
 await tree.getByRole('button',{name:'1단 1칸 R-02-BIN-1',exact:true}).click();await inspector.getByText('r2-l1',{exact:true}).waitFor()
 await tree.getByRole('button',{name:'바닥 위치 F-01',exact:true}).click();await inspector.getByText('floor',{exact:true}).waitFor()
 await map.locator('.warehouse-plan-canvas').click({position:{x:5,y:5}});await inspector.getByRole('heading',{name:'도면에서 선택해 주세요'}).waitFor()
 await panel.getByLabel('구조 검색',{exact:true}).fill('R-01-BIN-1');await panel.getByRole('region',{name:'구조 검색 결과'}).getByRole('button',{name:'위치 1단 1칸 R-01-BIN-1',exact:true}).click();await inspector.getByText('r1-l1',{exact:true}).waitFor()
 await inspector.locator('summary',{hasText:'바코드 조회·인쇄'}).click();await inspector.getByRole('button',{name:'라벨 인쇄',exact:true}).waitFor()
 await inspector.locator('summary',{hasText:'현재 재고 조회'}).click();await inspector.getByText('보관 중인 재고 없음',{exact:true}).waitFor()
 const workspaceReads=requests.filter(p=>p.endsWith('/workspace')).length
 await clickObject(plan.objects[13]);await tree.locator('[data-rack-id="r4"] details[open]').waitFor()
 await page.waitForFunction(()=>{const r=document.querySelector('[data-rack-id="r4"] summary').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})
 await clickObject(plan.objects[10]);assert.equal(requests.filter(p=>p.endsWith('/workspace')).length,workspaceReads)
 // A collapsed selected rack must reopen on repeated map selection.
 await tree.getByRole('button',{name:'R-01 접기',exact:true}).click();assert.equal(await tree.locator('[data-rack-id="r1"] details[open]').count(),0)
 await clickObject(plan.objects[10]);await tree.locator('[data-rack-id="r1"] details[open]').waitFor()
 // Clicking the row summary (outside its name/toggle buttons) selects and expands.
 await tree.locator('[data-rack-id="r2"] summary').click({position:{x:180,y:12}});await inspector.getByRole('heading',{name:'랙 2',exact:true}).waitFor()
 await clickObject(plan.objects[10])
 const host=map.locator('.warehouse-plan-canvas'),scale=Number(await host.getAttribute('data-view-scale'))
 await panel.getByRole('button',{name:'도면 확대',exact:true}).click();assert(Number(await host.getAttribute('data-view-scale'))>scale)
 const zoomed=Number(await host.getAttribute('data-view-scale'));await tree.getByRole('button',{name:'랙 2 R-02',exact:true}).click();assert.equal(Number(await host.getAttribute('data-view-scale')),zoomed)
 await panel.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click()
 await clickObject(plan.objects[10])
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000})
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width)
  const m=await map.boundingBox(),i=await inspector.boundingBox();assert(m.width>0&&i.width>0)
  if(width<1000)assert(i.y>=m.y+m.height-1)
  await slots.getByRole('button',{name:'1단 1칸 R-01-BIN-1',exact:true}).click()
  console.log('PASS responsive '+width)
 }
 await page.setViewportSize({width:1440,height:1000})
 await panel.getByRole('button',{name:'3D 도면',exact:true}).click();await panel.locator('.warehouse-scene-main canvas').waitFor()
 await panel.getByLabel('3D 랙 선택',{exact:true}).selectOption('r1');await panel.getByRole('complementary',{name:'선택 랙 상세'}).getByRole('button',{name:/1단 1칸/}).first().waitFor()
 await panel.getByRole('button',{name:'2D 도면',exact:true}).click();await host.waitFor({state:'visible'})
 await page.reload();await host.waitFor({state:'visible'});assert.equal(new URL(page.url()).searchParams.get('warehouseId'),'w1')
 await page.evaluate(()=>{const u=new URL(location.href);u.searchParams.set('tab','info');history.pushState({},'',u);dispatchEvent(new PopStateEvent('popstate'))})
 await page.getByRole('tabpanel',{name:'창고 정보',exact:true}).waitFor()
 await page.goBack();await panel.waitFor()
 await page.evaluate(()=>{const u=new URL(location.href);u.searchParams.set('warehouseId','w2');history.pushState({},'',u);dispatchEvent(new PopStateEvent('popstate'))})
 await panel.getByText('저장된 창고 도면이 없습니다.',{exact:true}).waitFor();assert.equal(await tree.locator('.workspace-rack-node').count(),0)
 await page.goBack();await host.waitFor({state:'visible'})
 await panel.getByRole('button',{name:'도면 편집',exact:true}).click();await page.locator('.warehouse-workspace-editor.is-design').waitFor()
 await page.goto(url('w1','read','&rackId=r1&level=2&bay=3'));await inspector.getByRole('heading',{name:'보관위치 상세',exact:true}).waitFor();await inspector.getByText('r1-l7',{exact:true}).waitFor();assert.equal(await panel.getByRole('button',{name:'도면 편집',exact:true}).count(),0)
 await page.goto(url('w1','none'));await page.getByRole('alert').filter({hasText:'창고 조회 권한이 없습니다.'}).waitFor();assert.equal(await page.getByRole('tabpanel').count(),0)
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[])
 assert(requests.every(p=>p.startsWith(`/api/tenants/${tenant}/`)))
 console.log('PASS '+origin+' 2-character search gating, compact results, tree-only grids, expand/scroll selection, barcode/stock details, legacy URLs, 3D, editor entry and warehouse isolation; all APIs mocked, zero writes.')
}finally{await browser.close()}
