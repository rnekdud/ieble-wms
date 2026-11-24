import BusinessDocumentMenu from './BusinessDocumentMenu'
import { t as uiText, getLocale } from '../../i18n.ts'
import ReceiptPhotos, { ReceiptPhotoPicker } from './ReceiptPhotos'
import { useReceiptPhotos } from '../../use-receipt-photos'
import { photoRequest } from '../../receipt-photos'
import PageSizeSelect from '../PageSizeSelect'
import FormLabel from '../FormLabel'
import QuantityInput from './QuantityInput'
import ReportPeriodFields from './ReportPeriodFields'
import BusinessAssigneeDetails from './BusinessAssigneeDetails'
import SearchFilters from './SearchFilters'
import BusinessAssigneeField from "./BusinessAssigneeField"
import { useCurrentAssignee } from "../../business-assignee"
import ReceiptInspectionSummary from './ReceiptInspectionSummary'
import { receiptPlacementSlices, receiptProductGroups, groupAllocations, allocationIssue, distributeTracking } from '../../receipt-groups'
import type { GroupAllocation, ReceiptProductGroup } from '../../receipt-groups'
import { resizePlannedGroup } from '../../receipt-planned'
import ReceiptTrackingDialog from './ReceiptTrackingDialog'
import UnsavedChangesContent from './UnsavedChangesContent'
import SerialInputDialog from './SerialInputDialog'
import { lineQuantityError, lineTrackingError } from '../../document-line-model'
import type { ImportedProduct } from '../../document-paste'
import './document-line-table.css'
import DocumentPasteDialog from './DocumentPasteDialog'
import ProductSelectionDialog from './ProductSelectionDialog'
import { appendImportedProducts, pasteLimit } from '../../document-paste'
import ReceiptBarcodeInspection, { ReceiptInspectionHistory } from './ReceiptBarcodeInspection'
import RegistrationSurface, { RegistrationPrompt, RegistrationFields } from './RegistrationSurface'
import { businessEntry } from '../../dashboard-model'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import Pagination from '../Pagination'
import OrganizationDialog from './OrganizationDialog'
import DetailSurface from './DetailSurface'
import { PageHeading } from './WorkspaceUI'
import { requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import { quantityError, receiptStatuses, splitSerials, unitTotals, placementComparison, receiptPlacementReady, retailAmount, receiptRetailTotals } from '../../receipt-model'
import type { Choice, ReceiptDetail, ReceiptList, ReceiptLine } from '../../receipt-model'
import './receipts.css'
import ChoiceField from './BusinessChoiceField'

export default function ReceiptManagement({ tenantId, grants, registration = false, detailId, onNavigate }: { tenantId: string; grants: string[]; registration?: boolean; detailId?: string; onNavigate: (path: string) => void }) {
  const endpoint = `/api/tenants/${tenantId}/receipts`
  const [query, setQuery] = useState({ search: '', status: 'all', warehouseId: '', from: '', to: '', page: 1, pageSize: 20 })
  const [filters, setFilters] = useState(query)
  const [revision, refresh] = useState(0), [data, setData] = useState<{ key: string; value: ReceiptList } | null>(null), [error, setError] = useState(''), [notice] = useState('')
  const [selection] = useState<{ id: string | null } | null>(() => businessEntry(window.location.search, grants.includes('create'))), [warehouse, setWarehouse] = useState<Choice>()
  const params = new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '').map(([k, v]) => [k, String(v)])))
  const url = `${endpoint}?${params}`, key = `${url}:${revision}`, loading = data?.key !== key
  useEffect(() => { if (registration || detailId) return; let live = true; const timer = setTimeout(() => { api<ReceiptList>(url).then(value => { if (live) { setData({ key, value }); setError('') } }).catch(e => { if (live) setError(e.message) }) }, 180); return () => { live = false; clearTimeout(timer) } }, [url, key, registration, detailId])
  useEffect(() => { if (!registration && !detailId && selection) onNavigate(selection.id ? `/app/receipts/${selection.id}` : '/app/receipts/new') }, [registration, detailId, selection, onNavigate])
  function filter(values: Partial<typeof query>) { setFilters(q => ({ ...q, ...values, page: 1 })) }
  if (detailId) return <ReceiptDetailPage key={detailId} id={detailId} endpoint={endpoint} grants={grants} onClose={() => onNavigate('/app/receipts')} />
  if (registration) return !grants.includes('create') ? <p role="alert">{uiText("입고 등록 권한이 없습니다.")}</p> : <ReceiptEditor page mode="edit" endpoint={endpoint} onClose={() => onNavigate('/app/receipts')} onSaved={() => onNavigate('/app/receipts')} />
  return <>
    <PageHeading title={uiText("입고관리")} actions={<> {grants.includes('create') && <button className="primary" onClick={() => onNavigate('/app/receipts/new')}>{uiText("입고 등록")}</button>} </>} />
    {notice && <p className="alert" role="status">{uiText(notice)}</p>}{error && <p className="alert error" role="alert">{uiText(error)}<button className="secondary" onClick={() => refresh(n => n + 1)}>{uiText("다시 시도")}</button></p>}
    <section className="wms-card products-card">
      <SearchFilters onReset={() => { const next = { search: '', status: 'all', warehouseId: '', from: '', to: '', page: 1, pageSize: 20 }; setFilters(next); setQuery(next); setWarehouse(undefined); refresh(n => n + 1) }} busy={loading && !error} onSearch={() => { setQuery({ ...filters, page: 1 }); refresh(n => n + 1) }} className="products-toolbar receipt-filters inline-period-filters receipt-list-filters">

        <ReportPeriodFields prefix="예정일" start={filters.from} end={filters.to} onChange={range => setFilters(x => ({ ...x, from:range.start, to:range.end }))} />
        <label>{uiText("상태")}<select aria-label={uiText("입고 상태 필터")} value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="all">{uiText("전체 상태")}</option>{Object.entries(receiptStatuses).map(([v, l]) => <option key={v} value={v}>{uiText(l)}</option>)}</select></label>

      <ChoiceField endpoint={endpoint} kind="warehouses" label={uiText("창고")} placeholder={uiText("창고")} emptyOptionLabel="전체 창고" searchPlaceholder={uiText("창고명·시스템 코드·내부 코드 검색")} value={filters.warehouseId} current={warehouse} onChange={w => { setWarehouse(w); filter({ warehouseId: w?.id || '' }) }} />
      <label>{uiText("입고 검색")}<input aria-label={uiText("입고 검색")} value={filters.search} placeholder={uiText("입고번호·거래처·상품명·코드")} maxLength={100} onChange={e => setFilters({ ...filters, search: e.target.value })} /></label>
