import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export default function OrganizationDialog({
  title,
  children,
  busy = false,
  onClose,
}: {
  title: string
  children: ReactNode
  busy?: boolean
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="organization-dialog"
      aria-labelledby="organization-dialog-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="organization-dialog-heading">
        <h2 id="organization-dialog-title">{title}</h2>
        <button
          type="button"
          className="secondary"
          aria-label="상세 창 닫기"
          disabled={busy}
          onClick={onClose}
        >
          닫기
        </button>
      </div>
      {children}
    </dialog>
  )
}
