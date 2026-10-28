import type { Workspace } from '../../types/workspace'
import { tenantStatuses as statuses } from '../../tenant-status'
import TenantAccess from '../TenantAccess'
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
      {workspace.serviceStatus === 'Suspended' ? (
        <div className="onboarding">
          <h3>기업 서비스 이용이 정지되었습니다</h3>
          <p>
            아이블 지원 담당자에게 문의해 주세요. 결제 상태와 별도로 이용정지가
            해제되어야 WMS를 이용할 수 있습니다.
          </p>
        </div>
      ) : workspace.billingAccess.canAccessWms ? (
        <TenantAccess
          key={workspace.id}
          tenantId={workspace.id}
          free={workspace.billingAccess.state === 'RegistrationMonthFree'}
          firstChargeAt={workspace.billingAccess.firstChargeAt}
          timeZone={workspace.billingPolicy.timeZoneId}
        />
      ) : (
        <div className="onboarding">
          <h3>기업 가입이 완료되었습니다</h3>
          <p>
            {workspace.billingPolicy.registrationMonthFree
              ? '가입한 달은 카드 등록 완료 후 무료로 이용할 수 있습니다. 다음 달부터 결제 확인이 필요합니다.'
              : '카드 등록 및 결제 확인 후 이용할 수 있습니다.'}
          </p>
          <ol>
            <li className="done">기업 가입 완료</li>
            <li
              className={
                workspace.billingStatus === 'PaymentRequired' ? 'done' : ''
              }
            >
              카드 등록
            </li>
            <li>가입 월 무료 이용 · 다음 달 정기결제</li>
          </ol>
          <p>
            {!workspace.billingAccess.hasRegisteredCard
              ? 'WMS를 이용하려면 결제 수단 등록이 필요합니다.'
              : '가입 월 무료 기간이 끝났습니다. 결제 확인 후 WMS를 이용할 수 있습니다.'}
          </p>
          <p>
            {workspace.canManageBilling
              ? '토스페이먼츠 카드 자동결제 연동을 준비 중입니다. 지금은 카드를 입력하거나 요금을 결제할 수 없습니다.'
              : '기업 마스터 또는 기업 관리자에게 카드 등록과 결제를 요청해 주세요.'}
          </p>
        </div>
      )}
      <section className="billing-policy">
        <h3>이용 요금 안내</h3>
        <p>
          기본 이용료{' '}
          {workspace.billingPolicy.monthlyBaseKrw.toLocaleString('ko-KR')}원 ·
          기본 포함 인원 {workspace.billingPolicy.includedUsers}명
        </p>
        <p>
          사용자 1명당 월{' '}
          {workspace.billingPolicy.monthlyPerUserKrw.toLocaleString('ko-KR')}원
          ·{' '}
          {workspace.billingPolicy.billMasterAccounts
            ? '기업 마스터 포함'
            : '기업 마스터 제외'}
        </p>
        <p>
          {workspace.billingPolicy.newMembersStartFollowingMonth
            ? '추가 직원은 추가한 달 무료, 다음 달부터 과금합니다.'
            : '추가 직원은 추가 시점부터 과금합니다.'}
        </p>
        <p>
          {workspace.billingPolicy.registrationMonthFree
            ? '신규 기업은 가입한 달 무료입니다. 카드 등록은 가입 시 진행하며 첫 결제는 다음 달에 시작됩니다.'
            : '신규 기업은 카드 등록 및 결제 후 이용할 수 있습니다.'}
        </p>
        <p>
          정기결제일: 매월 {workspace.billingPolicy.billingDayOfMonth}일 ·{' '}
          {workspace.billingPolicy.timeZoneId} 기준
        </p>
        <p>
          첫 결제 예정일:{' '}
          {new Date(workspace.billingAccess.firstChargeAt).toLocaleDateString(
            'ko-KR',
            {
              timeZone: workspace.billingPolicy.timeZoneId,
            },
          )}
        </p>
        <p>결제 수단: 토스페이먼츠 카드 자동결제 (준비 중)</p>
        <p>취소 및 환불은 아이블 관리자에게 문의해 주세요.</p>
        <small>
          실제 카드 등록·결제 연동 전입니다. 현재 결제가 청구되지 않습니다.
        </small>
      </section>
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
