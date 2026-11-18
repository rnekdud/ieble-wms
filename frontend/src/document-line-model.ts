import type { Choice } from './receipt-model'
import { quantityError, splitSerials, trackingError } from './receipt-model.ts'
import { pastedQuantityError } from './document-paste.ts'
import type { SelectionProduct } from './product-selection-model'

export type DocumentEditLine = { key: string; product?: Choice; quantity: string; lot: string; expiry: string; serialText: string }
export function lineQuantityError(line: DocumentEditLine, zero = false) {
  if (!line.product) return '상품을 확인해 주세요.'
  if (zero && Number(line.quantity) === 0 && !quantityError(line.quantity, true)) return ''
  return pastedQuantityError(line.quantity, line.product)
}
export function lineTrackingError(line: DocumentEditLine, lines: DocumentEditLine[]) {
  if (!line.product) return '상품을 확인해 주세요.'
  const serialError = serialTextError(line.serialText)
  if (serialError) return serialError
  const error = trackingError(line.product, Number(line.quantity), line.lot, line.expiry, line.serialText)
  if (error) return error
  const serials = new Set(splitSerials(line.serialText))
  if (lines.some(other => other.key !== line.key && other.product?.id === line.product?.id && splitSerials(other.serialText).some(s => serials.has(s)))) return '같은 상품의 다른 행에 중복된 시리얼이 있습니다.'
  return ''
}
export function shipmentLineError(line: DocumentEditLine, lines: DocumentEditLine[], stock?: SelectionProduct) {
  const issue = lineQuantityError(line) || lineTrackingError(line, lines)
  if (issue) return issue
  if (!stock || stock.requestable == null) return '출고 가능 재고를 조회해 주세요.'
  if (line.product?.unit !== stock.unit) return '상품 기준 단위가 변경되었습니다. 상품을 다시 추가하세요.'
  const same = lines.filter(l => l.product?.id === line.product?.id && l.product?.unit === line.product?.unit)
  const total = Math.round(same.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0) * 1000) / 1000
  if (total > stock.requestable) return `동일 상품 합계 ${total} ${stock.unit} · 예약 가능 ${stock.requestable} ${stock.unit} 초과`
  return ''
}
export function serialTextError(text: string) {
  const serials = splitSerials(text)
  if (serials.length > 1000 || serials.some(s => s.length > 100 || [...s].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) || new Set(serials).size !== serials.length) return '시리얼은 1,000개 이하로 입력하고 형식·중복을 확인해 주세요.'
  return ''
}
