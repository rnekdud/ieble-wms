import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',baseline=process.env.WMS_COMPARE_ORIGIN
const writes=[],errors=[],unknown=new Set(),empty={items:[],total:0,page:1,pageSize:20}
let visible=true,canManageBilling=true,failDismiss=false,holdDismiss
const subscription={providerConfigured:false,billingPolicyVersion:2,trialStartedAt:'2026-11-01T00:00:00Z',trialEndsAt:'2026-12-01T00:00:00Z',firstChargeAt:'2026-12-01T00:00:00Z',billingAnchorDay:1,billingTimeZone:'Asia/Seoul',paidThrough:null,autoBillingCanceled:false,serviceEndsAt:null,daysUntilFirstCharge:3,currentUsers:3,estimatedMonthlyKrw:30000,firstChargeUsers:3,firstChargeEstimateKrw:30000,access:{state:'Free',hasRegisteredCard:false,canAccessWms:true},invoices:[{id:'invoice-qa',cycleStart:'2026-12-01T00:00:00Z',amountKrw:30000,state:'ProviderNotConfigured'}]}
const workspace={id:'billing-qa',name:'결제 UI QA',role:'Master',serviceStatus:'Active',billingStatus:'Active',permissions:Object.fromEntries(workspacePages.map(p=>[p.key,['menu','read','readAll','create','update']])),billingAccess:{...subscription.access,freeUntil:subscription.trialEndsAt,firstChargeAt:subscription.firstChargeAt},billingPolicy:{monthlyPerUserKrw:10000,monthlyBaseKrw:0,includedUsers:0},latestChange:null}
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'})
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url()),p=u.pathname.replace('/api/tenants/billing-qa','')
  assert([origin,baseline].includes(u.origin),'Unexpected origin '+u.origin)
  if(!u.pathname.startsWith('/api/'))return route.continue()
  const json=data=>route.fulfill({json:data})
  if(r.method()!=='GET'){
   assert.equal(r.method(),'POST');assert(['/subscription/dismiss','/subscription/feedback'].includes(p),'Unexpected write '+p);assert.equal(r.headers()['x-csrf-token'],'qa-csrf')
   writes.push({path:p,body:r.postDataJSON()})
   if(p==='/subscription/dismiss'){if(holdDismiss)await holdDismiss;if(failDismiss)return route.fulfill({status:400,json:{message:'QA 안내 닫기 실패'}});visible=false}
   return json({message:'QA only'})
  }
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'QA',userName:'qa',email:'qa@example.test',systemRole:'User',mustChangePassword:false},memberships:[{tenantId:workspace.id,name:workspace.name,role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:workspace.id})
  if(p==='/api/auth/csrf')return json({token:'qa-csrf'})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p==='/workspace')return json({...workspace,canManageBilling})
  if(p.startsWith('/pages/'))return json({})
  if(p==='/subscription')return json({...subscription,reminderVisible:visible})
  if(p==='/support')return json({...empty,total:1,items:[{id:'ticket',number:'QA01',title:'QA 문의',category:'Service',status:'Received',createdAt:'2026-11-01T00:00:00Z',author:'QA'}]})
  if(p==='/support/ticket')return route.fulfill({status:400,json:{message:'QA 상세 오류'}})
  unknown.add(p);return json(empty)
 })
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 const reminder=()=>page.getByRole('dialog',{name:'첫 결제 안내',exact:true})
 async function open(server=origin){visible=true;await page.goto(server+'/app/support');await reminder().waitFor();await page.waitForTimeout(100);return reminder()}
 const metrics=d=>d.evaluate(e=>{
  const rect=el=>{const b=el.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}}
  const f=e.querySelector(':scope > .dialog-actions'),body=e.querySelector('.dialog-body')
  return{box:rect(e),titleX:rect(e.querySelector('h2')).x,padding:getComputedStyle(body).padding,text:[...body.children].filter(el=>!el.matches('button')).map(el=>el.textContent),overflow:e.scrollWidth>e.clientWidth+1||body.scrollWidth>body.clientWidth+1,footer:{...rect(f),padding:parseFloat(getComputedStyle(f).paddingRight),gap:getComputedStyle(f).gap,justify:getComputedStyle(f).justifyContent},buttons:[...e.querySelectorAll('button')].map(b=>({text:b.textContent,...rect(b),radius:getComputedStyle(b).borderRadius,bg:getComputedStyle(b).backgroundColor,color:getComputedStyle(b).color,inFooter:f.contains(b)}))}
 })
 for(const width of [360,390,430,768,1024,1440,1920]){
  await page.setViewportSize({width,height:900});const old=baseline?await metrics(await open(baseline)):null,d=await open(),m=await metrics(d)
  assert.deepEqual(m.buttons.map(b=>b.text),['나중에 하기','결제 관리 보기']);assert.equal(await d.locator(':scope > footer').count(),1)
  assert.equal(m.footer.gap,'8px');assert.equal(m.footer.justify,'flex-end');assert(m.buttons.every(b=>b.inFooter&&b.h===40));assert.equal(m.buttons[0].radius,m.buttons[1].radius);assert.equal(m.buttons[0].y,m.buttons[1].y);assert.equal(m.buttons[1].x-m.buttons[0].right,8);assert(Math.abs(m.footer.right-m.footer.padding-m.buttons[1].right)<1)
  assert(!m.overflow);assert(m.box.x>=0&&m.box.right<=width&&m.box.y>=0&&m.box.bottom<=900);assert(m.buttons.every(b=>b.x>=m.box.x&&b.right<=m.box.right))
  if(old){assert.equal(m.box.w,old.box.w);assert.equal(m.titleX,old.titleX);assert.equal(m.padding,old.padding);assert.deepEqual(m.text.slice(1,4),old.text.slice(0,3));for(const [index,b] of m.buttons.entries()){const o=old.buttons[index];assert.equal(b.bg,o.bg);assert.equal(b.color,o.color);assert.equal(b.radius,o.radius)}assert.equal(old.buttons.length,2)}
  assert.equal(await d.getByRole('button',{name:'카드 등록하기',exact:true}).count(),0)
  assert(await d.getByText('카드 등록 기능은 현재 준비 중입니다. 결제 관련 내용은 결제 관리에서 확인할 수 있습니다.',{exact:true}).isVisible())
  await d.getByRole('button',{name:'결제 관리 보기',exact:true}).click();await page.waitForURL('**/app/master/billing')
  await page.getByRole('heading',{name:'카드 등록 기능 준비 중',exact:true}).waitFor()
  const info=page.getByRole('region',{name:'카드 등록 안내',exact:true})
  assert.equal(await info.getByRole('link',{name:'contact@ieble.com',exact:true}).getAttribute('href'),'mailto:contact@ieble.com')
  assert.equal(await info.getByRole('link',{name:'070-8787-9532',exact:true}).getAttribute('href'),'tel:07087879532')
  assert(await page.getByText('자동결제: 해지하지 않음 · 카드: 미등록',{exact:true}).isVisible())
  assert(await page.getByText(/가입일 기준 무료기간 · 무료 시작/).isVisible())
  assert(await page.getByText(/정기결제 기준일 매월 1일/).isVisible())
  assert(await page.getByText('현재 사용자 3명 · 예상 월 이용료 30,000원',{exact:true}).isVisible())
  assert(await page.getByRole('cell',{name:'결제 연동 대기 (청구 안 됨)',exact:true}).isVisible())
  assert(await page.getByRole('cell',{name:'30,000원',exact:true}).isVisible())
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))
  const timeOrigin=await page.evaluate(()=>performance.timeOrigin)
  await info.getByRole('link',{name:'문의하기',exact:true}).click();await page.waitForURL('**/app/support');assert.equal(await page.evaluate(()=>performance.timeOrigin),timeOrigin)
  console.log(`PASS ${width}px: single right-aligned footer, 8px gap, 40px buttons, no clipping${old?', original width/padding/colors preserved':''}`)
 }
 // The server still decides whether to show the reminder after remount.
 const beforePolicy=JSON.stringify(subscription)
 await page.reload();await page.getByRole('heading',{name:'문의하기',exact:true}).waitFor();await page.waitForTimeout(150);assert.equal(await reminder().count(),0)
 let d=await open(),release;holdDismiss=new Promise(resolve=>{release=resolve});const before=writes.length
 await d.getByRole('button',{name:'나중에 하기'}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.billing-reminder-dialog button')].every(b=>b.disabled));await page.keyboard.press('Escape');assert.equal(writes.length,before+1)
 release();holdDismiss=undefined;await d.waitFor({state:'detached'})
 d=await open();failDismiss=true;await d.getByRole('button',{name:'나중에 하기'}).click();await d.getByRole('alert').filter({hasText:'QA 안내 닫기 실패'}).waitFor();assert(await d.getByRole('button',{name:'나중에 하기'}).isEnabled());failDismiss=false;await page.keyboard.press('Escape');await d.waitFor({state:'detached'})
 d=await open();await d.getByRole('textbox').fill('  격리 QA 소감  ');const cardStart=writes.length
 await d.getByRole('button',{name:'결제 관리 보기'}).click();await page.waitForURL('**/app/master/billing');await page.getByRole('heading',{name:'구독 및 결제 일정',exact:true}).waitFor()
 assert.deepEqual(writes.slice(cardStart).map(w=>w.path),['/subscription/feedback','/subscription/dismiss']);assert.equal(writes[cardStart].body.message,'격리 QA 소감');assert(writes[cardStart].body.requestId);assert(await page.getByText('현재 온라인 카드 등록 및 자동결제 연동을 준비하고 있습니다.',{exact:true}).isVisible())
 const count=writes.length;await page.getByRole('button',{name:'자동결제 해지',exact:true}).click();const cancel=page.getByRole('dialog',{name:'자동결제 해지 확인',exact:true});assert.deepEqual(await cancel.locator('button').allTextContents(),['취소','확인']);await cancel.getByRole('button',{name:'취소',exact:true}).click();await cancel.waitFor({state:'detached'});assert.equal(writes.length,count)
 d=await open();const emptyCardStart=writes.length;await d.getByRole('button',{name:'결제 관리 보기'}).click();await page.waitForURL('**/app/master/billing');assert.deepEqual(writes.slice(emptyCardStart).map(w=>w.path),['/subscription/dismiss'])
 // API capability controls the pending notice; card/contract data remain independent.
 subscription.providerConfigured=true;subscription.access.hasRegisteredCard=true;subscription.autoBillingCanceled=true;subscription.serviceEndsAt='2026-12-15T00:00:00Z'
 d=await open();assert.equal(await d.getByText(/카드 등록 기능은 현재 준비 중/).count(),0)
 await d.getByRole('button',{name:'결제 관리 보기'}).click();await page.waitForURL('**/app/master/billing');await page.getByRole('heading',{name:'구독 및 결제 일정',exact:true}).waitFor()
 assert.equal(await page.getByRole('heading',{name:'카드 등록 기능 준비 중',exact:true}).count(),0)
 assert(await page.getByText('자동결제: 해지됨 · 카드: 등록 확인',{exact:true}).isVisible());assert(await page.getByText(/이용 종료 예정일:/).isVisible());assert.equal(await page.getByRole('button',{name:'자동결제 해지',exact:true}).count(),0)
 Object.assign(subscription,JSON.parse(beforePolicy))
 canManageBilling=false;visible=true;await page.goto(origin+'/app/support');await page.getByRole('heading',{name:'문의하기',exact:true}).waitFor();await page.waitForTimeout(150);assert.equal(await reminder().count(),0)
 // A different dialog still receives its automatic close action.
 await page.getByRole('button',{name:'상세',exact:true}).click();const detail=page.getByRole('dialog',{name:'문의 상세',exact:true});await detail.getByRole('alert').waitFor();await detail.getByRole('button',{name:'닫기',exact:true}).click();await detail.waitFor({state:'detached'})
 assert.equal(JSON.stringify(subscription),beforePolicy);assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 console.log('PASS dismiss/reappearance, busy lock, retry, Escape, feedback/no-feedback navigation, billing permission gate and other dialog close controls; all API writes mocked')
}finally{await browser.close()}
