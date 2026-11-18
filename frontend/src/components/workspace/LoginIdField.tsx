import FormLabel from '../FormLabel'
import { useEffect, useState } from 'react'
import { api } from '../../api'

export default function LoginIdField({ endpoint, onAvailable, unavailableValue }: { endpoint: string; unavailableValue?: string; onAvailable: (available: boolean) => void }) {
  const [value, setValue] = useState('')
  const [feedback, setFeedback] = useState<{ value: string; available: boolean; message: string }>()
  const normalized = value.trim()
  const rejected = normalized !== '' && normalized === unavailableValue
  const valid = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(normalized)
  useEffect(() => {
    let live = true
    onAvailable(false)
    if (!valid || rejected) return
    const timer = window.setTimeout(() => {
      api<{ available: boolean; message: string }>(`${endpoint}/login-id-check`, { loginId: normalized })
        .then(result => { if (live) { setFeedback({ value: normalized, ...result }); onAvailable(result.available) } })
        .catch(e => { if (live) setFeedback({ value: normalized, available: false, message: e instanceof Error ? e.message : '아이디 중복 여부를 확인하지 못했습니다.' }) })
    }, 500)
    return () => { live = false; clearTimeout(timer) }
  }, [endpoint, normalized, valid, rejected, onAvailable])
  const current = rejected ? { available: false, message: '이미 사용 중인 로그인 아이디입니다. 다른 아이디를 입력해 주세요.' } : feedback?.value === normalized ? feedback : undefined
  return <div><label><FormLabel required>로그인 아이디</FormLabel><input aria-label={"로그인 아이디"} name="loginId" value={value} required minLength={3} maxLength={64} pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,63}" autoComplete="off" aria-describedby="employee-login-id-status" aria-invalid={!!current && !current.available} onChange={e => { onAvailable(false); setFeedback(undefined); setValue(e.target.value) }} onBlur={() => setValue(normalized)} /></label>
    <p id="employee-login-id-status" className="organization-help" role="status">{current?.message || (valid ? '아이디 중복 확인 중…' : value ? '영문·숫자로 시작하는 3~64자의 아이디를 입력해 주세요.' : '')}</p>
  </div>
}
