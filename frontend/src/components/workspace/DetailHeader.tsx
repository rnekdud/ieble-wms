import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import './detail-header.css'

/** One action row and a separate document/status row, shared by pages and detail dialogs. */
export default function DetailHeader({ title, titleId, level = 1, code, status, actions, busy, onBack, backLabel = '뒤로가기', className = '' }: {
  title: ReactNode; titleId?: string; level?: 1 | 2; code?: ReactNode; status?: ReactNode; actions?: ReactNode; busy?: boolean; onBack: () => void; backLabel?: string; className?: string
}) {
  const Heading = level === 1 ? 'h1' : 'h2'
  return <header className={`work-detail-header wms-page-header ${className}`}>
    <div className="work-detail-main">
      <Heading id={titleId} title={typeof title === 'string' ? title : undefined}>{title}</Heading>
      <div className="work-detail-actions">
        <button type="button" className="secondary registration-back" aria-label={backLabel} title={backLabel} disabled={busy} onClick={onBack}><ArrowLeft size={18} /></button>
        {actions}
      </div>
    </div>
    {(code || status) && <div className="work-detail-meta">{code && <span className="work-detail-code">{code}</span>}{status}</div>}
  </header>
}
