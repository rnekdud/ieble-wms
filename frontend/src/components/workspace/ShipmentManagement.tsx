import BusinessDocumentMenu from './BusinessDocumentMenu'
import { t as uiText, getLocale } from '../../i18n.ts'
import ShippingAddressFields from '../ShippingAddressFields'
import PageSizeSelect from '../PageSizeSelect'
import FormLabel from '../FormLabel'
import QuantityInput from './QuantityInput'
import ReportPeriodFields from './ReportPeriodFields'
import BusinessAssigneeDetails from './BusinessAssigneeDetails'
import SearchFilters from './SearchFilters'
import BusinessAssigneeField from "./BusinessAssigneeField"
import { useCurrentAssignee } from "../../business-assignee"
import ShipmentRackChoice from './ShipmentRackChoice'
import UnsavedChangesContent from './UnsavedChangesContent'
import ShipmentStockDialog from './ShipmentStockDialog'
import useShipmentAvailability from './useShipmentAvailability'
import { shipmentLineError } from '../../document-line-model'
import type { ImportedProduct } from '../../document-paste'
import './document-line-table.css'
import DocumentPasteDialog from './DocumentPasteDialog'
import ProductSelectionDialog from './ProductSelectionDialog'
import { appendImportedProducts, pasteLimit } from '../../document-paste'
import ShipmentBarcodeWork from './ShipmentBarcodeWork'
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
import { splitSerials, unitTotals, retailAmount, receiptRetailTotals, quantityError } from '../../receipt-model'
import type { Choice } from '../../receipt-model'
import { shipmentStatuses, workError } from '../../shipment-model'
import type { ShipmentDetail, ShipmentList } from '../../shipment-model'
import './receipts.css'
import ChoiceField from './BusinessChoiceField'

export default function ShipmentManagement({ tenantId, grants, registration = false, detailId, onNavigate }: { tenantId: string; grants: string[]; registration?: boolean; detailId?: string; onNavigate: (path: string) => void }) {
  const endpoint = `/api/tenants/${tenantId}/shipments`
  const [query, setQuery] = useState({ search: '', status: 'all', warehouseId: '', from: '', to: '', page: 1, pageSize: 20 })
  const [filters, setFilters] = useState(query)
  const [revision, refresh] = useState(0), [data, setData] = useState<{ key: string; value: ShipmentList } | null>(null), [error, setError] = useState(''), [notice] = useState('')
  const [selection] = useState<{ id: string | null } | null>(() => businessEntry(window.location.search, grants.includes('create'))), [warehouse, setWarehouse] = useState<Choice>()
  const params = new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '').map(([k, v]) => [k, String(v)])))
  const url = `${endpoint}?${params}`, key = `${url}:${revision}`, loading = data?.key !== key
  useEffect(() => { if (registration || detailId) return; let live = true; const timer = setTimeout(() => { api<ShipmentList>(url).then(value => { if (live) { setData({ key, value }); setError('') } }).catch(e => { if (live) setError(e.message) }) }, 180); return () => { live = false; clearTimeout(timer) } }, [url, key, registration, detailId])
  useEffect(() => { if (!registration && !detailId && selection) onNavigate(selection.id ? `/app/shipments/${selection.id}` : '/app/shipments/new') }, [registration, detailId, selection, onNavigate])
  function filter(values: Partial<typeof query>) { setFilters(q => ({ ...q, ...values, page: 1 })) }
  if (detailId) return <ShipmentDetailPage key={detailId} id={detailId} endpoint={endpoint} grants={grants} onClose={() => onNavigate('/app/shipments')} />
  if (registration) return !grants.includes('create') ? <p role="alert">{uiText("출고 등록 권한이 없습니다.")}</p> : <ShipmentEditor page mode="edit" endpoint={endpoint} onClose={() => onNavigate('/app/shipments')} onSaved={d => onNavigate(`/app/shipments/${d.shipment.id}`)} />
  return <>
    <PageHeading title={uiText("출고관리")} actions={<> {grants.includes('create') && <button className="primary" onClick={() => onNavigate('/app/shipments/new')}>{uiText("출고 등록")}</button>} </>} />
    {notice && <p className="alert" role="status">{uiText(notice)}</p>}{error && <p className="alert error" role="alert">{uiText(error)}<button className="secondary" onClick={() => refresh(n => n + 1)}>{uiText("다시 시도")}</button></p>}
    <section className="wms-card products-card">
      <SearchFilters onReset={() => { const next = { search: '', status: 'all', warehouseId: '', from: '', to: '', page: 1, pageSize: 20 }; setFilters(next); setQuery(next); setWarehouse(undefined); refresh(n => n + 1) }} busy={loading && !error} onSearch={() => { setQuery({ ...filters, page: 1 }); refresh(n => n + 1) }} className="products-toolbar receipt-filters inline-period-filters shipment-list-filters">

        <ReportPeriodFields prefix="예정일" start={filters.from} end={filters.to} onChange={range => setFilters(x => ({ ...x, from:range.start, to:range.end }))} />
        <label>{uiText("상태")}<select aria-label={uiText("출고 상태 필터")} value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="all">{uiText("전체 상태")}</option>{Object.entries(shipmentStatuses).map(([v, l]) => <option key={v} value={v}>{uiText(l)}</option>)}</select></label>

      <ChoiceField endpoint={endpoint} kind="warehouses" label={uiText("창고")} placeholder={uiText("창고")} emptyOptionLabel="전체 창고" searchPlaceholder={uiText("창고명·시스템 코드·내부 코드 검색")} value={filters.warehouseId} current={warehouse} onChange={w => { setWarehouse(w); filter({ warehouseId: w?.id || '' }) }} />
      <label>{uiText("출고 검색")}<input aria-label={uiText("출고 검색")} value={filters.search} placeholder={uiText("출고번호·거래처·상품명·코드")} maxLength={100} onChange={e => setFilters({ ...filters, search: e.target.value })} /></label>
