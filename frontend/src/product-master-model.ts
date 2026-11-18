import { barcodeChangeError, barcodeInputValue } from './rack-barcode.ts'
import type { BarcodeChange } from './rack-barcode.ts'
import type { Product } from './product-model'

export type BarcodeDraft = { packageCode?: string; key: string; id?: string; current?: string; change: BarcodeChange; isPrimary: boolean; description: string; barcodeType: 'Internal' | 'External'; isGenerated: boolean }
export function barcodeDrafts(p?: Product): BarcodeDraft[] {
  return (p?.barcodes || []).map(b => ({ packageCode: b.packageCode || 'EA', key: b.id, id: b.id, current: b.value, change: { mode: 'keep' }, isPrimary: b.isPrimary, description: b.description || '', barcodeType: b.barcodeType, isGenerated: b.isGenerated }))
}
export function barcodeRowsError(rows: BarcodeDraft[]) {
  const values = rows.map(r => barcodeInputValue(r.change, r.current))
  if (values.some(v => !v)) return '빈 바코드 행은 값을 입력하거나 삭제해 주세요.'
  if (new Set(values).size !== values.length) return '동일한 바코드를 여러 번 등록할 수 없습니다.'
  return rows.map(r => barcodeChangeError(r.change)).find(Boolean) || null
}
export function barcodePayload(rows: BarcodeDraft[]) { return rows.map(({ id, change, isPrimary, description, barcodeType, packageCode }) => ({ id: id || null, change, isPrimary, description: description || null, barcodeType, packageCode: packageCode || 'EA' })) }
