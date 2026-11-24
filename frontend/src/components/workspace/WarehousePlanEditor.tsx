import { t as uiText } from '../../i18n.ts'
import { removeDeletedRacks, removeDeletedRackHistory } from '../../rack-deletion'
import type { RackDeletion } from '../../rack-deletion'
import SearchableChoiceField from './SearchableChoiceField'
import type { Choice } from '../../receipt-model'
import UnsavedChangesContent from './UnsavedChangesContent'
import { barcodeChanged } from '../../rack-barcode'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../api'
import { editSnapshot, requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import { blankPlan, deletePlanObjects, duplicateRackLinks, editPlan, planLabels, unlinkedStructureObjects } from '../../warehouse-plan-model'
import type { PlanDocument, PlanHistory, PlanResponse } from '../../warehouse-plan-model'
import type { LocationList, StorageItem, WarehouseDetailData } from '../../types/warehouse'
import RackFrontDialog from './RackFrontDialog'
import OrganizationDialog from './OrganizationDialog'
import PlanStructureProperties from './PlanStructureProperties'
import type { StructureDraft } from './PlanStructureProperties'
import PlanEditorSurface from './PlanEditorSurface'
import './warehouse-wizard.css'
import type { PlanEditorSurfaceProps } from './PlanEditorSurface'

type RemoteProps = { endpoint: string; initialWarehouse?: WarehouseDetailData; canEdit: boolean; canDelete?:boolean; canCreate: boolean; onBack: () => void; onSaved?: () => void; backLabel?: string }
type DraftProps = PlanEditorSurfaceProps & { mode: 'draft' }
const clean = (p: PlanDocument): PlanDocument => ({ schemaVersion: p.schemaVersion, aspectRatio: p.aspectRatio, objects: p.objects })
export default function WarehousePlanEditor(props: RemoteProps | DraftProps) {
  return 'mode' in props ? <PlanEditorSurface {...props} /> : <SavedWarehousePlanEditor {...props} />
}

// Existing saved-plan API workflow remains available independently of the aggregate registration form.
function SavedWarehousePlanEditor({ endpoint, initialWarehouse, canEdit, canDelete=false, canCreate, onBack, onSaved, backLabel = '창고 상세로' }: RemoteProps) {
  const [warehouse, setWarehouse] = useState<WarehouseDetailData | null>(initialWarehouse || null)
  const [saved, setSaved] = useState<PlanResponse | null>(null), [history, setHistory] = useState<PlanHistory>({ past: [], present: blankPlan(), future: [] })
  const [editRequested, setEditing] = useState(true), [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false), [physicalBusy, setPhysicalBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [stale, setStale] = useState(false), [revision, setRevision] = useState(0), [structureRevision, setStructureRevision] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, StructureDraft>>({}), [unlinked, setUnlinked] = useState(false)
  const [rack, setRack] = useState<string | null>(null)
  const sending = useRef(false)
  const busy = saving || physicalBusy, editing = editRequested && canEdit, editable = editing && !busy && !stale
  const doc = history.present, dirty = !!saved && editSnapshot(clean(saved)) !== editSnapshot(doc)
  const draftDirty = Object.entries(drafts).some(([id, value]) => {
    const object = doc.objects.find(o => o.id === id)
    if (!object) return false
    if (object.rackId) { const current = warehouse?.racks.find(r => r.id === object.rackId)?.barcode; return barcodeChanged(current, value.barcode) }
    if (object.zoneId) return false
    if (object.type === 'rack' && barcodeChanged(undefined, value.barcode, true)) return true
    return value.name !== object.label || value.code !== '' || (object.type === 'rack' && (value.levels !== '3' || value.bays !== '4' || value.zoneId !== ''))
  })
  useEffect(() => {
    let live = true
    Promise.all([api<PlanResponse>(`${endpoint}/plan`), api<WarehouseDetailData>(endpoint)]).then(([p, w]) => { if (live) { setWarehouse(w); setSaved(p); setHistory({ past: [], present: clean(p), future: [] }); setSelected([]); setError(''); setStale(false) } }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [endpoint, revision])
  const navigation = useUnsavedNavigation(dirty || draftDirty || busy, busy, () => {
    if (saved) setHistory({ past: [], present: clean(saved), future: [] })
    setDrafts({}); setSelected([]); setError(''); setNotice('')
  })
  const confirmDiscard = requestNavigation
  async function deleteObjects(ids:string[]) {
    if(!editable||sending.current||!saved||!warehouse)return
    const rackIds=[...new Set(doc.objects.filter(o=>ids.includes(o.id)&&o.rackId).map(o=>o.rackId!))]
    const zoneIds=[...new Set(doc.objects.filter(o=>ids.includes(o.id)&&o.zoneId).map(o=>o.zoneId!))]
    if((rackIds.length||zoneIds.length)&&!canDelete){setError('구역·랙 삭제 권한이 없습니다.');return}
    sending.current=true;setPhysicalBusy(true);setError('')
    try {
      const result:RackDeletion=rackIds.length||zoneIds.length?await api<RackDeletion>(`${endpoint}/racks/delete`,{planVersion:saved.version,...(zoneIds.length?{zones:zoneIds.map(id=>({id,version:warehouse.zones.find(z=>z.id===id)?.version}))}:{}),racks:rackIds.map(id=>({id,version:warehouse.racks.find(r=>r.id===id)?.version}))}):{rackIds:[],locationIds:[],objectIds:[],planVersion:saved.version}
      setHistory(h=>{const next=removeDeletedRackHistory(h,result);return editPlan(next,deletePlanObjects(next.present,ids))})
      setSaved(p=>p?{...removeDeletedRacks(p,result),version:result.planVersion}:p)
      setWarehouse(w=>w?{...w,zones:w.zones.filter(z=>!result.zoneIds?.includes(z.id)),racks:w.racks.filter(r=>!result.rackIds.includes(r.id)),locationCount:Math.max(0,w.locationCount-result.locationIds.length),rackLocationCounts:w.rackLocationCounts?Object.fromEntries(Object.entries(w.rackLocationCounts).filter(([id])=>!result.rackIds.includes(id))):undefined}:w)
      setDrafts(d=>Object.fromEntries(Object.entries(d).filter(([id])=>!ids.includes(id)&&!result.objectIds.includes(id))))
      setStructureRevision(r=>r+1);setRack(null);setSelected([]);setNotice('선택한 구조를 삭제했습니다. 다른 미저장 편집은 유지됩니다.')
    }catch(e){setError(e instanceof Error?e.message:'랙을 삭제하지 못했습니다.')}
    finally{sending.current=false;setPhysicalBusy(false)}
  }
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
  return <section className="warehouse-plan-editor warehouse-studio">
    <div className="organization-toolbar"><div><h2>{warehouse?.warehouse.name || uiText("창고")} {uiText("· 2D 창고 도면")}</h2><p className="organization-help">{editing ? uiText("편집 모드") : uiText("조회 모드")} · {dirty ? uiText("저장하지 않은 변경사항이 있습니다.") : saved?.exists ? uiText("저장된 도면") : uiText("등록된 도면 없음")}</p></div><button className="secondary" disabled={busy} onClick={() => requestNavigation(onBack)}>{uiText(backLabel)}</button></div>
    {error && <p role="alert" className="alert error">{uiText(error)}</p>}{notice && <p role="status" className="alert success">{uiText(notice)}</p>}
    {!saved || !warehouse ? error ? <button className="secondary" onClick={() => setRevision(r => r + 1)}>{uiText("도면 다시 불러오기")}</button> : <p>{uiText("도면을 불러오는 중…")}</p> : <>
      <div className="plan-toolbar">
        {canEdit && !editing && <button className="primary" onClick={() => setEditing(true)}>{saved.exists ? uiText("도면 편집") : uiText("도면 생성")}</button>}
        {editing && <><button className="primary" onClick={() => save()} disabled={!dirty || busy || stale}>{busy ? uiText("저장 중…") : uiText("도면 저장")}</button><button className="secondary" disabled={busy} onClick={() => confirmDiscard(() => { setHistory({ past: [], present: clean(saved), future: [] }); setEditing(false); setSelected([]); setError(''); setNotice('도면 편집을 종료했습니다. 실제 구조는 유지됩니다.') })}>{uiText("편집 종료")}</button></>}
        <button className="text-button" disabled={busy} onClick={() => confirmDiscard(() => { setRevision(r => r + 1); setEditing(false) })}>{uiText("최신 도면 불러오기")}</button>
        {dirty && <button className="text-button" onClick={download}>{uiText("변경사항 파일로 보관")}</button>}
      </div>
      {!saved.exists && !editing ? <div className="plan-empty"><h3>{uiText("아직 창고 도면이 없습니다")}</h3><p>{canEdit ? uiText("도면 생성 후 도구를 끌어 배치하세요.") : uiText("창고 수정 권한이 있는 담당자가 도면을 만들 수 있습니다.")}</p></div> : <PlanEditorSurface onDeleteObjects={ids=>{void deleteObjects(ids)}} rackInformation={Object.fromEntries(warehouse.racks.map(r=>[r.id,{name:r.name,code:r.code,levels:r.levels||0,bays:r.bays||0}]))} studio history={history} onHistory={setHistory} selected={selected} onSelect={setSelected} editable={editable} onOpenRack={setRack} onNotice={setNotice} renderProperties={(object, update) => <>
        {(object.type === 'zone' || object.type === 'rack') && <PlanStructureProperties key={object.id} item={object} endpoint={endpoint} warehouse={warehouse} objects={doc.objects} editable={editable} canCreate={canCreate} draft={drafts[object.id] || { requestId: object.id, name: object.label, code: '', levels: '3', bays: '4', zoneId: '' }} onDraft={draft => setDrafts(d => ({ ...d, [object.id]: draft }))} onLink={update} onCreated={(physical, kind) => created(object.id, physical, kind)} onBarcodeSaved={physical => { setWarehouse(w => w ? { ...w, racks: w.racks.map(r => r.id === physical.id ? physical : r) } : w); setDrafts(d => ({ ...d, [object.id]: { ...d[object.id], barcode: undefined } })); setNotice('랙 바코드를 저장했습니다. 기존 라벨을 확인해 주세요.') }} onBusy={setPhysicalBusy} onRefresh={async () => { setWarehouse(await api<WarehouseDetailData>(endpoint)); setStructureRevision(r => r + 1) }} />}
        {object.rackId && <button type="button" className="secondary" onClick={() => setRack(object.rackId)}>{uiText("랙 정면도 보기")}</button>}
        <details className="plan-geometry"><summary>{uiText("보관 위치 연결")}</summary><fieldset disabled={!editable}><SavedLocationChoice key={`${object.id}:${structureRevision}`} endpoint={endpoint} rackId={object.rackId || undefined} zoneId={object.zoneId || undefined} value={object.locationId || ''} disabled={!editable} onChange={id => update({ locationId: id || null })} /></fieldset></details>
      </>} />}
    </>}
    {navigation.blocked && <OrganizationDialog confirmation size="small" title={uiText("저장하지 않은 도면 변경")} busy={busy} onClose={navigation.stay}><UnsavedChangesContent stay={navigation.stay} discard={navigation.discard} busy={busy} message="도면 변경사항을 버리고 이동하시겠습니까?" detail="이미 등록한 창고·구역·랙·위치는 유지됩니다. 저장하지 않은 도면 변경사항은 복구할 수 없습니다." /></OrganizationDialog>}
    {unlinked && <OrganizationDialog confirmation size="small" title={uiText("실제 구조에 연결하지 않은 객체")} onClose={() => setUnlinked(false)}><p>{uiText("연결하거나 시각 객체로만 저장할 수 있습니다.")}</p><ul>{unlinkedStructureObjects(doc).map(o => <li key={o.id}>{o.label || uiText(planLabels[o.type])}</li>)}</ul><button className="secondary" onClick={() => { setSelected(unlinkedStructureObjects(doc).slice(0, 1).map(o => o.id)); setUnlinked(false) }}>{uiText("돌아가서 연결")}</button>{' '}<button className="primary" disabled={busy || !canEdit || stale} onClick={() => save(true)}>{uiText("시각 객체로만 저장")}</button></OrganizationDialog>}
    {rack && <RackFrontDialog endpoint={endpoint} rackId={rack} onClose={() => setRack(null)} />}
  </section>
}

function SavedLocationChoice({ endpoint, rackId, zoneId, value, disabled, onChange }: { endpoint: string; rackId?: string; zoneId?: string; value: string; disabled: boolean; onChange: (id: string) => void }) {
  const [selected, setSelected] = useState<Choice>()
  const loadPage = useCallback(async (search: string, page: number) => {
    const result = await api<LocationList>(`${endpoint}/locations?${new URLSearchParams({ search, page: String(page), status: 'all', ...(rackId ? { rackId } : zoneId ? { zoneId } : {}) })}`)
    return { ...result, items: result.items.map(({ location }) => ({ id:location.id, name:location.name || location.code, code:location.code, unit:null, lotManaged:false, expiryManaged:false, serialManaged:false })) }
  }, [endpoint, rackId, zoneId])
  return <SearchableChoiceField floating disabled={disabled} endpoint={endpoint} kind="locations" label={uiText("보관 위치 연결")} searchPlaceholder={uiText("보관 위치명·코드 검색")} emptyOptionLabel="연결 안 함" value={value} current={selected?.id === value ? selected : value ? { id:value, name:'현재 연결된 위치', code:'', unit:null, lotManaged:false, expiryManaged:false, serialManaged:false } : undefined} loadPage={loadPage} onChange={item => { setSelected(item); onChange(item?.id || '') }} />
}
