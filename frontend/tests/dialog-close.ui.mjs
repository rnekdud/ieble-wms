import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin = process.env.UI_ORIGIN || 'http://127.0.0.1:5176'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ serviceWorkers: 'block' })
const page = await context.newPage(), errors = []
page.on('pageerror', e => errors.push(e.message))
await context.route('**/api/**', route => route.abort())
await context.route(origin + '/__dialog-close*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import Refresh from '/@react-refresh';Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
const params = new URLSearchParams(location.search);localStorage.setItem('ieble-wms.language',params.get('language')||'ko');
const React = (await import('/node_modules/.vite/deps/react.js')).default, {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
for(const file of ['index.css','components/workspace/workspace.css','business-ui.css','design-tokens.css','theme.css','components/mobile/mobile.css'])await import('/src/'+file);
const {default:Dialog}=await import('/src/components/workspace/OrganizationDialog.tsx');const {t}=await import('/src/i18n.ts');const h=React.createElement;
function App(){const [open,setOpen]=React.useState(false),[busy,setBusy]=React.useState(false),[saved,setSaved]=React.useState(0);const mode=params.get('mode'),close=()=>setOpen(false),button=(name,fn)=>h('button',{type:'button',className:'secondary',onClick:fn},t(name));
const actions=mode==='actions'?h(React.Fragment,null,button('취소',close),button('저장',()=>{setSaved(n=>n+1);close()})):mode==='custom'?button('언어',()=>{}):undefined;
const content=mode==='body'?h(React.Fragment,null,button('취소',close),button('확인',close)):h('p',null,'본문 내용');
return h(React.Fragment,null,button('열기',()=>{setBusy(false);setOpen(true)}),h('output',null,saved),open&&h(Dialog,{title:t('상세'),showClose:true,hideFooter:mode==='hidden',detailHeader:mode==='detail'?{code:'QA'}:undefined,closeOnBackdrop:mode==='backdrop',busy,actions,onClose:close},content,mode==='busy'&&button(busy?'준비':'작업',()=>setBusy(v=>!v))));}
createRoot(document.getElementById('root')).render(h(App));
</script></html>` }))
try {
 for (const language of ['ko','en']) for (const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]) {
  await page.setViewportSize({width,height})
  for (const mode of ['plain','actions','body','custom','hidden','detail']) {
   await page.goto(`${origin}/__dialog-close?mode=${mode}&language=${language}`)
   await page.locator('#root > button').click();const d=page.locator('dialog[open]');await d.waitFor()
   const footer=d.locator(':scope > .dialog-actions'), close=d.getByRole('button',{name:language==='ko'?'닫기':'Close',exact:true})
   if (['actions','body'].includes(mode)) {await page.waitForFunction(()=>!document.querySelector('[data-dialog-fallback]'));assert.equal(await close.count(),0)}
   else {await close.waitFor();assert.equal(await close.count(),1);assert.equal(await footer.locator('.dialog-close').count(),1)}
   assert.equal(await d.locator('.dialog-close-icon').count(),0)
   assert.equal(await d.locator('.organization-dialog-heading button').count(),0)
   const geometry=await d.evaluate(e=>{const r=e.getBoundingClientRect();return {fits:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overflow:e.scrollWidth>e.clientWidth+1}})
   assert(geometry.fits,JSON.stringify({mode,width,height,geometry}));assert(!geometry.overflow)
   if(mode==='actions'){await d.getByRole('button',{name:language==='ko'?'저장':'Save',exact:true}).click();assert.equal(await page.locator('output').textContent(),'1')}
   else if(mode==='body')await d.getByRole('button',{name:language==='ko'?'확인':'Confirm',exact:true}).click()
   else await close.click()
   await d.waitFor({state:'detached'})
   assert.equal(await page.locator('#root > button').evaluate(e=>e===document.activeElement),true)
  }
 }
 await page.goto(origin+'/__dialog-close?mode=busy');await page.locator('#root > button').click();await page.getByRole('button',{name:'작업',exact:true}).click()
 assert(await page.locator('.dialog-close').isDisabled());await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),1)
 await page.getByRole('button',{name:'준비',exact:true}).click();await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'})
 for(const mode of ['plain','backdrop']){await page.goto(origin+'/__dialog-close?mode='+mode);await page.locator('#root > button').click();await page.locator('dialog[open]').waitFor();await page.mouse.click(1,1);if(mode==='plain'){assert.equal(await page.locator('dialog[open]').count(),1);await page.keyboard.press('Escape')}await page.locator('dialog').waitFor({state:'detached'})}
 assert.deepEqual(errors,[])
 console.log('PASS common dialogs: no header X, body/footer actions without duplicates, fallback for custom/detail/hidden footers, save/cancel/confirm/close, busy and backdrop/ESC policy, focus return; 2 languages × 9 viewports × 6 variants')
} catch(error) { console.error(errors,await page.locator('body').innerText());throw error } finally { await browser.close() }
