import BusinessDocumentMenu from './BusinessDocumentMenu'
import { t as uiText, getLocale } from '../../i18n.ts'
import ReceiptPhotos from './ReceiptPhotos'
import { useMobile } from '../../use-mobile'
import type { ReactNode } from 'react'
import { receiptStatuses } from '../../receipt-model'
import FormLabel from '../FormLabel'
import QuantityInput from './QuantityInput'
import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../api'
import BarcodeScanInput from './BarcodeScanInput'
import type { BarcodeScanEvent } from '../../barcode-scan'
import { quantityError, trackingError } from '../../receipt-model'
import type { ReceiptDetail, ReceiptLine } from '../../receipt-model'
import { restoreScanQueue, scanProgress } from '../../receipt-scan'
import type { ScanCommand, ScanResponse } from '../../receipt-scan'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import { requestNavigation } from '../../navigation-guard'
import UnsavedChangesDialog from './UnsavedChangesDialog'
import DetailSurface from './DetailSurface'
import ReceiptTrackingDialog from './ReceiptTrackingDialog'
import { receiptProductGroups, groupAllocations, groupInspectionStatus, allocationIssue } from '../../receipt-groups'
import Pagination from '../Pagination'
import './receipt-scan.css'

type History = { items: { id: number; action: string; lineId: string | null; scanRequestId: string | null; barcode: string | null; previousQuantity: number | null; quantity: number | null; reason: string | null; createdAt: string; actor: string }[]; total: number; page: number; pageSize: number }
type Manual = { lineId: string; quantity: string; version: string }
export default function ReceiptBarcodeInspection({ initial, endpoint, onChange, onClose }: { initial: ReceiptDetail; endpoint: string; onChange: (d: ReceiptDetail) => void; onClose: () => void }) {
  const url = `${endpoint}/${initial.receipt.id}`, storageKey = `wms-receipt-scan:${url}`
  const [data, setData] = useState(initial), latest = useRef(initial), input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ScanCommand[]>(() => restoreScanQueue(sessionStorage.getItem(storageKey)))
  const queue = useRef(pending), sending = useRef(false), selection = useRef<string | null>(null)
  const [paused, setPaused] = useState(pending.length > 0), [candidates, setCandidates] = useState<string[]>([]), [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState(pending.length ? '확인하지 못한 요청이 있습니다. 같은 요청 재시도로 저장 결과를 확인하세요.' : ''), [error, setError] = useState(''), [exceeded, setExceeded] = useState<string | null>(null)
  const [manual, setManualState] = useState<Manual | null>(null), [finishing, setFinishing] = useState(false)
  const [bulkFilling, setBulkFilling] = useState(false), bulkFlight = useRef(false)
  const manualDraft = useRef<Manual | null>(null)
  const setManual = (value: Manual | null) => { manualDraft.current = value; setManualState(value) }
  const [lastScan, setLastScan] = useState<{ requestId: string; lineId: string; groupByProduct: boolean } | null>(null)

  const [trackingModal, setTrackingModal] = useState<{ productId: string; tab: 'lot' | 'serial' } | null>(null), [serialDirty, setSerialDirty] = useState(false)
  const [photoPending, setPhotoPending] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const finishFlight=useRef(false)
  const navigation = useUnsavedNavigation(!!manual || serialDirty || pending.length > 0 || finishing || bulkFilling, pending.length > 0 || finishing || bulkFilling)
  const update = (d: ReceiptDetail) => { latest.current = d; setData(d); onChange(d) }
  const remember = () => { setPending([...queue.current]); if (queue.current.length) sessionStorage.setItem(storageKey, JSON.stringify(queue.current)); else sessionStorage.removeItem(storageKey) }
  const focusScan = () => input.current?.focus({ preventScroll: true })
  function editQuantity(line: ReceiptLine) { setManual({ lineId: line.id, quantity: String(receiptProductGroups(latest.current.lines).find(g => g.productId === line.productId)?.inspectedQuantity ?? 0), version: latest.current.receipt.version }) }
  async function pump() {
    if (sending.current || !queue.current.length) return false
    let applied = true
    const restoreScannerFocus = queue.current[0]?.kind === 'scan'
    sending.current = true; setPaused(false); setCandidates([])
    try {
      while (queue.current.length) {
        const command = queue.current[0]
        if (command.kind === 'scan' && !command.groupByProduct && !command.lineId && selection.current) { command.lineId = selection.current; remember() }
        try {
          const { kind, ...body } = command
          const result = await api<ScanResponse>(url + (kind === 'scan' ? '/scan-inspection' : '/inspection-quantity'), body)
          update(result.detail); setError(''); setExceeded(null)
          if (result.outcome === 'select-line') { setCandidates(result.candidateLineIds); setPaused(true); setMessage('같은 상품이 여러 행에 있습니다. LOT·유통기한을 확인하고 검수 대상 행을 선택하세요.'); break }
          queue.current.shift(); remember()
          const line = result.detail.lines.find(l => l.id === result.lineId)
          if (result.outcome !== 'applied') applied = false
          if (result.outcome === 'over-limit') { setExceeded(result.lineId || null); setError('예정 수량을 초과했습니다. 검수 수량은 변경되지 않았습니다.') }
          else if (result.outcome === 'manual' && line) { editQuantity(line); setMessage(`${line.productName} · ${line.unit} 상품은 실제 검수 수량을 직접 입력하세요. 스캔 횟수로 증가하지 않습니다.`) }
          else { setMessage(`${line?.productName || '검수 수량'} · ${receiptProductGroups(result.detail.lines).find(g=>g.productId===line?.productId)?.inspectedQuantity ?? 0} ${line?.unit || ''} 저장${result.replayed ? ' 확인 (중복 증가 없음)' : ' 완료'}`); if (kind === 'scan' && result.requestId && result.lineId) setLastScan({ requestId: result.requestId, lineId: result.lineId, groupByProduct: !!command.groupByProduct }); else { setManual(null); setLastScan(null) } }
          if (result.lineId && kind === 'scan' && result.outcome === 'applied') { selection.current = result.lineId; setSelected(result.lineId) }
        } catch (e) {
          applied = false
          setError(e instanceof Error ? e.message : '저장 결과를 확인하지 못했습니다.')
          // A timeout/5xx may have committed. Keep the SAME event ID, including across refreshes.
          if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500 || e.status === 429) { setPaused(true); break }
          queue.current.shift(); remember()
          if (e.status === 409) { try { update(await api<ReceiptDetail>(url)) } catch { /* retain the last confirmed data */ } }
          if (command.kind === 'quantity') setManual(null) // Restore confirmed values after a rejected correction.
        }
      }
    } finally { sending.current = false; if (restoreScannerFocus && !manualDraft.current) focusScan() }
    return applied && !queue.current.length
  }
  function enqueue(command: ScanCommand) {
    if (queue.current.length >= 100) { setError('처리 대기 중인 스캔이 100건입니다. 저장 결과를 확인한 뒤 다시 스캔하세요.'); return false }
    queue.current.push(command); remember(); if (!paused && !candidates.length) void pump(); return true
  }
  function scan(event: BarcodeScanEvent) {
    if(photoBusy||photoPending||bulkFlight.current||manualDraft.current||latest.current.receipt.status!=='Inspecting'||latest.current.receipt.inspectedAt)return false
    return enqueue({ kind: 'scan', ...event, lineId: null, groupByProduct: true })
  }
  function choose(lineId: string) {
    selection.current = lineId; setSelected(lineId)
    if (queue.current[0]?.kind === 'scan') queue.current[0].lineId = lineId
    remember(); void pump()
  }
  async function finish() {
    if (bulkFlight.current || sending.current || queue.current.length || manualDraft.current || finishFlight.current || latest.current.receipt.inspectedAt) return
    for(const group of receiptProductGroups(latest.current.lines)){const issue=group.lines.some(l=>l.trackingAllocations!=null)?allocationIssue(group,groupAllocations(group)):group.lines.map(l=>trackingError(l,l.inspectedQuantity??0,l.lotNumber||'',l.expiryDate||'',l.serials.join('\n'))).find(Boolean);if(issue){setError(`${group.productName}: ${issue}`);return}}
    finishFlight.current=true
    setFinishing(true); setError('')
    try {
      const d = latest.current
      const saved = await api<ReceiptDetail>(url + '/inspection', { version: d.receipt.version, reason: '통합 검수 확정', lines: d.lines.map(l => ({ lineId: l.id, quantity: l.inspectedQuantity ?? 0, lotNumber: l.lotNumber, expiryDate: l.expiryDate, serials: l.serials })) })
      navigation.saved(); update(saved); setMessage('검수가 확정되었습니다. 보관 위치를 지정해 주세요.'); setLastScan(null)
    } catch (e) { setError(e instanceof Error ? e.message : '검수 완료에 실패했습니다.'); try { update(await api<ReceiptDetail>(url)) } catch { /* keep latest data */ } }
    finally { finishFlight.current=false;setFinishing(false) }
  }
  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    let live = true
    const refresh = () => {
      if (document.hidden || photoBusy || photoPending || bulkFlight.current || sending.current || queue.current.length || manualDraft.current || finishing || trackingModal) return
      const version = latest.current.receipt.version
      api<ReceiptDetail>(url).then(d => {
        // A poll started before typing/saving must not replace the draft or a newer response.
        if (live && !bulkFlight.current && !manualDraft.current && !sending.current && !queue.current.length && latest.current.receipt.version === version) { latest.current = d; setData(d); onChange(d) }
      }).catch(() => { if (live && !manualDraft.current) setError('최신 검수 조회에 실패했습니다. 마지막 저장 수량을 표시합니다.') })
    }
    const timer = window.setInterval(refresh, 15000); document.addEventListener('visibilitychange', refresh)
    return () => { live = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [url, onChange, manual, finishing, trackingModal, photoBusy, photoPending])
  const progress = scanProgress(data.lines), canWork = data.receipt.status === 'Inspecting' && !data.receipt.inspectedAt, workBusy = pending.length > 0 || finishing || bulkFilling, blocked = workBusy || photoBusy || photoPending

  async function fillExpectedQuantities() {
    const current = latest.current
    if (bulkFlight.current || sending.current || queue.current.length || manualDraft.current || finishFlight.current || trackingModal || current.receipt.status !== 'Inspecting' || current.receipt.inspectedAt) return
    const targets = receiptProductGroups(current.lines).filter(group => group.lines.some(line => line.inspectedQuantity !== line.expectedQuantity))
    if (!targets.length) return
    bulkFlight.current = true; setBulkFilling(true); setError(''); setLastScan(null)
    let completed = 0
    try {
      for (const group of targets) {
        // Issue one command at a time with the version returned by the previous save.
        // Uncertain failures stay in the existing durable retry queue with the same request ID.
        queue.current.push({ kind: 'quantity', groupByProduct: true, requestId: crypto.randomUUID(), version: latest.current.receipt.version, lineId: group.lines[0].id, quantity: group.expectedQuantity, reason: '예정 수량으로 검수수량 일괄 입력' })
        remember()
        if (!await pump()) break
        completed++
      }
      setMessage(completed === targets.length ? `${completed}종 상품의 검수 수량을 예정 수량으로 저장했습니다. LOT·시리얼 확인 후 검수를 확정하세요.` : `${completed}/${targets.length}종 저장 완료. 오류 또는 대기 중인 요청을 확인한 뒤 남은 수량을 다시 채워 주세요.`)
    } finally { bulkFlight.current = false; setBulkFilling(false) }
  }

  function saveQuantity() {
    const draft = manualDraft.current
    // Ref guards cover Enter followed immediately by blur, before React renders pending state.
    if (!draft || sending.current || queue.current.length || blocked || !canWork) return
    const line = latest.current.lines.find(l => l.id === draft.lineId)
    const group = receiptProductGroups(latest.current.lines).find(g => g.productId === line?.productId)
    const quantity = Number(draft.quantity)
    if (quantityError(draft.quantity, true) || !group || quantity > group.expectedQuantity || group.unit === 'EA' && !Number.isInteger(quantity)) {
      setError('검수 수량은 0 이상 예정 수량 이하로 입력하세요. EA는 정수, 계량 상품은 소수점 3자리까지 가능합니다.'); return
    }
    if (group.inspectedQuantity != null && quantity === group.inspectedQuantity) { setManual(null); setError(''); return }
    enqueue({ kind: 'quantity', groupByProduct: true, requestId: crypto.randomUUID(), version: draft.version, lineId: draft.lineId, quantity, reason: '검수수량 직접 수정' })
  }
  const groups=receiptProductGroups(data.lines), modalGroup=groups.find(g=>g.productId===trackingModal?.productId)
  return <DetailSurface hideListAction title={uiText("입고 상세 · 검수")} code={data.receipt.number} status={<span className={`status-badge ${data.receipt.status}`}>{uiText(receiptStatuses[data.receipt.status])}</span>} busy={workBusy || photoBusy} onClose={() => requestNavigation(onClose)} actions={<><BusinessDocumentMenu endpoint={url} type="receipts" disabled={workBusy || photoBusy} /><button className="primary" disabled={blocked || !!manual || !canWork || !!trackingModal} onClick={() => void finish()}>{uiText("검수 확정")}</button></>}>
    {modalGroup&&trackingModal&&<ReceiptTrackingDialog group={modalGroup} tab={trackingModal.tab} url={url} version={data.receipt.version} onDirtyChange={setSerialDirty} onClose={()=>{setTrackingModal(null);setSerialDirty(false)}} onSaved={saved=>{update(saved);setTrackingModal(null);setSerialDirty(false);setLastScan(null)}}/>}
    <UnsavedChangesDialog guard={navigation} />
    <section className="receipt-scan-summary"><div><small>{uiText("거래처 · 창고")}</small><strong>{data.receipt.partnerName} · {data.receipt.warehouseName}</strong></div><div><small>{uiText("입고 예정 상품")}</small><strong>{progress.total}{uiText("종")}</strong></div><div><small>{uiText("검수 완료 상품")}</small><strong>{progress.complete}{uiText("종")}</strong></div><div><small>{uiText("상품 종류 기준 진행률")}</small><strong>{progress.percent}%</strong><progress max="100" value={progress.percent} aria-label={uiText("상품 종류 기준 검수 진행률")} /></div></section>
    <ReceiptPhotos data={data} endpoint={endpoint} writable={canWork} busy={workBusy || !!manual || !!trackingModal} onPending={setPhotoPending} onBusy={setPhotoBusy} onChange={update} />
    <section className="receipt-scan-station">
      <BarcodeScanInput actions={<button type="button" className="secondary" disabled={blocked || !!manual || !canWork || !!trackingModal || progress.complete === progress.total} onClick={() => void fillExpectedQuantities()}>{bulkFilling ? uiText("수량 저장 중…") : uiText("예정 수량 일괄 입력")}</button>} showHelp={false} inputRef={input} label={uiText("검수 바코드")} onScan={scan} disabled={photoBusy || photoPending || !canWork || finishing || bulkFilling || !!manual || paused || !!trackingModal} />
      <div className="receipt-inspection-help">
        <InspectionHelp title={uiText("스캔 안내")}><p>{uiText("USB·Bluetooth 스캐너 또는 직접 입력 후 Enter/Tab으로 처리합니다.")}<br />{uiText("카메라는 한 번에 하나씩 인식합니다.")}</p></InspectionHelp>
        <InspectionHelp title={uiText("수량 처리")}><p>{uiText("포장 바코드는 문서에 저장된 EA 환산 수량만큼 반영됩니다.")}<br />{uiText("직접 입력한 수량은 Enter 또는 포커스 이동 시 저장됩니다.")}</p></InspectionHelp>
        <InspectionHelp title={uiText("검수 상태")}><p>{uiText("대기 중에는 다른 담당자의 변경을 15초마다 확인합니다.")}<br />{uiText("실제 재고는 보관 위치 배치 후 최종 입고 확정 시 증가합니다.")}</p></InspectionHelp>
      </div>
    {pending.length > 0 && <p role="status">{pending.length}{uiText("건 처리 대기")}{paused ? uiText("· 확인 필요") : uiText("· 저장 중")}</p>}{message && <p role="status" className="alert">{uiText(message)}</p>}{error && <p role="alert" className="alert error">{uiText(error)}</p>}
    {paused && !candidates.length && <button className="primary" type="button" onClick={() => void pump()}>{uiText("같은 요청 재시도")}</button>}
    {!!candidates.length && <div className="receipt-scan-candidates" aria-label={uiText("검수 대상 행 선택")}>{data.lines.filter(l => candidates.includes(l.id)).map(l => <button className="secondary" key={l.id} type="button" onClick={() => choose(l.id)}>{l.productName} · LOT {l.lotNumber || uiText("없음")} · {l.expiryDate || uiText("유통기한 없음")} {uiText("· 시리얼")} {l.serials.length}{uiText("개 ·")} {l.inspectedQuantity ?? 0}/{l.expectedQuantity} {l.unit} {uiText("· 행")} {data.lines.indexOf(l) + 1}</button>)}</div>}
    {lastScan && <button className="secondary" disabled={blocked || !!manual || !canWork} onClick={() => { enqueue({ kind: 'quantity', groupByProduct: lastScan.groupByProduct, requestId: crypto.randomUUID(), version: latest.current.receipt.version, lineId: lastScan.lineId, undoScanRequestId: lastScan.requestId, reason: '담당자 요청: 최근 스캔 1회 되돌리기' }) }}>{uiText("최근 스캔 1회 되돌리기")}</button>}
    </section>
    <div className="table-scroll"><table className="organization-table receipt-scan-table receipt-product-table document-detail-products"><thead><tr>{['상품명','예정 수량','차이','검수 수량','LOT / 유통기한','시리얼','상태'].map(t=><th key={t}><FormLabel required={canWork && t === '검수 수량'}>{uiText(t)}</FormLabel></th>)}</tr></thead><tbody>{groups.map((group,index)=>{
      const l=group.lines[0],editing=manual?.lineId===l.id,entries=groupAllocations(group),lots=entries.filter(a=>a.lotNumber||a.expiryDate),serialCount=entries.reduce((n,a)=>n+a.serials.length,0)
      const quantity=editing?Number(manual.quantity):group.inspectedQuantity??0,difference=Math.round((quantity-group.expectedQuantity)*1000)/1000
      return <tr key={group.productId} className={group.lines.some(row=>row.id===selected)?'is-scan-selected':''}>
        <td data-label={uiText("상품명")} className="document-detail-product"><strong>{group.productName}</strong><small>{group.productCode}</small></td><td data-label={uiText("예정 수량")} className="receipt-number">{group.expectedQuantity.toLocaleString()} {group.unit}</td>
        <td data-label={uiText("차이")} className={`receipt-number ${difference!==0?'receipt-difference':''}`}>{difference>0 ? '+' : ''}{difference.toLocaleString()} {group.unit}</td>
        <td data-label={uiText("검수 수량")} className="receipt-inspection-quantity"><QuantityInput aria-required={canWork} unit={group.unit} aria-label={uiText("검수 수량 {v0}", { v0: index+1 })} data-testid={`scan-quantity-${l.id}`} type="number" min="0" max={group.expectedQuantity} step={group.unit==='EA'?'1':'0.001'} disabled={blocked||!canWork||!!manual&&!editing||!!trackingModal} value={editing?manual.quantity:group.inspectedQuantity??''} onChange={e=>setManual(editing?{...manual,quantity:e.target.value}:{lineId:l.id,quantity:e.target.value,version:latest.current.receipt.version})} onBlur={saveQuantity} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();saveQuantity()}}}/>

        </td>
        <td data-label={uiText("LOT / 유통기한")} className="receipt-inspection-lots"><span>LOT {lots.length}{uiText("개")}</span>{lots.length > 0 && <div className="receipt-inspection-lot-list">{lots.map((lot, i) => <div key={i}><span>{lot.lotNumber || uiText("LOT 미지정")}</span><small>{lot.expiryDate || uiText("유통기한 없음")}</small></div>)}</div>}<button type="button" className="secondary" aria-label={uiText("{v0} LOT 관리", { v0: group.productName })} disabled={blocked||!canWork||!!manual} onClick={()=>setTrackingModal({productId:group.productId,tab:'lot'})}>{uiText("+ 추가 / 관리")}</button></td>
        <td data-label={uiText("시리얼")}><span>{uiText("시리얼")} {serialCount}{uiText("개")}</span><button type="button" className="secondary" aria-label={uiText("{v0} 시리얼 관리", { v0: group.productName })} disabled={blocked||!canWork||!!manual} onClick={()=>setTrackingModal({productId:group.productId,tab:'serial'})}>{uiText("+ 추가 / 관리")}</button></td>
        <td data-label={uiText("상태")}><span className={`status-badge ${quantity===group.expectedQuantity?'Confirmed':''}`}>{exceeded===l.id ? uiText("수량 불일치") : groupInspectionStatus({...group,inspectedQuantity:editing?quantity:group.inspectedQuantity},!!data.receipt.inspectedAt,editing)}</span></td>
      </tr>
    })}</tbody></table></div>
    <ReceiptInspectionHistory url={url} version={data.receipt.version} />
  </DetailSurface>
}

