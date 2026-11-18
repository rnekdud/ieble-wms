import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {userGuides} from '../src/user-guide.ts'
const origin=process.env.WMS_UI_ORIGIN||'http://localhost:5176'
const errors=[],requests=[]
const workspace={id:'guide-qa',name:'가이드 예시 기업',role:'Master',permissions:{company:['menu','read','update'],support:['menu','read']},serviceStatus:'Active',billingStatus:'Active',billingAccess:{state:'Active',canAccessWms:true,hasRegisteredCard:true},billingPolicy:{monthlyPerUserKrw:0,monthlyBaseKrw:0,includedUsers:1},canManageBilling:false,latestChange:null}
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url())
  assert.equal(url.origin,origin,'No external services')
  if(!url.pathname.startsWith('/api/'))return route.continue()
  requests.push(url.pathname);assert.equal(request.method(),'GET','Manual is read-only')
  if(url.pathname==='/api/auth/me')return route.fulfill({json:{user:{id:'qa',displayName:'가이드 담당자',userName:'guide',email:'guide@example.test',systemRole:'User',mustChangePassword:false},memberships:[{tenantId:workspace.id,name:workspace.name,role:workspace.role,serviceStatus:'Active'}],selectedTenantId:workspace.id,tenantResolution:'resolved'}})
  if(url.pathname==='/api/health/db')return route.fulfill({json:{status:'connected'}})
  if(url.pathname==='/api/tenants/guide-qa/workspace')return route.fulfill({json:workspace})
  if(url.pathname==='/api/tenants/guide-qa/pages/company'||url.pathname==='/api/tenants/guide-qa/pages/dashboard')return route.fulfill({json:{}})
  if(url.pathname==='/api/tenants/guide-qa/company')return route.fulfill({json:{company:{id:workspace.id,name:workspace.name,version:'qa'},history:[]}})
  if(url.pathname==='/api/tenants/guide-qa/dashboard/warehouses')return route.fulfill({json:{warehouses:[],asOf:'2026-11-12T00:00:00Z'}})
  throw Error('Unexpected business API: '+url.pathname)
 })
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
 const main=page.locator('.user-guide'),modal=page.locator('dialog.guide-modal')
 const background='/app/settings/company'
 async function noOverflow(){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page must fit viewport');const box=await modal.boundingBox();assert(box.x>=0&&box.x+box.width<=page.viewportSize().width+1)}
 async function openGuide(){if(page.viewportSize().width<=760)await page.getByRole('button',{name:'업무 메뉴 열기',exact:true}).click();await page.getByRole('button',{name:'이용 가이드',exact:true}).click();await modal.waitFor()}
 for(const width of [1920,1440,1280,768,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+background)
  const input=page.getByRole('textbox',{name:'기업명',exact:true});await input.fill('저장하지 않은 기업명')
  const readsBefore=requests.filter(p=>p.endsWith('/company')).length
  await openGuide();assert.equal(page.url(),origin+background)
  assert.equal(await page.getByRole('alertdialog').count(),0,'Opening manual must not trigger leave confirmation')
  assert.equal(await main.locator('.guide-card').count(),13)
  assert.equal(new Set(await main.locator('.guide-card > svg:first-child').evaluateAll(icons=>icons.map(icon=>icon.getAttribute('class')))).size,13,'Each topic uses its own icon')
  if(process.argv.includes('--preview')&&[1440,390].includes(width))console.log('PREVIEW:'+await page.screenshot({type:'jpeg',quality:60}).then(b=>b.toString('base64')))
  await noOverflow()
  await main.getByRole('searchbox',{name:'가이드 검색'}).fill('피킹');assert(await main.locator('.guide-card[href$="/shipments"]').isVisible())
  await main.getByRole('searchbox',{name:'가이드 검색'}).fill('없는기능xyz');assert(await main.getByText('검색 결과가 없습니다.').isVisible())
  await main.getByRole('button',{name:'검색 초기화'}).click();await main.getByRole('button',{name:'기능별 이용 가이드',exact:true}).click();assert.equal(await main.locator('.guide-card').count(),7)
  await main.getByRole('button',{name:'전체',exact:true}).click()
  await main.locator('.guide-card[href$="/warehouses"]').click();await main.locator('.guide-article').waitFor();assert.equal(page.url(),origin+background)
  await main.locator('.guide-contents a').last().click();assert.equal(page.url(),origin+background,'Section anchors stay inside modal')
  assert(await modal.locator(':scope > .dialog-body').evaluate(el=>el.scrollTop>0))
  assert.equal(await main.locator('.guide-section').count(),4)
  assert.equal(await main.locator('.guide-back,.guide-article-footer').count(),0)
  const footer=modal.locator(':scope > footer')
  for(const label of ['이용 가이드 목록','이전 가이드','다음 가이드','닫기']){
   const box=await footer.getByRole('button',{name:label,exact:true}).boundingBox();assert(box.y>=0&&box.y+box.height<=1000&&box.x+box.width<=width)
  }
  const footerBox=await footer.boundingBox();assert(footerBox.height<=(width>=768?90:130),'Footer actions stay in one desktop row / two mobile rows')
  if(process.argv.includes('--preview')&&[1440,390].includes(width))console.log('PREVIEW:'+await page.screenshot({type:'jpeg',quality:60}).then(b=>b.toString('base64')))
  const opener=main.locator('.guide-image-button').first();await opener.scrollIntoViewIfNeeded();await opener.locator('img').evaluate(i=>i.decode());await opener.click()
  const imageDialog=page.locator('dialog.guide-image-dialog');await imageDialog.waitFor()
  const before=await imageDialog.locator('img').evaluate(i=>i.getBoundingClientRect().width)
  await imageDialog.getByRole('button',{name:'이미지 확대',exact:true}).click();assert(await imageDialog.locator('img').evaluate(i=>i.getBoundingClientRect().width)>before*1.4)
  await page.keyboard.press('Escape');await imageDialog.waitFor({state:'detached'});assert(await modal.isVisible());assert(await opener.evaluate(el=>el===document.activeElement))
  await modal.locator(':scope > footer').getByRole('button',{name:'다음 가이드',exact:true}).click();await main.getByRole('heading',{name:'상품 등록',exact:true}).waitFor();assert.equal(page.url(),origin+background)
  assert.equal(await modal.locator(':scope > .dialog-body').evaluate(el=>el.scrollTop),0)
  await modal.locator(':scope > footer').getByRole('button',{name:'이용 가이드 목록',exact:true}).click();assert.equal(await main.locator('.guide-card').count(),13)
  await noOverflow();await modal.locator(':scope > footer').getByRole('button',{name:'닫기',exact:true}).click();await modal.waitFor({state:'detached'})
  assert.equal(await input.inputValue(),'저장하지 않은 기업명');assert.equal(page.url(),origin+background)
  assert.equal(requests.filter(p=>p.endsWith('/company')).length,readsBefore,'Underlying form must not reload')
  await openGuide();await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});assert.equal(await input.inputValue(),'저장하지 않은 기업명')
  console.log('PASS modal, nested image, in-modal navigation, preserved unsaved form',width)
 }
 // Existing guide bookmarks open the same dialog; there is no separate article page.
 for(const guide of userGuides){
  await page.goto(origin+'/app/guide/'+guide.id);await modal.waitFor()
  assert.equal(await main.locator('.guide-section').count(),guide.sections.length)
  assert.equal(await modal.locator(':scope > footer').getByRole('button',{name:'이전 가이드',exact:true}).isDisabled(),guide===userGuides[0])
  assert.equal(await modal.locator(':scope > footer').getByRole('button',{name:'다음 가이드',exact:true}).isDisabled(),guide===userGuides.at(-1))
  for(const img of await main.locator('.guide-section img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(i=>i.decode());assert(await img.evaluate(i=>i.naturalWidth>300))}
  assert.equal(await main.locator('form,iframe,[role="progressbar"]').count(),0);await noOverflow()
 }
 await page.goto(origin+'/app/guide/missing');await modal.waitFor();assert(await main.getByText('가이드를 찾을 수 없습니다.').isVisible())
 await modal.locator(':scope > footer').getByRole('button',{name:'닫기'}).click();await modal.waitFor({state:'detached'});assert.equal(page.url(),origin+'/app')
 assert.deepEqual(errors,[])
 console.log('PASS all article images and legacy modal entry; no writes',origin)
}finally{await browser.close()}
