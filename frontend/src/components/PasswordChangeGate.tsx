import PasswordChangeDialog from './PasswordChangeDialog'

export default function PasswordChangeGate(props: {
  name: string
  loginId: string
  onChanged: () => Promise<unknown>
  onLogout: () => Promise<void>
}) {
  return (
    <main className="password-gate-screen">
      <PasswordChangeDialog {...props} required />
    </main>
  )
}