</SearchFilters>
      <div className="table-scroll"><table className="organization-table mobile-record-table receipt-list-table"><thead><tr>{['입고번호', '입고 예정일', '거래처', '창고', '상품 종류', '예정 수량 (단위별)', '상태', '등록일', '관리'].map(x => <th key={x}>{uiText(x)}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={9}>{error ? uiText("입고를 불러오지 못했습니다.") : uiText("입고를 불러오는 중…")}</td></tr> : !data.value.items.length ? <tr><td colSpan={9}>{uiText("조회된 입고가 없습니다.")}</td></tr> : data.value.items.map(({ receipt: r, productCount, totals }) => <tr key={r.id}><td data-label={uiText("입고번호")}>{r.number}</td><td data-label={uiText("입고 예정일")}>{r.expectedDate}</td><td data-label={uiText("거래처")}>{r.partnerName}</td><td data-label={uiText("창고")}>{r.warehouseName}</td><td data-label={uiText("상품 종류")}>{productCount}</td><td data-label={uiText("예정 수량")}>{unitTotals(totals)}</td><td data-label={uiText("상태")}><span className={`status-badge ${r.status}`}>{uiText(receiptStatuses[r.status])}</span></td><td data-label={uiText("등록일")}>{new Date(r.createdAt).toLocaleDateString(getLocale())}</td><td data-label={uiText("관리")}><button className="secondary" aria-label={uiText("{v0} 상세", { v0: r.number })} onClick={() => onNavigate(`/app/receipts/${r.id}`)}>{uiText("상세")}</button></td></tr>)}</tbody></table></div>
      <Pagination pageSizeControl={<PageSizeSelect value={query.pageSize} onChange={pageSize => { setQuery(v => ({ ...v, pageSize, page: 1 })); setFilters(v => ({ ...v, pageSize, page: 1 }));  }} />} page={query.page} pageSize={query.pageSize} total={data?.value.total || 0} loading={loading} onChange={page => setQuery(q => ({ ...q, page }))} label={uiText("입고 목록 페이지")} />
    </section>

  </>
}
function ReceiptDetailPage({ id, endpoint, grants, onClose }: { id: string; endpoint: string; grants: string[]; onClose: () => void }) {
  const [data, setData] = useState<ReceiptDetail | null>(null), [mode, setMode] = useState('view'), [error, setError] = useState(''), [busy, setBusy] = useState(false), [action, setAction] = useState<string | null>(null), [retry, setRetry] = useState(0)
  const [photoPending, setPhotoPending] = useState(false)
  const flight = useRef(false)
  useUnsavedNavigation(busy, busy)
  useEffect(() => { if (!id) return; let live = true; api<ReceiptDetail>(`${endpoint}/${id}`).then(d => { if (live) { setData(d); setError('') } }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [id, endpoint, retry])
  function saved(value: ReceiptDetail) { setData(value); setMode('view'); setAction(null) }
  async function run() { if (!data || !action || flight.current) return; flight.current = true; setBusy(true); setError(''); try { saved(await api<ReceiptDetail>(`${endpoint}/${data.receipt.id}/${action}`, { version: data.receipt.version })) } catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했습니다.'); setAction(null) } finally { flight.current = false; setBusy(false) } }
  if (mode === 'view' && data?.receipt.status === 'Inspecting' && !data.receipt.inspectedAt && grants.includes('update')) return <ReceiptBarcodeInspection initial={data} endpoint={endpoint} onChange={setData} onClose={onClose} />
  if (mode !== 'view' && (!id || data)) return <ReceiptEditor key={mode} page mode={mode} initial={data || undefined} endpoint={endpoint} onSaved={saved} onClose={() => data ? setMode('view') : onClose()} />
  const r = data?.receipt, writable = grants.includes('update') && r && ['Planned', 'Inspecting'].includes(r.status)
  const actionLabel = action === 'confirm' ? '입고 최종 확정' : action === 'cancel' ? '입고 취소' : '검수 시작'
  const placed = !!data && receiptPlacementReady(data.lines)
  const workActions = r && !action && <div className="receipt-actions">
    <BusinessDocumentMenu endpoint={`${endpoint}/${r.id}`} type="receipts" disabled={busy} />
    {writable && <>{!r.inspectedAt && <button disabled={busy || photoPending} className="secondary" onClick={() => setMode('edit')}>{uiText("입고 정보 수정")}</button>}<button disabled={busy || photoPending} className="secondary" onClick={() => setAction('cancel')}>{uiText("입고 취소")}</button>
      {r.status === 'Planned' && <button disabled={busy || photoPending} className="primary" onClick={() => setAction('start-inspection')}>{uiText("검수 시작")}</button>}
      {r.status === 'Inspecting' && r.inspectedAt && <button disabled={busy || photoPending} className={placed ? 'secondary' : 'primary'} onClick={() => setMode('placements')}>{uiText("보관 위치 지정")}</button>}
    </>}
    {r.status === 'Inspecting' && r.inspectedAt && placed && grants.includes('confirm') && <button disabled={busy || photoPending} className="primary" onClick={() => setAction('confirm')}>{uiText("입고 최종 확정")}</button>}
  </div>
  return <DetailSurface hideListAction title={uiText("입고 상세")} code={r?.number} status={r && <span className={`status-badge ${r.status}`}>{uiText(receiptStatuses[r.status])}</span>} actions={workActions} busy={busy} onClose={() => requestNavigation(onClose)}>
    {action && <OrganizationDialog confirmation title={uiText("{v0} 확인", { v0: uiText(actionLabel) })} size="small" busy={busy} onClose={() => setAction(null)}><section className="receipt-confirm" role="alertdialog" aria-label={uiText("{v0} 확인", { v0: uiText(actionLabel) })}><p>{action === 'confirm' ? uiText("검수 수량을 재고에 반영합니다. 확정 후에는 이 문서를 수정·취소할 수 없습니다.") : action === 'cancel' ? uiText("입고를 취소하시겠습니까? 재고에는 반영되지 않습니다.") : uiText("검수를 시작하시겠습니까?")}</p><div className="receipt-actions"><button className="secondary" disabled={busy} onClick={() => setAction(null)}>{uiText("계속 보기")}</button><button className="primary" disabled={busy} onClick={run}>{busy ? uiText("처리 중…") : uiText("확인")}</button></div></section></OrganizationDialog>}
    {error && <p role="alert" className="alert error">{uiText(error)} <button className="secondary" onClick={() => setRetry(n => n + 1)}>{uiText("다시 조회")}</button></p>}
    {!data || !r ? !error && <p role="status">{uiText("입고를 불러오는 중…")}</p> : <>

      <ol className="receipt-steps"><li className="done">{uiText("1 입고 예정")}</li><li className={r.status === 'Inspecting' || r.status === 'Confirmed' ? 'done' : ''}>{uiText("2 검수")}</li><li className={r.inspectedAt && data.lines.every(l => l.inspectedQuantity === Math.round(l.placements.reduce((sum, p) => sum + p.quantity, 0) * 1000) / 1000) ? 'done' : ''}>{uiText("3 위치 배치")}</li><li className={r.status === 'Confirmed' ? 'done' : ''}>{uiText("4 입고 확정")}</li></ol>
      <dl className="products-detail"><div><dt>{uiText("예정일 / 창고")}</dt><dd>{r.expectedDate} / {r.warehouseName}</dd></div><div><dt>{uiText("거래처 / 담당자")}</dt><dd><BusinessAssigneeDetails feature="receipts" userId={r.contactUserId} name={r.contactName} prefix={`${r.partnerName} / `} /></dd></div><div><dt>{uiText("검수 완료")}</dt><dd>{r.inspectedAt ? new Date(r.inspectedAt).toLocaleString(getLocale()) : uiText("검수 전")}</dd></div><div><dt>{uiText("확정 일시")}</dt><dd>{r.confirmedAt ? new Date(r.confirmedAt).toLocaleString(getLocale()) : uiText("미확정 · 재고 반영 전")}</dd></div>{r.notes && <div><dt>{uiText("비고")}</dt><dd>{r.notes}</dd></div>}</dl>
      <ReceiptPhotos data={data} endpoint={endpoint} writable={!!writable} busy={busy} onBusy={setBusy} onPending={setPhotoPending} onChange={setData} />
      <ReceiptInspectionSummary data={data} />
      <ReceiptInspectionHistory url={`${endpoint}/${r.id}`} version={r.version} />
      {r.status === 'Confirmed' && <ReceiptStock endpoint={`${endpoint}/${r.id}/stock`} />}

    </>}
  </DetailSurface>
}
function ReceiptStock({ endpoint }: { endpoint: string }) {
  const [data, setData] = useState<{ balances: { id: string; quantity: number; unit: string; serialNumber: string | null; lotNumber: string | null; locationId: string }[]; movements: unknown[] } | null>(null), [error, setError] = useState('')
  useEffect(() => { let live = true; api<NonNullable<typeof data>>(endpoint).then(d => { if (live) setData(d) }).catch(() => { if (live) setError('재고 반영 내역을 불러오지 못했습니다. 상세를 다시 열어 주세요.') }); return () => { live = false } }, [endpoint])
  return <section className="receipt-confirm"><strong>{uiText("재고 반영 결과")}</strong>{error ? <p role="alert">{uiText(error)}</p> : data ? <p>{unitTotals(data.balances.map(b => ({ unit: b.unit, quantity: b.quantity })))} {uiText("· 재고 항목")} {data.balances.length}{uiText("개 · 변동 이력")} {data.movements.length}{uiText("건")}</p> : <p>{uiText("재고 반영 내역 확인 중…")}</p>}</section>
}

type EditLine = { allocations?: GroupAllocation[]; sources?: ReceiptLine[]; rackChanged?: boolean; trackingId?: string | null; rack?: Choice; key: string; lineId: string; product?: Choice; quantity: string; lot: string; expiry: string; serialText: string; placements: { key: string; location?: Choice; quantity: string; serialText: string }[] }
function ReceiptEditor({ page = false, mode, initial, endpoint, onSaved, onClose }: { page?: boolean; mode: string; initial?: ReceiptDetail; endpoint: string; onSaved: (d: ReceiptDetail) => void; onClose: () => void }) {
  const choice = (id: string, name: string): Choice => ({ id, name, code: '', unit: null, lotManaged: false, expiryManaged: false, serialManaged: false })
  const currentAssignee = useCurrentAssignee()
  const [basic, setBasic] = useState(() => ({ date: initial?.receipt.expectedDate || new Date().toLocaleDateString('en-CA'), partner: initial ? choice(initial.receipt.partnerId, initial.receipt.partnerName) : undefined, warehouse: initial ? choice(initial.receipt.warehouseId, initial.receipt.warehouseName) : undefined, contactUserId: initial ? initial.receipt.contactUserId : currentAssignee?.id, contact: initial ? initial.receipt.contactName : currentAssignee?.name || '', notes: initial?.receipt.notes || '' }))
  const gallery = useReceiptPhotos(endpoint, initial?.receipt.id)
  const [photoReading, setPhotoReading] = useState(false)
  const [defaultRack, setDefaultRack] = useState<Choice>()
  const emptyLine = (): EditLine => ({ rack: defaultRack, key: crypto.randomUUID(), lineId: '', quantity: '', lot: '', expiry: '', serialText: '', placements: [] })
  const sourceLines = initial ? mode === 'placements' ? receiptPlacementSlices(initial.lines) : initial.lines : []
  const plannedGroups=mode==='edit'?receiptProductGroups(sourceLines.map(l=>({...l,inspectedQuantity:l.expectedQuantity}))):[]
  const [lines, setLines] = useState<EditLine[]>(() => initial ? (mode==='edit'?plannedGroups.map(g=>({...g.lines[0],expectedQuantity:g.expectedQuantity})):sourceLines).map((l,i) => ({ allocations:mode==='edit'?groupAllocations(plannedGroups[i]):undefined,sources:mode==='edit'?plannedGroups[i].lines:undefined, trackingId:l.placementTrackingId,key: l.id+(l.placementTrackingId||''), lineId: l.id, rack: l.plannedRackId ? { ...choice(l.plannedRackId, l.plannedRackName || '예정 랙'), code: l.plannedRackCode || '' } : undefined, product: { id: l.productId, retailPrice: l.retailPrice, currency: l.currency, name: l.productName, code: l.productCode, unit: l.unit, lotManaged: l.lotManaged, expiryManaged: l.expiryManaged, serialManaged: l.serialManaged }, quantity: String(mode === 'edit' ? l.expectedQuantity : l.inspectedQuantity ?? l.expectedQuantity), lot: l.lotNumber || '', expiry: l.expiryDate || '', serialText: l.serials.join('\n'), placements: l.placements.map(p => ({ key: crypto.randomUUID(), location: choice(p.locationId, p.locationCode || '저장된 보관 위치'), quantity: String(p.quantity), serialText: p.serials.join('\n') })) })) : [])
  const [pasteOpen, setPasteOpen] = useState(false), [selectionOpen, setSelectionOpen] = useState(false), [selectionDirty, setSelectionDirty] = useState(false)
  const [baseline] = useState(() => JSON.stringify({ basic, lines })), [requestId] = useState(() => crypto.randomUUID()), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState(false)
  const [trackingKey,setTrackingKey]=useState<string|null>(null)
  const [reason, setReason] = useState(''), [serialKey, setSerialKey] = useState<string | null>(null), focusKey = useRef<string | null>(null)
  useEffect(() => { if (focusKey.current) { const id = focusKey.current; focusKey.current = null; requestAnimationFrame(() => document.getElementById(`document-quantity-${id}`)?.focus()) } }, [lines])
  function addProducts(products: ImportedProduct[]) {
    const seen=new Set(lines.flatMap(l=>l.product?[l.product.id]:[])),accepted:ImportedProduct[]=[]
    let duplicates=0
    for(const item of products){if(seen.has(item.product.id)){duplicates++;continue}seen.add(item.product.id);accepted.push(item)}
    if(duplicates)setError('이미 등록된 상품입니다. 기존 상품의 총 수량을 수정해 주세요.')
    const next = appendImportedProducts(lines, accepted, emptyLine); focusKey.current = next[lines.length]?.key || null; setLines(next); setSelectionOpen(false); setSelectionDirty(false); setPasteOpen(false)
  }
  const serialLine = lines.find(l => l.key === serialKey)
  function plannedGroup(l:EditLine):ReceiptProductGroup {
    const sources=l.sources?.length?l.sources:[{id:l.key,productId:l.product!.id,productName:l.product!.name,productCode:l.product!.code,unit:l.product!.unit||'EA',expectedQuantity:Number(l.quantity)||0,inspectedQuantity:null,lotNumber:null,expiryDate:null,serials:[],placements:[],lotManaged:false,expiryManaged:false,serialManaged:false}]
    const group=resizePlannedGroup(receiptProductGroups(sources)[0],Number(l.quantity)||0)
    return group
  }
  function rowError(l: EditLine) {
    const quantityIssue=lineQuantityError(l, mode !== 'edit')
    if(quantityIssue)return quantityIssue
    if(mode!=='edit')return lineTrackingError(l,lines)
    try{return allocationIssue(plannedGroup(l),l.allocations||[])?.replaceAll('검수수량','예정 수량')||null}catch(e){return e instanceof Error?e.message:'예정 추적 정보를 확인해 주세요.'}
  }
  const trackingLine=lines.find(l=>l.key===trackingKey)
  const flight = useRef(false), dirty = JSON.stringify({ basic, lines }) !== baseline || !!reason || gallery.dirty
  const navigation = useUnsavedNavigation(dirty || selectionDirty || busy || photoReading, busy || photoReading, () => setConfirm(false))
  const retailTotals = receiptRetailTotals(lines)
  const placementIssues = lines.filter(l=>placementComparison(Number(l.quantity),l.placements.map(p=>p.quantity),l.product?.unit || '').status!=='matched')
  const title = uiText(mode === 'edit' ? initial ? '입고 수정' : '입고 등록' : mode === 'inspection' ? '입고 검수' : '보관 위치 지정')
  function change(index: number, patch: Partial<EditLine>) { setLines(items => items.map((l, i) => i === index ? { ...l, ...patch } : l)) }
  function validate() {
    if (photoReading) return '사진 준비가 끝난 후 저장해 주세요.'
    if (mode === 'edit' && (!basic.date || !basic.partner || !basic.warehouse || !basic.contact.trim())) return '예정일·거래처·창고·담당자를 입력해 주세요.'
    if (mode === 'inspection' && initial?.lines.some((l, i) => l.inspectedQuantity != null && l.inspectedQuantity !== Number(lines[i].quantity)) && !reason.trim()) return '검수 수량 수정 사유를 입력해 주세요.'
    if (mode === 'inspection' && lines.some((l, i) => Number(l.quantity) > (sourceLines[i]?.expectedQuantity ?? 0))) return '예정 수량을 초과했습니다.'
    if (!lines.length) return '입고 상품을 추가해 주세요.'
    for (const l of lines) {
      if (!l.product || lineQuantityError(l, mode !== 'edit')) return '상품과 수량을 확인해 주세요.'
      if (mode !== 'placements') { const problem = rowError(l); if (problem) return problem }
      else { const comparison = placementComparison(Number(l.quantity), l.placements.map(p => p.quantity), l.product.unit || ''); if (comparison.status !== 'matched') return `${l.product.name}: ${comparison.message}`; if (l.placements.some(p => !p.location)) return `${l.product.name}: 보관 위치를 선택해 주세요.` }
    }
    return null
  }
  async function save() {
    if (flight.current || photoReading) return; flight.current = true; setBusy(true); setError('')
    const version = initial?.receipt.version || '00000000-0000-0000-0000-000000000000'
    const payload = () => mode === 'edit' ? { requestId, version, ...(gallery.dirty ? { photos: photoRequest(gallery.photos), photosVersion: gallery.version } : {}), expectedDate: basic.date, partnerId: basic.partner!.id, warehouseId: basic.warehouse!.id, contactUserId: basic.contactUserId, contactName: basic.contact.trim(), notes: basic.notes.trim() || null, lines: lines.flatMap(l => {const group=plannedGroup(l),mapped=distributeTracking(group,l.allocations||[]);return group.lines.map((row,i)=>({lineId:l.sources?.some(s=>s.id===row.id)?row.id:null,productId:l.product!.id,expectedQuantity:row.expectedQuantity,plannedRackId:l.sources?.length&&!l.rackChanged?row.plannedRackId||null:l.rack?.id||null,trackingAllocations:mapped[i].allocations}))}) } : mode === 'inspection' ? { version, reason: reason.trim() || null, lines: lines.map(l => ({ lineId: l.lineId, quantity: Number(l.quantity), lotNumber: l.lot.trim() || null, expiryDate: l.expiry || null, serials: splitSerials(l.serialText) })) } : { version, lines: initial!.lines.map(original => ({ lineId: original.id, placements: lines.filter(l=>l.lineId===original.id).flatMap(l=>l.placements.map(p=>({ trackingId:l.trackingId ?? null, locationId:p.location!.id,quantity:Number(p.quantity),serials:splitSerials(p.serialText) }))) })) }
    const suffix = initial ? `/${initial.receipt.id}${mode === 'edit' ? '' : mode === 'inspection' ? '/inspection' : '/placements'}` : ''
    try { const result = await api<ReceiptDetail>(endpoint + suffix, payload()); navigation.saved(); onSaved(result) } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); setConfirm(false) } finally { flight.current = false; setBusy(false) }
  }
  return <RegistrationSurface page={page} formId="receipt-registration" action={initial ? mode === 'inspection' ? '검수 완료 저장' : mode === 'placements' ? '배치 확정' : '입고 저장' : '입고 등록'} context={initial?.receipt.number} status={initial && <span className={`status-badge ${initial.receipt.status}`}>{uiText(receiptStatuses[initial.receipt.status])}</span>} description={initial ? uiText("기존 문서의 업무 상태에 따라 정보를 입력하고 저장하세요.") : undefined} confirmation={confirm || navigation.blocked} size={confirm || navigation.blocked ? 'small' : 'large'} title={!page && navigation.blocked ? uiText("저장하지 않은 입고 작업") : title} wide busy={busy} onClose={() => navigation.blocked ? navigation.stay() : confirm ? setConfirm(false) : requestNavigation(onClose)}>
    {trackingLine&&<ReceiptTrackingDialog group={plannedGroup(trackingLine)} initialEntries={trackingLine.allocations||[]} tab="lot" onDirtyChange={setSelectionDirty} onClose={()=>{setTrackingKey(null);setSelectionDirty(false)}} onDraftSave={allocations=>{setLines(current=>current.map(l=>l.key===trackingLine.key?{...l,allocations}:l));setTrackingKey(null);setSelectionDirty(false)}}/>}
    {serialLine && <SerialInputDialog name={serialLine.product?.name || ''} value={serialLine.serialText} onDirtyChange={setSelectionDirty} onClose={() => { setSerialKey(null); setSelectionDirty(false) }} onSave={serialText => { setLines(current => current.map(l => l.key === serialLine.key ? { ...l, serialText } : l)); setSerialKey(null); setSelectionDirty(false) }} />}
    {selectionOpen && mode === 'edit' && <ProductSelectionDialog endpoint={endpoint} mode="receipt" warehouseId={basic.warehouse?.id} lines={lines} onDirtyChange={setSelectionDirty} onClose={() => { setSelectionOpen(false); setSelectionDirty(false) }} onAdd={addProducts} />}
    {pasteOpen && mode === 'edit' && <DocumentPasteDialog key={endpoint} endpoint={endpoint} quantityLabel="예정 수량" capacity={pasteLimit} onClose={() => setPasteOpen(false)} onAdd={addProducts} />}
    <RegistrationPrompt page={page} active={confirm || navigation.blocked} title={navigation.blocked ? uiText("저장하지 않은 변경사항") : initial ? uiText("{v0} 확인", { v0: uiText(title) }) : uiText("입고 등록 확인")} busy={busy} onClose={() => navigation.blocked ? navigation.stay() : setConfirm(false)}>
    {!page && error && <p role="alert" className="alert error">{uiText(error)}</p>}
    {navigation.blocked ? <UnsavedChangesContent stay={navigation.stay} discard={navigation.discard} message="저장하지 않은 입고 작업을 버리시겠습니까?" /> : confirm ? <section role="alertdialog" aria-label={uiText("입고 저장 확인")}><p>{mode === 'edit' && initial ? uiText("입고 정보를 수정하면 기존 검수와 위치 배치를 다시 진행해야 합니다.") : mode === 'inspection' ? uiText("검수를 완료합니다. 위치 배치는 새 검수 수량에 맞게 다시 지정해야 합니다.") : uiText("입고 정보를 저장하시겠습니까? 재고는 입고 확정 시 반영됩니다.")}</p><div className="receipt-actions"><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>{uiText("계속 편집")}</button><button className="primary" disabled={busy} onClick={save}>{busy ? uiText("저장 중…") : uiText("확인")}</button></div></section> : null}
    </RegistrationPrompt>
    <RegistrationFields page={page} error={page ? error : ''} onEdit={() => setError('')}>
    <form id="receipt-registration" className={page ? "registration-form" : "dialog-form"} hidden={!page && (confirm || navigation.blocked)} onSubmit={e => { e.preventDefault(); const problem = validate(); if (problem) { setError(problem); return } setError(''); setConfirm(true) }}>
      <div className={page ? "registration-content" : "dialog-form-scroll"}><fieldset disabled={busy}>
        {mode === 'edit' && <section className="dialog-work-basic"><h3>{uiText("입고 기본 정보")}</h3><div className="receipt-basic">
          <label>{uiText("입고번호")}<input disabled value={initial?.receipt.number || '저장 시 자동 생성'} /></label><label><FormLabel required>{uiText("입고 예정일")}</FormLabel><input required aria-label={uiText("입고 예정일")} type="date" value={basic.date} onChange={e => setBasic(b => ({ ...b, date: e.target.value }))} /></label>
          <ChoiceField searchable required endpoint={endpoint} kind="partners" label={uiText("매입 거래처")} value={basic.partner?.id || ''} current={basic.partner} onChange={partner => setBasic(b => ({ ...b, partner }))} /><ChoiceField searchable required endpoint={endpoint} kind="warehouses" label={uiText("입고 창고")} value={basic.warehouse?.id || ''} current={basic.warehouse} onChange={warehouse => { if (warehouse?.id !== basic.warehouse?.id) { setDefaultRack(undefined); setLines(ls => ls.map(l => ({...l, rack: undefined,rackChanged:true}))) } setBasic(b => ({ ...b, warehouse })) }} />
          <ChoiceField searchable floating key={basic.warehouse?.id || "no-warehouse"} disabled={!basic.warehouse} endpoint={endpoint} kind="racks" warehouseId={basic.warehouse?.id} label={uiText("기본 입고 랙")} searchPlaceholder={uiText("랙명·랙 코드 검색")} value={defaultRack?.id || ""} current={defaultRack} onChange={setDefaultRack} /><BusinessAssigneeField feature="receipts" label={uiText("입고 담당자")} userId={basic.contactUserId} name={basic.contact} onChange={v => setBasic(b => ({ ...b, contactUserId: v.contactUserId, contact: v.contactName }))} /><label>{uiText("비고")}<input aria-label={uiText("입고 비고")} maxLength={2000} value={basic.notes} onChange={e => setBasic(b => ({ ...b, notes: e.target.value }))} /></label>
        </div></section>}
        {mode === 'edit' && (gallery.error ? <p role="alert">{uiText(gallery.error)} <button type="button" onClick={gallery.reload}>{uiText("다시 시도")}</button></p> : !gallery.ready ? <p>{uiText("입고 사진 불러오는 중…")}</p> : <ReceiptPhotoPicker photos={gallery.photos} onChange={gallery.ready ? gallery.setPhotos : undefined} endpoint={endpoint} id={initial?.receipt.id} busy={busy} onReading={setPhotoReading} />)}
        {mode === 'inspection' && <label>{uiText("검수 수량 수정 사유")}<input aria-label={uiText("검수 수량 수정 사유")} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder={uiText("저장된 검수 수량을 변경할 때 입력")} /></label>}
        <div className="receipt-section-heading"><h3>{mode === 'placements' ? uiText("검수 상품 위치 배치") : uiText("입고 상품")}</h3>{mode === 'edit' && <div className="receipt-section-buttons"><button type="button" className="secondary" disabled={busy} onClick={() => setPasteOpen(true)}>{uiText("엑셀 붙여넣기")}</button><button type="button" className="primary" disabled={busy} onClick={() => setSelectionOpen(true)}>{uiText("상품 추가")}</button></div>}</div>
        <p className="document-line-help">{mode==='edit' ? uiText("상품과 예정 수량을 입력하세요. 추적 정보는 선택 입력이며 검수 단계에서 실제 입고품과 대조해 최종 확인합니다.") : uiText("검수한 LOT·시리얼별 수량에 맞춰 보관 위치를 지정하세요.")}</p>
        <div className="document-line-scroll" tabIndex={0} role="region" aria-label={uiText("입고 상품 입력 테이블")}><table className={`organization-table document-line-table mobile-record-table ${mode === 'edit' ? 'receipt-registration-products' : mode === 'placements' ? 'document-detail-products receipt-placement-products' : ''}`}><thead><tr>
          <th>{uiText("상품명")}</th>{mode !== 'edit' && <th>{uiText("예정 수량")}</th>}<th><FormLabel required={mode !== 'placements'}>{mode === 'edit' ? uiText("예정 수량") : uiText("검수 수량")}</FormLabel></th>{mode === 'edit' && <><th>{uiText("소비자가")}</th><th>{uiText("참고 금액")}</th><th>{uiText("입고 랙")}</th></>}{mode==='edit' ? <><th>{uiText("예정 추적 정보")}</th><th>{uiText("관리")}</th></> : mode !== 'placements' ? <><th>{uiText("LOT 번호")}</th><th>{uiText("유통기한")}</th><th>{uiText("시리얼 번호")}</th>{mode === 'edit' && <th>{uiText("관리")}</th>}</> : <th>{uiText("보관 위치 배치")}</th>}
        </tr></thead><tbody>
        {!lines.length && <tr><td colSpan={mode === 'edit' ? 7 : mode === 'placements' ? 4 : 6}>{uiText("[상품 추가] 또는 [엑셀 붙여넣기]로 상품을 추가하세요.")}</td></tr>}
        {lines.map((l, i) => <tr key={l.key} aria-label={uiText("입고 상품 {v0}", { v0: i + 1 })}>
          <td data-label={uiText("상품")} className={`document-product${mode === 'placements' ? ' document-detail-product' : ''}`}>{mode !== 'edit' && l.product?.unit && l.product.unit !== "EA" && <small>{l.product.unit}</small>}<strong>{l.product?.name}</strong><small>{l.product?.code}</small>{mode==='placements' && <small>{l.lot || uiText("LOT 미지정")} · {l.expiry || uiText("유통기한 없음")}</small>}{mode !== 'placements' && !(mode === 'edit' && quantityError(l.quantity)) && rowError(l) && <span className="document-error" role="alert">{uiText(rowError(l))}</span>}</td>

          {mode !== 'edit' && <td data-label={uiText("예정 수량")}>{sourceLines[i]?.expectedQuantity}</td>}
          <td data-label={mode === 'edit' ? uiText("예정 수량") : mode === 'placements' ? uiText("검수 수량") : uiText("수량")} className="document-quantity">{mode === 'placements' ? l.quantity : <><QuantityInput unit={l.product?.unit} id={`document-quantity-${l.key}`} aria-label={uiText("수량 {v0}", { v0: i + 1 })} aria-invalid={!!lineQuantityError(l, mode !== 'edit')} required type="number" min={mode === 'edit' ? '0.001' : '0'} max="999999999.999" step="0.001" value={l.quantity} onChange={e => change(i, { quantity: e.target.value })} />{mode === 'edit' && <span className="receipt-quantity-unit">{l.product?.unit}</span>}{mode === 'inspection' && <small>{uiText("차이")} {Math.round((Number(l.quantity) - (sourceLines[i]?.expectedQuantity || 0)) * 1000) / 1000}</small>}</>}</td>
          {mode === 'edit' && <><td data-label={uiText("소비자가")} className="receipt-reference-price">{retailAmount(l.product?.retailPrice, l.product?.currency || 'KRW')}</td><td data-label={uiText("참고 금액")} className="receipt-reference-price">{retailAmount(l.product?.retailPrice == null || quantityError(l.quantity) ? null : l.product.retailPrice * Number(l.quantity), l.product?.currency || 'KRW')}</td><td className="receipt-rack-choice"><ChoiceField searchable floating key={basic.warehouse?.id || 'none'} disabled={!basic.warehouse} endpoint={endpoint} kind="racks" label={uiText("입고 랙 {v0}", { v0: i+1 })} searchPlaceholder={uiText("랙명·랙 코드 검색")} warehouseId={basic.warehouse?.id} value={l.rack?.id || ''} current={l.rack} onChange={rack=>change(i,{rack,rackChanged:true})}/>{!l.rackChanged&&new Set(l.sources?.map(row=>row.plannedRackId)||[]).size>1 && <small>{uiText("원본 행별 예정 랙 유지 · 선택 시 일괄 변경")}</small>}</td></>}
          {mode==='edit' ? <><td className="document-tracking"><button type="button" className="secondary" aria-label={uiText("추적 정보 입력(선택) {v0}", { v0: i+1 })} disabled={!!lineQuantityError(l)} onClick={()=>{try{plannedGroup(l);setTrackingKey(l.key)}catch(e){setError(e instanceof Error?e.message:'예정 수량을 확인해 주세요.')}}}>{uiText("추적 정보 입력(선택)")}</button><small>{uiText("예정 LOT")} {(l.allocations||[]).filter(a=>a.lotNumber||a.expiryDate).length}{uiText("개 · 시리얼")} {(l.allocations||[]).reduce((n,a)=>n+a.serials.length,0)}{uiText("개")}</small></td><td className="document-actions"><button type="button" className="secondary" aria-label={uiText("상품 {v0} 제거", { v0: i+1 })} onClick={()=>setLines(ls=>ls.filter(x=>x.key!==l.key))}>{uiText("삭제")}</button></td></> : mode !== 'placements' ? <>
            <td className="document-lot"><input aria-label={`LOT ${i + 1}`} placeholder={uiText("선택 입력")} maxLength={100} value={l.lot} onChange={e => change(i, { lot: e.target.value })} /></td>
            <td><input aria-label={uiText("유통기한 {v0}", { v0: i + 1 })} type="date" value={l.expiry} onChange={e => change(i, { expiry: e.target.value })} /></td>
            <td><button type="button" className="secondary" aria-label={uiText("시리얼 입력 {v0}", { v0: i + 1 })} onClick={() => setSerialKey(l.key)}>{uiText("시리얼 입력")}</button><small>{uiText("시리얼")} {splitSerials(l.serialText).length}{uiText("개")}</small></td>
            {mode === 'edit' && <td className="document-actions"><button type="button" className="secondary" aria-label={uiText("상품 {v0} 제거", { v0: i + 1 })} onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}>{uiText("삭제")}</button></td>}
          </> : <td data-label={uiText("보관위치 배치")} className="receipt-placement-cell"><PlacementStatus inspected={Number(l.quantity)} quantities={l.placements.map(p=>p.quantity)} unit={l.product?.unit || ""}/><details open><summary>{uiText("위치 배치")} {l.placements.length}{uiText("곳")}{l.rack ? uiText("· 예정 랙 {v0}", { v0: l.rack.name }) : ""}</summary>{l.serialText && <p className="organization-help">{uiText("검수 시리얼:")} {l.serialText.split('\n').join(', ')}</p>}{l.placements.map((p, j) => <div className="receipt-placement" key={p.key}>
            <ChoiceField searchable floating required rackId={l.rack?.id} searchPlaceholder={uiText("랙명·랙 코드·위치 코드 검색")} endpoint={endpoint} kind="locations" label={uiText("보관 위치 {v0}-{v1}", { v0: i + 1, v1: j + 1 })} value={p.location?.id || ''} current={p.location} warehouseId={initial?.receipt.warehouseId} onChange={location => change(i, { placements: l.placements.map((v, k) => k === j ? { ...v, location } : v) })} />
            <label><FormLabel required>{uiText("배치 수량")}</FormLabel><QuantityInput unit={l.product?.unit} aria-label={uiText("배치 수량 {v0}-{v1}", { v0: i + 1, v1: j + 1 })} type="number" required min={l.product?.unit === 'EA' ? '1' : '0.001'} step={l.product?.unit === 'EA' ? '1' : '0.001'} value={p.quantity} onChange={e => change(i, { placements: l.placements.map((v, k) => k === j ? { ...v, quantity: e.target.value } : v) })} /></label>
            {splitSerials(l.serialText).length > 0 && <label>{uiText("배치 시리얼 (한 줄에 하나)")}<textarea aria-label={uiText("배치 시리얼 {v0}-{v1}", { v0: i + 1, v1: j + 1 })} value={p.serialText} onChange={e => change(i, { placements: l.placements.map((v, k) => k === j ? { ...v, serialText: e.target.value } : v) })} /></label>}
            <button type="button" className="secondary" aria-label={uiText("위치 {v0}-{v1} 제거", { v0: i + 1, v1: j + 1 })} onClick={() => change(i, { placements: l.placements.filter((_, k) => k !== j) })}>{uiText("제거")}</button>
          </div>)}<button type="button" className="secondary" disabled={l.placements.length >= 100} onClick={() => change(i, { placements: [...l.placements, { key: crypto.randomUUID(), quantity: '', serialText: '', location: undefined }] })}>{uiText("위치 추가")} {i + 1}</button></details></td>}
        </tr>)}
        </tbody><tfoot><tr><td colSpan={mode === 'edit' ? 8 : 5}><div className="receipt-table-totals"><strong>{lines.length}{uiText("개 상품 행")}</strong><span>{mode==='placements' ? uiText("전체 검수") : ''}{unitTotals(lines.map(l=>({unit:l.product?.unit || '',quantity:quantityError(l.quantity,true)?0:Number(l.quantity)})))}</span>{mode==='edit' && <><span>{uiText("소비자가 기준 총금액")} {retailTotals.amount}</span>{retailTotals.missing>0&&<span>{uiText("미산정")} {retailTotals.missing}{uiText("행 (가격·수량 확인)")}</span>}<small>{uiText("참고 금액 · 매입 원가·회계 금액에 반영되지 않습니다.")}</small></>}{mode==='placements' && <><span>{uiText("전체 배치")} {unitTotals(lines.flatMap(l=>l.placements.map(p=>({unit:l.product?.unit || '',quantity:quantityError(p.quantity)?0:Number(p.quantity)})))) || '0'}</span><span>{placementIssues.length ? uiText("수량 확인 필요 {v0}행", { v0: placementIssues.length }) : uiText("모든 행의 배치 수량이 일치합니다.")}</span></>}</div></td></tr></tfoot></table></div>
      </fieldset></div>
      {!page && <div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={() => requestNavigation(onClose)}>{uiText("취소")}</button><button className="primary" type="submit" disabled={busy}>{initial ? mode === 'inspection' ? uiText("검수 완료 저장") : mode === 'placements' ? uiText("배치 확정") : uiText("입고 저장") : uiText("입고 등록")}</button></div>}
    </form>
    </RegistrationFields>
  </RegistrationSurface>
}

function PlacementStatus({inspected,quantities,unit}:{inspected:number;quantities:string[];unit:string}) {
 const result=placementComparison(inspected,quantities,unit)
 return <div className={`receipt-placement-status is-${result.status}`} role="status"><strong>{uiText("검수")} {inspected.toLocaleString(getLocale())} {unit} {uiText("· 배치")} {result.placed.toLocaleString(getLocale())} {unit}</strong><span>{uiText(result.message)}</span></div>
}
