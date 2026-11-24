import { t as uiText, getLocale } from '../../i18n.ts'
import FormLabel from '../FormLabel'
import QuantityInput from './QuantityInput'
import { ArrowDown } from 'lucide-react'
import { useCurrentAssignee } from '../../business-assignee'
import BusinessAssigneeField from './BusinessAssigneeField'
import UnsavedChangesContent from './UnsavedChangesContent'
import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../api'
import type { Choice } from '../../receipt-model'
import { inventoryQuantityError } from '../../inventory-model'
import { floorRackId as floorId, moveSourceMatches, moveSelectionError } from '../../inventory-move-model'
import type { OperationDetail, StockDetail, StockRow } from '../../inventory-model'
import { requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import OrganizationDialog from './OrganizationDialog'
import SearchableChoiceField from './SearchableChoiceField'
import { useLiveInventory } from './useLiveInventory'

const choice = (id: string, name: string, code = ''): Choice => ({ id, name, code, unit: null, lotManaged: false, expiryManaged: false, serialManaged: false })
const num = (n: number) => n.toLocaleString(getLocale(), { maximumFractionDigits: 3 })
type Place = { warehouse?: Choice; rack?: Choice; location?: Choice }
type Props = { endpoint: string; stockId?: string; onClose: () => void; onSaved: (d: OperationDetail) => void }

export default function InventoryMoveEditor(props: Props) {
  const [initial, setInitial] = useState<StockRow>(), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!props.stockId) return
    let live = true
    api<StockDetail>(`${props.endpoint}/${props.stockId}`).then(d => { if (live) { setInitial(d.stock); setError('') } }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [props.endpoint, props.stockId, retry])
  if (props.stockId && !initial) return <OrganizationDialog title={uiText("재고 이동")} onClose={props.onClose}>{error ? <p role="alert">{uiText(error)}<button className="secondary" onClick={() => setRetry(n => n + 1)}>{uiText("다시 조회")}</button></p> : <p role="status">{uiText("출발 재고를 불러오는 중…")}</p>}</OrganizationDialog>
  return <MoveForm {...props} initial={initial} />
}
function MoveForm({ endpoint, initial, onClose, onSaved }: Props & { initial?: StockRow }) {
  const currentAssignee = useCurrentAssignee()
  const [assignee, setAssignee] = useState(() => ({ contactUserId: currentAssignee?.id, contactName: currentAssignee?.name || '' }))
  const [product, setProduct] = useState<Choice | undefined>(() => initial ? { ...choice(initial.productId, initial.productName, initial.productCode), unit: initial.unit } : undefined)
  const [from, setFrom] = useState<Place>(() => initial ? { warehouse: choice(initial.warehouseId, initial.warehouseName), rack: choice(initial.rackId || floorId, initial.rackCode || '랙 없는 보관 위치', initial.rackCode || '바닥'), location: choice(initial.locationId, initial.locationCode) } : {})
  const [to, setTo] = useState<Place>({})
  const [selected, setSelected] = useState<Choice | undefined>(() => initial ? stockChoice(initial) : undefined)
  const [quantity, setQuantity] = useState(''), [reason, setReason] = useState(''), [notes, setNotes] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 16) })
  const [locationStocks, setLocationStocks] = useState<{ key: string; total?: number; error?: string }>(), [stockRetry, setStockRetry] = useState(0)
  const locationKey = `${product?.id}:${from.warehouse?.id}:${from.location?.id}`
  useEffect(() => {
    if (!product || !from.warehouse || !from.location) return
    let live = true
    const query = new URLSearchParams({ kind: 'move-stocks', productId: product.id, warehouseId: from.warehouse.id, locationId: from.location.id })
    api<{ items: Choice[]; total: number }>(`${endpoint}/choices?${query}`).then(data => {
      if (!live) return
      setLocationStocks({ key: locationKey, total: data.total })
      if (data.total === 1) setSelected(current => current || data.items[0])
    }).catch(e => { if (live) setLocationStocks({ key: locationKey, error: e.message }) })
    return () => { live = false }
  }, [endpoint, product, from.warehouse, from.location, locationKey, stockRetry])
  const currentLocationStocks = locationStocks?.key === locationKey ? locationStocks : undefined
  const draft = JSON.stringify({ product, from, to, selected, quantity, reason, notes, occurredAt, assignee })
  const [baseline] = useState(draft), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<{ stock: StockRow; requestId: string }>()
  const [uncertain, setUncertain] = useState(false), flight = useRef(false)
  const navigation = useUnsavedNavigation(draft !== baseline || busy || uncertain, busy || uncertain, () => setConfirmation(undefined))
  const tenantId = endpoint.split('/')[3]
  const read = useLiveInventory<StockDetail>(selected ? `${endpoint}/${selected.id}` : null, tenantId)
  const fromSelection = { productId: product?.id, warehouseId: from.warehouse?.id, rackId: from.rack?.id, locationId: from.location?.id }
  const matches = (s: StockRow) => moveSourceMatches(s, fromSelection)
  const source = read.data && matches(read.data.stock) ? read.data.stock : undefined
  const issue = quantity ? inventoryQuantityError(quantity, source, false) : null
  const same = !!from.location && from.location.id === to.location?.id
  const route = `${placeLabel(from)} → ${placeLabel(to)}`
  function changeFrom(next: Place) { setFrom(next); setSelected(undefined); setQuantity(''); setError('') }
  function valid(s: StockRow | undefined) {
    const selectionError = moveSelectionError(s, fromSelection, { warehouseId: to.warehouse?.id, rackId: to.rack?.id, locationId: to.location?.id }, quantity)
    if (selectionError) return selectionError
    if (!reason.trim() || !occurredAt) return '이동 사유와 처리일시를 입력해 주세요.'
    return null
  }

  async function review() {
    if (flight.current) return
    const problem = valid(source); if (problem) { setError(problem); return }
    flight.current = true; setBusy(true); setError('')
    try {
      const { stock } = await api<StockDetail>(`${endpoint}/${selected!.id}`)
      const latestProblem = valid(stock)
      if (latestProblem) { setError(latestProblem); read.refresh(); return }
      setConfirmation({ stock, requestId: crypto.randomUUID() })
    } catch (e) { setError(e instanceof Error ? e.message : '재고를 확인하지 못했습니다.') }
    finally { flight.current = false; setBusy(false) }
  }
  async function save() {
    if (flight.current || !confirmation) return
    flight.current = true; setBusy(true); setError('')
    try {
      const result = await api<OperationDetail>(`${endpoint}/move`, { contactUserId: assignee.contactUserId, requestId: confirmation.requestId, stockId: confirmation.stock.id, version: confirmation.stock.version, warehouseId: to.warehouse!.id, locationId: to.location!.id, quantity: Number(quantity), reason: reason.trim(), notes: notes.trim() || null, occurredAt: new Date(occurredAt).toISOString() })
      navigation.saved(); onSaved(result)
    } catch (e) {
      const rejected = e instanceof ApiError && [400, 401, 403, 404, 409, 429].includes(e.status)
      setUncertain(!rejected)
      setError(e instanceof Error ? e.message : '처리 결과를 확인하지 못했습니다.')
      if (rejected) { setConfirmation(undefined); read.refresh() }
    } finally { flight.current = false; setBusy(false) }
  }
  return <OrganizationDialog title={navigation.blocked ? uiText("저장하지 않은 재고 작업") : confirmation ? uiText("재고 이동 확정") : uiText("재고 이동")} className={confirmation && !navigation.blocked ? 'inventory-move-confirm-dialog' : ''} actions={confirmation && !navigation.blocked ? <><button type="button" className="secondary" disabled={busy || uncertain} onClick={() => setConfirmation(undefined)}>{uiText("취소")}</button><button type="button" className="primary" disabled={busy} onClick={save}>{busy ? uiText("처리 중…") : uncertain ? uiText("처리 결과 다시 확인") : uiText("이동 확정")}</button></> : undefined} confirmation={!!confirmation || navigation.blocked} size={confirmation || navigation.blocked ? 'small' : 'large'} busy={busy || uncertain} onClose={() => navigation.blocked ? navigation.stay() : confirmation ? setConfirmation(undefined) : requestNavigation(onClose)}>
    {error && <p role="alert" className="alert error">{uiText(error)}</p>}
    {navigation.blocked ? <UnsavedChangesContent stay={navigation.stay} discard={navigation.discard} message="저장하지 않은 재고 작업을 버리시겠습니까?" /> : confirmation ? <section className="inventory-move-confirm" role="alertdialog" aria-label={uiText("재고 이동 확인")}>
      <div className="move-confirm-summary"><div><span className="move-confirm-label">{uiText("상품 정보")}</span><strong className="move-confirm-product">{confirmation.stock.productName}</strong><small>{confirmation.stock.productCode}</small></div><div className="move-confirm-quantity"><span className="move-confirm-label">{uiText("이동 수량")}</span><strong>{num(Number(quantity))}<small>{['EA', '개'].includes(confirmation.stock.unit) ? uiText("개") : ` ${confirmation.stock.unit}`}</small></strong></div></div>
      <div className="move-confirm-route"><MoveConfirmPlace label={uiText("출발 위치")} place={from} /><ArrowDown className="move-confirm-arrow" size={20} aria-hidden="true" /><MoveConfirmPlace label={uiText("도착 위치")} place={to} /></div>
      <div className="move-confirm-context"><p>{uiText("출발 재고")} {num(confirmation.stock.quantity)} → {num(confirmation.stock.quantity - Number(quantity))} {confirmation.stock.unit} {uiText("· 예약")} {num(confirmation.stock.reservedQuantity)} {uiText("유지")}</p>
        {(confirmation.stock.lotNumber || confirmation.stock.expiryDate || confirmation.stock.serialNumber) && <dl className="move-confirm-tracking">{confirmation.stock.lotNumber && <div><dt>LOT</dt><dd>{confirmation.stock.lotNumber}</dd></div>}{confirmation.stock.expiryDate && <div><dt>{uiText("유통기한")}</dt><dd>{confirmation.stock.expiryDate}</dd></div>}{confirmation.stock.serialNumber && <div><dt>{uiText("시리얼")}</dt><dd>{confirmation.stock.serialNumber}</dd></div>}</dl>}
        <p>{uiText("이동 사유:")} {reason}</p>
      </div>
      <div className="move-confirm-notice"><p>{uiText("위 내용으로 재고 이동을 확정하시겠습니까?")}</p><small>{uiText("확정 즉시 반영되며, 완료 내역은 수정·삭제할 수 없습니다.")}</small></div>
      {uncertain && <p role="status">{uiText("처리 결과를 확인해야 합니다. 같은 요청으로 다시 확인하며 중복 이동하지 않습니다.")}</p>}
    </section> : null}
    <form className="dialog-form inventory-move-form" hidden={!!confirmation || navigation.blocked} onSubmit={e => { e.preventDefault(); void review() }}>
      <div className="dialog-form-scroll"><fieldset disabled={busy}>
        <div className="inventory-move-product"><SearchableChoiceField required endpoint={endpoint} kind="move-products" label={uiText("이동할 상품")} value={product?.id || ''} current={product} searchPlaceholder={uiText("상품명·상품코드·바코드 검색")} emptyMessage={uiText("이동할 수 있는 활성 재고 상품이 없습니다.")} onChange={p => { setProduct(p); changeFrom({}) }} /><p className="organization-help">{uiText("상품을 선택한 뒤 출발 위치와 도착 위치를 지정하세요.")}</p></div>
        <div className="inventory-move-places"><PlaceFields endpoint={endpoint} source productId={product?.id} value={from} onChange={changeFrom} /><PlaceFields endpoint={endpoint} value={to} onChange={p => { setTo(p); setError('') }} /></div>
        {to.location && <p role="status" className="inventory-preview inventory-move-route">{route}</p>}
        {same && <p role="alert" className="alert error">{uiText("출발 위치와 도착 위치가 같습니다. 다른 보관 위치를 선택해 주세요.")}</p>}
        <section className="inventory-move-stock"><h3>{uiText("출발 재고 · 이동 정보")}</h3>
          {from.location && <p className="organization-help" role={currentLocationStocks?.error ? 'alert' : 'status'}>{currentLocationStocks?.error ? <>{uiText(currentLocationStocks.error)}<button type="button" className="secondary" onClick={() => setStockRetry(n => n + 1)}>{uiText("재고 목록 다시 조회")}</button></> : currentLocationStocks?.total === undefined ? uiText("선택한 위치의 실제 재고를 조회하는 중…") : currentLocationStocks.total === 0 ? uiText("이 위치에 남아 있는 재고가 없습니다. 출발 위치를 다시 선택해 주세요.") : currentLocationStocks.total === 1 ? uiText("이 위치의 재고 항목을 자동 선택했습니다.") : uiText("이 위치에 재고 {v0}건이 있습니다. LOT·유통기한·시리얼을 확인하고 선택하세요.", { v0: currentLocationStocks.total })}</p>}
          <SearchableChoiceField key={`${product?.id}:${from.location?.id}`} required disabled={!from.location} endpoint={endpoint} kind="move-stocks" productId={product?.id} warehouseId={from.warehouse?.id} locationId={from.location?.id} label={uiText("LOT·시리얼 재고 항목")} placeholder={from.location ? uiText("이동할 재고 항목을 선택하세요") : uiText("출발 보관 위치를 먼저 선택하세요")} searchPlaceholder={uiText("LOT·시리얼·재고 ID 검색")} emptyMessage={uiText("이 위치에 남아 있는 재고가 없습니다. 출발 위치를 다시 선택해 주세요.")} value={selected?.id || ''} current={source ? stockChoice(source) : selected} onChange={s => { setSelected(s); setQuantity(''); setError('') }} />
          {read.error && <p role="alert" className="alert error">{uiText(read.error)}<button type="button" className="secondary" onClick={read.refresh}>{uiText("재고 다시 조회")}</button></p>}
          {selected && !source && !read.error && <p role="status">{read.loading ? uiText("현재 재고를 조회하는 중…") : uiText("재고의 위치가 변경되었습니다. 재고 항목을 다시 선택해 주세요.")}</p>}
          {source && <><dl className="inventory-move-tracking"><div><dt>{uiText("상품명 / 상품코드")}</dt><dd>{source.productName} / {source.productCode}</dd></div><div><dt>{uiText("LOT 번호")}</dt><dd>{source.lotNumber || '—'}</dd></div><div><dt>{uiText("유통기한")}</dt><dd>{source.expiryDate || '—'}</dd></div><div><dt>{uiText("시리얼 번호")}</dt><dd>{source.serialNumber || '—'}</dd></div><div><dt>{uiText("기준 단위")}</dt><dd>{source.unit}</dd></div></dl><dl className="inventory-quantities"><div><dt>{uiText("현재 재고")}</dt><dd>{num(source.quantity)} {source.unit}</dd></div><div><dt>{uiText("출고 예정")}</dt><dd>{num(source.reservedQuantity)} {source.unit}</dd></div><div><dt>{uiText("출고 가능")}</dt><dd>{num(source.availableQuantity)} {source.unit}</dd></div></dl></>}
          <div className="receipt-basic"><label><FormLabel required>{uiText("이동 수량 (")}{source?.unit || product?.unit || uiText("기준 단위")})</FormLabel><QuantityInput unit={source?.unit || product?.unit} aria-label={uiText("이동 수량")} required disabled={!source} type="number" min={source?.serialManaged ? 1 : 0.001} max={source?.availableQuantity || 0} step={source?.serialManaged ? 1 : 0.001} value={quantity} onChange={e => setQuantity(e.target.value)} /><small>{uiText("최대")} {num(source?.availableQuantity || 0)} {source?.unit || product?.unit} {uiText("· 출고 예약 수량 제외")}</small></label>
          <label><FormLabel required>{uiText("이동 사유")}</FormLabel><input aria-label={uiText("이동 사유")} required maxLength={300} placeholder={uiText("예: 위치 정리")} value={reason} onChange={e => setReason(e.target.value)} /></label><label><FormLabel required>{uiText("처리일시")}</FormLabel><input aria-label={uiText("재고 처리일시")} required type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} /></label><BusinessAssigneeField feature="stock-adjustments" label={uiText("업무 담당자")} userId={assignee.contactUserId} name={assignee.contactName} onChange={setAssignee} /><label className="products-full">{uiText("비고")}<input aria-label={uiText("재고 비고")} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label></div>
          {issue && <p role="alert" className="alert error">{issue}</p>}
        </section>
      </fieldset></div><div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={() => requestNavigation(onClose)}>{uiText("취소")}</button><button className="primary" type="submit" disabled={busy || !!issue || same || !source || !source.isActive || source.availableQuantity <= 0 || !to.location || !!read.error}>{busy ? uiText("재고 확인 중…") : uiText("재고 이동")}</button></div>
    </form>
  </OrganizationDialog>
}
function PlaceFields({ endpoint, source = false, productId, value, onChange }: { endpoint: string; source?: boolean; productId?: string; value: Place; onChange: (p: Place) => void }) {
  const label = source ? '출발' : '도착', prefix = source ? 'move-source-' : 'move-'
  return <section className="inventory-move-place"><h3>{uiText(label)} {uiText("위치")}</h3>
    <SearchableChoiceField key={productId || 'destination'} required disabled={source && !productId} endpoint={endpoint} kind={`${prefix}warehouses`} productId={productId} label={uiText("{v0} 창고", { v0: uiText(label) })} placeholder={source && !productId ? uiText("이동할 상품을 먼저 선택하세요") : uiText("창고를 선택하세요")} emptyMessage={source ? uiText("이 상품의 재고가 있는 활성 창고가 없습니다.") : uiText("선택 가능한 활성 창고가 없습니다.")} value={value.warehouse?.id || ''} current={value.warehouse} onChange={warehouse => onChange({ warehouse })} />
    <SearchableChoiceField key={`${productId}:${value.warehouse?.id}`} required disabled={!value.warehouse} endpoint={endpoint} kind={`${prefix}racks`} productId={productId} warehouseId={value.warehouse?.id} label={uiText("{v0} 랙", { v0: uiText(label) })} placeholder={value.warehouse ? uiText("랙을 선택하세요") : uiText("{v0} 창고를 먼저 선택하세요", { v0: uiText(label) })} searchPlaceholder={uiText("랙 코드·랙 이름 검색")} emptyMessage={source ? uiText("재고가 있는 활성 랙·바닥 위치가 없습니다.") : uiText("보관 위치가 있는 활성 랙·바닥 위치가 없습니다.")} value={value.rack?.id || ''} current={value.rack} onChange={rack => onChange({ warehouse: value.warehouse, rack })} />
    <SearchableChoiceField key={`${productId}:${value.warehouse?.id}:${value.rack?.id}`} required disabled={!value.rack} endpoint={endpoint} kind={`${prefix}locations`} productId={productId} warehouseId={value.warehouse?.id} rackId={value.rack?.id} label={uiText("{v0} 보관 위치", { v0: uiText(label) })} placeholder={value.rack ? uiText("보관 위치를 선택하세요") : uiText("{v0} 랙을 먼저 선택하세요", { v0: uiText(label) })} searchPlaceholder={uiText("보관 위치 코드·바코드 검색")} emptyMessage={source ? uiText("재고가 있는 활성 보관 위치가 없습니다.") : uiText("선택 가능한 활성 보관 위치가 없습니다.")} value={value.location?.id || ''} current={value.location} onChange={location => onChange({ ...value, location })} />
  </section>
}
function placeLabel(p: Place) { return [p.warehouse?.name || '창고 미선택', p.rack?.code || p.rack?.name || '랙 미선택', p.location?.code || p.location?.name || '위치 미선택'].join(' / ') }
function stockChoice(s: StockRow): Choice { return { ...choice(s.id, `LOT ${s.lotNumber || '없음'} · 시리얼 ${s.serialNumber || '없음'}`, s.id), unit: s.unit, expiryDate: s.expiryDate, quantity: s.quantity, reservedQuantity: s.reservedQuantity, availableQuantity: s.availableQuantity } }

function MoveConfirmPlace({ label, place }: { label: string; place: Place }) {
  const rack = place.rack?.id !== floorId ? place.rack?.code || place.rack?.name : undefined
  const location = place.location?.name || place.location?.code
  const code = place.location?.code && place.location.code !== location ? place.location.code : undefined
  return <div className="move-confirm-place"><span className="move-confirm-label">{uiText(label)}</span><strong>{place.warehouse?.name}</strong><span>{[rack, location].filter(Boolean).join(' · ')}</span>{code && <small>{code}</small>}</div>
}
