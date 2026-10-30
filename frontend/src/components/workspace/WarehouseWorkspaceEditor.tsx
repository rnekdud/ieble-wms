import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from '../../api'
import { editSnapshot, requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import { createPlanObject, editPlan, unlinkedStructureObjects } from '../../warehouse-plan-model'
import type { PlanHistory, PlanObject } from '../../warehouse-plan-model'
import { emptyVersion, emptyWorkspace, hydrateWorkspace, initialPlan, newStructure, previewRack, workspaceError, workspaceRequest } from '../../warehouse-workspace-model'
import type { DraftStructure, StructureKind, WorkspaceRead, WorkspaceSaved } from '../../warehouse-workspace-model'
import type { StorageItem } from '../../types/warehouse'
import WarehousePlanEditor from './WarehousePlanEditor'
import WarehouseBasicFields from './WarehouseBasicFields'
import WorkspaceStructureFields from './WorkspaceStructureFields'
import RackFrontDialog from './RackFrontDialog'
import type { RackFrontData } from './RackFrontDialog'
import OrganizationDialog from './OrganizationDialog'

type Props = { endpoint: string; warehouseId?: string; canCreate: boolean; canUpdate: boolean; onBack: () => void; onSaved: (result: WorkspaceSaved) => void }
const kindLabel = { zones: '구역', racks: '랙', floorLocations: '바닥 위치' }
const reference = (kind: StructureKind) => ({ zones: 'zoneId', racks: 'rackId', floorLocations: 'locationId' } as const)[kind]

export default function WarehouseWorkspaceEditor(props: Props) {
  const [revision, setRevision] = useState(0)
  return <WorkspaceLoader key={`${props.warehouseId || 'new'}:${revision}`} {...props} onReload={() => setRevision(r => r + 1)} />
}
function WorkspaceLoader(props: Props & { onReload: () => void }) {
  const [loaded, setLoaded] = useState<WorkspaceRead | null | undefined>(props.warehouseId ? undefined : null), [error, setError] = useState('')
  const { endpoint, warehouseId } = props
  useEffect(() => {
    if (!warehouseId) return
    let live = true
    api<WorkspaceRead>(`${endpoint}/${warehouseId}/workspace`).then(data => { if (live) setLoaded(data) }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [endpoint, warehouseId])
  return loaded === undefined ? <section className="wms-card warehouse-plan-editor"><p role={error ? 'alert' : undefined}>{error || '창고 기본 정보와 도면·구조를 불러오는 중…'}</p>{error && <button className="secondary" onClick={props.onReload}>다시 불러오기</button>}<button className="secondary" onClick={props.onBack}>돌아가기</button></section> : <WorkspaceForm {...props} loaded={loaded} />
}
function WorkspaceForm({ endpoint, warehouseId, canCreate, canUpdate, onBack, onSaved, onReload, loaded }: Props & { loaded: WorkspaceRead | null; onReload: () => void }) {
  const [draft, setDraft] = useState(() => loaded ? hydrateWorkspace(loaded) : emptyWorkspace())
  const [history, setHistory] = useState<PlanHistory>(() => ({ past: [], present: initialPlan(loaded?.plan), future: [] }))
  const [selected, setSelected] = useState<string[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const [attempt, setAttempt] = useState<ReturnType<typeof workspaceRequest> | null>(null)
  const [editingRow, setEditingRow] = useState<{ kind: StructureKind; clientId: string } | null>(null), [removingRow, setRemovingRow] = useState<{ kind: StructureKind; clientId: string } | null>(null)
  const [rack, setRack] = useState<string | null>(null)
  const sending = useRef(false)
  const [initial] = useState(() => ({ draft, plan: history.present, snapshot: editSnapshot({ draft, plan: history.present }) }))
  const doc = history.present, dirty = editSnapshot({ draft, plan: doc }) !== initial.snapshot
  const allowed = warehouseId ? canUpdate : canCreate, editable = allowed && !busy && !attempt
  const planVersion = loaded?.plan.version || emptyVersion, hadPlan = loaded?.plan.exists || false
  const unlinked = unlinkedStructureObjects(doc)
  const navigation = useUnsavedNavigation(dirty || busy || !!attempt, busy, () => {
    setDraft(initial.draft); setHistory({ past: [], present: initial.plan, future: [] }); setSelected([])
    setAttempt(null); setError(''); setNotice(''); setEditingRow(null); setRemovingRow(null); setRack(null)
  })
  function addStructure(kind: StructureKind, object?: PlanObject): DraftStructure {
    const row = newStructure(crypto.randomUUID(), object?.label || kindLabel[kind])
    setDraft(d => ({ ...d, [kind]: [...d[kind], row] }))
    return row
  }
  function addObject(object: PlanObject): PlanObject {
    if (canCreate && (object.type === 'zone' || object.type === 'rack')) {
      const kind = object.type === 'zone' ? 'zones' : 'racks', row = addStructure(kind, object)
      return { ...object, [reference(kind)]: row.clientId }
    }
    return object
  }
  function changeRow(kind: StructureKind, clientId: string, patch: Partial<DraftStructure>) {
    if (!editable) return
    setDraft(d => ({ ...d, [kind]: d[kind].map(r => r.clientId === clientId ? { ...r, ...patch } : r) }))
    if (patch.name !== undefined) setHistory(h => editPlan(h, { ...h.present, objects: h.present.objects.map(o => o[reference(kind)] === clientId ? { ...o, label: patch.name! } : o) }))
  }
  function place(kind: StructureKind, row: DraftStructure) {
    const found = doc.objects.find(o => o[reference(kind)] === row.clientId)
    if (found) setSelected([found.id])
    else {
      if (doc.objects.length >= 500) { setError('도면당 최대 500개 객체를 사용할 수 있습니다.'); return }
      const object = { ...createPlanObject(kind === 'zones' ? 'zone' : kind === 'racks' ? 'rack' : 'shape', crypto.randomUUID()), label: row.name, [reference(kind)]: row.clientId }
      setHistory(h => editPlan(h, { ...h.present, objects: [...h.present.objects, object] })); setSelected([object.id])
    }
    document.getElementById('workspace-plan')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  function removeStructure() {
    if (!removingRow || !editable) return
    const { kind, clientId } = removingRow
    if (draft[kind].find(r => r.clientId === clientId)?.id) return
    if (kind === 'zones' && [...draft.racks, ...draft.floorLocations].some(r => r.zoneClientId === clientId)) { setError('이 구역에 연결된 랙·바닥 위치의 소속 구역을 먼저 변경해 주세요.'); setRemovingRow(null); return }
    setDraft(d => ({ ...d, [kind]: d[kind].filter(r => r.clientId !== clientId) }))
    setHistory(h => ({ past: [], present: { ...h.present, objects: h.present.objects.map(o => o[reference(kind)] === clientId ? { ...o, [reference(kind)]: null } : o) }, future: [] }))
    setRemovingRow(null); setNotice('미저장 구조 항목을 제외했습니다. 연결되었던 도면 객체는 시각 객체로 남습니다.')
  }
  function prepare(e: FormEvent) {
    e.preventDefault()
    if (!editable || sending.current) return
    const problem = workspaceError(draft, doc)
    if (problem) { setError(problem); return }
    setError(''); setConfirm(true)
  }
  async function save(body: ReturnType<typeof workspaceRequest>) {
    if (sending.current || !allowed) return
    sending.current = true; setBusy(true); setAttempt(body); setError('')
    try { const result = await api<WorkspaceSaved>(warehouseId ? `${endpoint}/${warehouseId}/workspace` : `${endpoint}/workspace`, body); navigation.saved(); onSaved(result) }
    catch (e) {
      const definitive = e instanceof ApiError && e.status >= 400 && e.status < 500
      if (definitive) setAttempt(null)
      setConfirm(false)
      setError(`${e instanceof Error ? e.message : '저장하지 못했습니다.'} ${definitive ? '입력과 도면은 유지됩니다. 수정 후 다시 저장하거나 최신 정보를 불러오세요.' : '저장 결과를 확인하지 못했습니다. 입력을 보존했습니다. 같은 요청으로 저장 결과를 다시 확인해 주세요.'}`)
    }
    finally { sending.current = false; setBusy(false) }
  }
  function exportDraft() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ draft, plan: doc, pendingRequest: attempt }, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'warehouse-workspace-draft.json'; a.click(); URL.revokeObjectURL(url)
  }
  const editValue = editingRow && draft[editingRow.kind].find(r => r.clientId === editingRow.clientId)
  return <section className="wms-card warehouse-plan-editor warehouse-workspace-editor">
    <div className="organization-toolbar"><div><h2>{warehouseId ? '창고 통합 수정' : '창고 통합 등록'}</h2><p className="organization-help">기본 정보와 도면·구조를 작성한 뒤 한 번에 저장합니다. 도면 없이 기본 정보만 저장할 수도 있습니다.</p></div><button type="button" className="secondary" disabled={busy} onClick={() => requestNavigation(onBack)}>취소</button></div>
    {!allowed && <p role="alert" className="alert error">이 창고를 {warehouseId ? '수정' : '등록'}할 권한이 없습니다.</p>}
    {error && <p role="alert" className="alert error">{error}</p>}{notice && <p role="status" className="alert">{notice}</p>}
    {attempt && !busy && <button type="button" className="primary" disabled={!allowed} onClick={() => save(attempt)}>저장 결과 다시 확인</button>}
    <form onSubmit={prepare}>
      <WarehouseBasicFields value={draft.warehouse} disabled={!editable} onChange={patch => setDraft(d => ({ ...d, warehouse: { ...d.warehouse, ...patch } }))} />
      <div id="workspace-plan" className="warehouse-workspace-plan">
        <div className="organization-toolbar"><div><h3>2D 도면 및 보관 구조</h3><p className="organization-help">아래 구역·랙·바닥 위치는 최종 저장 전까지 작업 상태로만 보관됩니다.</p></div><button type="button" className="secondary" disabled={!editable || !canCreate} onClick={() => { const row = addStructure('floorLocations'); if (doc.objects.length < 500) place('floorLocations', row); else setEditingRow({ kind: 'floorLocations', clientId: row.clientId }) }}>바닥 위치 추가</button></div>
        <WarehousePlanEditor mode="draft" history={history} onHistory={setHistory} selected={selected} onSelect={setSelected} editable={editable} onOpenRack={setRack} onAddObject={addObject} onNotice={setNotice} renderProperties={(object, update) => {
          const kind: StructureKind | null = object.type === 'zone' ? 'zones' : object.type === 'rack' ? 'racks' : object.locationId && draft.floorLocations.some(l => l.clientId === object.locationId) ? 'floorLocations' : null
          if (!kind) return null
          const ref = reference(kind), row = draft[kind].find(r => r.clientId === object[ref])
          return <div className="plan-structure-properties"><label>{kindLabel[kind]} 연결<select aria-label={`${kindLabel[kind]} 연결`} disabled={!editable} value={object[ref] || ''} onChange={e => update({ [ref]: e.target.value || null, ...(kind === 'racks' || kind === 'zones' ? { locationId: null } : {}) })}><option value="">시각 객체로만 사용</option>{draft[kind].map(r => <option key={r.clientId} value={r.clientId} disabled={kind === 'racks' && doc.objects.some(o => o.id !== object.id && o.rackId === r.clientId)}>{r.code || '코드 미입력'} · {r.name}</option>)}</select></label>
            {row ? <WorkspaceStructureFields kind={kind} value={row} zones={draft.zones} disabled={!editable} onChange={patch => changeRow(kind, row.clientId, patch)} /> : <button type="button" className="secondary" disabled={!editable || !canCreate} onClick={() => { const next = addStructure(kind, object); update({ [ref]: next.clientId }) }}>새 {kindLabel[kind]} 정보 입력</button>}
            {kind === 'racks' && row && <button type="button" className="secondary" onClick={() => setRack(row.clientId)}>랙 정면도 미리보기</button>}
          </div>
        }} />
      </div>
      <section className="workspace-structure-list" aria-label="창고 구조 목록"><h3>저장할 구역·랙·바닥 위치</h3><p className="organization-help">도면 객체만 삭제해도 이 목록의 구조는 유지됩니다. 새 항목은 제외할 수 있으며, 기존 항목은 ID를 유지하고 미사용으로 설정할 수 있습니다.</p>
        {(['zones', 'racks', 'floorLocations'] as const).map(kind => <div key={kind}><h4>{kindLabel[kind]} {draft[kind].length}개</h4>{draft[kind].map(row => <div className="workspace-structure-row" key={row.clientId}><span>{row.code || '코드 미입력'} · {row.name} {kind === 'racks' ? `(${row.levels}단 × ${row.bays}칸)` : ''} · {row.id ? '기존' : '저장 전'}</span><div className="organization-row-actions"><button type="button" className="text-button" disabled={!editable} onClick={() => setEditingRow({ kind, clientId: row.clientId })}>{row.name} 정보 수정</button><button type="button" className="text-button" disabled={!editable} onClick={() => place(kind, row)}>도면에 배치/선택</button>{!row.id && <button type="button" className="text-button" disabled={!editable} onClick={() => setRemovingRow({ kind, clientId: row.clientId })}>임시 항목 제거</button>}</div></div>)}</div>)}
      </section>
      <div className="warehouse-workspace-actions"><button className="primary" type="submit" disabled={!editable || (!!warehouseId && !dirty)}>{busy ? '전체 저장 중…' : '창고 및 도면 저장'}</button><button type="button" className="secondary" disabled={busy} onClick={() => requestNavigation(onBack)}>취소</button><button type="button" className="text-button" onClick={exportDraft}>작업 내용 파일로 보관</button>{warehouseId && <button type="button" className="text-button" disabled={busy} onClick={() => requestNavigation(onReload)}>최신 정보 다시 불러오기</button>}</div>
    </form>
    {confirm && <OrganizationDialog title="창고 및 도면 저장 확인" busy={busy} onClose={() => setConfirm(false)}><p>창고 기본 정보, 구역 {draft.zones.length}개, 랙 {draft.racks.length}개, 바닥 위치 {draft.floorLocations.length}개와 도면을 함께 저장하시겠습니까?</p><p>일부라도 실패하면 이번 저장 전체를 취소하고 기존 데이터는 유지합니다.</p>{unlinked.length > 0 && <p>실제 구조에 연결되지 않은 객체 {unlinked.length}개({unlinked.map(o => o.label).join(', ')})는 시각 객체로만 저장합니다. 연결하려면 취소 후 속성에서 선택하세요.</p>}<button type="button" className="secondary" disabled={busy} onClick={() => setConfirm(false)}>취소</button>{' '}<button type="button" className="primary" disabled={busy || !allowed} onClick={() => save(workspaceRequest(draft, doc, planVersion, hadPlan, crypto.randomUUID()))}>{busy ? '저장 중…' : '확인'}</button></OrganizationDialog>}
    {navigation.blocked && <OrganizationDialog title="저장하지 않은 창고 작업" onClose={navigation.stay}><p>{attempt ? '저장 결과가 확인되지 않았습니다. 나중에 창고 목록에서 결과를 확인해야 합니다.' : '입력한 기본 정보와 도면·구조 변경을 버리고 이동하시겠습니까? 저장 전에는 새 데이터가 생성되지 않습니다.'}</p><button type="button" className="secondary" onClick={navigation.stay}>계속 편집</button>{' '}<button type="button" className="primary" onClick={navigation.discard}>변경 버리고 계속</button></OrganizationDialog>}
    {editingRow && editValue && <OrganizationDialog title={`${kindLabel[editingRow.kind]} 정보 수정`} onClose={() => setEditingRow(null)}><WorkspaceStructureFields kind={editingRow.kind} value={editValue} zones={draft.zones} disabled={!editable} onChange={patch => changeRow(editingRow.kind, editValue.clientId, patch)} /><button type="button" className="primary" onClick={() => setEditingRow(null)}>입력 완료</button></OrganizationDialog>}
    {removingRow && <OrganizationDialog title="미저장 구조 항목 제거" onClose={() => setRemovingRow(null)}><p>이 항목을 최종 저장 대상에서 제외합니다. 연결된 도면 객체는 시각 객체로 남습니다.</p><button type="button" className="secondary" onClick={() => setRemovingRow(null)}>취소</button>{' '}<button type="button" className="primary" onClick={removeStructure}>제외</button></OrganizationDialog>}
    {rack && draft.racks.find(r => r.clientId === rack) && <WorkspaceRackPreview key={rack} rack={draft.racks.find(r => r.clientId === rack)!} endpoint={warehouseId ? `${endpoint}/${warehouseId}` : undefined} active={draft.warehouse.isActive && draft.racks.find(r => r.clientId === rack)!.isActive && (!draft.racks.find(r => r.clientId === rack)!.zoneClientId || draft.zones.some(z => z.clientId === draft.racks.find(r => r.clientId === rack)!.zoneClientId && z.isActive))} onClose={() => setRack(null)} />}
  </section>
}
function WorkspaceRackPreview({ rack, endpoint, active, onClose }: { rack: DraftStructure; endpoint?: string; active: boolean; onClose: () => void }) {
  const [existing, setExisting] = useState<StorageItem[] | null>(rack.id ? null : []), [error, setError] = useState('')
  useEffect(() => {
    if (!rack.id || !endpoint) return
    let live = true
    api<RackFrontData>(`${endpoint}/racks/${rack.id}/front`).then(data => { if (live) setExisting(data.locations.map(l => l.location)) }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [endpoint, rack.id])
  if (!existing) return <OrganizationDialog title="랙 정면도 미리보기" onClose={onClose}><p role={error ? 'alert' : undefined}>{error || '기존 위치 정보를 불러오는 중…'}</p></OrganizationDialog>
  const locations = previewRack(rack, existing)
  if (!locations.length) return <OrganizationDialog title="랙 정면도 미리보기" onClose={onClose}><p>단·칸을 각각 1~100, 총 1,000개 이내로 입력해 주세요.</p></OrganizationDialog>
  const physical: StorageItem = { id: rack.id || rack.clientId, code: rack.code, name: rack.name, levels: rack.levels, bays: rack.bays, isActive: rack.isActive, version: rack.version, createdAt: '', updatedAt: '' }
  return <RackFrontDialog preview={{ rack: physical, locations: locations.map(location => ({ location, effectiveActive: active && location.isActive })), inventoryAvailable: false }} onClose={onClose} />
}
