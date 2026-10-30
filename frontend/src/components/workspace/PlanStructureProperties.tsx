import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../api'
import type { PlanObject } from '../../warehouse-plan-model'
import type { StorageItem, WarehouseDetailData } from '../../types/warehouse'

export type StructureDraft = { requestId: string; name: string; code: string; levels: string; bays: string; zoneId: string }
type Props = {
  item: PlanObject; endpoint: string; warehouse: WarehouseDetailData; objects: PlanObject[]
  editable: boolean; canCreate: boolean; draft: StructureDraft; onDraft: (value: StructureDraft) => void
  onLink: (patch: Partial<PlanObject>) => void
  onCreated: (item: StorageItem, kind: 'zone' | 'rack') => void
  onBusy: (busy: boolean) => void; onRefresh: () => Promise<void>
}

export default function PlanStructureProperties({ item, endpoint, warehouse, objects, editable, canCreate, draft, onDraft, onLink, onCreated, onBusy, onRefresh }: Props) {
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
    const levels = Number(draft.levels), bays = Number(draft.bays)
    if (isRack && (!Number.isInteger(levels) || !Number.isInteger(bays) || levels < 1 || bays < 1 || levels > 100 || bays > 100 || levels * bays > 1000)) {
      setError('단·칸은 각각 1~100, 총 1,000개 위치 이내의 정수로 입력해 주세요.'); return
    }
    sending.current = true; setSubmitting(true); onBusy(true); setError('')
    try {
      // Stable across retries, including a lost response and selection changes.
      const result = await api<StorageItem>(`${endpoint}/${kind}`, {
        requestId: draft.requestId, name: draft.name.trim(), code: draft.code.trim(), isActive: true,
        ...(isRack ? { levels, bays, zoneId: draft.zoneId || null } : {}),
      })
      onCreated(result, isRack ? 'rack' : 'zone')
    } catch (e) { setError(`${e instanceof Error ? e.message : '등록하지 못했습니다.'} 입력값은 유지됩니다. 응답을 받지 못했다면 같은 내용으로 다시 시도하거나 목록을 새로고침해 확인하세요.`) }
    finally { sending.current = false; setSubmitting(false); onBusy(false) }
  }
  return <section className="plan-structure-properties" aria-label={`실제 ${label} 설정`}>
    <h3>실제 {label} 연결</h3>
    {error && <p role="alert" className="alert error">{error}</p>}
    <label>등록된 {label}<select aria-label={`실제 ${label} 연결`} disabled={!editable} value={linked || ''} onChange={e => onLink(isRack ? { rackId: e.target.value || null, locationId: null } : { zoneId: e.target.value || null, locationId: null })}>
      <option value="">연결 안 함</option>
      {linked && !physical && <option value={linked}>현재 연결된 {label}</option>}
      {candidates.map(x => <option key={x.id} value={x.id} disabled={isRack && objects.some(o => o.id !== item.id && o.rackId === x.id)}>{x.code} · {x.name}{x.isActive ? '' : ' (미사용)'}{isRack && objects.some(o => o.id !== item.id && o.rackId === x.id) ? ' (다른 객체에 연결됨)' : ''}</option>)}
    </select></label>
    <button type="button" className="text-button" disabled={submitting} onClick={async () => { try { await onRefresh(); setError('') } catch (e) { setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.') } }}>구역·랙 목록 새로고침</button>
    {physical && <p className="organization-help">{physical.code} · {physical.name}{isRack ? ` · ${physical.levels}단 × ${physical.bays}칸` : ''}<br />연결을 해제하거나 도면 객체를 삭제해도 실제 {label}과 보관 위치는 유지됩니다.{isRack && ' 단·칸 확장은 창고 상세의 랙 수정에서 할 수 있습니다.'}</p>}
    {!linked && (editable || submitting) && <>
      {canCreate && warehouse.warehouse.isActive ? <form onSubmit={create}>
        <h3>새 {label} 등록</h3>
        <fieldset disabled={submitting}>
          <label>{label}명<input aria-label={`새 ${label} 이름`} required maxLength={200} value={draft.name} onChange={e => patch('name', e.target.value)} /></label>
          <label>{label} 코드<input aria-label={`새 ${label} 코드`} required maxLength={32} value={draft.code} onChange={e => patch('code', e.target.value)} /></label>
          {isRack && <>
            <div className="plan-structure-dimensions"><label>단수<input aria-label="랙 단수" type="number" required min={1} max={100} step={1} value={draft.levels} onChange={e => patch('levels', e.target.value)} /></label><label>칸수<input aria-label="랙 칸수" type="number" required min={1} max={100} step={1} value={draft.bays} onChange={e => patch('bays', e.target.value)} /></label></div>
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
