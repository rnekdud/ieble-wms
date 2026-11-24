import { t as uiText, getLocale } from '../../i18n.ts'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import OrganizationDialog from './OrganizationDialog'
import BillingPlans from './BillingPlans'
import type { PricingPreview } from '../../billing-pricing'
import DevelopmentAccessNotice from './DevelopmentAccessNotice'

type Subscription = {
  nextChargeAt?: string | null
  pricingPreview?: PricingPreview
  providerConfigured: boolean
  billingPolicyVersion: number; trialStartedAt: string | null; trialEndsAt: string; firstChargeAt: string
  billingAnchorDay: number; billingTimeZone: string; paidThrough: string | null
  autoBillingCanceled: boolean; serviceEndsAt: string | null; daysUntilFirstCharge: number
  currentUsers: number; estimatedMonthlyKrw: number; firstChargeUsers: number; firstChargeEstimateKrw: number
  reminderVisible: boolean; access: { state: string; hasRegisteredCard: boolean; canAccessWms: boolean; developmentTest?: { startsAt: string; endsAt: string }; actualBillingState?: string }
  invoices: { id: string; cycleStart: string; amountKrw: number; state: string }[]
}
const date = (value: string | null) => value ? new Date(value).toLocaleString(getLocale(), { timeZone: 'Asia/Seoul' }) : uiText('미정')

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
  return <OrganizationDialog title={uiText("첫 결제 안내")} className="billing-reminder-dialog" busy={busy} onClose={() => { void proceed(false) }} actions={<>
    <button type="button" className="secondary" disabled={busy} onClick={() => { void proceed(false) }}>{uiText("나중에 하기")}</button>
    <button type="button" className="primary" disabled={busy} onClick={() => { void proceed(true) }}>{uiText("결제 관리 보기")}</button>
  </>}>
    {data.providerConfigured === false && <p>{uiText("카드 등록 기능은 현재 준비 중입니다. 결제 관련 내용은 결제 관리에서 확인할 수 있습니다.")}</p>}
    <p>{uiText("첫 결제까지")} {data.daysUntilFirstCharge}{uiText("일 · 예정일")} {date(data.firstChargeAt)}</p>
    <p>{uiText("현재 사용자")} {data.currentUsers}{uiText("명 · 예상 월 이용료")} {data.estimatedMonthlyKrw.toLocaleString(getLocale())}{uiText("원")}</p>
    <p>{uiText("첫 결제 예상")} {data.firstChargeUsers}{uiText("명 /")} {data.firstChargeEstimateKrw.toLocaleString(getLocale())}{uiText("원. 직원별 과금 시작일에 따라 달라질 수 있습니다.")}</p>
    <label>{uiText("서비스 이용 소감 (선택)")}<textarea aria-label={uiText("서비스 이용 소감 (선택)")} rows={4} maxLength={2000} value={feedback} disabled={busy} onChange={e => setFeedback(e.target.value)} /></label>
    <p className="organization-help">{uiText("결제 관리 보기를 누르면 작성한 소감이 아이블 관리자에게 전달됩니다. 카드정보는 이 팝업에서 입력하지 않습니다.")}</p>
    {error && <p className="alert error" role="alert">{uiText(error)}</p>}
  </OrganizationDialog>
}

