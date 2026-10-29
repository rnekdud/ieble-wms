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
  onRefresh,
}: {
  workspace: Workspace
  onRefresh: () => void
}) {
  return (
    <div className="panel company-panel">
      <div className="panel-title">
        <h2>{workspace.name}</h2>
        <span
          className={`badge ${workspace.serviceStatus === 'Active' ? 'active' : ''}`}
        >
          {statuses[workspace.serviceStatus]}
        </span>
      </div>
      <dl>
        <div>
          <dt>내 권한</dt>
          <dd>{roles[workspace.role]}</dd>
        </div>
        <div>
          <dt>사업자등록번호</dt>
          <dd>{workspace.businessRegistrationNumber || '미등록'}</dd>
        </div>
      </dl>
      {workspace.serviceStatus === 'Suspended' ? <p role="alert">기업 서비스 이용이 정지되었습니다. 아이블 지원 담당자에게 문의해 주세요.</p> :
        <p>{workspace.billingAccess.canAccessWms ? '현재 WMS를 이용할 수 있습니다.' : '이용기간 또는 결제 확인이 필요합니다. 기업 마스터에게 문의해 주세요.'}</p>}
      <section className="billing-policy"><h3>이용 요금 안내</h3>
        <p>사용자당 월 {workspace.billingPolicy.monthlyPerUserKrw.toLocaleString('ko-KR')}원 · 기업 마스터 포함</p>
        <p>기본 이용료 {workspace.billingPolicy.monthlyBaseKrw.toLocaleString('ko-KR')}원 · 포함 인원 {workspace.billingPolicy.includedUsers}명</p>
        <p>{workspace.billingPolicyVersion === 2 ? '가입일 기준 무료기간이 적용됩니다. 아래 종료 시각을 확인해 주세요.' : '기존 기업은 가입 월 무료 정책을 유지합니다. 카드 등록 및 기존 결제 접근 조건이 적용됩니다.'}</p>
      </section>
      {workspace.canManageBilling && <SubscriptionPanel tenantId={workspace.id} onRefresh={onRefresh} />}
      {workspace.latestChange && (
        <div className="status-reason">
          <h3>최근 상태 변경 안내</h3>
          <p>{workspace.latestChange.reason}</p>
          <small>
            {new Date(workspace.latestChange.changedAt).toLocaleString('ko-KR')}
          </small>
        </div>
      )}
      <button className="secondary" onClick={onRefresh}>
        상태 새로고침
      </button>
    </div>
  )
}
