import type { ReactNode } from 'react'
import DetailHeader from './DetailHeader'
import './registration-page.css'

export default function DetailSurface({ title, code, status, actions, busy = false, onClose, children }: {
  title: string; code?: string; status?: ReactNode; actions?: ReactNode; hideListAction?: boolean; busy?: boolean; onClose: () => void; children: ReactNode
}) {
  return <section className="registration-page detail-page">
    <DetailHeader className="registration-header" title={title} code={code} status={status} actions={actions} busy={busy} onBack={onClose} backLabel="목록으로 돌아가기" />
    <div className="detail-content">{children}</div>
  </section>
}