</SearchFilters>
      <div className="table-scroll"><table className="organization-table mobile-record-table shipment-list-table"><thead><tr>{['출고번호', '요청일', '출고 예정일', '거래처', '창고', '상품 종류', '예정 수량 (단위별)', '상태', '담당자', '관리'].map(x => <th key={x}>{uiText(x)}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={10}>{error ? uiText("출고를 불러오지 못했습니다.") : uiText("출고를 불러오는 중…")}</td></tr> : !data.value.items.length ? <tr><td colSpan={10}>{uiText("조회된 출고가 없습니다.")}</td></tr> : data.value.items.map(({ shipment: r, productCount, totals }) => <tr key={r.id}><td data-label={uiText("출고번호")}>{r.number}</td><td data-label={uiText("요청일")}>{r.requestDate}</td><td data-label={uiText("출고 예정일")}>{r.expectedDate}</td><td data-label={uiText("거래처")}>{r.partnerName}</td><td data-label={uiText("창고")}>{r.warehouseName}</td><td data-label={uiText("상품 종류")}>{productCount}</td><td data-label={uiText("예정 수량")}>{unitTotals(totals)}</td><td data-label={uiText("상태")}><span className={`status-badge ${r.status}`}>{uiText(shipmentStatuses[r.status])}</span></td><td data-label={uiText("담당자")}>{r.contactName}</td><td data-label={uiText("관리")}><button className="secondary" aria-label={uiText("{v0} 상세", { v0: r.number })} onClick={() => onNavigate(`/app/shipments/${r.id}`)}>{uiText("상세")}</button></td></tr>)}</tbody></table></div>
      <Pagination pageSizeControl={<PageSizeSelect value={query.pageSize} onChange={pageSize => { setQuery(v => ({ ...v, pageSize, page: 1 })); setFilters(v => ({ ...v, pageSize, page: 1 }));  }} />} page={query.page} pageSize={query.pageSize} total={data?.value.total || 0} loading={loading} onChange={page => setQuery(q => ({ ...q, page }))} label={uiText("출고 목록 페이지")} />
    </section>

  </>
}
function ShipmentDetailPage({ id, endpoint, grants, onClose }: { id: string; endpoint: string; grants: string[]; onClose: () => void }) {
  const [data, setData] = useState<ShipmentDetail | null>(null), [mode, setMode] = useState('view'), [error, setError] = useState(''), [busy, setBusy] = useState(false), [action, setAction] = useState<string | null>(null), [retry, setRetry] = useState(0)
  const flight = useRef(false)
  useUnsavedNavigation(busy, busy)
  useEffect(() => { if (!id) return; let live = true; api<ShipmentDetail>(`${endpoint}/${id}`).then(d => { if (live) { setData(d); setError('') } }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [id, endpoint, retry])
  function saved(value: ShipmentDetail) { if (value.shipment.id !== id) { setError('출고 문서 식별자가 다릅니다. 다시 조회해 주세요.'); return } setData(value); setMode('view'); setAction(null) }
  async function run() { if (!data || !action || flight.current) return; flight.current = true; setBusy(true); setError(''); try { const result = await api<ShipmentDetail>(`${endpoint}/${data.shipment.id}/${action}`, { version: data.shipment.version }); saved(result); if (action === 'start-picking') setMode('picking') } catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했습니다.'); setAction(null) } finally { flight.current = false; setBusy(false) } }
  if (data && (mode === 'picking' || mode === 'inspection')) return <ShipmentBarcodeWork key={mode} initial={data} endpoint={endpoint} inspect={mode === 'inspection'} onChange={setData} onComplete={result => { saved(result); if (mode === 'picking' && result.shipment.status === 'Picked') setMode('inspection') }} onClose={() => setMode('view')} />
  if (mode !== 'view' && (!id || data)) return <ShipmentEditor key={mode} page mode={mode} initial={data || undefined} endpoint={endpoint} onSaved={saved} onClose={() => data ? setMode('view') : onClose()} />
  const r = data?.shipment, writable = grants.includes('update'), actionLabel = action === 'confirm' ? '출고 확정' : action === 'cancel' ? '출고 취소' : '피킹 시작'
  const canCancel = r && ['Requested', 'Picking'].includes(r.status) && data?.allocations.every(a => a.pickedQuantity === 0)
  const workActions = r && !action && (<div className="receipt-actions">
    <BusinessDocumentMenu endpoint={`${endpoint}/${r.id}`} type="shipments" disabled={busy} />
        {writable && <>{r.status === 'Requested' && <><button className="secondary" onClick={() => setMode('edit')}>{uiText("출고 요청 수정")}</button><button className="primary" onClick={() => setAction('start-picking')}>{uiText("피킹 시작")}</button></>}{canCancel && <button className="secondary" onClick={() => setAction('cancel')}>{uiText("출고 취소")}</button>}{r.status === 'Picking' && <button className="primary" onClick={() => setMode('picking')}>{uiText("피킹 진행")}</button>}{r.status === 'Picked' && <button className="primary" onClick={() => setMode('inspection')}>{uiText("최종 검수")}</button>}</>}
        {r.status === 'Inspected' && grants.includes('confirm') && <button className="primary" onClick={() => setAction('confirm')}>{uiText("출고 확정")}</button>}
      </div>)
  return <DetailSurface hideListAction title={uiText("출고 상세")} code={r?.number} status={r && <span className={`status-badge ${r.status}`}>{uiText(shipmentStatuses[r.status])}</span>} actions={workActions} busy={busy} onClose={onClose}>
    {action && <OrganizationDialog confirmation title={uiText("{v0} 확인", { v0: uiText(actionLabel) })} size="small" busy={busy} onClose={() => setAction(null)}><section className="receipt-confirm" role="alertdialog" aria-label={uiText("{v0} 확인", { v0: uiText(actionLabel) })}><p>{action === 'confirm' ? uiText("예약한 재고를 실제 차감합니다. 확정 후 직접 수정·취소할 수 없습니다.") : action === 'cancel' ? uiText("출고 요청을 취소하고 예약 수량을 반환하시겠습니까?") : uiText("피킹을 시작합니다. 시작 후 요청 정보와 예약 위치를 변경할 수 없습니다.")}</p><div className="receipt-actions"><button className="secondary" disabled={busy} onClick={() => setAction(null)}>{uiText("계속 보기")}</button><button className="primary" disabled={busy} onClick={run}>{busy ? uiText("처리 중…") : uiText("확인")}</button></div></section></OrganizationDialog>}
    {error && <p role="alert" className="alert error">{uiText(error)} <button className="secondary" onClick={() => setRetry(n => n + 1)}>{uiText("다시 조회")}</button></p>}
    {!data || !r ? !error && <p role="status">{uiText("출고를 불러오는 중…")}</p> : <>

      <ol className="receipt-steps shipment-steps">{(['Requested', 'Picking', 'Picked', 'Inspected', 'Confirmed'] as const).map((s, i, all) => <li key={s} className={r.status !== 'Cancelled' && all.indexOf(r.status as typeof s) >= i ? 'done' : ''}>{i + 1} {uiText(shipmentStatuses[s])}</li>)}</ol>
      <dl className="products-detail"><div><dt>{uiText("요청일 / 예정일")}</dt><dd>{r.requestDate} / {r.expectedDate}</dd></div><div><dt>{uiText("거래처 / 창고")}</dt><dd>{r.partnerName} / {r.warehouseName}</dd></div><div><dt>{uiText("출고지")}</dt><dd style={{ overflowWrap: 'anywhere' }}>{[r.shippingPostalCode ? `[${r.shippingPostalCode}]` : '', r.shippingAddress, r.shippingAddressDetail].filter(Boolean).join(' ') || '—'}</dd></div><div><dt>{uiText("담당자")}</dt><dd><BusinessAssigneeDetails feature="shipments" userId={r.contactUserId} name={r.contactName} /></dd></div><div><dt>{uiText("작업 완료 일시")}</dt><dd>{uiText("피킹")} {r.pickedAt ? new Date(r.pickedAt).toLocaleString(getLocale()) : uiText("미완료")}<br />{uiText("검수")} {r.inspectedAt ? new Date(r.inspectedAt).toLocaleString(getLocale()) : uiText("미완료")}</dd></div><div><dt>{uiText("출고 확정")}</dt><dd>{r.confirmedAt ? new Date(r.confirmedAt).toLocaleString(getLocale()) : r.status === 'Cancelled' ? uiText("취소 · 예약 반환") : uiText("미확정 · 물리 재고 차감 전")}</dd></div>{r.notes && <div><dt>{uiText("비고")}</dt><dd>{r.notes}</dd></div>}</dl>
      <h3>{uiText("상품별 작업 수량")}</h3><div className="table-scroll receipt-lines"><table className="organization-table document-detail-products"><thead><tr>{['상품', '지정 출고 랙', '요청', '예약 배정', '피킹', '검수'].map(x => <th key={x}>{uiText(x)}</th>)}</tr></thead><tbody>{data.lines.map(l => { const a = data.allocations.filter(a => a.lineId === l.id); const sum = (key: 'quantity' | 'pickedQuantity' | 'inspectedQuantity') => Math.round(a.reduce((n, x) => n + x[key], 0) * 1000) / 1000; return <tr key={l.id}><td data-label={uiText("상품")} className="document-detail-product">{l.productName}<small>{l.productCode}{l.unit && l.unit !== "EA" ? ` · ${l.unit}` : ""}</small></td><td data-label={uiText("지정 출고 랙")}>{l.plannedRackName || uiText("미지정")}<small>{l.plannedRackCode}</small></td><td data-label={uiText("요청")}>{l.requestedQuantity}</td><td data-label={uiText("예약 배정")}>{sum('quantity')}</td><td data-label={uiText("피킹")}>{sum('pickedQuantity')}</td><td data-label={uiText("검수")}>{sum('inspectedQuantity')}</td></tr> })}</tbody></table></div>
      <ShipmentLocationHistory data={data} />
      <details><summary>{uiText("예약 배정 및 작업 수량")}</summary><AllocationTable data={data} mobileCards /></details>
      {r.status === 'Confirmed' && <p className="alert" role="status">{uiText("출고 확정 · 예약 해제 완료 · 재고 변동 이력")} {data.movements.length}{uiText("건. 확정 문서는 직접 수정·취소할 수 없습니다.")}</p>}

    </>}
  </DetailSurface>
}
function AllocationTable({ data, values, onChange, inspect = false, mobileCards = false }: { data: ShipmentDetail; mobileCards?: boolean; values?: Record<string, string>; onChange?: (id: string, value: string) => void; inspect?: boolean }) {
  return <div className="table-scroll receipt-lines"><table className={`organization-table${mobileCards ? ' document-detail-products' : ''}`}><thead><tr>{['상품', '랙 / 위치', 'LOT / 유통기한', '시리얼', '예약 배정', '피킹', '검수', '작업 상태', ...(values ? [inspect ? '검수 수량 입력' : '피킹 수량 입력'] : [])].map(x => <th key={x}><FormLabel required={!!values && x === (inspect ? '검수 수량 입력' : '피킹 수량 입력')}>{uiText(x)}</FormLabel></th>)}</tr></thead><tbody>{data.allocations.map((a, i) => { const l = data.lines.find(l => l.id === a.lineId)!; return <tr key={a.id}><td data-label={uiText("상품")} className="document-detail-product">{l.productName}<small>{l.productCode} · {l.unit}</small></td><td data-label={uiText("랙 / 위치")}>{a.rackCode || uiText("바닥")}<small>{a.locationCode}</small></td><td data-label={uiText("LOT / 유통기한")} className="document-detail-wide">{a.lotNumber || '—'}<small>{a.expiryDate}</small></td><td data-label={uiText("시리얼")} className="document-detail-wide">{a.serialNumber || '—'}</td><td data-label={uiText("예약 배정")}>{a.quantity}</td><td data-label={uiText("피킹")}>{a.pickedQuantity}</td><td data-label={uiText("검수")}>{a.inspectedQuantity}</td><td data-label={uiText("작업 상태")}>{a.state === 'Consumed' ? uiText("출고 완료") : a.state === 'Released' ? uiText("예약 반환") : a.inspectedAt && a.inspectedQuantity === a.quantity ? uiText("검수 완료") : a.pickedQuantity === a.quantity ? uiText("피킹 완료") : a.pickedQuantity > 0 ? uiText("피킹 중") : uiText("대기")}</td>{values && <td><QuantityInput unit={l.unit} aria-label={uiText("작업 수량 {v0}", { v0: i + 1 })} type="number" required min={inspect ? 0 : a.pickedQuantity} max={a.quantity} step="0.001" value={values[a.id]} onChange={e => onChange?.(a.id, e.target.value)} /></td>}</tr> })}</tbody></table></div>
}
type EditLine = { rack?: Choice; key: string; product?: Choice; quantity: string; lot: string; expiry: string; serialText: string }
function ShipmentEditor({ page = false, mode, initial, endpoint, onSaved, onClose }: { page?: boolean; mode: string; initial?: ShipmentDetail; endpoint: string; onSaved: (d: ShipmentDetail) => void; onClose: () => void }) {
  const choice = (id: string, name: string): Choice => ({ id, name, code: '', unit: null, lotManaged: false, expiryManaged: false, serialManaged: false })
  const today = () => new Date().toLocaleDateString('en-CA')
  const currentAssignee = useCurrentAssignee()
  const [basic, setBasic] = useState(() => ({ requestDate: initial?.shipment.requestDate || today(), date: initial?.shipment.expectedDate || today(), partner: initial ? choice(initial.shipment.partnerId, initial.shipment.partnerName) : undefined, warehouse: initial ? choice(initial.shipment.warehouseId, initial.shipment.warehouseName) : undefined, contactUserId: initial ? initial.shipment.contactUserId : currentAssignee?.id, contact: initial ? initial.shipment.contactName : currentAssignee?.name || '', notes: initial?.shipment.notes || '', shippingPostalCode: initial?.shipment.shippingPostalCode || '', shippingAddress: initial?.shipment.shippingAddress || '', shippingAddressDetail: initial?.shipment.shippingAddressDetail || '' }))
  const [pendingPartner, setPendingPartner] = useState<{ value: Choice | undefined } | null>(null)
  const addressEdited = useRef(!!initial)
  function applyPartner(partner: Choice | undefined) {
    setBasic(b => ({ ...b, partner, shippingPostalCode: partner?.defaultShippingPostalCode || '', shippingAddress: partner?.defaultShippingAddress || '', shippingAddressDetail: partner?.defaultShippingAddressDetail || '' }))
    addressEdited.current = false
    setPendingPartner(null)
  }
  function changePartner(partner: Choice | undefined) {
    if (partner?.id === basic.partner?.id) return
    const differs = basic.shippingPostalCode !== (partner?.defaultShippingPostalCode || '') || basic.shippingAddress !== (partner?.defaultShippingAddress || '') || basic.shippingAddressDetail !== (partner?.defaultShippingAddressDetail || '')
    if (addressEdited.current && (basic.shippingPostalCode.trim() || basic.shippingAddress.trim() || basic.shippingAddressDetail.trim()) && differs) setPendingPartner({ value: partner })
    else applyPartner(partner)
  }
  const [rackSort, setRackSort] = useState('route'), [routeNotice, setRouteNotice] = useState(''), [rackRevision, setRackRevision] = useState(0)
  const [defaultRack, setDefaultRack] = useState<Choice>()
  const [recommending, setRecommending] = useState(false), [recommendNotice, setRecommendNotice] = useState('')
  const recommendationRun = useRef(0)
  useEffect(() => () => { recommendationRun.current++ }, [])
  const emptyLine = (): EditLine => ({ rack: defaultRack, key: crypto.randomUUID(), quantity: '', lot: '', expiry: '', serialText: '' })
  const [lines, setLines] = useState<EditLine[]>(() => initial ? initial.lines.map(l => ({ key: l.id, rack: l.plannedRackId ? { ...choice(l.plannedRackId, l.plannedRackName || '지정 랙'), code: l.plannedRackCode || '' } : undefined, product: { id: l.productId, retailPrice: l.retailPrice, currency: l.currency, name: l.productName, code: l.productCode, unit: l.unit, lotManaged: l.lotManaged, expiryManaged: l.expiryManaged, serialManaged: l.serialManaged }, quantity: String(l.requestedQuantity), lot: l.lotNumber || '', expiry: l.expiryDate || '', serialText: l.serials.join('\n') })) : [])
  const availability = useShipmentAvailability(endpoint, mode === 'edit' ? basic.warehouse?.id : undefined, initial?.shipment.id, lines.flatMap(l => l.product ? [l.product.id] : []))
  const [stockKey, setStockKey] = useState<string | null>(null), focusKey = useRef<string | null>(null)
  const stockLine = lines.find(l => l.key === stockKey)
  useEffect(() => { if (focusKey.current) { const id = focusKey.current; focusKey.current = null; requestAnimationFrame(() => document.getElementById(`document-quantity-${id}`)?.focus()) } }, [lines])
  function addProducts(products: ImportedProduct[]) {
    const next = appendImportedProducts(lines, products, emptyLine); focusKey.current = next[lines.length]?.key || null; setLines(next); setSelectionOpen(false); setSelectionDirty(false); setPasteOpen(false); availability.refresh()
  }
  function rowError(l: EditLine) { return shipmentLineError(l, lines, availability.stocks.get(l.product?.id || '')) }
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(initial?.allocations.map(a => [a.id, String(mode === 'inspection' ? a.inspectedQuantity : a.pickedQuantity)]) || []))
  const [pasteOpen, setPasteOpen] = useState(false), [selectionOpen, setSelectionOpen] = useState(false), [selectionDirty, setSelectionDirty] = useState(false)
  const [baseline] = useState(() => JSON.stringify({ basic, lines, values })), [requestId] = useState(() => crypto.randomUUID()), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState(false), [complete, setComplete] = useState(true)
  const flight = useRef(false), dirty = JSON.stringify({ basic, lines, values }) !== baseline || !complete
  const navigation = useUnsavedNavigation(dirty || selectionDirty || busy || recommending, busy || recommending, () => setConfirm(false))
  const title = uiText(mode === 'edit' ? initial ? '출고 요청 수정' : '출고 등록' : mode === 'picking' ? '피킹 작업' : '출고 검수')
  function change(index: number, patch: Partial<EditLine>) { setLines(items => items.map((l, i) => i === index ? { ...l, ...patch } : l)) }
  async function changeRackSort(sort: string) {
    setRackSort(sort); setRecommendNotice('')
    if (initial) { setRecommendNotice('저장된 출고 건은 옵션 정렬만 변경합니다. 지정 랙은 유지됩니다.'); return }
    if (!basic.warehouse || !lines.some(l => l.product)) return
    const run = ++recommendationRun.current, selected: string[] = [], recommendations = new Map<string, Choice>(), skipped: string[] = []
    setRecommending(true)
    try {
      for (const line of lines) {
        if (!line.product) continue
        const params = new URLSearchParams({ kind: 'racks', sort, warehouseId: basic.warehouse.id, productId: line.product.id, quantity: String(Number(line.quantity) > 0 && Number.isFinite(Number(line.quantity)) ? Number(line.quantity) : 0), ...(line.lot ? { lotNumber: line.lot } : {}), ...(line.expiry ? { expiryDate: line.expiry } : {}) })
        splitSerials(line.serialText).forEach(x => params.append('serials', x))
        selected.forEach(x => params.append('selectedRackIds', x))
        const result = await api<{ recommendedRack?: Choice; routeNotice: string }>(`${endpoint}/choices?${params}`)
        if (run !== recommendationRun.current) return
        if (result.recommendedRack) { recommendations.set(line.key, result.recommendedRack); selected.push(result.recommendedRack.id) }
        else { skipped.push(line.product.name); if (line.rack) selected.push(line.rack.id) }
      }
      setLines(items => items.map(line => recommendations.has(line.key) ? { ...line, rack: recommendations.get(line.key) } : line))
      setRackRevision(n => n + 1)
      setRecommendNotice(`${recommendations.size}개 상품의 지정 랙을 갱신했습니다.${skipped.length ? ` 경로 또는 가용 재고를 확인할 수 없는 상품은 기존 선택을 유지합니다: ${skipped.join(', ')}.` : ''}`)
    } catch (e) { if (run === recommendationRun.current) setRecommendNotice(e instanceof Error ? `자동 지정 실패 · 기존 선택 유지: ${e.message}` : '자동 지정하지 못했습니다. 기존 선택을 유지합니다.') }
    finally { if (run === recommendationRun.current) setRecommending(false) }
  }
  function validate() {
    if (recommending) return '추천 랙을 계산하고 있습니다.'
    if (mode !== 'edit') return initial?.allocations.map(a => workError(values[a.id], a.quantity, complete, mode === 'picking' ? a.pickedQuantity : 0, initial.lines.find(l => l.id === a.lineId)?.unit)).find(Boolean)
    if (!basic.requestDate || !basic.date || basic.date < basic.requestDate || !basic.partner || !basic.warehouse || !basic.contact.trim()) return '요청일·예정일·거래처·창고·담당자를 확인해 주세요.'
    if (!lines.length) return '출고 상품을 추가해 주세요.'
    if (availability.loading || availability.error) return availability.error || '출고 가능 재고를 조회하고 있습니다.'
    for (const l of lines) { const issue = rowError(l); if (issue) return issue }
    return null
  }
  async function save() {
    if (flight.current) return; flight.current = true; setBusy(true); setError('')
    const version = initial?.shipment.version || '00000000-0000-0000-0000-000000000000'
    const payload = mode === 'edit' ? { requestId, version, requestDate: basic.requestDate, expectedDate: basic.date, partnerId: basic.partner!.id, shippingPostalCode: basic.shippingPostalCode.trim() || (initial?.shipment.shippingPostalCode ? '' : undefined), shippingAddress: basic.shippingAddress.trim() || (initial?.shipment.shippingAddress ? '' : undefined), shippingAddressDetail: basic.shippingAddressDetail.trim() || (initial?.shipment.shippingAddressDetail ? '' : undefined), warehouseId: basic.warehouse!.id, contactUserId: basic.contactUserId, contactName: basic.contact.trim(), notes: basic.notes.trim() || null, lines: lines.map(l => ({ productId: l.product!.id, requestedQuantity: Number(l.quantity), plannedRackId: l.rack?.id || null, lotNumber: l.lot.trim() || null, expiryDate: l.expiry || null, serials: splitSerials(l.serialText) })) } : { version, complete, allocations: initial!.allocations.map(a => ({ allocationId: a.id, quantity: Number(values[a.id]) })) }
    const suffix = initial ? `/${initial.shipment.id}${mode === 'edit' ? '' : `/${mode}`}` : ''
    try { const result = await api<ShipmentDetail>(endpoint + suffix, payload); navigation.saved(); onSaved(result) } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); setConfirm(false) } finally { flight.current = false; setBusy(false) }
  }
  return <RegistrationSurface page={page} formId="shipment-registration" action={initial ? mode === 'picking' ? '피킹 저장' : mode === 'inspection' ? '검수 저장' : '출고 요청 저장' : '출고 등록'} context={initial?.shipment.number} status={initial && <span className={`status-badge ${initial.shipment.status}`}>{uiText(shipmentStatuses[initial.shipment.status])}</span>} description={initial ? uiText("기존 문서의 업무 상태에 따라 정보를 입력하고 저장하세요.") : undefined} confirmation={confirm || navigation.blocked} size={confirm || navigation.blocked ? 'small' : 'large'} title={!page && navigation.blocked ? uiText("저장하지 않은 출고 작업") : title} wide busy={busy || recommending} onClose={() => navigation.blocked ? navigation.stay() : confirm ? setConfirm(false) : requestNavigation(onClose)}>
    {pendingPartner && <OrganizationDialog confirmation title={uiText("거래처 변경")} size="small" onClose={() => setPendingPartner(null)} actions={<><button type="button" className="secondary" onClick={() => setPendingPartner(null)}>{uiText("변경 취소")}</button><button type="button" className="primary" onClick={() => applyPartner(pendingPartner.value)}>{uiText("기본 출고지 적용")}</button></>}><p>{uiText("직접 입력한 출고지를 새 거래처의 기본 출고지로 바꾸시겠습니까? 기본 출고지가 없으면 빈 값으로 변경됩니다.")}</p></OrganizationDialog>}
    {stockLine?.product && basic.warehouse && <ShipmentStockDialog key={`${basic.warehouse.id}:${stockLine.key}`} endpoint={endpoint} warehouseId={basic.warehouse.id} product={stockLine.product} allocations={initial?.shipment.warehouseId === basic.warehouse.id ? initial.allocations : []} onDirtyChange={setSelectionDirty} onClose={() => { setStockKey(null); setSelectionDirty(false) }} onApply={tracking => { setLines(current => current.map(l => l.key === stockLine.key ? { ...l, ...tracking } : l)); setStockKey(null); setSelectionDirty(false); availability.refresh() }} />}
    {selectionOpen && mode === 'edit' && <ProductSelectionDialog endpoint={endpoint} mode="shipment" warehouseId={basic.warehouse?.id} rackId={defaultRack?.id} rackName={defaultRack?.name} shipmentId={initial?.shipment.id} lines={lines} onDirtyChange={setSelectionDirty} onClose={() => { setSelectionOpen(false); setSelectionDirty(false) }} onAdd={addProducts} />}
    {pasteOpen && mode === 'edit' && <DocumentPasteDialog key={endpoint} endpoint={endpoint} quantityLabel="요청 수량" capacity={pasteLimit} onClose={() => setPasteOpen(false)} onAdd={addProducts} />}
    <RegistrationPrompt page={page} active={confirm || navigation.blocked} title={navigation.blocked ? uiText("저장하지 않은 변경사항") : initial ? uiText("{v0} 확인", { v0: uiText(title) }) : uiText("출고 등록 확인")} busy={busy} onClose={() => navigation.blocked ? navigation.stay() : setConfirm(false)}>
    {!page && error && <p role="alert" className="alert error">{uiText(error)}</p>}
    {navigation.blocked ? <UnsavedChangesContent stay={navigation.stay} discard={navigation.discard} message="저장하지 않은 출고 작업을 버리시겠습니까?" /> : confirm ? <section role="alertdialog" aria-label={uiText("출고 저장 확인")}><p>{mode === 'edit' ? uiText("출고 요청을 저장하고 재고를 자동 예약합니다. 기존 요청 수정 시 예약 위치가 다시 배정됩니다. 물리 재고는 최종 출고 확정 시에만 차감됩니다.") : complete ? uiText("입력한 수량으로 작업을 완료하시겠습니까?") : uiText("현재 작업 수량을 저장하시겠습니까?")}</p><div className="receipt-actions"><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>{uiText("계속 편집")}</button><button className="primary" disabled={busy} onClick={save}>{busy ? uiText("저장 중…") : uiText("확인")}</button></div></section> : null}
    </RegistrationPrompt>
    <RegistrationFields page={page} error={page ? error : ''} onEdit={() => setError('')}>
    <form id="shipment-registration" className={page ? "registration-form" : "dialog-form"} hidden={!page && (confirm || navigation.blocked)} onSubmit={e => { e.preventDefault(); const problem = validate(); if (problem) { setError(problem); return } setError(''); setConfirm(true) }}><div className={page ? "registration-content" : "dialog-form-scroll"}><fieldset disabled={busy || recommending}>
      {mode === 'edit' ? <>
        <section className="dialog-work-basic"><h3>{uiText("출고 기본 정보")}</h3><div className="receipt-basic"><label>{uiText("출고번호")}<input disabled value={initial?.shipment.number || '저장 시 자동 생성'} /></label><label><FormLabel required>{uiText("출고 요청일")}</FormLabel><input aria-label={uiText("출고 요청일")} type="date" required value={basic.requestDate} onChange={e => setBasic(b => ({ ...b, requestDate: e.target.value }))} /></label><label><FormLabel required>{uiText("출고 예정일")}</FormLabel><input aria-label={uiText("출고 예정일")} type="date" required value={basic.date} onChange={e => setBasic(b => ({ ...b, date: e.target.value }))} /></label>
          <div className="shipment-partner-address"><ChoiceField searchable required endpoint={endpoint} kind="partners" label={uiText("매출 거래처")} value={basic.partner?.id || ''} current={basic.partner} onChange={changePartner} /><ShippingAddressFields showLabel label={uiText("출고지")} postalCode={basic.shippingPostalCode} address={basic.shippingAddress} detail={basic.shippingAddressDetail} onChange={(address, detail, postalCode) => { addressEdited.current = true; setBasic(b => ({ ...b, shippingPostalCode: postalCode, shippingAddress: address, shippingAddressDetail: detail })) }} /></div><ChoiceField searchable required endpoint={endpoint} kind="warehouses" label={uiText("출고 창고")} value={basic.warehouse?.id || ''} current={basic.warehouse} onChange={warehouse => { if (warehouse?.id !== basic.warehouse?.id) { setDefaultRack(undefined); setLines(items => items.map(l => ({ ...l, rack: undefined }))) } setBasic(b => ({ ...b, warehouse })) }} />
          <div className="shipment-rack-field"><ShipmentRackChoice endpoint={endpoint} warehouseId={basic.warehouse?.id} label={uiText("기본 출고 랙")} value={defaultRack} sort={rackSort} selectedRackIds={lines.flatMap(l => l.rack ? [l.rack.id] : [])} revision={rackRevision} onRouteNotice={setRouteNotice} onChange={setDefaultRack} /><p className="organization-help">{uiText("지정 랙을 우선 예약하며 부족하면 같은 창고의 다른 위치에 배정합니다. 실제 위치는 피킹 후 표시됩니다.")}</p></div><BusinessAssigneeField feature="shipments" label={uiText("출고 담당자")} userId={basic.contactUserId} name={basic.contact} onChange={v => setBasic(b => ({ ...b, contactUserId: v.contactUserId, contact: v.contactName }))} /><label>{uiText("비고")}<input aria-label={uiText("출고 비고")} maxLength={2000} value={basic.notes} onChange={e => setBasic(b => ({ ...b, notes: e.target.value }))} /></label></div></section>
        <div className="receipt-section-heading"><h3>{uiText("출고 상품")}</h3><div className="receipt-section-buttons"><button type="button" className="secondary" disabled={busy} onClick={() => setPasteOpen(true)}>{uiText("엑셀 붙여넣기")}</button><button type="button" className="primary" disabled={busy || !basic.warehouse} onClick={() => setSelectionOpen(true)}>{uiText("상품 추가")}</button></div></div>
        {!basic.warehouse && <p className="organization-help">{uiText("출고 창고를 선택한 후 상품을 추가할 수 있습니다.")}</p>}

        <div className="shipment-rack-sort"><label>{uiText("랙 선택 기준")}<select aria-label={uiText("랙 선택 기준")} value={rackSort} onChange={e => { void changeRackSort(e.target.value) }}><option value="route">{uiText("동선 순")}</option><option value="stock">{uiText("재고 많은 순")}</option></select></label><p role="status">{rackSort === 'route' ? routeNotice || uiText("창고의 출입구와 이동 가능한 빈 공간을 확인합니다.") : uiText("상품별 가용 재고가 많은 순입니다. 수정 중인 문서의 기존 예약은 재요청 가능 수량에 포함합니다.")}</p>{(recommending || recommendNotice) && <p role="status">{recommending ? uiText("추천 랙을 계산하고 있습니다…") : uiText(recommendNotice)}</p>}</div>
        {availability.error && <p className="alert error" role="alert">{uiText(availability.error)}</p>}
        <div className="document-line-scroll" tabIndex={0} role="region" aria-label={uiText("출고 상품 입력 테이블")}><table className="organization-table document-line-table is-shipping mobile-record-table shipment-registration-products"><thead><tr>{['상품명', '출고 수량', '소비자가', '참고 금액', '창고 가용 재고', 'LOT·유통기한·시리얼', '지정 출고 랙', '랙 재고', '관리'].map(h => <th key={h}><FormLabel required={h === '출고 수량'}>{uiText(h)}</FormLabel></th>)}</tr></thead><tbody>
        {!lines.length && <tr><td colSpan={9}>{uiText("[상품 추가] 또는 [엑셀 붙여넣기]로 상품을 추가하세요.")}</td></tr>}
        {lines.map((l, i) => {
          const stock = availability.stocks.get(l.product?.id || ''), issue = rowError(l), number = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString(getLocale(), { maximumFractionDigits: 3 })
          return <tr key={l.key} aria-label={uiText("출고 상품 {v0}", { v0: i + 1 })}>
            <td className="document-product"><strong>{l.product?.name}</strong><small>{l.product?.code}</small>{issue && !quantityError(l.quantity) && <span className="document-error" role="alert">{issue}</span>}</td>

            <td data-label={uiText("출고 수량")} className="document-quantity"><QuantityInput unit={l.product?.unit} id={`document-quantity-${l.key}`} aria-label={uiText("수량 {v0}", { v0: i + 1 })} aria-invalid={!!issue} required type="number" min="0.001" max="999999999.999" step="0.001" value={l.quantity} onChange={e => change(i, { quantity: e.target.value })} /><span className="receipt-quantity-unit">{l.product?.unit}</span></td>
            <td data-label={uiText("소비자가")} className="receipt-reference-price">{retailAmount(l.product?.retailPrice,l.product?.currency || 'KRW')}</td><td data-label={uiText("참고 금액")} className="receipt-reference-price">{retailAmount(l.product?.retailPrice == null || quantityError(l.quantity) ? null : l.product.retailPrice * Number(l.quantity),l.product?.currency || 'KRW')}</td>
            <td data-label={uiText("창고 가용 재고")} className="document-stock-number">{availability.loading ? uiText("조회 중…") : number(stock?.available)}<small>{uiText("현재")} {number(stock?.physical)} {uiText("/ 예약")} {number(stock?.reserved)}</small>{!!stock?.ownReserved && <small>{uiText("이 문서 예약")} {stock.ownReserved} {uiText("포함")}<br />{uiText("재요청 가능")} {stock.requestable}</small>}</td>
            <td className="document-tracking"><button type="button" className="secondary" aria-label={uiText("재고 선택 {v0}", { v0: i + 1 })} disabled={!basic.warehouse} onClick={() => setStockKey(l.key)}>{uiText("재고 선택")}</button><small>{[l.lot && `LOT ${l.lot}`, l.expiry, splitSerials(l.serialText).length > 0 && `시리얼 ${splitSerials(l.serialText).length}개`].filter(Boolean).join(' · ') || uiText("조건 미지정 · 자동 배정")}</small></td>
            <ShipmentRackChoice table endpoint={endpoint} warehouseId={basic.warehouse?.id} shipmentId={initial?.shipment.id} productId={l.product?.id} label={uiText("지정 출고 랙 {v0}", { v0: i + 1 })} value={l.rack} sort={rackSort} selectedRackIds={lines.flatMap(x => x.rack ? [x.rack.id] : [])} lot={l.lot} expiry={l.expiry} serials={splitSerials(l.serialText)} quantity={l.quantity} revision={rackRevision} onChange={rack => change(i, { rack })} />
            <td className="document-actions"><button type="button" className="secondary" aria-label={uiText("상품 {v0} 제거", { v0: i + 1 })} onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}>{uiText("삭제")}</button></td>
          </tr>
        })}
        </tbody><tfoot><tr><td colSpan={9}><div className="receipt-table-totals"><strong>{uiText("상품")} {lines.length}{uiText("행")}</strong><span>{uiText("전체 수량")} {unitTotals(lines.filter(l=>l.product&&!quantityError(l.quantity)).map(l=>({unit:l.product!.unit || '',quantity:Number(l.quantity)}))) || '—'}</span><span>{uiText("소비자가 기준")} {receiptRetailTotals(lines).amount}</span>{receiptRetailTotals(lines).missing > 0 && <span>{uiText("금액 미산정")} {receiptRetailTotals(lines).missing}{uiText("행")}</span>}<small>{uiText("참고 금액이며 공급가·매출액이 아닙니다.")}</small></div></td></tr></tfoot></table></div>
      </> : initial && <><p className="organization-help">{uiText("예약된 위치·LOT·시리얼을 확인해 수량을 입력하세요. 완료 시 모든 수량이 일치해야 하며, 물리 재고는 출고 확정 전까지 유지됩니다.")}</p><AllocationTable data={initial} values={values} inspect={mode === 'inspection'} onChange={(id, value) => setValues(v => ({ ...v, [id]: value }))} /><label className="shipment-complete"><input type="checkbox" checked={complete} onChange={e => setComplete(e.target.checked)} />{uiText("저장하면서")} {mode === 'picking' ? uiText("피킹") : uiText("검수")} {uiText("완료")}</label></>}
    </fieldset></div>{!page && <div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={() => requestNavigation(onClose)}>{uiText("취소")}</button><button className="primary" type="submit" disabled={busy}>{initial ? mode === 'picking' ? uiText("피킹 저장") : mode === 'inspection' ? uiText("검수 저장") : uiText("출고 요청 저장") : uiText("출고 등록")}</button></div>}</form>
    </RegistrationFields>
  </RegistrationSurface>
}

