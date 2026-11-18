import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import type { Choice } from '../../receipt-model'
import SearchableChoiceField from './SearchableChoiceField'
import type { ChoicePage } from './SearchableChoiceField'
import './shipment-racks.css'
type RackResult = ChoicePage & { routeNotice?: string }
type Props = { endpoint: string; warehouseId?: string; shipmentId?: string; productId?: string; value?: Choice; sort: string; selectedRackIds: string[]; lot?: string; expiry?: string; serials?: string[]; quantity?: string; label: string; table?: boolean; revision: number; onChange: (rack: Choice | undefined) => void; onRouteNotice?: (notice: string) => void }
export default function ShipmentRackChoice({ endpoint, warehouseId, shipmentId, productId, value, sort, selectedRackIds, lot, expiry, serials = [], quantity, label, table = false, revision, onChange, onRouteNotice }: Props) {
  const params = new URLSearchParams({ kind: 'racks', sort, ...(warehouseId ? { warehouseId } : {}), ...(shipmentId ? { shipmentId } : {}), ...(productId ? { productId } : {}), ...(lot ? { lotNumber: lot } : {}), ...(expiry ? { expiryDate: expiry } : {}) })
  for (const serial of serials) params.append('serials', serial)
  for (const id of [...new Set(selectedRackIds)].filter(id => id !== value?.id)) params.append('selectedRackIds', id)
  const base = `${endpoint}/choices?${params}`, key = `${base}:${value?.id}:${revision}`
  const [result, setResult] = useState<{ key: string; rack?: Choice; error?: string }>()
  const [wake, setWake] = useState(0)
  useEffect(() => { const refresh = () => setWake(x => x + 1); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh) }, [])
  useEffect(() => {
    if (!warehouseId) return
    let live = true
    api<RackResult>(base + (value?.id ? `&rackId=${encodeURIComponent(value.id)}` : '')).then(data => { if (live) { setResult({ key, rack: data.items.find(x => x.id === value?.id) }); onRouteNotice?.(data.routeNotice || '') } }).catch(e => { if (live) { setResult({ key, error: e.message }); onRouteNotice?.('동선을 조회하지 못했습니다. 다시 조회해 주세요.') } })
    return () => { live = false }
  }, [base, key, warehouseId, value?.id, onRouteNotice, wake])
  const loadPage = useCallback((search: string, page: number) => api<RackResult>(`${base}&search=${encodeURIComponent(search)}&page=${page}`), [base])
  const current = result?.key === key ? result : undefined
  const rack = current?.rack
  const field = <SearchableChoiceField key={base} floating hideLabel={table} compact={table} endpoint={endpoint} kind="racks" label={label} value={value?.id || ''} current={rack || value} disabled={!warehouseId || (table && !productId)} loadPage={loadPage} searchPlaceholder="랙명·랙 코드 검색" onChange={onChange} />
  if (!table) return field
  const num = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('ko-KR', { maximumFractionDigits: 3 })
  const unit = rack?.unit || value?.unit || ''
  return <><td data-label="지정 출고 랙" className="shipment-rack-choice">{field}</td><td data-label="랙 재고" className="shipment-rack-stock">
    {!value ? '랙 미지정' : !current ? '조회 중…' : current.error ? <span role="alert">{current.error}</span> : !rack ? '선택 랙 확인 필요' : <><strong>가용 {num(rack.rackAvailable)} {unit}</strong><small>현재고 {num(rack.rackPhysical)} {unit}</small>{!!rack.ownReserved && <small>이 문서 예약 {num(rack.ownReserved)} 포함<br />재요청 가능 {num(rack.rackRequestable)} {unit}</small>}{quantity && Number(quantity) > (rack.rackRequestable ?? 0) && <span className="shipment-rack-warning">랙 가용량 부족 · 다른 랙 선택 또는 다중 랙 분할 피킹</span>}</>}
  </td></>
}
