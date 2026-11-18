import { api } from './api.ts'

/** Fixed-size legacy APIs: fetch only the server pages intersecting the displayed window. */
export async function readFixedPage<T extends { items: unknown[]; total: number; pageSize: number }>(url: string, serverPageSize = 20): Promise<T & { page: number }> {
  const parsed = new URL(url, window.location.origin)
  const page = Math.max(1, Number(parsed.searchParams.get('page')) || 1)
  const size = Math.min(100, Math.max(1, Number(parsed.searchParams.get('pageSize')) || 20))
  const offset = (page - 1) * size, firstPage = Math.floor(offset / serverPageSize) + 1
  const read = (number: number) => {
    const params = new URLSearchParams(parsed.searchParams)
    params.set('page', String(number)); params.set('pageSize', String(serverPageSize))
    return api<T>(`${parsed.pathname}?${params}`)
  }
  const first = await read(firstPage)
  const lastPage = Math.ceil(Math.min(offset + size, first.total) / serverPageSize)
  const rest = await Promise.all(Array.from({ length: Math.max(0, lastPage - firstPage) }, (_, index) => read(firstPage + index + 1)))
  const skip = offset % serverPageSize
  return { ...first, items: offset >= first.total ? [] : [first, ...rest].flatMap(result => result.items).slice(skip, skip + size), page, pageSize: size }
}
