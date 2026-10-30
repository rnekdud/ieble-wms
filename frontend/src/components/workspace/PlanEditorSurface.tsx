import { useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Copy, Trash2, Undo2, Redo2, ZoomIn, ZoomOut, Scan, Hand, MousePointer2 } from 'lucide-react'
import { createPlanObject, deletePlanObjects, duplicatePlanObjects, editPlan, planLabels, redoPlan, undoPlan } from '../../warehouse-plan-model'
import type { PlanDocument, PlanHistory, PlanObject, PlanType } from '../../warehouse-plan-model'
import PlanCanvas from './PlanCanvas'
import type { PlanCanvasHandle } from './PlanCanvas'
import OrganizationDialog from './OrganizationDialog'
import './warehouse-plan.css'

export type PlanEditorSurfaceProps = {
  history: PlanHistory; onHistory: Dispatch<SetStateAction<PlanHistory>>
  selected: string[]; onSelect: (ids: string[]) => void; editable: boolean
  onOpenRack: (id: string) => void; onAddObject?: (object: PlanObject) => PlanObject
  renderProperties?: (item: PlanObject, update: (patch: Partial<PlanObject>) => void) => ReactNode
  toolbar?: ReactNode; onNotice?: (message: string) => void
}

// Shared editing UI for saved warehouse plans and unsaved aggregate workspaces. No API calls.
export default function PlanEditorSurface({ history, onHistory, selected, onSelect, editable, onOpenRack, onAddObject, renderProperties, toolbar, onNotice }: PlanEditorSurfaceProps) {
  const [grid, setGrid] = useState(true), [snap, setSnap] = useState(true), [pan, setPan] = useState(false)
  const [removing, setRemoving] = useState<string[] | null>(null), [error, setError] = useState('')
  const canvas = useRef<PlanCanvasHandle>(null)
  const doc = history.present, item = selected.length === 1 ? doc.objects.find(o => o.id === selected[0]) : undefined
  function commit(next: PlanDocument) { if (editable) { onHistory(h => editPlan(h, next)); setError('') } }
  function add(type: PlanType, x = .5, y = .5) {
    if (!editable) return
    if (doc.objects.length >= 500) { setError('도면당 최대 500개 객체를 사용할 수 있습니다.'); return }
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
    if (doc.objects.some(o => selected.includes(o.id) && (o.rackId || o.zoneId || o.locationId))) { setRemoving([...selected]); return }
    commit(deletePlanObjects(doc, selected)); onSelect([])
  }
  function update(patch: Partial<PlanObject>) { if (item) commit({ ...doc, objects: doc.objects.map(o => o.id === item.id ? { ...o, ...patch } : o) }) }
  return <div className="plan-editor-surface" onKeyDown={e => {
    const target = e.target as HTMLElement
    if (!editable || target.closest('dialog') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); onHistory(h => e.shiftKey ? redoPlan(h) : undoPlan(h)) }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); onHistory(redoPlan) }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate() }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove() }
  }}>
    {error && <p role="alert" className="alert error">{error}</p>}
    <div className="plan-toolbar" aria-label="도면 도구">
      {toolbar}
      <button type="button" className="secondary" aria-label="도면 실행 취소" disabled={!editable || !history.past.length} onClick={() => onHistory(undoPlan)}><Undo2 size={16} /></button>
      <button type="button" className="secondary" aria-label="도면 다시 실행" disabled={!editable || !history.future.length} onClick={() => onHistory(redoPlan)}><Redo2 size={16} /></button>
      <button type="button" className="secondary" aria-label="도면 축소" onClick={() => canvas.current?.zoom(.8)}><ZoomOut size={16} /></button>
      <button type="button" className="secondary" aria-label="도면 확대" onClick={() => canvas.current?.zoom(1.25)}><ZoomIn size={16} /></button>
      <button type="button" className="secondary" onClick={() => canvas.current?.fit()}><Scan size={16} />도면 화면 맞춤</button>
      <button type="button" className="secondary" aria-pressed={pan} onClick={() => setPan(p => !p)}>{pan ? <Hand size={16} /> : <MousePointer2 size={16} />}화면 이동</button>
      <label><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} />격자</label>
      <label><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} />자동 정렬</label>
    </div>
    <p className="organization-help">도구를 클릭하거나 끌어 놓으세요. Shift+클릭 또는 빈 곳 드래그로 여러 객체 선택 · Ctrl/⌘+휠 확대 · 연결된 랙 클릭은 정면도</p>
    <div className="plan-workbench">
      <div className="plan-tools" aria-label="도면 객체 도구"><h3>객체 도구</h3>
        {(Object.keys(planLabels) as PlanType[]).map(type => <button type="button" key={type} className="secondary" disabled={!editable} draggable={editable} onDragStart={e => e.dataTransfer.setData('application/wms-plan', type)} onClick={() => add(type)}>{planLabels[type]} 추가</button>)}
        <h3>객체 {doc.objects.length}개</h3><div className="plan-object-list">{doc.objects.map(o => <button type="button" key={o.id} className="text-button" aria-pressed={selected.includes(o.id)} onClick={e => onSelect(e.shiftKey ? [...new Set([...selected, o.id])] : [o.id])}>{o.label || planLabels[o.type]}</button>)}</div>
      </div>
      <PlanCanvas ref={canvas} document={doc} editing={editable} selected={selected} grid={grid} snap={snap} pan={pan} onSelect={onSelect} onChange={commit} onOpenRack={onOpenRack} onAdd={add} />
      <div className="plan-properties" aria-label="선택 객체 속성"><h3>객체 속성</h3><p>{selected.length ? `${selected.length}개 선택` : '객체를 선택하세요.'}</p>
        <div className="plan-actions"><button type="button" className="secondary" disabled={!editable || !selected.length} onClick={duplicate}><Copy size={14} />복제</button><button type="button" className="secondary" disabled={!editable || !selected.length} onClick={remove}><Trash2 size={14} />삭제</button></div>
        {item && <>
          {renderProperties?.(item, update)}
          <details className="plan-geometry" open={item.type !== 'rack' && item.type !== 'zone' && !item.locationId}><summary>배치·색상</summary>
            <fieldset disabled={!editable}>
              <label>이름 / 텍스트<input aria-label="객체 이름" maxLength={200} value={item.label} onChange={e => update({ label: e.target.value })} /></label>
              {(['x', 'y', 'width', 'height', 'rotation'] as const).map(key => <label key={key}>{({ x: '가로 위치 (%)', y: '세로 위치 (%)', width: '너비 (%)', height: '높이 (%)', rotation: '회전 (°)' })[key]}<input aria-label={key === 'rotation' ? '객체 회전' : `객체 ${key}`} type="number" step={key === 'rotation' ? 1 : .1} min={key === 'rotation' ? -180 : key === 'width' || key === 'height' ? .5 : 0} max={key === 'rotation' ? 180 : 100} value={Math.round(item[key] * (key === 'rotation' ? 1 : 100) * 100) / 100} onChange={e => { if (e.target.value && e.target.validity.valid) update({ [key]: Number(e.target.value) / (key === 'rotation' ? 1 : 100) }) }} /></label>)}
              <label>색상<input type="color" aria-label="객체 색상" value={item.fill} onChange={e => update({ fill: e.target.value })} /></label>
              {item.type === 'shape' && <label>도형<select aria-label="도형 종류" value={item.shape} onChange={e => update({ shape: e.target.value as PlanObject['shape'] })}><option value="rectangle">사각형</option><option value="ellipse">타원</option></select></label>}
            </fieldset>
          </details>
          <p className="organization-help">도면 이동·크기 변경은 실제 보관 위치를 이동하거나 삭제하지 않습니다.</p>
        </>}
      </div>
    </div>
    {removing && <OrganizationDialog title="도면 객체 연결 해제" onClose={() => setRemoving(null)}><p>선택한 도면 객체와 연결만 제거합니다. 구역·랙·보관 위치는 구조 목록에 유지됩니다. 등록 전 항목도 제외하려면 구조 목록에서 임시 항목을 제거하세요.</p><button type="button" className="secondary" onClick={() => setRemoving(null)}>취소</button>{' '}<button type="button" className="primary" disabled={!editable} onClick={() => { commit(deletePlanObjects(doc, removing)); onSelect([]); setRemoving(null); onNotice?.('도면 객체만 제거했습니다. 구조와 위치 ID는 유지됩니다.') }}>도면 객체만 제거</button></OrganizationDialog>}
  </div>
}
