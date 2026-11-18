import type { ReactNode } from 'react'

/** Shared presentation only; each editor retains its existing navigation guard. */
export default function UnsavedChangesContent({
  stay, discard, message = '입력한 변경사항을 버리고 이동하시겠습니까?',
  detail = '저장하지 않은 내용은 복구할 수 없습니다.', busy = false, label,
}: {
  stay: () => void
  discard: () => void
  message?: ReactNode
  detail?: ReactNode
  busy?: boolean
  label?: string
}) {
  return <section className="unsaved-changes-content" role={label ? 'alertdialog' : undefined} aria-label={label}>
    <p>{message}</p>
    <p>{detail}</p>
    <div className="confirmation-actions">
      <button type="button" className="secondary" onClick={stay}>계속 편집</button>
      <button type="button" className="primary" disabled={busy} onClick={discard}>변경 버리고 계속</button>
    </div>
  </section>
}
