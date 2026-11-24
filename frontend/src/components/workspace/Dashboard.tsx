import { t as uiText } from '../../i18n.ts'
import { useMobile } from '../../use-mobile'
import { ScanLine, PackageOpen, Truck, Boxes } from 'lucide-react'
import { PageHeading } from './WorkspaceUI'
import { canTask } from '../../dashboard-model'
import WarehouseDashboard from './WarehouseDashboard'
import './warehouse-dashboard.css'
type Props = { userId?: string; tenantId: string; onNavigate: (path: string) => void; permissions: Record<string, string[]> }
export default function Dashboard(props: Props) {
  const mobile = useMobile()
  const tasks = [{key: "barcode-lookup", area: "products", label: "바코드 스캔", path: "/app/barcode-lookup", icon: ScanLine}, {key: "receipts", area: "receipts", label: "입고 검수", path: "/app/receipts", icon: PackageOpen}, {key: "shipments", area: "shipments", label: "출고 피킹", path: "/app/shipments", icon: Truck}, {key: "stock-overview", area: "stock-overview", label: "재고 조회", path: "/app/reports/stock", icon: Boxes}].filter(t => canTask(props.permissions, t.area, "read") || t.key === "barcode-lookup" && canTask(props.permissions, "warehouses", "read"))
  const quick = <section className="mobile-quick-work"><h2>{uiText("빠른 업무")}</h2><div>{tasks.map(({key,label,path,icon: Icon}) => <button type="button" key={key} onClick={() => props.onNavigate(path)}><Icon size={22} aria-hidden="true" /><span>{uiText(label)}</span></button>)}</div></section>
  const allowed = canTask(props.permissions, 'warehouses', 'read') && canTask(props.permissions, 'stock-overview', 'read')
  return <div className="warehouse-dashboard">
    {allowed ? <WarehouseDashboard key={`${props.userId}:${props.tenantId}`} userId={props.userId} tenantId={props.tenantId} onNavigate={props.onNavigate} mobile={mobile} mobileActions={quick}/> : <><PageHeading title={uiText("대시보드")}/>{mobile && quick}<p className="alert">{uiText("창고 관제를 보려면 창고관리 및 재고 현황 조회 권한이 필요합니다.")}</p></>}
  </div>
}
