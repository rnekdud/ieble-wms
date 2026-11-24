import { t as uiText } from '../../i18n.ts'
import { useState } from 'react'
import OrganizationDialog from './OrganizationDialog'
import Pagination from '../Pagination'
import { useLiveInventory } from './useLiveInventory'
import { overviewRowKey, type OverviewRow } from '../../stock-overview-model'
import { riskNumber as num, type RiskProduct } from '../../warehouse-risk'
type Alerts = { page: number; pageSize: number; total: number; items: { stock: OverviewRow; risk: RiskProduct; remainingDays: number | null; expiryStatus: string }[] }
export default function DashboardAlertDialog({ tenantId, warehouseId, warehouseName, kind, onClose }: { tenantId: string; warehouseId: string; warehouseName: string; kind: 'shortage' | 'expiry'; onClose: () => void }) {
  const [page, setPage] = useState(1)
  const live = useLiveInventory<{ risk: { alerts: Alerts; expirySoonDays: number } }>(`/api/tenants/${tenantId}/dashboard/warehouses/${warehouseId}?riskKind=${kind}&alertPage=${page}`, tenantId, 15000)
  const data = live.data?.risk.alerts, shortage = kind === 'shortage'
  return <OrganizationDialog title={shortage ? uiText("안전재고 부족 상품") : uiText("유통기한 임박 상품")} size="large" onClose={onClose}>
    <div className="dashboard-rack-dialog"><div className="dashboard-rack-scroll">
      <p className="dashboard-rack-summary">{warehouseName}</p>
      <p className="organization-help">{shortage ? uiText("위치별 현재고·예약과 기업 전체 상품의 예상 잔여·안전재고를 구분합니다. 상품 전체 부족 수량은 행별로 합산하지 않습니다.") : uiText("실제 재고의 LOT별 유통기한을 표시합니다. {v0}일 이내 임박 및 경과 상품을 포함하며 카드에서는 상품별 한 번만 집계합니다.", { v0: live.data?.risk.expirySoonDays ?? 30 })}</p>
      {live.error && <p className="alert error" role="alert">{uiText(live.error)}<button className="secondary" onClick={live.refresh}>{uiText("다시 조회")}</button></p>}
      <div className="table-scroll"><table className="organization-table dashboard-rack-table"><thead><tr>
        {(shortage ? ['상품명 / 코드', '창고 · 랙 · 보관 위치', '현재고 / 예약 (위치)', '현재고 / 예약 (상품 전체)', '예상 잔여 (상품 전체)', '안전재고 / 부족 (상품 전체)', '위험 사유'] : ['상품명 / 코드', '창고 · 랙 · 보관 위치', 'LOT · 시리얼', '현재고', '유통기한', '남은 일수', '상태']).map(t => <th key={t}>{uiText(t)}</th>)}
      </tr></thead><tbody>{!data ? <tr><td colSpan={7} role="status">{live.error ? uiText("조회하지 못했습니다.") : uiText("재고를 불러오는 중…")}</td></tr> : !data.items.length ? <tr><td colSpan={7}>{uiText("해당하는 재고가 없습니다.")}</td></tr> : data.items.map(({ stock: row, risk, remainingDays, expiryStatus }) => <tr key={overviewRowKey(row)}>
        <td><strong>{row.productName}</strong><small>{row.productCode}</small></td><td>{row.warehouseName}<small>{row.rackCode} / {row.locationCode}</small></td>
        {shortage ? <><td className="numeric">{num(row.quantity)} / {num(row.reservedQuantity)} {row.unit}<small>{row.lotNumber && `LOT ${row.lotNumber}`} {row.serialNumber}</small></td><td className="numeric">{num(risk.currentQuantity)} / {num(risk.reservedQuantity)} {row.unit}</td><td className="numeric">{num(risk.expectedQuantity)} {row.unit}</td><td className="numeric">{num(risk.safetyStock!)} / {num(risk.shortageQuantity!)} {row.unit}</td><td>{(risk.inventoryReasons || ['재고 상태를 갱신해 주세요.']).join(' · ')}</td></> : <><td>{row.lotNumber || '—'}<small>{row.serialNumber}</small></td><td className="numeric">{num(row.quantity)} {row.unit}</td><td>{row.expiryDate}</td><td className="numeric">{remainingDays! < 0 ? uiText("{v0}일 경과", { v0: -remainingDays! }) : remainingDays === 0 ? uiText("오늘 만료") : uiText("{v0}일", { v0: remainingDays })}</td><td><span className={`risk-tag risk-${expiryStatus}`}>{remainingDays! < 0 ? uiText("경과") : uiText("임박")}</span></td></>}
      </tr>)}</tbody></table></div>
      {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onChange={setPage} label={uiText("위험 재고 페이지")}/>}
    </div><div className="dialog-actions"><button className="secondary dialog-close" onClick={onClose}>{uiText("닫기")}</button></div></div>
  </OrganizationDialog>
}
