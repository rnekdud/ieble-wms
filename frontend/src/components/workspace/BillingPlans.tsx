import { t as uiText, getLocale } from '../../i18n.ts'
import { useEffect, useState } from 'react'
import { billingPreviewPolicy, eventEndTime, pricingEstimate } from '../../billing-pricing'
import type { PricingPreview } from '../../billing-pricing'
import './billing-plans.css'
const won = (value: number) => uiText('{v0}원', { v0:value.toLocaleString(getLocale()) })
export default function BillingPlans({ users, preview, receivedAt, nextChargeAt, providerConfigured, canceled, hasCard }: {
  users: number; preview?: PricingPreview; receivedAt: number; nextChargeAt?: string | null
  providerConfigured: boolean; canceled: boolean; hasCard: boolean
}) {
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [clock, setClock] = useState<{ receivedAt: number; now: number } | null>(null)
  const policy = preview?.policy || billingPreviewPolicy
  const serverEpoch = preview ? Date.parse(preview.asOf) : null
  const serverNow = serverEpoch === null ? null : Math.max(serverEpoch, clock?.receivedAt === receivedAt ? clock.now : serverEpoch)
  const end = eventEndTime(policy)
  useEffect(() => {
    if (serverEpoch === null || !Number.isFinite(serverEpoch) || end === null || !Number.isFinite(end) || (serverNow !== null && serverNow >= end)) return
    const remaining = end - serverEpoch - Math.max(0, performance.now() - receivedAt)
    // Timers use elapsed time, not the phone/PC calendar. Re-check long events daily.
    const timer = window.setTimeout(() => setClock({ receivedAt, now: serverEpoch + Math.max(0, performance.now() - receivedAt) }), Math.max(1, Math.min(remaining + 1, 86400000)))
    return () => clearTimeout(timer)
  }, [serverEpoch, serverNow, end, receivedAt])
  const estimate = pricingEstimate(users, policy, serverNow), annual = period === 'annual'
  return <div className="billing-plans">
    <section className="billing-event" aria-label={uiText("오픈 이벤트")}>
      <h3>{estimate.eventActive ? uiText("오픈 이벤트") : !estimate.known ? uiText("오픈 이벤트 적용 확인") : uiText("일반 요금 안내")}</h3>
      {estimate.eventActive ? <><p className="billing-price">{uiText("1인당 월")} {won(policy.eventMonthlyPerUserKrw)}</p><p>{uiText("월간·연간 결제 모두 적용 · 연간은 월 환산 금액")}</p><p>{uiText("정상 월간")} <del>{won(policy.monthlyPerUserKrw)}</del> {uiText("· 이벤트")} {won(policy.eventMonthlyPerUserKrw)}</p></> : <p>{estimate.known ? uiText("오픈 이벤트가 종료되었거나 적용되지 않습니다. 신규 예상 요금은 일반 단가로 계산합니다.") : uiText("서버 기준 이벤트 종료 여부를 확인할 수 없어 예상 결제금액을 표시하지 않습니다.")}</p>}
      <p>{policy.eventEndsOn ? uiText("{v0}까지 (한국 시간 기준)", { v0: policy.eventEndsOn }) : uiText("이벤트 종료일 미정")}</p>
      <p className="organization-help">{uiText("이벤트 종료 후 일반 요금 적용. 이미 결제한 기간의 금액은 소급 변경하거나 차액을 즉시 청구하지 않습니다.")}</p>
    </section>
    <section aria-label={uiText("월간·연간 요금 비교")}>
      <h3>{uiText("요금제 비교")}</h3><p className="organization-help">{uiText("선택은 예상 비용 계산용이며 계약 변경이나 결제가 실행되지 않습니다.")}</p>
      <div className="billing-plan-options">
        <button type="button" className="billing-plan-option" aria-pressed={!annual} onClick={() => setPeriod('monthly')} aria-label={uiText("월간 결제 예상 요금 선택")}>
          <strong>{uiText("월간 결제")}</strong><span className="billing-price">{won(policy.monthlyPerUserKrw)} <small>{uiText("/ 인 · 월")}</small></span><span>{uiText("사용자 수에 따라 매월 계산")}</span>
          {estimate.eventActive && <span>{uiText("이벤트")} {won(policy.eventMonthlyPerUserKrw)} {uiText("/ 인 · 월")}</span>}
        </button>
        <button type="button" className="billing-plan-option" aria-pressed={annual} onClick={() => setPeriod('annual')} aria-label={uiText("연간 결제 예상 요금 선택")}>
          <strong>{uiText("연간 결제")} <span className="billing-discount">{policy.annualDiscountPercent}{uiText("% 할인")}</span></strong><span className="billing-price">{won(estimate.annualMonthly)} <small>{uiText("/ 인 · 월 환산")}</small></span><span>{won(estimate.annualMonthly * 12)} {uiText("/ 인 · 연")}</span>
          {estimate.eventActive && <span>{uiText("이벤트")} {won(policy.eventMonthlyPerUserKrw)} {uiText("/ 인 · 월 환산")}<br />{won(policy.eventMonthlyPerUserKrw * 12)} {uiText("/ 인 · 연 · 중복 할인 없음")}</span>}
        </button>
      </div>
    </section>
    <section aria-label={uiText("현재 이용 및 결제 예정")}>
      <h3>{uiText("현재 이용 및 결제 예정")}</h3>
      <dl className="billing-estimate-grid">
        <div><dt>{uiText("현재 사용 인원")}</dt><dd data-billing-users>{users}{uiText("명")}</dd></div>
        <div><dt>{uiText("적용 요금제")}</dt><dd>{uiText("기존 월간 계약")}{canceled ? uiText("· 자동결제 해지됨") : ''}</dd></div>
        <div><dt>{uiText("예상 요금 계산 기준")}</dt><dd>{annual ? uiText("연간 · 12개월 선결제 가정") : uiText("월간")}{estimate.eventActive ? uiText("· 오픈 이벤트") : uiText("· 일반 요금")}</dd></div>
        <div><dt>{uiText("예상 인당 요금")}</dt><dd>{estimate.known ? annual ? uiText("{v0} / 월 환산 · {v1} / 연", { v0: won(estimate.annualUnit / 12), v1: won(estimate.annualUnit) }) : uiText("{v0} / 월", { v0: won(estimate.monthlyUnit) }) : uiText("확인 필요")}</dd></div>
        <div><dt>{uiText("다음 결제 예정일")}</dt><dd>{providerConfigured && !canceled && nextChargeAt ? new Date(nextChargeAt).toLocaleDateString(getLocale(), { timeZone: 'Asia/Seoul' }) : uiText("미정")}{!providerConfigured && <small>{uiText("PG 미연동 · 실제 결제 일정 미확정")}</small>}</dd></div>
        <div><dt>{uiText("예상 결제금액")}</dt><dd className="billing-total" data-billing-total>{estimate.known ? uiText("{v0} / {v1}", { v0: won(annual ? estimate.annualTotal : estimate.monthlyTotal), v1: annual ? uiText('연') : uiText('월') }) : uiText("확인 필요")}</dd></div>
        <div><dt>{uiText("결제수단 연결 상태")}</dt><dd>{hasCard ? uiText("카드 등록 확인 기록 있음") : uiText("등록된 카드 없음")}<small>{uiText("실제 카드 연결·승인 상태는 PG 연동 후 확인할 수 있습니다.")}</small></dd></div>
      </dl>
      {nextChargeAt && <p className="organization-help">{uiText("기존 계약상 결제 기준일:")} {new Date(nextChargeAt).toLocaleString(getLocale(), { timeZone: 'Asia/Seoul' })}{uiText(". 위 선택으로 기존 결제 일정이 바뀌지 않습니다.")}</p>}
      <p className="organization-help">{uiText("현재 활성 사용자 집계 기준의 예상 금액입니다. 연간 선결제 전환·갱신·중도 인원 변경 및 새 요금제의 무료 체험 정책은 확정 전이며, 기존 계약·청구 기록은 유지됩니다.")}</p>
    </section>
    <section aria-label={uiText("결제수단 관리")}>
      <h3>{uiText("결제수단 관리")}</h3><strong>{uiText("카드 결제 서비스 준비 중")}</strong>
      <p>{uiText("안정적인 결제 서비스 제공을 위해 PG사 연동을 준비하고 있습니다.")}</p><p>{uiText("연동 완료 후 결제수단 등록 및 자동결제를 이용하실 수 있습니다.")}</p>
      <p className="organization-help">{uiText("온라인 카드 등록·카드 해지는 아직 연결되어 있지 않습니다. 기존 자동결제 해지와 카드 삭제는 별개입니다.")}</p>
    </section>
  </div>
}
