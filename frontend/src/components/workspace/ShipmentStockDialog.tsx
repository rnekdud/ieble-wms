import { t as uiText } from '../../i18n.ts'
import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { Choice } from '../../receipt-model'
import type { Allocation, StockResult } from '../../shipment-model'
import OrganizationDialog from './OrganizationDialog'
import Pagination from '../Pagination'
type Stock = StockResult['items'][number]
export default function ShipmentStockDialog({ endpoint, warehouseId, product, allocations, onApply, onClose, onDirtyChange }: { endpoint: string; warehouseId: string; product: Choice; allocations: Allocation[]; onApply: (tracking: { lot: string; expiry: string; serialText: string }) => void; onClose: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0), [selected, setSelected] = useState<Record<string, Stock>>({})
  const key = `${warehouseId}:${product.id}:${page}:${revision}`
  const [result, setResult] = useState<{ key: string; data?: StockResult; error?: string }>()
  useEffect(() => {
    let live = true
    api<StockResult>(`${endpoint}/stock?warehouseId=${warehouseId}&productId=${product.id}&page=${page}`).then(data => { if (live) setResult({ key, data }) }).catch(e => { if (live) setResult({ key, error: e.message }) })
    return () => { live = false }
  }, [endpoint, warehouseId, product.id, page, key])
  const data = result?.key === key ? result.data : undefined, error = result?.key === key ? result.error : undefined
  const values = Object.values(selected), own = (id: string) => allocations.filter(a => a.stockId === id && a.state === 'Active').reduce((n, a) => n + a.quantity, 0)
  useEffect(() => { onDirtyChange(values.length > 0) }, [values.length, onDirtyChange])
  function choose(stock: Stock, checked: boolean) {
    setSelected(current => {
      if (!checked) { const next = { ...current }; delete next[stock.id]; return next }
      // Multiple serial stocks may form a single requested line; non-serial stock sets one LOT/expiry condition.
      const next = stock.serialNumber ? Object.fromEntries(Object.entries(current).filter(([, s]) => s.serialNumber)) : {}
      return { ...next, [stock.id]: stock }
    })
  }
  function apply() {
    const first = values[0]; if (!first) return
    onApply({ lot: values.every(s => s.lotNumber === first.lotNumber) ? first.lotNumber || '' : '', expiry: values.every(s => s.expiryDate === first.expiryDate) ? first.expiryDate || '' : '', serialText: values.flatMap(s => s.serialNumber ? [s.serialNumber] : []).join('\n') })
  }
  return <OrganizationDialog title={uiText("출고 재고 선택")} description={`${product.name} · ${product.unit}`} size="large" onClose={onClose}>
    <p className="organization-help">{uiText("LOT·유통기한·시리얼 조건을 선택합니다. 실제 위치는 최종 저장 시 자동 배정되며, 요청 수량은 상품 테이블에서 입력하세요.")}</p>
    {error && <p role="alert" className="alert error">{uiText(error)}<button type="button" onClick={() => setRevision(n => n + 1)}>{uiText("다시 조회")}</button></p>}
    <div className="table-scroll document-stock-scroll"><table className="organization-table document-stock-table"><thead><tr>{['선택', '보관 위치', 'LOT', '유통기한', '시리얼', '현재', '예약', '선택 가능'].map(h => <th key={h}>{uiText(h)}</th>)}</tr></thead><tbody>
      {!data ? <tr><td colSpan={8}>{uiText("재고 조회 중…")}</td></tr> : !data.items.length ? <tr><td colSpan={8}>{uiText("조회된 재고가 없습니다.")}</td></tr> : data.items.map(s => {
        const available = Math.round((s.availableQuantity + own(s.id)) * 1000) / 1000, eligible = s.isActive && s.unit === product.unit && available > 0
        return <tr key={s.id}><td><input type="checkbox" aria-label={uiText("재고 {v0} {v1}", { v0: s.locationCode, v1: s.serialNumber || s.lotNumber || s.id })} checked={!!selected[s.id]} disabled={!eligible} onChange={e => choose(s, e.target.checked)} /></td><td>{s.locationCode}{!s.isActive && <small>{uiText("비활성 위치")}</small>}</td><td>{s.lotNumber || '—'}</td><td>{s.expiryDate || '—'}</td><td>{s.serialNumber || '—'}</td><td>{s.quantity} {s.unit}</td><td>{s.reservedQuantity}</td><td>{eligible ? available : uiText("선택 불가")}{own(s.id) > 0 && <small>{uiText("이 문서 예약")} {own(s.id)} {uiText("포함")}</small>}</td></tr>
      })}
    </tbody></table></div>
    <Pagination page={page} pageSize={30} total={data?.total || 0} loading={!data} onChange={setPage} label={uiText("출고 재고 선택 페이지")} />
    <p className="organization-help">{uiText("선택")} {values.length}{uiText("건 · 시리얼 재고는 여러 건 선택할 수 있습니다. 조건을 변경해도 문서는 저장되지 않습니다.")}</p>
    <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>{uiText("취소")}</button><button type="button" className="secondary" onClick={() => onApply({ lot: '', expiry: '', serialText: '' })}>{uiText("조건 해제 · 자동 배정")}</button><button type="button" className="primary" disabled={!values.length} onClick={apply}>{uiText("선택 적용")}</button></div>
  </OrganizationDialog>
}
