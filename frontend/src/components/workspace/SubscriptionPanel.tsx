import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import OrganizationDialog from './OrganizationDialog'

type Subscription = {
  billingPolicyVersion: number; trialStartedAt: string | null; trialEndsAt: string; firstChargeAt: string
  billingAnchorDay: number; billingTimeZone: string; paidThrough: string | null
  autoBillingCanceled: boolean; serviceEndsAt: string | null; daysUntilFirstCharge: number
  currentUsers: number; estimatedMonthlyKrw: number; firstChargeUsers: number; firstChargeEstimateKrw: number
  reminderVisible: boolean; access: { hasRegisteredCard: boolean; canAccessWms: boolean }
  invoices: { id: string; cycleStart: string; amountKrw: number; state: string }[]
}
const date = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '미정'

export function BillingReminder({ tenantId, onCard }: { tenantId: string; onCard: () => void }) {
  const [data, setData] = useState<Subscription | null>(null)
  const [closed, setClosed] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  const sending = useRef(false)
  const base = `/api/tenants/${tenantId}/subscription`
  useEffect(() => {
    let live = true
    api<Subscription>(base).then(d => { if (live) setData(d) }).catch(() => { /* Billing page provides a retryable error. */ })
    return () => { live = false }
  }, [base])
  async function proceed(card: boolean) {
    if (sending.current) return
    sending.current = true; setBusy(true); setError('')
    try {
      if (card && feedback.trim()) await api(`${base}/feedback`, { requestId, message: feedback.trim() })
      await api(`${base}/dismiss`, {})
      setClosed(true)
      if (card) onCard()
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다. 다시 시도해 주세요.') }
    finally { sending.current = false; setBusy(false) }
  }
  if (!data?.reminderVisible || closed) return null
  return <OrganizationDialog title="첫 결제 안내" busy={busy} onClose={() => { void proceed(false) }}>
    <p>첫 결제까지 {data.daysUntilFirstCharge}일 · 예정일 {date(data.firstChargeAt)}</p>
    <p>현재 사용자 {data.currentUsers}명 · 예상 월 이용료 {data.estimatedMonthlyKrw.toLocaleString('ko-KR')}원</p>
    <p>첫 결제 예상 {data.firstChargeUsers}명 / {data.firstChargeEstimateKrw.toLocaleString('ko-KR')}원. 직원별 과금 시작일에 따라 달라질 수 있습니다.</p>
    <label>서비스 이용 소감 (선택)<textarea aria-label="서비스 이용 소감 (선택)" rows={4} maxLength={2000} value={feedback} disabled={busy} onChange={e => setFeedback(e.target.value)} /></label>
    <p className="organization-help">카드 등록하기를 누르면 작성한 소감이 아이블 관리자에게 전달됩니다. 카드정보는 이 팝업에서 입력하지 않습니다.</p>
    {error && <p className="alert error" role="alert">{error}</p>}
    <button className="primary" disabled={busy} onClick={() => { void proceed(true) }}>카드 등록하기</button>{' '}
    <button className="secondary" disabled={busy} onClick={() => { void proceed(false) }}>나중에 하기</button>
  </OrganizationDialog>
}

export default function SubscriptionPanel({ tenantId, onRefresh }: { tenantId: string; onRefresh: () => void }) {
  const [data, setData] = useState<Subscription | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const lock = useRef(false)
  const base = `/api/tenants/${tenantId}/subscription`
  useEffect(() => {
    let live = true
    api<Subscription>(base).then(d => { if (live) { setData(d); setError('') } }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [base, revision])
  async function cancel() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await api(`${base}/cancel`, {}); setConfirm(false); setNotice('자동결제가 해지되었습니다. 남은 이용기간은 유지됩니다.'); setRevision(x => x + 1); onRefresh() }
    catch (e) { setError(e instanceof Error ? e.message : '해지하지 못했습니다.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="billing-policy">
    <h3>구독 및 결제 일정</h3>
    {error && <p role="alert" className="alert error">{error}</p>}
    {notice && <p role="status" className="alert success">{notice}</p>}
    {data && <>
      <p>{data.billingPolicyVersion === 2 ? '가입일 기준 무료기간' : '기존 기업의 가입 월 무료 계약 유지'} · 무료 시작 {date(data.trialStartedAt)} · 종료 {date(data.trialEndsAt)} (이 시각부터 결제 확인 필요)</p>
      <p>첫 결제 {date(data.firstChargeAt)} · 정기결제 기준일 매월 {data.billingAnchorDay}일 (해당 날짜가 없으면 말일, 다음 달에는 원래 기준일 적용)</p>
      <p>현재 사용자 {data.currentUsers}명 · 예상 월 이용료 {data.estimatedMonthlyKrw.toLocaleString('ko-KR')}원</p>
      <p>직원 추가 월은 무료이며, 다음 달부터 도래하는 정기결제일에 과금이 시작됩니다. 비활성 직원의 과금 종료는 아직 확정되지 않아 해당 청구는 검토 대상으로 보류합니다.</p>
      <p>자동결제: {data.autoBillingCanceled ? '해지됨' : '해지하지 않음'} · 카드: {data.access.hasRegisteredCard ? '등록 확인' : '미등록'}</p>
      {data.autoBillingCanceled && <p>이용 종료 예정일: {date(data.serviceEndsAt)}. 종료 후 재결제 확인 전까지 업무 접근이 제한됩니다.</p>}
      {!data.autoBillingCanceled && <button className="secondary" onClick={() => setConfirm(true)}>자동결제 해지</button>}
      <section aria-label="카드 등록 안내"><h3>{data.autoBillingCanceled ? '카드 등록·재구독' : '카드 등록'}</h3><p>토스페이먼츠 연동 준비 중입니다. 현재 실제 카드 등록·청구·재구독을 실행할 수 없습니다.</p></section>
      <p>해지는 카드 삭제나 환불과 별개입니다. 결제 취소·환불은 고객센터 전화 문의로 접수해 주세요.</p>
      {!!data.invoices.length && <table className="wms-table"><caption>청구 처리 이력</caption><thead><tr><th>청구 기준일</th><th>금액</th><th>처리 상태</th></tr></thead><tbody>{data.invoices.map(i => <tr key={i.id}><td>{date(i.cycleStart)}</td><td>{i.amountKrw.toLocaleString('ko-KR')}원</td><td>{i.state === 'ProviderNotConfigured' ? '결제 연동 대기 (청구 안 됨)' : i.state}</td></tr>)}</tbody></table>}
    </>}
    <button className="text-button" onClick={() => setRevision(x => x + 1)}>결제 정보 새로고침</button>
    {confirm && <OrganizationDialog title="자동결제 해지 확인" busy={busy} onClose={() => setConfirm(false)}>
      <p>다음 정기결제부터 자동 청구를 중단하시겠습니까? 이미 결제한 기간과 남은 무료기간은 유지됩니다. 환불은 별도 문의가 필요합니다.</p>
      {error && <p role="alert">{error}</p>}
      <button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>취소</button>{' '}<button className="primary" disabled={busy} onClick={cancel}>확인</button>
    </OrganizationDialog>}
  </section>
}
