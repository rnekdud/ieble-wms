import { eachQuantityError } from './quantity-input.ts'
import type { ReceiptLine, Receipt } from './receipt-model'
export const shipmentStatuses = { Requested: '출고 요청', Picking: '피킹 중', Picked: '피킹 완료', Inspected: '검수 완료', Confirmed: '출고 확정', Cancelled: '취소' } as const
export type Shipment = Omit<Receipt, 'status'> & { requestDate: string; status: keyof typeof shipmentStatuses; pickedAt: string | null }
export type ShipmentLine = Omit<ReceiptLine, 'expectedQuantity' | 'inspectedQuantity' | 'placements'> & { requestedQuantity: number }
export type Allocation = { rackId?: string | null; locationId?: string; warehouseId?: string; warehouseName?: string; pickedByName?: string | null; confirmedQuantity?: number; id: string; lineId: string; stockId: string; locationCode: string; rackCode: string | null; lotNumber: string | null; expiryDate: string | null; serialNumber: string | null; quantity: number; pickedQuantity: number; inspectedQuantity: number; state: string; pickedAt: string | null; inspectedAt: string | null }
export type ShipmentDetail = { shipment: Shipment; lines: ShipmentLine[]; allocations: Allocation[]; movements: { id: string; quantity: number }[] }
export type ShipmentList = { items: { shipment: Shipment; productCount: number; totals: { unit: string; quantity: number }[] }[]; total: number; page: number; pageSize: number }
export type StockResult = { physical: number; reserved: number; available: number; total: number; items: { id: string; isActive: boolean; locationCode: string; lotNumber: string | null; expiryDate: string | null; serialNumber: string | null; quantity: number; reservedQuantity: number; availableQuantity: number; unit: string }[] }
export function serialSelectionError(_managed: boolean, quantity: number, serials: string[]) {
  if (serials.length > 0 && (!Number.isInteger(quantity) || quantity > 1000)) return '시리얼 상품은 1,000개 이하의 정수 수량을 입력해 주세요.'
  if ((serials.length && serials.length !== quantity) || new Set(serials).size !== serials.length || serials.some(s => s.length > 100 || [...s].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))) return '지정 시리얼의 개수·형식·중복을 확인해 주세요.'
  return null
}
export function workError(quantity: string, limit: number, complete: boolean, minimum = 0, unit?: string) {
  const eachError = eachQuantityError(quantity, unit); if (eachError) return eachError
  if (!/^\d+(\.\d{1,3})?$/.test(quantity) || !Number.isFinite(Number(quantity))) return '수량은 0 이상, 소수점 3자리까지 입력해 주세요.'
  if (Number(quantity) < minimum) return '이미 기록한 피킹 수량보다 줄일 수 없습니다.'
  const delta = Math.round((Number(quantity) - limit) * 1000) / 1000
  if (delta > 0) return `기준 수량보다 ${delta.toLocaleString('ko-KR')} 초과했습니다.`
  if (complete && delta < 0) return `기준 수량보다 ${(-delta).toLocaleString('ko-KR')} 부족합니다. 모든 위치의 수량을 확인해 주세요.`
  return null
}
