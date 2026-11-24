import { t as uiText } from '../../i18n.ts'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { MoreHorizontal, X, Copy, Trash2, Undo2, Redo2, ZoomIn, ZoomOut, Scan, Hand, MousePointer2, BrickWall, DoorOpen, Route, SquareDashed, Columns3, Type, BringToFront, SendToBack } from 'lucide-react'
import { orderPlanObjects, createPlanObject, deletePlanObjects, duplicatePlanObjects, editPlan, planLabels, redoPlan, undoPlan } from '../../warehouse-plan-model'
import type { PlanDocument, PlanHistory, PlanObject, PlanType } from '../../warehouse-plan-model'
import PlanCanvas from './PlanCanvas'
import PlanColorField from './PlanColorField'
import { rotationChangeError } from '../../plan-rotation'
import type { RackLabelInfo } from '../../rack-label-position'
import type { PlanCanvasHandle } from './PlanCanvas'
import OrganizationDialog from './OrganizationDialog'
import { useMobile } from '../../use-mobile'
import './warehouse-plan.css'

export type PlanEditorSurfaceProps = {
  onDeleteObjects?: (ids:string[])=>void
  onRackDimensionsChange?: (rackId:string,patch:Partial<Pick<RackLabelInfo,'levels'|'bays'>>)=>void
  rackInformation?: Record<string,RackLabelInfo>
  history: PlanHistory; onHistory: Dispatch<SetStateAction<PlanHistory>>
  selected: string[]; onSelect: (ids: string[]) => void; editable: boolean
  onOpenRack: (id: string) => void; onAddObject?: (object: PlanObject) => PlanObject
  renderProperties?: (item: PlanObject, update: (patch: Partial<PlanObject>) => void) => ReactNode
  creationPanel?: ReactNode; onRequestAdd?: (type:PlanType,x:number,y:number)=>boolean; customRackProperties?:boolean; transientLinks?:boolean;
  studio?: boolean; toolbar?: ReactNode; onNotice?: (message: string) => void
}

