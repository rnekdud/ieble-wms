import { t as uiText } from '../../i18n.ts'
import { useState } from 'react'
import { useLiveInventory } from './useLiveInventory'
import OrganizationDialog from './OrganizationDialog'
import Pagination from '../Pagination'
import { receiptStatuses } from '../../receipt-model'
import { shipmentStatuses } from '../../shipment-model'
import { riskNumber } from '../../warehouse-risk'
type Work = { id: string; number: string; partnerName: string; expectedDate: string; status: string; lines: { id: string; productCode: string; productName: string; quantity: number; unit: string }[] }
type Result = { today: string; asOf: string; total: number; page: number; pageSize: number; documents: Work[] }
export default function ScheduledWorkDialog({ tenantId, warehouseId, warehouseName, kind, onClose, onNavigate }: { tenantId: string; warehouseId: string; warehouseName: string; kind: 'receipts' | 'shipments'; onClose: () => void; onNavigate: (path: string) => void }) {
  const [page, setPage] = useState(1), label = kind === 'receipts' ? '입고' : '출고'
  const live = useLiveInventory<Result>(`/api/tenants/${tenantId}/dashboard/warehouses/${warehouseId}/scheduled-${kind}?page=${page}`, tenantId), data = live.data
  return <OrganizationDialog title={uiText("오늘 {v0} 예정", { v0: uiText(label) })} description={uiText("{v0} · 미확정 문서 기준", { v0: warehouseName })} size="large" onClose={onClose}>
    <div className="dialog-form"><div className="dialog-form-scroll scheduled-work-body">
      {live.error && <p className="alert error" role="alert">{uiText(live.error)} {data && uiText("마지막 정상 조회 결과입니다.")}<button className="secondary" onClick={live.refresh}>{uiText("다시 조회")}</button></p>}
      {!data ? <p role="status">{live.error ? uiText("예정 문서를 조회할 수 없습니다.") : uiText("예정 문서를 불러오는 중…")}</p> : <><p>{data.today} · {data.total}{uiText("건의")} {uiText(label)} {uiText("문서 · 수량은 상품 기준 단위별로 표시합니다.")}</p>
        {!data.documents.length && <p>{uiText("오늘 예정된")} {uiText(label)} {uiText("문서가 없습니다.")}</p>}
        {data.documents.map(d => <section key={d.id}><header><button className="text-button" onClick={() => { onClose(); onNavigate(`/app/${kind}/${d.id}`) }}>{d.number}</button><span>{d.partnerName}</span><span className={`status-badge ${d.status}`}>{uiText((kind === 'receipts' ? receiptStatuses : shipmentStatuses)[d.status] || d.status)}</span><small>{d.expectedDate}</small></header>
          <div className="table-scroll"><table className="organization-table"><thead><tr><th>{uiText("상품코드")}</th><th>{uiText("상품명")}</th><th>{uiText(label)} {uiText("예정 수량")}</th></tr></thead><tbody>{d.lines.map(l => <tr key={l.id}><td>{l.productCode}</td><td><button className="text-button" onClick={() => { onClose(); onNavigate(`/app/${kind}/${d.id}`) }}>{l.productName}</button></td><td className="numeric">{riskNumber(l.quantity)}{l.unit !== "EA" ? ` ${l.unit}` : ""}</td></tr>)}</tbody></table></div>
        </section>)}<Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} label={uiText("오늘 {v0} 예정 페이지", { v0: uiText(label) })} /></>}
    </div><div className="dialog-actions"><button className="secondary" onClick={onClose}>{uiText("취소")}</button></div></div>
  </OrganizationDialog>
}
