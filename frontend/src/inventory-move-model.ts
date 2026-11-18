import type { StockRow } from './inventory-model.ts'
import { inventoryQuantityError } from './inventory-model.ts'

// A picker-only value for existing floor locations; never persisted as a RackId.
export const floorRackId = '00000000-0000-0000-0000-000000000000'
export type MoveSelection = { productId?: string; warehouseId?: string; rackId?: string; locationId?: string }
export function moveSourceMatches(stock: StockRow, from: MoveSelection) {
  return stock.productId === from.productId && stock.warehouseId === from.warehouseId &&
    stock.locationId === from.locationId && (stock.rackId || floorRackId) === from.rackId
}
export function moveSelectionError(stock: StockRow | undefined, from: MoveSelection, to: MoveSelection, quantity: string) {
  if (!stock || !moveSourceMatches(stock, from) || !stock.isActive || stock.quantity <= 0) return '출발 위치의 활성 재고 항목을 다시 선택해 주세요.'
  if (!to.warehouseId || !to.rackId || !to.locationId) return '도착 창고·랙·보관 위치를 모두 선택해 주세요.'
  if (stock.locationId === to.locationId) return '출발 위치와 도착 위치가 같습니다. 다른 보관 위치를 선택해 주세요.'
  return inventoryQuantityError(quantity, stock, false)
}
