import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

// All inquiry reads, attachments and mutations are fulfilled in this isolated browser.
const origin = process.env.UI_ORIGIN || 'http://127.0.0.1:5176'
const sizes = [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]
const history = [{id:1,actor:'HISTORY_ONLY_ACTOR',changedAt:'2026-11-22T00:00:00Z',beforeJson:'{"Status":"Received"}',afterJson:'{"Status":"Answered","Answer":"HISTORY_ONLY_ANSWER"}'}]
const title = '상품 등록 관련 문의 · 긴 제목과 바코드 확인 요청'
const message = '상품 등록 시 바코드가 정상적으로 저장되지 않아 문의드립니다.\n두 번째 줄의 내용도 그대로 표시해 주세요.\n' + '긴본문확인'.repeat(40)
const filename = '첨부파일_아주긴파일명_'.repeat(12) + '.png'
const baseline = {id:'inquiry-1',tenantId:'qa-tenant',number:'QA-INQ-001',title,category:'Bug',status:'Answered',createdAt:'2026-11-23T00:00:00Z',answeredAt:'2026-11-23T01:00:00Z',company:'QA 기업',author:'홍길동',assignee:'QA 관리자',message,answer:'문의하신 내용 확인했습니다.\n상품 바코드 입력값을 확인해 주세요.',answerer:'QA 관리자',assignedToId:'admin-1',version:'1',attachments:[{id:'file-1',fileName:filename,size:2048},{id:'file-2',fileName:'재현순서.txt',size:50}],history}
const browser = await chromium.launch({channel:'chrome',headless:true})
const context = await browser.newContext({serviceWorkers:'block',acceptDownloads:true})
const page = await context.newPage()
page.setDefaultTimeout(10000)
const errors=[]; page.on('pageerror',e=>errors.push(e.message))
let current, admin=false, posts=[], deny=false, failSave=false, failDownload=false
await context.route('**/api/**', async route => {
  const req=route.request(), path=new URL(req.url()).pathname
  const root=admin?'/api/admin/support':'/api/tenants/qa-tenant/support'
  if(path==='/api/auth/csrf') return route.fulfill({json:{token:'mock-csrf'}})
  if(path==='/api/admin/support/administrators') { assert(admin);return route.fulfill({json:[{id:'admin-1',name:'QA 관리자'}]}) }
  if(path===root) { assert.equal(req.method(),'GET');return route.fulfill({json:{items:[current],total:1,page:1,pageSize:20}}) }
  if(path===root+'/inquiry-1') {
    if(deny) return route.fulfill({status:403,json:{message:'문의 조회 권한이 없습니다.'}})
    if(req.method()==='GET') return route.fulfill({json:current})
    assert(admin,'tenant must never submit administrator changes');assert.equal(req.method(),'POST')
    const body=req.postDataJSON();posts.push(body)
    assert.equal(body.version,current.version);assert.equal(req.headers()['x-csrf-token'],'mock-csrf')
    if(failSave) return route.fulfill({status:409,json:{message:'다른 관리자가 수정했습니다.'}})
    current={...current,answer:body.answer,status:body.status,assignedToId:body.assignedToId,answeredAt:'2026-11-23T02:00:00Z',answerer:'QA 관리자',version:String(Number(current.version)+1)}
    return route.fulfill({json:current})
  }
  if(path.startsWith(root+'/inquiry-1/attachments/')) {
    assert.equal(req.method(),'GET')
    return failDownload?route.fulfill({status:403,json:{message:'첨부파일 권한이 없습니다.'}}):route.fulfill({contentType:'application/octet-stream',body:'mock attachment'})
  }
  throw new Error('Unexpected API request blocked: '+req.method()+' '+path)
})
await context.route(origin+'/__support-detail*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
localStorage.setItem('ieble-wms.language',new URLSearchParams(location.search).get('language')==='en'?'en':'ko');
import Refresh from '/@react-refresh';Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
await import('/src/index.css');await import('/src/components/workspace/workspace.css');await import('/src/business-ui.css');await import('/src/design-tokens.css');await import('/src/theme.css');
const {default:Support}=await import('/src/components/workspace/SupportManagement.tsx');const {default:MobileRuntime}=await import('/src/components/mobile/MobileRuntime.tsx');
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement(MobileRuntime),React.createElement('div',{className:'wms-layout',style:{display:'block'}},React.createElement('main',{className:'wms-content',style:{margin:0,padding:16}},React.createElement(Support,{tenantId:'qa-tenant',admin:new URLSearchParams(location.search).has('admin')})))));
</script></html>`}))
async function open(role=false,status='Answered',language='ko') {
 admin=role;current=structuredClone(baseline);posts=[];deny=false;failSave=false;failDownload=false
 if(status==='Received') current={...current,status,answer:null,answerer:null,answeredAt:null,assignedToId:null,attachments:[]}
 else current.status=status
 await page.goto(origin+'/__support-detail?language='+language+(role?'&admin':''))
 await page.locator('.support-table tbody button').click()
 await page.locator('.support-detail-title').waitFor()
 if(role && status!=='Closed') await page.getByRole('combobox',{name:language==='en'?'Assigned Administrator':'담당 관리자',exact:true}).locator('option[value="admin-1"]').waitFor({state:'attached'})
}
async function geometry() {
 const issues=await page.locator('dialog[open]').evaluate(d=>{
  const issues=[],r=d.getBoundingClientRect(),body=d.querySelector('.dialog-body'),footer=d.querySelector(':scope > .dialog-actions'),heading=d.querySelector('.organization-dialog-heading')
  if(r.x<0||r.y<0||r.right>innerWidth+1||r.bottom>innerHeight+1)issues.push('dialog outside viewport')
  if(d.scrollWidth>d.clientWidth+1||body.scrollWidth>body.clientWidth+1)issues.push('horizontal overflow')
  for(const e of d.querySelectorAll('.support-detail *'))if(e.getClientRects().length&&e.scrollWidth>e.clientWidth+2&&!['TEXTAREA','SELECT'].includes(e.tagName))issues.push('overflow '+e.className)
  if(footer.getBoundingClientRect().bottom>r.bottom+1)issues.push('footer clipped')
  const editor=d.querySelector('.support-admin-editor textarea');if(editor && Math.abs(editor.getBoundingClientRect().width-editor.parentElement.getBoundingClientRect().width)>2)issues.push('reply field does not fill available width')
  if(heading.querySelector('button'))issues.push('unexpected header close button')
  const h=heading.querySelector('h2').getBoundingClientRect();if(h.left<r.left||h.right>r.right)issues.push('header misaligned')
  for(const b of footer.querySelectorAll('button'))if(b.getBoundingClientRect().height<44)issues.push('small action target')
  return issues
 })
 assert.deepEqual(issues,[])
}
try {
 for(const role of [false,true]) for(const [width,height] of sizes) {
  await page.setViewportSize({width,height});await open(role);await geometry()
  const d=page.locator('dialog[open]')
  assert.equal(await d.locator('details,.support-history').count(),0)
  assert(!await d.innerText().then(t=>t.includes('HISTORY_ONLY')||t.includes('변경 이력')))
  assert.equal(await d.locator('.support-detail-title').innerText(),title)
  assert.equal(await d.locator('.support-detail-summary .badge').innerText(),'답변 완료')
  assert.equal(await d.locator('.support-detail-content > .support-message').textContent(),message)
  assert.equal(await d.locator('.support-files a').count(),2)
  assert.equal(await d.locator('footer button').count(),role?2:1)
  assert.equal(await d.getByRole('button',{name:'처리 내용 저장',exact:true}).count(),role?1:0)
  assert.equal(await d.getByRole('textbox',{name:'관리자 답변',exact:true}).count(),role?1:0)
  if(role) assert.equal(await d.getByRole('textbox',{name:'관리자 답변',exact:true}).inputValue(),baseline.answer)
  else assert.equal(await d.locator('.support-answer > .support-message').textContent(),baseline.answer)
  if(process.env.UI_REVIEW_DIR && [360,1440].includes(width)) {
   await mkdir(process.env.UI_REVIEW_DIR,{recursive:true})
   await page.screenshot({path:process.env.UI_REVIEW_DIR+'/'+(role?'admin':'tenant')+'-'+width+'.png'})
   await d.locator('.dialog-body').evaluate(e=>e.scrollTop=e.scrollHeight)
   await page.screenshot({path:process.env.UI_REVIEW_DIR+'/'+(role?'admin':'tenant')+'-'+width+'-bottom.png'})
  }
  await d.locator('footer').getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await page.locator('dialog[open]').count(),0)
  assert.equal(await page.getByRole('button',{name:'상세',exact:true}).evaluate(e=>e===document.activeElement),true)
  console.log(`PASS ${role?'admin':'tenant'} ${width}x${height}: sections, attachment wrapping, footer, single scroll, close/focus`)
 }
 await page.setViewportSize({width:390,height:844});await open(false,'Received')
 assert.equal(await page.getByText('아직 등록된 답변이 없습니다.',{exact:true}).count(),1)
 assert.equal(await page.locator('.support-attachments').count(),0)
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0)
 await open(false)
 const download=page.waitForEvent('download');await page.locator('.support-files a').first().click();assert.equal((await download).suggestedFilename(),filename)
 failDownload=true;await page.locator('.support-files a').last().click();await page.getByRole('alert').filter({hasText:'첨부파일 권한이 없습니다.'}).waitFor()
 await page.locator('dialog[open] > .dialog-actions').getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await page.locator('dialog[open]').count(),0)
 await open(true,'Received')
 const editor=page.getByRole('textbox',{name:'관리자 답변',exact:true}),save=page.getByRole('button',{name:'처리 내용 저장',exact:true})
 assert(await save.isDisabled());await editor.fill('새 답변\n원문 유지')
 assert.equal(await page.locator('#support-detail-editor select').first().inputValue(),'Answered')
 await page.getByRole('combobox',{name:'담당 관리자',exact:true}).selectOption('admin-1')
 // Simulate the existing mobile viewport variable shrinking as a software keyboard opens.
 await editor.focus();await page.evaluate(()=>document.documentElement.style.setProperty('--mobile-viewport-height','480px'))
 await geometry();assert((await page.locator('dialog[open]').boundingBox()).height<=465)
 await page.evaluate(()=>document.documentElement.style.removeProperty('--mobile-viewport-height'))
 await page.locator('dialog[open] > .dialog-actions').getByRole('button',{name:'닫기',exact:true}).click();await page.getByRole('alertdialog',{name:'저장하지 않은 문의 작업'}).waitFor()
 await page.getByRole('button',{name:'계속 편집',exact:true}).click();assert.equal(await editor.inputValue(),'새 답변\n원문 유지')
 await save.click();await page.getByRole('alertdialog',{name:'문의 처리 저장 확인'}).waitFor();assert.equal(posts.length,0)
 await page.getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('status').filter({hasText:'문의 처리 내용을 저장했습니다.'}).waitFor()
 assert.deepEqual(posts[0],{version:'1',status:'Answered',assignedToId:'admin-1',answer:'새 답변\n원문 유지'})
 assert.deepEqual(current.history,history);assert.equal(current.message,message)
 await page.waitForFunction(()=>document.querySelector('#support-detail-editor textarea')?.value==='새 답변\n원문 유지')
 await editor.fill('수정 답변');failSave=true;await save.click();await page.getByRole('button',{name:'확인',exact:true}).click();await page.getByRole('alert').filter({hasText:'다른 관리자가 수정했습니다.'}).waitFor();assert.equal(await editor.inputValue(),'수정 답변')
 failSave=false;await save.click();await page.getByRole('button',{name:'확인',exact:true}).click();await page.waitForFunction(()=>document.querySelector('footer .primary')?.disabled)
 assert.equal(current.answer,'수정 답변');assert.deepEqual(current.history,history)
 await editor.fill('저장하지 않을 내용');await page.keyboard.press('Escape');await page.getByRole('button',{name:'변경 버리고 계속',exact:true}).click();assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(current.answer,'수정 답변')
 await open(true,'Closed');assert.equal(await page.locator('#support-detail-editor').count(),0);assert.equal(await page.locator('dialog footer button').count(),1)
 await page.locator('dialog[open] > .dialog-actions').getByRole('button',{name:'닫기',exact:true}).click();deny=true;await page.getByRole('button',{name:'상세',exact:true}).click();await page.getByRole('alert').filter({hasText:'문의 조회 권한이 없습니다.'}).waitFor();assert.equal(await page.locator('#support-detail-editor').count(),0)
 await page.setViewportSize({width:390,height:844});await open(false,'Answered','en');await geometry();assert.equal(await page.locator('.support-detail-title').innerText(),title);await page.getByRole('heading',{name:'Reply',exact:true}).waitFor();assert.equal(await page.locator('.support-detail-summary .badge').innerText(),'Answered')
 assert.deepEqual(errors,[])
 console.log('PASS pending/closed, tenant read-only, attachment success/failure, admin create/edit/save failure, status/assignment, unsaved guards, keyboard viewport, forbidden detail and English labels; all API calls mocked')
} catch(error) { console.error('Mock UI on failure:',await page.locator('body').innerText()); throw error } finally {await browser.close()}
