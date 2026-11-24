import { t as uiText, getLocale } from '../../i18n.ts'
import SubscriptionPanel from './SubscriptionPanel'
import type { Workspace } from '../../types/workspace'
import { tenantStatuses as statuses } from '../../tenant-status'
const roles: Record<string, string> = {
  Master: '기업 마스터',
  Administrator: '기업 관리자',
  Employee: '일반 직원',
}
export default function BillingNotice({
  workspace,
  pricingPage = false,
  onRefresh,
  onSupport,
}: {
  pricingPage?: boolean
  workspace: Workspace
  onRefresh: () => void
  onSupport: () => void
}) {
  if (pricingPage) return workspace.canManageBilling
    ? <SubscriptionPanel key={workspace.id} pricingPage tenantId={workspace.id} onRefresh={onRefresh} onSupport={onSupport} />
    : <p role="alert">{uiText("결제 정보는 기업 마스터 권한으로 확인할 수 있습니다.")}</p>
  return (
    <div className="panel company-panel">
      <div className="panel-title">
        <h2>{workspace.name}</h2>
        <span
          className={`badge ${workspace.serviceStatus === 'Active' ? 'active' : ''}`}
        >
          {uiText(statuses[workspace.serviceStatus])}
        </span>
      </div>
      <dl>
        <div>
          <dt>{uiText("내 권한")}</dt>
          <dd>{uiText(roles[workspace.role])}</dd>
        </div>
        <div>
          <dt>{uiText("사업자등록번호")}</dt>
          <dd>{workspace.businessRegistrationNumber || uiText("미등록")}</dd>
        </div>
      </dl>
      {workspace.serviceStatus === 'Suspended' ? <p role="alert">{uiText("기업 서비스 이용이 정지되었습니다. 아이블 지원 담당자에게 문의해 주세요.")}</p> : <p>{workspace.billingAccess.developmentTest ? uiText("개발 테스트 이용 중입니다. 실제 결제 상태는 별도로 유지됩니다.") : workspace.billingAccess.canAccessWms ? uiText("현재 WMS를 이용할 수 있습니다.") : uiText("이용기간 또는 결제 확인이 필요합니다. 기업 마스터에게 문의해 주세요.")}</p>}
      <section className="billing-policy"><h3>{uiText("이용 요금 안내")}</h3>
        <p>{uiText("사용자당 월")} {workspace.billingPolicy.monthlyPerUserKrw.toLocaleString(getLocale())}{uiText("원 · 기업 마스터 포함")}</p>
        <p>{uiText("기본 이용료")} {workspace.billingPolicy.monthlyBaseKrw.toLocaleString(getLocale())}{uiText("원 · 포함 인원")} {workspace.billingPolicy.includedUsers}{uiText("명")}</p>
        <p>{workspace.billingPolicyVersion === 2 ? uiText("가입일 기준 무료기간이 적용됩니다. 아래 종료 시각을 확인해 주세요.") : uiText("기존 기업은 가입 월 무료 정책을 유지합니다. 카드 등록 및 기존 결제 접근 조건이 적용됩니다.")}</p>
      </section>
      {workspace.canManageBilling && <SubscriptionPanel tenantId={workspace.id} onRefresh={onRefresh} onSupport={onSupport} />}
      {workspace.latestChange && (
        <div className="status-reason">
          <h3>{uiText("최근 상태 변경 안내")}</h3>
          <p>{workspace.latestChange.reason}</p>
          <small>
            {new Date(workspace.latestChange.changedAt).toLocaleString(getLocale())}
          </small>
        </div>
      )}
      <button className="secondary" onClick={onRefresh}> {uiText("상태 새로고침")} </button>
    </div>
  )
}
