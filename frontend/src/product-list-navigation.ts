export type ProductListQuery = { search: string; categoryId: string; status: string; page: number; pageSize: number }
export const productListDefaults = (): ProductListQuery => ({ search: '', categoryId: '', status: 'all', page: 1, pageSize: 20 })
export const productListStateKey = '__iebleProductList'
export function productListQuery(search: string): ProductListQuery {
  const p = new URLSearchParams(search), page = Number(p.get('page')), size = Number(p.get('pageSize'))
  const category = p.get('categoryId') || ''
  return { search: (p.get('search') || '').slice(0, 100), categoryId: /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(category) ? category : '', status: ['active', 'inactive'].includes(p.get('status') || '') ? p.get('status')! : 'all', page: Number.isSafeInteger(page) && page > 0 && page <= 1000000 ? page : 1, pageSize: [20, 50, 100].includes(size) ? size : 20 }
}
export function productListUrl(query: ProductListQuery) {
  const params = new URLSearchParams(), defaults = productListDefaults()
  for (const key of Object.keys(defaults) as (keyof ProductListQuery)[]) if (query[key] !== defaults[key]) params.set(key, String(query[key]))
  return '/app/products' + (params.size ? '?' + params : '')
}
type ReturnPoint = { url: string; scroll: number; draft: ProductListQuery; stack?: string; index?: number }
export type ProductListEntry = { owner: string; returnTo?: ReturnPoint; scroll?: number; draft?: ProductListQuery }
export function ownedProductListEntry(state: unknown, owner: string): ProductListEntry | null {
  const entry = (state as Record<string, ProductListEntry> | null)?.[productListStateKey]
  return entry?.owner === owner ? entry : null
}
export function safeProductReturn(entry: ProductListEntry | null) {
  const point = entry?.returnTo
  if (!point || !/^\/app\/products(?:\?[^#]*)?$/.test(point.url)) return null
  return { ...point, url: productListUrl(productListQuery(point.url.split('?')[1] || '')), scroll: Number.isFinite(point.scroll) ? Math.max(0, point.scroll) : 0 }
}
export function writeProductListEntry(entry: ProductListEntry) {
  window.history.replaceState({ ...window.history.state, [productListStateKey]: entry }, '')
}
