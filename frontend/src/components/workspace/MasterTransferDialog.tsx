import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import PasswordInput from '../PasswordInput'
import OrganizationDialog from './OrganizationDialog'
import { notifyAccessChanged } from '../../access-events'

type Candidate = { userId: string; name: string; loginId: string; role: string; version: string }
type Candidates = { currentMasterVersion: string; candidates: Candidate[] }
export default function MasterTransferDialog({ tenantId, onClose, onTransferred }: { tenantId: string; onClose: () => void; onTransferred: () => Promise<unknown> }) {
  const [data, setData] = useState<Candidates | null>(null)
  const [targetId, setTargetId] = useState(''), [review, setReview] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const form = useRef<HTMLFormElement>(null), sending = useRef(false)
  const endpoint = `/api/tenants/${tenantId}/users/master-transfer`
  const target = data?.candidates.find(c => c.userId === targetId)
  useEffect(() => { let live = true; api<Candidates>(endpoint).then(d => { if (live) setData(d) }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [endpoint])
  async function transfer() {
    if (!data || !target || !review || sending.current || !form.current) return
    sending.current = true; setBusy(true); setError('')
    const values = new FormData(form.current)
    try {
      await api(endpoint, { targetUserId: target.userId, targetVersion: target.version, currentMasterVersion: data.currentMasterVersion,
        currentPassword: values.get('currentPassword'), reason: values.get('reason') })
      form.current.reset() // Credentials never enter logs, browser storage or audit payloads.
      notifyAccessChanged()
      // The transfer is committed. A failed UI refresh must not report it as a failed transfer;
      // the workspace's focus/periodic revalidation will retry the refresh.
      await onTransferred().catch(() => {})
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '위임하지 못했습니다.')
      const password = form.current?.elements.namedItem('currentPassword') as HTMLInputElement | null
      if (password) password.value = ''
      setReview(false)
    } finally { sending.current = false; setBusy(false) }
  }
  return <OrganizationDialog title="마스터 위임" busy={busy} onClose={() => review ? setReview(false) : onClose()}>
    {error && <p role="alert" className="alert error">{error}</p>}
    {!data ? <p>위임 가능한 직원을 확인하고 있습니다.</p> : <>
      <form ref={form} hidden={review} onSubmit={e => { e.preventDefault(); if (target && !busy) setReview(true) }}>
        <fieldset disabled={busy}>
          <label>위임 대상<select aria-label="위임 대상" value={targetId} onChange={e => setTargetId(e.target.value)} required>
            <option value="">직원 선택</option>{data.candidates.map(c => <option key={c.userId} value={c.userId}>{c.name} ({c.loginId}) · {c.role === 'Administrator' ? '기업 관리자' : '일반 직원'}</option>)}
          </select></label>
          <p className="organization-help">같은 기업의 활성 직원 중 최초 비밀번호 변경을 완료한 사용자만 표시됩니다.</p>
          <PasswordInput label="현재 마스터 비밀번호" name="currentPassword" autoComplete="current-password" required maxLength={128} />
          <label>위임 사유<textarea aria-label="위임 사유" name="reason" maxLength={500} required rows={3} /></label>
          <button className="primary" disabled={!target}>위임 내용 확인</button>
        </fieldset>
      </form>
      {review && <section role="alertdialog" aria-label="마스터 위임 최종 확인">
        <p>본인: 기업 마스터 → <strong>기업 관리자</strong></p>
        <p>{target?.name}: {target?.role === 'Administrator' ? '기업 관리자' : '일반 직원'} → <strong>기업 마스터</strong></p>
        <p>위임 즉시 본인의 마스터 전용 기능은 제한되고, 저장된 기업 관리자 권한이 적용됩니다. 최종 확정 시 현재 비밀번호와 대상 상태를 서버에서 다시 검사합니다.</p>
        <button className="secondary" disabled={busy} onClick={() => setReview(false)}>취소</button>{' '}
        <button className="primary" disabled={busy} onClick={transfer}>{busy ? '위임 중…' : '위임 확정'}</button>
      </section>}
    </>}
  </OrganizationDialog>
}
