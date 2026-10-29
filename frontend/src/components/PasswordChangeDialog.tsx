import PasswordInput from './PasswordInput'
import { formValues } from '../form-values'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import { validPersonalPassword } from '../personal-password'

export default function PasswordChangeDialog({
  name,
  loginId,
  onChanged,
  onLogout,
  onClose,
  required = false,
}: {
  name: string
  loginId: string
  onChanged?: () => Promise<unknown>
  onLogout?: () => Promise<void>
  onClose?: () => void
  required?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [succeeded, setSucceeded] = useState(false)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = formValues(form)
    if (values.newPassword.length < 8) {
      setError('비밀번호는 최소 8자 이상 입력해 주세요.')
      return
    }
    if (values.newPassword !== values.confirmPassword) {
      setError('새 비밀번호와 확인 값이 일치하지 않습니다.')
      return
    }
    if (
      !validPersonalPassword(
        values.newPassword,
        loginId,
        values.currentPassword,
      )
    ) {
      setError(
        '현재 비밀번호, 로그인 아이디 및 초기 비밀번호와 다른 8~128자의 새 비밀번호를 확인해 주세요. 영문 소문자, 숫자, 특수문자를 포함해야 합니다.',
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      await api('/api/auth/change-password', values)
      form.reset()
      setSucceeded(true)
      if (required) {
        try {
          await onChanged?.()
        } catch {
          setError(
            '비밀번호 변경은 완료되었습니다. 업무 시작을 눌러 로그인 상태를 다시 확인해 주세요.',
          )
        }
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '비밀번호를 변경하지 못했습니다.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="password-gate-dialog"
      aria-labelledby="password-change-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!required && !busy) onClose?.()
      }}
    >
      <span className="eyebrow">IEBLE WMS · 계정 보호</span>
      <h1 id="password-change-title">
        {required ? '개인 비밀번호로 변경해 주세요' : '비밀번호 변경'}
      </h1>
      <p>
        {required
          ? `${name}님, 비밀번호 변경이 필요한 계정입니다. 변경을 완료해야 업무를 시작할 수 있습니다.`
          : `${name}님의 현재 비밀번호를 확인한 후 변경합니다. 이미 변경한 적이 있다면 마지막으로 설정한 비밀번호를 입력해 주세요. 변경하면 다른 기기의 로그인은 해제됩니다.`}
      </p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {succeeded ? (
        <>
          <div className="alert success" role="status">
            비밀번호가 변경되었습니다. 다른 기기의 로그인은 해제되었으며 현재
            로그인은 유지됩니다.
          </div>
          <button
            className="primary full"
            disabled={busy}
            onClick={required ? () => window.location.reload() : onClose}
          >
            {required ? '업무 시작' : '확인'}
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <PasswordInput
              label="현재 비밀번호"
              name="currentPassword"
              required
              maxLength={128}
              autoComplete="current-password"
              autoFocus
            />
            <PasswordInput
              label="새 비밀번호"
              name="newPassword"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
            />
            <small>
              8~128자, 영문 소문자·숫자·특수문자 포함. 대문자는 선택 사항입니다.
              로그인 아이디 및 초기 비밀번호와 같게 설정할 수 없습니다.
            </small>
            <PasswordInput
              label="새 비밀번호 확인"
              name="confirmPassword"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
            />
            <button className="primary full" type="submit">
              {busy
                ? '변경 중…'
                : required
                  ? '비밀번호 변경 후 시작'
                  : '변경하기'}
            </button>
          </fieldset>
        </form>
      )}
      {required ? (
        <button className="text-button" disabled={busy} onClick={onLogout}>
          로그아웃
        </button>
      ) : (
        !succeeded && (
          <button className="text-button" disabled={busy} onClick={onClose}>
            취소
          </button>
        )
      )}
    </dialog>
  )
}
