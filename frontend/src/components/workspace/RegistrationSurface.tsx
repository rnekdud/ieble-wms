import { useEffect, useId, useRef } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { Check } from 'lucide-react'
import DetailHeader from './DetailHeader'
import OrganizationDialog from './OrganizationDialog'
import './registration-page.css'

/** Editors share their state, validation and submit handlers between page and dialog. */
export default function RegistrationSurface({ page = false, formId, action, context, status, headerActions, description, children, ...dialog }: ComponentProps<typeof OrganizationDialog> & {
  page?: boolean; formId: string; action: string; context?: string; status?: ReactNode; headerActions?: ReactNode
}) {
  const notice = formId === 'receipt-registration' ? '실제 재고는 입고 최종 확정 시 반영됩니다.' : formId === 'shipment-registration' ? '등록 시 재고를 예약하며, 출고 확정 시 실제 재고가 차감됩니다.' : null
  if (!page) return <OrganizationDialog {...dialog} description={description}>{children}</OrganizationDialog>
  return <section className={`registration-page registration-${formId}`}>
    <DetailHeader className="registration-header" title={dialog.title} code={context} status={status} busy={dialog.busy} onBack={dialog.onClose} actions={<>{headerActions}<button type="submit" form={formId} className="primary" disabled={dialog.busy}><Check size={16} />{dialog.busy ? '저장 중…' : action}</button></>} />
    {notice && <p className="registration-intro">{notice}</p>}
    {children}
  </section>
}

export function RegistrationPrompt({ page, active, children, ...dialog }: ComponentProps<typeof OrganizationDialog> & { page: boolean; active: boolean }) {
  if (!page) return children
  return active ? <OrganizationDialog confirmation {...dialog} size="small">{children}</OrganizationDialog> : null
}

/** Inline native validation with first-invalid focus; business/server errors stay visible. */
export function RegistrationFields({ page, error, children, onEdit }: { page: boolean; error: string; children: ReactNode; onEdit: () => void }) {
  const root = useRef<HTMLDivElement>(null), errorId = useId()
  useEffect(() => {
    if (page && error) root.current?.querySelector<HTMLElement>('[role="alert"]')?.focus()
  }, [page, error])
  if (!page) return children
  return <div ref={root} onChange={() => { if (error) onEdit() }} onInvalidCapture={e => {
    if (!page) return
    const input = e.target as HTMLInputElement
    input.setAttribute('aria-invalid', 'true')
    const container = input.closest('label') || input.parentElement
    if (container && !container.querySelector('.registration-field-error')) {
      const message = document.createElement('small'); message.className = 'registration-field-error'; message.id = `${errorId}-${encodeURIComponent(input.getAttribute('aria-label') || input.name)}`
      message.textContent = input.validationMessage; container.appendChild(message); input.setAttribute('aria-errormessage', message.id)
    }
    const first = input.form?.querySelector<HTMLElement>('input:invalid,select:invalid,textarea:invalid')
    if (first === input) input.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }} onInputCapture={e => {
    const input = e.target as HTMLInputElement
    if (!page || !input.validity?.valid) return
    input.removeAttribute('aria-invalid'); input.removeAttribute('aria-errormessage')
    ;(input.closest('label') || input.parentElement)?.querySelector('.registration-field-error')?.remove()
  }}>
    {error && <p className="alert error" role="alert" tabIndex={-1}>{error}</p>}
    {children}
  </div>
}

export function RegistrationSummary({ lines }: { lines: { product?: { id: string; unit: string | null }; quantity: string }[] }) {
  const products = new Set(lines.flatMap(l => l.product ? [l.product.id] : []))
  const totals = new Map<string, number>()
  for (const line of lines) if (line.product?.unit && Number.isFinite(Number(line.quantity))) totals.set(line.product.unit, (totals.get(line.product.unit) || 0) + Number(line.quantity))
  return <div className="registration-summary" aria-label="등록 상품 요약"><strong>상품 {products.size}종</strong><span>{lines.length}개 입력 행</span>{[...totals].map(([unit, quantity]) => <span key={unit}>{Math.round(quantity * 1000) / 1000} {unit}</span>)}</div>
}
