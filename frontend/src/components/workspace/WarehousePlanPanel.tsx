import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { PlanResponse } from '../../warehouse-plan-model'
import type { WarehouseDetailData } from '../../types/warehouse'
import PlanCanvas from './PlanCanvas'
import type { PlanCanvasHandle } from './PlanCanvas'
import WarehousePlanEditor from './WarehousePlanEditor'
import RackFrontDialog from './RackFrontDialog'
import './warehouse-plan.css'

type Props = { endpoint: string; warehouse: WarehouseDetailData; revision: number; canUpdate: boolean; canCreate: boolean; onChanged: () => void }
export default function WarehousePlanPanel({ endpoint, warehouse, revision, canUpdate, canCreate, onChanged }: Props) {
  const [plan, setPlan] = useState<PlanResponse | null>(null), [error, setError] = useState(''), [editing, setEditing] = useState(false)
  const [refresh, setRefresh] = useState(0), [selected, setSelected] = useState<string[]>([]), [pan, setPan] = useState(false), [rack, setRack] = useState<string | null>(null)
  const canvas = useRef<PlanCanvasHandle>(null)
  useEffect(() => {
    let live = true
    api<PlanResponse>(`${endpoint}/plan`).then(value => { if (live) { setPlan(value); setError('') } }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [endpoint, revision, refresh])
  function finish() { setEditing(false); setRefresh(value => value + 1); onChanged() }
  return <section className="warehouse-detail-plan" aria-label="창고 도면">
    {editing && canUpdate ? <WarehousePlanEditor endpoint={endpoint} initialWarehouse={warehouse} canEdit={canUpdate} canCreate={canCreate} onBack={finish} onSaved={finish} backLabel="도면 편집 닫기" /> : <>
      <div className="organization-toolbar"><div><h3>창고 도면</h3><p className="organization-help">도면의 위치와 크기는 시각적 배치입니다. 실제 재고나 보관 위치를 이동하지 않습니다.</p></div>{canUpdate && plan && !error && <button className="primary" onClick={() => setEditing(true)}>{plan.exists ? '도면 편집' : '도면 생성'}</button>}</div>
      {error ? <p role="alert" className="alert error">{error} <button className="secondary" onClick={() => setRefresh(value => value + 1)}>도면 다시 불러오기</button></p> : !plan ? <p>저장된 도면을 불러오는 중…</p> : !plan.exists ? <div className="plan-empty"><p>등록된 도면이 없습니다.{canUpdate ? ' 도면 생성으로 배치를 작성하세요.' : ''}</p></div> : <>
        <div className="plan-toolbar"><button className="secondary" onClick={() => canvas.current?.fit()}>도면 화면 맞춤</button><button className="secondary" onClick={() => canvas.current?.zoom(1.25)}>도면 확대</button><button className="secondary" onClick={() => canvas.current?.zoom(.8)}>도면 축소</button><button className="secondary" aria-pressed={pan} onClick={() => setPan(value => !value)}>화면 이동</button></div>
        <PlanCanvas ref={canvas} document={plan} editing={false} selected={selected} grid snap={false} pan={pan} onSelect={setSelected} onChange={() => {}} onAdd={() => {}} onOpenRack={setRack} />
        <p className="organization-help">객체 {plan.objects.length}개 · 연결된 랙을 클릭하면 정면도와 보관 위치를 조회합니다.</p>
      </>}
    </>}
    {rack && <RackFrontDialog endpoint={endpoint} rackId={rack} onClose={() => setRack(null)} />}
  </section>
}
