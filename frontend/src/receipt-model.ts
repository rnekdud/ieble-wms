import { eachQuantityError } from './quantity-input.ts'
export const receiptStatuses = { Planned: '입고 예정', Inspecting: '검수 중', Confirmed: '입고 확정', Cancelled: '취소' } as const
export type Choice = { email?: string | null; rackPhysical?: number | null; rackAvailable?: number | null; rackRequestable?: number | null; ownReserved?: number | null; retailPrice?: number | null; currency?: string | null; rackId?: string | null; rackName?: string | null; rackCode?: string | null; customCode?: string | null; barcode?: string | null; level?: number | null; bay?: number | null; expiryDate?: string | null; quantity?: number | null; reservedQuantity?: number | null; availableQuantity?: number | null; modelNumber?: string | null; id: string; code: string; name: string; unit: string | null; lotManaged: boolean; expiryManaged: boolean; serialManaged: boolean }
export type TrackingAllocation = { id: string; lotNumber: string | null; expiryDate: string | null; quantity: number; serials: string[] }
export type Placement = { trackingId?: string | null; locationCode?: string; locationId: string; quantity: number; serials: string[] }
export type ReceiptLine = { trackingAllocations?: TrackingAllocation[] | null; placementTrackingId?: string | null; plannedRackId?: string | null; plannedRackName?: string | null; plannedRackCode?: string | null; retailPrice?: number | null; currency?: string | null; id: string; productId: string; productCode: string; productName: string; unit: string; lotManaged: boolean; expiryManaged: boolean; serialManaged: boolean; expectedQuantity: number; inspectedQuantity: number | null; lotNumber: string | null; expiryDate: string | null; serials: string[]; placements: Placement[] }
export type Receipt = { id: string; number: string; expectedDate: string; partnerId: string; partnerName: string; warehouseId: string; warehouseName: string; contactUserId?: string | null; contactName: string; notes: string | null; status: keyof typeof receiptStatuses; version: string; createdAt: string; inspectedAt: string | null; confirmedAt: string | null; inspectedByUserId: string | null; confirmedByUserId: string | null }
export type ReceiptDetail = { receipt: Receipt; lines: ReceiptLine[] }
export type ReceiptList = { items: { receipt: Receipt; productCount: number; totals: { unit: string; quantity: number }[] }[]; page: number; pageSize: number; total: number }
export const splitSerials = (text: string) => text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
export function quantityError(value: string, zero = false) {
  return !/^\d+(\.\d{1,3})?$/.test(value) || Number(value) < (zero ? 0 : 0.001) || Number(value) > 999999999.999
}
export function trackingError(_p: Pick<ReceiptLine, 'lotManaged' | 'expiryManaged' | 'serialManaged'>, qty: number, lot: string, expiry: string, text: string) {
  const serials = splitSerials(text)
  if (lot.length > 100 || [...lot].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return 'LOT 형식을 확인해 주세요.'
  if (expiry && (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || Number.isNaN(Date.parse(expiry)))) return '유통기한을 확인해 주세요.'
  if (serials.length > 0 && (!Number.isInteger(qty) || serials.length !== qty)) return '시리얼 개수와 수량이 일치해야 합니다.'
  if (serials.some(s => s.length > 100) || new Set(serials).size !== serials.length) return '시리얼 형식 또는 중복을 확인해 주세요.'
  return null
}
export function unitTotals(lines: { unit: string; quantity: number }[]) {
  const totals: Record<string, number> = {}
  for (const line of lines) totals[line.unit] = Math.round(((totals[line.unit] || 0) + line.quantity) * 1000) / 1000
  return Object.entries(totals).map(([unit, quantity]) => `${quantity.toLocaleString('ko-KR')} ${unit}`).join(' · ')
}

/** Integer thousandths avoid cancellation/rounding errors across split placements. */
export function placementComparison(inspected: number, quantities: string[], unit: string) {
  const valid = quantities.every(q => !quantityError(q) && !eachQuantityError(q, unit))
  const placed = quantities.reduce((sum, q) => sum + (quantityError(q) ? 0 : Math.round(Number(q) * 1000)), 0)
  const difference = (placed - Math.round(inspected * 1000)) / 1000
  const amount = Math.abs(difference).toLocaleString('ko-KR', { maximumFractionDigits: 3 })
  return { placed: placed / 1000, difference, valid, status: !valid ? 'invalid' : difference > 0 ? 'over' : difference < 0 ? 'under' : 'matched',
    message: !valid && quantities.some(q => eachQuantityError(q, unit)) ? '개(EA) 배치 수량은 정수로 입력해 주세요.' : !valid ? '배치 수량은 0보다 큰 숫자, 소수점 3자리 이내로 입력해 주세요.' : difference > 0 ? `검수 수량보다 배치 수량이 ${amount} ${unit} 초과되었습니다.` : difference < 0 ? `검수 수량보다 배치 수량이 ${amount} ${unit} 부족합니다.` : '검수 수량과 배치 수량이 일치합니다.' }
}
export function receiptPlacementReady(lines: ReceiptLine[]) {
  return lines.length > 0 && lines.some(l => (l.inspectedQuantity || 0) > 0) && lines.every(l => l.inspectedQuantity != null && placementComparison(l.inspectedQuantity, l.placements.map(p => String(p.quantity)), l.unit).status === 'matched' && l.placements.every(p => !!p.locationId))
}
export function retailAmount(price: number | null | undefined, currency = 'KRW') {
  return price == null || !Number.isFinite(price) ? '—' : `${price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${currency === 'KRW' ? '원' : currency}`
}
export function receiptRetailTotals(lines: { product?: Choice; quantity: string }[]) {
  const totals = new Map<string, number>()
  let missing = 0
  for (const line of lines) {
    if (line.product?.retailPrice == null || quantityError(line.quantity)) { missing++; continue }
    const currency = line.product.currency || 'KRW'
    totals.set(currency, (totals.get(currency) || 0) + line.product.retailPrice * Number(line.quantity))
  }
  return { amount: [...totals].map(([currency, value]) => retailAmount(value, currency)).join(' · ') || '—', missing }
}
