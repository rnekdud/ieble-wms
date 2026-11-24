import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { workspacePages } from '../src/components/workspace/navigation.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176',baseline=process.env.WMS_COMPARE_ORIGIN
const writes=[],errors=[],unknown=new Set(),empty={items:[],total:0,page:1,pageSize:20}
let visible=false,canManageBilling=true,failDismiss=false,holdDismiss,failRead=false
const subscription={providerConfigured:false,billingPolicyVersion:2,trialStartedAt:'2026-11-01T00:00:00Z',trialEndsAt:'2026-12-01T00:00:00Z',firstChargeAt:'2026-12-01T00:00:00Z',billingAnchorDay:1,billingTimeZone:'Asia/Seoul',paidThrough:null,autoBillingCanceled:false,serviceEndsAt:null,daysUntilFirstCharge:3,currentUsers:10,estimatedMonthlyKrw:30000,firstChargeUsers:3,firstChargeEstimateKrw:30000,access:{state:'Free',hasRegisteredCard:false,canAccessWms:true},invoices:[{id:'invoice-qa',cycleStart:'2026-12-01T00:00:00Z',amountKrw:30000,state:'ProviderNotConfigured'}]}
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
   assert.equal(r.method(),'POST');assert(['/subscription/dismiss','/subscription/feedback','/subscription/cancel'].includes(p),'Unexpected write '+p);assert.equal(r.headers()['x-csrf-token'],'qa-csrf')
   writes.push({path:p,body:r.postDataJSON()});if(p==='/subscription/cancel'){subscription.autoBillingCanceled=true;subscription.serviceEndsAt=subscription.trialEndsAt}
   if(p==='/subscription/dismiss'){if(holdDismiss)await holdDismiss;if(failDismiss)return route.fulfill({status:400,json:{message:'QA 안내 닫기 실패'}});visible=false}
   return json({message:'QA only'})
  }
  if(p==='/api/auth/me')return json({user:{id:'qa',displayName:'QA',userName:'qa',email:'qa@example.test',systemRole:'User',mustChangePassword:false},memberships:[{tenantId:workspace.id,name:workspace.name,role:'Master',serviceStatus:'Active'}],tenantResolution:'resolved',selectedTenantId:workspace.id})
  if(p==='/api/auth/csrf')return json({token:'qa-csrf'})
  if(p==='/api/health/db')return json({status:'connected'})
  if(p==='/workspace')return json({...workspace,canManageBilling})
  if(p.startsWith('/pages/'))return json({})
  if(p==='/subscription'&&failRead)return route.fulfill({status:503,json:{message:'QA 일시적 조회 오류'}})
  if(p==='/subscription')return json({...subscription,reminderVisible:visible})
  if(p==='/support')return json({...empty,total:1,items:[{id:'ticket',number:'QA01',title:'QA 문의',category:'Service',status:'Received',createdAt:'2026-11-01T00:00:00Z',author:'QA'}]})
  if(p==='/support/ticket')return route.fulfill({status:400,json:{message:'QA 상세 오류'}})
  unknown.add(p);return json(empty)
 })
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))

 const total=()=>page.locator('[data-billing-total]')
 const annual=()=>page.getByRole('button',{name:'연간 결제 예상 요금 선택',exact:true})
 const monthly=()=>page.getByRole('button',{name:'월간 결제 예상 요금 선택',exact:true})
 async function text(locator,value){await page.waitForFunction(({selector,value})=>document.querySelector(selector)?.textContent===value,{selector:locator,value})}
 async function open(){await page.goto(origin+'/app/master/billing');await total().waitFor()}
 const metrics=[]
 for(const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await open()
  assert.equal(await total().innerText(),'20,000원 / 월')
  assert.equal(await page.getByRole('button',{name:'상태 새로고침',exact:true}).count(),0)
  assert.equal(await monthly().getAttribute('aria-pressed'),'true')
  assert(await page.getByText('이벤트 종료일 미정',{exact:true}).isVisible())
  assert(await page.getByText('카드 결제 서비스 준비 중',{exact:true}).isVisible())
  assert(await page.getByText('해지는 카드 삭제나 환불과 별개입니다. 결제 취소·환불은 고객센터 전화 문의로 접수해 주세요.',{exact:true}).isVisible())
  assert(await page.getByRole('cell',{name:'30,000원',exact:true}).isVisible(),'historic invoice unchanged')
  assert.equal(await page.getByRole('button',{name:/카드 등록|카드 삭제|카드 해지|결제하기/}).count(),0)
  await annual().click();assert.equal(await total().innerText(),'240,000원 / 연')
  assert.equal(await annual().getAttribute('aria-pressed'),'true')
  const m=await page.locator('.billing-pricing-page').evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,buttons:[...e.querySelectorAll('.billing-plan-option')].map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height}})}))
  assert(m.scrollWidth<=m.width+1,JSON.stringify(m));assert(m.documentWidth<=width+1,JSON.stringify(m));assert(m.buttons.every(b=>b.left>=0&&b.right<=width&&b.height>=44))
  metrics.push({viewport:`${width}x${height}`,content:m.width,scroll:m.scrollWidth,buttonRight:Math.max(...m.buttons.map(b=>b.right))})
  await monthly().click();assert.equal(await total().innerText(),'20,000원 / 월')
 }
 console.log('PASS responsive DOM',JSON.stringify(metrics))
 assert.equal(writes.length,0,'price selection must never mutate a contract')
 subscription.currentUsers=11
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await text('[data-billing-total]','22,000원 / 월')
 await annual().click();assert.equal(await total().innerText(),'264,000원 / 연')
 const policy={monthlyPerUserKrw:5000,annualDiscountPercent:20,eventEnabled:true,eventMonthlyPerUserKrw:2000,eventEndsOn:'2026-11-20'}
 subscription.currentUsers=10;subscription.pricingPreview={policy,asOf:'2026-11-20T15:00:00Z'}
 subscription.nextChargeAt='2026-12-01T00:00:00Z'
 await open();assert.equal(await total().innerText(),'50,000원 / 월')
 await annual().click();assert.equal(await total().innerText(),'480,000원 / 연')
 assert(await page.getByText('일반 요금 안내',{exact:true}).isVisible())
 assert(await page.getByText(/기존 계약상 결제 기준일:/).isVisible())
 const dateValue=await page.locator('dt').filter({hasText:'다음 결제 예정일'}).locator('..').innerText();assert(dateValue.includes('미정'))
 // Server clock just before midnight, while the device calendar is unrelated.
 subscription.pricingPreview.asOf='2026-11-20T14:59:58Z'
 await open();assert.equal(await total().innerText(),'20,000원 / 월')
 await text('[data-billing-total]','50,000원 / 월')
 delete subscription.pricingPreview;subscription.currentUsers=0;subscription.nextChargeAt=null
 await open();assert.equal(await total().innerText(),'0원 / 월')
 // Failed read is retryable and must not invent users, amounts or transactions.
 failRead=true;await page.reload();await page.getByRole('alert').filter({hasText:'서버 요청을 처리하지 못했습니다.'}).waitFor();assert.equal(await total().count(),0)
 failRead=false;subscription.currentUsers=10;await page.getByRole('button',{name:'다시 시도',exact:true}).click();await total().waitFor();assert.equal(await total().innerText(),'20,000원 / 월')
 // Keep the existing cancellation workflow; only the mock receives a mutation.
 await page.getByRole('button',{name:'자동결제 해지',exact:true}).click()
 let dialog=page.getByRole('dialog',{name:'자동결제 해지 확인',exact:true});await dialog.getByRole('button',{name:'취소',exact:true}).click();assert.equal(writes.length,0)
 await page.getByRole('button',{name:'자동결제 해지',exact:true}).click();dialog=page.getByRole('dialog',{name:'자동결제 해지 확인',exact:true});await dialog.getByRole('button',{name:'확인',exact:true}).click()
 await page.getByText('자동결제: 해지됨 · 카드: 미등록',{exact:true}).waitFor()
 assert.deepEqual(writes.map(w=>w.path),['/subscription/cancel'])
 assert.equal(await page.getByRole('button',{name:'자동결제 해지',exact:true}).count(),0)
 canManageBilling=false;await page.reload();await page.getByRole('alert').filter({hasText:'결제 정보는 기업 마스터 권한으로 확인할 수 있습니다.'}).waitFor();assert.equal(await total().count(),0)
 assert.equal(await page.getByRole('button',{name:'상태 새로고침',exact:true}).count(),0)
 assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[])
 console.log('PASS estimates, active-member refresh, KST expiry timer, 0 users, missing schedule, read retry, immutable invoices, mock cancellation and no payment/card actions')
}finally{await browser.close()}
