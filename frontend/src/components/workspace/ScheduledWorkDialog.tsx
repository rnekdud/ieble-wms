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
  return <OrganizationDialog title={`오늘 ${label} 예정`} description={`${warehouseName} · 미확정 문서 기준`} size="large" onClose={onClose}>
    <div className="dialog-form"><div className="dialog-form-scroll scheduled-work-body">
      {live.error && <p className="alert error" role="alert">{live.error} {data && '마지막 정상 조회 결과입니다.'}<button className="secondary" onClick={live.refresh}>다시 조회</button></p>}
      {!data ? <p role="status">{live.error ? '예정 문서를 조회할 수 없습니다.' : '예정 문서를 불러오는 중…'}</p> : <><p>{data.today} · {data.total}건의 {label} 문서 · 수량은 상품 기준 단위별로 표시합니다.</p>
        {!data.documents.length && <p>오늘 예정된 {label} 문서가 없습니다.</p>}
        {data.documents.map(d => <section key={d.id}><header><button className="text-button" onClick={() => { onClose(); onNavigate(`/app/${kind}/${d.id}`) }}>{d.number}</button><span>{d.partnerName}</span><span className={`status-badge ${d.status}`}>{(kind === 'receipts' ? receiptStatuses : shipmentStatuses)[d.status] || d.status}</span><small>{d.expectedDate}</small></header>
          <div className="table-scroll"><table className="organization-table"><thead><tr><th>상품코드</th><th>상품명</th><th>{label} 예정 수량</th></tr></thead><tbody>{d.lines.map(l => <tr key={l.id}><td>{l.productCode}</td><td><button className="text-button" onClick={() => { onClose(); onNavigate(`/app/${kind}/${d.id}`) }}>{l.productName}</button></td><td className="numeric">{riskNumber(l.quantity)}{l.unit !== "EA" ? ` ${l.unit}` : ""}</td></tr>)}</tbody></table></div>
        </section>)}<Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} label={`오늘 ${label} 예정 페이지`} /></>}
    </div><div className="dialog-actions"><button className="secondary" onClick={onClose}>취소</button></div></div>
  </OrganizationDialog>
}
