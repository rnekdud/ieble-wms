import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { OverviewResult } from '../../stock-overview-model'
import Pagination from '../Pagination'

/** Consume the stock overview's product/unit aggregates, never sum trace/location rows. */
export default function BarcodeProductStock({ tenantId, productId }: { tenantId: string; productId: string }) {
  const [page, setPage] = useState(1), [retry, setRetry] = useState(0)
  const query = new URLSearchParams({ view: 'product', productId, active: 'all', status: 'all', page: String(page), pageSize: '20' })
  const url = `/api/tenants/${tenantId}/reports/stock-overview?${query}`, key = `${url}:${retry}`
  const [response, setResponse] = useState<{ key: string; data?: OverviewResult; error?: string } | null>(null)
  const current = response?.key === key ? response : null
  useEffect(() => {
    let active = true
    api<OverviewResult>(url).then(data => { if (active) setResponse({ key, data }) }, error => {
      if (active) setResponse({ key, error: error instanceof Error ? error.message : '재고를 조회하지 못했습니다.' })
    })
    return () => { active = false }
  }, [key, url])
  return <section className="barcode-product-stock" aria-label="상품 전체 재고" aria-busy={!current}>
    <h3>재고 현황</h3>
    {!current && <p role="status">전체 창고 재고를 조회하고 있습니다…</p>}
    {current?.error && <p role="alert">{current.error} <button type="button" className="secondary" onClick={() => setRetry(n => n + 1)}>다시 조회</button></p>}
    {current?.data && <>
      {current.data.items.map(row => <div key={`${row.productId}:${row.unit}`}>
        {row.unit !== 'EA' && <p className="organization-help">기존 {row.unit} 재고 · EA로 자동 환산하지 않습니다.</p>}
        <dl className="barcode-stock-totals">{[['현재고', row.quantity], ['예약 수량', row.reservedQuantity], ['가용 재고', row.availableQuantity]].map(([label, quantity]) => <div key={label}><dt>{label}</dt><dd>{Number(quantity).toLocaleString('ko-KR')}<small>{row.unit === 'EA' ? '개' : row.unit}</small></dd></div>)}</dl>
      </div>)}
      {!current.data.items.length && <p>조회 가능한 재고 정보가 없습니다.</p>}
      {current.data.total > current.data.pageSize && <Pagination page={page} total={current.data.total} pageSize={current.data.pageSize} onChange={setPage} label="재고 단위 페이지" />}
    </>}
  </section>
}
