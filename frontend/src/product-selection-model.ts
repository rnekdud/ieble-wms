import type { Choice } from './receipt-model'
import type { ImportedProduct } from './document-paste'
export type SelectionProduct = Choice & { productTypeName: string | null; hasImage: boolean; barcode: string | null; physical: number | null; reserved: number | null; available: number | null; ownReserved: number | null; requestable: number | null }
export type SelectedProduct = { product: SelectionProduct }
export type SelectionResult = { items: SelectionProduct[]; total: number; page: number; pageSize: number; asOf: string }
export type SelectionOptions = { categories: { id: string; name: string; parentId: string | null; isActive: boolean }[]; productTypes: { id: string; name: string; isActive: boolean }[] }
export function refreshSelection(selected: Record<string, SelectedProduct>, latest: SelectionProduct[]): Record<string, SelectedProduct> {
  const fresh = new Map(latest.map(p => [p.id, p]))
  return Object.fromEntries(Object.entries(selected).map(([id, value]) => [id, { ...value, product: fresh.get(id) || value.product }]))
}
export function selectedProducts(selected: Record<string, SelectedProduct>): ImportedProduct[] {
  return Object.values(selected).map(({ product }) => ({ product, quantity: '' }))
}
