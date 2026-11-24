import { getLocale } from './i18n.ts'
export type HistoryQuery = { start: string; end: string; type: string; search: string; document: string; lot: string; serial: string; warehouseId: string; rackId: string; locationId: string; actorId: string; page: number; pageSize: number }
export const historyDefaults: HistoryQuery = { start: '', end: '', type: 'all', search: '', document: '', lot: '', serial: '', warehouseId: '', rackId: '', locationId: '', actorId: '', page: 1, pageSize: 20 }
export const historyFilters = { all: '전체 유형', receipt: '입고', shipment: '출고', move: '재고 이동', increase: '재고 증가 조정', decrease: '재고 감소 조정', stocktake: '재고 실사/조사' }
export const historyTypes: Record<string, string> = { ReceiptConfirmed: '입고', ShipmentConfirmed: '출고', MoveIn: '이동 · 도착', MoveOut: '이동 · 출발', AdjustmentIncrease: '증가 조정', AdjustmentDecrease: '감소 조정', StocktakeIncrease: '실사/조사 · 증가', StocktakeDecrease: '실사/조사 · 감소' }
export const historyParams = (q: HistoryQuery) => new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '').map(([k, v]) => [k, String(v)])).toString()
export function historyFilter(q: HistoryQuery, patch: Partial<HistoryQuery>): HistoryQuery {
 const next = { ...q, ...patch, page: 1 }
 if ('warehouseId' in patch && patch.warehouseId !== q.warehouseId) { next.rackId = ''; next.locationId = '' }
 if ('rackId' in patch && patch.rackId !== q.rackId) next.locationId = ''
 return next
}
export type HistoryRow = { id: string; stockId: string; type: string; createdAt: string; quantity: number; unit?: string; productId?: string; productCode?: string; productName?: string; barcode?: string; warehouseId?: string; warehouseName?: string; rackId?: string; rackCode?: string; locationId?: string; locationCode?: string; locationSnapshot?: string; lotNumber?: string; expiryDate?: string; serialNumber?: string; actorId: string; actorName?: string; reason?: string; documentKind: string; documentId?: string; documentNumber?: string; documentLinked: boolean }
export type HistoryResult = { items: HistoryRow[]; total: number; page: number; pageSize: number; start: string; end: string; today: string; maxExportRows: number; summary: { rows: number; receiptRows: number; shipmentRows: number; operationRows: number; stocktakeRows: number; workCount: number } }
export type HistoryDocument = { id: string; number: string; name?: string; partnerName?: string; warehouseName?: string; contactName?: string; notes?: string; expectedDate?: string; requestDate?: string; confirmedAt?: string; basisAt?: string; snapshotAt?: string; scopeLabel?: string }
export type HistoryDetail = { row: HistoryRow; document: HistoryDocument | null; operation: import('./inventory-model').InventoryOperation | null; countTarget: { originalQuantity: number; originalSnapshotAt: string; baselineQuantity: number; baselineAt: string; countedQuantity: number | null; reason?: string; observedSerial?: string } | null; related: HistoryRow[]; total: number; page: number; pageSize: number }
export const signedQuantity = (quantity: number, unit?: string) => `${quantity > 0 ? '+' : ''}${quantity.toLocaleString(getLocale(), { maximumFractionDigits: 3 })} ${unit || '단위 미기록'}`
