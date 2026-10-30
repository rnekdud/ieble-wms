import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { paginationState } from '../pagination'
import './pagination.css'

type PaginationProps = {
  page: number
  total: number
  pageSize: number
  onChange: (page: number) => void
  /** Keep true until the response for the current query has arrived. */
  loading?: boolean
  disabled?: boolean
  label?: string
}

/** Use the API's total/pageSize. Changing filters should reset the parent's page to 1. */
export default function Pagination({ page, total, pageSize, onChange, loading = false, disabled = false, label = '목록 페이지' }: PaginationProps) {
  const state = paginationState(page, total, pageSize)
  const correcting = page !== state.page
  useEffect(() => {
    // Re-query a valid page after deletion or a page-size change, never from stale totals.
    if (!loading && !disabled && page !== state.page) onChange(state.page)
  }, [page, state.page, loading, disabled, onChange])
  const unavailable = loading || disabled || correcting
  const first = unavailable || state.page === 1
  const last = unavailable || state.page === state.pageCount
  return <div className="wms-pagination">
    <span className="wms-pagination-summary" aria-live="polite">
      {loading || correcting ? '목록을 불러오는 중…' : `총 ${state.total.toLocaleString('ko-KR')}건 · ${state.start.toLocaleString('ko-KR')}–${state.end.toLocaleString('ko-KR')}건 표시`}
    </span>
    <nav className="wms-pagination-buttons" aria-label={label} aria-busy={loading || correcting}>
      <button type="button" aria-label="첫 페이지" title="첫 페이지" disabled={first} onClick={() => onChange(1)}><ChevronsLeft aria-hidden="true" size={16} /></button>
      <button type="button" aria-label="이전 페이지" title="이전 페이지" disabled={first} onClick={() => onChange(state.page - 1)}><ChevronLeft aria-hidden="true" size={16} /></button>
      {state.pages.map(number => <button type="button" key={number} aria-label={`${number}페이지`} aria-current={number === state.page ? 'page' : undefined} disabled={unavailable} onClick={() => { if (number !== state.page) onChange(number) }}>{number}</button>)}
      <button type="button" aria-label="다음 페이지" title="다음 페이지" disabled={last} onClick={() => onChange(state.page + 1)}><ChevronRight aria-hidden="true" size={16} /></button>
      <button type="button" aria-label="마지막 페이지" title="마지막 페이지" disabled={last} onClick={() => onChange(state.pageCount)}><ChevronsRight aria-hidden="true" size={16} /></button>
    </nav>
  </div>
}
