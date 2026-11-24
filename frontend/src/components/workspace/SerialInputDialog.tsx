import { t as uiText } from '../../i18n.ts'
import { useEffect, useState } from 'react'
import OrganizationDialog from './OrganizationDialog'
import { splitSerials } from '../../receipt-model'
import { serialTextError } from '../../document-line-model'
export default function SerialInputDialog({ name, value, onSave, onClose, onDirtyChange }: { name: string; value: string; onSave: (text: string) => void; onClose: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(value), error = serialTextError(draft)
  useEffect(() => { onDirtyChange(draft !== value) }, [draft, value, onDirtyChange])
  return <OrganizationDialog title={uiText("시리얼 입력")} description={uiText("{v0} · 한 줄에 하나씩 입력하세요.", { v0: name })} onClose={onClose}>
    <form onSubmit={e => { e.preventDefault(); if (!error) onSave(draft) }}>
      <label className="document-serial-label">{uiText("시리얼 번호")}<textarea autoFocus aria-label={uiText("시리얼 번호 입력")} rows={8} maxLength={101000} value={draft} onChange={e => setDraft(e.target.value)} /></label>
      <p>{uiText("시리얼")} {splitSerials(draft).length}{uiText("개")}</p>{error && <p className="alert error" role="alert">{uiText(error)}</p>}
      <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>{uiText("취소")}</button><button type="submit" className="primary" disabled={!!error}>{uiText("적용")}</button></div>
    </form>
  </OrganizationDialog>
}
