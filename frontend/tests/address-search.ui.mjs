import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',root='/api/tenants/address-qa'
const script='https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
const version='00000000-0000-0000-0000-000000000001'
const rows=[],writes=[],errors=[],unexpected=[]
let company={id:'address-qa',name:'주소 QA 기업',address:'기존 회사 주소 101호',version},warehouse={id:'w1',code:'WH01',name:'주소 QA 창고',address:'기존 창고 주소',addressDetail:'기존 상세',version,isActive:true},scriptLoads=0,failScript=false,delayScript=false
const result={zonecode:'06236',roadAddress:'서울 강남구 테헤란로 123',jibunAddress:'서울 강남구 역삼동 123',address:'서울 강남구 역삼동 123'}
const mock=`window.kakao={Postcode:class {constructor(options){this.options=options;window.addressOptions=options}embed(host){window.addressEmbeds=(window.addressEmbeds||0)+1;const input=document.createElement('input');input.setAttribute('aria-label','테스트 주소 검색');const button=document.createElement('button');button.type='button';button.textContent='테스트 주소 선택';button.onclick=()=>this.options.oncomplete(window.addressResult||${JSON.stringify(result)});host.append(input,button);this.options.onresize({width:500,height:480})}}}`
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname,json=value=>route.fulfill({json:value})
  if(req.url()===script){scriptLoads++;if(delayScript)await new Promise(r=>setTimeout(r,600));return failScript?route.abort():route.fulfill({contentType:'text/javascript',body:mock})}
  assert.equal(u.origin,origin)
  if(!p.startsWith('/api/'))return route.continue()
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'address-qa',name:'주소 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'address-qa'})
  if(p==='/api/auth/csrf')return json({token:'isolated'})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p===root+'/workspace')return json({id:'address-qa',name:'주소 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:Object.fromEntries(['company','partners','warehouses'].map(key=>[key,['menu','read','create','update']]))})
  if(p.startsWith(root+'/pages/'))return json({})
  if(p.includes('/business-assignees'))return json({items:[],total:0,pageSize:20})
  if(req.method()==='GET'){
   if(p===root+'/company')return json({company})
   if(p===root+'/partners/business-number-check')return json({matches:[]})
   if(p===root+'/partners')return json({items:rows,total:rows.length,page:1,pageSize:20})
   const partner=rows.find(row=>p===root+'/partners/'+row.id);if(partner)return json(partner)
   if(p===root+'/warehouses')return json({items:[{warehouse,zoneCount:0,rackCount:0,locationCount:0}],total:1,page:1,pageSize:20})
   if(p===root+'/warehouses/w1')return json({warehouse,zones:[],racks:[],locationCount:0})
   if(p===root+'/warehouses/w1/workspace')return json({detail:{warehouse,zones:[],racks:[],locationCount:0},floorLocations:[],plan:{exists:false,version,aspectRatio:1.5,objects:[]}})
  }
  if(req.method()==='POST'){
   const body=req.postDataJSON();writes.push({path:p,body})
   if(p===root+'/company'){company={...company,...body,version:crypto.randomUUID()};return json(company)}
   if(p===root+'/warehouses/w1'){warehouse={...warehouse,...body,version:crypto.randomUUID()};return json(warehouse)}
   if(p===root+'/warehouses/workspace')return json({warehouseId:'w1',code:'WH01',zones:{},racks:{},floorLocations:{},rackLocations:{}})
   if(p===root+'/partners'||rows.some(row=>p===root+'/partners/'+row.id)){
    const old=rows.find(row=>p===root+'/partners/'+row.id),saved={...old,...body,code:old?.code||'BP'+(rows.length+1),id:old?.id||crypto.randomUUID(),version:crypto.randomUUID(),createdAt:'2026-11-12',updatedAt:'2026-11-12'}
    if(old)Object.assign(old,saved);else rows.push(saved)
    return json({partner:saved,warning:null})
   }
  }
  unexpected.push(p);return route.fulfill({status:404,json:{message:'Unexpected fixture request'}})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);page.on('dialog',d=>d.accept())
 const addressDialog=()=>page.getByRole('dialog',{name:'주소 검색',exact:true})
 async function openSearch(scope=page){await scope.getByRole('button',{name:'주소 검색',exact:true}).click();await addressDialog().getByRole('button',{name:'테스트 주소 선택',exact:true}).waitFor();assert.equal(await addressDialog().locator('.dialog-close-icon').count(),0);assert.equal(await addressDialog().getByRole('button',{name:'닫기',exact:true}).count(),1)}
 async function choose(scope=page){await openSearch(scope);await addressDialog().getByRole('button',{name:'테스트 주소 선택',exact:true}).click();await addressDialog().waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='상세주소')}
 async function savePartner(dialog){await dialog.getByRole('button',{name:'거래처 저장',exact:true}).click();await page.getByRole('alertdialog',{name:'거래처 저장 확인'}).getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('dialog',{name:'거래처 상세',exact:true}).waitFor()}
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/app/partners');await page.getByRole('button',{name:'거래처 등록',exact:true}).click()
  const editor=page.getByRole('dialog',{name:'거래처 등록',exact:true});await editor.getByLabel('거래처명',{exact:true}).fill('주소 QA '+width)
  const zip=editor.getByLabel('우편번호',{exact:true}),base=editor.getByLabel('기본주소',{exact:true}),detail=editor.getByLabel('상세주소',{exact:true})
  assert(await zip.evaluate(e=>e.readOnly));assert(await base.evaluate(e=>e.readOnly))
  await openSearch(editor)
  const box=await addressDialog().boundingBox();assert(box.x>=0&&box.x+box.width<=width&&box.height<=1000)
  await addressDialog().getByRole('button',{name:'닫기',exact:true}).last().focus();await page.keyboard.press('Escape');await addressDialog().waitFor({state:'hidden'});assert(await editor.isVisible());assert.equal(await base.inputValue(),'')
  await choose(editor);assert.equal(await zip.inputValue(),result.zonecode);assert.equal(await base.inputValue(),result.roadAddress)
  await detail.fill('101동 1203호');await choose(editor);assert.equal(await detail.inputValue(),'101동 1203호')
  const fields=await editor.locator('.address-postal-row').evaluate(row=>{const i=row.querySelector('input').getBoundingClientRect(),b=row.querySelector('button').getBoundingClientRect();return{gap:b.x-i.right,center:Math.abs(i.y+i.height/2-b.y-b.height/2),width:i.width}});assert.equal(fields.gap,8);assert(fields.center<1);assert(fields.width>=140&&fields.width<=180)
  assert(await editor.evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert.equal(scriptLoads,[1920,1440,1280,768,390].indexOf(width)+1)
  await savePartner(editor);assert.equal(writes.at(-1).body.address,result.roadAddress);assert.equal(writes.at(-1).body.postalCode,result.zonecode);assert.equal(writes.at(-1).body.addressDetail,'101동 1203호')
  await page.getByRole('button',{name:'거래처 수정',exact:true}).click();const edit=page.getByRole('dialog',{name:'거래처 수정',exact:true});assert.equal(await edit.getByLabel('상세주소',{exact:true}).inputValue(),'101동 1203호')
  await page.evaluate(()=>window.addressResult={zonecode:'54321',roadAddress:'',jibunAddress:'새 지번 주소',address:'선택 주소'})
  await choose(edit);assert.equal(await edit.getByLabel('기본주소',{exact:true}).inputValue(),'새 지번 주소');assert.equal(await edit.getByLabel('상세주소',{exact:true}).inputValue(),'')
  await edit.getByLabel('상세주소',{exact:true}).fill('새 상세');await savePartner(edit)
  await page.reload();await page.getByRole('button',{name:'주소 QA '+width+' 상세',exact:true}).click();await page.getByRole('button',{name:'거래처 수정',exact:true}).click();assert.equal(await page.getByLabel('상세주소',{exact:true}).inputValue(),'새 상세')
  console.log('PASS',width,'partner create/edit/reload, road/jibun, compact inputs, nested modal ESC, detail focus and safe reset')
 }
 // Overseas direct input remains available for both new and existing partners.
 await page.goto(origin+'/app/partners');await page.getByRole('button',{name:'거래처 등록',exact:true}).click();let editor=page.getByRole('dialog',{name:'거래처 등록',exact:true})
 await editor.getByLabel('거래처명',{exact:true}).fill('Overseas');await editor.getByLabel('주소 국가',{exact:true}).selectOption('OTHER');assert.equal(await editor.getByRole('button',{name:'주소 검색',exact:true}).count(),0)
 await editor.getByLabel('우편번호',{exact:true}).fill('SW1A 1AA');await editor.getByLabel('기본주소',{exact:true}).fill('20 Example St, London');await editor.getByLabel('상세주소',{exact:true}).fill('Suite 2');await savePartner(editor)
 await page.getByRole('button',{name:'거래처 수정',exact:true}).click();editor=page.getByRole('dialog',{name:'거래처 수정',exact:true});await editor.getByLabel('담당자명',{exact:true}).fill('Other contact');await savePartner(editor);assert.equal(writes.at(-1).body.postalCode,'SW1A 1AA');assert.equal(writes.at(-1).body.address,'20 Example St, London');assert.equal(writes.at(-1).body.registrationCountry,'OTHER')
 // Company preserves untouched legacy text and stores all values in the existing column.
 await page.goto(origin+'/app/settings/company');await page.getByLabel('기업명',{exact:true}).fill('주소 QA 기업 수정');await page.getByRole('button',{name:'기업 정보 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'기업 정보를 저장했습니다.'}).waitFor();assert.equal(company.address,'기존 회사 주소 101호')
 await choose();await page.getByLabel('상세주소',{exact:true}).fill('기업 201호');await page.getByRole('button',{name:'기업 정보 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'기업 정보를 저장했습니다.'}).waitFor();assert.equal(company.address,'[06236] '+result.roadAddress+'\n상세주소: 기업 201호');await page.reload();await page.getByLabel('우편번호',{exact:true}).waitFor();assert.equal(await page.getByLabel('상세주소',{exact:true}).inputValue(),'기업 201호')
 // Warehouse inline modification retains its separate detail column.
 await page.goto(origin+'/app/warehouses?warehouseId=w1');await page.getByLabel('창고명',{exact:true}).fill('주소 QA 창고 수정');await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[aria-label="창고명"]')?.value==='주소 QA 창고 수정');assert.equal(warehouse.address,'기존 창고 주소')
 await choose();await page.getByLabel('상세주소',{exact:true}).fill('창고 B동');const response=page.waitForResponse(r=>r.url().endsWith('/warehouses/w1')&&r.request().method()==='POST');await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();await response;assert.equal(warehouse.address,'[06236] '+result.roadAddress);assert.equal(warehouse.addressDetail,'창고 B동');await page.reload();await page.getByLabel('우편번호',{exact:true}).waitFor();assert.equal(await page.getByLabel('우편번호',{exact:true}).inputValue(),'06236');assert.equal(await page.getByLabel('상세주소',{exact:true}).inputValue(),'창고 B동')
 // Both other address forms use the same responsive control without page overflow.
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000})
  for(const path of ['/app/settings/company','/app/warehouses?warehouseId=w1']){
   await page.goto(origin+path);await openSearch();const box=await addressDialog().boundingBox();assert(box.x>=0&&box.x+box.width<=width);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await addressDialog().getByRole('button',{name:'닫기',exact:true}).first().click()
   const bounds=await page.locator('.address-search-field').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width)
  }
 }
 // New warehouse saves the selected address through the existing workspace API.
 await page.goto(origin+'/app/warehouses');await page.getByRole('button',{name:'창고 등록',exact:true}).click();await page.getByLabel('창고명',{exact:true}).fill('신규 주소 창고');await choose();await page.getByLabel('상세주소',{exact:true}).fill('신규 3층');await page.getByRole('button',{name:'다음: 도면 구성',exact:true}).click();await page.getByRole('button',{name:'창고 저장',exact:true}).click();const created=page.waitForResponse(r=>r.url().endsWith('/warehouses/workspace')&&r.request().method()==='POST');await page.getByRole('dialog',{name:'창고 및 도면 저장 확인'}).getByRole('button',{name:'확인',exact:true}).click();await created;assert.equal(writes.at(-1).body.warehouse.address,'[06236] '+result.roadAddress);assert.equal(writes.at(-1).body.warehouse.addressDetail,'신규 3층')
 await page.goto(origin+'/app/warehouses?warehouseId=w1')
 // SDK failure, retry, cancel while loading, and unmount must not erase fields.
 failScript=true;await page.reload();await page.getByRole('button',{name:'주소 검색',exact:true}).click();await addressDialog().getByRole('alert').waitFor();assert.equal(await page.getByLabel('상세주소',{exact:true}).inputValue(),'창고 B동');failScript=false;await addressDialog().getByRole('button',{name:'다시 시도'}).click();await addressDialog().getByRole('button',{name:'테스트 주소 선택'}).waitFor();await page.mouse.click(2,2);await addressDialog().waitFor({state:'hidden'})
 delayScript=true;await page.reload();await page.getByRole('button',{name:'주소 검색',exact:true}).click();await addressDialog().getByRole('button',{name:'닫기',exact:true}).last().click();await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>window.addressEmbeds||0),0);await choose();assert.equal(await page.locator('script[src="'+script+'"]').count(),1);delayScript=false
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS overseas, company/warehouse existing API payloads/reload, legacy preservation, SDK single-load/failure/retry/unmount and no real API writes',origin)
}finally{await browser.close()}
