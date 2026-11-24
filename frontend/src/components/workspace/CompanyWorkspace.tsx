import { t as uiText } from '../../i18n.ts'
import MobileRuntime from '../mobile/MobileRuntime'
import { useMobile } from '../../use-mobile'
import MobileNavigation from '../mobile/MobileNavigation'
import { BusinessAssigneeContext } from "../../business-assignee"
import { lazy, Suspense, useEffect, useState } from 'react'
import { ChevronRight, Menu } from 'lucide-react'
import { api, ApiError } from '../../api'
import { requestNavigation } from '../../navigation-guard'
import type { Session } from '../../api'
import type { Workspace } from '../../types/workspace'
import { findWorkspacePage, canViewPage, workspaceDetailId, isRegistrationPath, canOpenRegistration } from './navigation'
import WorkspaceSidebar from './WorkspaceSidebar'
import { EmptyPage, PageHeading, EmptyState } from './WorkspaceUI'
import { BillingReminder } from './SubscriptionPanel'
import BillingNotice from './BillingNotice'
import PermissionSettings from './PermissionSettings'
import CompanyManagement from './CompanyManagement'
import ActivityLog from './ActivityLog'
import { CompanyLogoMark } from './CompanyLogoEditor'
import OrganizationItems from './OrganizationItems'
import OrganizationChart from './OrganizationChart'
import UserManagement from './UserManagement'
import WarehouseManagement from './WarehouseManagement'
import ProductManagement from './ProductManagement'
import PartnerManagement from './PartnerManagement'
import ReceiptManagement from './ReceiptManagement'
const UserGuideDialog = lazy(() => import('./UserGuideDialog'))
const LabelEditor = lazy(() => import('../../label-editor/LabelEditor'))
const SupportManagement = lazy(() => import('./SupportManagement'))
const Dashboard = lazy(() => import('./Dashboard'))
const StockHistory = lazy(() => import('./StockHistory'))
const MovementStats = lazy(() => import('./MovementStats'))
const StockOverview = lazy(() => import('./StockOverview'))
const StocktakeManagement = lazy(() => import('./StocktakeManagement'))
const InventoryManagement = lazy(() => import('./InventoryManagement'))
const ShipmentManagement = lazy(() => import('./ShipmentManagement'))
import BarcodeLookup from './BarcodeLookup'
import UserProfileMenu from '../UserProfileMenu'
import DefaultTenantGuide from '../DefaultTenantGuide'
import './workspace.css'
const roles: Record<string, string> = {
  Master: '기업 마스터',
  Administrator: '기업 관리자',
  Employee: '일반 직원',
}
type View = {
  key: string
  workspace: Workspace | null
  status: 'ready' | 'blocked' | 'forbidden' | 'missing' | 'error'
  message?: string
}
export default function CompanyWorkspace({
  session,
  path: requestedPath,
  navigationRevision,
  onNavigate,
  onLogout,
  busy,
  error,
  onResolved,
  onExpired,
}: {
  session: Session
  path: string
  navigationRevision: number
  onNavigate: (path: string, options?: { replace?: boolean }) => void
  onLogout: () => void
  busy: boolean
  error: string
  health: string
  onResolved: () => Promise<unknown>
  onExpired: () => void
}) {
  const mobile = useMobile()
  const [collapsed, setCollapsed] = useState(mobile)
  const guideEntry = /^\/app\/guide(?:\/[a-z-]+)?$/.test(requestedPath)
  const path = guideEntry ? '/app' : requestedPath
  const [guideOpen, setGuideOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const [view, setView] = useState<View | null>(null)
  const tenantId = session.selectedTenantId
  const page = findWorkspacePage(path)
  const key = `${tenantId}:${path}:${revision}:${navigationRevision}`
  const current = view?.key === key ? view : null
  const membership = session.memberships.find((x) => x.tenantId === tenantId)
  const role = current?.workspace?.role || membership?.role
  useEffect(() => {
    if (!tenantId) return
    let live = true
    async function load(): Promise<View> {
      const workspace = await api<Workspace>(
        `/api/tenants/${tenantId}/workspace`,
      )
      if (!page) return { key, workspace, status: 'missing' }
      if (!canViewPage(page, workspace.role, workspace.permissions) || !canOpenRegistration(path, workspace.permissions))
        return { key, workspace, status: 'forbidden' }
      if (page.business && !workspace.billingAccess.canAccessWms)
        return { key, workspace, status: 'blocked' }
      // Static manual has no business data or server page permission to request.
      if (page.key !== 'guide') await api(`/api/tenants/${tenantId}/pages/${page.key === 'label-editor' ? 'products' : page.key}`)
      return { key, workspace, status: 'ready' }
    }
    load()
      .then((result) => {
        if (live) setView(result)
      })
      .catch((e: unknown) => {
        if (!live) return
        if (e instanceof ApiError && e.status === 401) {
          onExpired()
          return
        }
        setView({
          key,
          workspace: null,
          status:
            e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error',
          message:
            e instanceof Error ? e.message : '화면을 불러오지 못했습니다.',
        })
      })
    return () => {
      live = false
    }
  }, [tenantId, page, key, path, onExpired])
  // Revalidate menus for other active sessions without trusting cached role claims.
  useEffect(() => {
    if (!tenantId || !current?.workspace) return
    let live = true, checking = false
    const signature = (w: Workspace) => JSON.stringify([w.accountType, w.role, w.permissions, w.billingAccess, w.serviceStatus, w.warehouseSetupPreview])
    const original = signature(current.workspace)
    const check = async () => {
      if (!live || checking || document.visibilityState === 'hidden') return
      checking = true
      try {
        const latest = await api<Workspace>(`/api/tenants/${tenantId}/workspace`)
        if (live && signature(latest) === original) setView(previous => previous?.key === key && previous.workspace && (previous.workspace.name !== latest.name || previous.workspace.logoVersion !== latest.logoVersion) ? { ...previous, workspace: { ...previous.workspace, name: latest.name, logoVersion: latest.logoVersion } } : previous)
        if (live && signature(latest) !== original) { setRevision(x => x + 1); await onResolved() }
      } catch (e) {
        if (live && e instanceof ApiError && e.status === 401) onExpired()
        else if (live && e instanceof ApiError && e.status === 403) { setRevision(x => x + 1); await onResolved().catch(() => {}) }
      } finally { checking = false }
    }
    const timer = window.setInterval(() => { void check() }, 2000)
    const wake = () => { void check() }
    window.addEventListener('focus', wake); window.addEventListener('wms-access-changed', wake); document.addEventListener('visibilitychange', wake)
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('wms-access') : null
    if (channel) channel.onmessage = wake
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus', wake); window.removeEventListener('wms-access-changed', wake); document.removeEventListener('visibilitychange', wake); channel?.close() }
  }, [tenantId, current?.workspace, onResolved, onExpired, key])
  const refresh = () => { requestNavigation(() => setRevision((x) => x + 1)) }
  const name = current?.workspace?.name || membership?.name || '소속 기업 확인'
  return (
    <BusinessAssigneeContext.Provider value={{ tenantId: tenantId || undefined, current: current?.workspace?.currentAssignee }}>
    <div data-workspace-path={path} data-layout={mobile ? 'mobile' : 'desktop'} className={`wms-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {!mobile && <WorkspaceSidebar
        path={path}
        role={role}
        permissions={view?.workspace?.id === tenantId ? view.workspace.permissions : {}}
        collapsed={collapsed}
        onToggle={() => setCollapsed((x) => !x)}
        onOpenGuide={() => { setGuideOpen(true); if (mobile) setCollapsed(true) }}
        onNavigate={destination => { onNavigate(destination); if (mobile) setCollapsed(true) }}
      />
      }
      {!mobile && !collapsed && (
        <button
          className="wms-drawer-backdrop"
          aria-label={uiText("사이드바 닫기")}
          onClick={() => setCollapsed(true)}
        />
      )}
      <div className="wms-main">
        <header className="wms-header">
          {mobile && current?.workspace && <MobileNavigation path={path} role={role} permissions={current.workspace.permissions} onNavigate={onNavigate} onGuide={() => setGuideOpen(true)} />}
          {!mobile && <button className="wms-icon-button wms-mobile-menu" aria-label={uiText("업무 메뉴 열기")} onClick={() => setCollapsed(false)}><Menu size={20} /></button>}
          <div className="wms-company">
            <CompanyLogoMark name={name} className="wms-company-logo" src={current?.workspace?.logoVersion ? `/api/tenants/${tenantId}/company/logo?v=${current.workspace.logoVersion}` : undefined} />
            <span>{name}</span>
          </div>
          <UserProfileMenu session={session} roleLabel={current?.workspace?.accountType === 'External' ? uiText("외부 협력사") : uiText(roles[role || '']) || uiText("기업 구성원")} busy={busy} onLogout={onLogout} onResolved={onResolved} onSwitched={() => onNavigate('/app')} />
        </header>
        {current?.workspace?.canManageBilling && <BillingReminder key={tenantId} tenantId={tenantId!} onCard={() => onNavigate('/app/master/billing')} />}
        <main className="wms-content" id="workspace-content">
          <div className="wms-breadcrumb">
            <span>{uiText("워크스페이스")}</span>
            <ChevronRight size={13} aria-hidden="true" />
            <span>{uiText(page?.label || '페이지 확인')}</span>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {uiText(error)}
            </div>
          )}
          {!tenantId ? (session.memberships.length > 1 ? (<DefaultTenantGuide
                memberships={session.memberships}
                onResolved={onResolved}
              />) : (<section className="wms-card">
                <EmptyState title={uiText("소속 기업 확인이 필요합니다")}> {uiText("현재 접근 가능한 기업이 없습니다. 기업 관리자에게 소속 상태를 확인해 주세요.")} </EmptyState>
              </section>)) : !current ? (<div className="wms-loading" role="status"> {uiText("기업 정보와 접근 권한을 확인하고 있습니다…")} </div>) : current.status === 'blocked' ? (<>
              <PageHeading
                title={uiText("기업 이용 안내")}
              />
              <BillingNotice
                workspace={current.workspace!}
                onRefresh={refresh}
                onSupport={() => onNavigate('/app/support')}
              />
            </>) : current.status === 'forbidden' ? (<section className="wms-card">
              <EmptyState title={uiText("접근 권한이 없습니다")}> {uiText("현재 계정에 이 기능을 이용할 권한이 없습니다. 기업 마스터에게 권한과 기업 이용 상태를 확인해 주세요.")} </EmptyState>
            </section>) : current.status === 'missing' ? (<section className="wms-card">
              <EmptyState title={uiText("페이지를 찾을 수 없습니다")}> {uiText("왼쪽 메뉴에서 이동할 화면을 선택해 주세요.")} </EmptyState>
            </section>) : current.status === 'error' ? (<section className="wms-card">
              <EmptyState title={uiText("화면을 불러오지 못했습니다")}>
                {uiText(current.message)}
              </EmptyState>
              <button className="secondary" onClick={refresh}> {uiText("다시 시도")} </button>
            </section>) : page?.key === 'dashboard' ? (<Suspense fallback={<p role="status">{uiText("운영 현황을 불러오는 중…")}</p>}><Dashboard key={`${session.user.id}:${tenantId}`} userId={session.user.id} tenantId={tenantId!} onNavigate={onNavigate} permissions={current.workspace!.permissions} /></Suspense>) : page?.key === 'warehouses' ? (<>
              <WarehouseManagement key={`${tenantId}:${navigationRevision}`} tenantId={tenantId!} grants={current.workspace!.permissions.warehouses || []} />
            </>) : page?.key === 'products' ? (<ProductManagement userId={session.user.id} detailId={workspaceDetailId(path)} registration={isRegistrationPath(path)} onNavigate={onNavigate} key={`${session.user.id}:${tenantId}`} tenantId={tenantId!} grants={current.workspace!.permissions.products || []} />) : page?.key === 'label-editor' ? (<Suspense fallback={<p role="status">{uiText('라벨 편집기를 불러오는 중…')}</p>}><LabelEditor key={tenantId!} tenantId={tenantId!} grants={current.workspace!.permissions.products || []}/></Suspense>) : page?.key === 'barcode-lookup' ? (<BarcodeLookup key={tenantId!} tenantId={tenantId!} onNavigate={onNavigate} />) : page?.key === 'stock-history' ? (<Suspense fallback={<p role="status">{uiText("재고 변동 이력을 불러오는 중…")}</p>}><StockHistory key={tenantId!} tenantId={tenantId!} /></Suspense>) : page?.key === 'movement-stats' ? (<Suspense fallback={<p role="status">{uiText("입출고 통계를 불러오는 중…")}</p>}><MovementStats key={tenantId!} tenantId={tenantId!} /></Suspense>) : page?.key === 'stock-overview' ? (<Suspense fallback={<p role="status">{uiText("재고 현황을 불러오는 중…")}</p>}><StockOverview key={`${tenantId}:${navigationRevision}`} tenantId={tenantId!} permissions={view?.workspace?.permissions || {}} /></Suspense>) : page?.key === 'stocktake' ? (<Suspense fallback={<p role="status">{uiText("실사 화면을 불러오는 중…")}</p>}><StocktakeManagement registration={isRegistrationPath(path)} detailId={workspaceDetailId(path)} onNavigate={onNavigate} currentUser={session.user.displayName} key={tenantId!} tenantId={tenantId!} grants={current.workspace!.permissions.stocktake || []} /></Suspense>) : page?.key === 'stock-adjustments' ? (<Suspense fallback={<p role="status">{uiText("재고 화면을 불러오는 중…")}</p>}><InventoryManagement key={tenantId!} tenantId={tenantId!} grants={current.workspace!.permissions['stock-adjustments'] || []} /></Suspense>) : page?.key === 'shipments' ? (<Suspense fallback={<p role="status">{uiText("출고 화면을 불러오는 중…")}</p>}><ShipmentManagement detailId={workspaceDetailId(path)} registration={isRegistrationPath(path)} onNavigate={onNavigate} key={tenantId!} tenantId={tenantId!} grants={current.workspace!.permissions.shipments || []} /></Suspense>) : page?.key === 'receipts' ? (<ReceiptManagement detailId={workspaceDetailId(path)} registration={isRegistrationPath(path)} onNavigate={onNavigate} key={tenantId!} tenantId={tenantId!} grants={current.workspace!.permissions.receipts || []} />) : page?.key === 'partners' ? (<PartnerManagement key={tenantId!} tenantId={tenantId!} grants={current.workspace!.permissions.partners || []} />) : page?.key === 'org-chart' ? (<OrganizationChart key={tenantId!} tenantId={tenantId!} canManage={current.workspace!.permissions['organization-items']?.includes('create') === true} onNavigate={onNavigate} />) : page?.key === 'organization-items' ? (<OrganizationItems key={tenantId!} tenantId={tenantId!} grants={current.workspace!.permissions['organization-items'] || []} />) : page?.key === 'activity-log' ? (<ActivityLog key={tenantId!} tenantId={tenantId!} />) : page?.key === 'company' ? (<CompanyManagement key={tenantId!} tenantId={tenantId!} master={role === 'Master'}
              canUpdate={current.workspace!.permissions.company?.includes('update') === true}
              onSaved={(name, logoVersion) => setView(previous => previous?.workspace ? { ...previous, workspace: { ...previous.workspace, name, logoVersion } } : previous)} />) : page?.key === 'users' ? (<UserManagement isMaster={role === 'Master'} onAccessChanged={async () => { await onResolved(); refresh() }} key={tenantId!} tenantId={tenantId!} currentUserId={session.user.id}
              canCreate={current.workspace!.permissions.users?.includes('create') === true && current.workspace!.permissions.users?.includes('manageUsers') === true}
              canUpdate={current.workspace!.permissions.users?.includes('update') === true && current.workspace!.permissions.users?.includes('manageUsers') === true} />) : page?.key === 'permissions' ? (<PermissionSettings key={tenantId!} tenantId={tenantId!} />) : page?.key === 'billing' ? (<>
              <PageHeading
                title={uiText("요금제 및 결제 관리")}
              />
              <BillingNotice pricingPage
                workspace={current.workspace!}
                onRefresh={refresh}
                onSupport={() => onNavigate('/app/support')}
              />
            </>) : (page!.key === 'support' ? <SupportManagement key={tenantId!} tenantId={tenantId!} canCreate={current.workspace!.permissions.support?.includes('create')} canReadAll={current.workspace!.permissions.support?.includes('readAll')} /> : <EmptyPage title={page!.label} />)}
        </main>
        <footer className="wms-footer">
          <span>© {new Date().getFullYear()} {uiText("아이블소프트(주)")}</span>
        </footer>
      </div>
    </div>
    <MobileRuntime />
    {tenantId && role && (guideOpen || guideEntry) && <Suspense fallback={null}><UserGuideDialog key={tenantId} initialPath={guideEntry ? requestedPath : '/app/guide'} onClose={() => { setGuideOpen(false); if (guideEntry) onNavigate('/app') }} /></Suspense>}
    </BusinessAssigneeContext.Provider>
  )
}
