import { useLanguage } from '../../use-language'
import { t as uiText } from '../../i18n.ts'
import { useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { eachQuantityError, isEachUnit, isQuantityDraft } from '../../quantity-input'
import './quantity-input.css'

type Props = InputHTMLAttributes<HTMLInputElement> & { unit?: string | null }
/** Reject invalid input without rounding or changing the last accepted quantity. */
export default function QuantityInput({ unit, onChange, onKeyDown, onBeforeInput, onPaste, onDrop, onBlur, value, step, className, ...props }: Props) {
  const language = useLanguage()
  const input = useRef<HTMLInputElement>(null)
  const id = useId(), [rejected, setRejected] = useState<{ value: typeof value; message: string } | null>(null)
  const integer = isEachUnit(unit) || !unit
  const error = eachQuantityError(value as string | number | undefined, unit) || (rejected?.value === value ? rejected?.message : '')
  const reject = () => setRejected({ value, message: integer ? '수량은 부호 없이 정수로 입력해 주세요.' : '수량은 부호 없이 숫자로 입력해 주세요.' })
  useLayoutEffect(() => { input.current?.setCustomValidity(uiText(error || '')) }, [error, language])
  return <><input {...props} ref={input} className={['quantity-input', className].filter(Boolean).join(' ')} min={integer && Number(props.min) === 0.001 ? 1 : props.min} type="number" value={value} step={integer ? 1 : step || '0.001'} inputMode={integer ? 'numeric' : 'decimal'}
    aria-invalid={!!error || props['aria-invalid']} aria-describedby={[props['aria-describedby'], error && id].filter(Boolean).join(' ') || undefined}
    onChange={event => {
      if (event.currentTarget.validity.badInput || !isQuantityDraft(event.target.value, unit)) {
        event.currentTarget.value = String(value ?? '')
        reject(); return
      }
      setRejected(null); event.currentTarget.setCustomValidity(''); onChange?.(event)
    }}
    onKeyDown={event => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && !isQuantityDraft(event.key, unit)) {
        event.preventDefault(); reject(); return
      }
      if (error && event.key === 'Enter') { event.preventDefault(); return }
      onKeyDown?.(event)
    }} onBeforeInput={event => {
      const data = (event.nativeEvent as InputEvent).data
      if (data && !isQuantityDraft(data, unit)) { event.preventDefault(); reject(); return }
      onBeforeInput?.(event)
    }} onPaste={event => {
      const text = event.clipboardData.getData('text').trim()
      if (!isQuantityDraft(text, unit)) { event.preventDefault(); reject(); return }
      setRejected(null); onPaste?.(event)
    }} onDrop={event => {
      if (!isQuantityDraft(event.dataTransfer.getData('text').trim(), unit)) { event.preventDefault(); reject(); return }
      onDrop?.(event)
    }} onBlur={event => { if (!error) onBlur?.(event) }} />
    {error && <small id={id} className="quantity-input-error" role="alert">{uiText(error)}</small>}
  </>
}
