/** Shared, one-based paging for both server and client paginated lists. */
export function paginationState(page: number, total: number, pageSize: number) {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.trunc(pageSize)) : 1
  const count = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0
  const pageCount = Math.max(1, Math.ceil(count / size))
  const current = Math.min(pageCount, Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1))
  const groupStart = Math.floor((current - 1) / 5) * 5 + 1
  return {
    page: current,
    pageCount,
    total: count,
    start: count ? (current - 1) * size + 1 : 0,
    end: Math.min(current * size, count),
    pages: Array.from({ length: Math.min(5, pageCount - groupStart + 1) }, (_, i) => groupStart + i),
  }
}
