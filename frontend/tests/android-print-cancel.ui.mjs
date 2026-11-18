import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {chromium} from 'playwright'
const adb='/private/tmp/ieble-android-tools/sdk/platform-tools/adb'
const b=await chromium.connectOverCDP('http://localhost:9228')
try{
 const p=b.contexts().flatMap(c=>c.pages())[0]
 assert.equal(new URL(p.url()).origin,'http://localhost:5174')
 for(let i=0;i<2;i++){
  await p.evaluate(async()=>{
   const {printNativeLabel}=await import('/src/label-print.ts');const {barcodeGraphic}=await import('/src/rack-barcode.ts');const g=barcodeGraphic('WMS-QA-PRINT')
   window.__wmsPrintQA={path:location.href,root:document.getElementById('root'),state:'pending',history:history.length}
   void printNativeLabel({html:`<html><body style="margin:0"><p>WMS QA</p>${g.svg}</body></html>`,title:'WMS QA 취소 테스트',width:100,height:50}).then(()=>window.__wmsPrintQA.state='closed').catch(e=>window.__wmsPrintQA.state=e.message)
  })
  let printVisible=false
  for(let n=0;n<30;n++){
   const activity=execFileSync(adb,['shell','dumpsys','activity','activities'],{encoding:'utf8'}).split('\n').find(l=>l.includes('topResumedActivity='))||''
   if(activity.includes('printspooler')){printVisible=true;break}
   await new Promise(resolve=>setTimeout(resolve,150))
  }
  assert(printVisible,'Android print dialog must actually open')
  execFileSync(adb,['shell','input','keyevent','4'])
  await p.waitForFunction(()=>window.__wmsPrintQA.state==='closed',{timeout:10000})
  const state=await p.evaluate(()=>({samePage:window.__wmsPrintQA.path===location.href,sameRoot:window.__wmsPrintQA.root===document.getElementById('root'),sameHistory:window.__wmsPrintQA.history===history.length}))
  assert.deepEqual(state,{samePage:true,sameRoot:true,sameHistory:true});console.log('PASS Galaxy native print, Android Back cancellation, original page/root/history retained; round',i+1)
 }
 await p.evaluate(()=>{delete window.__wmsPrintQA})
}finally{await b.close()}
