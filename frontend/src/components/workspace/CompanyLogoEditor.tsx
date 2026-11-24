import { t as uiText } from '../../i18n.ts'
import { useRef, useState } from 'react'
import { Building2, Trash2 } from 'lucide-react'
export type LogoDraft = { remove?: boolean; fileName?: string; contentType?: string; base64?: string; preview?: string }
export function CompanyLogoMark({ src, name = '기업', className = '' }: { src?: string; name?: string; className?: string }) {
  const [failed, setFailed] = useState('')
  return src && failed !== src ? <img className={className} src={src} alt={uiText("{v0} 로고", { v0: name })} onError={() => setFailed(src)} /> : <Building2 size={24} aria-hidden="true" />
}
export default function CompanyLogoEditor({ source, draft, onChange, busy, onReading }: {
  source?: string; draft?: LogoDraft; onChange?: (draft: LogoDraft) => void; busy: boolean; onReading: (reading: boolean) => void
}) {
  const input = useRef<HTMLInputElement>(null), flight = useRef(false)
  const [error, setError] = useState(''), [reading, setReading] = useState(false)
  const [selected, setSelected] = useState(false)
  const src = draft?.remove ? undefined : draft?.preview || source
  async function select(file?: File) {
    if (!file || !onChange || flight.current) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !/\.(png|jpe?g|webp)$/i.test(file.name) || file.size < 1 || file.size > 2 * 1024 * 1024) { setError('2MB 이하 PNG·JPG·WEBP 이미지를 선택해 주세요.'); return }
    flight.current = true; setReading(true); onReading(true); setError('')
    try {
      const preview = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) })
      const image = new Image(); image.src = preview; await image.decode()
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 8192 || image.naturalHeight > 8192) throw new Error('image size')
      onChange({ fileName: file.name, contentType: file.type, base64: preview.split(',')[1], preview })
      setSelected(false)
    } catch { setError('이미지를 읽지 못했습니다. 기존 로고는 유지됩니다.') }
    finally { flight.current = false; setReading(false); onReading(false) }
  }
  return <div className="company-logo-editor">
    <span className="company-logo-label">{uiText("기업 로고")}</span>
    <div className="product-gallery-grid">
      {src && <div className={`company-logo-preview product-gallery-item${onChange ? ' is-editable' : ''}${selected ? ' is-selected' : ''}`}>
        {onChange ? <>
          <button type="button" className="product-gallery-preview product-gallery-select" aria-label={uiText("기업 로고 선택")} aria-pressed={selected} disabled={busy || reading} onClick={() => setSelected(value => !value)}><CompanyLogoMark src={src} /></button>
          <div className="product-gallery-actions"><button type="button" disabled={busy || reading} onClick={() => input.current?.click()}>{uiText("로고 변경")}</button><button type="button" aria-label={uiText("로고 제거")} disabled={busy || reading} onClick={() => { setError(''); setSelected(false); onChange({ remove: true }) }}><Trash2 size={14} aria-hidden="true" />{uiText("제거")}</button></div>
        </> : <div className="product-gallery-preview"><CompanyLogoMark src={src} /></div>}
      </div>}
      {!src && (onChange ? <button type="button" className="product-gallery-add" disabled={busy || reading} onClick={() => input.current?.click()}><span aria-hidden="true">+</span>{reading ? uiText("이미지 확인 중…") : uiText("로고 등록")}</button> : <div className="product-gallery-empty"><Building2 size={24} aria-hidden="true" />{uiText("로고 미등록")}</div>)}
    </div>
    {onChange && <><input ref={input} type="file" aria-label={uiText("기업 로고 파일")} hidden accept="image/png,image/jpeg,image/webp" disabled={busy || reading} onChange={e => { void select(e.target.files?.[0]); e.target.value = '' }} /><small>{uiText("PNG·JPG·WEBP · 최대 2MB · 기업 정보 저장 시 반영")}</small>
      {draft && <small role="status">{draft.remove ? uiText("기업 정보 저장 시 로고가 제거됩니다.") : source ? uiText("기업 정보 저장 시 새 로고로 교체됩니다.") : uiText("기업 정보 저장 시 로고가 등록됩니다.")}</small>}
    </>}
    {error && <p role="alert" className="alert error">{uiText(error)}</p>}
  </div>
}
