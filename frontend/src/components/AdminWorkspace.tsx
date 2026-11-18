import { requestNavigation } from '../navigation-guard'
import { useState } from 'react'
import AdminTenants from './AdminTenants'
import SupportManagement from './workspace/SupportManagement'
import { PageHeading } from './workspace/WorkspaceUI'
import { useReportRead } from './workspace/useReportRead'
import './workspace/support.css'

type Overview = { tenantCount: number; activeTenantCount: number; activeUserCount: number; newTenantCount: number; inquiryCount: number; pendingInquiryCount: number }
export default function AdminWorkspace() {
  const [tab, setTab] = useState('overview'), [revision, setRevision] = useState(0)
  const view = useReportRead<Overview>('/api/admin/overview', revision)
  return <><PageHeading title="아이블 관리자" />
    <nav className="wms-segmented admin-tabs" aria-label="관리자 업무">{[['overview', '운영 현황'], ['tenants', '기업 관리'], ['support', '문의·피드백 관리'], ['billing', '요금제 및 결제 현황']].map(([v, l]) => <button key={v} className={tab === v ? 'primary' : 'secondary'} aria-current={tab === v ? 'page' : undefined} onClick={() => requestNavigation(() => { setTab(v); setRevision(r => r + 1) })}>{l}</button>)}</nav>
    {tab === 'overview' && <><div className="row-actions"><button className="secondary" disabled={view.loading} onClick={() => setRevision(r => r + 1)}>새로고침</button></div>{view.error && <p role="alert" className="alert error">{view.error}</p>}<div className="admin-overview">{([
      ['tenantCount', '전체 등록 기업', '누적 기업 수'], ['activeTenantCount', '이용 상태 정상 기업', '활성 기업 · 결제 완료 여부와 별개'], ['activeUserCount', '활성 사용자', '전체 활성 계정 · 기업 간 중복 집계 없음'], ['newTenantCount', '신규 가입 기업', '최근 30일'], ['inquiryCount', '전체 문의', '기존 결제 피드백 포함'], ['pendingInquiryCount', '답변 대기 문의', '접수 및 처리 중'],
    ] as const).map(([k, l, note]) => <section className="panel" key={k}><span>{l}</span><strong>{view.data ? view.data[k].toLocaleString() : '—'}</strong><small>{note}</small></section>)}</div><section className="panel"><h2>운영 업무</h2><p>답변 대기 문의를 확인하고 기업별 이용 상태와 요금 정보를 조회하세요.</p><div className="row-actions"><button className="primary" onClick={() => setTab('support')}>문의 확인</button><button className="secondary" onClick={() => setTab('tenants')}>기업 확인</button></div></section></>}
    {(tab === 'tenants' || tab === 'billing') && <AdminTenants key={tab} billingOnly={tab === 'billing'} />}
    {tab === 'support' && <SupportManagement admin />}
  </>
}
