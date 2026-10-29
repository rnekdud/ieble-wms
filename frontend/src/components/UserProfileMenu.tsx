import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, KeyRound, LogOut, UserRound } from 'lucide-react'
import type { Session } from '../api'
import PasswordChangeDialog from './PasswordChangeDialog'

export default function UserProfileMenu({
  session,
  roleLabel,
  busy,
  onLogout,
}: {
  session: Session
  roleLabel: string
  busy: boolean
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const [changing, setChanging] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <div
      className="user-profile"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        className="user-profile-trigger"
        ref={trigger}
        aria-label="사용자 프로필 메뉴"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        <UserRound size={18} aria-hidden="true" />
        <span>
          <strong>{session.user.displayName}</strong>
          <small>{roleLabel}</small>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="user-profile-panel" id={panelId}>
          <button
            onClick={() => {
              setOpen(false)
              setChanging(true)
            }}
          >
            <KeyRound size={16} aria-hidden="true" />
            비밀번호 변경
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            로그아웃
          </button>
        </div>
      )}
      {changing && (
        <PasswordChangeDialog
          name={session.user.displayName}
          loginId={session.user.userName}
          onClose={() => {
            setChanging(false)
            trigger.current?.focus()
          }}
        />
      )}
    </div>
  )
}
