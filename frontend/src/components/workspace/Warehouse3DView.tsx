import { t as uiText } from '../../i18n.ts'
import type { ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import { Maximize, ZoomIn, ZoomOut, ArrowDown, Box } from 'lucide-react'
import type { PlanDocument } from '../../warehouse-plan-model'
import type { WarehouseDetailData } from '../../types/warehouse'
import { sceneRacks, detailedShelves } from '../../warehouse-3d-model'
import type { RackPick } from '../../warehouse-3d-model'
import WarehouseScene from './WarehouseScene'
import type { SceneApi } from './WarehouseScene'
import { RackFrontDetails } from './RackFrontDialog'
import './warehouse-3d.css'
export default function Warehouse3DView({ plan, warehouse, endpoint, toolbarLeading, toolbarTrailing }: { plan: PlanDocument; warehouse: WarehouseDetailData; endpoint: string; toolbarLeading?: ReactNode; toolbarTrailing?: ReactNode }) {
  const [selected, setSelected] = useState<RackPick | null>(() => { const p = new URLSearchParams(window.location.search), rackId = p.get('rackId'); return rackId && warehouse.racks.some(r => r.id === rackId) ? { rackId, level: Number(p.get('level')) || undefined, bay: Number(p.get('bay')) || undefined } : null }), [ready, setReady] = useState(false), controls = useRef<SceneApi | null>(null)
  const racks = useMemo(() => sceneRacks(plan, warehouse.racks), [plan, warehouse.racks])
  const unlinked = plan.objects.filter(o => o.type === 'rack' && !racks.some(r => r.object.id === o.id)).length
  return <div className="warehouse-3d-view">
    <div className="warehouse-map-toolbar" aria-label={uiText("3D 도면 조작")}>{toolbarLeading}
      <div className="organization-row-actions"><button className="secondary" disabled={!ready} onClick={() => controls.current?.fit()}><Maximize size={16} /> {uiText("전체 맞춤")}</button><button className="secondary" disabled={!ready} onClick={() => controls.current?.top()}><ArrowDown size={16} /> {uiText("상단 시점")}</button><button className="secondary" disabled={!ready} onClick={() => controls.current?.fit()}><Box size={16} /> {uiText("사선 시점")}</button><button className="secondary" aria-label={uiText("3D 확대")} disabled={!ready} onClick={() => controls.current?.zoom(1.25)}><ZoomIn size={16} /></button><button className="secondary" aria-label={uiText("3D 축소")} disabled={!ready} onClick={() => controls.current?.zoom(.8)}><ZoomOut size={16} /></button>{toolbarTrailing}</div>
    </div><div className="warehouse-scene-toolbar">
      <label>{uiText("랙 선택")}<select aria-label={uiText("3D 랙 선택")} value={selected?.rackId || ''} onChange={e => { const rackId = e.target.value; setSelected(rackId ? { rackId } : null); if (rackId) controls.current?.focus(rackId) }}><option value="">{uiText("전체 보기")}</option>{racks.map(({ rack }) => <option key={rack.id} value={rack.id}>{rack.code} · {rack.name}</option>)}</select></label>
    </div>
    <p className="organization-help">{uiText("드래그: 회전 · 휠/핀치: 확대·축소 · 오른쪽 드래그/두 손가락: 화면 이동. 높이는 시각화용 기본값이며 실제 측정 치수가 아닙니다.")}</p>
    {!detailedShelves(racks) && <p className="organization-help">{uiText("대규모 도면은 랙 외곽으로 간소화합니다. 랙을 선택하면 실제 단·칸과 보관 위치를 정면도에서 확인할 수 있습니다.")}</p>}
    {!!unlinked && <p className="organization-help">{uiText("실제 랙에 연결되지 않은 시각 객체")} {unlinked}{uiText("개는 바닥 도형으로 표시합니다.")}</p>}
    <div className={`warehouse-scene-layout ${selected ? 'has-selection' : ''}`}>
      <div className="warehouse-scene-main">{!ready && <p role="status">{uiText("3D 화면을 준비 중입니다. 지원되지 않으면 2D 도면을 이용해 주세요.")}</p>}<WarehouseScene plan={plan} racks={warehouse.racks} selected={selected} onPick={setSelected} onReady={api => { controls.current = api; setReady(!!api) }} /></div>
      {selected && <aside className="warehouse-scene-details" aria-label={uiText("선택 랙 상세")}><div className="organization-toolbar"><h3>{uiText("랙 상세 · 정면 선반")}</h3><button className="secondary" onClick={() => setSelected(null)}>{uiText("선택 해제")}</button></div><RackFrontDetails key={selected.rackId} endpoint={endpoint} rackId={selected.rackId} initialPick={selected} onPick={setSelected} /></aside>}
    </div>
  </div>
}
