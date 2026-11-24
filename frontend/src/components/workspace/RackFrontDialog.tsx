import { t as uiText } from '../../i18n.ts'
import RackBarcodeLabel from './RackBarcodeLabel'
import { useLiveInventory } from './useLiveInventory'
import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../../api'
import type { StorageItem } from '../../types/warehouse'
import type { OverviewResult } from '../../stock-overview-model'
import type { RackPick } from '../../warehouse-3d-model'
import { resolveSlot } from '../../warehouse-3d-model'
import OrganizationDialog from './OrganizationDialog'
import Pagination from '../Pagination'
import './warehouse-3d.css'
export type RackFrontData = { rack: StorageItem; warehouseName?: string; zoneName?: string | null; locations: { location: StorageItem; effectiveActive: boolean }[]; inventoryAvailable: boolean }
type Props = { snapshot?: RackFrontData; inventoryContent?: ReactNode; compact?: boolean; locationStates?: Record<string, { products: number; reserved: boolean }>; endpoint?: string; rackId?: string; preview?: RackFrontData; initialPick?: RackPick | null; onPick?: (pick: RackPick) => void }
export function RackFrontDetails({ endpoint, rackId, preview, initialPick, onPick, snapshot, inventoryContent, compact, locationStates }: Props) {
  const [remote, setData] = useState<{ key: string; data: RackFrontData } | null>(null), [error, setError] = useState('')
  const [choice, setChoice] = useState<{ key: string; id: string | null } | null>(null), [reload, setReload] = useState(0)
  const dataKey = `${endpoint}:${rackId}`, pickKey = `${dataKey}:${initialPick?.level}:${initialPick?.bay}`
  const data = snapshot || preview || (remote?.key === dataKey ? remote.data : null)
  const selected = choice?.key === pickKey ? choice.id : data && initialPick ? resolveSlot(data.locations, initialPick)?.id : null
  useEffect(() => {
    if (snapshot || preview || !endpoint || !rackId) return
    let live = true
    api<RackFrontData>(`${endpoint}/racks/${rackId}/front`).then(d => { if (live) { setData({ key: dataKey, data: d }); setError('') } }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [endpoint, rackId, preview, snapshot, dataKey, reload])
  const detail = data?.locations.find(l => l.location.id === selected)
  const slots = new Map(data?.locations.map(l => [`${l.location.level}:${l.location.bay}`, l]))
  return <>
    {error && <p role="alert" className="alert error">{uiText(error)} <button className="secondary" onClick={() => setReload(n => n + 1)}>{uiText("랙 다시 불러오기")}</button></p>}
    {!data ? <p role="status">{error ? uiText("랙을 조회할 수 없습니다.") : uiText("실제 보관 위치를 불러오는 중…")}</p> : <>
      {preview && <p className="organization-help">{uiText("저장 전 미리보기입니다. 새 위치의 실제 ID는 최종 저장 시 부여됩니다.")}</p>}
      <h3>{data.rack.name} · {data.rack.code}</h3><p>{data.rack.levels}{uiText("단 ×")} {data.rack.bays}{uiText("칸 ·")} {data.locations.length}{uiText("개 보관 위치")}</p>
      {!preview && <p className="organization-help">{data.warehouseName} · {data.zoneName || uiText("구역 미지정")}</p>}
      {compact ? <details><summary>{uiText("랙 바코드 ·")} {data.rack.barcode || uiText("미등록")}</summary><RackBarcodeLabel value={data.rack.barcode} rackId={data.rack.id} rackCode={data.rack.code} /></details> : <RackBarcodeLabel value={data.rack.barcode} rackId={data.rack.id} rackCode={data.rack.code} draft={!!preview} />}
      <div className="rack-front-scroll"><div className="rack-front-grid" style={{ gridTemplateColumns: `repeat(${data.rack.bays}, minmax(${compact ? 68 : 100}px, 1fr))` }}>
        {Array.from({ length: data.rack.levels! }, (_, i) => data.rack.levels! - i).flatMap(level => Array.from({ length: data.rack.bays! }, (_, i) => {
          const bay = i + 1, slot = slots.get(`${level}:${bay}`)
          return <button type="button" key={`${level}:${bay}`} className={`secondary ${slot?.effectiveActive ? '' : 'is-inactive'} ${slot && locationStates?.[slot.location.id]?.reserved ? 'slot-reserved' : slot && locationStates?.[slot.location.id]?.products ? 'slot-holding' : ''}`} data-location-id={slot?.location.id} disabled={!slot} aria-label={uiText("{v0}단 {v1}칸 {v2}", { v0: level, v1: bay, v2: slot?.location.code || '위치 없음' })} aria-pressed={selected === slot?.location.id} onClick={() => { setChoice({ key: pickKey, id: slot!.location.id }); if (rackId) onPick?.({ rackId, level, bay }) }}><strong>{level}{uiText("단 ·")} {bay}{uiText("칸")}</strong><small>{slot?.location.code || uiText("위치 없음")}</small>{slot && <small>{locationStates ? uiText("{v0}종{v1}", { v0: locationStates[slot.location.id]?.products || 0, v1: locationStates[slot.location.id]?.reserved ? uiText(' · 예약') : '' }) : slot.effectiveActive ? uiText("사용") : uiText("미사용")}</small>}</button>
        }))}
      </div></div>
      {detail && <section className="rack-location-detail" aria-label={uiText("보관 위치 상세")}><h3>{detail.location.code}</h3>{compact ? <details><summary>{uiText("위치 바코드 ·")} {detail.location.barcode || uiText("미등록")}</summary><RackBarcodeLabel kind="location" value={detail.location.barcode} rackId={detail.location.id} rackCode={detail.location.code} draft={!!preview} /></details> : <RackBarcodeLabel kind="location" value={detail.location.barcode} rackId={detail.location.id} rackCode={detail.location.code} draft={!!preview} />}<dl className="warehouse-details"><dt>{uiText("위치명")}</dt><dd>{detail.location.name}</dd><dt>{uiText("위치 ID")}</dt><dd>{preview && detail.location.id.includes(':') ? uiText("저장 시 부여") : detail.location.id}</dd><dt>{uiText("사용 가능 상태")}</dt><dd>{detail.effectiveActive ? uiText("사용") : uiText("미사용")}</dd><dt>{uiText("단 / 칸")}</dt><dd>{detail.location.level} / {detail.location.bay}</dd></dl><button className="text-button" onClick={() => { setChoice({ key: pickKey, id: null }); if (rackId) onPick?.({ rackId }) }}>{uiText("랙 전체 재고 보기")}</button></section>}
      {snapshot ? inventoryContent : !preview && endpoint && rackId && (data.inventoryAvailable ? <RackStock key={`${dataKey}:${selected || ''}`} endpoint={endpoint} rackId={rackId} locationId={selected || undefined} /> : <p className="organization-help">{uiText("재고 현황 조회 권한이 없어 상품·재고 정보를 표시하지 않습니다.")}</p>)}
    </>}
  </>
}
export function RackStock({ endpoint, rackId, locationId, stockEndpoint }: { endpoint: string; rackId?: string; locationId?: string; stockEndpoint?: string }) {
  const [page, setPage] = useState(1)
  const url = `${stockEndpoint || `${endpoint}/racks/${rackId}/stock`}?${new URLSearchParams({ page: String(page), ...(locationId ? { locationId } : {}) })}`
  const { data, error, refresh, loading } = useLiveInventory<OverviewResult>(url, endpoint.split('/')[3])
  return <section className="rack-stock" aria-label={uiText("보관 재고")}><h4>{locationId || stockEndpoint ? uiText("선택 위치 재고") : uiText("랙 전체 재고")}</h4>
    {error ? <p role="alert" className="alert error">{uiText(error)} <button className="secondary" onClick={refresh}>{uiText("다시 조회")}</button></p> : !data ? <p role="status">{uiText("재고를 불러오는 중…")}</p> : !data.total || !data.summary.holdingProducts ? <p>{uiText("보관 중인 재고 없음")}</p> : <>
      <div className="wms-table-scroll"><table className="wms-table"><caption>{uiText("상품·추적 정보별 실제 재고")}</caption><thead><tr><th>{uiText("상품 / 위치")}</th><th>{uiText("LOT / 유통기한 / 시리얼")}</th><th>{uiText("현재")}</th><th>{uiText("출고 예정")}</th><th>{uiText("출고 가능")}</th></tr></thead><tbody>{data.items.map((r, i) => <tr key={i}><td>{r.productName}<small>{r.productCode} · {r.locationCode}</small></td><td>{r.lotNumber || '—'}<small>{r.expiryDate || '—'} / {r.serialNumber || '—'}</small></td><td className="numeric">{r.quantity.toLocaleString()} {r.unit}</td><td className="numeric">{r.reservedQuantity.toLocaleString()} {r.unit}</td><td className="numeric">{r.availableQuantity.toLocaleString()} {r.unit}</td></tr>)}</tbody></table></div>
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} loading={loading} onChange={setPage} label={uiText("랙 재고 페이지")} />
    </>}
  </section>
}
export default function RackFrontDialog({ onClose, ...props }: Props & { onClose: () => void }) {
  return <OrganizationDialog title={props.preview ? uiText("랙 정면도 미리보기") : uiText("랙 정면도")} onClose={onClose} wide={!props.preview}><RackFrontDetails {...props} /></OrganizationDialog>
}
