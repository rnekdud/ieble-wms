import { useEffect, useState } from 'react'
import { Building2, ChevronRight, LogOut, RefreshCw } from 'lucide-react'
import { api, ApiError } from '../../api'
import type { Session } from '../../api'
import type { Workspace } from '../../types/workspace'
import { findWorkspacePage, canViewPage } from './navigation'
import WorkspaceSidebar from './WorkspaceSidebar'
import { Dashboard, EmptyPage, PageHeading, EmptyState } from './WorkspaceUI'
import BillingNotice from './BillingNotice'
import PermissionSettings from './PermissionSettings'
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
  path,
  onNavigate,
  onLogout,
  busy,
  error,
  health,
  onResolved,
  onExpired,
}: {
  session: Session
  path: string
  onNavigate: (path: string) => void
  onLogout: () => void
  busy: boolean
  error: string
  health: string
  onResolved: () => Promise<unknown>
  onExpired: () => void
}) {
  const [collapsed, setCollapsed] = useState(
    () => window.matchMedia('(max-width: 760px)').matches,
  )
  const [revision, setRevision] = useState(0)
  const [view, setView] = useState<View | null>(null)
  const tenantId = session.selectedTenantId
  const page = findWorkspacePage(path)
  const key = `${tenantId}:${path}:${revision}`
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
      if (!canViewPage(page, workspace.role, workspace.permissions))
        return { key, workspace, status: 'forbidden' }
      if (page.business && !workspace.billingAccess.canAccessWms)
        return { key, workspace, status: 'blocked' }
      await api(`/api/tenants/${tenantId}/pages/${page.key}`)
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
  }, [tenantId, page, key, onExpired])
  const refresh = () => setRevision((x) => x + 1)
  const name = current?.workspace?.name || membership?.name || '소속 기업 확인'
  return (
    <div className={`wms-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <WorkspaceSidebar
        path={path}
        role={role}
        permissions={view?.workspace?.id === tenantId ? view.workspace.permissions : {}}
        collapsed={collapsed}
        onToggle={() => setCollapsed((x) => !x)}
        onNavigate={onNavigate}
      />
      {!collapsed && (
        <button
          className="wms-drawer-backdrop"
          aria-label="사이드바 닫기"
          onClick={() => setCollapsed(true)}
        />
      )}
      <div className="wms-main">
        <header className="wms-header">
          <div className="wms-company">
            <Building2 size={20} aria-hidden="true" />
            <span>{name}</span>
          </div>
          <div className="wms-user">
            <div>
              <strong>{session.user.displayName}</strong>
              <span>{roles[role || ''] || '기업 구성원'}</span>
            </div>
            <button className="wms-logout" aria-label="로그아웃" disabled={busy} onClick={onLogout}>
              <LogOut size={17} aria-hidden="true" />
              <span>로그아웃</span>
            </button>
          </div>
        </header>
        <main className="wms-content" id="workspace-content">
          <div className="wms-breadcrumb">
            <span>워크스페이스</span>
            <ChevronRight size={13} aria-hidden="true" />
            <span>{page?.label || '페이지 확인'}</span>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {!tenantId ? (
            session.memberships.length > 1 ? (
              <DefaultTenantGuide
                memberships={session.memberships}
                onResolved={onResolved}
              />
            ) : (
              <section className="wms-card">
                <EmptyState title="소속 기업 확인이 필요합니다">
                  현재 접근 가능한 기업이 없습니다. 기업 관리자에게 소속 상태를
                  확인해 주세요.
                </EmptyState>
              </section>
            )
          ) : !current ? (
            <div className="wms-loading" role="status">
              기업 정보와 접근 권한을 확인하고 있습니다…
            </div>
          ) : current.status === 'blocked' ? (
            <>
              <PageHeading
                title="기업 이용 안내"
                description="업무 시작에 필요한 결제 수단과 이용 상태를 확인해 주세요."
              />
              <BillingNotice
                workspace={current.workspace!}
                onRefresh={refresh}
              />
            </>
          ) : current.status === 'forbidden' ? (
            <section className="wms-card">
              <EmptyState title="접근 권한이 없습니다">
                현재 계정에 이 기능을 이용할 권한이 없습니다. 기업 마스터에게
                권한과 기업 이용 상태를 확인해 주세요.
              </EmptyState>
            </section>
          ) : current.status === 'missing' ? (
            <section className="wms-card">
              <EmptyState title="페이지를 찾을 수 없습니다">
                왼쪽 메뉴에서 이동할 화면을 선택해 주세요.
              </EmptyState>
            </section>
          ) : current.status === 'error' ? (
            <section className="wms-card">
              <EmptyState title="화면을 불러오지 못했습니다">
                {current.message}
              </EmptyState>
              <button className="secondary" onClick={refresh}>
                다시 시도
              </button>
            </section>
          ) : page?.key === 'dashboard' ? (
            <Dashboard />
          ) : page?.key === 'permissions' ? (
            <PermissionSettings key={tenantId!} tenantId={tenantId!} />
          ) : page?.key === 'billing' ? (
            <>
              <PageHeading
                title="요금제 및 결제 관리"
                description="기업의 이용 요금과 결제 상태를 확인하세요."
              />
              <BillingNotice
                workspace={current.workspace!}
                onRefresh={refresh}
              />
            </>
          ) : (
            <EmptyPage title={page!.label} />
          )}
        </main>
        <footer className="wms-footer">
          <span>© {new Date().getFullYear()} IEBLE WMS</span>
          <div>
            <span className="dot" />
            {health}
            <button
              className="wms-icon-button"
              aria-label="현재 화면 새로고침"
              onClick={refresh}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
