import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',root='/api/tenants/fixture',endpoint=root+'/shipments',id='12345678-1234-1234-1234-123456789012'
const shape=(type,x,y,width,height,extra={})=>({id:`${type}-${x}-${y}`,type,x,y,width,height,rotation:0,shape:'rectangle',label:type,rackId:null,zoneId:null,locationId:null,fill:'#a7ccdf',...extra})
const objects=[shape('door',.5,.95,.12,.025,{label:'하단 출입구'}),shape('zone',.5,.28,.84,.32),shape('wall',.5,.05,.94,.016),shape('wall',.04,.5,.01,.9),shape('wall',.96,.5,.01,.9),shape('wall',.24,.95,.4,.016),shape('wall',.76,.95,.4,.016)]
for(let i=0;i<6;i++)objects.push(shape('rack',[.22,.5,.78][i%3],i<3?.28:.72,.18,.2,{id:'obj-r'+i,rackId:'r'+i,label:'R-0'+(i+1)}))
const plan={exists:true,version:'v1',schemaVersion:1,aspectRatio:1.6,objects}
const initial=()=>({shipment:{id,number:'OUT-QA-ROUTE',requestDate:'2026-11-12',expectedDate:'2026-11-12',partnerName:'QA 거래처',warehouseId:'w',warehouseName:'격리 피킹 창고',contactName:'QA 담당자',status:'Picking',version:'v1'},lines:[0,1,2].map(i=>({id:'line'+i,productId:'p'+i,productCode:'PR0'+i,productName:'피킹 상품 '+i,unit:'EA',requestedQuantity:[30,10,1][i],serials:[]})),allocations:[0,1,2,3,4].map((i)=>({id:'a'+i,lineId:'line'+[0,0,1,0,2][i],stockId:'stock'+i,warehouseId:'w',warehouseName:'격리 피킹 창고',rackId:'r'+[0,0,2,4,5][i],rackCode:'R-0'+([0,0,2,4,5][i]+1),locationId:'loc'+i,locationCode:'BIN0'+i,quantity:i===4?1:10,pickedQuantity:i===4?1:i===0?3:0,inspectedQuantity:0,confirmedQuantity:0,state:'Active',lotNumber:'LOT-'+i,expiryDate:'2027-01-01',serialNumber:i===4?'SERIAL-1':null})),movements:[]})
let data=initial(),mode='normal';const errors=[],unexpected=[],reads=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',hasTouch:true})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;assert.equal(u.origin,origin)
  if(!p.startsWith('/api/'))return route.continue()
  assert.equal(req.method(),'GET','route lookup must never mutate business data');reads.push(p+u.search)
  const json=v=>route.fulfill({json:v})
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'격리 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p===root+'/workspace')return json({id:'fixture',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{shipments:['menu','read','update'],warehouses:['menu','read']}})
  if(p===root+'/pages/shipments')return json({})
  if(p===endpoint+'/'+id)return json(data)
  if(p===endpoint+'/stock'){
   assert.equal(u.searchParams.get('warehouseId'),'w')
   const product=u.searchParams.get('productId'),page=Number(u.searchParams.get('page'))
   let items=data.allocations.filter(a=>data.lines.find(l=>l.id===a.lineId)?.productId===product).map(a=>({id:a.stockId,isActive:true,unit:'EA',quantity:100,reservedQuantity:a.quantity,availableQuantity:100-a.quantity,locationCode:a.locationCode,lotNumber:a.lotNumber,expiryDate:a.expiryDate,serialNumber:a.serialNumber}))
   if(mode==='short'&&product==='p0')items[0].reservedQuantity=0
   if(mode==='moved'&&product==='p0')items[0].locationCode='OTHER'
   // Actual endpoint pages stock at 30. Target in page 2 must still be verified.
   if(product==='p0')items=[...Array.from({length:30},(_,i)=>({...items[0],id:'other'+i})),...items]
   return json({items:items.slice((page-1)*30,page*30),total:items.length,physical:100,reserved:10,available:90})
  }
  if(p===root+'/warehouses/w/plan'){
   if(mode==='denied')return route.fulfill({status:403,json:{message:'조회 권한이 없습니다.'}})
   return json({...plan,exists:mode!=='no-plan',objects:mode==='no-plan'?[]:mode==='no-door'?objects.filter(o=>o.type!=='door'):mode==='blocked'?[...objects,shape('wall',.5,.5,.94,.01)]:objects})
  }
  if(p.endsWith('/front')){const rack=p.split('/').at(-2);return json({rack:{id:rack,code:'R-0'+(Number(rack.slice(1))+1),name:'랙 '+rack},zoneName:'보관 구역',locations:data.allocations.filter(a=>a.rackId===rack).map(a=>({location:{id:a.locationId,code:a.locationCode,name:a.locationCode,rackId:rack,level:1,bay:Number(a.id.slice(1))+1},effectiveActive:true}))})}
  unexpected.push(p);return route.fulfill({status:404,json:{message:'Unexpected API '+p}})
 })
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
 const dialog=page.getByRole('dialog',{name:'추천 피킹 동선 — OUT-QA-ROUTE'}),canvas=dialog.getByLabel('창고 2D 도면 캔버스',{exact:true})
 async function work(){await page.goto(origin+'/app/shipments/'+id);await page.getByRole('button',{name:'피킹 진행',exact:true}).click();await page.getByRole('heading',{name:'출고 피킹',exact:true}).waitFor()}
 async function open(){await page.getByRole('button',{name:'최적 피킹 동선 보기',exact:true}).click();await dialog.locator('.picking-route-heading').waitFor()}
 async function close(){await dialog.locator('footer').getByRole('button',{name:'닫기',exact:true}).click();await dialog.waitFor({state:'detached'})}
 async function ready(){await page.waitForFunction(()=>document.querySelector('.warehouse-plan-canvas')?.getAttribute('data-route-points'));await page.evaluate(()=>import('/tests/fixtures/plan-rotation-probe.ts'));await page.waitForFunction(()=>window.qaKonva.stages.some(s=>s.container().isConnected&&s.findOne('.barcode-route-motion')))}
 const motion=()=>page.evaluate(()=>{const s=window.qaKonva.stages.find(s=>s.container().isConnected),dot=s.findOne('.barcode-route-motion'),trail=s.findOne('.barcode-route-trail');return {count:s.find('.barcode-route-motion').length,color:dot.fill(),diameter:dot.radius()*2*s.scaleX(),point:dot.position(),frame:trail.getAttr('trailFrame'),labels:s.find('Text').map(t=>t.text()),fixed:s.find('.barcode-route-start').length+s.find('.barcode-route-end').length,animations:window.qaKonva.Animation.animations.size}})
 for(const width of [1920,1440,1280,768,390]){
  data=initial();mode='normal';await page.setViewportSize({width,height:1000});await work()
  const qty=page.getByRole('spinbutton',{name:'작업 수량 1',exact:true});await qty.fill('4');await open();await ready()
  assert.match(await dialog.innerText(),/남은 피킹: 4개 위치 · 2종 상품/)
  assert.equal(await dialog.locator('.picking-route-stops section').count(),3,'same rack visited once')
  assert.equal(await dialog.locator('.picking-route-stops li').count(),4,'all location/LOT rows retained')
  assert.equal(await dialog.getByText('피킹 완료 1개 항목',{exact:true}).count(),1)
  assert.match(await dialog.innerText(),/LOT LOT-0/);assert(reads.some(p=>p.includes('productId=p0&page=2')))
  const before=await canvas.getAttribute('data-route-points'),m=await motion();assert.equal(m.count,1);assert.equal(m.color,'#258BFF');assert.equal(m.diameter,9);assert.equal(m.fixed,0);assert.equal(m.animations,1)
  assert(m.labels.some(t=>/^1\. R-0/.test(t))&&m.labels.some(t=>/^3\. R-0/.test(t)),'map visit numbers')
  await page.waitForTimeout(350);const later=await motion();assert.notDeepEqual(later.point,m.point);assert(later.frame.trail.every(p=>p.distance<=later.frame.distance));assert.equal(later.count,1)
  for(let i=1;i<later.frame.trail.length;i++)assert(later.frame.trail[i].alpha>=later.frame.trail[i-1].alpha)
  await dialog.getByRole('button',{name:'선택 위치',exact:true}).click();assert.notEqual(await canvas.getAttribute('data-route-points'),before)
  await dialog.locator('.picking-route-stop').last().click();const selected=await canvas.getAttribute('data-route-points');assert(selected)
  await dialog.getByRole('button',{name:'전체 동선',exact:true}).click();assert.equal(await canvas.getAttribute('data-route-points'),before)
  await dialog.getByRole('button',{name:'도면 확대',exact:true}).click();assert.equal(await canvas.getAttribute('data-route-points'),before);assert(Math.abs((await motion()).diameter-9)<1e-6)
  await dialog.getByRole('button',{name:'도면 화면 맞춤',exact:true}).click();await canvas.scrollIntoViewIfNeeded()
  const box=await canvas.boundingBox(),scale=Number(await canvas.getAttribute('data-view-scale')),x=box.x+box.width/2+(.22-.5)*1200*scale,y=box.y+box.height/2+(.28-.5)*750*scale
  if(width===390)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y)
  await page.waitForFunction(()=>document.querySelector('.picking-route-stops section.is-selected')?.textContent.includes('R-01'))
  const bounds=await dialog.boundingBox();assert(bounds.width<=width&&bounds.height<=901);assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
  await close();assert.equal(await qty.inputValue(),'4','unsaved picking quantity preserved');assert.equal(await page.evaluate(()=>window.qaKonva.Animation.animations.size),0)
  console.log('PASS '+width+'px actual shipment screen: shared animation, complete tour, click/touch, single route, zoom, close, draft preserved')
 }
 // Refresh uses saved state and removes completed racks; it does not write or clear local picking edits.
 await open();await ready();for(const a of data.allocations.filter(a=>a.rackId==='r0'))a.pickedQuantity=a.quantity
 await dialog.getByRole('button',{name:'동선 다시 계산',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.picking-route-stops section').length===2);assert.equal(await dialog.locator('.picking-route-stops li').count(),2)
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>window.qaKonva.Animation.animations.size===0);await close();await page.emulateMedia({reducedMotion:'no-preference'})
 for(const [value,message] of [['no-plan','등록된 창고 도면이 없습니다.'],['no-door','출입구 또는 도면 구조를 확인해 주세요.'],['denied','도면을 조회할 수 없습니다.'],['short','실재고 또는 예약 수량이 부족합니다.'],['moved','예약 재고의 위치·LOT·시리얼을 다시 확인해 주세요.'],['blocked','일부 랙은 선택한 출입구와 연결되지 않아']]){
  data=initial();mode=value;await open();await dialog.getByText(message,{exact:false}).first().waitFor();assert.equal(await dialog.locator('.picking-route-stops li').count(),['short','moved'].includes(value)?3:4);await close()
 }
 data=initial();mode='normal';data.allocations=[];await open();await dialog.getByText('배정된 피킹 위치가 없습니다. 기존 출고 배정을 확인해 주세요.',{exact:true}).waitFor();assert.equal(await canvas.getAttribute('data-route-points'),null);await close()
 data=initial();data.allocations.forEach(a=>a.pickedQuantity=a.quantity);await open();await dialog.getByText('모든 피킹이 완료되었습니다.',{exact:true}).waitFor();assert.equal(await canvas.getAttribute('data-route-points'),null);await close()
 data=initial();await open();await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'})
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS refresh, completed/remaining, shortage, moved stock, no allocation, no plan/door, denied/blocked routes; no business writes '+origin)
}finally{await browser.close()}
