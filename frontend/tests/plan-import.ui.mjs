import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {chromium} from 'playwright'
const root=fileURLToPath(new URL('../../',import.meta.url)),engine=root+'backend/tools/plan-recognition/'
const fixture=process.env.PLAN_IMPORT_FIXTURE==='ruled'?'test_ruled.py':'test_handdrawn.py'
const payload=JSON.parse(execFileSync(engine+'.venv/bin/python',[engine+fixture,'--payload'],{maxBuffer:10_000_000}).toString())
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176'
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'}),errors=[],calls=[]
 const completed=()=>({aspectRatio:payload.result.aspectRatio,candidates:(partial?payload.result.objects.filter(o=>o.type==='wall').slice(0,2):payload.result.objects).map((o,i)=>({object:{...o,id:'candidate-'+i},confidence:o.confidence,evidence:o.evidence,reviewRequired:true})),warnings:payload.result.warnings,engine:'opencv-geometric-v1'})
 let job,fail=false,partial=false
 await context.route('**/api/**',route=>{
  const r=route.request(),p=new URL(r.url()).pathname;calls.push([r.method(),p])
  if(p==='/api/auth/csrf')return route.fulfill({json:{token:'fixture'}})
  assert(p.startsWith('/api/tenants/qa/plan-imports'),'No business API writes')
  if(p.endsWith('/preview'))return route.fulfill({contentType:'image/png',body:Buffer.from(payload.preview,'base64')})
  if(p.endsWith('/discard'))return route.fulfill({status:204})
  if(p.endsWith('/plan-imports'))job={id:'job',fileName:'handdrawn.png',page:0,rotation:0,revision:0,status:'Ready',metadata:payload.metadata,result:null}
  else if(p.endsWith('/page'))job={...job,...r.postDataJSON(),revision:job.revision+1,status:'Rendering',result:null}
  else if(p.endsWith('/analyze'))job={...job,status:'Analyzing'}
  else if(r.method()==='GET')job=job.status==='Rendering'?{...job,status:'Ready'}:job.status==='Analyzing'?{...job,status:fail?'Failed':'Completed',error:fail?'격리 분석 실패':null,result:fail?null:completed()}:job
  return route.fulfill({json:job})
 })
 await context.route(origin+'/__plan-import',r=>r.fulfill({contentType:'text/html',body:`<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/plan-import-ui.tsx"></script></html>`}))
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
 for(const [width,height]of [[1440,900],[1920,1080],[360,800],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/__plan-import')
  const dialog=page.getByRole('dialog',{name:'도면 파일 불러오기',exact:true})
  await dialog.getByLabel('도면 파일',{exact:true}).setInputFiles({name:'handdrawn.png',mimeType:'image/png',buffer:Buffer.from(payload.source,'base64')})
  await dialog.getByRole('button',{name:'오른쪽 90도 회전',exact:true}).click();await dialog.getByRole('button',{name:'분석 시작',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('select[aria-label="도면 방향"]').value==='90')
  await dialog.getByRole('button',{name:'원본 방향 복원',exact:true}).click();await dialog.getByRole('button',{name:'분석 시작',exact:true}).click();await dialog.getByLabel('인식 객체 선택',{exact:true}).waitFor()
  assert.equal(await dialog.locator('svg[aria-label="인식 결과 겹쳐보기"] rect[data-kind=rack]').count(),2)
  if(fixture==='test_ruled.py'){const limits=dialog.getByText('인식 한계와 확인 사항',{exact:true});await limits.click();assert(await dialog.getByText(/반복되는 옅은 노트 줄무늬/).isVisible());await limits.click()}
  assert.equal(await dialog.locator('svg[aria-label="인식 결과 겹쳐보기"] rect[data-kind=door][stroke-dasharray]').count(),1)
  assert(await dialog.getByRole('button',{name:'에디터에 적용',exact:true}).isDisabled())
  assert.equal(await dialog.getByText('업로드 원본 확인',{exact:true}).count(),0)
  const footer=dialog.locator(':scope > footer'),review=footer.getByRole('checkbox'),cancel=footer.getByRole('button',{name:'취소',exact:true}),apply=footer.getByRole('button',{name:'에디터에 적용',exact:true})
  await review.check();await apply.click()
  const validation=footer.getByRole('alert');await validation.waitFor()
  assert.match(await validation.innerText(),/모든 랙의 코드.*단수.*칸수/)
  for(const scrollTop of [0,100000]){
   await dialog.locator(':scope > .dialog-body').evaluate((e,y)=>{e.scrollTop=y},scrollTop)
   const [messageBox,checkBox,cancelBox,applyBox,labelBox]=await Promise.all([validation,review,cancel,apply,footer.locator('.plan-import-confirm')].map(e=>e.boundingBox()))
   for(const r of [messageBox,checkBox,cancelBox,applyBox,labelBox])assert(r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=height+1,'footer control stays in viewport')
   assert(labelBox.x+labelBox.width<=cancelBox.x+1,'confirmation is immediately left of Cancel')
   assert(Math.abs(labelBox.y+labelBox.height/2-cancelBox.y-cancelBox.height/2)<1,'confirmation and buttons share a row')
   const textBox=await footer.locator('.plan-import-confirm > .form-label-text').boundingBox()
   assert(checkBox.x+checkBox.width<=textBox.x,'checkbox sits left of confirmation text')
   assert(Math.abs(checkBox.y+checkBox.height/2-textBox.y-textBox.height/2)<1,'checkbox and text align horizontally')
   if(width>=1024)assert(textBox.height<=19,'desktop confirmation text uses one line')
   assert(Math.abs(cancelBox.y-applyBox.y)<1)
   assert(messageBox.y+messageBox.height<=Math.min(labelBox.y,cancelBox.y)+1,'validation above footer row')
   assert(!await footer.evaluate(e=>e.scrollWidth>e.clientWidth+1))
  }

  const racks=completed().candidates.filter(c=>c.object.type==='rack')
  for(const [i,c]of racks.entries()){
   await dialog.getByLabel('인식 객체 선택',{exact:true}).selectOption(c.object.id)
   assert.equal(await dialog.getByLabel('인식 랙 단수',{exact:true}).inputValue(),'')
   await dialog.getByLabel('인식 랙 이름',{exact:true}).fill('확인한 랙 '+(i+1));await dialog.getByLabel('인식 랙 단수',{exact:true}).fill('2');await dialog.getByLabel('인식 랙 칸수',{exact:true}).fill('3')
   if(i===0){await dialog.getByLabel('객체 x',{exact:true}).fill('28');assert(Math.abs(Number((await dialog.locator('svg[aria-label="인식 결과 겹쳐보기"] rect[data-kind=rack]').first().getAttribute('transform')).match(/translate\(([^ ]+)/)[1])-payload.metadata.width*.28)<.001)}
  }
  const source=dialog.getByLabel('원본 위 객체 지정',{exact:true});let sb=await source.boundingBox()
  const imageBox=await source.locator('img').boundingBox();assert(Math.abs(sb.width/sb.height-payload.metadata.aspectRatio)<.001);assert(Math.abs(imageBox.width-sb.width)<1&&Math.abs(imageBox.height-sb.height)<1)
  await dialog.getByRole('button',{name:'원본에서 랙 지정',exact:true}).click();await source.scrollIntoViewIfNeeded();sb=await source.boundingBox()
  // The preview can be taller than the short landscape body. Scroll its top
  // into the body before dragging; do not send pointer input behind the header.
  await source.evaluate(e=>{const body=e.closest('.dialog-body'),r=e.getBoundingClientRect(),b=body.getBoundingClientRect();if(r.y+r.height*.2<b.y+8)body.scrollTop+=r.y-b.y-8})
  sb=await source.boundingBox()
  assert(await source.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width*.2,r.y+r.height*.2))}),'drag starts in the visible preview')
  if(width===390){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sb.x+sb.width*.2,y:sb.y+sb.height*.2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sb.x+sb.width*.4,y:sb.y+sb.height*.35}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach()}
  else{await page.mouse.move(sb.x+sb.width*.2,sb.y+sb.height*.2);await page.mouse.down();await page.mouse.move(sb.x+sb.width*.4,sb.y+sb.height*.35,{steps:5});await page.mouse.up()}
  assert.equal(await dialog.locator('svg[aria-label="인식 결과 겹쳐보기"] rect[data-kind=rack]').count(),3)
  assert(Math.abs(Number(await dialog.getByLabel('객체 x',{exact:true}).inputValue())-30)<.5)
  await dialog.getByRole('button',{name:'삭제',exact:true}).click();assert.equal(await dialog.locator('svg[aria-label="인식 결과 겹쳐보기"] rect[data-kind=rack]').count(),2)
  await dialog.getByRole('button',{name:'원본에서 출입구 지정',exact:true}).click();await source.scrollIntoViewIfNeeded();sb=await source.boundingBox();await source.click({position:{x:sb.width*.55,y:sb.height*.7}})
  assert.equal(await dialog.locator('svg[aria-label="인식 결과 겹쳐보기"] rect[data-kind=door]').count(),2);await dialog.getByRole('button',{name:'삭제',exact:true}).click()
  await dialog.getByRole('button',{name:'출입문 추가',exact:true}).click();await dialog.getByRole('button',{name:'삭제',exact:true}).click()
  assert.equal(await dialog.locator('svg[aria-label="인식 결과 겹쳐보기"] rect[data-kind=door]').count(),1)
  const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1)
  assert(!await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1))
  await dialog.getByRole('button',{name:'왼쪽 90도 회전',exact:true}).click();const confirm=page.getByRole('dialog',{name:'현재 분석 작업 확인'});await confirm.getByRole('button',{name:'계속 편집',exact:true}).click();assert.equal(await dialog.getByLabel('도면 방향',{exact:true}).inputValue(),'0')
  await dialog.getByRole('checkbox',{name:'원본과 후보의 위치·유형·누락 및 랙 설정을 확인했습니다.',exact:true}).check();await dialog.getByRole('button',{name:'에디터에 적용',exact:true}).click();await dialog.waitFor({state:'hidden'})
  const applied=JSON.parse(await page.getByLabel('적용한 도면').textContent());assert.equal(applied.racks.length,2);assert.equal(applied.racks[0].name,'확인한 랙 1');assert.equal(applied.racks[0].levels,2);assert.equal(applied.objects.filter(o=>o.type==='door').length,1)
  assert(!applied.objects.some(o=>'rackId'in o||'locationId'in o));console.log(`PASS ${width}x${height}: actual local-engine candidates, overlay, rotate/reset, name/size editing, add/delete, guarded apply`)
 }
 partial=true;await page.goto(origin+'/__plan-import');let pd=page.getByRole('dialog',{name:'도면 파일 불러오기'});await pd.getByLabel('도면 파일',{exact:true}).setInputFiles({name:'partial.png',mimeType:'image/png',buffer:Buffer.from(payload.source,'base64')});await pd.getByRole('button',{name:'분석 시작',exact:true}).click();await pd.getByText('부분 인식 · 확인 필요',{exact:true}).waitFor();assert(await pd.getByText('랙 후보가 없습니다. 누락된 랙을 원본에서 지정하세요.',{exact:true}).isVisible());partial=false
 await page.goto(origin+'/__plan-import');const d=page.getByRole('dialog',{name:'도면 파일 불러오기'});fail=true
 await d.getByLabel('도면 파일',{exact:true}).setInputFiles({name:'handdrawn.png',mimeType:'image/png',buffer:Buffer.from(payload.source,'base64')});await d.getByRole('button',{name:'분석 시작',exact:true}).click();await d.getByRole('alert').filter({hasText:'격리 분석 실패'}).waitFor()
 await d.getByRole('button',{name:'직접 편집',exact:true}).click();await d.getByRole('button',{name:'벽 추가',exact:true}).click();await d.getByRole('checkbox',{name:'원본과 후보의 위치·유형·누락 및 랙 설정을 확인했습니다.',exact:true}).check();await d.getByRole('button',{name:'에디터에 적용',exact:true}).click()
 assert.deepEqual(errors,[]);console.log('PASS failure preserves original; manual fallback and all business data untouched')
}finally{await browser.close()}
