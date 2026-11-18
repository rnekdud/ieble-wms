import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendImportedProducts, exactProduct, parseProductPaste, pastedQuantityError, productMatchUrl } from '../src/document-paste.ts'
const product = { id: 'p1', name: '사탕', code: 'CANDY', unit: 'EA', lotManaged: true, expiryManaged: true, serialManaged: false }
const blank = () => ({ key: crypto.randomUUID(), product: undefined, quantity: '', lot: '', expiry: '', serialText: '', placements: [] })
const parse = text => parseProductPaste(text, '예정 수량')
test('Excel TSV headers, BOM, Windows/macOS newlines, empty lines and repeated rows', () => {
  for (const header of ['수량', '예정 수량', '요청 수량', '입고 예정 수량', '출고 요청 수량']) for (const separator of ['\t']) for (const newline of ['\n', '\r\n', '\r']) {
    const result = parse(`\uFEFF\n상품명${separator}${header}${newline} 사탕 ${separator}20${newline}${newline}사탕${separator}2`)
    assert.equal(result.error, ''); assert.deepEqual(result.rows.map(r => [r.name, r.quantity, r.error]), [['사탕', '20', ''], ['사탕', '2', '']])
  }
})
test('Excel quoted cells preserve commas in names and formatted thousands quantities', () => {
  const result = parse('"특별, ""사탕"""\t20\n중량  상품\t1,234.125\n사탕\t"1,000"')
  assert.deepEqual(result.rows.map(r => [r.name, r.quantity, r.error]), [['특별, "사탕"', '20', ''], ['중량  상품', '1234.125', ''], ['사탕', '1000', '']])
})
test('comma-delimited text and malformed rows are rejected without losing valid Excel rows', () => {
  for (const invalid of ['사탕,20', '"사탕",20', '상품명,수량', '사탕,1,000', '"사탕\t1', '"사탕"bad\t1', '사탕\tEA\t1', '\t1', '사탕\t', '사탕']) {
    const result = parse(invalid + '\n사탕\t2'); assert.equal(result.error, ''); assert.ok(result.rows[0].error, invalid); assert.equal(result.rows[1].error, '')
  }
})
test('invalid quantities, formulas, precision, column and length limits are blocked', () => {
  for (const q of ['0', '-1', '1e3', '=SUM(A1:A2)', '1.0001', '1000000000', '', '1,00']) assert.ok(parse(`사탕\t${q}`).rows[0].error, q)
  assert.equal(parse('사탕\t999999999.999').rows[0].error, '')
  assert.ok(parse(Array(101).fill('사탕\t1').join('\n')).error); assert.ok(parse('a'.repeat(65537)).error)
  assert.equal(parse('\t\n\n\r').rows.length, 0)
})
test('exact name match includes different base units and preserves server pagination', () => {
  assert.equal(exactProduct({ name: '사탕' }, product), true)
  assert.equal(exactProduct({ name: '사탕' }, { ...product, id:'p2', unit:'kg' }), true)
  assert.equal(exactProduct({ name: '사' }, product), false)
  const url = new URL(productMatchUrl('/api/tenants/t/receipts', { name: '사탕 & 젤리' }, 2), 'http://localhost')
  assert.equal(url.searchParams.get('exactName'), '사탕 & 젤리'); assert.equal(url.searchParams.get('page'), '2'); assert.equal(url.searchParams.has('exactUnit'), false)
})
test('selected product defines unit validation; count units require integers', () => {
  for (const unit of ['EA','PCS','BOX','PACK']) { assert.match(pastedQuantityError('5.5', {...product,unit}), /정수/); assert.equal(pastedQuantityError('5.000', {...product,unit}), '') }
  for (const unit of ['kg','g','L']) assert.equal(pastedQuantityError('5.501', {...product,unit}), '')
  assert.ok(pastedQuantityError('5.5', {...product,unit:undefined})); assert.ok(pastedQuantityError('5.0001', {...product,unit:'kg'}))
})
test('append preserves original tracking and historical unit, applies new unit, keeps repeated products separate', () => {
  const updated = {...product,unit:'kg'}, items = [{ product:updated, quantity: '20' }, { product:updated, quantity: '3.5' }]
  const imported = appendImportedProducts([blank()], items, blank)
  assert.equal(imported.length, 2); assert.equal(imported[0].product.id, 'p1'); assert.equal(imported[0].product.unit, 'kg')
  assert.notEqual(imported[0].key, imported[1].key); assert.deepEqual(imported[0].placements, [])
  const original = { ...blank(), product, quantity: '5', lot: 'LOT-A', expiry: '2027-01-01', serialText: 'SN1' }
  const combined = appendImportedProducts([original], items, blank)
  assert.equal(combined[0], original); assert.equal(combined[0].product.unit,'EA'); assert.equal(combined.length, 3)
  const partial = { ...blank(), quantity: '2' }; assert.equal(appendImportedProducts([partial], items, blank)[0], partial)
  assert.equal(appendImportedProducts(Array(100).fill(original), items, blank).length, 102)
  assert.equal(appendImportedProducts([original], Array(205).fill(items[0]), blank).length, 206)
  assert.throws(() => appendImportedProducts([original], [], blank), /선택/)
})
