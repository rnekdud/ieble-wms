import { getLocale } from './i18n.ts'
import type { ShipmentDetail, StockResult } from './shipment-model.ts'
export type PickingLocation = { id: string; name: string; code: string; rackId?: string | null; level?: number | null; bay?: number | null }
export type PickingRack = { rack: { id: string; code: string; name: string }; warehouseName?: string; zoneName?: string | null; locations: { location: PickingLocation; effectiveActive: boolean }[] }
export type PickingItem = { id: string; productId: string; productName: string; productCode: string; unit: string; rackId?: string | null; rackLabel: string; locationId?: string; locationLabel: string; locationCode: string; zoneName: string; quantity: number; picked: number; remaining: number; available: number | null; lot: string | null; expiry: string | null; serial: string | null; issue: string }
export function pickingTargets(detail: ShipmentDetail, stocks: Record<string, StockResult['items'] | undefined>, racks: Record<string, PickingRack | undefined>) {
  const items: PickingItem[] = [], issues: string[] = []
  const own = new Map<string, number>()
  for (const a of detail.allocations) if (a.state === 'Active') own.set(a.stockId, (own.get(a.stockId) || 0) + a.quantity)
  for (const a of detail.allocations) {
    const line = detail.lines.find(l => l.id === a.lineId)
    if (!line) { issues.push('상품 정보가 없는 예약 행이 있습니다. 출고 문서를 다시 확인해 주세요.'); continue }
    const remaining = Math.max(0, Math.round((a.quantity - a.pickedQuantity) * 1000) / 1000), rack = a.rackId ? racks[a.rackId] : undefined
    const position = rack?.locations.find(l => l.location.id === a.locationId), location = position?.location
    const stock = stocks[line.productId]?.find(s => s.id === a.stockId)
    let issue = ''
    if (remaining > 0) {
      if (a.state !== 'Active') issue = '유효한 예약이 아닙니다.'
      else if (a.warehouseId !== detail.shipment.warehouseId) issue = '출고 창고와 예약 창고가 다릅니다.'
      else if (!a.rackId || !a.locationId) issue = '배정된 랙·보관 위치를 확인할 수 없습니다.'
      else if (!rack || rack.rack.id !== a.rackId || !position) issue = '예약 보관 위치를 조회할 수 없습니다.'
      else if (!position.effectiveActive || location?.code !== a.locationCode) issue = '예약 보관 위치가 변경되었거나 비활성 상태입니다.'
      else if (!stock || !stock.isActive || stock.locationCode !== a.locationCode || stock.unit !== line.unit || (stock.lotNumber || null) !== (a.lotNumber || null) || (stock.expiryDate || null) !== (a.expiryDate || null) || (stock.serialNumber || null) !== (a.serialNumber || null)) issue = '예약 재고의 위치·LOT·시리얼을 다시 확인해 주세요.'
      else if (stock.quantity < stock.reservedQuantity || stock.reservedQuantity < (own.get(a.stockId) || 0)) issue = '실재고 또는 예약 수량이 부족합니다.'
    }
    if (![a.quantity, a.pickedQuantity].every(n => Number.isFinite(n) && n >= 0) || a.pickedQuantity > a.quantity) issue = '피킹 수량을 확인해 주세요.'
    items.push({ id: a.id, productId: line.productId, productName: line.productName, productCode: line.productCode, unit: line.unit, rackId: a.rackId, rackLabel: rack ? `${rack.rack.code} · ${rack.rack.name}` : a.rackCode || '랙 미지정', locationId: a.locationId, locationLabel: location ? location.level != null && location.bay != null ? `${location.level}단 ${location.bay}칸` : location.name : a.locationCode || '미배치 재고', locationCode: a.locationCode, zoneName: rack?.zoneName || '', quantity: a.quantity, picked: a.pickedQuantity, remaining, available: stock ? Math.max(0, stock.availableQuantity + (own.get(a.stockId) || 0)) : null, lot: a.lotNumber, expiry: a.expiryDate, serial: a.serialNumber, issue })
  }
  for (const l of detail.lines) {
    const assigned = detail.allocations.filter(a => a.lineId === l.id && ['Active', 'Consumed'].includes(a.state)).reduce((sum, a) => sum + a.quantity, 0)
    if (assigned < l.requestedQuantity) issues.push(`${l.productName}: 배정 수량이 요청보다 ${(l.requestedQuantity - assigned).toLocaleString(getLocale())} ${l.unit} 부족합니다. 기존 출고 배정을 확인해 주세요.`)
  }
  return { items, issues }
}
