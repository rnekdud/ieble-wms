import type { ReactNode } from 'react'
import {
  Inbox,
  Warehouse,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
} from 'lucide-react'
export function PageHeading({
  title,
  description,
  badge,
}: {
  title: string
  description: string
  badge?: string
}) {
  return (
    <div className="wms-page-heading">
      <div>
        <span className="eyebrow">IEBLE WORKSPACE</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {badge && <span className="wms-chip">{badge}</span>}
    </div>
  )
}
export function EmptyState({
  title = '아직 표시할 내역이 없습니다',
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <div className="wms-empty">
      <span className="wms-empty-icon">
        <Inbox size={25} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}
export function EmptyPage({ title }: { title: string }) {
  return (
    <>
      <PageHeading
        title={title}
        description="업무에 필요한 정보를 한곳에서 관리하세요."
        badge="준비 중"
      />
      <section className="wms-card wms-placeholder">
        <EmptyState title={`${title} 기능을 준비하고 있습니다`}>
          기능이 제공되면 이 공간에 업무 정보가 표시됩니다.
        </EmptyState>
      </section>
    </>
  )
}
export function Dashboard() {
  const cards = [
    { label: '전체 창고 수', icon: Warehouse, unit: '개' },
    { label: '전체 상품 수', icon: Package, unit: '개' },
    { label: '현재 재고 현황', icon: Boxes, unit: '현황' },
    { label: '오늘 입고 건수', icon: ArrowDownToLine, unit: '건' },
    { label: '오늘 출고 건수', icon: ArrowUpFromLine, unit: '건' },
  ]
  return (
    <>
      <PageHeading
        title="대시보드"
        description="기업의 물류 현황과 최근 업무 흐름을 확인하세요."
      />
      <div className="wms-metrics">
        {cards.map(({ label, icon: Icon, unit }) => (
          <section className="wms-card wms-metric" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={19} aria-hidden="true" />
            </div>
            <p>
              <strong aria-label="집계 데이터 없음">—</strong>
              <small>{unit}</small>
            </p>
            <small>집계 데이터가 아직 없습니다</small>
          </section>
        ))}
      </div>
      <section className="wms-card">
        <div className="wms-card-heading">
          <h2>최근 입출고 내역</h2>
          <span>실제 기록이 연결되면 표시됩니다</span>
        </div>
        <div className="wms-table-scroll">
          <table className="wms-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>구분</th>
                <th>창고</th>
                <th>상품</th>
                <th>수량</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6}>
                  <EmptyState>
                    입출고 기록이 연결되면 최근 내역을 확인할 수 있습니다.
                  </EmptyState>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <div className="wms-note">
        현재 물류 집계 및 입출고 데이터는 연결되지 않았습니다. 통계 수치는
        임의로 표시하지 않습니다.
      </div>
    </>
  )
}
