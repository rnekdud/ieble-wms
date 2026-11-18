import type { Choice } from './receipt-model'
import { quantityError } from './receipt-model.ts'

export type PasteRow = { row: number; name: string; quantity: string; error: string }
export type ImportedProduct = { product: Choice; quantity: string }
export type ProductChoices = { items: Choice[]; total: number; page: number; pageSize: number }
export const pasteLimit = 100
export const pasteTextLimit = 65536

// Excel clipboard cells are tab-delimited; commas remain cell content.
function cellsInLine(line: string): { values: string[]; error: string } {
  const values: string[] = []
  let cell = '', quoted = false, closed = false, error = ''
  const add = () => { values.push(cell.trim()); cell = ''; closed = false }
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') { quoted = false; closed = true }
      else cell += ch
    } else if (ch === '\t') add()
    else if (ch === '"' && !cell.trim() && !closed) { cell = ''; quoted = true }
    else if (closed && ch.trim()) { error = '닫는 따옴표 뒤에는 구분자만 입력하세요.'; cell += ch }
    else cell += ch
  }
  if (quoted) error = '닫히지 않은 따옴표가 있습니다. 상품명은 한 줄로 입력하세요.'
  add()
  return { values, error }
}
export function parseProductPaste(text: string, quantityLabel: string): { rows: PasteRow[]; error: string } {
  if (text.length > pasteTextLimit) return { rows: [], error: '붙여넣기는 65,536자 이내로 입력하세요.' }
  const records = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').map((line, i) => ({ ...cellsInLine(line), row: i + 1 })).filter(record => record.error || record.values.some(Boolean))
  const first = records[0], headers = new Set(['수량', '예정수량', '요청수량', '입고예정수량', '출고요청수량', quantityLabel.replace(/\s/g, '')])
  if (first && !first.error && first.values.length === 2 && first.values[0] === '상품명' && headers.has(first.values[1].replace(/\s/g, ''))) records.shift()
  if (records.length > pasteLimit) return { rows: [], error: '한 번에 최대 100행까지 붙여넣을 수 있습니다.' }
  return { rows: records.map(({ values, row, error: parsingError }) => {
    const [name = '', original = ''] = values
    const quantity = /^\d{1,3}(,\d{3})+(\.\d{1,3})?$/.test(original) ? original.replaceAll(',', '') : original
    let error = parsingError
    if (!error && values.length !== 2) error = `상품명·${quantityLabel} 2개 열을 Excel에서 복사해 붙여넣으세요.`
    else if (!error && (!name || name.length > 200 || [...name].some(ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127))) error = '상품명은 1~200자로 입력하세요. 줄바꿈·탭은 사용할 수 없습니다.'
    else if (!error && quantityError(quantity)) error = `${quantityLabel}은 0보다 크고 999999999.999 이하, 소수점 3자리 이내로 입력하세요.`
    return { row, name, quantity, error }
  }), error: '' }
}
export const productMatchKey = (row: Pick<PasteRow, 'name'>) => row.name
export function productMatchUrl(endpoint: string, row: Pick<PasteRow, 'name'>, page = 1) {
  return `${endpoint}/choices?${new URLSearchParams({ kind: 'products', exactName: row.name, page: String(page) })}`
}
export function exactProduct(row: Pick<PasteRow, 'name'>, product: Choice | undefined) { return !!product && product.name === row.name }
const countUnits = new Set(['EA', 'PCS', 'SET', 'PAIR', 'DOZEN', 'BOX', 'PACK', 'CTN', 'PALLET', 'ROLL', 'BAG', 'BUNDLE'])
export function pastedQuantityError(quantity: string, product: Choice) {
  if (!product.unit) return '상품의 기준 단위가 없습니다. 상품 정보를 확인하세요.'
  if (quantityError(quantity)) return '수량은 양수이며 소수점 3자리 이내여야 합니다.'
  if (countUnits.has(product.unit) && !Number.isInteger(Number(quantity))) return `${product.unit} 단위는 정수 수량을 입력하세요.`
  return ''
}
export type DocumentProductLine = { product?: Choice; quantity: string; lot: string; expiry: string; serialText: string; placements?: unknown[]; lineId?: string }
export function emptyProductPlaceholder<T extends DocumentProductLine>(lines: T[]) {
  return lines.length === 1 && !lines[0].product && !lines[0].quantity && !lines[0].lot && !lines[0].expiry && !lines[0].serialText && !lines[0].placements?.length && !lines[0].lineId
}
export function appendImportedProducts<T extends DocumentProductLine>(lines: T[], imported: ImportedProduct[], createLine: () => T): T[] {
  if (!imported.length) throw new Error('추가할 상품을 선택해 주세요.')
  return [...(emptyProductPlaceholder(lines) ? [] : lines), ...imported.map(({ product, quantity }) => ({ ...createLine(), product, quantity }))]
}
