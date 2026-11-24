import { t as uiText } from '../../i18n.ts'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Scan, ZoomIn, ZoomOut, Hand, Pencil } from 'lucide-react'
import { api } from '../../api'
import type { PlanResponse } from '../../warehouse-plan-model'
import type { WarehouseDetailData } from '../../types/warehouse'
import PlanCanvas from './PlanCanvas'
import type { PlanCanvasHandle } from './PlanCanvas'
import WarehouseWorkspaceEditor from './WarehouseWorkspaceEditor'
import RackFrontDialog, { RackFrontDetails } from './RackFrontDialog'
import './warehouse-plan.css'

const Warehouse3DView = lazy(() => import('./Warehouse3DView'))
type Props = { endpoint: string; warehouse: WarehouseDetailData; revision: number; canUpdate: boolean; canDelete?:boolean; canCreate: boolean; onChanged: () => void }
export default function WarehousePlanPanel({ endpoint, warehouse, revision, canUpdate, canDelete, canCreate, onChanged }: Props) {
  const [plan, setPlan] = useState<PlanResponse | null>(null), [error, setError] = useState(''), [editing, setEditing] = useState(false)
  const [refresh, setRefresh] = useState(0), [selected, setSelected] = useState<string[]>([]), [pan, setPan] = useState(false), [rack, setRack] = useState<string | null>(null)
  const [view, setView] = useState<'2d' | '3d'>(() => new URLSearchParams(window.location.search).get('view') === '3d' ? '3d' : '2d')
  const query = new URLSearchParams(window.location.search), linkedRack = warehouse.racks.find(r => r.id === query.get('rackId'))
  const canvas = useRef<PlanCanvasHandle>(null)
  useEffect(() => {
    let live = true
    api<PlanResponse>(`${endpoint}/plan`).then(value => { if (live) { setPlan(value); setError('') } }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [endpoint, revision, refresh])
  function finish() { setEditing(false); setRefresh(value => value + 1); onChanged() }
  function changeView(next: '2d' | '3d') { setView(next); const url = new URL(window.location.href); url.searchParams.set('view', next); window.history.replaceState(window.history.state, '', url) }
  const viewSwitch = <div className="wms-segmented warehouse-plan-tabs" role="group" aria-label={uiText("도면 보기 방식")}><button aria-label={uiText("2D 도면")} aria-pressed={view === '2d'} onClick={() => changeView('2d')}>2D</button><button aria-label={uiText("3D 도면")} aria-pressed={view === '3d'} onClick={() => changeView('3d')}>3D</button></div>
  const editButton = canUpdate && plan && !error && <button className="primary" onClick={() => setEditing(true)}><Pencil size={15}/>{plan.exists ? uiText("도면 편집") : uiText("도면 생성")}</button>
  return <section className="warehouse-detail-plan" aria-label={uiText("창고 도면")}>
    {editing && canUpdate ? <WarehouseWorkspaceEditor initialStep={2} endpoint={endpoint.replace(/\/[^/]+$/, '')} warehouseId={warehouse.warehouse.id} canUpdate={canUpdate} canDelete={canDelete} canCreate={canCreate} onBack={finish} onSaved={finish} /> : <>
      {error ? <p role="alert" className="alert error">{uiText(error)} <button className="secondary" onClick={() => setRefresh(value => value + 1)}>{uiText("도면 다시 불러오기")}</button></p> : !plan ? <p role="status">{uiText("저장된 도면을 불러오는 중…")}</p> : !plan.exists ? <div className="plan-empty"><h3>{uiText("아직 창고 도면이 없습니다")}</h3><p>{uiText("저장된 구역·랙을 연결해 배치를 구성하세요.")}</p>{editButton}{linkedRack && <RackFrontDetails endpoint={endpoint} rackId={linkedRack.id} initialPick={{rackId:linkedRack.id,level:Number(query.get('level'))||undefined,bay:Number(query.get('bay'))||undefined}} />}</div> : view === '3d' ? <Suspense fallback={<p role="status">{uiText("3D 도면을 불러오는 중…")}</p>}><Warehouse3DView plan={plan} warehouse={warehouse} endpoint={endpoint} toolbarLeading={viewSwitch} toolbarTrailing={editButton} /></Suspense> : <>
        <div className="warehouse-map-toolbar">{viewSwitch}<div className="warehouse-map-actions"><button className="secondary" title={uiText("화면 맞춤")} aria-label={uiText("도면 화면 맞춤")} onClick={() => canvas.current?.fit()}><Scan size={17}/><span>{uiText("화면 맞춤")}</span></button><button className="secondary" title={uiText("확대")} aria-label={uiText("도면 확대")} onClick={() => canvas.current?.zoom(1.25)}><ZoomIn size={17}/></button><button className="secondary" title={uiText("축소")} aria-label={uiText("도면 축소")} onClick={() => canvas.current?.zoom(.8)}><ZoomOut size={17}/></button><button className="secondary" title={uiText("화면 이동")} aria-label={uiText("화면 이동")} aria-pressed={pan} onClick={() => setPan(value => !value)}><Hand size={17}/></button>{editButton}</div></div>
        <PlanCanvas ref={canvas} document={plan} editing={false} selected={selected} grid snap={false} pan={pan} onSelect={setSelected} onChange={() => {}} onAdd={() => {}} onOpenRack={setRack} />
        <div className="warehouse-map-caption"><span>{uiText("객체")} {plan.objects.length}{uiText("개 · 랙 클릭 시 선반 상세")}</span><span>{uiText("시각적 배치 · 실제 치수와 다를 수 있습니다.")}</span></div>
      </>}
    </>}
    {rack && <RackFrontDialog endpoint={endpoint} rackId={rack} onClose={() => setRack(null)} />}
  </section>
}
