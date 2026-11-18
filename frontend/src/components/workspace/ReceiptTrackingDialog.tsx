import { Trash2 } from 'lucide-react'
import FormLabel from '../FormLabel'
import QuantityInput from './QuantityInput'
import { useEffect, useState } from 'react'
import './receipt-tracking-dialog.css'
import OrganizationDialog from './OrganizationDialog'
import { api } from '../../api'
import type { ReceiptDetail } from '../../receipt-model'
import { allocationIssue, distributeTracking, groupAllocations } from '../../receipt-groups'
import type { GroupAllocation, ReceiptProductGroup } from '../../receipt-groups'

type LotDraft = GroupAllocation & { amount: string }
type SerialDraft = { key: string; value: string; allocationId: string }
export default function ReceiptTrackingDialog({ group, tab: initialTab, url, version, onSaved, onClose, onDirtyChange, onDraftSave, initialEntries }: { group: ReceiptProductGroup; initialEntries?: GroupAllocation[]; tab: 'lot' | 'serial'; url?: string; version?: string; onSaved?: (data: ReceiptDetail) => void; onDraftSave?: (entries: GroupAllocation[]) => void; onClose: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const planned=!!onDraftSave
  const [original] = useState(() => initialEntries??groupAllocations(group))
  const [lots, setLots] = useState<LotDraft[]>(() => original.filter(a => a.lotNumber || a.expiryDate).map(a => ({ ...a, amount: String(a.quantity) })))
  const [serials, setSerials] = useState<SerialDraft[]>(() => original.flatMap(a => a.serials.map(value => ({ key: crypto.randomUUID(), value, allocationId: a.lotNumber || a.expiryDate ? a.id : '' }))))
  const [tab, setTab] = useState(initialTab), [paste, setPaste] = useState(''), [pasteLot, setPasteLot] = useState(''), [error, setError] = useState(''), [serialInputError, setSerialInputError] = useState(''), [busy, setBusy] = useState(false)
  const [baseline] = useState(() => JSON.stringify({ lots, serials }))
  const dirty = JSON.stringify({ lots, serials }) !== baseline || !!paste
  useEffect(() => { onDirtyChange(dirty || busy) }, [dirty, busy, onDirtyChange])
  const allocations = (): GroupAllocation[] => {
    const entries: GroupAllocation[] = lots.map(a => ({ id: a.id, sourceLineIds: a.sourceLineIds, lotNumber: a.lotNumber?.trim() || null, expiryDate: a.expiryDate || null, quantity: Number(a.amount), serials: serials.filter(s => s.allocationId === a.id).map(s => s.value.trim()) }))
    const unassigned = serials.filter(s => !s.allocationId).map(s => s.value.trim())
    if (unassigned.length) {
      const prior = original.find(a => !a.lotNumber && !a.expiryDate)
      entries.push({ id: prior?.id || crypto.randomUUID(), sourceLineIds: prior?.sourceLineIds || [], lotNumber: null, expiryDate: null, quantity: unassigned.length, serials: unassigned })
    }
    return entries
  }
  function addSerials() {
    const values = paste.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    const existing = new Set(serials.map(s => s.value.trim()))
    if (!values.length || values.some(s => existing.has(s) || s.length > 100 || [...s].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)) || new Set(values).size !== values.length) { setSerialInputError('시리얼의 공백·형식·중복을 확인해 주세요.'); return }
    if (serials.length + values.length > 1000) { setSerialInputError('상품별 시리얼은 최대 1,000개씩 등록해 주세요.'); return }
    setSerials(current => [...current, ...values.map(value => ({ key: crypto.randomUUID(), value, allocationId: pasteLot }))]); setPaste(''); setSerialInputError(''); setError('')
  }
  async function save() {
    if (busy) return
    if (paste.trim()) { setError('입력한 시리얼을 [목록에 추가]한 후 저장해 주세요.'); return }
    if (lots.some(a => !a.lotNumber?.trim() && !a.expiryDate)) { setError('LOT 번호 또는 유통기한을 입력해 주세요.'); return }
    const entries = allocations(), issue = allocationIssue(group, entries)
    if (issue) { setError(planned?issue.replaceAll('검수수량','예정 수량'):issue); return }
    if(onDraftSave){onDirtyChange(false);onDraftSave(entries);return}
    setBusy(true); setError('')
    try { const lines = distributeTracking(group, entries); const saved = await api<ReceiptDetail>(url + '/tracking', { version, productId: group.productId, lines }); onDirtyChange(false); onSaved?.(saved) }
    catch (e) { setError(e instanceof Error ? e.message : '추적 정보를 저장하지 못했습니다.') }
    finally { setBusy(false) }
  }
  const visibleError = error || (tab === 'serial' ? serialInputError : '')
  const lotTotal = lots.reduce((sum, a) => sum + (Number(a.amount) || 0), 0), difference = (group.inspectedQuantity ?? 0) - lotTotal
  if (planned) return <OrganizationDialog title="예정 추적 정보" description={`${group.productName} · 예정 수량 ${(group.inspectedQuantity ?? 0).toLocaleString()} ${group.unit}`} className="receipt-planned-tracking" showClose busy={busy} onClose={() => { if (!busy) onClose() }} actions={<>
    <button type="button" className="secondary" disabled={busy} onClick={onClose}>취소</button>
    <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</button>
  </>}>
    <div className="wms-segmented receipt-planned-tabs" role="tablist" aria-label="추적 정보 종류">
      <button type="button" role="tab" aria-selected={tab === 'lot'} className={tab === 'lot' ? 'primary' : 'secondary'} onClick={() => setTab('lot')}><FormLabel required={lots.length > 0}>LOT / 유통기한 ({lots.length})</FormLabel></button>
      <button type="button" role="tab" aria-selected={tab === 'serial'} className={tab === 'serial' ? 'primary' : 'secondary'} onClick={() => setTab('serial')}>시리얼 ({serials.length})</button>
    </div>
    {visibleError && <p className="alert error" role="alert">{visibleError}</p>}
    <fieldset disabled={busy} className="receipt-tracking-content receipt-planned-content" aria-label={tab === 'lot' ? 'LOT / 유통기한' : '시리얼'}>
      {tab === 'lot' ? <>
        {lots.length ? <div className="table-scroll"><table className="organization-table receipt-planned-lots"><thead><tr><th>LOT 번호</th><th>유통기한</th><th><FormLabel required>예정 수량</FormLabel></th><th>관리</th></tr></thead><tbody>{lots.map((lot, i) => <tr key={lot.id}>
          <td><input aria-label={`LOT 번호 ${i + 1}`} value={lot.lotNumber || ''} maxLength={100} onChange={e => setLots(rows => rows.map(a => a.id === lot.id ? { ...a, lotNumber: e.target.value } : a))}/></td>
          <td><input aria-label={`LOT 유통기한 ${i + 1}`} type="date" value={lot.expiryDate || ''} onChange={e => setLots(rows => rows.map(a => a.id === lot.id ? { ...a, expiryDate: e.target.value } : a))}/></td>
          <td><QuantityInput aria-required="true" unit={group.unit} aria-label={`LOT 수량 ${i + 1}`} type="number" min="0.001" step={group.unit === 'EA' ? '1' : '0.001'} value={lot.amount} onChange={e => setLots(rows => rows.map(a => a.id === lot.id ? { ...a, amount: e.target.value } : a))}/></td>
          <td><button type="button" className="secondary" aria-label={`LOT ${i + 1} 삭제`} onClick={() => { setLots(rows => rows.filter(a => a.id !== lot.id)); setSerials(rows => rows.map(s => s.allocationId === lot.id ? { ...s, allocationId: '' } : s)); if (pasteLot === lot.id) setPasteLot('') }}>삭제</button></td>
        </tr>)}</tbody></table></div> : <div className="receipt-tracking-empty"><p>LOT 정보가 등록되지 않았습니다.</p><p>입고 검수 단계에서 등록할 수도 있습니다.</p></div>}
        <button type="button" className="secondary receipt-tracking-add" disabled={lots.length >= 100} onClick={() => setLots(rows => [...rows, { id: crypto.randomUUID(), sourceLineIds: [], lotNumber: '', expiryDate: null, quantity: 0, amount: '', serials: [] }])}>+ LOT 추가</button>
        {lots.length > 0 && <p className="receipt-tracking-summary" role="status">입력한 LOT 수량 {lotTotal.toLocaleString()} / 예정 수량 {(group.inspectedQuantity ?? 0).toLocaleString()} {group.unit}</p>}
      </> : <>
        {serials.length ? <div className="table-scroll"><table className="organization-table receipt-planned-serials"><thead><tr><th><FormLabel required>시리얼 번호</FormLabel></th><th>관리</th></tr></thead><tbody>{serials.map((serial, i) => <tr key={serial.key}>
          <td><input aria-required="true" aria-label={`시리얼 번호 ${i + 1}`} value={serial.value} maxLength={100} onChange={e => setSerials(rows => rows.map(a => a.key === serial.key ? { ...a, value: e.target.value } : a))}/>
            {lots.length > 0 && <details className="receipt-serial-lot"><summary>{serial.allocationId ? `연결 LOT: ${lots.find(a => a.id === serial.allocationId)?.lotNumber || 'LOT 미지정'}` : 'LOT 연결 (선택)'}</summary><select aria-label={`시리얼 LOT ${i + 1}`} value={serial.allocationId} onChange={e => setSerials(rows => rows.map(a => a.key === serial.key ? { ...a, allocationId: e.target.value } : a))}><option value="">LOT 연결 없음</option>{lots.map((a, j) => <option key={a.id} value={a.id}>{a.lotNumber || `LOT 미지정 ${j + 1}`} · {a.expiryDate || '유통기한 없음'}</option>)}</select></details>}
          </td>
          <td><button type="button" className="secondary" aria-label={`시리얼 ${i + 1} 삭제`} onClick={() => setSerials(rows => rows.filter(a => a.key !== serial.key))}>삭제</button></td>
        </tr>)}</tbody></table></div> : <div className="receipt-tracking-empty"><p>시리얼 정보가 등록되지 않았습니다.</p><p>입고 검수 단계에서 등록할 수도 있습니다.</p></div>}
        <button type="button" className="secondary receipt-tracking-add" disabled={serials.length >= 1000} onClick={() => setSerials(rows => [...rows, { key: crypto.randomUUID(), value: '', allocationId: '' }])}>+ 시리얼 추가</button>
        <details className="receipt-serial-bulk"><summary>시리얼 일괄 입력</summary><div className="receipt-serial-entry"><label>시리얼 번호 (한 줄에 하나)<textarea aria-label="시리얼 일괄 입력" rows={3} maxLength={101000} value={paste} onChange={e => { setPaste(e.target.value); setSerialInputError('') }}/></label><label>연결 LOT<select aria-label="추가 시리얼 LOT" value={pasteLot} onChange={e => setPasteLot(e.target.value)}><option value="">LOT 연결 없음</option>{lots.map((a, i) => <option key={a.id} value={a.id}>{a.lotNumber || `LOT 미지정 ${i + 1}`} · {a.expiryDate || '유통기한 없음'}</option>)}</select></label><button type="button" className="secondary" onClick={addSerials}>목록에 추가</button></div></details>
        {serials.length > 0 && <p className="receipt-tracking-summary" role="status">등록된 시리얼 {serials.length}개</p>}
      </>}
    </fieldset>
    <p className="receipt-tracking-note">추적정보는 선택 입력이며, 입고 검수 시 최종 확정됩니다.</p>
  </OrganizationDialog>
  return <OrganizationDialog title="추적 정보 관리" description={`${group.productName} · 검수수량 ${(group.inspectedQuantity ?? 0).toLocaleString()} ${group.unit}`} className="receipt-inspection-tracking" showClose busy={busy} onClose={() => { if (!busy) onClose() }} actions={<>
    <button type="button" className="secondary" disabled={busy} onClick={onClose}>취소</button>
    <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</button>
  </>}>
    <div className="wms-segmented receipt-planned-tabs" role="tablist" aria-label="추적 정보 종류">
      <button type="button" role="tab" aria-selected={tab === 'lot'} className={tab === 'lot' ? 'primary' : 'secondary'} onClick={() => setTab('lot')}><FormLabel required={lots.length > 0}>LOT / 유통기한 ({lots.length})</FormLabel></button>
      <button type="button" role="tab" aria-selected={tab === 'serial'} className={tab === 'serial' ? 'primary' : 'secondary'} onClick={() => setTab('serial')}>시리얼 ({serials.length})</button>
    </div>
    {visibleError && <p className="alert error" role="alert">{visibleError}</p>}
    <fieldset disabled={busy} className="receipt-tracking-content receipt-planned-content" aria-label={tab === 'lot' ? 'LOT / 유통기한' : '시리얼'}>
      {tab === 'lot' ? <>
        {lots.length > 0 ? <div className="table-scroll receipt-lot-scroll"><table className="organization-table receipt-planned-lots receipt-inspection-lot-cards"><thead><tr><th>LOT 번호</th><th>유통기한</th><th><FormLabel required>검수수량</FormLabel></th><th>관리</th></tr></thead><tbody>{lots.map((lot, i) => <tr key={lot.id}>
          <td><label className="receipt-lot-field"><span className="receipt-lot-mobile-label">LOT 번호</span><input aria-label={`LOT 번호 ${i + 1}`} value={lot.lotNumber || ''} maxLength={100} onChange={e => setLots(rows => rows.map(a => a.id === lot.id ? { ...a, lotNumber: e.target.value } : a))}/></label></td>
          <td><label className="receipt-lot-field"><span className="receipt-lot-mobile-label">유통기한</span><input aria-label={`LOT 유통기한 ${i + 1}`} type="date" value={lot.expiryDate || ''} onChange={e => setLots(rows => rows.map(a => a.id === lot.id ? { ...a, expiryDate: e.target.value } : a))}/></label></td>
          <td><label className="receipt-lot-field"><span className="receipt-lot-mobile-label"><FormLabel required>검수수량</FormLabel></span><QuantityInput aria-required="true" unit={group.unit} aria-label={`LOT 수량 ${i + 1}`} type="number" min="0.001" step={group.unit === 'EA' ? '1' : '0.001'} value={lot.amount} onChange={e => setLots(rows => rows.map(a => a.id === lot.id ? { ...a, amount: e.target.value } : a))}/></label></td>
          <td className="receipt-lot-card-heading"><strong className="receipt-lot-mobile-label">LOT {i + 1}</strong><button type="button" className="secondary receipt-lot-delete" aria-label={`LOT ${i + 1} 삭제`} onClick={() => { setLots(rows => rows.filter(a => a.id !== lot.id)); setSerials(rows => rows.map(s => s.allocationId === lot.id ? { ...s, allocationId: '' } : s)); if (pasteLot === lot.id) setPasteLot('') }}><span className="receipt-lot-desktop-delete">삭제</span><Trash2 className="receipt-lot-mobile-label" size={18} aria-hidden="true" /></button></td>
        </tr>)}</tbody></table></div> : <div className="receipt-tracking-empty"><p>등록된 LOT 정보가 없습니다.</p><p>검수 단계에서 선택적으로 등록할 수 있습니다.</p></div>}
        <button type="button" className="secondary receipt-tracking-add" disabled={lots.length >= 100} onClick={() => setLots(rows => [...rows, { id: crypto.randomUUID(), sourceLineIds: [], lotNumber: '', expiryDate: null, quantity: 0, amount: '', serials: [] }])}>+ LOT 추가</button>
        {lots.length > 0 && <p className="receipt-tracking-summary" role="status">LOT 검수수량 합계 {lotTotal.toLocaleString()} {group.unit}{difference !== 0 && ` · ${Math.abs(Math.round(difference * 1000) / 1000).toLocaleString()} ${group.unit} ${difference > 0 ? '미할당 (LOT 없이 관리)' : '초과'}`}</p>}
      </> : <>
        <div className="receipt-inspection-serial-entry">
          <label>시리얼 번호 입력<textarea aria-label="시리얼 일괄 입력" placeholder="한 줄에 시리얼 하나씩 입력" rows={4} maxLength={101000} value={paste} onChange={e => { setPaste(e.target.value); setSerialInputError('') }}/></label>
          <div className="receipt-inspection-serial-actions"><label>연결 LOT<select aria-label="추가 시리얼 LOT" value={pasteLot} onChange={e => setPasteLot(e.target.value)}><option value="">LOT 연결 없음</option>{lots.map((a, i) => <option key={a.id} value={a.id}>{a.lotNumber || `LOT 미지정 ${i + 1}`} · {a.expiryDate || '유통기한 없음'}</option>)}</select></label><button type="button" className="secondary" onClick={addSerials}>목록에 추가</button></div>
        </div>
        {serials.length > 0 ? <>
          <div className="table-scroll receipt-serial-list"><table className="organization-table"><thead><tr><th><FormLabel required>시리얼 번호</FormLabel></th><th>연결 LOT</th><th>관리</th></tr></thead><tbody>{serials.map((s, i) => <tr key={s.key}>
            <td><input aria-required="true" aria-label={`시리얼 번호 ${i + 1}`} value={s.value} maxLength={100} onChange={e => setSerials(rows => rows.map(a => a.key === s.key ? { ...a, value: e.target.value } : a))}/></td>
            <td><select aria-label={`시리얼 LOT ${i + 1}`} value={s.allocationId} onChange={e => setSerials(rows => rows.map(a => a.key === s.key ? { ...a, allocationId: e.target.value } : a))}><option value="">LOT 연결 없음</option>{lots.map((a, j) => <option key={a.id} value={a.id}>{a.lotNumber || `LOT 미지정 ${j + 1}`} · {a.expiryDate || '유통기한 없음'}</option>)}</select></td>
            <td><button type="button" className="secondary" aria-label={`시리얼 ${i + 1} 삭제`} onClick={() => setSerials(rows => rows.filter(a => a.key !== s.key))}>삭제</button></td>
          </tr>)}</tbody></table></div>
          <p className="receipt-tracking-summary" role="status">등록된 시리얼 {serials.length}개</p>
        </> : <div className="receipt-tracking-empty"><p>등록된 시리얼이 없습니다.</p><p>번호를 입력한 뒤 [목록에 추가]를 눌러주세요.</p></div>}
      </>}
    </fieldset>
  </OrganizationDialog>
}
