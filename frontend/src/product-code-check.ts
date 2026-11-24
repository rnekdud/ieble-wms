export type ProductCodeMatch = { id: string; code: string; name: string }
type Page = { items: { product: ProductCodeMatch }[]; total: number; page: number; pageSize: number }
export const normalizedProductCode = (code: string) => code.trim().normalize('NFKC').toUpperCase()
export const productCodeConflictMessage = (product: ProductCodeMatch) => `이미 ${product.name}(${product.code}) 상품에 사용 중인 상품코드입니다.`

/** Tenant-scoped, paginated lookup. Server validation remains authoritative. */
export async function findProductCodeConflict(load: (url: string) => Promise<Page>, endpoint: string, code: string, productId?: string, active = () => true): Promise<ProductCodeMatch | null> {
  const normalized = normalizedProductCode(code)
  if (!normalized) return null
  for (let page = 1; active(); page++) {
    const query = new URLSearchParams({ search: code.trim().normalize('NFKC'), status: 'all', page: String(page), pageSize: '100' })
    const data = await load(`${endpoint}?${query}`)
    if (!active()) return null
    const conflict = data.items.find(({ product }) => product.id !== productId && normalizedProductCode(product.code) === normalized)
    if (conflict) return conflict.product
    if (data.page * data.pageSize >= data.total) return null
    if (!data.items.length || data.page !== page || data.pageSize <= 0 || page >= 100000) throw new Error('Incomplete product search')
  }
  return null
}
