import { t as uiText } from '../../i18n.ts'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './dialog-layout.css'
import DetailHeader from './DetailHeader'

export default function OrganizationDialog({
  title,
  headingActions,
  detailHeader,
  className = '',
  hideFooter = false,
  closeOnBackdrop = false,
  children,
  actions,
  busy = false,
  wide = false,
  size,
  description,
  confirmation = false,
  onClose,
}: {
  title: string
  headingActions?: ReactNode
  detailHeader?: { code?: ReactNode; status?: ReactNode; actions?: ReactNode; hideBack?: boolean; actionsInFooter?: boolean }
  className?: string
  /** @deprecated Header close controls are replaced by footer actions. */
  showClose?: boolean
  hideFooter?: boolean
  closeOnBackdrop?: boolean
  children: ReactNode
  actions?: ReactNode
  busy?: boolean
  wide?: boolean
  size?: 'small' | 'medium' | 'large'
  description?: string
  confirmation?: boolean
  onClose: () => void
}) {
  const titleId = useId(), descriptionId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const [needsClose, setNeedsClose] = useState(false)
  const [opener] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => {
      element.close()
      queueMicrotask(() => {
        const openDialogs = Array.from(document.querySelectorAll('dialog[open]'))
        if (opener?.isConnected && (!openDialogs.length || openDialogs[openDialogs.length - 1].contains(opener))) opener.focus({ preventScroll: true })
      })
    }
  }, [opener])
  useEffect(() => {
    const element = dialog.current!
    // Inspect rendered body/footer actions, not header controls or the fallback itself.
    // This also covers image viewers, detail headers and custom action footers.
    const update = () => setNeedsClose(!Array.from(element.querySelectorAll<HTMLButtonElement>('.dialog-body button, .dialog-actions button')).some(button =>
      button.closest('dialog') === element && !button.hasAttribute('data-dialog-fallback') &&
      button.getClientRects().length > 0 && (button.textContent?.trim() !== uiText('확인') || !button.disabled) && ['취소','닫기','계속 편집','계속 보기','계속 작성','계속 수정','계속 확인','돌아가기','편집으로 돌아가기','카메라 종료','확인'].map(label => uiText(label)).includes(button.textContent?.trim() || '')))
    update()
    const observer = new MutationObserver(update)
    observer.observe(element, { childList: true, subtree: true, attributes: true, characterData: true })
    return () => observer.disconnect()
  }, [])
  const footerActions = hideFooter ? null : detailHeader?.actionsInFooter && !confirmation ? detailHeader.actions : (!detailHeader || confirmation) ? actions : null
  return (
    <dialog
      ref={dialog}
      className={`organization-dialog dialog-layout ${wide ? 'is-wide' : ''} dialog-${size || (wide ? 'large' : 'medium')} ${confirmation ? 'dialog-confirmation' : ''} ${className}`}
      tabIndex={-1}
      onKeyDown={e => {
        if (e.key !== 'Tab' || (e.target as HTMLElement).closest('dialog') !== e.currentTarget) return
        const targets = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button,input,select,textarea,iframe,a[href],[tabindex]')).filter(el => !el.matches(':disabled') && el.tabIndex >= 0 && el.getClientRects().length > 0)
        const first = targets[0], last = targets[targets.length - 1]
        if (!first) { e.preventDefault(); e.currentTarget.focus(); return }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === e.currentTarget)) { e.preventDefault(); first.focus() }
      }}
      onClick={e => {
        if (!closeOnBackdrop || busy || e.target !== e.currentTarget) return
        const box = e.currentTarget.getBoundingClientRect()
        if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose()
      }}
      aria-labelledby={titleId}
      aria-describedby={description && !confirmation ? descriptionId : undefined}
      onCancel={(e) => {
        e.stopPropagation()
        e.preventDefault()
        if (!busy) onClose()
      }}
    >
      {detailHeader && !confirmation ? <DetailHeader level={2} title={title} titleId={titleId} code={detailHeader.code} status={detailHeader.status} actions={detailHeader.actionsInFooter ? undefined : detailHeader.actions} busy={busy} onBack={detailHeader.hideBack ? undefined : onClose} /> : <div className="organization-dialog-heading">
        <div><h2 id={titleId}>{title}</h2>{description && !confirmation && <p id={descriptionId}>{description}</p>}</div>
        {headingActions}
      </div>}
      <div className="dialog-body">{children}</div>
      {(footerActions || needsClose) && <footer className="dialog-actions">
        {footerActions}
        {needsClose && <button type="button" className="secondary dialog-close" data-dialog-fallback disabled={busy} onClick={onClose}>{uiText("닫기")}</button>}
      </footer>}
    </dialog>
  )
}
