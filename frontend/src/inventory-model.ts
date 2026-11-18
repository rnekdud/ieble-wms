import { eachQuantityError } from './quantity-input.ts'
export type StockRow = { id: string; version: string; productId: string; productCode: string; productName: string; barcode: string | null; warehouseId: string; warehouseName: string; rackId: string | null; rackCode: string | null; locationId: string; locationCode: string; unit: string; lotNumber: string | null; expiryDate: string | null; serialNumber: string | null; quantity: number; reservedQuantity: number; availableQuantity: number; isActive: boolean; serialManaged: boolean }
export type QuantitySummary = { unit: string; quantity: number; reservedQuantity: number; availableQuantity: number }
export type StockDetail = { stock: StockRow; productTotals: QuantitySummary[] }
export type InventoryOperation = { contactUserId?: string | null; contactName?: string | null; id: string; number: string; type: 'Move' | 'Increase' | 'Decrease'; productId: string; productCode: string; productName: string; unit: string; lotNumber: string | null; expiryDate: string | null; serialNumber: string | null; sourceStockId: string | null; destinationStockId: string | null; sourceLabel: string | null; destinationLabel: string | null; quantity: number; beforeSource: number; afterSource: number; beforeDestination: number; afterDestination: number; reason: string; notes: string | null; actorName: string; occurredAt: string; createdAt: string }
export type Movement = { id: string; type: string; quantity: number; createdAt: string; operationId: string | null; receiptId: string | null; shipmentId: string | null }
export type OperationDetail = { operation: InventoryOperation; movements: Movement[] }
export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number }
export const operationLabels = { Move: '이동', Increase: '증가 조정', Decrease: '감소 조정' }
export const movementLabels: Record<string, string> = { StocktakeIncrease: '실사 증가', StocktakeDecrease: '실사 감소', ReceiptConfirmed: '입고 확정', ShipmentConfirmed: '출고 확정', MoveIn: '이동 입고', MoveOut: '이동 출고', AdjustmentIncrease: '증가 조정', AdjustmentDecrease: '감소 조정' }
export function quantityPreview(current: number, reserved: number, quantity: number, increase: boolean) { const after = Math.round((current + (increase ? quantity : -quantity)) * 1000) / 1000; return { after, available: Math.round((after - reserved) * 1000) / 1000, valid: after >= reserved } }
export function inventoryQuantityError(value: string, stock: Pick<StockRow, 'quantity' | 'reservedQuantity' | 'availableQuantity' | 'serialManaged'> & { unit?: string } | undefined, increase: boolean, unit = stock?.unit) {
  const eachError = eachQuantityError(value, unit); if (eachError) return eachError
  if (!/^\d+(\.\d{1,3})?$/.test(value) || Number(value) <= 0 || Number(value) > 999999999.999) return '수량은 0보다 크고 소수점 3자리 이내여야 합니다.'
  if (stock && !increase && Number(value) > stock.availableQuantity) return '출고 가능 수량을 초과합니다. 예약 수량은 변경할 수 없습니다.'
  if (stock?.serialManaged && (Number(value) !== 1 || quantityPreview(stock.quantity, stock.reservedQuantity, Number(value), increase).after > 1)) return '시리얼 재고는 0 또는 1개만 유지할 수 있습니다.'
  return null
}