export default function SubscriptionPanel({ tenantId, onRefresh, onSupport, pricingPage = false }: { pricingPage?: boolean; tenantId: string; onRefresh: () => void; onSupport: () => void }) {
  const [receivedAt, setReceivedAt] = useState(0)
  const [data, setData] = useState<Subscription | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const lock = useRef(false)
  const base = `/api/tenants/${tenantId}/subscription`
  useEffect(() => {
    let live = true, loading = false
    const load = async () => {
      if (loading) return
      loading = true
      try { const d = await api<Subscription>(base); if (live) { setData(d); setReceivedAt(performance.now()); setError('') } }
      catch (e) { if (live) setError(e instanceof Error ? e.message : '결제 정보를 조회하지 못했습니다.') }
      finally { loading = false }
    }
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    const timer = pricingPage ? window.setInterval(refresh, 30000) : undefined
    if (pricingPage) { window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh) }
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [base, revision, pricingPage])
  async function cancel() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await api(`${base}/cancel`, {}); setConfirm(false); setNotice('자동결제가 해지되었습니다. 남은 이용기간은 유지됩니다.'); setRevision(x => x + 1); onRefresh() }
    catch (e) { setError(e instanceof Error ? e.message : '해지하지 못했습니다.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className={pricingPage ? "billing-pricing-page" : "billing-policy"}>
    {!pricingPage && <h3>{uiText("구독 및 결제 일정")}</h3>}
    {!data && !error && <p role="status">{uiText("요금 및 이용 현황을 불러오는 중…")}</p>}
    {error && <p role="alert" className="alert error">{uiText(error)}{pricingPage && <button type="button" className="secondary" onClick={() => setRevision(x => x + 1)}>{uiText("다시 시도")}</button>}</p>}
    {notice && <p role="status" className="alert success">{uiText(notice)}</p>}
    {data && <>
      {pricingPage && <BillingPlans users={data.currentUsers} preview={data.pricingPreview} receivedAt={receivedAt} nextChargeAt={data.nextChargeAt} providerConfigured={data.providerConfigured} canceled={data.autoBillingCanceled} hasCard={data.access.hasRegisteredCard} />}
      <section className={pricingPage ? 'billing-policy' : undefined}>
      {pricingPage && <h3>{uiText("환불 및 카드 해지 정책")}</h3>}
      <DevelopmentAccessNotice access={data.access} />
      <p>{data.billingPolicyVersion === 2 ? uiText("가입일 기준 무료기간") : uiText("기존 기업의 가입 월 무료 계약 유지")} {uiText("· 무료 시작")} {date(data.trialStartedAt)} {uiText("· 종료")} {date(data.trialEndsAt)} {uiText("(이 시각부터 결제 확인 필요)")}</p>
      <p>{uiText("첫 결제")} {date(data.firstChargeAt)} {uiText("· 정기결제 기준일 매월")} {data.billingAnchorDay}{uiText("일 (해당 날짜가 없으면 말일, 다음 달에는 원래 기준일 적용)")}</p>
      {!pricingPage && <p>{uiText("현재 사용자")} {data.currentUsers}{uiText("명 · 예상 월 이용료")} {data.estimatedMonthlyKrw.toLocaleString(getLocale())}{uiText("원")}</p>}
      <p>{uiText("직원 추가 월은 무료이며, 다음 달부터 도래하는 정기결제일에 과금이 시작됩니다. 비활성 직원의 과금 종료는 아직 확정되지 않아 해당 청구는 검토 대상으로 보류합니다.")}</p>
      <p>{uiText("자동결제:")} {data.autoBillingCanceled ? uiText("해지됨") : uiText("해지하지 않음")} {uiText("· 카드:")} {data.access.hasRegisteredCard ? uiText("등록 확인") : uiText("미등록")}</p>
      {data.autoBillingCanceled && <p>{uiText("이용 종료 예정일:")} {date(data.serviceEndsAt)}{uiText(". 종료 후 재결제 확인 전까지 업무 접근이 제한됩니다.")}</p>}
      {pricingPage && <p className="organization-help">{uiText("아래 자동결제 해지는 기존 계약의 자동 청구를 중단하는 기능이며, 카드사 해지나 환불을 실행하지 않습니다.")}</p>}
      {!data.autoBillingCanceled && <button className="secondary" onClick={() => setConfirm(true)}>{uiText("자동결제 해지")}</button>}
      <section aria-label={uiText("카드 등록 안내")}>
        {!pricingPage && data.providerConfigured === false && <><h3>{uiText("카드 등록 기능 준비 중")}</h3><p>{uiText("현재 온라인 카드 등록 및 자동결제 연동을 준비하고 있습니다.")}</p></>}
        <p>{uiText("결제 및 이용 관련 문의는 아이블 WMS 고객지원으로 연락해 주세요.")}</p>
        <p>{uiText("이메일:")} <a href="mailto:contact@ieble.com">contact@ieble.com</a><br />{uiText("전화번호:")} <a href="tel:07087879532">070-8787-9532</a><br />{uiText("서비스 내")} <a href="/app/support" onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); onSupport() } }}>{uiText("문의하기")}</a></p>
      </section>
      <p>{uiText("해지는 카드 삭제나 환불과 별개입니다. 결제 취소·환불은 고객센터 전화 문의로 접수해 주세요.")}</p>
      </section>
      {!!data.invoices.length && <table className="wms-table"><caption>{uiText("청구 처리 이력")}</caption><thead><tr><th>{uiText("청구 기준일")}</th><th>{uiText("금액")}</th><th>{uiText("처리 상태")}</th></tr></thead><tbody>{data.invoices.map(i => <tr key={i.id}><td>{date(i.cycleStart)}</td><td>{i.amountKrw.toLocaleString(getLocale())}{uiText("원")}</td><td>{i.state === 'ProviderNotConfigured' ? uiText("결제 연동 대기 (청구 안 됨)") : i.state}</td></tr>)}</tbody></table>}
    </>}
    {confirm && <OrganizationDialog confirmation title={uiText("자동결제 해지 확인")} busy={busy} onClose={() => setConfirm(false)}>
      <p>{uiText("다음 정기결제부터 자동 청구를 중단하시겠습니까? 이미 결제한 기간과 남은 무료기간은 유지됩니다. 환불은 별도 문의가 필요합니다.")}</p>
      {error && <p role="alert">{uiText(error)}</p>}
      <button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>{uiText("취소")}</button>{' '}<button className="primary" disabled={busy} onClick={cancel}>{uiText("확인")}</button>
    </OrganizationDialog>}
  </section>
}
