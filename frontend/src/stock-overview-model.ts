export type OverviewQuery = { view: 'product' | 'warehouse' | 'location'; search: string; categoryId: string; warehouseId: string; zoneId: string; rackId: string; locationId: string; lot: string; status: string; active: string; page: number; pageSize: number }
export const overviewDefaults: OverviewQuery = { view: 'product', search: '', categoryId: '', warehouseId: '', zoneId: '', rackId: '', locationId: '', lot: '', status: 'all', active: 'all', page: 1, pageSize: 20 }
export const overviewViews = { product: '상품별 재고', warehouse: '창고별 재고', location: '보관 위치별 재고' }
export const overviewFilters = { all: '전체 상태', normal: '정상', low: '안전재고 부족', zero: '재고 없음', expiring: '유통기한 임박', expired: '유통기한 경과', reserved: '출고 예약 있음' }
export type OverviewRow = { productId: string; productCode: string; productName: string; barcode: string | null; categoryName: string | null; warehouseId: string | null; warehouseName: string | null; zoneId: string | null; zoneName: string | null; rackId: string | null; rackCode: string | null; rackName?: string | null; locationId: string | null; locationCode: string | null; locationName: string | null; lotNumber: string | null; expiryDate: string | null; serialNumber: string | null; unit: string; quantity: number; reservedQuantity: number; availableQuantity: number; globalAvailableQuantity: number; safetyStock: number | null; safetyComparable: boolean; isLow: boolean; isActive: boolean; hasExpired: boolean; hasExpiring: boolean; statuses: string[] }
export type OverviewResult = { items: OverviewRow[]; total: number; page: number; pageSize: number; summary: { registeredProducts: number; matchingProducts: number; holdingProducts: number; lowProducts: number; reservedProducts: number }; asOf: string; today: string; timeZone: string; expirySoonDays: number; maxExportRows: number }
export type OverviewMovement = { id: string; type: string; quantity: number; unit: string; createdAt: string; actorName: string; number: string | null; source: string | null; destination: string | null }
export type OverviewDetail = { product: { id: string; code: string; name: string; barcode: string | null; unit: string; safetyStock: number | null; isActive: boolean; lotManaged: boolean; expiryManaged: boolean; serialManaged: boolean }; items: OverviewRow[]; total: number; page: number; pageSize: number; recentReceipts: OverviewMovement[]; recentShipments: OverviewMovement[]; recentChanges: OverviewMovement[] }
export function overviewParams(q: object) { return new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => [k, String(v)])) }
export function overviewFilter(q: OverviewQuery, patch: Partial<OverviewQuery>): OverviewQuery {
  const next = { ...q, ...patch, page: 1 }
  if ('warehouseId' in patch) { next.zoneId = ''; next.rackId = ''; next.locationId = '' }
  else if ('zoneId' in patch) { next.rackId = ''; next.locationId = '' }
  else if ('rackId' in patch) next.locationId = ''
  return next
}
export function overviewRowKey(r: OverviewRow) { return JSON.stringify([r.productId, r.unit, r.warehouseId, r.locationId, r.lotNumber, r.expiryDate, r.serialNumber]) }
export function overviewDetailQuery(q: OverviewQuery, r: OverviewRow, page: number) {
  return { ...q, view: 'location', page, pageSize: 20, status: 'all', unit: r.unit, warehouseId: r.warehouseId || q.warehouseId, locationId: r.locationId || q.locationId, ...(q.view === 'location' ? { trace: true, lotExact: r.lotNumber, expiryExact: r.expiryDate, serialExact: r.serialNumber } : {}) }
}

export type WarehouseOverviewRow = { warehouseId: string; warehouseName: string; productCount: number; quantities: { unit: string; quantity: number; reservedQuantity: number; availableQuantity: number }[] }
export type WarehouseOverviewResult = Omit<OverviewResult, 'items'> & { items: WarehouseOverviewRow[] }

/** Merge only contiguous IDs on the current server page. Never aggregate stock/trace rows. */
export function overviewLocationSpans(items: OverviewRow[]) {
  const spans = items.map(() => ({ warehouse: 0, rack: 0, location: 0 }))
  const keys = items.map((r, index) => {
    const warehouse = r.warehouseId ? JSON.stringify([r.warehouseId]) : `missing-warehouse:${index}`
    const rack = r.warehouseId && r.rackId ? JSON.stringify([r.warehouseId, r.zoneId, r.rackId]) : `missing-rack:${index}`
    const location = r.warehouseId && r.locationId ? JSON.stringify([r.warehouseId, r.zoneId, r.rackId, r.locationId]) : `missing-location:${index}`
    return { warehouse, rack, location }
  })
  for (const level of ['warehouse', 'rack', 'location'] as const) {
    for (let start = 0; start < items.length;) {
      let end = start + 1
      while (end < items.length && keys[start][level] === keys[end][level]) end++
      spans[start][level] = end - start
      start = end
    }
  }
  return spans
}
