import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
export function PageHeading({
  title,
  badge,
  actions,
}: {
  title: string
  badge?: string
  actions?: ReactNode
}) {
  return (
    <div className="wms-page-heading wms-page-header">
      <div>
        <h1>{title}</h1>
      </div>
      {(actions || badge) && <div className="wms-page-actions">{badge && <span className="wms-chip">{badge}</span>}{actions}</div>}
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
