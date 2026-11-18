import { eachQuantityError } from './quantity-input.ts'
export const stocktakeStates: Record<string, string> = { Prepared: '실사 준비', Counting: '실사 진행 중', Counted: '실사 완료', Reviewing: '차이 확인', Confirmed: '최종 확정', Cancelled: '취소' }
export const stocktakeScopes: Record<string, string> = { Selected: '선택 상품 실사', Warehouse: '창고 전체', Zone: '특정 구역', Rack: '특정 랙', Location: '특정 보관 위치' }
export type Stocktake = { id: string; version: string; number: string; name: string; warehouseId: string; warehouseName: string; scope: string; scopeLabel: string; basisAt: string; snapshotAt: string; createdAt: string; contactUserId?: string | null; contactName: string; notes?: string; status: string; confirmedAt?: string }
export type CountTarget = { id: string; productId: string; warehouseId: string; locationId: string; baselineVersion: string; stockId?: string; productCode: string; productName: string; unit: string; locationCode: string; rackCode: string; lotNumber?: string; expiryDate?: string; serialNumber?: string; originalQuantity: number; originalReserved: number; originalSnapshotAt: string; baselineQuantity: number; baselineReserved: number; baselineAt: string; countedQuantity: number | null; observedSerial?: string; reason?: string; excluded: boolean; isUnregistered: boolean }
export type StocktakeDetail = { selectedItems?: CountTarget[]; confirmedByName?: string; document: Stocktake; summary: { total: number; counted: number; missing: number; differences: number; shortages: number; excesses: number; matches: number }; conflicts: string[]; incoming: boolean }
export function countState(quantity: number | null, baseline: number) { return quantity === null ? '미실사' : quantity === baseline ? '일치' : quantity < baseline ? '부족' : '초과' }
export function countInput(value: string): number | null { return value.trim() === '' ? null : Number(value) }
export function countError(quantity: number | null, serial?: string, observed?: string, unit?: string) {
  const eachError = eachQuantityError(quantity, unit); if (eachError) return eachError
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0 || quantity > 999999999.999 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.0001)) return '수량은 0 이상, 소수점 3자리까지 입력해 주세요.'
  if (serial && ((quantity !== null && quantity !== 0 && quantity !== 1) || (quantity === 1 && observed !== serial) || (quantity !== 1 && !!observed))) return '시리얼 재고는 0 또는 1개입니다. 1개이면 실제 확인한 시리얼을 입력하고, 0개/미입력이면 확인 시리얼을 비워 주세요.'
  return null
}
export type StocktakeCandidate = { id: string; stockId?: string; stockVersion?: string; productId: string; productCode: string; productName: string; warehouseId: string; warehouseName: string; locationId: string; locationCode: string; rackCode?: string; unit: string; baselineQuantity: number; baselineReserved: number; lotNumber?: string; expiryDate?: string; serialNumber?: string; barcode?: string }
export type SelectedCountRow = StocktakeCandidate & { targetId?: string; quantity: string; observedSerial: string; reason: string }
export const difference = (actual: number, baseline: number) => Math.round((actual - baseline) * 1000) / 1000
export function selectedCountError(row: SelectedCountRow) {
  const quantity = countInput(row.quantity), error = countError(quantity, row.serialNumber, row.observedSerial, row.unit)
  if (error) return error
  if (quantity === null) return '실제로 확인한 최종 수량을 입력하세요.'
  if (quantity < row.baselineReserved) return `출고 예약 ${row.baselineReserved} ${row.unit}보다 적습니다. 예약 확인이 필요합니다.`
  if (difference(quantity, row.baselineQuantity) !== 0 && !row.reason.trim()) return '차이 발생 항목의 조정 사유를 입력하세요.'
  return null
}
export function selectionInput(row: SelectedCountRow) {
  return { stockId: row.stockId || null, stockVersion: row.stockVersion || null, productId: row.productId, locationId: row.locationId, lotNumber: row.lotNumber || null, expiryDate: row.expiryDate || null, serialNumber: row.serialNumber || null, quantity: countInput(row.quantity), observedSerial: row.observedSerial || null, reason: row.reason.trim() || null }
}
export function selectedSummary(rows: SelectedCountRow[]) {
  return rows.reduce((s, row) => { const q = countInput(row.quantity); if (q === null) s.missing++; else if (q < row.baselineQuantity) s.shortages++; else if (q > row.baselineQuantity) s.excesses++; else s.matches++; return s }, { shortages: 0, excesses: 0, matches: 0, missing: 0 })
}

export function stocktakeDifferenceLabel(quantity: number | null, baseline: number, unit: string) {
  if (quantity === null) return '미입력'
  if (!Number.isFinite(quantity)) return '수량 확인 필요'
  const delta = difference(quantity, baseline)
  if (!delta) return '차이 없음'
  const amount = Math.abs(delta).toLocaleString('ko-KR', { maximumFractionDigits: 3 })
  return `${amount} ${unit} ${delta < 0 ? '부족' : '초과'} (${delta > 0 ? '+' : '-'}${amount})`
}
