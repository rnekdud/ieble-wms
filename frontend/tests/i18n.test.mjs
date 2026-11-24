import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { t, getLanguage, getLocale, setLanguage, subscribeLanguage } from '../src/i18n.ts'
const ko=JSON.parse(fs.readFileSync(new URL('../src/locales/ko/common.json',import.meta.url)))
const en=JSON.parse(fs.readFileSync(new URL('../src/locales/en/common.json',import.meta.url)))
test('catalogs cover the same keys and preserve interpolation variables',()=>{
 assert.deepEqual(Object.keys(ko).sort(),Object.keys(en).sort())
 for(const [key,value]of Object.entries(en)){
  assert(value.trim(),key)
  assert.deepEqual((key.match(/\{v\d+\}/g)||[]).sort(),(value.match(/\{v\d+\}/g)||[]).sort(),key)
  assert(!/[가-힣]/.test(value),'Untranslated resource: '+key)
 }
})
test('Korean default, English persistence, subscriptions and Korean fallback',async()=>{
 assert.equal(getLanguage(),'ko');assert.equal(t('저장'),'저장')
 const values=new Map;globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}
 let notified=0;const unsubscribe=subscribeLanguage(()=>notified++)
 setLanguage('en');assert.equal(t('저장'),'Save');assert.equal(getLocale(),'en-US');assert.equal(values.get('ieble-wms.language'),'en')
 assert.equal(t('번역이 없는 안내'),'번역이 없는 안내')
 const reloaded=await import('../src/i18n.ts?reload');assert.equal(reloaded.getLanguage(),'en')
 setLanguage('ko');assert.equal(t('문장\n\n 원본'),'문장\n\n 원본');assert.equal(getLocale(),'ko-KR')
 unsubscribe();setLanguage('ko');assert.equal(notified,2);delete globalThis.localStorage
})
test('UI template interpolation preserves business data, punctuation and braces',()=>{
 setLanguage('en')
 assert.equal(t('이미 {v0}({v1}) 상품에 사용 중인 상품코드입니다.',{v0:'입고 {v1}',v1:'PR06'}),'This product code is already used by 입고 {v1} (PR06).')
 assert.equal(t('이미 메로나(PR06) 상품에 사용 중인 상품코드입니다.'),'This product code is already used by 메로나 (PR06).')
 assert.equal(t('비밀번호는 최소 8자 이상 입력해 주세요.'),'Please enter at least 8 characters for your password.')
 assert.equal(t('현재 기업에서 이미 사용 중인 상품코드입니다.'),'This product code is already in use in the current company.')
 setLanguage('ko')
})
test('language remains usable if device storage is blocked',()=>{
 globalThis.localStorage={setItem(){throw Error('blocked')}};setLanguage('en');assert.equal(getLanguage(),'en');delete globalThis.localStorage;setLanguage('ko')
})

test('every literal translation call has a matching Korean and English resource', async () => {
  const {default:ts}=await import('typescript')
  const fs=await import('node:fs'), path=await import('node:path')
  const root=new URL('../src/',import.meta.url), ko=JSON.parse(fs.readFileSync(new URL('locales/ko/common.json',root),'utf8')), en=JSON.parse(fs.readFileSync(new URL('locales/en/common.json',root),'utf8'))
  const missing=[]
  function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())scan(p);else if(/\.tsx?$/.test(p)){const sf=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),99,true,p.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);const walk=n=>{if(ts.isCallExpression(n)&&/^(uiText|t)$/.test(n.expression.getText(sf))&&n.arguments[0]&&(ts.isStringLiteral(n.arguments[0])||ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))){const key=n.arguments[0].text.replace(/\s+/g,' ').trim();if(/[가-힣]/.test(key)&&(!Object.hasOwn(ko,key)||!Object.hasOwn(en,key)))missing.push(path.basename(p)+': '+key)}ts.forEachChild(n,walk)};walk(sf)}}}
  scan(root.pathname);assert.deepEqual(missing,[])
})

test('packaging, quantities and risk summaries localize without changing units or calculations', async () => {
 const {barcodePackageSummary,barcodePackageError,packageFactors}=await import('../src/product-packaging.ts')
 const {rackQuantitySummary}=await import('../src/dashboard-rack-label.ts')
 const {stocktakeDifferenceLabel}=await import('../src/stocktake-model.ts')
 const {conciseRiskReasons}=await import('../src/warehouse-risk.ts')
 const p={unit:'EA',innerPackQuantity:5,outerPackQuantity:2,outerPackUnit:'INNER',palletPackQuantity:3}
 const factors=packageFactors(p);setLanguage('en')
 try {
  assert.equal(barcodePackageSummary(p,'OUTER'),'Outer box · 10 EA')
  assert(!/[가-힣]/.test(t(barcodePackageError({unit:'EA'},'EA','INNER'))))
  assert.equal(rackQuantitySummary([{rackId:'r1',unit:'EA',quantity:10}],1),'Total 10 items')
  assert(!/[가-힣]/.test(stocktakeDifferenceLabel(5,10,'EA')))
  const reasons=conciseRiskReasons({status:'warning',unit:'EA',reasons:['안전재고 부족'],safetyStock:10,currentQuantity:5,reservedQuantity:2,expectedQuantity:3,shortageQuantity:7},'2026-11-20')
  assert(!/[가-힣]/.test(reasons.join(' ')),reasons.join(' '));assert.deepEqual(packageFactors(p),factors)
 } finally {setLanguage('ko')}
 assert.equal(barcodePackageSummary(p,'OUTER'),'아웃박스 · 10 EA')
})
