import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://localhost:5176',root='/api/tenants/fixture',endpoint=root+'/partners'
const baselineOrigin=process.env.BASELINE_ORIGIN
const rows=[],writes=[],errors=[],unexpected=[]
let sequence=0,canUpdate=true
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname,json=value=>route.fulfill({json:value})
  assert([origin,baselineOrigin].includes(u.origin))
  if(!p.startsWith('/api/'))return route.continue()
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'QA',email:'qa@example.test',userName:'qa',systemRole:'None',mustChangePassword:false},memberships:[{tenantId:'fixture',name:'격리 QA 기업',role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:'fixture'})
  if(p==='/api/auth/csrf')return json({token:'fixture'})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p===root+'/workspace')return json({id:'fixture',name:'격리 QA 기업',role:'Master',accountType:'Internal',serviceStatus:'Active',canManageBilling:false,billingAccess:{canAccessWms:true},permissions:{partners:canUpdate?['menu','read','create','update']:['menu','read']}})
  if(p===root+'/pages/partners')return json({})
  if(req.method()==='GET'){
   if(p===endpoint+'/business-number-check')return json({matches:[]})
   if(p===endpoint)return json({items:rows,total:rows.length,page:1,pageSize:20})
   const found=rows.find(row=>p===endpoint+'/'+row.id);if(found)return json(found)
  }
  if(req.method()==='POST'&&(p===endpoint||rows.some(row=>p===endpoint+'/'+row.id))){
   const body=req.postDataJSON();writes.push(body)
   const old=rows.find(row=>p===endpoint+'/'+row.id),code=body.code?.trim()||old?.code||'BP'+String(++sequence).padStart(2,'0')
   if(rows.some(row=>row.id!==old?.id&&row.code.toUpperCase()===code.toUpperCase()))return route.fulfill({status:409,json:{message:'이미 사용 중인 거래처 코드입니다.'}})
   const saved={...old,...body,code,id:old?.id||crypto.randomUUID(),version:crypto.randomUUID(),createdAt:old?.createdAt||'2026-11-11',updatedAt:'2026-11-11'}
   if(old)Object.assign(old,saved);else rows.push(saved)
   return json({partner:saved,warning:null})
  }
  unexpected.push(p);return route.fulfill({status:404,json:{message:'Unexpected fixture request'}})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
 const open=async()=>{await page.goto(origin+'/app/partners');await page.getByRole('button',{name:'거래처 등록',exact:true}).click();return page.getByRole('dialog',{name:'거래처 등록',exact:true})}
 const save=async(dialog)=>{await dialog.getByRole('button',{name:'거래처 저장',exact:true}).click();await page.getByRole('alertdialog',{name:'거래처 저장 확인'}).getByRole('button',{name:'확인',exact:true}).click()}
 const metrics=async dialog=>dialog.evaluate(d=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}
  return {dialog:rect(d),overflow:d.scrollWidth>d.clientWidth+1,
   actions:[...d.querySelectorAll('.work-detail-actions button,.dialog-actions button')].map(rect),
   controls:[...d.querySelectorAll('#partner-editor input,#partner-editor select,#partner-editor textarea')].map(e=>({
    name:e.getAttribute('aria-label'),rect:rect(e),parent:rect(e.parentElement),
    grid:getComputedStyle(e.parentElement).gridTemplateColumns,justify:getComputedStyle(e.parentElement).justifyContent,
    radius:getComputedStyle(e).borderRadius,border:getComputedStyle(e).borderColor,resize:getComputedStyle(e).resize
   })),postalButton:rect(d.querySelector('.address-postal-row button'))}
 })
 const checkLayout=async(dialog,width,baseline)=>{
  await dialog.locator('#partner-editor').waitFor();const m=await metrics(dialog);assert(!m.overflow);assert(m.dialog.x>=0&&m.dialog.x+m.dialog.w<=width+1)
  for(const c of m.controls){
   if(!['거래처코드','기본 출고지 우편번호'].includes(c.name))assert(Math.abs(c.rect.w-c.parent.w)<1,JSON.stringify(c))
   assert.equal(c.rect.x,c.parent.x);assert(c.rect.x+c.rect.w<=m.dialog.x+m.dialog.w)
   if(c.name!=='비고')assert.equal(c.rect.h,40);else assert.equal(c.resize,'vertical')
  }
  if(baseline){
   assert.deepEqual(m.dialog,baseline.dialog,'dialog geometry');assert.deepEqual(m.actions,baseline.actions,'action geometry')
   assert.deepEqual(m.postalButton,baseline.postalButton,'postal search button')
   for(const c of m.controls){const b=baseline.controls.find(x=>x.name===c.name)
    assert.equal(c.rect.h,b.rect.h);assert.equal(c.radius,b.radius);assert.equal(c.border,b.border)
    assert.deepEqual(c.parent,b.parent,'existing field grid position '+c.name)
    if(['거래처코드','우편번호','기본주소','상세주소'].includes(c.name))assert.deepEqual(c.rect,b.rect,'special/address field unchanged')
   }
  }
  console.log('WIDTH',width,...['거래처명','거래처 유형','비고'].map(name=>{const c=m.controls.find(x=>x.name===name),b=baseline?.controls.find(x=>x.name===name);return `${name}: ${b?.rect.w??'-'} -> ${c.rect.w}/${c.parent.w}px`}))
 }
 const baselinePage=baselineOrigin?await context.newPage():null
 for(const width of [360,390,430,768,1024,1280,1440,1920]){
  await page.setViewportSize({width,height:1000});let baseline
  if(baselinePage){await baselinePage.setViewportSize({width,height:1000});await baselinePage.goto(baselineOrigin+'/app/partners');await baselinePage.getByRole('button',{name:'거래처 등록',exact:true}).click();baseline=await metrics(baselinePage.getByRole('dialog',{name:'거래처 등록',exact:true}))}
  let dialog=await open();await checkLayout(dialog,width,baseline)
  assert.equal(await dialog.getByRole('combobox',{name:'사업자번호 구분'}).count(),0)
  const code=dialog.getByRole('textbox',{name:'거래처코드',exact:true})
  assert.equal(await code.inputValue(),'');assert.equal(await code.getAttribute('placeholder'),'미입력 시 자동 생성');assert.equal(await code.getAttribute('required'),null)
  await dialog.getByRole('textbox',{name:'거래처명',exact:true}).fill('격리 거래처 '+width)
  await dialog.getByRole('combobox',{name:'거래처 유형',exact:true}).selectOption('BOTH')
  await dialog.getByRole('textbox',{name:'사업자등록번호',exact:true}).fill('12-34')
  await dialog.getByRole('button',{name:'거래처 저장',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'숫자 10자리'}).waitFor()
  await dialog.getByRole('textbox',{name:'사업자등록번호',exact:true}).fill('123-45-67890')
  const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
  await save(dialog);await dialog.waitFor({state:'detached'})
  const saved=rows.at(-1);await page.getByRole('button',{name:saved.name+' 수정',exact:true}).waitFor();assert.equal(writes.at(-1).code,null);assert.equal(saved.type,'BOTH');assert.match(await page.locator('body').innerText(),new RegExp(saved.code))
  await page.getByRole('button',{name:saved.name+' 수정',exact:true}).click();dialog=page.getByRole('dialog',{name:'거래처 수정',exact:true})
  await checkLayout(dialog,width)
  assert.equal(await dialog.locator('.registration-back').count(),0)
  const close=dialog.locator('.dialog-actions').getByRole('button',{name:'닫기',exact:true}),submit=dialog.locator('.dialog-actions').getByRole('button',{name:'거래처 저장',exact:true})
  await close.waitFor();assert.equal(await dialog.getByRole('button',{name:'닫기',exact:true}).count(),1)
  const a=await close.boundingBox(),b=await submit.boundingBox();assert(a.x+a.width<=b.x+1);assert(Math.abs(a.y-b.y)<2)
  await close.click();await dialog.waitFor({state:'detached'});await page.getByRole('button',{name:saved.name+' 수정',exact:true}).click();await dialog.waitFor()
  await dialog.getByRole('textbox',{name:'거래처명',exact:true}).fill('저장하지 않은 변경');await dialog.getByRole('button',{name:'닫기',exact:true}).click();await page.getByRole('button',{name:'계속 편집',exact:true}).click();assert.equal(await dialog.getByRole('textbox',{name:'거래처명',exact:true}).inputValue(),'저장하지 않은 변경')
  assert.equal(await dialog.getByRole('textbox',{name:'거래처코드',exact:true}).inputValue(),saved.code)
  assert.equal(await dialog.getByRole('combobox',{name:'사업자번호 구분'}).count(),0)
  await dialog.getByRole('textbox',{name:'거래처명',exact:true}).fill('수정 '+width);await save(dialog)
  await page.locator('dialog').waitFor({state:'detached'});assert.equal(writes.at(-1).code,saved.code)
  console.log(`PASS ${width}px blank code registration, number validation, direct edit, no back icon, close/save order and unsaved changes`)
 }
 let dialog=await open();await dialog.getByRole('textbox',{name:'거래처코드',exact:true}).fill('ABC-001');await dialog.getByRole('textbox',{name:'거래처명',exact:true}).fill('수동 거래처');await save(dialog);await page.locator('dialog').waitFor({state:'detached'});assert.equal(rows.at(-1).code,'ABC-001')
 dialog=await open();await dialog.getByRole('textbox',{name:'거래처코드',exact:true}).fill('ABC-001');await dialog.getByRole('textbox',{name:'거래처명',exact:true}).fill('중복 거래처');await save(dialog);await page.getByRole('alert').filter({hasText:'이미 사용 중인 거래처 코드입니다.'}).waitFor()
 assert.equal(await dialog.getByRole('textbox',{name:'거래처명',exact:true}).inputValue(),'중복 거래처');assert.equal(await dialog.getByRole('textbox',{name:'거래처코드',exact:true}).inputValue(),'ABC-001')
 const overseas={...rows.at(-1),id:crypto.randomUUID(),name:'해외 기존 거래처',code:'OLD-FOREIGN',registrationCountry:'OTHER',businessRegistrationNumber:'GB-123'};rows.push(overseas)
 await page.goto(origin+'/app/partners');await page.getByRole('button',{name:'해외 기존 거래처 수정'}).click()
 dialog=page.getByRole('dialog',{name:'거래처 수정',exact:true});await dialog.getByRole('textbox',{name:'담당자명',exact:true}).fill('새 담당자');await save(dialog);await page.locator('dialog').waitFor({state:'detached'})
 assert.equal(writes.at(-1).registrationCountry,'OTHER');assert.equal(writes.at(-1).businessRegistrationNumber,'GB-123');assert.equal(writes.at(-1).code,'OLD-FOREIGN')
 canUpdate=false;await page.goto(origin+'/app/partners');await page.getByRole('button',{name:'해외 기존 거래처 상세',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByText('OLD-FOREIGN',{exact:true}).first().waitFor();assert.equal(await dialog.locator('.registration-back').count(),0);assert.equal(await dialog.getByRole('button',{name:'거래처 저장',exact:true}).count(),0);assert.equal(await dialog.getByRole('textbox').count(),0);await dialog.getByRole('button',{name:'닫기',exact:true}).click()
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS manual/duplicate codes and existing overseas number compatibility; no real API writes')
}finally{await browser.close()}
