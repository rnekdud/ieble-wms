import assert from 'node:assert/strict'

export async function checkDateStocktakeLayout(page, visit, root) {
 const number='20261106053551481-CT-8023-VERY-LONG-STOCKTAKE-NUMBER'
 await page.route('**'+root+'/stocktakes?*',route=>route.fulfill({json:{items:[{document:{id:'11111111-1111-1111-1111-111111111111',number,warehouseName:'테스트 창고',name:'2026-11-06 상품 실사',basisAt:'2026-11-06',status:'Counting',scope:'Selected',contactName:'담당자 QA'},productCount:1,targetCount:5}],total:1}}))
 for(const path of ['/app/inventory/counts','/app/receipts','/app/shipments','/app/reports/movements','/app/reports/history']) {
  await visit(path)
  const dates=page.locator('.report-period-dates').first()
  await dates.locator('input').first().waitFor()
  for(const width of [1920,1440,1280,768,390]) {
   await page.setViewportSize({width,height:1000})
   const boxes=await dates.evaluate(e=>[...e.children].map(x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}))
   const [left,sep,right]=boxes
   assert.equal(boxes.length,3,'Inputs and separator must be direct siblings')
   for(const box of boxes)assert(Math.abs(box.y+box.height/2-left.y-left.height/2)<.5,path+' vertical centers '+width+JSON.stringify(boxes))
   assert(Math.abs(left.width-right.width)<.5,path+' equal date widths')
   assert.equal(left.height,40);assert.equal(right.height,40)
   assert(Math.abs(sep.x-left.x-left.width-8)<.5,path+' left gap')
   assert(Math.abs(right.x-sep.x-sep.width-8)<.5,path+' right gap')
   const tabs=await page.locator('.report-period-tabs').first().boundingBox()
   assert(Math.abs(tabs.y-left.y-left.height-8)<.5,path+' tabs below date inputs')
   const form=page.locator('.list-search-filters').first()
   assert(await form.evaluate(e=>e.scrollWidth<=e.clientWidth+1),path+' filter overflow '+width)
   if(path==='/app/inventory/counts') {
    await page.locator('.stocktake-number-cell').waitFor()
    assert.equal(await page.getByRole('button',{name:'전체 재고 실사',exact:true}).count(),0)
    assert.equal(await page.getByRole('button',{name:'실사 등록',exact:true}).count(),1)
    const row=page.locator('.stocktake-simple-list tbody tr').first()
    assert.equal(await row.locator('td').nth(2).innerText(),'1개')
    assert.equal(await row.locator('strong').getAttribute('title'),number)
    const a=await row.locator('strong').boundingBox(),b=await row.locator('small').boundingBox()
    assert(Math.abs(b.y-a.y-a.height-4)<.5,'number and metadata gap')
    assert.equal(await row.locator('small').evaluate(e=>getComputedStyle(e).gap),'6px')
    if(width>=1280) {
     const controls=[page.getByRole('textbox',{name:'실사 검색',exact:true}),page.getByRole('combobox',{name:'실사 상태',exact:true}),form.locator('.searchable-choice-trigger'),form.getByRole('button',{name:'검색',exact:true}),form.getByRole('button',{name:'초기화',exact:true})]
     const fields=await Promise.all(controls.map(e=>e.boundingBox()))
     for(let i=1;i<fields.length;i++){assert.equal(fields[i].height,40);assert(Math.abs(fields[i].y-fields[0].y)<.5,'filter centers');assert(Math.abs(fields[i].x-fields[i-1].x-fields[i-1].width-8)<.5,'filter gap '+JSON.stringify(fields))}
    }
   }
  }
  await page.setViewportSize({width:1440,height:1000})
  await page.locator('.report-period-tabs').first().getByRole('button',{name:'7일',exact:true}).click()
  assert.equal((Date.parse(await dates.locator('input').nth(1).inputValue())-Date.parse(await dates.locator('input').nth(0).inputValue()))/86400000,6)
 }
 await page.setViewportSize({width:1440,height:1000});await visit('/app/inventory/counts')
 const search=page.getByRole('textbox',{name:'실사 검색',exact:true});await search.fill('실사 검색 검증')
 const request=page.waitForRequest(r=>new URL(r.url()).pathname===root+'/stocktakes'&&new URL(r.url()).searchParams.get('search')==='실사 검색 검증')
 await search.press('Enter');assert.equal(new URL((await request).url()).searchParams.get('page'),'1')
 await page.getByRole('button',{name:'초기화',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'필터 초기화'})
 await dialog.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await search.inputValue(),'실사 검색 검증')
 await page.getByRole('button',{name:'초기화',exact:true}).click();await dialog.getByRole('button',{name:'초기화',exact:true}).click();assert.equal(await search.inputValue(),'')
 await page.getByRole('button',{name:'실사 등록',exact:true}).click();await page.getByRole('button',{name:/상품 추가/}).waitFor()
 console.log('PASS: five real pages × five widths; date centers/8px gaps, compact stocktake filters, two-line number, product count, Enter/reset/registration. API uses isolated SQLite; list row is browser-only fixture.')
}
