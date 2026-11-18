import { useMobile } from '../../use-mobile'
import { useEditorLandscape } from '../../use-editor-landscape'
import StorageTreeNode from './StorageTreeNode'
import { useStorageExpansion } from './useStorageExpansion'
import { removeDeletedRacks, removeDeletedRackHistory } from '../../rack-deletion'
import type { RackDeletion } from '../../rack-deletion'
import { useCurrentAssignee } from "../../business-assignee"
import UnsavedChangesContent from './UnsavedChangesContent'
import PlanImportDialog from './PlanImportDialog'
import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, FolderOpen, Save, MapPin } from 'lucide-react'
import './warehouse-wizard.css'
import type { FormEvent, ReactNode } from 'react'
import { api, ApiError } from '../../api'
import { editSnapshot, requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import { barcodeChanged, barcodeInputValue } from '../../rack-barcode'
import { createPlanObject, deletePlanObjects, editPlan, unlinkedStructureObjects } from '../../warehouse-plan-model'
import type { PlanHistory, PlanObject } from '../../warehouse-plan-model'
import { emptyVersion, emptyWorkspace, hydrateWorkspace, initialPlan, newStructure, previewRack, workspaceError, workspaceRequest } from '../../warehouse-workspace-model'
import type { DraftStructure, StructureKind, WorkspaceDraft, WorkspaceRead, WorkspaceSaved } from '../../warehouse-workspace-model'
import type { StorageItem } from '../../types/warehouse'
import WarehousePlanEditor from './WarehousePlanEditor'
import WarehouseBasicFields from './WarehouseBasicFields'
import WorkspaceStructureFields from './WorkspaceStructureFields'
import WarehouseTemplateDialog from './WarehouseTemplateDialog'
import { defaultWarehouseTemplate, emptyWarehouseTemplate, instantiateTemplate, templateFromWorkspace } from '../../warehouse-templates'
import type { TemplateDocument } from '../../warehouse-templates'
import './warehouse-templates.css'
import RackFrontDialog from './RackFrontDialog'
import type { RackFrontData } from './RackFrontDialog'
import OrganizationDialog from './OrganizationDialog'

type Props = { initialStep?:1|2; endpoint: string; warehouseId?: string; canCreate: boolean; canUpdate: boolean; canDelete?: boolean; onBack: () => void; onSaved: (result: WorkspaceSaved) => void }
const kindLabel = { zones: '구역', racks: '랙', floorLocations: '바닥 위치' }
const snapshotWorkspace = (draft:WorkspaceDraft, plan:PlanHistory['present']) => editSnapshot({draft:{...draft,racks:draft.racks.map(r=>({...r,barcodeChange:barcodeChanged(r.barcode,r.barcodeChange,!r.id)?r.barcodeChange:undefined}))},plan})
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
function WorkspaceForm({ initialStep=1, endpoint, warehouseId, canCreate, canUpdate, canDelete=false, onBack, onSaved, onReload, loaded }: Props & { loaded: WorkspaceRead | null; onReload: () => void }) {
  const [step, setStep] = useState<1 | 2>(initialStep), [designVisited, setDesignVisited] = useState(initialStep===2)
  const isMobile = useMobile()
  const mobileEditor = isMobile
  const landscape = useEditorLandscape(mobileEditor && step === 2)
  const wizard = useRef<HTMLElement>(null)
  const currentAssignee = useCurrentAssignee()
  const [layout] = useState(() => {
    if (loaded) return {draft:hydrateWorkspace(loaded),plan:initialPlan(loaded.plan)}
    const result = instantiateTemplate(defaultWarehouseTemplate())
    result.draft.warehouse.contactUserId = currentAssignee?.id
    result.draft.warehouse.contactName = currentAssignee?.name || ""
    return result
  })
  const [draft, setDraft] = useState(layout.draft)
  const [history, setHistory] = useState<PlanHistory>(() => ({ past: [], present: layout.plan, future: [] }))
  const [importing,setImporting]=useState(false)
  const [templateMode,setTemplateMode]=useState<'save'|'load'|null>(null),[replacement,setReplacement]=useState<TemplateDocument|null>(null)
  const [creatingRack,setCreatingRack]=useState<{row:DraftStructure;object:PlanObject}|null>(null),[createError,setCreateError]=useState('')
  const [selected, setSelected] = useState<string[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const [attempt, setAttempt] = useState<ReturnType<typeof workspaceRequest> | null>(null)
  const [editingRow, setEditingRow] = useState<{ kind: StructureKind; clientId: string } | null>(null), [removingRow, setRemovingRow] = useState<{ kind: StructureKind; clientId: string } | null>(null)
  const [rack, setRack] = useState<string | null>(null)
  const formId = useId(), form = useRef<HTMLFormElement>(null), errorPanel = useRef<HTMLParagraphElement>(null)
  const [attempted, setAttempted] = useState(false)
  const sending = useRef(false)
  function revealField(target: HTMLElement) {
    for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true
    const focus = () => { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
    // Visible fields can focus immediately; a deferred focus must not steal the next input.
    if (target.getClientRects().length && !target.matches(':disabled')) focus()
    else requestAnimationFrame(focus)
  }
  const [initial, setInitial] = useState(() => ({ draft, plan: history.present, snapshot: snapshotWorkspace(draft, history.present) }))
  const doc = history.present
  const dirty = snapshotWorkspace(draft, doc) !== initial.snapshot
  const allowed = warehouseId ? canUpdate : canCreate, editable = allowed && !busy && !attempt
  const [planVersion, setPlanVersion] = useState(loaded?.plan.version || emptyVersion)
  const hadPlan = loaded?.plan.exists || false
  const unlinked = unlinkedStructureObjects(doc)
  const navigation = useUnsavedNavigation(dirty || busy || !!attempt || !!creatingRack, busy, () => {
    setDraft(initial.draft); setHistory({ past: [], present: initial.plan, future: [] }); setSelected([])
    setImporting(false);setCreatingRack(null);setTemplateMode(null);setReplacement(null);setAttempt(null); setError(''); setNotice(''); setEditingRow(null); setRemovingRow(null); setRack(null)
  })
  async function deleteObjects(ids:string[], target?:{kind:StructureKind;clientId:string}) {
    if (!editable || sending.current) return
    const rackIds=[...new Set(doc.objects.filter(o=>ids.includes(o.id)&&o.rackId).map(o=>o.rackId!))]
    if(target?.kind==='racks')rackIds.push(target.clientId)
    const zoneIds=[...new Set(doc.objects.filter(o=>ids.includes(o.id)&&o.zoneId).map(o=>o.zoneId!))]
    if(target?.kind==='zones')zoneIds.push(target.clientId)
    if([...draft.racks,...draft.floorLocations].some(r=>r.zoneClientId&&zoneIds.includes(r.zoneClientId))){setError('구역에 연결된 랙 또는 보관 위치를 먼저 정리해 주세요.');return}
    const persistedZones=draft.zones.filter(z=>zoneIds.includes(z.clientId)&&z.id)
    const persisted=draft.racks.filter(r=>rackIds.includes(r.clientId)&&r.id)
    if((persisted.length||persistedZones.length)&&!canDelete){setError('구역·랙 삭제 권한이 없습니다.');return}
    sending.current=true;setBusy(true);setError('');setNotice('')
    try {
      const result: RackDeletion = persisted.length || persistedZones.length ? await api<RackDeletion>(`${endpoint}/${warehouseId}/racks/delete`,{planVersion,...(persistedZones.length?{zones:persistedZones.map(z=>({id:z.id,version:z.version}))}:{}),racks:persisted.map(r=>({id:r.id,version:r.version}))}) : {rackIds:[],locationIds:[],objectIds:[],planVersion}
      const removed={...result,zoneIds:[...new Set([...(result.zoneIds||[]),...zoneIds])],rackIds:[...new Set([...result.rackIds,...rackIds])]}
      const pruneDraft=(d:WorkspaceDraft)=>({...d,zones:d.zones.filter(z=>!removed.zoneIds.includes(z.clientId)),racks:d.racks.filter(r=>!removed.rackIds.includes(r.clientId))})
      setDraft(pruneDraft)
      setHistory(h=>{const next=removeDeletedRackHistory(h,removed);return editPlan(next,deletePlanObjects(next.present,ids))})
      setInitial(i=>{const d=pruneDraft(i.draft),p=removeDeletedRacks(i.plan,removed);return {draft:d,plan:p,snapshot:snapshotWorkspace(d,p)}})
      setPlanVersion(result.planVersion);setSelected([]);setRack(null);setEditingRow(null)
      setNotice(persisted.length||persistedZones.length?'선택한 구조를 삭제했습니다. 다른 미저장 편집은 유지됩니다.':'미저장 구조를 제거했습니다.')
    } catch(e) {setError(e instanceof Error?e.message:'랙을 삭제하지 못했습니다.')}
    finally {sending.current=false;setBusy(false)}
  }
  function addStructure(kind: StructureKind, object?: PlanObject): DraftStructure {
    const row = newStructure(crypto.randomUUID(), object?.label || kindLabel[kind])
    let n=1;while(draft[kind].some(r=>r.code===`${kind==='racks'?'R':kind==='zones'?'Z':'F'}-${String(n).padStart(2,'0')}`))n++;row.code=`${kind==='racks'?'R':kind==='zones'?'Z':'F'}-${String(n).padStart(2,'0')}`
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
    const label=patch.name
    if (label !== undefined) setHistory(h => editPlan(h, { ...h.present, objects: h.present.objects.map(o => o[reference(kind)] === clientId ? { ...o, label } : o) }))
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
  function applyTemplate(template:TemplateDocument) {
    if(warehouseId||!editable||!canCreate)return
    const next=instantiateTemplate(template,draft.warehouse);setDraft(next.draft);setHistory({past:[],present:next.plan,future:[]});setSelected([]);setCreatingRack(null);setReplacement(null);setNotice('도면을 적용했습니다. 최종 창고 저장 전까지 임시 상태입니다.')
  }
  function requestTemplate(template:TemplateDocument){setTemplateMode(null);if(doc.objects.length||draft.racks.length||draft.zones.length||draft.floorLocations.length||creatingRack)setReplacement(template);else applyTemplate(template)}
  function startRack(x:number,y:number){if(!editable||!canCreate)return;if(creatingRack){setCreateError('현재 랙 생성을 완료하거나 취소해 주세요.');return}let n=1;while(draft.racks.some(r=>r.code===`R-${String(n).padStart(2,'0')}`))n++;const code=`R-${String(n).padStart(2,'0')}`,row={...newStructure(crypto.randomUUID(),code),code};setCreatingRack({row,object:createPlanObject('rack',crypto.randomUUID(),x,y)});setSelected([]);setCreateError('')}
  function createRack(){if(!creatingRack||!editable)return;const {row,object}=creatingRack;const problem=workspaceError({...draft,racks:[...draft.racks,row]},doc);if(problem){setCreateError(problem);return}const next={...object,label:row.name,rackId:row.clientId};setDraft(d=>({...d,racks:[...d.racks,row]}));setHistory(h=>editPlan(h,{...h.present,objects:[...h.present.objects,next]}));setSelected([next.id]);setCreatingRack(null);setCreateError('')}
  function switchStep(next: 1 | 2) {
    if (busy) return
    if (next === 2) {
      setAttempted(true)
      const invalid = form.current?.querySelector<HTMLInputElement>('.wizard-basics input:invalid, .wizard-basics select:invalid, .wizard-basics textarea:invalid')
      if (!draft.warehouse.name.trim() || invalid) {
        const target = invalid || form.current?.querySelector<HTMLInputElement>('[aria-label="창고명"]')
        if (target) { revealField(target); target.reportValidity() }
        return
      }
      setDesignVisited(true)
      if (mobileEditor) void landscape.enter()
    } else landscape.leave()
    setStep(next)
    requestAnimationFrame(() => wizard.current?.scrollIntoView({ block: 'start' }))
  }
  function prepare(e: FormEvent) {
    e.preventDefault()
    if (step === 1) { switchStep(2); return }
    if (!editable || sending.current) return
    if(creatingRack){setCreateError('랙 생성을 완료하거나 취소한 후 창고를 저장해 주세요.');return}
    const invalid = form.current?.querySelector<HTMLInputElement>('input:invalid,select:invalid,textarea:invalid')
    if (invalid) { setAttempted(true); revealField(invalid); invalid.reportValidity(); return }
    const problem = workspaceError(draft, doc)
    if (problem) {
      setError(problem); setAttempted(true)
      if (!draft.warehouse.name.trim()) { setStep(1); const input = form.current?.querySelector<HTMLElement>('[aria-label="창고명"]'); if (input) revealField(input) }
      else {
        // Bring an invalid, potentially unselected structure into view without changing its data.
        for (const kind of ['zones', 'racks', 'floorLocations'] as const) {
          const row = draft[kind].find(row => workspaceError({ ...emptyWorkspace(), warehouse: draft.warehouse, zones: kind === 'zones' ? [row] : draft.zones, [kind]: [row] }, { ...doc, objects: [] }))
          if (row) { setEditingRow({ kind, clientId: row.clientId }); break }
        }
      }
      return
    }
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
    finally { sending.current = false; setBusy(false); requestAnimationFrame(() => errorPanel.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })) }
  }
  function renderStructure(kind:StructureKind,row:DraftStructure,children?:ReactNode) {
    const active=doc.objects.some(o=>selected.includes(o.id)&&o[reference(kind)]===row.clientId)
    const childSelected=kind==='zones'&&doc.objects.some(o=>selected.includes(o.id)&&draft.racks.some(r=>r.clientId===o.rackId&&r.zoneClientId===row.clientId))
    return <WorkspaceStructureRow key={row.clientId} row={row} kind={kind} selected={active} childSelected={childSelected} rackCount={draft.racks.filter(r=>r.zoneClientId===row.clientId).length} endpoint={warehouseId?`${endpoint}/${warehouseId}`:undefined} onSelect={()=>place(kind,row)} actions={<div className="organization-row-actions" onClick={e=>e.stopPropagation()}><button type="button" className="text-button" disabled={!editable} onClick={()=>setEditingRow({kind,clientId:row.clientId})}>정보 수정</button>{kind==='racks'&&<button type="button" className="text-button" onClick={()=>setRack(row.clientId)}>보관 위치 관리</button>}{kind!=='floorLocations'?<button type="button" className="text-button" disabled={!editable||!!row.id&&!canDelete} onClick={()=>void deleteObjects(doc.objects.filter(o=>o[reference(kind)]===row.clientId).map(o=>o.id),{kind,clientId:row.clientId})}>삭제</button>:!row.id&&<button type="button" className="text-button" disabled={!editable} onClick={()=>setRemovingRow({kind,clientId:row.clientId})}>임시 항목 제거</button>}</div>}>{children}</WorkspaceStructureRow>
  }
  const templateToolbar = <div className="template-toolbar"><div>{!warehouseId&&<><span>일반 창고 예시 · 자유롭게 수정하세요</span><button type="button" className="secondary" disabled={!editable||!canCreate} onClick={()=>requestTemplate(defaultWarehouseTemplate())}>기본 도면 사용</button><button type="button" className="secondary" disabled={!editable||!canCreate} onClick={()=>setImporting(true)}>도면 파일 불러오기</button><button type="button" className="text-button" disabled={!editable||!canCreate} onClick={()=>requestTemplate(emptyWarehouseTemplate())}>빈 도면으로 시작</button></>}</div><div className="template-actions">{!warehouseId&&<button type="button" className="secondary" disabled={!editable||!canCreate} onClick={()=>setTemplateMode('load')}><FolderOpen size={16}/>템플릿 불러오기</button>}<button type="button" className="primary" disabled={!editable||!canCreate||!!creatingRack} onClick={()=>setTemplateMode('save')}><Save size={16}/>템플릿 저장</button></div></div>
  const editValue = editingRow && draft[editingRow.kind].find(r => r.clientId === editingRow.clientId)
  return <section ref={wizard} className={`warehouse-wizard warehouse-workspace-editor ${mobileEditor ? 'is-mobile-editor' : ''} ${step === 2 ? 'is-design' : 'is-basics'}`}>
    <div className="wizard-heading wms-page-header">
      <div className="wizard-heading-title"><h2>{step === 1 ? warehouseId ? '창고 정보 수정' : '새 창고 만들기' : draft.warehouse.name}<span>{step === 2 ? '도면 구성' : ''}</span></h2></div>
      <div className="wizard-heading-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => requestNavigation(onBack)}>취소</button>
        {step === 2 && <><button type="button" className="secondary" disabled={busy} onClick={() => switchStep(1)}><ArrowLeft size={15} />이전 단계</button><button className="primary" type="submit" form={formId} disabled={!editable || (!!warehouseId && !dirty)}>{busy ? '저장 중…' : '창고 저장'}</button></>}
      </div>
    </div>
    <nav className="warehouse-steps" aria-label="창고 등록 단계">
      <button type="button" aria-current={step === 1 ? 'step' : undefined} disabled={busy} onClick={() => switchStep(1)}><span>{step === 2 ? <Check size={16} /> : '01'}</span><div><small>STEP 1</small><strong>기본 정보</strong></div></button>
      <i aria-hidden="true" />
      <button type="button" aria-current={step === 2 ? 'step' : undefined} disabled={busy} onClick={() => switchStep(2)}><span>02</span><div><small>STEP 2</small><strong>도면 구성</strong></div></button>
      <p>최종 저장 전까지 작성 중인 상태입니다.</p>
    </nav>
    {!allowed && <p role="alert" className="alert error">이 창고를 {warehouseId ? '수정' : '등록'}할 권한이 없습니다.</p>}
    {error && <p ref={errorPanel} role="alert" className="alert error">{error}</p>}{notice && <p role="status" className="alert">{notice}</p>}
    {attempt && !busy && <button type="button" className="primary" disabled={!allowed} onClick={() => save(attempt)}>저장 결과 다시 확인</button>}

    <form id={formId} ref={form} noValidate onSubmit={prepare} onInvalidCapture={e => {
      e.preventDefault(); setAttempted(true)
      const first = form.current?.querySelector<HTMLElement>('input:invalid,select:invalid,textarea:invalid')
      if (e.target === first) revealField(e.target as HTMLElement)
    }}>
      <div className="wizard-basics" hidden={step !== 1}>
        <div className="wizard-form-content"><div className="wizard-form-title"><p>시스템 창고 코드 <strong>{draft.warehouse.code || '저장 시 자동 생성'}</strong></p></div>
          <WarehouseBasicFields wizard attempted={attempted} value={draft.warehouse} disabled={!editable || step !== 1} onChange={patch => setDraft(d => ({ ...d, warehouse: { ...d.warehouse, ...patch } }))} />
          <div className="wizard-basics-footer"><p>도면 없이 기본 정보만 저장할 수도 있습니다.</p><button type="submit" className="primary" disabled={!allowed || busy}>다음: 도면 구성<ArrowRight size={17} /></button></div>
        </div>
      </div>
      <div className="wizard-design" hidden={step !== 2}>
      {mobileEditor?<details className="mobile-plan-resources"><summary> 도면 파일·템플릿 및 화면 안내</summary>{templateToolbar}{mobileEditor && step === 2 && <div className="editor-landscape-hint" role="status"><span>도면은 가로 화면에서 편집해 주세요. 자동 전환되지 않으면 기기를 가로로 돌려 주세요.</span><button type="button" className="secondary" onClick={() => void landscape.enter()}>가로 화면 전환</button></div>}</details>:templateToolbar}
      <div id="workspace-plan" className="warehouse-workspace-plan">
        {designVisited && <WarehousePlanEditor onDeleteObjects={ids=>{void deleteObjects(ids)}} onRackDimensionsChange={(id,patch)=>changeRow('racks',id,patch)} rackInformation={Object.fromEntries(draft.racks.map(r=>[r.clientId,{name:r.name,code:r.code,levels:r.levels,bays:r.bays,minimumLevels:r.minimumLevels,minimumBays:r.minimumBays}]))} studio mode="draft" history={history} onHistory={setHistory} selected={selected} onSelect={ids=>{if(creatingRack){setCreateError('현재 랙 생성을 완료하거나 취소해 주세요.');return}setSelected(ids)}} editable={editable} customRackProperties onRequestAdd={(type,x,y)=>{if(type==='rack'){startRack(x,y);return false}return true}} creationPanel={creatingRack&&<><h3>새 랙 생성</h3>{createError&&<p role="alert" className="alert error">{createError}</p>}<WorkspaceStructureFields concise endpoint={endpoint} kind="racks" value={creatingRack.row} zones={draft.zones} disabled={!editable} actions={<div className="rack-create-actions"><button type="button" className="secondary" onClick={()=>setCreatingRack(null)}>생성 취소</button><button type="button" className="primary" disabled={!editable} onClick={createRack}>랙 생성</button></div>} fill={creatingRack.object.fill} onFill={fill=>setCreatingRack(c=>c?{...c,object:{...c.object,fill}}:c)} rotation={creatingRack.object.rotation} onRotate={rotation=>setCreatingRack(c=>c?{...c,object:{...c.object,rotation}}:c)} onChange={patch=>setCreatingRack(c=>c?{...c,row:{...c.row,...patch}}:c)}/></>} onOpenRack={setRack} onAddObject={addObject} onNotice={setNotice} toolbar={<button type="button" disabled={!editable || !canCreate} onClick={() => { const row = addStructure('floorLocations'); if (doc.objects.length < 500) place('floorLocations', row); else setEditingRow({ kind: 'floorLocations', clientId: row.clientId }) }} aria-label="보관 위치 추가"><MapPin size={20}/><span className="studio-tool-label-full">보관 위치 추가</span><span className="studio-tool-label-compact" aria-hidden="true">보관위치</span></button>} renderProperties={(object, update) => {
          const kind: StructureKind | null = object.type === 'zone' ? 'zones' : object.type === 'rack' ? 'racks' : object.locationId && draft.floorLocations.some(l => l.clientId === object.locationId) ? 'floorLocations' : null
          if (!kind) return null
          const ref = reference(kind), row = draft[kind].find(r => r.clientId === object[ref])
          return <div className="plan-structure-properties"><div className="structure-link-options"><label>{kindLabel[kind]} 연결<select aria-label={`${kindLabel[kind]} 연결`} disabled={!editable} value={object[ref] || ''} onChange={e => update({ [ref]: e.target.value || null, label: draft[kind].find(r => r.clientId === e.target.value)?.name || object.label, ...(kind === 'racks' || kind === 'zones' ? { locationId: null } : {}) })}><option value="">시각 객체로만 사용</option>{draft[kind].map(r => <option key={r.clientId} value={r.clientId} disabled={kind === 'racks' && doc.objects.some(o => o.id !== object.id && o.rackId === r.clientId)}>{r.code || '코드 미입력'} · {r.name}</option>)}</select></label></div>
            {row ? <WorkspaceStructureFields concise endpoint={endpoint} kind={kind} value={row} actions={kind === 'racks' ? <button type="button" className="secondary" onClick={() => setRack(row.clientId)}>보관 위치 관리</button> : undefined} zones={draft.zones} disabled={!editable} fill={kind==='racks'?object.fill:undefined} onFill={kind==='racks'?fill=>update({fill}):undefined} rotation={object.rotation} onRotate={kind==='racks'?rotation=>update({rotation}):undefined} onChange={patch => changeRow(kind, row.clientId, patch)} /> : <button type="button" className="secondary" disabled={!editable || !canCreate} onClick={() => { const next = addStructure(kind, object); update({ [ref]: next.clientId }) }}>새 {kindLabel[kind]} 정보 입력</button>}
          </div>
        }} />}
      </div>
      <details open={!mobileEditor} className="workspace-structure-list" aria-label="창고 구조 목록"><summary>전체 보관 구조 <small>랙 {draft.racks.length}개 · 보관 위치 {draft.racks.reduce((count,row)=>count+row.levels*row.bays, draft.floorLocations.length)}개</small></summary>
        <div className="workspace-structure-tree">
          {draft.zones.map(zone => renderStructure('zones',zone,<div className="workspace-tree-children">{draft.racks.filter(r=>r.zoneClientId===zone.clientId).map(r=>renderStructure('racks',r))}{draft.floorLocations.filter(l=>l.zoneClientId===zone.clientId).map(l=>renderStructure('floorLocations',l))}</div>))}
          {(draft.racks.some(r=>!r.zoneClientId)||draft.floorLocations.some(l=>!l.zoneClientId))&&<div className="workspace-unassigned"><h4>구역 없음</h4>{draft.racks.filter(r=>!r.zoneClientId).map(r=>renderStructure('racks',r))}{draft.floorLocations.filter(l=>!l.zoneClientId).map(l=>renderStructure('floorLocations',l))}</div>}
        </div>
      </details>
      </div>
    </form>
    {warehouseId && error && <div className="wizard-utilities"> <button type="button" className="text-button" disabled={busy} onClick={() => requestNavigation(onReload)}>최신 정보 다시 불러오기</button></div>}
    {importing&&!warehouseId&&<PlanImportDialog endpoint={endpoint.replace(/\/warehouses$/,'/plan-imports')} onClose={()=>setImporting(false)} onApply={document=>{setImporting(false);requestTemplate(document)}}/>}
    {templateMode&&<WarehouseTemplateDialog endpoint={endpoint.replace(/\/warehouses$/,'/warehouse-templates')} mode={templateMode} document={templateFromWorkspace(draft,doc)} canUpdate={canUpdate} onApply={requestTemplate} onClose={()=>setTemplateMode(null)}/>}
    {replacement&&<OrganizationDialog confirmation title="작성 중인 도면 교체" size="small" onClose={()=>setReplacement(null)}><p>현재 도면과 임시 구역·랙 설정을 교체합니다. 창고 기본 정보는 유지되며 아직 DB에 저장하지 않습니다.</p><div className="dialog-actions"><button type="button" className="secondary" onClick={()=>setReplacement(null)}>계속 편집</button><button type="button" className="primary" onClick={()=>applyTemplate(replacement)}>변경 버리고 계속</button></div></OrganizationDialog>}
    {confirm && <OrganizationDialog confirmation title="창고 및 도면 저장 확인" busy={busy} onClose={() => setConfirm(false)}><p>창고 기본 정보, 구역 {draft.zones.length}개, 랙 {draft.racks.length}개, 바닥 위치 {draft.floorLocations.length}개와 도면을 함께 저장하시겠습니까?</p><p>일부라도 실패하면 이번 저장 전체를 취소하고 기존 데이터는 유지합니다.</p>{unlinked.length > 0 && <p>실제 구조에 연결되지 않은 객체 {unlinked.length}개({unlinked.map(o => o.label).join(', ')})는 시각 객체로만 저장합니다. 연결하려면 취소 후 속성에서 선택하세요.</p>}<button type="button" className="secondary" disabled={busy} onClick={() => setConfirm(false)}>취소</button>{' '}<button type="button" className="primary" disabled={busy || !allowed} onClick={() => save(workspaceRequest(draft, doc, planVersion, hadPlan, crypto.randomUUID()))}>{busy ? '저장 중…' : '확인'}</button></OrganizationDialog>}
    {navigation.blocked && <OrganizationDialog confirmation title="저장하지 않은 창고 작업" onClose={navigation.stay}><UnsavedChangesContent stay={navigation.stay} discard={navigation.discard} message={attempt ? '저장 결과가 확인되지 않은 상태로 이동하시겠습니까?' : '입력한 창고 정보와 도면 변경사항을 버리고 이동하시겠습니까?'} detail={attempt ? '나중에 창고 목록에서 저장 결과를 확인해 주세요.' : '저장하지 않은 내용은 복구할 수 없습니다.'} /></OrganizationDialog>}
    {editingRow && editValue && <OrganizationDialog title={`${kindLabel[editingRow.kind]} 정보 수정`} actions={<><button type="button" className="primary" disabled={!editable} onClick={() => setEditingRow(null)}>입력 완료</button><button type="button" className="secondary" onClick={() => setEditingRow(null)}>닫기</button></>} onClose={() => setEditingRow(null)}>{error && <p role="alert" className="alert error">{error}</p>}<WorkspaceStructureFields endpoint={endpoint} kind={editingRow.kind} value={editValue} zones={draft.zones} disabled={!editable} onChange={patch => changeRow(editingRow.kind, editValue.clientId, patch)} /></OrganizationDialog>}
    {removingRow && <OrganizationDialog confirmation title="미저장 구조 항목 제거" onClose={() => setRemovingRow(null)}><p>이 항목을 최종 저장 대상에서 제외합니다. 연결된 도면 객체는 시각 객체로 남습니다.</p><button type="button" className="secondary" onClick={() => setRemovingRow(null)}>취소</button>{' '}<button type="button" className="primary" onClick={removeStructure}>제외</button></OrganizationDialog>}
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
  const physical: StorageItem = { barcode: barcodeInputValue(rack.barcodeChange, rack.barcode), id: rack.id || rack.clientId, code: rack.code, name: rack.name, levels: rack.levels, bays: rack.bays, isActive: rack.isActive, version: rack.version, createdAt: '', updatedAt: '' }
  return <RackFrontDialog preview={{ rack: physical, locations: locations.map(location => ({ location, effectiveActive: active && location.isActive })), inventoryAvailable: false }} onClose={onClose} />
}

function WorkspaceStructureRow({row,kind,selected,childSelected=false,rackCount=0,endpoint,onSelect,actions,children}:{row:DraftStructure;kind:StructureKind;selected:boolean;childSelected?:boolean;rackCount?:number;endpoint?:string;onSelect:()=>void;actions:ReactNode;children?:ReactNode}) {
  const active=selected||childSelected
  const [expanded,setExpanded]=useStorageExpansion(active,kind==='zones')
  const [existing,setExisting]=useState<StorageItem[]|null>(row.id?null:[]),[error,setError]=useState('')
  useEffect(()=>{
    if(kind!=='racks'||!expanded||!row.id||!endpoint)return
    let live=true
    api<RackFrontData>(`${endpoint}/racks/${row.id}/front`).then(data=>{if(live){setExisting(data.locations.map(l=>l.location));setError('')}}).catch(e=>{if(live)setError(e.message)})
    return()=>{live=false}
  },[kind,expanded,row.id,endpoint])
  return <StorageTreeNode name={row.name} code={row.code} kind={kind==='zones'?'zone':kind==='racks'?'rack':'location'} selected={selected} expanded={expanded} onExpanded={setExpanded} onSelect={onSelect} summary={kind==='racks'?`${row.levels}단 × ${row.bays}칸 · 위치 ${row.levels*row.bays}개`:kind==='zones'?`랙 ${rackCount}개`:''} actions={actions}>{children}{kind==='racks'&&(error?<p role="alert">{error}</p>:existing?<ul className="workspace-location-codes">{previewRack(row,existing).map(location=><li key={location.id}>{location.name || `${location.level}단 ${location.bay}칸`} <small>{location.code}</small>{!location.isActive?' · 미사용':''}</li>)}</ul>:<p>위치 조회 중…</p>)}</StorageTreeNode>
}
