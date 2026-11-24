import { t as uiText } from '../../i18n.ts'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Scan, ZoomIn, ZoomOut } from 'lucide-react'
import WarehouseScene, { type SceneApi, type RackAnnotations } from './WarehouseScene'
import { useLiveInventory } from './useLiveInventory'
import type { PlanDocument } from '../../warehouse-plan-model'
import type { StorageItem, WarehouseDetailData } from '../../types/warehouse'
import './warehouse-3d.css'

type Props = { tenantId: string; warehouseId: string; plan: PlanDocument; appearance: RackAnnotations; selectedRack: string; showQuantities: boolean; onSelectRack: (id: string) => void }
export default function DashboardWarehouse3D({ tenantId, warehouseId, plan, appearance, selectedRack, showQuantities, onSelectRack }: Props) {
  const structure = useLiveInventory<WarehouseDetailData>(`/api/tenants/${tenantId}/warehouses/${warehouseId}`, tenantId)
  const controls = useRef<SceneApi | null>(null), [ready, setReady] = useState(false)
  const onReady = useCallback((api: SceneApi | null) => { controls.current = api; setReady(!!api) }, [])
  // Inventory refreshes must update the bubbles without resetting the user's camera.
  const planJson = JSON.stringify({ aspectRatio: plan.aspectRatio, objects: plan.objects })
  const rackJson = JSON.stringify(structure.data?.racks || [])
  const stablePlan = useMemo(() => JSON.parse(planJson) as PlanDocument, [planJson])
  const racks = useMemo(() => JSON.parse(rackJson) as StorageItem[], [rackJson])
  return <div className="dashboard-3d-map">
    <div className="dashboard-3d-controls" role="group" aria-label={uiText("3D 도면 조작")}>
      <span>{uiText("드래그로 회전 · 두 손가락으로 확대·이동")}</span>
      <div className="warehouse-map-actions dashboard-map-actions">
        <button type="button" className="secondary" aria-label={uiText("3D 도면 화면 맞춤")} disabled={!ready} onClick={() => controls.current?.fit()}><Scan size={16}/></button>
        <button type="button" className="secondary" aria-label={uiText("3D 도면 확대")} disabled={!ready} onClick={() => controls.current?.zoom(1.25)}><ZoomIn size={16}/></button>
        <button type="button" className="secondary" aria-label={uiText("3D 도면 축소")} disabled={!ready} onClick={() => controls.current?.zoom(.8)}><ZoomOut size={16}/></button>
      </div>
    </div>
    {structure.error && <p className="alert error" role="alert">{uiText("랙 구조를 갱신하지 못했습니다.")} {uiText(structure.error)} <button className="secondary" onClick={structure.refresh}>{uiText("다시 조회")}</button></p>}
    {structure.data ? <WarehouseScene plan={stablePlan} racks={racks} selected={selectedRack ? { rackId: selectedRack } : null} onPick={pick => onSelectRack(pick.rackId)} onReady={onReady} annotations={appearance} showAnnotations={showQuantities}/> : !structure.error && <p role="status">{uiText("랙 구조를 불러오는 중…")}</p>}
  </div>
}
