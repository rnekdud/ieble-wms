import type { ReactNode } from 'react'

/** A section keeps labels and controls together without adding nested cards. */
export default function DialogSection({ title, description, children, className = '' }: {
  title: string; description?: string; children: ReactNode; className?: string
}) {
  return <section className={`dialog-section ${className}`} aria-label={`${title} 영역`}>
    <div className="dialog-section-heading"><h3>{title}</h3>{description && <p>{description}</p>}</div>
    <div className="dialog-section-fields">{children}</div>
  </section>
}
