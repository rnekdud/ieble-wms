import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const origin = process.env.WMS_UI_ORIGIN || 'http://127.0.0.1:5176'
const errors = [], requests = []
const browser = await chromium.launch({ channel:'chrome', headless:true })
try {
  const context = await browser.newContext({ serviceWorkers:'block' })
  await context.routeWebSocket(origin.replace('http:','ws:')+'/**',()=>{})
  await context.route('**/*', route => {
    const req = route.request(), u = new URL(req.url())
    assert.equal(u.origin, origin)
    if (u.pathname === '/__page-header') return route.fulfill({ contentType:'text/html', body:'<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/page-header-ui.tsx"></script></html>' })
    if (!u.pathname.startsWith('/api/')) return route.continue()
    requests.push(req.method()); assert.equal(req.method(), 'GET', 'Header checks must never write business data')
    if (u.pathname === '/api/admin/overview') return route.fulfill({ json:{ tenantCount:0,activeTenantCount:0,activeUserCount:0,newTenantCount:0,inquiryCount:0,pendingInquiryCount:0 } })
    if (u.pathname.endsWith('/dashboard/warehouses')) return route.fulfill({ json:{ warehouses:[],asOf:new Date().toISOString() } })
    if (u.pathname.endsWith('/warehouses/w1')) return route.fulfill({ json:{ warehouse:{id:'w1',code:'WH01',name:'QA 창고',isActive:true,version:'1'},zones:[],racks:[],locationCount:0 } })
    if (u.pathname.endsWith('/warehouses')) return route.fulfill({ json:{ items:[],total:0,page:1,pageSize:20 } })
    throw new Error('Unexpected API: '+u.pathname)
  })
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message))
  if(process.env.WMS_REQUIRED_NOTICE){
    for(const width of [360,390,768,1440]){
      await page.setViewportSize({width,height:1000})
      for(const form of ['product-registration','receipt-registration','shipment-registration']){
        await page.goto(`${origin}/__page-header?kind=registration&form=${form}`)
        await page.getByRole('heading',{level:1}).waitFor()
        assert.equal(await page.getByText('* 필수 입력',{exact:true}).count(),0)
        assert.equal(await page.locator('.registration-intro').count(),form==='product-registration'?0:1)
        assert.equal(await page.getByRole('alert').innerText(),'필수 값을 확인해 주세요.')
        assert.equal(await page.locator('.registration-header-actions').getByRole('button',{name:'취소',exact:true}).count(),0)
        await page.getByRole('button',{name:'뒤로가기',exact:true}).click()
        assert.equal(await page.locator('html').getAttribute('data-action'),'done')
      }
      await page.goto(`${origin}/__page-header?kind=warehouse-new`)
      await page.getByRole('textbox',{name:'창고명',exact:true}).waitFor()
      assert.equal(await page.getByText('* 필수 입력',{exact:true}).count(),0)
      assert(await page.getByRole('textbox',{name:'창고명',exact:true}).evaluate(e=>e.required))
      assert(await page.locator('.form-required-mark').count()>0)
      console.log(`PASS ${width}px: no required-entry notice, no empty wrapper, field requirements retained`)
    }
    assert.deepEqual(errors,[])
  } else {
  const kinds = ['list','registration','detail','warehouse-new','warehouse-detail','dashboard','admin']
  for (const width of [1920,1440,1280,768,390]) {
    await page.setViewportSize({width,height:1000})
    for (const kind of kinds) {
      await page.goto(`${origin}/__page-header?kind=${kind}${kind === 'warehouse-detail' ? '&warehouseId=w1' : ''}`)
      const header = page.locator('.wms-page-header').first(), title = header.locator('h1,h2').first()
      await title.waitFor(); await page.evaluate(() => document.fonts.ready)
      const crumb = await page.locator('.wms-breadcrumb').boundingBox(), box = await title.boundingBox()
      assert(Math.abs(box.y - crumb.y - crumb.height - 5) < .6, `${width} ${kind}: gap ${box.y-crumb.y-crumb.height}; ${await title.evaluate(e=>{const a=[];for(let p=e;p&&p.tagName!=="BODY";p=p.parentElement){const s=getComputedStyle(p);a.push([p.className,p.getBoundingClientRect().y,s.marginTop,s.paddingTop,s.alignItems,s.height,s.display])}return JSON.stringify(a)})}`)
      assert.equal(await page.getByText('제거 대상 일반 페이지 소개',{exact:true}).count(),0)
      assert.equal(await page.getByText('일반 페이지 소개',{exact:true}).count(),0)
      assert.equal(await header.locator('p').count(),0)
      assert(await header.evaluate(e => e.scrollWidth <= e.clientWidth+1), `${kind}: header overflow`)
      for (const button of await header.locator('button').all()) {
        if (!await button.isVisible()) continue
        const b = await button.boundingBox()
        assert(b.x >= 0 && b.x+b.width <= width+1, `${kind}: action outside viewport`)
        assert(!(b.x < box.x+box.width && b.x+b.width > box.x && b.y < box.y+box.height && b.y+b.height > box.y), `${kind}: title/action overlap`)
      }
      if (['list','registration','detail'].includes(kind)) {
        await page.getByLabel('본문 검색').fill('검색 유지')
        assert.equal(await page.getByRole('alert').innerText(),'필수 값을 확인해 주세요.')
        assert.equal(await page.getByRole('status').innerText(),'미저장 변경사항이 있습니다.')
      }
      if (kind === 'registration') { assert.equal(await page.getByText('* 필수 입력',{exact:true}).count(),0); assert.equal(await page.getByText('새 문서 작성',{exact:true}).count(),0) }
      if (kind === 'detail') { assert(await page.getByText('IN01',{exact:true}).isVisible()); await page.getByRole('button',{name:'검수 시작',exact:true}).click(); assert.equal(await page.locator('html').getAttribute('data-action'),'done') }
    }
    console.log(`PASS ${width}px: 5px breadcrumb gap, seven header variants, actions, notices and overflow`)
  }
  for (const title of ['창고관리','상품관리','바코드 조회','입고관리','출고관리','재고 현황','재고 이동 및 조정','재고 실사/조사','거래처관리','입출고 통계','재고 변동 이력','조직도','구성원 관리','항목 관리','기업 관리','권한 설정','요금제 및 결제 관리','문의하기']) {
    await page.goto(`${origin}/__page-header?title=${encodeURIComponent(title)}`)
    await page.getByRole('heading',{level:1,name:title,exact:true}).waitFor()
    assert.equal(await page.locator('.wms-page-heading p,.wms-page-heading .eyebrow').count(),0)
  }
  for (const [form,notice] of [['receipt-registration','실제 재고는 입고 최종 확정 시 반영됩니다.'],['shipment-registration','등록 시 재고를 예약하며, 출고 확정 시 실제 재고가 차감됩니다.']]) {
    await page.goto(`${origin}/__page-header?kind=registration&form=${form}&code=IN01`)
    await page.getByText(notice,{exact:false}).waitFor(); assert.equal(await page.getByText('* 필수 입력',{exact:true}).count(),0); assert(await page.getByText('IN01',{exact:true}).isVisible())
  }
  await page.goto(`${origin}/__page-header?kind=dialog`)
  await page.getByRole('dialog').getByText('확정하면 재고에 반영됩니다.',{exact:true}).waitFor()
  assert.deepEqual(errors,[])
  console.log(`PASS shared headings, document IDs, required/safety guidance and dialog descriptions preserved; ${requests.length} mocked GETs, no business writes`)
  }
} finally { await browser.close() }