function ShipmentLocationHistory({ data }: { data: ShipmentDetail }) {
  const rows = data.allocations.filter(a=>a.pickedQuantity > 0), confirmed = data.shipment.status === 'Confirmed'
  return <section aria-label={uiText("출고 위치 내역")}><h3>{uiText("출고 위치 내역")}</h3><p className="organization-help">{confirmed ? uiText("확정된 실제 출고 위치와 수량입니다.") : uiText("피킹 기록이 있는 위치만 표시합니다. 아직 실제 재고는 차감되지 않았습니다.")}</p><div className="table-scroll receipt-lines"><table className="organization-table document-detail-products"><thead><tr>{['상품', '출고창고', confirmed ? '실제 출고 랙' : '피킹 랙', '보관 위치', 'LOT·유통기한·시리얼', '피킹 수량', '출고 확정 수량', '피킹 담당자·일시'].map(h=><th key={h}>{uiText(h)}</th>)}</tr></thead><tbody>{!rows.length && <tr><td colSpan={8}>{uiText("실제 피킹 위치 미지정")}</td></tr>}{rows.map(a=>{const line=data.lines.find(l=>l.id===a.lineId)!;return <tr key={a.id}><td data-label={uiText("상품")} className="document-detail-product">{line.productName}<small>{line.productCode}</small></td><td data-label={uiText("출고창고")}>{a.warehouseName || data.shipment.warehouseName}</td><td data-label={uiText("출고 / 피킹 랙")}>{a.rackCode || uiText("바닥 보관")}</td><td data-label={uiText("보관 위치")}>{a.locationCode}</td><td data-label={uiText("LOT·유통기한·시리얼")} className="document-detail-wide">{[a.lotNumber,a.expiryDate,a.serialNumber].filter(Boolean).join(' · ') || '—'}</td><td data-label={uiText("피킹 수량")} className="receipt-reference-price">{a.pickedQuantity.toLocaleString(getLocale())} {line.unit}</td><td data-label={uiText("출고 확정 수량")} className="receipt-reference-price">{a.state === 'Consumed' ? (a.confirmedQuantity ?? a.quantity).toLocaleString(getLocale())+' '+line.unit : uiText("미확정")}</td><td data-label={uiText("피킹 담당자·일시")} className="document-detail-wide">{a.pickedByName || '—'}<small>{a.pickedAt ? new Date(a.pickedAt).toLocaleString(getLocale()) : '—'}</small></td></tr>})}</tbody></table></div></section>
}
