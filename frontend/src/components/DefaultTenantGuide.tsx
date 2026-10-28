import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import type { Membership } from '../api'

export default function DefaultTenantGuide({
  memberships,
  onResolved,
}: {
  memberships: Membership[]
  onResolved: () => Promise<unknown>
}) {
  const [tenantId, setTenantId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/auth/default-tenant', { tenantId })
      await onResolved()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '기본 기업을 지정하지 못했습니다.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel">
      <h2>기본 기업 지정이 필요합니다</h2>
      <p>
        여러 기업에 소속되어 있어 자동 접속할 기업을 확인해야 합니다. 기본
        기업을 한 번 지정하면 다음 로그인부터 바로 접속합니다. 소속이 잘못된
        경우 기업 관리자에게 문의해 주세요.
      </p>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <form onSubmit={submit}>
        <label>
          기본 기업
          <select
            aria-label="기본 기업"
            required
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            disabled={busy}
          >
            <option value="">기본 기업을 지정하세요</option>
            {memberships.map((m) => (
              <option key={m.tenantId} value={m.tenantId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy || !tenantId}>
          {busy ? '저장 중…' : '기본 기업 저장 후 접속'}
        </button>
      </form>
    </section>
  )
}
