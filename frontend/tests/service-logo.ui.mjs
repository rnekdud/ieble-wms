import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:5176'
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const context=await browser.newContext({serviceWorkers:'block'})
 await context.route('**/api/**',r=>r.abort())
 await context.route('**/__service-logo-check',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><body><div id="root"></div><script type="module">
 import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
 await import('/src/index.css');await import('/src/components/workspace/workspace.css');await import('/src/design-tokens.css');await import('/src/theme.css');
 const {default:Sidebar}=await import('/src/components/workspace/WorkspaceSidebar.tsx');
 function Fixture(){const [collapsed,toggle]=React.useState(false);return React.createElement('div',{className:'wms-layout'},React.createElement(Sidebar,{path:'/app',role:'Master',permissions:{},collapsed,onToggle:()=>toggle(!collapsed),onNavigate:path=>document.body.dataset.destination=path}))}
 createRoot(document.getElementById('root')).render(React.createElement(Fixture));
 </script></body></html>`}))
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/__service-logo-check');const brand=page.getByRole('link',{name:'아이블 WMS 대시보드',exact:true});await brand.waitFor({timeout:10000}).catch(e=>{throw Error(e.message+' '+errors.join('; '))})
 const logo=brand.locator('img');assert.equal(await logo.getAttribute('src'),'/wms_logo.svg')
 assert(await logo.evaluate(e=>e.complete&&e.naturalWidth===328&&e.naturalHeight===297))
 assert.equal(await logo.evaluate(e=>getComputedStyle(e).objectFit),'contain')
 assert.match(await brand.innerText(),/아이블 WMS/)
 for(const collapsed of [false,true,false]) {
  if(collapsed!==await page.locator('.wms-sidebar').evaluate(e=>e.classList.contains('is-collapsed')))await page.getByRole('button',{name:collapsed?'사이드바 접기':'사이드바 펼치기',exact:true}).click()
  const box=await logo.boundingBox(),container=await brand.boundingBox();assert.equal(box.width,36);assert.equal(box.height,36);assert(box.x>=container.x&&box.x+box.width<=container.x+container.width)
  assert.equal(await brand.locator('.wms-side-label').count(),collapsed?0:1)
 }
 await brand.click();assert.equal(await page.locator('body').getAttribute('data-destination'),'/app')
 assert.deepEqual(errors,[])
 await context.close();console.log('PASS: original wms_logo.svg loaded; expanded/collapsed sidebar logo fits at 36px; toggle and navigation preserved. No API access.')
}finally{await browser.close()}
