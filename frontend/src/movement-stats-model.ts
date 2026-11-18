export type StatsQuery = { start: string; end: string; view: 'product' | 'warehouse' | 'partner' | 'detail'; bucket: string; direction: string; search: string; productId: string; categoryId: string; warehouseId: string; partnerId: string; documentId?: string; unit?: string; page: number; pageSize: number }
export const statsDefaults: StatsQuery = { start: '', end: '', view: 'product', bucket: 'auto', direction: 'all', search: '', productId: '', categoryId: '', warehouseId: '', partnerId: '', page: 1, pageSize: 20 }
export const statsViews = { product: '상품별 통계', warehouse: '창고별 통계', partner: '거래처별 통계', detail: '상세 내역' }
export const statsParams = (q: StatsQuery) => new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '').map(([k, v]) => [k, String(v)])).toString()
export const statsFilter = (q: StatsQuery, patch: Partial<StatsQuery>): StatsQuery => ({ ...q, ...patch, page: 1 })
export function statsRange(preset: string, today: string) {
  const end = new Date(today + 'T00:00:00Z'), start = new Date(end)
  if (preset === '7') start.setUTCDate(start.getUTCDate() - 6)
  if (preset === '30') start.setUTCDate(start.getUTCDate() - 29)
  if (preset === 'month') start.setUTCDate(1)
  if (preset === 'lastMonth') { start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth() - 1); end.setUTCDate(0) }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}
export type StatsRow = { id: string; code: string; name: string; categoryName?: string; partnerType?: string; unit?: string; receipts: number; shipments: number; receiptProducts: number; shipmentProducts: number; receiptQuantity: number; shipmentQuantity: number; difference: number; lastProcessedAt?: string }
export type StatsFact = { rowId: string; documentId: string; number: string; direction: string; confirmedAt: string; actorName: string; productId: string; productCode: string; productName: string; warehouseName: string; partnerName: string; unit: string; quantity: number; lotNumber?: string; expiryDate?: string; serialNumber?: string }
export type StatsResult = { items: (StatsRow | StatsFact)[]; total: number; page: number; pageSize: number; start: string; end: string; today: string; bucket: string; timeZone: string; maxExportRows: number; summary: { receipts: number; shipments: number; receiptProducts: number; shipmentProducts: number }; trend: { start: string; end: string; receipts: number; shipments: number }[] }
export function statsDetailQuery(q: StatsQuery, row: StatsRow | StatsFact): StatsQuery {
  if ('documentId' in row) return { ...q, view: 'detail', documentId: row.documentId, direction: row.direction, search: '', productId: '', categoryId: '', unit: '', page: 1 }
  return { ...q, view: 'detail', ...(q.view === 'product' ? { productId: row.id, unit: row.unit } : q.view === 'warehouse' ? { warehouseId: row.id } : { partnerId: row.id }), page: 1 }
}
