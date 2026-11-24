import { useLanguage } from '../../use-language'
import { t as uiText } from '../../i18n.ts'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { findProductCodeConflict, normalizedProductCode, productCodeConflictMessage, type ProductCodeMatch } from '../../product-code-check'

export default function ProductCodeField({ value, onChange, endpoint, productId, originalCode, onConflict, revision }: {
  value: string; onChange: (value: string) => void; endpoint: string; productId?: string; originalCode?: string; onConflict: () => void; revision: number
}) {
  const language = useLanguage()
  const input = useRef<HTMLInputElement>(null), id = useId()
  const [response, setResponse] = useState<{ key: string; conflict?: ProductCodeMatch | null; failed?: boolean } | null>(null)
  const key = JSON.stringify([endpoint, productId, value, revision])
  const skip = !value.trim() || (!!originalCode && normalizedProductCode(value) === normalizedProductCode(originalCode))
  const result = !skip && response?.key === key ? response : null
  const message = result?.conflict ? productCodeConflictMessage(result.conflict) : ''
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      if (skip) return
      try {
        const conflict = await findProductCodeConflict(api, endpoint, value, productId, () => active)
        if (active) {
          setResponse({ key, conflict })
          if (conflict) onConflict()
        }
      } catch { if (active) setResponse({ key, failed: true }) }
    }, 350)
    return () => { active = false; window.clearTimeout(timer) }
  }, [key, endpoint, value, productId, skip, onConflict])
  useLayoutEffect(() => {
    input.current?.setCustomValidity(uiText(message))
    input.current?.parentElement?.querySelector('.registration-field-error')?.remove()
    input.current?.removeAttribute('aria-errormessage')
  }, [message, key, language])
  return <div className="product-code-field">
    <label htmlFor={id}>{uiText("상품코드")}</label>
    <input ref={input} id={id} data-inline-error={message ? true : undefined} onInvalid={e => {
      if (!message) return
      e.preventDefault()
      const first = e.currentTarget.form?.querySelector('input:invalid,select:invalid,textarea:invalid')
      if (first === e.currentTarget) { e.currentTarget.focus({ preventScroll: true }); e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
    }} aria-label={uiText("상품코드")} aria-invalid={!!message} aria-describedby={result?.conflict || result?.failed ? `${id}-check` : undefined} maxLength={64} placeholder={uiText("비워 두면 자동 생성")} value={value} onChange={e => { e.target.setCustomValidity(''); onChange(e.target.value) }} />
    {result?.conflict && <div id={`${id}-check`} className="product-code-check error"><span>{uiText(message)}</span> <a href={`/app/products/${encodeURIComponent(result.conflict.id)}`} target="_blank" rel="noopener noreferrer">{uiText("상품 확인 ↗")}</a></div>}
    {result?.failed && <small id={`${id}-check`} className="product-code-check">{uiText("중복 여부를 확인하지 못했습니다. 저장 시 다시 검증합니다.")}</small>}
  </div>
}
