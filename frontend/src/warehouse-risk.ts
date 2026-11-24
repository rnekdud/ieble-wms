import { getLocale, t as uiText } from './i18n.ts'
import type { OverviewRow } from './stock-overview-model'
export type RiskState = 'safe' | 'warning' | 'danger' | 'review' | 'empty'
export const riskStates: Record<RiskState, { label: string; fill: string }> = {
  safe: { label: '안전', fill: '#cce9d9' }, warning: { label: '주의', fill: '#ffe2a0' },
  danger: { label: '위험', fill: '#f5b8b6' }, review: { label: '확인 필요', fill: '#dce2eb' }, empty: { label: '비어 있음', fill: '#eef1f3' },
}
export type RiskProduct = { productId: string; productCode: string; productName: string; unit: string; status: RiskState; currentQuantity: number; reservedQuantity: number; expectedQuantity: number; safetyStock: number | null; shortageQuantity: number | null; rackQuantity: number; rackReservedQuantity: number; reasons: string[]; inventoryStatus?: RiskState; inventoryReasons?: string[]; earliestExpiry: string | null; reservations: { date: string; quantity: number }[]; moreReservationDates: number }
export type RiskRack = { id: string; status: RiskState; needsReview: boolean; issueCount: number; preview: RiskProduct[]; hoverGroups?: RiskHoverGroup[] }
export type RiskExpiry = { productId: string; productCode: string; productName: string; locationId: string; locationCode: string; lotNumber: string | null; serialNumber: string | null; expiryDate: string; quantity: number; unit: string; remainingDays: number; status: RiskState }
export type RiskSnapshot = { lowProducts: number; expiryProducts: number; today: string; access: { receipts: boolean; shipments: boolean }; todayReceipts: number | null; todayShipments: number | null; counts: Record<RiskState, number>; racks: RiskRack[]; detail: null | { rackId: string; stockProducts: RiskProduct[]; items: RiskProduct[]; total: number; page: number; pageSize: number; expiry: { items: RiskExpiry[]; total: number; page: number; pageSize: number } } }
export const riskNumber = (value: number) => value.toLocaleString(getLocale(), { maximumFractionDigits: 3 })
export function reservationDay(date: string, today: string) {
  const days = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
  return days === 0 ? uiText('오늘') : days === 1 ? uiText('내일') : days < 0 ? uiText('{v0} (예정일 경과)', {v0:date}) : date
}
export function popoverPosition(x: number, y: number, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const left = x + 16 + width <= viewportWidth - 8 ? x + 16 : x - width - 16
  const top = y + 16 + height <= viewportHeight - 8 ? y + 16 : y - height - 16
  return { left: Math.max(8, Math.min(left, viewportWidth - width - 8)), top: Math.max(8, Math.min(top, viewportHeight - height - 8)) }
}

/** Keep rack-wide expiry warnings out of a location/LOT row. Operational date comes from the server. */
export function locationRisk(product: RiskProduct, row: OverviewRow, today: string): RiskProduct {
  const reasons = [...(product.inventoryReasons ?? ['재고 상태를 갱신해 주세요.'])]
  const inventoryStatus = product.inventoryStatus ?? 'review'
  let expiryStatus: RiskState = 'safe'
  if (row.quantity > 0 && row.expiryDate) {
    if (row.hasExpired) { expiryStatus = 'danger'; reasons.push('유통기한 경과 재고 있음') }
    else if (row.hasExpiring) {
      expiryStatus = 'warning'
      const days = Math.round((Date.parse(row.expiryDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
      reasons.push(days === 0 ? '오늘 유통기한 만료' : `유통기한 ${days}일 남음`)
    }
  }
  const priority: Record<RiskState, number> = { empty:0, safe:1, review:2, warning:3, danger:4 }
  return { ...product, status: priority[expiryStatus] > priority[inventoryStatus] ? expiryStatus : inventoryStatus,
    reasons, earliestExpiry: row.expiryDate, rackQuantity: row.quantity, rackReservedQuantity: row.reservedQuantity }
}

export type RiskHoverGroup = { status: 'danger' | 'warning'; total: number; products: { productId: string; productName: string }[] }
export function rackHoverGroups(rack: RiskRack): RiskHoverGroup[] {
  if (rack.hoverGroups) return rack.hoverGroups
  // Compatibility for an older response during an API refresh; never invent missing counts.
  const unique = new Map<string, RiskProduct>()
  for (const product of rack.preview) {
    const previous = unique.get(product.productId)
    if (!previous || product.status === 'danger') unique.set(product.productId, product)
  }
  return (['danger', 'warning'] as const).map(status => {
    const products = [...unique.values()].filter(p => p.status === status)
    return { status, total: products.length, products: products.slice(0, 3) }
  })
}

/** Presentation only: reasons and status still come from the existing risk policy. */
export function conciseRiskReasons(p: RiskProduct, today: string): string[] {
  if (p.status === 'safe' || p.status === 'empty') return []
  const unit = p.unit === 'EA' ? uiText('개') : ` ${p.unit}`
  const quantity = (value: number) => `${riskNumber(value)}${unit}`
  return [...new Set(p.reasons.map(reason => {
    if (reason.includes('유통기한') && p.earliestExpiry) {
      const days = Math.round((Date.parse(p.earliestExpiry + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
      if (Number.isFinite(days)) return uiText('유통기한 {v0} · {v1}', {v0:p.earliestExpiry,v1:days < 0 ? uiText('{v0}일 경과',{v0:-days}) : days === 0 ? uiText('오늘 만료') : uiText('{v0}일 남음',{v0:days})})
    }
    if (reason.includes('안전재고') && p.safetyStock != null && !reason.includes('비교 제외')) {
      const base = uiText('안전재고 {v0} / 현재고 {v1}', {v0:quantity(p.safetyStock),v1:quantity(p.currentQuantity)})
      const reserved = p.reservedQuantity > 0 ? uiText(' · 예약 {v0} / 출고 후 예상 {v1}', {v0:quantity(p.reservedQuantity),v1:quantity(p.expectedQuantity)}) : ''
      const shortage = p.shortageQuantity != null && p.shortageQuantity > 0 ? ` · ${quantity(p.shortageQuantity)} ${p.reservedQuantity > 0 ? uiText('부족 예상') : uiText('부족')}` : uiText(' · 안전재고 근접')
      return base + reserved + shortage
    }
    if (reason.includes('예약량과 활성 출고')) return uiText('예약량·출고 배정량 불일치')
    if (reason.includes('사용 중지')) return uiText('사용 중지 상품')
    return uiText(reason)
  }))]
}
