import { useId, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string
}

// Reuse for registration, login, password changes and future reset forms.
// Keep only visibility/validation state; never copy credentials to storage.
export default function PasswordInput({
  label,
  id,
  minLength,
  onInput,
  onBlur,
  onInvalid,
  ...props
}: Props) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [visible, setVisible] = useState(false)
  const [tooShort, setTooShort] = useState(false)
  const message = `비밀번호는 최소 ${minLength}자 이상 입력해 주세요.`
  return (
    <div className="password-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-input-wrap">
        <input
          {...props}
          id={inputId}
          type={visible ? 'text' : 'password'}
          minLength={minLength}
          aria-invalid={tooShort || props['aria-invalid'] || undefined}
          aria-describedby={
            [props['aria-describedby'], tooShort ? `${inputId}-error` : '']
              .filter(Boolean)
              .join(' ') || undefined
          }
          onInput={(event) => {
            event.currentTarget.setCustomValidity('')
            if (tooShort)
              setTooShort(
                !!minLength && event.currentTarget.value.length < minLength,
              )
            onInput?.(event)
          }}
          onBlur={(event) => {
            setTooShort(
              !!minLength &&
                event.currentTarget.value.length > 0 &&
                event.currentTarget.value.length < minLength,
            )
            onBlur?.(event)
          }}
          onInvalid={(event) => {
            const short =
              !!minLength && event.currentTarget.value.length < minLength
            setTooShort(short)
            event.currentTarget.setCustomValidity(short ? message : '')
            onInvalid?.(event)
          }}
        />
        <button
          type="button"
          className="password-visibility"
          disabled={props.disabled}
          aria-label={`${label} ${visible ? '숨기기' : '표시'}`}
          aria-pressed={visible}
          aria-controls={inputId}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? (
            <EyeOff size={18} aria-hidden="true" />
          ) : (
            <Eye size={18} aria-hidden="true" />
          )}
        </button>
      </div>
      {tooShort && (
        <small
          className="password-field-error"
          id={`${inputId}-error`}
          role="alert"
        >
          {message}
        </small>
      )}
    </div>
  )
}
