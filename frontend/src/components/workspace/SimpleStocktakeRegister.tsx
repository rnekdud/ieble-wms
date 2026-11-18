import FormLabel from '../FormLabel'
import QuantityInput from './QuantityInput'
import BusinessAssigneeField from "./BusinessAssigneeField"
import { useCurrentAssignee } from "../../business-assignee"
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../api'
import { requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import { countError, countInput, difference, selectedCountError, selectedSummary, selectionInput, stocktakeDifferenceLabel } from '../../stocktake-model'
import type { SelectedCountRow, StocktakeCandidate, StocktakeDetail } from '../../stocktake-model'
import type { Choice } from '../../receipt-model'
import type { ImportedProduct } from '../../document-paste'
import DetailSurface from './DetailSurface'
import OrganizationDialog from './OrganizationDialog'
import ProductSelectionDialog from './ProductSelectionDialog'
import SearchableChoiceField from './SearchableChoiceField'
import StocktakeItemDialog from './StocktakeItemDialog'
import UnsavedChangesContent from './UnsavedChangesContent'

type Row = { key: string; product: Choice; target?: SelectedCountRow }
type Candidates = { items: StocktakeCandidate[]; total: number; pageSize: number }
type StockChoice = Choice & { target: StocktakeCandidate }
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const blank = (target: StocktakeCandidate): SelectedCountRow => ({ ...target, quantity: '', reason: '', observedSerial: '' })
const option = (target: StocktakeCandidate): StockChoice => ({ id: target.id, name: `${target.warehouseName} / ${target.rackCode || '바닥'} / ${target.locationCode}`, code: [target.lotNumber && `LOT ${target.lotNumber}`, target.expiryDate && `유통기한 ${target.expiryDate}`, target.serialNumber && `시리얼 ${target.serialNumber}`, `전산 ${target.baselineQuantity}`].filter(Boolean).join(' · '), unit: target.unit, lotManaged: false, expiryManaged: false, serialManaged: !!target.serialNumber, target })
const candidatesUrl = (endpoint: string, warehouseId: string, productId: string, search = '', page = 1) => `${endpoint}/candidates?${new URLSearchParams({ warehouseId, productId, search, page: String(page) })}`

function fromDetail(detail: StocktakeDetail): Row[] {
  return (detail.selectedItems || []).map(t => ({ key: t.id, product: { id: t.productId, code: t.productCode, name: t.productName, unit: t.unit, lotManaged: !!t.lotNumber, expiryManaged: !!t.expiryDate, serialManaged: !!t.serialNumber }, target: {
    ...t, id: t.stockId || t.id, targetId: t.id, stockVersion: t.baselineVersion, warehouseName: detail.document.warehouseName,
    quantity: t.countedQuantity === null ? '' : String(t.countedQuantity), reason: t.reason || '', observedSerial: t.observedSerial || '',
  } }))
}
const basicInfo = (detail: StocktakeDetail | undefined, user: string) => ({ day: detail ? new Date(detail.document.basisAt).toLocaleDateString('en-CA') : today(), contactUserId: detail?.document.contactUserId, contactName: detail?.document.contactName ?? user, notes: detail?.document.notes || '' })
const warehouseChoice = (detail?: StocktakeDetail): Choice | undefined => detail ? { id: detail.document.warehouseId, name: detail.document.warehouseName, code: '', unit: null, lotManaged: false, expiryManaged: false, serialManaged: false } : undefined
const snapshot = (draft: ReturnType<typeof basicInfo>, rows: Row[], warehouse?: Choice) => JSON.stringify({draft, rows, warehouseId:warehouse?.id})
export default function SimpleStocktakeRegister({ endpoint, grants, currentUser, initialDetail, showSavedNotice = false, onClose, onSaved }: { endpoint: string; grants: string[]; currentUser: string; initialDetail?: StocktakeDetail; showSavedNotice?: boolean; onClose: () => void; onSaved: (detail: StocktakeDetail) => void }) {
  const currentAssignee = useCurrentAssignee()
  const [draft, setDraft] = useState(() => initialDetail ? basicInfo(initialDetail, currentUser) : { ...basicInfo(undefined, currentAssignee?.name || ""), contactUserId: currentAssignee?.id })
  const [warehouse, setWarehouse] = useState<Choice | undefined>(() => warehouseChoice(initialDetail)), [rows, setRows] = useState<Row[]>(() => initialDetail ? fromDetail(initialDetail) : []), [picker, setPicker] = useState(false), [found, setFound] = useState(false), [pickerDirty, setPickerDirty] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState(false), [saved, setSaved] = useState<StocktakeDetail | undefined>(initialDetail), [notice, setNotice] = useState(showSavedNotice ? '실사를 저장했습니다.' : ''), [uncertain, setUncertain] = useState(false)
  const locked = useRef(false), [requestId] = useState(() => crypto.randomUUID()), pendingCreate = useRef<object | null>(null)
  const [baseline, setBaseline] = useState(() => snapshot(draft, rows, warehouse))
  const dirty = snapshot(draft, rows, saved ? warehouse : undefined) !== baseline
  const guard = useUnsavedNavigation(dirty || pickerDirty || uncertain, busy)
  const canCount = grants.includes('count') && (!!saved || grants.includes('create')), canConfirm = canCount && grants.includes('confirm') && grants.includes('update')
  const targets = rows.flatMap(r => r.target ? [{ ...r.target, reason: r.target.reason.trim() || draft.notes.trim().slice(0, 500) || '실물 수량 확인' }] : [])
  const summary = selectedSummary(targets), productCount = new Set(rows.map(r => r.product.id)).size
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer) }, [notice])
  useEffect(() => {
    if (initialDetail) return
    let live = true
    api<{ items: Choice[]; total: number }>(endpoint + '/choices?kind=warehouses&page=1').then(result => { if (live && result.total === 1) setWarehouse(current => current || result.items[0]) }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [endpoint, initialDetail])
  async function add(products: ImportedProduct[]) {
    if (!warehouse || locked.current) return
    locked.current = true; setBusy(true); setError('')
    try {
      const added = await Promise.all(products.map(async ({ product }) => {
        const result = await api<Candidates>(candidatesUrl(endpoint, warehouse.id, product.id))
        return { key: crypto.randomUUID(), product, target: result.total === 1 && !rows.some(r => r.target?.stockId === result.items[0].stockId) ? blank(result.items[0]) : undefined }
      }))
      setRows(current => [...current, ...added]); setPicker(false); setPickerDirty(false)
    } catch (e) { setError((e as Error).message) }
    finally { locked.current = false; setBusy(false) }
  }
  function validate(final: boolean) {
    if (!warehouse || (!rows.length && (!saved || final))) return '창고와 실사할 상품을 선택하세요.'
    if (targets.length !== rows.length) return '각 상품의 보관 위치·추적 재고를 선택하세요.'
    if (new Set(targets.map(t => t.id)).size !== targets.length) return '같은 재고가 중복 선택되었습니다.'
    return targets.map(row => final ? selectedCountError(row) : countError(countInput(row.quantity), row.serialNumber, row.observedSerial, row.unit)).find(Boolean) || ''
  }
  function accept(result: StocktakeDetail) {
    const nextDraft = basicInfo(result, currentUser), nextRows = fromDetail(result), nextWarehouse = warehouseChoice(result)
    setSaved(result); setDraft(nextDraft); setRows(nextRows); setWarehouse(nextWarehouse)
    setBaseline(snapshot(nextDraft, nextRows, nextWarehouse)); guard.saved(); setUncertain(false); pendingCreate.current = null
  }
  async function save(final: boolean) {
    if (locked.current || !canCount) return
    const issue = validate(final); if (issue) { setError(issue); setConfirm(false); return }
    locked.current = true; setBusy(true); setError(''); setNotice('')
    let persisted = saved, savedThisAttempt = false
    try {
      if (!persisted) {
        pendingCreate.current ||= { requestId, name: `${draft.day} 상품 실사`, basisAt: new Date(draft.day + 'T00:00:00').toISOString(), scope: 'Selected', scopeId: null, warehouseId: warehouse!.id, contactUserId: draft.contactUserId, contactName: draft.contactName, notes: draft.notes, selection: targets.map(selectionInput) }
        persisted = await api<StocktakeDetail>(endpoint, pendingCreate.current)
      } else if (dirty) {
        persisted = await api<StocktakeDetail>(`${endpoint}/${persisted.document.id}/draft`, { version: persisted.document.version, basisAt: new Date(draft.day + 'T00:00:00').toISOString(), contactUserId: draft.contactUserId, contactName: draft.contactName, notes: draft.notes, items: targets.map(t => ({ targetId: t.targetId || null, selection: selectionInput(t) })) })
      }
      savedThisAttempt = true; accept(persisted)
      if (final) persisted = await api<StocktakeDetail>(`${endpoint}/${persisted.document.id}/confirm-selected`, { version: persisted.document.version })
      onSaved(persisted); setNotice(final ? '' : '실사를 저장했습니다.')
    } catch (e) {
      if (persisted && savedThisAttempt) onSaved(persisted)
      else if (!persisted && (!(e instanceof ApiError) || e.status >= 500)) setUncertain(true)
      else pendingCreate.current = null
      setError((savedThisAttempt && final ? '입력 내용은 저장되었으며 재고는 확정되지 않았습니다. ' : '') + (e as Error).message)
    } finally { locked.current = false; setBusy(false); setConfirm(false) }
  }
  function choose(key: string, target: StocktakeCandidate) {
    if (rows.some(r => r.key !== key && r.target?.id === target.id)) { setError('이미 추가한 위치·LOT·시리얼 재고입니다. 기존 행에서 수량을 수정하세요.'); return }
    setError(''); setRows(current => current.map(r => r.key === key ? { ...r, target: blank(target) } : r))
  }
  return <DetailSurface title="재고 실사" code={saved?.document.number || '신규 실사'} status={<span className="status-badge Counting">작성 중</span>} hideListAction busy={busy} onClose={() => requestNavigation(onClose)} actions={<><button type="submit" form="simple-stocktake" className="secondary" disabled={busy || !canCount}>실사 저장</button>{canConfirm && <button type="submit" form="simple-stocktake" name="intent" value="confirm" className="primary" disabled={busy || uncertain}>실사 확정</button>}</>}>
    {notice && <div role="status" className="stocktake-save-toast">{notice}</div>}
    <form id="simple-stocktake" className="simple-stocktake" onSubmit={e => { e.preventDefault(); const final = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'confirm'; const issue = validate(final); if (issue) { setError(issue); return } setError(''); if (final) setConfirm(true); else void save(false) }}>
      {error && <p role="alert" className="alert error">{error}{uncertain && ' 같은 입력으로 [실사 저장]을 다시 눌러 저장 여부를 확인하세요.'}</p>}
      <fieldset disabled={busy || uncertain || !canCount}>
        <div className="simple-stocktake-fields"><label><FormLabel required>실사일자</FormLabel><input aria-label="실사일자" type="date" required max={today()} value={draft.day} onChange={e => setDraft({ ...draft, day: e.target.value })} /></label><BusinessAssigneeField feature="stocktake" label="실사 담당자" userId={draft.contactUserId} name={draft.contactName} onChange={v => setDraft(d => ({ ...d, ...v }))} /><SearchableChoiceField required endpoint={endpoint} kind="warehouses" label="창고" disabled={!!saved || rows.length > 0} current={warehouse} value={warehouse?.id || ''} onChange={setWarehouse} /><label className="stocktake-wide">실사 사유 / 비고 (선택)<input aria-label="실사 비고" maxLength={2000} placeholder="미입력 시 조정 이력에 ‘실물 수량 확인’으로 기록됩니다." value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label></div>
        <div className="receipt-section-heading"><h2>실사 상품</h2><button type="button" className="primary" disabled={!warehouse || rows.length >= 100} onClick={() => setPicker(true)}>+ 상품 추가</button></div>
        <div className="table-scroll"><table className="organization-table simple-stocktake-table"><thead><tr>{['상품명', '창고·보관 위치', '전산 수량', '실제 수량', '차이', '관리'].map((h, index) => <th key={h} className={index >= 2 && index <= 4 ? 'numeric' : undefined}><FormLabel required={confirm && h === '실제 수량'}>{h}</FormLabel></th>)}</tr></thead><tbody>
          {!rows.length && <tr><td colSpan={6}>상품을 추가하고 실제로 확인한 수량을 입력하세요.</td></tr>}
          {rows.map((row, index) => {
            const target = row.target, quantity = target ? countInput(target.quantity) : null, delta = target && quantity !== null ? difference(quantity, target.baselineQuantity) : null
            const change = (patch: Partial<SelectedCountRow>) => setRows(current => current.map(r => r.key === row.key && r.target ? { ...r, target: { ...r.target, ...patch } } : r))
            return <tr key={row.key}><td data-label="상품명"><strong>{row.product.name}</strong><small>{row.product.code}</small></td><td data-label="창고·보관 위치"><StockPosition endpoint={endpoint} warehouseId={warehouse!.id} productId={row.product.id} target={target} index={index + 1} onChange={t => choose(row.key, t)} /></td><td data-label="전산 수량" className="numeric">{target ? `${target.baselineQuantity.toLocaleString('ko-KR')} ${target.unit}` : '—'}{target && target.baselineReserved > 0 && <small>출고 예약 {target.baselineReserved} {target.unit}</small>}</td><td data-label="실제 수량" className="numeric"><QuantityInput aria-required={confirm} unit={target?.unit} aria-label={`실제 수량 ${index + 1}`} type="number" min="0" max={target?.serialNumber ? '1' : '999999999.999'} step={target?.serialNumber || ['EA', '개'].includes(target?.unit || '') ? '1' : '0.001'} disabled={!target} placeholder="미입력" value={target?.quantity || ''} onChange={e => change({ quantity: e.target.value, observedSerial: Number(e.target.value) === 1 ? target?.observedSerial || '' : '' })} />{target?.serialNumber && <label className="stocktake-serial-check"><input type="checkbox" aria-label={`시리얼 확인 ${index + 1}`} aria-required={quantity === 1} disabled={quantity !== 1} checked={target.observedSerial === target.serialNumber} onChange={e => change({ observedSerial: e.target.checked ? target.serialNumber : '' })} /><FormLabel required={quantity === 1}>{target.serialNumber} 확인</FormLabel></label>}</td><td data-label="차이" className={`numeric ${delta === null || delta === 0 ? '' : delta < 0 ? 'stocktake-short' : 'stocktake-over'}`}>{target ? stocktakeDifferenceLabel(quantity, target.baselineQuantity, target.unit) : '위치 선택 필요'}</td><td data-label="관리"><div className="simple-stocktake-row-actions"><button type="button" className="secondary" aria-label={`위치 추가 ${index + 1}`} disabled={rows.length >= 100} onClick={() => setRows(current => [...current, { key: crypto.randomUUID(), product: row.product }])}>위치 추가</button><button type="button" className="secondary" aria-label={`상품 행 제거 ${index + 1}`} onClick={() => setRows(current => current.filter(r => r.key !== row.key))}>제거</button></div></td></tr>
          })}
        </tbody></table></div>
        <p className="simple-stocktake-summary" role="status">총 실사 상품 {productCount}개 · {rows.length}개 재고 행 · 차이 발생 {summary.shortages + summary.excesses}건 · 미입력 {summary.missing + rows.length - targets.length}건</p>
        <details className="simple-stocktake-extra"><summary>전산에 없는 재고</summary><button type="button" className="secondary" disabled={!warehouse || rows.length >= 100} onClick={() => setFound(true)}>발견 재고 추가</button></details>
      </fieldset>
    </form>
    {picker && <ProductSelectionDialog endpoint={endpoint} mode="receipt" lines={[]} capacity={100 - rows.length} onDirtyChange={setPickerDirty} onClose={() => { if (!busy) { setPicker(false); setPickerDirty(false) } }} onAdd={products => void add(products)} />}
    {found && warehouse && <StocktakeItemDialog endpoint={endpoint} warehouse={warehouse} existing={targets.flatMap(t => t.stockId ? [t.stockId] : [])} capacity={100 - rows.length} onDirtyChange={setPickerDirty} onClose={() => { setFound(false); setPickerDirty(false) }} onAdd={items => { setRows(current => [...current, ...items.map(target => ({ key: crypto.randomUUID(), product: { id: target.productId, name: target.productName, code: target.productCode, unit: target.unit, lotManaged: false, expiryManaged: false, serialManaged: !!target.serialNumber }, target }))]); setFound(false); setPickerDirty(false) }} />}
    {confirm && <OrganizationDialog confirmation title="실사 확정" size="small" busy={busy} onClose={() => setConfirm(false)}><p>상품 {productCount}개 · 부족 {summary.shortages}건 · 초과 {summary.excesses}건 · 차이 없음 {summary.matches}건</p><p>현재 재고와 출고 예약을 다시 검증한 후 차이만 반영합니다.</p><div className="dialog-actions"><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>계속 확인</button><button className="primary" disabled={busy} onClick={() => void save(true)}>실사 확정</button></div></OrganizationDialog>}
    {guard.blocked && <OrganizationDialog confirmation title="저장하지 않은 실사 작업" onClose={guard.stay}><UnsavedChangesContent stay={guard.stay} discard={guard.discard} message="입력한 실사 내용을 버리고 이동하시겠습니까?" /></OrganizationDialog>}
  </DetailSurface>
}

function StockPosition({ endpoint, warehouseId, productId, target, index, onChange }: { endpoint: string; warehouseId: string; productId: string; target?: SelectedCountRow; index: number; onChange: (target: StocktakeCandidate) => void }) {
  const load = useCallback(async (search: string, page: number) => {
    const result = await api<Candidates>(candidatesUrl(endpoint, warehouseId, productId, search, page))
    return { ...result, items: result.items.map(option) }
  }, [endpoint, warehouseId, productId])
  return <SearchableChoiceField floating required endpoint={endpoint} kind="stocktake-position" label={`보관 위치 ${index}`} productId={productId} warehouseId={warehouseId} loadPage={load} searchPlaceholder="랙명·랙 코드·위치 코드·LOT·시리얼 검색" emptyMessage="해당 상품의 재고가 없습니다. 다른 창고를 확인하거나 발견 재고 추가를 이용하세요." current={target ? option(target) : undefined} value={target?.id || ''} onChange={choice => { if (choice) onChange((choice as StockChoice).target) }} />
}
