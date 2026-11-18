import FormLabel from './FormLabel'
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
      await api('/api/auth/select-tenant', { tenantId })
      await onResolved()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '기업에 접속하지 못했습니다.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel">
      <h2>접속할 기업 선택</h2>
      <p>접근할 기업을 선택해 주세요. 기업별 업무 권한은 각각 적용됩니다.</p>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <form onSubmit={submit}>
        <label><FormLabel required>접속할 기업</FormLabel><select
            aria-label="접속할 기업"
            required
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            disabled={busy}
          >
            <option value="">접속할 기업을 선택하세요</option>
            {memberships.map((m) => (
              <option key={m.tenantId} value={m.tenantId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy || !tenantId}>
          {busy ? '저장 중…' : '선택한 기업 접속'}
        </button>
      </form>
    </section>
  )
}
