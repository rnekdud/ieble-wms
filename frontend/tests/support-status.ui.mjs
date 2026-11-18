import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176'
const states={Received:'접수',InProgress:'처리 중',Answered:'답변 완료',Closed:'종료'}
const items=Object.keys(states).map((status,i)=>({id:String(i),number:'QA0'+i,category:'Service',status,title:'문의 상태 정렬 확인',company:'QA 기업',author:'QA 작성자',assignee:null,createdAt:'2026-11-18T00:00:00Z',answeredAt:null}))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block'}),errors=[]
 await context.route('**/api/**',r=>{
  const q=r.request(),u=new URL(q.url());assert.equal(q.method(),'GET','no business writes');assert(u.pathname.endsWith('/support'))
  const data=items.filter(i=>!u.searchParams.get('status')||i.status===u.searchParams.get('status'))
  return r.fulfill({json:{items:data,total:data.length,page:1,pageSize:20}})
 })
 await context.route(origin+'/__support-status*',r=>r.fulfill({contentType:'text/html',body:`<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
 import Refresh from '/@react-refresh';Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
 const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
 await import('/src/index.css');await import('/src/components/workspace/workspace.css');await import('/src/business-ui.css');await import('/src/design-tokens.css');await import('/src/theme.css');await import('/src/components/mobile/mobile.css');
 const {default:Support}=await import('/src/components/workspace/SupportManagement.tsx');
 createRoot(document.getElementById('root')).render(React.createElement('div',{className:'wms-layout',style:{display:'block'}},React.createElement('main',{className:'wms-content',style:{margin:0,padding:16}},React.createElement(Support,{tenantId:'qa',admin:new URLSearchParams(location.search).has('admin')}))));
 </script></html>`}))
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)})
 for(const admin of [false,true])for(const [width,height]of [[1440,900],[1920,1080],[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/__support-status'+(admin?'?admin':''));await page.waitForFunction(()=>document.querySelectorAll('.support-table .badge').length===4)
  const badges=await page.locator('.support-table .badge').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),range=document.createRange();range.selectNodeContents(e);const text=range.getBoundingClientRect(),cell=e.parentElement.getBoundingClientRect();return {text:e.textContent,w:r.width,h:r.height,textWidth:text.width,textCenter:text.x+text.width/2,center:r.x+r.width/2,right:r.right,cellRight:cell.right,display:s.display,padding:s.padding,margin:s.margin,overflow:e.scrollWidth>e.clientWidth}}))
  for(const b of badges){assert(Math.abs(b.w-b.textWidth-20)<1,JSON.stringify(b));assert(Math.abs(b.center-b.textCenter)<1,JSON.stringify(b));assert.equal(b.h,24);assert.equal(b.margin,'0px');assert(!b.overflow);assert(b.right<=b.cellRight+1)}
  assert.deepEqual(badges.map(b=>b.text),Object.values(states))
  await page.locator('.support-filters label').filter({hasText:/^처리 상태/}).locator('select').selectOption('Answered');await page.getByRole('button',{name:'검색',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.support-table .badge').length===1);assert.equal(await page.locator('.support-table .badge').innerText(),'답변 완료')
  console.log(`PASS ${admin?'admin':'tenant'} ${width}x${height}: content-width badges, centered text, consistent spacing, status filter`)
 }
 assert.deepEqual(errors,[])
}finally{await browser.close()}
