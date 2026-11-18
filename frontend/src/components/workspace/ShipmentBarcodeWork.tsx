import { shipmentStatuses } from '../../shipment-model'
import QuantityInput from './QuantityInput'
import useShipmentProductBarcodes from './useShipmentProductBarcodes'
import { lazy, Suspense, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { api, ApiError } from '../../api'
import type { BarcodeScanEvent } from '../../barcode-scan'
import type { ShipmentDetail } from '../../shipment-model'
import { workError } from '../../shipment-model'
import { requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import BarcodeScanInput from './BarcodeScanInput'
import DetailSurface from './DetailSurface'
import UnsavedChangesDialog from './UnsavedChangesDialog'
import { restoreShipmentScans } from '../../shipment-scan'
import type { ShipmentScanCommand, ShipmentScanResult } from '../../shipment-scan'

const ShipmentPickingRouteDialog = lazy(() => import('./ShipmentPickingRouteDialog'))

export default function ShipmentBarcodeWork({ initial, endpoint, inspect, onChange, onComplete, onClose }: {
  initial: ShipmentDetail; endpoint: string; inspect: boolean; onChange: (data: ShipmentDetail) => void; onComplete: (data: ShipmentDetail) => void; onClose: () => void
}) {
  const url = `${endpoint}/${initial.shipment.id}`, stage = inspect ? 'inspection' : 'picking', storageKey = `wms-shipment-scan:${url}:${stage}`
  const [showRoute, setShowRoute] = useState(false)
  const [data, setData] = useState(initial), latest = useRef(initial)
  const productBarcode = useShipmentProductBarcodes(endpoint, inspect ? undefined : data.shipment.warehouseId, data.lines.map(line => line.productId))
  const [pending, setPending] = useState(() => restoreShipmentScans(sessionStorage.getItem(storageKey))), queue = useRef(pending), sending = useRef(false)
  const [paused, setPaused] = useState(pending.length > 0), [candidates, setCandidates] = useState<string[]>([])
  const [location, setLocation] = useState<{ id: string; code: string } | null>(null)
  const [selected, setSelected] = useState(''), selection = useRef<{ barcode: string; id: string } | null>(null)
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [manual, setManual] = useState<Record<string, string>>({}), [manualVersion, setManualVersion] = useState('')
  const input = useRef<HTMLInputElement>(null), blocked = pending.length > 0 || busy, dirty = Object.keys(manual).length > 0
  const guard = useUnsavedNavigation(dirty || blocked, blocked)
  const canWork = data.shipment.status === (inspect ? 'Picked' : 'Picking'), title = inspect ? '최종 검수' : '출고 피킹'
  function update(d: ShipmentDetail) { latest.current = d; setData(d); onChange(d) }
  function remember() { setPending([...queue.current]); if (queue.current.length) sessionStorage.setItem(storageKey, JSON.stringify(queue.current)); else sessionStorage.removeItem(storageKey) }
  async function pump() {
    if (sending.current || !queue.current.length) return
    sending.current = true; setPaused(false); setCandidates([])
    try {
      while (queue.current.length) {
        const command = queue.current[0]
        if (!command.allocationId && selection.current?.barcode === command.barcode) { command.allocationId = selection.current.id; remember() }
        try {
          const result = await api<ShipmentScanResult>(`${url}/scan-${stage}`, command)
          update(result.detail); setError('')
          if (result.outcome === 'select-allocation') { setCandidates(result.candidateAllocationIds); setPaused(true); setMessage('위치·LOT·유통기한·시리얼을 확인하고 이번 스캔의 예약 행을 선택하세요.'); break }
          queue.current.shift(); remember()
          const allocation = result.detail.allocations.find(a => a.id === result.allocationId), line = result.detail.lines.find(l => l.id === allocation?.lineId)
          if (result.outcome === 'location' && result.locationId) {
            setLocation({ id: result.locationId, code: result.locationCode || '' }); selection.current = null; setSelected('')
            // Location scans are queued in order. Following product events use the resolved location.
            queue.current.forEach(c => { c.locationId = result.locationId!; c.allocationId = null }); remember()
            setMessage(`위치 ${result.locationCode} 확인 · 해당 위치의 상품을 스캔하세요.`)
          } else if (result.outcome === 'over-limit') { setError(`${line?.productName}: ${inspect ? '피킹' : '예약'} 수량을 초과했습니다. 수량은 변경되지 않았습니다.`) }
          else if (result.outcome === 'manual' && allocation) { setSelected(allocation.id); setMessage(`${line?.productName} · ${line?.unit} 상품입니다. 아래 실제 수량을 입력하고 저장하세요.`) }
          else if (allocation) { setSelected(allocation.id); setMessage(`${line?.productName} · ${allocation.locationCode} · ${inspect ? allocation.inspectedQuantity : allocation.pickedQuantity}/${inspect ? allocation.pickedQuantity : allocation.quantity} ${line?.unit} 저장${result.replayed ? ' 확인 (중복 증가 없음)' : ' 완료'}`) }
        } catch (e) {
          setError(e instanceof Error ? e.message : '저장 결과를 확인하지 못했습니다.')
          if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500 || e.status === 429) { setPaused(true); break }
          queue.current.shift(); remember()
          if (e.status === 409) { try { update(await api<ShipmentDetail>(url)) } catch { /* keep confirmed quantities */ } }
        }
      }
    } finally { sending.current = false; input.current?.focus({ preventScroll: true }) }
  }
  function enqueue(event: BarcodeScanEvent) {
    if (inspect && dirty || !canWork || busy || dirty && sending.current || paused) return false
    if (queue.current.length >= 100) { setError('처리 대기 중인 스캔이 100건입니다. 저장을 확인한 뒤 다시 스캔하세요.'); return false }
    const command: ShipmentScanCommand = { ...event, locationId: location?.id || null, allocationId: null }
    if (dirty) {
      const issue = manualProblem(false)
      if (issue) { setError(issue); return false }
      // Manual work assigns absolute quantities. Commit it before the scan adds its
      // packaging quantity; never send a scan against an unsaved/stale baseline.
      void save(false).then(saved => {
        if (!saved) { setError(value => `${value} 수동 수량을 저장하지 못해 바코드를 처리하지 않았습니다. 확인 후 다시 스캔하세요.`); return }
        queue.current.push(command); remember(); void pump()
      })
      return true
    }
    queue.current.push(command); remember(); void pump(); return true
  }
  function choose(id: string) {
    const command = queue.current[0]; if (!command) return
    command.allocationId = id; selection.current = { barcode: command.barcode, id }; setSelected(id); remember(); void pump()
  }
  function manualProblem(complete: boolean) {
    const d = latest.current
    for (const a of d.allocations) {
      const issue = workError(manual[a.id] ?? String(inspect ? a.inspectedQuantity : a.pickedQuantity), inspect ? a.pickedQuantity : a.quantity, complete, inspect ? 0 : a.pickedQuantity, d.lines.find(l => l.id === a.lineId)?.unit)
      if (issue) { const line = d.lines.find(l => l.id === a.lineId); return `${line?.productName} · ${a.locationCode}: ${issue} (${line?.unit})` }
    }
    return null
  }
  async function save(complete: boolean) {
    if (sending.current || queue.current.length || busy) return false
    const d = latest.current
    const allocations = d.allocations.map(a => ({ allocationId: a.id, quantity: Number(manual[a.id] ?? (inspect ? a.inspectedQuantity : a.pickedQuantity)) }))
    const issue = manualProblem(complete)
    if (issue) { setError(issue); return false }
    sending.current = true; setBusy(true); setError('')
    try {
      const result = await api<ShipmentDetail>(`${url}/${stage}`, { version: dirty ? manualVersion : d.shipment.version, complete, allocations })
      update(result)
      setManual({}); if (complete) { guard.saved(); onComplete(result); return true } setMessage(complete ? `${title} 완료 · 상세에서 다음 작업을 진행하세요.` : '수동 수량을 저장했습니다. 스캔을 이어서 진행할 수 있습니다.'); return true
    } catch (e) {
      setError(e instanceof Error ? e.message : '작업 저장에 실패했습니다.')
      if (e instanceof ApiError && e.status === 409) { try { update(await api<ShipmentDetail>(url)) } catch { /* preserve local inputs for review */ } }
      return false
    } finally { sending.current = false; setBusy(false) }
  }
  async function refresh() {
    if (blocked) return
    setBusy(true)
    try { update(await api<ShipmentDetail>(url)); setManual({}); setError(''); setMessage('최신 저장 수량을 불러왔습니다.') }
    catch (e) { setError(e instanceof Error ? e.message : '조회에 실패했습니다.') }
    finally { setBusy(false) }
  }
  return <DetailSurface hideListAction title={title} code={data.shipment.number} status={<span className={`status-badge ${data.shipment.status}`}>{shipmentStatuses[data.shipment.status]}</span>} busy={blocked} onClose={() => requestNavigation(onClose)} actions={<button className="primary" disabled={blocked || !canWork} onClick={() => void save(true)}>{inspect ? '검수' : '피킹'} 완료</button>}>
    <UnsavedChangesDialog guard={guard} />
    {showRoute && <Suspense fallback={<p role="status">동선 안내를 불러오는 중…</p>}><ShipmentPickingRouteDialog endpoint={endpoint} shipmentId={data.shipment.id} number={data.shipment.number} onClose={() => setShowRoute(false)} /></Suspense>}
    <section className="receipt-scan-station" aria-label={`${title} 스캔 영역`}>
      <div className="receipt-section-heading"><h3>{title} 바코드 스캔</h3>{!inspect && <button type="button" className="secondary" disabled={blocked} onClick={() => setShowRoute(true)}><MapPin size={16} />최적 피킹 동선 보기</button>}</div><BarcodeScanInput inputRef={input} label={inspect ? '출고 검수 바코드' : '피킹 바코드'} onScan={enqueue} disabled={!canWork || busy || inspect && dirty || paused} />
      <p>위치 바코드 → 상품 바코드 순으로 스캔하세요. 위치·LOT·시리얼이 여러 개이면 대상 행을 선택합니다. 재고는 출고 확정 시에만 차감됩니다.</p>
      {(inspect || selected) && <div className="barcode-context">{inspect && <><strong>위치: {location?.code || '미지정 · 예약 행이 하나일 때만 자동 처리'}</strong><button type="button" className="secondary" disabled={blocked} onClick={() => { setLocation(null); selection.current = null; setSelected('') }}>위치·대상 선택 해제</button></>}{selected && <button type="button" className="secondary" disabled={blocked} onClick={() => { selection.current = null; setSelected('') }}>다른 LOT·시리얼 선택</button>}</div>}
      {pending.length > 0 && <p role="status">{pending.length}건 처리 대기 · {paused ? '확인 필요' : '저장 중'}</p>}
      {message && <p role="status" className="alert">{message}</p>}{error && <p role="alert" className="alert error">{error}</p>}
      {paused && !candidates.length && <button type="button" className="primary" onClick={() => void pump()}>같은 요청 재시도</button>}
      {!!candidates.length && <div className="receipt-scan-candidates" aria-label="출고 예약 행 선택">{data.allocations.filter(a => candidates.includes(a.id)).map(a => <button key={a.id} type="button" className="secondary" onClick={() => choose(a.id)}>{data.lines.find(l => l.id === a.lineId)?.productName} · {a.locationCode} · LOT {a.lotNumber || '없음'} · {a.expiryDate || '유통기한 없음'} · 시리얼 {a.serialNumber || '없음'} · {inspect ? a.inspectedQuantity : a.pickedQuantity}/{a.quantity}</button>)}</div>}
    </section>
    <section className="shipment-work-section"><div className="receipt-section-heading"><h3>예약 위치별 {inspect ? '검수' : '피킹'} · 수동 입력</h3><button type="button" className="secondary" disabled={blocked} onClick={() => void refresh()}>{dirty ? '입력 취소·최신 수량 조회' : '최신 수량 조회'}</button></div>
      {dirty && <p role="status">{inspect ? '수동 입력을 저장하거나 취소하면 스캔을 이어서 사용할 수 있습니다.' : '스캔하면 입력한 수량을 먼저 저장한 뒤 스캔 수량을 반영합니다.'}</p>}
      <div className="table-scroll"><table className="organization-table receipt-scan-table document-detail-products"><thead><tr>{['상품','위치','LOT / 유통기한','시리얼','예약','피킹','검수','실제 수량 입력'].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{data.allocations.map((a, i) => { const l = data.lines.find(l => l.id === a.lineId)!; return <tr key={a.id} className={selected === a.id ? 'is-scan-selected' : ''}><td data-label="상품" className="document-detail-product">{l.productName}<small>{l.productCode} · {l.unit}</small>{!inspect && <small className="shipment-product-barcode" style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{productBarcode(l.productId)}</small>}</td><td data-label="위치">{a.locationCode}</td><td data-label="LOT / 유통기한">{a.lotNumber || '—'}<small>{a.expiryDate}</small></td><td data-label="시리얼">{a.serialNumber || '—'}</td><td data-label="예약">{a.quantity}</td><td data-label="피킹">{a.pickedQuantity}</td><td data-label="검수">{a.inspectedQuantity}</td><td data-label="실제 수량 입력" className="document-detail-wide"><QuantityInput unit={l.unit} aria-label={`작업 수량 ${i + 1}`} type="number" min={inspect ? 0 : a.pickedQuantity} max={inspect ? a.pickedQuantity : a.quantity} step="0.001" disabled={blocked || !canWork} value={manual[a.id] ?? String(inspect ? a.inspectedQuantity : a.pickedQuantity)} onChange={e => { if (!dirty) setManualVersion(data.shipment.version); setManual(v => ({ ...v, [a.id]: e.target.value })) }} /></td></tr> })}</tbody></table></div>
      <div className="receipt-actions"><button type="button" className="primary" disabled={blocked || !dirty || !canWork} onClick={() => void save(false)}>수동 수량 저장</button></div>
    </section>
  </DetailSurface>
}
