import { t as uiText, getLocale } from '../../i18n.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Hand, RefreshCw, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { api } from '../../api'
import type { ShipmentDetail, StockResult } from '../../shipment-model'
import type { PlanResponse } from '../../warehouse-plan-model'
import { pickingRackTour } from '../../picking-route'
import { pickingTargets } from '../../picking-targets'
import type { PickingRack } from '../../picking-targets'
import OrganizationDialog from './OrganizationDialog'
import PlanCanvas from './PlanCanvas'
import type { PlanCanvasHandle } from './PlanCanvas'
import './barcode-location-dialog.css'
import './shipment-picking-route.css'

type Snapshot = { detail: ShipmentDetail; plan?: PlanResponse; planError: string; stocks: Record<string, StockResult['items']>; racks: Record<string, PickingRack>; notices: string[] }
async function inBatches<T>(items: T[], work: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => { while (next < items.length) await work(items[next++]) }))
}
export default function ShipmentPickingRouteDialog({ endpoint, shipmentId, number, onClose }: { endpoint: string; shipmentId: string; number: string; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const [selectedRack, setSelectedRack] = useState(''), [single, setSingle] = useState(false), [pan, setPan] = useState(false)
  const canvas = useRef<PlanCanvasHandle>(null), root = endpoint.replace(/\/shipments$/, '')
  useEffect(() => {
    let live = true
    async function load() {
      const detail = await api<ShipmentDetail>(`${endpoint}/${shipmentId}`)
      if (!live) return
      const warehouse = detail.shipment.warehouseId
      const data: Snapshot = { detail, stocks: {}, racks: {}, notices: [], planError: '' }
      const products = [...new Set(detail.allocations.filter(a => a.state === 'Active' && a.quantity > a.pickedQuantity).flatMap(a => detail.lines.find(l => l.id === a.lineId)?.productId || []))]
      const racks = [...new Set(detail.allocations.filter(a => a.warehouseId === warehouse).flatMap(a => a.rackId || []))]
      await Promise.all([
        api<PlanResponse>(`${root}/warehouses/${warehouse}/plan`).then(plan => { data.plan = plan }, () => { data.planError = '도면을 조회할 수 없습니다. 조회 권한과 창고 상태를 확인해 주세요.' }),
        inBatches(products, async product => {
          try {
            const rows: StockResult['items'] = []
            for (let page = 1; live; page++) {
              const result = await api<StockResult>(`${endpoint}/stock?warehouseId=${encodeURIComponent(warehouse)}&productId=${encodeURIComponent(product)}&page=${page}`)
              rows.push(...result.items)
              if (rows.length >= result.total) break
              if (!result.items.length || page >= 100000) throw Error('재고 페이지를 다시 확인해 주세요.')
            }
            data.stocks[product] = rows
          } catch { data.notices.push(`${detail.lines.find(l => l.productId === product)?.productName || '상품'}: 예약 재고를 조회할 수 없습니다.`) }
        }),
        inBatches(racks, async rack => {
          if (!live) return
          try { data.racks[rack] = await api<PickingRack>(`${root}/warehouses/${warehouse}/racks/${encodeURIComponent(rack)}/front`) }
          catch { /* Exact unresolved locations remain visible as issues, never guessed from codes. */ }
        }),
      ])
      if (live) setSnapshot(data)
    }
    void load().catch(e => { if (live) setError(e instanceof Error ? e.message : '피킹 정보를 조회하지 못했습니다.') })
    return () => { live = false }
  }, [endpoint, root, shipmentId, revision])
  const targets = useMemo(() => snapshot ? pickingTargets(snapshot.detail, snapshot.stocks, snapshot.racks) : { items: [], issues: [] }, [snapshot])
  const pending = targets.items.filter(i => i.remaining > 0 && !i.issue && i.rackId)
  const ids = useMemo(() => [...new Set(targets.items.filter(i => i.remaining > 0 && !i.issue).flatMap(i => i.rackId || []))], [targets])
  const tour = useMemo(() => snapshot?.plan?.exists ? pickingRackTour(snapshot.plan, ids) : undefined, [snapshot, ids])
  const selected = ids.includes(selectedRack) ? selectedRack : tour?.order[0] || ids[0] || ''
  const order = tour?.order || [], remainingRacks = ids.filter(id => !order.includes(id))
  const groups = [...order, ...remainingRacks].map(id => ({ id, items: pending.filter(i => i.rackId === id), number: order.indexOf(id) + 1 }))
  const appearances = Object.fromEntries(groups.map(g => [g.id, { fill: '#fff1b8', label: `${g.number ? `${g.number}. ` : ''}${snapshot?.racks[g.id]?.rack.code || g.items[0]?.rackLabel || '랙'}`, summary: `${g.items.length}개 피킹 항목` }]))
  const selectedObject = snapshot?.plan?.objects.find(o => o.rackId === selected)
  const route = single ? tour?.individual[selected] : tour?.route
  const refresh = () => { setSnapshot(undefined); setError(''); setRevision(v => v + 1) }
  return <OrganizationDialog title={uiText("추천 피킹 동선 — {v0}", { v0: number })} className="barcode-location-dialog shipment-picking-route-dialog" onClose={onClose} actions={<button type="button" className="secondary" onClick={onClose}>{uiText("닫기")}</button>}>
    {!snapshot && !error && <p role="status">{uiText("피킹 위치와 동선을 확인하고 있습니다…")}</p>}
    {error && <p role="alert">{uiText(error)} <button className="secondary" onClick={refresh}>{uiText("다시 조회")}</button></p>}
    {snapshot && <>
      <div className="picking-route-heading"><div><strong>{snapshot.detail.shipment.warehouseName}</strong><small>{uiText("남은 피킹:")} {new Set(pending.map(i => i.locationId)).size}{uiText("개 위치 ·")} {new Set(pending.map(i => i.productId)).size}{uiText("종 상품")}</small></div><button className="secondary" onClick={refresh}><RefreshCw size={16} />{uiText("동선 다시 계산")}</button></div>
      <p className="picking-route-note">{uiText("저장된 피킹 수량 기준의 추천 동선입니다. 실제 피킹은 기존 스캔·확인 절차로 진행하세요.")}</p>
      {snapshot.planError ? <p role="status">{uiText(snapshot.planError)}</p> : !snapshot.plan?.exists ? <p role="status">{uiText("등록된 창고 도면이 없습니다.")}</p> : <>
        <div className="picking-route-view" role="group" aria-label={uiText("피킹 동선 보기")}><button className="secondary" aria-pressed={!single} onClick={() => setSingle(false)}>{uiText("전체 동선")}</button><button className="secondary" aria-pressed={single} disabled={!selected || !tour?.individual[selected]} onClick={() => setSingle(true)}>{uiText("선택 위치")}</button></div>
        <div className="barcode-location-map"><div className="barcode-location-map-controls" role="group" aria-label={uiText("도면 조작")}><button className="secondary" aria-label={uiText("도면 화면 맞춤")} onClick={() => canvas.current?.fit()}><Scan size={17} /></button><button className="secondary" aria-label={uiText("도면 확대")} onClick={() => canvas.current?.zoom(1.25)}><ZoomIn size={17} /></button><button className="secondary" aria-label={uiText("도면 축소")} onClick={() => canvas.current?.zoom(.8)}><ZoomOut size={17} /></button><button className="secondary" aria-label={uiText("화면 이동")} aria-pressed={pan} onClick={() => setPan(v => !v)}><Hand size={17} /></button></div>
          <PlanCanvas ref={canvas} document={snapshot.plan} structureView editing={false} selected={selectedObject ? [selectedObject.id] : []} grid snap={false} pan={pan} rackAppearance={appearances} route={route} onSelect={() => {}} onChange={() => {}} onOpenRack={id => { if (ids.includes(id)) setSelectedRack(id) }} onAdd={() => {}} />
        </div>
        {tour?.notice && <p role="status" className="picking-route-note">{uiText(tour.notice)}</p>}
      </>}
      {[...targets.issues, ...snapshot.notices].map((notice, i) => <p role="alert" key={i}>{uiText(notice)}</p>)}
      <h4>{uiText("추천 피킹 순서")}</h4>
      {!targets.items.length && <p>{uiText("배정된 피킹 위치가 없습니다. 기존 출고 배정을 확인해 주세요.")}</p>}
      {targets.items.length > 0 && targets.items.every(i => i.remaining === 0) && <p role="status">{uiText("모든 피킹이 완료되었습니다.")}</p>}
      <div className="picking-route-stops">{groups.map(group => <section key={group.id} className={selected === group.id ? 'is-selected' : ''} aria-label={uiText("{v0}번 {v1}", { v0: group.number || '미연결', v1: snapshot.racks[group.id]?.rack.code || group.id })}>
        <button className="picking-route-stop" aria-pressed={selected === group.id} onClick={() => setSelectedRack(group.id)}><span className="picking-route-number">{group.number || '—'}</span><strong>{group.items[0]?.rackLabel}</strong>{group.number === 0 && <small>{uiText("경로 확인 필요")}</small>}</button>
        <ul>{group.items.map(item => <li key={item.id}><span>{item.zoneName && `${item.zoneName} · `}{item.locationLabel} · {item.locationCode}</span><strong>{item.productName} {uiText("· 남은")} {item.remaining.toLocaleString(getLocale())} {item.unit}</strong><small>{uiText("예약")} {item.quantity.toLocaleString(getLocale())} {uiText("· 피킹")} {item.picked.toLocaleString(getLocale())} {uiText("· 위치 가용(본 예약 포함)")} {item.available?.toLocaleString(getLocale()) ?? uiText("확인 필요")} {item.unit}</small>{(item.lot || item.expiry || item.serial) && <small>{[item.lot && `LOT ${item.lot}`, item.expiry && uiText("유통기한 {v0}", { v0: item.expiry }), item.serial && uiText("시리얼 {v0}", { v0: item.serial })].filter(Boolean).join(' · ')}</small>}</li>)}</ul>
      </section>)}</div>
      {targets.items.some(i => i.issue) && <section className="picking-route-exceptions"><h4>{uiText("확인이 필요한 위치")}</h4>{targets.items.filter(i => i.issue).map(i => <p key={i.id}><strong>{i.productName} · {i.locationCode} {uiText("· 남은")} {i.remaining.toLocaleString(getLocale())} {i.unit}</strong><small>{i.issue}</small></p>)}</section>}
      {targets.items.some(i => !i.remaining && !i.issue) && <details className="picking-route-complete"><summary>{uiText("피킹 완료")} {targets.items.filter(i => !i.remaining && !i.issue).length}{uiText("개 항목")}</summary>{targets.items.filter(i => !i.remaining && !i.issue).map(i => <p key={i.id}>{i.productName} · {i.locationLabel} · {i.picked.toLocaleString(getLocale())} {i.unit} {uiText("· 완료")}{[i.lot && `LOT ${i.lot}`, i.expiry, i.serial].filter(Boolean).map((v, n) => <small key={n}>{v}</small>)}</p>)}</details>}
    </>}
  </OrganizationDialog>
}