export function ReceiptInspectionHistory({ url, version }: { url: string; version: string }) {
  const [historyOpen, setHistoryOpen] = useState(false), [historyPage, setHistoryPage] = useState(1), [history, setHistory] = useState<History | null>(null), [historyError, setHistoryError] = useState('')
  useEffect(() => {
    if (!historyOpen) return
    let live = true
    api<History>(url + '/inspection-history?page=' + historyPage).then(h => { if (live) { setHistory(h); setHistoryError('') } }).catch(() => { if (live) setHistoryError('검수 이력을 불러오지 못했습니다.') })
    return () => { live = false }
  }, [historyOpen, historyPage, url, version])
  const actionNames: Record<string, string> = { PhotosChanged: '입고 사진 변경', TrackingUpdated: '추적 정보 저장', BarcodeScanned: '바코드 스캔', QuantityCorrected: '수량 수정', ScanUndone: '스캔 되돌리기', Inspected: '검수 완료', InspectionStarted: '검수 시작', Created: '입고 등록', Updated: '입고 수정', Placed: '위치 배치', Confirmed: '입고 확정', Cancelled: '입고 취소' }
  return <details className="receipt-scan-history" open={historyOpen} onToggle={e => setHistoryOpen(e.currentTarget.open)}><summary>{uiText("검수 변경 이력")}</summary>{historyError && <p role="alert">{uiText(historyError)}</p>}{history && <><div className="table-scroll"><table className="organization-table"><thead><tr>{['일시','작업','바코드','수량 변경','사유','담당자'].map(t => <th key={t}>{uiText(t)}</th>)}</tr></thead><tbody>{history.items.map(h => <tr key={h.id}><td>{new Date(h.createdAt).toLocaleString(getLocale())}</td><td>{uiText(actionNames[h.action] || h.action)}</td><td>{h.barcode || '—'}</td><td>{h.quantity == null ? '—' : `${h.previousQuantity} → ${h.quantity}`}</td><td>{h.reason || '—'}</td><td>{h.actor}</td></tr>)}</tbody></table></div><Pagination page={historyPage} total={history.total} pageSize={30} onChange={setHistoryPage} /></>}</details>
}

function InspectionHelp({title,children}:{title:string;children:ReactNode}) {
 const mobile=useMobile()
 return mobile ? <details><summary><h3>{uiText(title)}</h3></summary>{children}</details> : <div><h3>{uiText(title)}</h3>{children}</div>
}
