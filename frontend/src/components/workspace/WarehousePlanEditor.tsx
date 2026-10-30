import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../api'
import { editSnapshot, requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import { blankPlan, duplicateRackLinks, editPlan, planLabels, unlinkedStructureObjects } from '../../warehouse-plan-model'
import type { PlanDocument, PlanHistory, PlanResponse } from '../../warehouse-plan-model'
import type { LocationList, StorageItem, WarehouseDetailData } from '../../types/warehouse'
import RackFrontDialog from './RackFrontDialog'
import OrganizationDialog from './OrganizationDialog'
import PlanStructureProperties from './PlanStructureProperties'
import type { StructureDraft } from './PlanStructureProperties'
import PlanEditorSurface from './PlanEditorSurface'
import type { PlanEditorSurfaceProps } from './PlanEditorSurface'

type RemoteProps = { endpoint: string; initialWarehouse?: WarehouseDetailData; canEdit: boolean; canCreate: boolean; onBack: () => void; onSaved?: () => void; backLabel?: string }
type DraftProps = PlanEditorSurfaceProps & { mode: 'draft' }
type Change = { id: number; changedAt: string; changedByUserId: string }
const clean = (p: PlanDocument): PlanDocument => ({ schemaVersion: p.schemaVersion, aspectRatio: p.aspectRatio, objects: p.objects })
export default function WarehousePlanEditor(props: RemoteProps | DraftProps) {
  return 'mode' in props ? <PlanEditorSurface {...props} /> : <SavedWarehousePlanEditor {...props} />
}

// Existing saved-plan API workflow remains available independently of the aggregate registration form.
function SavedWarehousePlanEditor({ endpoint, initialWarehouse, canEdit, canCreate, onBack, onSaved, backLabel = '창고 상세로' }: RemoteProps) {
  const [warehouse, setWarehouse] = useState<WarehouseDetailData | null>(initialWarehouse || null)
  const [saved, setSaved] = useState<PlanResponse | null>(null), [history, setHistory] = useState<PlanHistory>({ past: [], present: blankPlan(), future: [] })
  const [editRequested, setEditing] = useState(true), [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false), [physicalBusy, setPhysicalBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [stale, setStale] = useState(false), [revision, setRevision] = useState(0), [structureRevision, setStructureRevision] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, StructureDraft>>({}), [unlinked, setUnlinked] = useState(false)
  const [rack, setRack] = useState<string | null>(null), [changes, setChanges] = useState<Change[] | null>(null)
  const [locationSearch, setLocationSearch] = useState(''), [locations, setLocations] = useState<LocationList | null>(null)
  const sending = useRef(false)
  const busy = saving || physicalBusy, editing = editRequested && canEdit, editable = editing && !busy && !stale
  const doc = history.present, dirty = !!saved && editSnapshot(clean(saved)) !== editSnapshot(doc)
  const draftDirty = Object.entries(drafts).some(([id, value]) => {
    const object = doc.objects.find(o => o.id === id)
    if (!object || object.rackId || object.zoneId) return false
    return value.name !== object.label || value.code !== '' || (object.type === 'rack' && (value.levels !== '3' || value.bays !== '4' || value.zoneId !== ''))
  })
  const item = selected.length === 1 ? doc.objects.find(o => o.id === selected[0]) : undefined
  const rackId = item?.rackId || '', zoneId = item?.zoneId || ''
  useEffect(() => {
    let live = true
    Promise.all([api<PlanResponse>(`${endpoint}/plan`), api<WarehouseDetailData>(endpoint)]).then(([p, w]) => { if (live) { setWarehouse(w); setSaved(p); setHistory({ past: [], present: clean(p), future: [] }); setSelected([]); setError(''); setStale(false) } }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [endpoint, revision])
  useEffect(() => {
    if (!editing) return
    let live = true
    const timer = window.setTimeout(() => { api<LocationList>(`${endpoint}/locations?search=${encodeURIComponent(locationSearch)}&status=all${rackId ? `&rackId=${rackId}` : zoneId ? `&zoneId=${zoneId}` : ''}`).then(l => { if (live) setLocations(l) }).catch(e => { if (live) setError(e.message) }) }, 200)
    return () => { live = false; clearTimeout(timer) }
  }, [endpoint, locationSearch, editing, rackId, zoneId, structureRevision])
  const navigation = useUnsavedNavigation(dirty || draftDirty || busy, busy, () => {
    if (saved) setHistory({ past: [], present: clean(saved), future: [] })
    setDrafts({}); setSelected([]); setError(''); setNotice('')
  })
  const confirmDiscard = requestNavigation
  async function save(visualOnly = false) {
    if (!saved || !editing || !dirty || sending.current || busy || stale) return
    if (duplicateRackLinks(doc)) { setError('같은 랙은 한 객체에만 연결할 수 있습니다.'); return }
    if (!visualOnly && unlinkedStructureObjects(doc).length) { setUnlinked(true); return }
    setUnlinked(false); sending.current = true; setSaving(true); setError('')
    try { const p = await api<PlanResponse>(`${endpoint}/plan`, { version: saved.version, ...doc }); setSaved(p); setHistory({ past: [], present: clean(p), future: [] }); setNotice('도면과 구역·랙 연결을 저장했습니다.'); setEditing(false); setSelected([]); navigation.saved(); onSaved?.() }
    catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); if (e instanceof ApiError && e.status === 409) setStale(true) }
    finally { sending.current = false; setSaving(false) }
  }
  function created(objectId: string, physical: StorageItem, kind: 'zone' | 'rack') {
    setWarehouse(w => w ? { ...w, [kind === 'rack' ? 'racks' : 'zones']: [...w[kind === 'rack' ? 'racks' : 'zones'].filter(x => x.id !== physical.id), physical] } : w)
    setHistory(h => editPlan(h, { ...h.present, objects: h.present.objects.map(o => o.id === objectId ? { ...o, label: physical.name, ...(kind === 'rack' ? { rackId: physical.id } : { zoneId: physical.id }) } : o) }))
    setStructureRevision(r => r + 1); setDrafts(d => ({ ...d, [objectId]: { requestId: crypto.randomUUID(), name: '', code: '', levels: '3', bays: '4', zoneId: '' } }))
    setNotice('실제 구조를 등록하고 연결했습니다. 연결 배치는 도면 저장으로 확정하세요. 도면을 취소해도 실제 데이터는 유지됩니다.')
  }
  function download() { const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'warehouse-plan.json'; link.click(); URL.revokeObjectURL(url) }
  return <section className="wms-card warehouse-plan-editor">
    <div className="organization-toolbar"><div><h2>{warehouse?.warehouse.name || '창고'} · 2D 창고 도면</h2><p className="organization-help">{editing ? '편집 모드' : '조회 모드'} · {dirty ? '저장하지 않은 변경사항이 있습니다.' : saved?.exists ? '저장된 도면' : '등록된 도면 없음'}</p></div><button className="secondary" disabled={busy} onClick={() => requestNavigation(onBack)}>{backLabel}</button></div>
    {error && <p role="alert" className="alert error">{error}</p>}{notice && <p role="status" className="alert success">{notice}</p>}
    {!saved || !warehouse ? error ? <button className="secondary" onClick={() => setRevision(r => r + 1)}>도면 다시 불러오기</button> : <p>도면을 불러오는 중…</p> : <>
      <div className="plan-toolbar">
        {canEdit && !editing && <button className="primary" onClick={() => setEditing(true)}>{saved.exists ? '도면 편집' : '도면 생성'}</button>}
        {editing && <><button className="primary" onClick={() => save()} disabled={!dirty || busy || stale}>{busy ? '저장 중…' : '도면 저장'}</button><button className="secondary" disabled={busy} onClick={() => confirmDiscard(() => { setHistory({ past: [], present: clean(saved), future: [] }); setEditing(false); setSelected([]); setError(''); setNotice('도면 편집을 종료했습니다. 실제 구조는 유지됩니다.') })}>편집 종료</button></>}
        <button className="text-button" disabled={busy} onClick={() => confirmDiscard(() => { setRevision(r => r + 1); setEditing(false) })}>최신 도면 불러오기</button>
        <button className="text-button" onClick={async () => { try { setChanges(await api<Change[]>(`${endpoint}/plan/history`)) } catch (e) { setError(e instanceof Error ? e.message : '이력을 불러오지 못했습니다.') } }}>변경 이력</button>
        {dirty && <button className="text-button" onClick={download}>변경사항 파일로 보관</button>}
      </div>
      {!saved.exists && !editing ? <div className="plan-empty"><h3>아직 창고 도면이 없습니다</h3><p>{canEdit ? '도면 생성 후 도구를 끌어 배치하세요.' : '창고 수정 권한이 있는 담당자가 도면을 만들 수 있습니다.'}</p></div> : <PlanEditorSurface history={history} onHistory={setHistory} selected={selected} onSelect={setSelected} editable={editable} onOpenRack={setRack} onNotice={setNotice} renderProperties={(object, update) => <>
        {(object.type === 'zone' || object.type === 'rack') && <PlanStructureProperties key={object.id} item={object} endpoint={endpoint} warehouse={warehouse} objects={doc.objects} editable={editable} canCreate={canCreate} draft={drafts[object.id] || { requestId: object.id, name: object.label, code: '', levels: '3', bays: '4', zoneId: '' }} onDraft={draft => setDrafts(d => ({ ...d, [object.id]: draft }))} onLink={update} onCreated={(physical, kind) => created(object.id, physical, kind)} onBusy={setPhysicalBusy} onRefresh={async () => { setWarehouse(await api<WarehouseDetailData>(endpoint)); setStructureRevision(r => r + 1) }} />}
        {object.rackId && <button type="button" className="secondary" onClick={() => setRack(object.rackId)}>랙 정면도 보기</button>}
        <details className="plan-geometry"><summary>보관 위치 연결</summary><fieldset disabled={!editable}><label>보관 위치 검색<input aria-label="보관 위치 검색" value={locationSearch} onChange={e => setLocationSearch(e.target.value)} /></label><label>보관 위치 연결 (선택)<select aria-label="보관 위치 연결" value={object.locationId || ''} onChange={e => update({ locationId: e.target.value || null })}><option value="">연결 안 함</option>{object.locationId && !locations?.items.some(l => l.location.id === object.locationId) && <option value={object.locationId}>현재 연결된 위치</option>}{locations?.items.filter(l => !object.rackId || l.location.rackId === object.rackId).map(l => <option key={l.location.id} value={l.location.id}>{l.location.code}</option>)}</select></label><small>검색 결과의 첫 50개 위치를 표시합니다.</small></fieldset></details>
      </>} />}
    </>}
    {navigation.blocked && <OrganizationDialog title="저장하지 않은 도면 변경" busy={busy} onClose={navigation.stay}><p>도면 변경을 버리고 계속하시겠습니까? 이미 등록한 창고·구역·랙·위치는 유지됩니다.</p><button type="button" className="secondary" onClick={navigation.stay}>계속 편집</button>{' '}<button type="button" className="primary" disabled={busy} onClick={navigation.discard}>변경 버리고 계속</button></OrganizationDialog>}
    {unlinked && <OrganizationDialog title="실제 구조에 연결하지 않은 객체" onClose={() => setUnlinked(false)}><p>연결하거나 시각 객체로만 저장할 수 있습니다.</p><ul>{unlinkedStructureObjects(doc).map(o => <li key={o.id}>{o.label || planLabels[o.type]}</li>)}</ul><button className="secondary" onClick={() => { setSelected(unlinkedStructureObjects(doc).slice(0, 1).map(o => o.id)); setUnlinked(false) }}>돌아가서 연결</button>{' '}<button className="primary" disabled={busy || !canEdit || stale} onClick={() => save(true)}>시각 객체로만 저장</button></OrganizationDialog>}
    {rack && <RackFrontDialog endpoint={endpoint} rackId={rack} onClose={() => setRack(null)} />}
    {changes && <OrganizationDialog title="도면 변경 이력" onClose={() => setChanges(null)}><p>최근 {changes.length}건 · 변경 전후 도면은 서버 감사 로그에 보존됩니다.</p><ul>{changes.map(c => <li key={c.id}>{new Date(c.changedAt).toLocaleString('ko-KR')} · 변경자 {c.changedByUserId}</li>)}</ul></OrganizationDialog>}
  </section>
}
