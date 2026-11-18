import FormLabel from '../FormLabel'
import RackBarcodeFields from './RackBarcodeFields'
import RackBarcodeLabel from './RackBarcodeLabel'
import { barcodeChangeError } from '../../rack-barcode'
import type { BarcodeChange } from '../../rack-barcode'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../api'
import type { PlanObject } from '../../warehouse-plan-model'
import type { StorageItem, WarehouseDetailData } from '../../types/warehouse'

export type StructureDraft = { barcode?: BarcodeChange; requestId: string; name: string; code: string; levels: string; bays: string; zoneId: string }
type Props = {
  item: PlanObject; endpoint: string; warehouse: WarehouseDetailData; objects: PlanObject[]
  editable: boolean; canCreate: boolean; draft: StructureDraft; onDraft: (value: StructureDraft) => void
  onLink: (patch: Partial<PlanObject>) => void
  onBarcodeSaved: (item: StorageItem) => void
  onCreated: (item: StorageItem, kind: 'zone' | 'rack') => void
  onBusy: (busy: boolean) => void; onRefresh: () => Promise<void>
}

export default function PlanStructureProperties({ item, endpoint, warehouse, objects, editable, canCreate, draft, onDraft, onLink, onCreated, onBarcodeSaved, onBusy }: Props) {
  const [error, setError] = useState(''), [submitting, setSubmitting] = useState(false)
  const sending = useRef(false)
  const isRack = item.type === 'rack', label = isRack ? '랙' : '구역', kind = isRack ? 'racks' : 'zones'
  const linked = isRack ? item.rackId : item.zoneId
  const candidates = isRack ? warehouse.racks : warehouse.zones
  const physical = candidates.find(x => x.id === linked)
  const patch = (key: keyof StructureDraft, value: string) => onDraft({ ...draft, [key]: value })
  async function create(e: FormEvent) {
    e.preventDefault()
    if (!editable || !canCreate || sending.current || linked) return
    if (isRack && barcodeChangeError(draft.barcode)) { setError(barcodeChangeError(draft.barcode)!); return }
    const levels = Number(draft.levels), bays = Number(draft.bays)
    if (isRack && (!Number.isInteger(levels) || !Number.isInteger(bays) || levels < 1 || bays < 1 || levels > 100 || bays > 100 || levels * bays > 1000)) {
      setError('단·칸은 각각 1~100, 총 1,000개 위치 이내의 정수로 입력해 주세요.'); return
    }
    sending.current = true; setSubmitting(true); onBusy(true); setError('')
    try {
      // Stable across retries, including a lost response and selection changes.
      const result = await api<StorageItem>(`${endpoint}/${kind}`, {
        requestId: draft.requestId, name: draft.name.trim(), code: draft.code.trim(), isActive: true,
        ...(isRack ? { barcode: draft.barcode || { mode: 'none' }, levels, bays, zoneId: draft.zoneId || null } : {}),
      })
      onCreated(result, isRack ? 'rack' : 'zone')
    } catch (e) { setError(`${e instanceof Error ? e.message : '등록하지 못했습니다.'} 입력값은 유지됩니다. 응답을 받지 못했다면 같은 내용으로 다시 시도하거나 화면을 다시 열어 확인하세요.`) }
    finally { sending.current = false; setSubmitting(false); onBusy(false) }
  }
  async function saveBarcode() {
    if (!physical || !editable || sending.current) return
    const change = draft.barcode || { mode: 'keep' as const }, problem = barcodeChangeError(change)
    if (problem) { setError(problem); return }
    sending.current = true; setSubmitting(true); onBusy(true); setError('')
    try { onBarcodeSaved(await api<StorageItem>(`${endpoint}/racks/${physical.id}/barcode`, { version: physical.version, barcode: change })) }
    catch (e) { setError(e instanceof Error ? e.message : '바코드를 저장하지 못했습니다.') }
    finally { sending.current = false; setSubmitting(false); onBusy(false) }
  }
  return <section className="plan-structure-properties" aria-label={`실제 ${label} 설정`}>
    {error && <p role="alert" className="alert error">{error}</p>}
    {physical && <dl className="plan-linked-facts"><div><dt>{label} 코드</dt><dd>{physical.code}</dd></div><div><dt>이름</dt><dd>{physical.name}</dd></div>{isRack && <><div><dt>단수 · 칸수</dt><dd>{physical.levels}단 × {physical.bays}칸</dd></div><div><dt>소속 구역</dt><dd>{warehouse.zones.find(z => z.id === physical.zoneId)?.name || '구역 없음'}</dd></div></>}</dl>}
    <details className="structure-link-options" open={!physical}><summary>{physical ? `${label} 연결 변경` : `등록된 ${label} 연결`}</summary>
    <label>등록된 {label}<select aria-label={`실제 ${label} 연결`} disabled={!editable} value={linked || ''} onChange={e => onLink(isRack ? { rackId: e.target.value || null, locationId: null } : { zoneId: e.target.value || null, locationId: null })}>
      <option value="">연결 안 함</option>
      {linked && !physical && <option value={linked}>현재 연결된 {label}</option>}
      {candidates.map(x => <option key={x.id} value={x.id} disabled={isRack && objects.some(o => o.id !== item.id && o.rackId === x.id)}>{x.code} · {x.name}{x.isActive ? '' : ' (미사용)'}{isRack && objects.some(o => o.id !== item.id && o.rackId === x.id) ? ' (다른 객체에 연결됨)' : ''}</option>)}
    </select></label>
    {physical && <p className="organization-help">{physical.code} · {physical.name}{isRack ? ` · ${physical.levels}단 × ${physical.bays}칸` : ''}<br />연결 해제는 실제 구조를 유지합니다. 삭제 버튼은 연결된 {label}을 즉시 삭제하며, 재고·업무 참조가 있으면 차단됩니다.{isRack && ' 단·칸 확장은 창고 상세의 랙 수정에서 할 수 있습니다.'}</p>}
    </details>
    {isRack && physical && <>
      {!editable && !submitting && <RackBarcodeLabel value={physical.barcode} rackId={physical.id} rackCode={physical.code} />}
      {(editable || submitting) && <><RackBarcodeFields compact warehouseEndpoint={endpoint} rackId={physical.id} rackCode={physical.code} current={physical.barcode} value={draft.barcode || { mode: 'keep' }} disabled={submitting} onChange={barcode => onDraft({ ...draft, barcode })} /><button type="button" className="primary" disabled={submitting || !draft.barcode || draft.barcode.mode === 'keep'} onClick={saveBarcode}>바코드 저장</button><p className="organization-help">바코드는 도면과 별도로 저장합니다. 도면 배치나 기존 랙·보관 위치 ID는 바뀌지 않습니다.</p></>}
    </>}
    {!linked && (editable || submitting) && <>
      {canCreate && warehouse.warehouse.isActive ? <form onSubmit={create}>
        <h3>새 {label} 등록</h3>
        <fieldset disabled={submitting}>
          <label><FormLabel required>{label}명</FormLabel><input aria-label={`새 ${label} 이름`} required maxLength={200} value={draft.name} onChange={e => patch('name', e.target.value)} /></label>
          <label><FormLabel required>{label} 코드</FormLabel><input aria-label={`새 ${label} 코드`} required maxLength={32} value={draft.code} onChange={e => patch('code', e.target.value)} /></label>
          {isRack && <>
            <RackBarcodeFields compact warehouseEndpoint={endpoint} rackId={item.id} rackCode={draft.code} value={draft.barcode || { mode: 'none' }} disabled={submitting} onChange={barcode => onDraft({ ...draft, barcode })} />
            <div className="plan-structure-dimensions"><label><FormLabel required>단수</FormLabel><input aria-label="랙 단수" type="number" required min={1} max={100} step={1} value={draft.levels} onChange={e => patch('levels', e.target.value)} /></label><label><FormLabel required>칸수</FormLabel><input aria-label="랙 칸수" type="number" required min={1} max={100} step={1} value={draft.bays} onChange={e => patch('bays', e.target.value)} /></label></div>
            <label>소속 구역<select aria-label="새 랙 소속 구역" value={draft.zoneId} onChange={e => patch('zoneId', e.target.value)}><option value="">구역 없음</option>{warehouse.zones.filter(z => z.isActive).map(z => <option key={z.id} value={z.id}>{z.code} · {z.name}</option>)}</select></label>
            <p className="organization-help">{Number(draft.levels) * Number(draft.bays) || 0}개 보관 위치가 함께 생성됩니다.</p>
          </>}
          <p className="organization-help">등록 즉시 실제 {label}이 저장됩니다. 도면 저장을 취소해도 유지되며, 기존 목록에서 다시 연결할 수 있습니다.</p>
          <button type="submit" className="primary">{submitting ? '등록 중…' : `${label} 생성`}</button>
        </fieldset>
      </form> : <p className="organization-help">{canCreate ? '미사용 창고에는 새 구역·랙을 등록할 수 없습니다.' : '실제 구역·랙 등록에는 창고 등록 권한이 필요합니다. 기존 항목을 연결할 수 있습니다.'}</p>}
    </>}
  </section>
}
