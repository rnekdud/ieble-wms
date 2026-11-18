import { createRoot } from 'react-dom/client'
import { PageHeading } from '../../src/components/workspace/WorkspaceUI'
import RegistrationSurface from '../../src/components/workspace/RegistrationSurface'
import DetailSurface from '../../src/components/workspace/DetailSurface'
import WarehouseManagement from '../../src/components/workspace/WarehouseManagement'
import WarehouseWorkspaceEditor from '../../src/components/workspace/WarehouseWorkspaceEditor'
import WarehouseDashboard from '../../src/components/workspace/WarehouseDashboard'
import AdminWorkspace from '../../src/components/AdminWorkspace'
import OrganizationDialog from '../../src/components/workspace/OrganizationDialog'
import '../../src/index.css'
import '../../src/components/workspace/workspace.css'
import '../../src/business-ui.css'
import '../../src/design-tokens.css'
import '../../src/theme.css'
const done = () => { document.documentElement.dataset.action = 'done' }
export function Fixture() {
  const q = new URLSearchParams(location.search), kind = q.get('kind') || 'list', title = q.get('title') || '상품관리'
  const fields = <form id="header-form" onSubmit={e => { e.preventDefault(); done() }}><label>본문 검색<input aria-label="본문 검색" /></label><p role="alert">필수 값을 확인해 주세요.</p><p role="status">미저장 변경사항이 있습니다.</p></form>
  return <div className="wms-layout" style={{display:'block'}}><header className="wms-header" aria-label="기업 헤더">QA 기업</header><main className="wms-content">
    <div className="wms-breadcrumb"><a href="#workspace">워크스페이스</a><span>›</span><span>{title}</span></div>
    {kind === 'registration' ? <RegistrationSurface page title={title} formId={q.get('form') || 'product-registration'} action="저장" description="일반 페이지 소개" context={q.get('code') || undefined} onClose={done}>{fields}</RegistrationSurface>
      : kind === 'detail' ? <DetailSurface title={title} code="IN01" status={<span className="status-badge">검수 중</span>} onClose={done} actions={<button className="primary" onClick={done}>검수 시작</button>}>{fields}</DetailSurface>
      : kind === 'warehouse-new' ? <WarehouseWorkspaceEditor endpoint="/api/tenants/fixture/warehouses" canCreate canUpdate onBack={done} onSaved={done}/>
      : kind === 'warehouse-detail' ? <WarehouseManagement tenantId="fixture" grants={['read','update']} />
      : kind === 'dashboard' ? <WarehouseDashboard tenantId="fixture" />
      : kind === 'admin' ? <AdminWorkspace />
      : kind === 'dialog' ? <OrganizationDialog title="필수 작업 안내" description="확정하면 재고에 반영됩니다." onClose={done}>{fields}</OrganizationDialog>
      : <><PageHeading title={title} badge="준비 중"/>{fields}</>}
  </main></div>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
