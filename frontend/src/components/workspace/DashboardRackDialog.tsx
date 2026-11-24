import { t as uiText } from '../../i18n.ts'
import OrganizationDialog from './OrganizationDialog'
import Pagination from '../Pagination'
import type { OverviewRow } from '../../stock-overview-model'
import { overviewRowKey } from '../../stock-overview-model'
import { locationRisk, riskNumber as num, riskStates } from '../../warehouse-risk'
import type { RiskProduct, RiskState } from '../../warehouse-risk'
import { RiskReasons } from './WarehouseRiskDetails'
export default function DashboardRackDialog({ name, code, warehouse, products, status, stock, risks, today, needsReview, error, onRefresh, onPage, onClose }: {
  needsReview?: boolean; error?: string; onRefresh: () => void; name: string; code?: string; warehouse: string; products: number; status: RiskState; stock?: { items: OverviewRow[]; total: number; page: number; pageSize: number }; risks: RiskProduct[]; today: string; onPage: (page: number) => void; onClose: () => void
}) {
  return <OrganizationDialog title={uiText("{v0} 재고 현황", { v0: name })} size="large" onClose={onClose}>
    <div className="dashboard-rack-dialog">
      <div className="dashboard-rack-scroll">{error && <p className="alert error" role="alert">{uiText("갱신하지 못했습니다.")} {uiText(error)} {stock && uiText("마지막 정상 데이터를 표시합니다.")} <button type="button" className="secondary" onClick={onRefresh}>{uiText("다시 조회")}</button></p>}{needsReview && <p role="status">{uiText("랙·구역 또는 위치의 사용 상태를 확인하세요.")}</p>}<p className="dashboard-rack-summary">{warehouse}{code && ` · ${code}`} {uiText("· 상품")} {products}{uiText("종 ·")} <span className={`risk-tag risk-${status}`}>{uiText(riskStates[status].label)}</span></p>
        <p className="organization-help">{uiText("현재고·예약·가용 수량은 각 위치·LOT·시리얼 기준입니다. 안전재고와 예상 부족은 기업 전체 상품 기준이며 행별로 합산하지 않습니다.")}</p>
        <div className="table-scroll"><table className="organization-table dashboard-rack-table"><thead><tr>{['상품명 / 코드', '보관 위치 · 추적 정보', '현재고', '예약', '가용 재고', '안전재고', '상태 / 사유'].map(x => <th key={x}>{uiText(x)}</th>)}</tr></thead><tbody>
          {!stock ? <tr><td colSpan={7} role="status">{error ? uiText("랙 재고를 조회하지 못했습니다. 다시 조회해 주세요.") : uiText("랙 재고를 불러오는 중…")}</td></tr> : !stock.items.length ? <tr><td colSpan={7}>{uiText("보관 중인 재고가 없습니다.")}</td></tr> : stock.items.map(row => {
            const productRisk = risks.find(p => p.productId === row.productId && p.unit === row.unit)
            const risk = productRisk && locationRisk(productRisk, row, today)
            return <tr key={overviewRowKey(row)}><td><strong>{row.productName}</strong><small>{row.productCode}</small></td><td>{row.locationCode}<small>{row.locationName}</small><small>{[row.lotNumber && `LOT ${row.lotNumber}`, row.expiryDate && uiText("유통기한 {v0}", { v0: row.expiryDate }), row.serialNumber && uiText("시리얼 {v0}", { v0: row.serialNumber })].filter(Boolean).join(' · ')}</small></td>
              <td className="numeric">{num(row.quantity)} {row.unit}</td><td className="numeric">{num(row.reservedQuantity)} {row.unit}</td><td className="numeric">{num(row.availableQuantity)} {row.unit}</td><td className="numeric">{row.safetyStock == null ? uiText("미설정") : !row.safetyComparable ? uiText("기준 단위 확인") : `${num(row.safetyStock)} ${row.unit}`}{!row.safetyComparable && <small>{uiText("기준 단위 비교 제외")}</small>}</td>
              <td>{risk ? <div className={`risk-cell risk-${risk.status}`}><span className="risk-tag">{uiText(riskStates[risk.status].label)}</span><RiskReasons item={risk} today={today}/></div> : <span className="risk-tag risk-review">{uiText("확인 필요")}</span>}</td></tr>
          })}
        </tbody></table></div>
        {stock && <Pagination page={stock.page} pageSize={stock.pageSize} total={stock.total} onChange={onPage} label={uiText("랙 전체 재고 페이지")}/>}
      </div>
      <div className="dialog-actions"><button type="button" className="secondary dialog-close" onClick={onClose}>{uiText("닫기")}</button></div>
    </div>
  </OrganizationDialog>
}
