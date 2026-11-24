import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin=process.env.WMS_UI_ORIGIN||'http://127.0.0.1:5176', root='/api/tenants/fixture/receipts'
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const initial=()=>({receipt:{id:'r',number:'IN-PHOTO',expectedDate:'2026-11-18',partnerId:'supplier',partnerName:'공급사',warehouseId:'w',warehouseName:'창고',contactUserId:'qa-user',contactName:'QA 담당자',notes:null,status:'Planned',version:'v1',inspectedAt:null},lines:[{id:'l1',productId:'p1',productCode:'P1',productName:'상품',unit:'EA',expectedQuantity:10,inspectedQuantity:null,serials:[],placements:[],lotManaged:false,expiryManaged:false,serialManaged:false}]})
let data=initial(),photos=[],serial=1,fail=false,available=true,writes=[]
const errors=[],unexpected=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage()
 page.on('pageerror',e=>errors.push(e.message));context.setDefaultTimeout(12000)
 // Generate actual small image data in memory; no screenshots or image files are written.
 await page.goto('about:blank')
 const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=16;c.height=12;const x=c.getContext('2d');x.fillStyle='#e9b900';x.fillRect(0,0,16,12);return c.toDataURL('image/jpeg').split(',')[1]})
 {
 const choice=(id,name)=>({id,name,code:id.toUpperCase(),unit:'EA',lotManaged:false,expiryManaged:false,serialManaged:false})
 const gallery=()=>({photos:photos.map(({id,fileName,contentType})=>({id,fileName,contentType})),version:data.receipt.version,photosVersion:'pv'+serial})
 const uploadPhotos=body=>{photos=body.photos.map(p=>p.id?photos.find(x=>x.id===p.id):{...p,id:'photo'+(++serial)});data.receipt.version='v'+(++serial)}
 await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,q=url.searchParams
  if(url.origin!==origin){unexpected.push(req.url());return route.abort()}
  if(path==='/__receipt-ui')return route.fulfill({contentType:'text/html',body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/receipt-ui.tsx"></script></html>'})
  if(!path.startsWith('/api/'))return route.continue()
  const json=value=>route.fulfill({json:value})
  if(path==='/api/auth/csrf')return json({token:'mock'})
  if(req.method()==='GET'){
   if(path===root+'/photo-options'&&!available)return route.fulfill({status:404})
   if(path===root+'/photo-options')return json({maxCount:10,maxBytes:5242880,formats:['image/jpeg','image/png','image/webp']})
   if(path===root+'/r')return json(data)
   if(path===root+'/r/photos')return json(gallery())
   if(path.startsWith(root+'/r/photos/')){const p=photos.find(x=>path.endsWith('/'+x.id));if(!p)return route.fulfill({status:404});return route.fulfill({contentType:q.has('thumbnail')?'image/jpeg':p.contentType,body:Buffer.from(q.has('thumbnail')?p.thumbnailBase64:p.base64,'base64')})}
   if(path.endsWith('/inspection-history'))return json({items:[],total:0,page:1,pageSize:30})
   if(path.endsWith('/stock'))return json({balances:[],movements:[]})
   if(path.endsWith('/business-assignees'))return json({items:[{id:'qa-user',name:'QA 담당자',code:'QA',isActive:true}],total:1,page:1,pageSize:20})
   if(path===root+'/choices'){
    if(q.get('kind')==='product-options')return json({categories:[],productTypes:[]})
    const items=q.get('kind')==='warehouses'?[choice('w','창고')]:q.get('kind')==='partners'?[choice('supplier','공급사')]:q.get('kind')==='racks'?[]:[choice('p1','상품')]
    return json({items,total:items.length,page:1,pageSize:30})
   }
  }else if(path===root+'/r/photos'||path===root||path===root+'/r'){
   writes.push({path,body:req.postDataJSON()});if(fail)return route.fulfill({status:503,json:{message:'mock failure'}})
   const body=req.postDataJSON();if(body.photos)uploadPhotos(body)
   return json(path.endsWith('/photos')?{detail:data,gallery:gallery()}:data)
  }
  unexpected.push(path);return route.fulfill({status:404,json:{message:'unexpected mock route'}})
 })
 const file=(name='입고.png')=>({name,mimeType:'image/png',buffer:Buffer.from(png,'base64')})
 const goto=mode=>page.goto(origin+'/__receipt-ui?mode='+(mode||'detail'))
 for(const [width,height] of [[360,800],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]]){
  data=initial();photos=[{id:'p-a',fileName:'기존 사진.png',contentType:'image/png',base64:png,thumbnailBase64:jpeg}];await page.setViewportSize({width,height});await goto()
  await page.getByLabel('입고 사진 1 확대',{exact:true}).waitFor()
  await page.getByLabel('입고 사진 파일',{exact:true}).setInputFiles([file('추가1.png'),file('추가2.png')])
  await page.getByRole('heading',{name:'입고 사진 3 / 10',exact:true}).waitFor()
  assert(await page.getByRole('button',{name:'검수 시작',exact:true}).isDisabled(),'prevent leaving unsaved photo changes')
  const gallery=await page.locator('.receipt-photo-grid').evaluate(el=>({
   tiles:[...el.querySelectorAll('.receipt-photo-open,.receipt-photo-add')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height}}),
   remove:[...el.querySelectorAll('.receipt-photo-delete')].map(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {width:r.width,height:r.height,contained:r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom}}),
   addBorder:getComputedStyle(el.querySelector('.receipt-photo-add')).borderTopStyle,
   imageFit:getComputedStyle(el.querySelector('img')).objectFit
  }))
  assert(gallery.tiles.every(t=>Math.abs(t.width-t.height)<2),'square gallery tiles')
  assert(gallery.remove.every(t=>t.width>=44&&t.height>=44&&t.contained),'accessible remove buttons inside photo tiles')
  assert.equal(gallery.addBorder,'dashed');assert.equal(gallery.imageFit,'contain')

  if(width===360){await page.getByLabel('목록으로 돌아가기',{exact:true}).click();await page.getByRole('dialog',{name:'저장하지 않은 변경사항',exact:true}).waitFor();await page.getByRole('button',{name:'계속 편집',exact:true}).click();assert.equal(await page.locator('.receipt-photo-thumb').count(),3)}
  const layout=await page.locator('.receipt-photos').evaluate(el=>({sw:el.scrollWidth,cw:el.clientWidth,children:[...el.querySelectorAll('.receipt-photo-thumb, .receipt-photo-add')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right}})}))
  assert(layout.sw<=layout.cw+1);assert(layout.children.every(r=>r.left>=0&&r.right<=width))
  await page.getByRole('button',{name:'사진 저장',exact:true}).click();await page.getByText('입고 사진을 저장했습니다.',{exact:true}).waitFor();assert.equal(photos.length,3)
  await page.getByLabel('입고 사진 2 확대',{exact:true}).click();let dialog=page.getByRole('dialog',{name:'입고 사진',exact:true});await dialog.waitFor()
  assert.match(await dialog.innerText(),/2 \/ 3/)
  await dialog.getByLabel('다음 사진',{exact:true}).click();assert.match(await dialog.innerText(),/3 \/ 3/)
  await dialog.getByLabel('사진 확대 영역',{exact:true}).focus();await page.keyboard.press('ArrowLeft');assert.match(await dialog.innerText(),/2 \/ 3/)
  await dialog.getByLabel('사진 확대',{exact:true}).click();assert.equal(await dialog.getByLabel('사진 원래 크기').innerText(),'125%')
  const box=await dialog.getByLabel('사진 확대 영역').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2+15);await page.mouse.up();assert.match(await dialog.locator('.receipt-photo-stage img').getAttribute('style'),/translate\(25px, 15px\)/)
  await dialog.getByLabel('사진 원래 크기').click()
  const rect=await dialog.boundingBox();assert(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width+1&&rect.y+rect.height<=height+1)
  const close=await dialog.getByRole('button',{name:'닫기',exact:true}).boundingBox();assert(close.y+close.height<=height)
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'})
  await page.getByLabel('입고 사진 2 삭제',{exact:true}).click();await page.getByRole('button',{name:'사진 변경 취소',exact:true}).click();assert.equal(await page.locator('.receipt-photo-thumb').count(),3)
  await page.getByLabel('입고 사진 2 삭제',{exact:true}).click();await page.getByRole('button',{name:'사진 저장',exact:true}).click();await page.getByText('입고 사진을 저장했습니다.',{exact:true}).waitFor();assert.equal(photos.length,2)
  await goto();await page.getByRole('heading',{name:'입고 사진 2 / 10',exact:true}).waitFor()
  console.log('PASS photos layout/persist/viewer/delete',width,height)
 }
 await page.setViewportSize({width:390,height:844});await goto()
 fail=true;await page.getByLabel('입고 사진 파일',{exact:true}).setInputFiles(file());await page.getByRole('button',{name:'사진 저장',exact:true}).click();await page.getByText('서버 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',{exact:true}).waitFor();assert.equal(await page.locator('.receipt-photo-thumb').count(),3)
 fail=false;await page.getByRole('button',{name:'사진 저장',exact:true}).click();await page.getByText('입고 사진을 저장했습니다.',{exact:true}).waitFor()
 await page.getByLabel('입고 사진 파일',{exact:true}).setInputFiles({name:'bad.heic',mimeType:'image/heic',buffer:Buffer.from('bad')});await page.getByText(/HEIC\/HEIF는 JPG로 변환/).waitFor()
 await page.getByLabel('입고 사진 파일',{exact:true}).setInputFiles(Array.from({length:8},(_,i)=>file(i+'.png')));await page.getByText('입고 사진은 최대 10장입니다.',{exact:true}).waitFor()
 // Browser touch events exercise swipe, pinch and pan without claiming physical device QA.
 await page.getByLabel('입고 사진 1 확대',{exact:true}).click()
 const viewer=page.getByRole('dialog',{name:'입고 사진',exact:true})
 await page.keyboard.press('ArrowRight');assert.match(await viewer.innerText(),/2 \/ 3/)
 const touch=await context.newCDPSession(page)
 const stage=await viewer.getByLabel('사진 확대 영역').boundingBox(),cx=stage.x+stage.width/2,cy=stage.y+stage.height/2
 const send=(type,touchPoints)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints})
 await send('touchStart',[{x:cx+50,y:cy,id:1}]);await send('touchMove',[{x:cx-40,y:cy,id:1}]);await send('touchEnd',[]);assert.match(await viewer.innerText(),/3 \/ 3/)
 await send('touchStart',[{x:cx-30,y:cy,id:1},{x:cx+30,y:cy,id:2}]);await send('touchMove',[{x:cx-60,y:cy,id:1},{x:cx+60,y:cy,id:2}]);await send('touchEnd',[])
 assert(Number.parseInt(await viewer.getByLabel('사진 원래 크기').innerText())>150)
 await send('touchStart',[{x:cx,y:cy,id:1}]);await send('touchMove',[{x:cx+20,y:cy+10,id:1}]);await send('touchEnd',[])
 assert.match(await viewer.locator('.receipt-photo-stage img').getAttribute('style'),/translate\(20px, 10px\)/)
 await page.setViewportSize({width:844,height:390});assert.match(await viewer.innerText(),/3 \/ 3/)
 await page.mouse.click(1,1);await viewer.waitFor({state:'hidden'})
 await page.setViewportSize({width:390,height:844})
 data.receipt.status='Inspecting';await goto();await page.getByRole('heading',{name:'입고 사진 3 / 10',exact:true}).waitFor();assert.equal(await page.locator('.receipt-photo-thumb').count(),3)
 data.receipt.status='Confirmed';await goto();await page.getByRole('heading',{name:'입고 사진 3 / 10',exact:true}).waitFor();assert.equal(await page.getByLabel('입고 사진 파일',{exact:true}).count(),0)
 data=initial();await page.goto(origin+'/__receipt-ui?readonly');await page.getByRole('heading',{name:'입고 사진 3 / 10',exact:true}).waitFor();assert.equal(await page.getByLabel('입고 사진 파일',{exact:true}).count(),0)
 // Unsaved creation has no upload request. Photos travel with the existing receipt save.
 await goto('new');writes=[];await page.getByLabel('입고 사진 파일',{exact:true}).setInputFiles([file(),file('포장.png')]);await page.getByRole('heading',{name:'입고 사진 2 / 10',exact:true}).waitFor();assert.equal(writes.length,0)
 const choose=async(label,text)=>{await page.getByRole('button',{name:new RegExp('^'+label+' ')}).click();await page.getByRole('combobox',{name:label+' 검색',exact:true}).fill(text);await page.getByRole('option').filter({hasText:text}).first().click()}
 await choose('매입 거래처','공급사');await choose('입고 창고','창고');await page.getByRole('button',{name:'상품 추가',exact:true}).click();await page.getByRole('checkbox',{name:'P1 선택',exact:true}).check();await page.getByRole('button',{name:'선택 상품 추가',exact:true}).click();await page.getByLabel('수량 1',{exact:true}).fill('10')
 await page.getByRole('button',{name:'입고 등록',exact:true}).click();await page.getByRole('button',{name:'확인',exact:true}).click();await page.getByText('목록 이동 완료').waitFor();assert.equal(writes.length,1);assert.equal(writes[0].body.photos.length,2);assert(writes[0].body.photos.every(p=>p.base64&&p.thumbnailBase64))
 available=false;await goto('new');await page.getByText(/입고 사진 기능을 사용할 수 없습니다/).waitFor();assert.equal(await page.getByLabel('입고 사진 파일',{exact:true}).count(),0);assert(await page.getByRole('button',{name:'상품 추가',exact:true}).isEnabled())
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[])
 console.log('PASS draft atomic payload, retry, limits, readonly, inspection, no unexpected APIs')
 }
}finally{await browser.close()}