// Shared editing UI for saved warehouse plans and unsaved aggregate workspaces. No API calls.
export default function PlanEditorSurface({ onDeleteObjects, onRackDimensionsChange, rackInformation, history, onHistory, selected, onSelect, editable, onOpenRack, onAddObject, renderProperties, toolbar, onNotice, studio = false, creationPanel, onRequestAdd, customRackProperties, transientLinks = false }: PlanEditorSurfaceProps) {
  const mobile=useMobile(), mobileStudio=studio&&mobile
  const [more,setMore]=useState(false),[activeTool,setActiveTool]=useState<PlanType|'location'>(),[creationCollapsed,setCreationCollapsed]=useState(false)
  const mobileTools=useRef<HTMLElement>(null),moreButton=useRef<HTMLButtonElement>(null),extraPanel=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(!more||!mobileStudio)return
    const outside=(e:PointerEvent)=>{if(!mobileTools.current?.contains(e.target as Node))setMore(false)}
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMore(false);moreButton.current?.focus()}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[more,mobileStudio])
  useLayoutEffect(()=>{if(!more||!mobileStudio)return
    function position(){const anchor=mobileTools.current?.getBoundingClientRect(),panel=extraPanel.current;if(!anchor||!panel)return
      const below=window.innerHeight-anchor.bottom-8,above=anchor.top-8,up=below<160&&above>below
      panel.style.top=up?'auto':'100%';panel.style.bottom=up?'100%':'auto';panel.style.maxHeight=`${Math.max(60,Math.min(360,up?above:below))}px`
    }
    position();window.addEventListener('resize',position);window.addEventListener('scroll',position,true)
    return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true)}
  },[more,mobileStudio])
  const [collapsedSelection, setCollapsedSelection] = useState<string | null>(null)
  const selectionKey = selected.join(',')
  const propertiesVisible = selected.length > 0 && collapsedSelection !== selectionKey
  const [grid, setGrid] = useState(true), [snap, setSnap] = useState(true), [pan, setPan] = useState(false)
  const [removing, setRemoving] = useState<string[] | null>(null), [error, setError] = useState('')
  const canvas = useRef<PlanCanvasHandle>(null)
  const [rotationPreview,setRotationPreview] = useState<{id:string;rotation:number}|null>(null)
  const doc = history.present, savedItem = selected.length === 1 ? doc.objects.find(o => o.id === selected[0]) : undefined
  const item = savedItem && rotationPreview?.id===savedItem.id ? {...savedItem,rotation:rotationPreview.rotation} : savedItem
  function commit(next: PlanDocument) {
    setRotationPreview(null)
    if (!editable) return
    const problem=rotationChangeError(doc,next)
    if(problem){setError(problem);return}
    onHistory(h => editPlan(h,next));setError('')
  }
  function add(type: PlanType, x = .5, y = .5) {
    if (!editable) return
    if(mobileStudio){setMore(false);setPan(false);setActiveTool(type);setCreationCollapsed(false);setCollapsedSelection(null)}
    if (doc.objects.length >= 500) { setError('도면당 최대 500개 객체를 사용할 수 있습니다.'); return }
    if (onRequestAdd && !onRequestAdd(type,x,y)) return
    const raw = createPlanObject(type, crypto.randomUUID(), x, y), object = onAddObject ? onAddObject(raw) : raw
    commit({ ...doc, objects: [...doc.objects, object] }); onSelect([object.id])
  }
  function duplicate() {
    if (!editable || !selected.length) return
    if (doc.objects.length + selected.filter(id => doc.objects.some(o => o.id === id)).length > 500) { setError('복제 후 객체 수가 최대 500개를 넘습니다.'); return }
    const next = duplicatePlanObjects(doc, selected, () => crypto.randomUUID()); commit(next); onSelect(next.objects.slice(doc.objects.length).map(o => o.id))
  }
  function remove() {
    if (!editable) return
    if (onDeleteObjects && doc.objects.some(o=>selected.includes(o.id)&&(o.type==='rack'||o.type==='zone'))) { onDeleteObjects([...selected]); return }
    if (!transientLinks && doc.objects.some(o => selected.includes(o.id) && (o.rackId || o.zoneId || o.locationId))) { setRemoving([...selected]); return }
    commit(deletePlanObjects(doc, selected)); onSelect([])
  }
  function update(patch: Partial<PlanObject>) { if (item) commit({ ...doc, objects: doc.objects.map(o => o.id === item.id ? { ...o, ...patch } : o) }) }
  return <div className={`plan-editor-surface ${studio ? 'plan-studio' : ''} ${mobileStudio ? 'mobile-plan-studio' : ''}`} onKeyDown={e => {
    const target = e.target as HTMLElement
    if (!editable || target.closest('dialog') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); onHistory(h => e.shiftKey ? redoPlan(h) : undoPlan(h)) }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); onHistory(redoPlan) }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate() }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove() }
  }}>
    {error && <p role="alert" className="alert error">{uiText(error)}</p>}
    {mobileStudio && <nav ref={mobileTools} className="mobile-plan-tools" aria-label={uiText("모바일 배치 도구")}>
      <div className="mobile-plan-primary">
        <button type="button" aria-label={uiText("객체 선택")} aria-pressed={!pan&&!activeTool} onClick={()=>{setPan(false);setActiveTool(undefined);setMore(false)}}><MousePointer2 size={18}/><span>{uiText("선택")}</span></button>
        <button type="button" aria-label={uiText("화면 이동")} aria-pressed={pan} onClick={()=>{setPan(true);setActiveTool(undefined);setMore(false)}}><Hand size={18}/><span>{uiText("이동")}</span></button>
        {([['rack',Columns3],['zone',SquareDashed],['door',DoorOpen]] as const).map(([type,Icon])=><button key={type} type="button" aria-label={uiText("{v0} 추가", { v0: planLabels[type] })} aria-pressed={!pan&&activeTool===type} disabled={!editable} onClick={()=>add(type)}><Icon size={18}/><span>{type==='door' ? uiText("출입구") : uiText(planLabels[type])}</span></button>)}
        <button ref={moreButton} type="button" aria-label={uiText("더보기")} aria-expanded={more} onClick={()=>setMore(v=>!v)}><MoreHorizontal size={18}/><span>{!pan&&activeTool&&['wall','aisle','text','location'].includes(activeTool) ? activeTool==='location' ? uiText("보관위치") : uiText(planLabels[activeTool]) : uiText("더보기")}</span></button>
      </div>
      {more&&<div ref={extraPanel} className="mobile-plan-extra" role="group" aria-label={uiText("추가 도구")}>
        <div className="mobile-plan-extra-grid">
          {([['wall',BrickWall],['aisle',Route],['text',Type]] as const).map(([type,Icon])=><button key={type} type="button" disabled={!editable} aria-label={uiText("{v0} 추가", { v0: planLabels[type] })} onClick={()=>add(type)}><Icon size={18}/><span>{uiText(planLabels[type])}</span></button>)}
          {toolbar&&<div className="mobile-plan-custom-tool" onClick={e=>{if((e.target as HTMLElement).closest('button:not(:disabled)')){setMore(false);setPan(false);setActiveTool('location');setCollapsedSelection(null)}}}>{toolbar}</div>}
          <button type="button" aria-label={uiText("삭제")} disabled={!editable||!selected.length} onClick={()=>{setMore(false);remove()}}><Trash2 size={18}/><span>{uiText("삭제")}</span></button>
        </div>
        {!!selected.length&&<div className="mobile-plan-object-actions">
          <button type="button" disabled={!editable} onClick={()=>{setMore(false);duplicate()}}><Copy size={16}/>{uiText("복제")}</button>
          <button type="button" disabled={!editable} onClick={()=>{setMore(false);commit(orderPlanObjects(doc,selected,true))}}><BringToFront size={16}/>{uiText("맨 앞으로")}</button>
          <button type="button" disabled={!editable} onClick={()=>{setMore(false);commit(orderPlanObjects(doc,selected,false))}}><SendToBack size={16}/>{uiText("맨 뒤로")}</button>
        </div>}
        <div className="plan-grid-options"><label><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)}/>{uiText("격자")}</label><label><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/>{uiText("자동 정렬")}</label></div>
        <details><summary>{uiText("도움말")}</summary><p>{uiText("도구를 누르면 객체를 추가합니다. 객체를 선택해 이동·회전하거나 속성을 수정하세요. 출입구와 빈 공간으로 동선을 계산합니다. 통로는 선택 사항이며 랙·벽·일반 도형은 통행할 수 없습니다.")}</p></details>
      </div>}
    </nav>}
    {studio && !mobileStudio && <nav className="studio-tool-rail" aria-label={uiText("배치 도구")}>
      <button type="button" title={uiText("객체 선택")} aria-label={uiText("객체 선택")} aria-pressed={!pan} onClick={() => setPan(false)}><MousePointer2 size={20} /><span>{uiText("선택")}</span></button>
      <button type="button" title={uiText("화면 이동")} aria-label={uiText("화면 이동")} aria-pressed={pan} onClick={() => setPan(true)}><Hand size={20} /><span>{uiText("이동")}</span></button>
      <hr />
      {([['wall', BrickWall], ['door', DoorOpen], ['aisle', Route], ['zone', SquareDashed], ['rack', Columns3]] as const).map(([type, Icon]) => <button type="button" key={type} title={uiText("{v0} 추가 · 끌어 놓기", { v0: planLabels[type] })} aria-label={uiText("{v0} 추가", { v0: planLabels[type] })} disabled={!editable} draggable={editable} onDragStart={e => e.dataTransfer.setData('application/wms-plan', type)} onClick={() => { setPan(false); add(type) }}><Icon size={20} /><span>{type === 'door' ? uiText("출입구") : uiText(planLabels[type])}</span></button>)}
      {toolbar}
      <button type="button" title={uiText("텍스트 추가")} aria-label={uiText("텍스트 추가")} disabled={!editable} onClick={() => add('text')}><Type size={20}/><span className="studio-tool-label-full">{uiText("텍스트 추가")}</span><span className="studio-tool-label-compact" aria-hidden="true">{uiText("텍스트")}</span></button>
      <hr /><button type="button" title={uiText("선택 객체 삭제")} aria-label={uiText("삭제")} disabled={!editable || !selected.length} onClick={remove}><Trash2 size={19} /><span>{uiText("삭제")}</span></button>
    </nav>}
    <div className="studio-main">
    <div className="plan-toolbar plan-command-bar" aria-label={uiText("도면 도구")}>
      {!studio && <div className="plan-tool-group">
        <button type="button" className="secondary" title={uiText("객체 선택")} aria-label={uiText("객체 선택")} aria-pressed={!pan} onClick={() => setPan(false)}><MousePointer2 size={16} /></button>
        <button type="button" className="secondary" title={uiText("화면 이동")} aria-label={uiText("화면 이동")} aria-pressed={pan} onClick={() => setPan(true)}><Hand size={16} /></button>
      </div>}
      {!studio && <div className="plan-tool-group plan-add-tools">{(['wall', 'door', 'aisle', 'zone', 'rack'] as PlanType[]).map(type => <button type="button" key={type} className="secondary" aria-label={uiText("{v0} 추가", { v0: planLabels[type] })} title={uiText("{v0} 추가 · 도면으로 끌어 놓기", { v0: planLabels[type] })} disabled={!editable} draggable={editable} onDragStart={e => e.dataTransfer.setData('application/wms-plan', type)} onClick={() => add(type)}>{uiText(planLabels[type])}</button>)}{toolbar}</div>}
      <div className="plan-tool-group plan-history-tools">
        <button type="button" className="secondary" title={uiText("실행 취소 (Ctrl/⌘+Z)")} aria-label={uiText("도면 실행 취소")} disabled={!editable || !history.past.length} onClick={() => onHistory(undoPlan)}><Undo2 size={16} /></button>
        <button type="button" className="secondary" title={uiText("다시 실행 (Ctrl/⌘+Shift+Z)")} aria-label={uiText("도면 다시 실행")} disabled={!editable || !history.future.length} onClick={() => onHistory(redoPlan)}><Redo2 size={16} /></button>
        {!studio && <button type="button" className="secondary" title={uiText("선택 객체 삭제")} aria-label={uiText("삭제")} disabled={!editable || !selected.length} onClick={remove}><Trash2 size={16} /></button>}
      </div>
      <div className="plan-tool-group plan-viewport-tools">
        <button type="button" className="secondary" title={uiText("축소")} aria-label={uiText("도면 축소")} onClick={() => canvas.current?.zoom(.8)}><ZoomOut size={16} /></button>
        <button type="button" className="secondary" title={uiText("확대")} aria-label={uiText("도면 확대")} onClick={() => canvas.current?.zoom(1.25)}><ZoomIn size={16} /></button>
        <button type="button" className="secondary" title={uiText("화면 맞춤")} aria-label={uiText("도면 화면 맞춤")} onClick={() => canvas.current?.fit()}><Scan size={16} /></button>
      </div>
      {!mobileStudio && <><div className="plan-tool-group plan-object-tools">
        {!studio && <button type="button" className="secondary" disabled={!editable} onClick={() => add('text')}><Type size={16}/>{uiText("텍스트 추가")}</button>}
        <button type="button" className="secondary" title={uiText("복제")} disabled={!editable || !selected.length} onClick={duplicate}><Copy size={16}/>{uiText("복제")}</button>
        <button type="button" className="secondary" title={uiText("맨 앞으로")} disabled={!editable || !selected.length} onClick={() => commit(orderPlanObjects(doc, selected, true))}><BringToFront size={16}/>{uiText("맨 앞으로")}</button>
        <button type="button" className="secondary" title={uiText("맨 뒤로")} disabled={!editable || !selected.length} onClick={() => commit(orderPlanObjects(doc, selected, false))}><SendToBack size={16}/>{uiText("맨 뒤로")}</button>
      </div>
      <div className="plan-tool-group plan-grid-options"><label><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)}/>{uiText("격자")}</label><label><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)}/>{uiText("자동 정렬")}</label></div></>}
    </div>
    {(!mobileStudio||creationPanel||selected.length>0) && <div className="plan-context-bar">
      {creationPanel&&mobileStudio ? <button type="button" className="text-button" onClick={()=>setCreationCollapsed(v=>!v)}>{creationCollapsed ? uiText("랙 생성 설정 열기") : uiText("랙 생성 설정 접기")}</button> : !selected.length ? !mobileStudio&&<p className="organization-help">{uiText("출입구와 빈 공간으로 동선을 계산합니다. 통로는 선택 사항이며 랙·벽·일반 도형은 통행할 수 없습니다.")}</p> : <button type="button" className="text-button" aria-expanded={propertiesVisible} onClick={() => setCollapsedSelection(propertiesVisible ? selectionKey : null)}>{propertiesVisible ? uiText("속성 접기") : uiText("속성 열기")} · {selected.length}{uiText("개 선택")}</button>}
    </div>}
    <div className={`plan-workbench ${propertiesVisible || creationPanel ? 'has-properties' : ''}`}>
      <PlanCanvas onRotationPreview={setRotationPreview} editorRackInformation={rackInformation} onRackDimensionsChange={onRackDimensionsChange&&item?.rackId?patch=>onRackDimensionsChange(item.rackId!,patch):undefined} selectedRackInfo={item?.type==='rack'&&item.rackId&&rackInformation?.[item.rackId]?{objectId:item.id,...rackInformation[item.rackId]}:undefined} ref={canvas} document={doc} editing={editable} selected={selected} grid={grid} snap={snap} pan={pan} onSelect={onSelect} onChange={commit} onOpenRack={onOpenRack} onAdd={add} />
      {creationPanel && (!mobileStudio||!creationCollapsed) && <aside className="plan-properties" aria-label={uiText("랙 생성 설정")}>{mobileStudio && <button type="button" className="mobile-plan-properties-close" aria-label={uiText("랙 생성 설정 접기")} onClick={()=>setCreationCollapsed(true)}><X size={18}/></button>}{creationPanel}</aside>}
      {!creationPanel && propertiesVisible && <aside className="plan-properties" aria-label={uiText("선택 객체 속성")}>{mobileStudio && <button type="button" className="mobile-plan-properties-close" aria-label={uiText("속성 패널 닫기")} onClick={()=>setCollapsedSelection(selectionKey)}><X size={18}/></button>}<h3>{item ? (item.type === 'rack' ? uiText("랙 설정") : uiText(planLabels[item.type] + ' 설정')) : uiText("{v0}개 객체 선택", { v0: selected.length })}</h3>
        {item ? <div key={item.id}>
          {renderProperties?.(item, update)}
          {item.type === 'rack' && !customRackProperties && <label>{uiText("방향 (°)")}<input aria-label={uiText("객체 회전")} type="number" disabled={!editable} min={-180} max={180} step={.01} value={Math.round(item.rotation * 100) / 100} onChange={e => { if (e.target.value && e.target.validity.valid) update({ rotation: Number(e.target.value) }) }} /></label>}
          <section className="plan-geometry" aria-label={uiText("배치·색상")}><fieldset disabled={!editable}>
            {!((item.type === 'rack' && item.rackId) || (customRackProperties && (item.zoneId || item.locationId))) && <label>{item.type === 'rack' ? uiText("랙명") : uiText("객체 이름")}<input aria-label={uiText("객체 이름")} maxLength={200} value={item.label} onChange={e => update({ label: e.target.value })} /></label>}
            <div className="plan-geometry-grid">{(['x', 'y', 'width', 'height', ...(item.type === 'rack' ? [] : ['rotation'])] as const).map(raw => { const key = raw as 'x' | 'y' | 'width' | 'height' | 'rotation'; return <label key={key}>{({ x: '가로 위치 (%)', y: '세로 위치 (%)', width: '너비 (%)', height: '높이 (%)', rotation: '회전 (°)' })[key]}<input aria-label={key === 'rotation' ? uiText("객체 회전") : uiText("객체 {v0}", { v0: key })} type="number" step={.01} min={key === 'rotation' ? -180 : key === 'width' || key === 'height' ? .5 : 0} max={key === 'rotation' ? 180 : 100} value={Math.round(item[key] * (key === 'rotation' ? 1 : 100) * 100) / 100} onChange={e => { if (e.target.value && e.target.validity.valid) update({ [key]: Number(e.target.value) / (key === 'rotation' ? 1 : 100) }) }} /></label> })}</div>
            {!(customRackProperties && item.type==='rack' && item.rackId) && <PlanColorField value={item.fill} onChange={fill=>update({fill})} disabled={!editable}/>}
            {item.type === 'shape' && !item.locationId && <label>{uiText("도형")}<select aria-label={uiText("도형 종류")} value={item.shape} onChange={e => update({ shape: e.target.value as PlanObject['shape'] })}><option value="rectangle">{uiText("사각형")}</option><option value="ellipse">{uiText("타원")}</option></select></label>}
          </fieldset></section>
        </div> : <p className="organization-help">{uiText("여러 객체를 함께 이동하거나 삭제할 수 있습니다. 개별 속성을 수정하려면 한 객체를 선택하세요.")}</p>}
      </aside>}
    </div>
    </div>
    {removing && <OrganizationDialog confirmation size="small" title={uiText("도면 객체 연결 해제")} onClose={() => setRemoving(null)}><p>{uiText("선택한 도면 객체와 연결만 제거합니다. 구역·랙·보관 위치는 구조 목록에 유지됩니다. 등록 전 항목도 제외하려면 구조 목록에서 임시 항목을 제거하세요.")}</p><button type="button" className="secondary" onClick={() => setRemoving(null)}>{uiText("취소")}</button>{' '}<button type="button" className="primary" disabled={!editable} onClick={() => { commit(deletePlanObjects(doc, removing)); onSelect([]); setRemoving(null); onNotice?.('도면 객체만 제거했습니다. 구조와 위치 ID는 유지됩니다.') }}>{uiText("도면 객체만 제거")}</button></OrganizationDialog>}
  </div>
}
