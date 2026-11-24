// Explicit opt-in only. Uses newly registered QA tenants; never existing accounts or products.
import assert from 'node:assert/strict'
import { chromium, request } from 'playwright'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
const origin=process.env.LABEL_QA_ORIGIN
assert.equal(process.env.LABEL_QA_ALLOW_WRITE,'dedicated-test-tenants')
assert(['http://127.0.0.1:5086','http://localhost:5174'].includes(origin))
await mkdir('/private/tmp/ieble-label-activation',{recursive:true,mode:0o700})
const ui=origin.endsWith(':5174'),stamp=Date.now().toString(),identities=[]
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAE0lEQVR4nGP8P40BK2DCLjxYJQBBVAGlf4IUrQAAAABJRU5ErkJggg==','base64')
async function post(client,path,data,status=200){const c=await client.get(origin+'/api/auth/csrf');assert.equal(c.status(),200);const {token}=await c.json();let r=await client.post(origin+path,{data,headers:{'X-CSRF-TOKEN':token}});if(path==='/api/auth/register'&&r.status()===429){console.log('Waiting for the existing registration rate-limit window');await new Promise(resolve=>setTimeout(resolve,60000));r=await client.post(origin+path,{data,headers:{'X-CSRF-TOKEN':token}})}assert.equal(r.status(),status,path+' '+await r.text());return r}
function businessNumber(){const a=Array.from(randomBytes(9),n=>n%10),w=[1,3,7,1,3,7,1,3,5];let n=a.reduce((s,v,i)=>s+v*w[i],0)+Math.floor(a[8]*5/10);return a.join('')+(10-n%10)%10}
async function register(client,suffix){const password=randomBytes(24).toString('base64url')+'a1!',email=`codex-label-${stamp}-${suffix}@example.invalid`;await post(client,'/api/auth/register',{companyName:`Codex Label QA ${stamp} ${suffix}`,businessRegistrationNumber:businessNumber(),contactName:'라벨 검증 전용',contactPhone:'01000000000',email,password},201);await post(client,'/api/auth/login',{email,password});const me=await (await client.get(origin+'/api/auth/me')).json();assert.equal(me.memberships.length,1);const record={tenantId:me.selectedTenantId,userId:me.user.id};identities.push(record);await writeFile(`/private/tmp/ieble-label-activation/${ui?'live':'qa'}-identities.json`,JSON.stringify(identities),{mode:0o600});return record}
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true,viewport:{width:1440,height:900}}),page=await context.newPage();page.setDefaultTimeout(20000)
const secondary=await request.newContext(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
try {
 const a=await register(context.request,'a'),b=await register(secondary,'b'),root=`/api/tenants/${a.tenantId}/label-designs`
 assert.equal((await context.request.get(origin+root)).status(),200)
 let saved
 if(ui){
  await page.goto(origin+'/app/label-editor');await page.locator('.label-edit-canvas').waitFor()
  const button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByLabel(name,{exact:true})
  await page.locator('.label-paper-choice .searchable-choice-trigger').click();await page.getByRole('option',{name:'폼텍 3107',exact:true}).click();await page.getByRole('tab',{name:'편집 도구',exact:true}).click();await button('텍스트 추가').click();await field('텍스트').fill('실제 API 저장 검증 000123')
  await field('라벨 이미지').setInputFiles({name:'qa.png',mimeType:'image/png',buffer:png});await field('가로 위치(mm)').fill('70');await field('너비(mm)').fill('12')
  await button('바코드 추가').click();await field('바코드 값').fill('000123456789');await field('세로 위치(mm)').fill('18');await field('높이(mm)').fill('12')
  await button('라벨 복사').click();await page.getByRole('tab',{name:'라벨 목록',exact:true}).click();await button('라벨 2').click();await button('라벨 붙여넣기').click();await page.locator('.label-edit-canvas [data-object-id]').first().click();await field('텍스트').fill('두 번째 라벨 독립 디자인')
  await button('템플릿 저장').click();await field('템플릿명').fill('Codex QA 저장 '+stamp);await page.locator('dialog').getByRole('button',{name:'저장',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});await page.getByRole('status').filter({hasText:'라벨 템플릿을 저장했습니다.'}).waitFor()
  const list=await (await context.request.get(origin+root)).json();assert.equal(list.total,1);saved=await (await context.request.get(origin+root+'/'+list.items[0].id)).json()
  assert.equal(saved.document.paper.id,'formtec-3107');assert.equal(saved.document.labels[0].objects.length,3);assert.equal(saved.document.labels[1].objects.length,3);assert(Object.values(saved.document.images)[0].startsWith('data:image/png;base64,'));assert.equal(saved.document.labels[1].objects[0].text,'두 번째 라벨 독립 디자인')
  await page.reload();await button('템플릿 불러오기').click();await page.locator('.label-template-list li').getByRole('button',{name:'불러오기',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'})
  assert.equal(await page.locator('.label-edit-canvas [data-object-id]').count(),3);assert.equal(await page.locator('.label-edit-canvas image').count(),1)
  // Saving a freshly reloaded design must preserve all stored geometry, images and formatting.
  await button('템플릿 저장').click();await page.locator('dialog').getByRole('button',{name:'저장',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'})
  let loaded=await (await context.request.get(origin+root+'/'+saved.id)).json();assert.deepEqual(loaded.document,saved.document)
  await page.locator('.label-edit-canvas [data-object-id]').first().click();await field('텍스트').fill('수정 후 서버 재조회');await button('템플릿 저장').click();await field('템플릿명').fill('Codex QA 수정 '+stamp);await page.locator('dialog').getByRole('button',{name:'저장',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'})
  loaded=await (await context.request.get(origin+root+'/'+saved.id)).json();assert.equal(loaded.name,'Codex QA 수정 '+stamp);assert.equal(loaded.document.labels[0].objects[0].text,'수정 후 서버 재조회');assert.deepEqual(loaded.document.labels[1],saved.document.labels[1]);saved=loaded
  await button('미리보기·출력').click();const download=page.waitForEvent('download');await button('PDF 다운로드').click();const file=await download;assert(file.suggestedFilename().endsWith('.pdf'));const stream=await file.createReadStream(),chunks=[];for await(const c of stream)chunks.push(c);assert(Buffer.concat(chunks).subarray(0,5).equals(Buffer.from('%PDF-')));await button('편집으로 돌아가기').click()
  assert.equal(await page.getByText(/라벨 템플릿 API 활성화가 필요합니다/).count(),0)
  console.log('PASS actual 5174 UI: Formtec 3107, text/image/barcode, independent copy, save, reload, exact document round-trip, update, PDF and no activation warning')
 }else{
  const document={paper:{id:'formtec-3107',name:'폼텍 3107',width:210,height:297,labelWidth:99.1,labelHeight:33.9,left:4.7,top:14.2,gapX:2.5,gapY:0,columns:2,rows:8},images:{logo:'data:image/png;base64,'+png.toString('base64')},labels:[{objects:[{id:'text',kind:'text',text:'격리 API 검증',x:2,y:2,width:40,height:10},{id:'image',kind:'image',imageId:'logo',x:70,y:2,width:10,height:10},{id:'barcode',kind:'barcode',text:'000123456789',x:2,y:18,width:70,height:12}]}]}
  saved=await (await post(context.request,root,{name:'Codex QA '+stamp,kind:'template',requestId:randomUUID(),document},201)).json()
  const loaded=await (await context.request.get(origin+root+'/'+saved.id)).json();assert.deepEqual(loaded.document,saved.document)
  saved=await (await post(context.request,root+'/'+saved.id,{...saved,name:'Codex QA 수정',requestId:randomUUID()})).json();assert.equal(saved.name,'Codex QA 수정')
 }
 // Separate authenticated tenant cannot list, read, update or archive tenant A's designs.
 assert.equal((await secondary.get(origin+root)).status(),403);assert.equal((await secondary.get(origin+root+'/'+saved.id)).status(),403)
 assert.equal((await secondary.get(origin+`/api/tenants/${b.tenantId}/label-designs/`+saved.id)).status(),404)
 await post(secondary,root+'/'+saved.id,{...saved,requestId:randomUUID()},403);await post(secondary,root+'/'+saved.id+'/archive',{version:saved.version},403)
 const extra=await (await post(context.request,root,{...saved,id:undefined,name:'Codex QA 보존 확인',requestId:randomUUID()},201)).json()
 if(ui){await page.getByRole('button',{name:'템플릿 불러오기',exact:true}).click();const row=page.locator('.label-template-list li').filter({hasText:saved.name});await row.getByRole('button',{name:'이름 변경',exact:true}).click();await page.getByLabel('템플릿명',{exact:true}).fill(saved.name+' 이름 변경');await page.locator('dialog form').getByRole('button',{name:'이름 변경',exact:true}).click();await page.locator('dialog form').waitFor({state:'detached'});const renamed=page.locator('.label-template-list li').filter({hasText:saved.name+' 이름 변경'});await renamed.getByRole('button',{name:'삭제',exact:true}).click();await page.locator('.label-template-confirm').getByRole('button',{name:'삭제',exact:true}).click();await page.locator('.label-template-confirm').waitFor({state:'detached'});await renamed.waitFor({state:'detached'});assert.equal(await page.locator('dialog .dialog-close-icon').count(),0)}
 else await post(context.request,root+'/'+saved.id+'/archive',{version:saved.version})
 assert.equal((await context.request.get(origin+root+'/'+saved.id)).status(),404);assert.equal((await context.request.get(origin+root+'/'+extra.id)).status(),200)
 await post(context.request,root+'/'+extra.id+'/archive',{version:extra.version});assert.equal((await (await context.request.get(origin+root)).json()).total,0)
 await post(context.request,'/api/auth/logout',{},204);await post(secondary,'/api/auth/logout',{},204)
 assert.deepEqual(errors,[]);console.log('PASS real API: persistent read/update/rename/soft-delete, other template unchanged, tenant isolation 403/404; dedicated QA tenants only:',a.tenantId,b.tenantId)
 if(!ui)await writeFile('/private/tmp/ieble-label-activation/qa-api-verified','verified')
} finally {await secondary.dispose();await browser.close()}
