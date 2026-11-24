import { t as uiText, getLocale } from '../i18n.ts'
import { supportStatuses } from '../support-model'
import { useState } from 'react'
import OrganizationDialog from './workspace/OrganizationDialog'
import { InquiryDetail } from './workspace/SupportManagement'
import { useReportRead } from './workspace/useReportRead'
import { billingStatuses, tenantStatuses } from '../tenant-status'
type Detail = {
  tenant: { id: string; code: string; name: string; businessRegistrationNumber: string | null; representativeName: string | null; address: string | null; contactName: string | null; contactPhone: string | null; createdAt: string; serviceStatus: string; billingStatus: string }
  masters: { name: string; email: string }[]; userCount: number; warehouseCount: number; productCount: number
  billing: { billingPolicyVersion: number; trialStartedAt: string | null; trialEndsAt: string; firstChargeAt: string; nextChargeAt?: string | null; currentUsers: number; estimatedMonthlyKrw: number; autoBillingCanceled: boolean; autoBillingCanceledAt: string | null; serviceEndsAt: string | null; providerConfigured: boolean; access: { state: string; developmentTest?: { startsAt: string; endsAt: string } }; invoices: { id: string; state: string; amountKrw: number; cycleStart: string }[] }
  policy: { monthlyPerUserKrw: number; monthlyBaseKrw: number }; inquiries: { id: string; title: string; status: string; createdAt: string }[]
}
const date = (s: string | null | undefined) => s ? new Date(s).toLocaleString(getLocale(), { timeZone: 'Asia/Seoul' }) : '미기록'
export default function AdminTenantDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [tab, setTab] = useState('company')
  const view = useReportRead<Detail>(`/api/admin/tenants/${id}`), d = view.data, [inquiry, setInquiry] = useState<string | null>(null)
  if (inquiry) return <InquiryDetail endpoint="/api/admin/support" id={inquiry} admin onClose={() => setInquiry(null)} onChanged={() => {}} />
  return <OrganizationDialog title={uiText("기업 상세 및 이용 현황")} wide onClose={onClose}>{view.error && <p role="alert">{uiText(view.error)}</p>}{view.loading && <p role="status">{uiText("기업 정보를 불러오는 중입니다.")}</p>}{d && <div className="support-detail">
    <h3>{d.tenant.name}</h3><nav className="wms-segmented dialog-detail-tabs" aria-label={uiText("기업 상세 보기")}>{[['company','기업 정보'],['billing','요금제 및 결제'],['support','문의 내역']].map(([key,label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{uiText(label)}</button>)}</nav><section hidden={tab !== 'company'}><dl className="admin-detail-grid">{[
      ['기업 코드', d.tenant.code], ['사업자등록번호', d.tenant.businessRegistrationNumber || uiText('미등록')], ['대표자', d.tenant.representativeName || uiText('미등록')], ['주소', d.tenant.address || uiText('미등록')], ['기업 마스터', d.masters.map(x => `${x.name} (${x.email})`).join(', ') || uiText('없음')], ['담당자', [d.tenant.contactName, d.tenant.contactPhone].filter(Boolean).join(' · ') || uiText('미등록')], ['활성 사용자', uiText('{v0}명', { v0: d.userCount })], ['등록 창고 / 상품', uiText('{v0}개 / {v1}개', { v0: d.warehouseCount, v1: d.productCount })], ['가입일', date(d.tenant.createdAt)], ['이용 상태', uiText(tenantStatuses[d.tenant.serviceStatus])], ['최근 접속일', uiText('미기록 (접속 시각 저장 기능 없음)')],
    ].map(([label, value]) => <div key={label}><dt>{uiText(label)}</dt><dd>{value}</dd></div>)}</dl>
    </section><section hidden={tab !== 'billing'}><h3>{uiText("요금제 및 결제 상태")}</h3><p className="alert">{uiText("결제 제공사 연동 전 조회 화면입니다. 예상 금액은 실제 청구·결제·매출이 아닙니다.")}</p>
    {d.billing.access.state === 'DevelopmentTest' && <p className="alert">{uiText("개발 테스트 이용 중 · 실제 결제 상태는 변경되지 않습니다.")}</p>}
    <dl className="admin-detail-grid">{[
      ['요금제', `사용자당 월 ${d.policy.monthlyPerUserKrw.toLocaleString()}원 · 기본요금 ${d.policy.monthlyBaseKrw.toLocaleString()}원`], ['요금 산정 사용자', `${d.billing.currentUsers}명`], ['월 예상 이용 요금', `${d.billing.estimatedMonthlyKrw.toLocaleString()}원`], ['실제 저장된 결제 상태', billingStatuses[d.tenant.billingStatus]], ['카드 등록', '연동 미완료 · 등록 여부 확인 불가'], ['무료 이용 시작', date(d.billing.trialStartedAt || d.tenant.createdAt)], ['무료 이용 종료', date(d.billing.trialEndsAt)], ['계약 정책', d.billing.billingPolicyVersion === 2 ? '가입일 기준 첫 1개월 무료' : '기존 가입 월 무료 계약 유지'], ['다음 결제 예정일', d.billing.autoBillingCanceled ? '자동결제 해지됨' : date(d.billing.nextChargeAt || d.billing.firstChargeAt)], ['자동결제 해지', d.billing.autoBillingCanceled ? date(d.billing.autoBillingCanceledAt) : '해지 신청 없음'], ['이용 종료 예정일', date(d.billing.serviceEndsAt)],
    ].map(([label, value]) => <div key={label}><dt>{uiText(label)}</dt><dd>{uiText(value)}</dd></div>)}</dl>
    </section><section hidden={tab !== 'support'}><h3>{uiText("최근 문의 (최대 10건)")}</h3><div className="table-scroll"><table className="wms-table"><thead><tr><th>{uiText("제목")}</th><th>{uiText("상태")}</th><th>{uiText("등록일")}</th><th>{uiText("관리")}</th></tr></thead><tbody>{d.inquiries.map(x => <tr key={x.id}><td>{x.title}</td><td>{uiText(supportStatuses[x.status])}</td><td>{date(x.createdAt)}</td><td><button className="secondary" onClick={() => setInquiry(x.id)}>{uiText("상세")}</button></td></tr>)}{!d.inquiries.length && <tr><td colSpan={4}>{uiText("등록된 문의가 없습니다.")}</td></tr>}</tbody></table></div></section>
  </div>}</OrganizationDialog>
}
