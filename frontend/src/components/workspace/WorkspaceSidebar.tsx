import { useState } from 'react'
import {
  LayoutDashboard,
  Warehouse,
  Package,
  ScanLine,
  PackagePlus,
  Truck,
  Boxes,
  UsersRound,
  ChartNoAxesCombined,
  MessagesSquare,
  BookOpen,
  Settings2,
  Shield,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { workspaceMenus, canViewPage, findWorkspacePage } from './navigation'
import type { WorkspacePage } from './navigation'
const icons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  warehouse: Warehouse,
  products: Package,
  barcode: ScanLine,
  receipts: PackagePlus,
  shipments: Truck,
  inventory: Boxes,
  partners: UsersRound,
  reports: ChartNoAxesCombined,
  support: MessagesSquare,
  guide: BookOpen,
  settings: Settings2,
  shield: Shield,
}
export default function WorkspaceSidebar({
  path,
  role,
  permissions,
  collapsed,
  onToggle,
  onNavigate,
  onOpenGuide,
}: {
  path: string
  permissions: Record<string, string[]>
  role: string | undefined
  collapsed: boolean
  onToggle: () => void
  onNavigate: (path: string) => void
  onOpenGuide: () => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // Detail/registration screens belong to the same existing menu entry.
  const activePath = findWorkspacePage(path)?.path ?? path
  const supportPages = workspaceMenus.flatMap(menu => menu.page && ['guide', 'support'].includes(menu.page.key) && canViewPage(menu.page, role, permissions) ? [menu.page] : [])
  function link(page: WorkspacePage, nested = false) {
    if (page.key === 'guide') return <button key={page.key} type="button" className="wms-nav-link" aria-haspopup="dialog" title={collapsed ? page.label : undefined} onClick={onOpenGuide}><BookOpen size={19} aria-hidden="true"/><span className="wms-side-label">{page.label}</span></button>
    return (
      <a
        key={page.key}
        href={page.path}
        onClick={(e) => {
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            onNavigate(page.path)
          }
        }}
        className={`wms-nav-link ${nested ? 'is-nested' : ''} ${activePath === page.path ? 'is-current' : ''}`}
        aria-current={activePath === page.path ? 'page' : undefined}
        title={collapsed ? page.label : undefined}
      >
        {!nested &&
          (() => {
            const menu = workspaceMenus.find((m) => m.page?.key === page.key)!
            const Icon = icons[menu.icon]
            return <Icon size={19} aria-hidden="true" />
          })()}
        <span className="wms-side-label">{page.label}</span>
      </a>
    )
  }
  return (
    <aside
      className={`wms-sidebar ${collapsed ? 'is-collapsed' : ''}`}
      aria-label="기업 업무 사이드바"
    >
      <a
        href="/app"
        className="wms-brand"
        onClick={(e) => {
          e.preventDefault()
          onNavigate('/app')
        }}
        aria-label="아이블 WMS 대시보드"
      >
        <img
          className={`wms-service-logo${collapsed ? ' is-symbol' : ''}`}
          src="/wms_logo.svg"
          alt={collapsed ? '아이블 WMS' : ''}
          width={36}
          height={36}
        />
        {!collapsed && <span className="wms-side-label">아이블 WMS</span>}
      </a>
      <div className="wms-sidebar-caption wms-side-label">
        기업 워크스페이스
      </div>
      <nav className="wms-business-nav" aria-label="WMS 메뉴">
        {workspaceMenus.filter((menu) => !['support', 'guide'].includes(menu.page?.key || '')).map((menu) => {
          if (menu.page)
            return canViewPage(menu.page, role, permissions) ? link(menu.page) : null
          const children = menu.children!.filter((page) =>
            canViewPage(page, role, permissions),
          )
          if (!children.length) return null
          const current = children.some((page) => activePath === page.path)
          const open = expanded[menu.label] ?? current
          const Icon = icons[menu.icon]
          return (
            <div key={menu.label} className="wms-nav-group">
              <button
                title={collapsed ? menu.label : undefined}
                className={`wms-nav-link ${current ? 'is-parent-current' : ''}`}
                aria-label={menu.label}
                aria-expanded={!collapsed && open}
                onClick={() => {
                  if (collapsed) onToggle()
                  setExpanded((x) => ({
                    ...x,
                    [menu.label]: collapsed ? true : !open,
                  }))
                }}
              >
                <Icon size={19} aria-hidden="true" />
                <span className="wms-side-label">{menu.label}</span>
                <ChevronDown
                  className={`wms-nav-chevron wms-side-label ${open ? 'is-open' : ''}`}
                  size={15}
                  aria-hidden="true"
                />
              </button>
              {!collapsed && open && (
                <div className="wms-subnav">
                  {children.map((page) => link(page, true))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      {supportPages.length > 0 && (
        <nav className="wms-support-nav" aria-label="고객지원">
          <div className="wms-support-caption wms-side-label">고객지원</div>
          {supportPages.map(page => link(page))}
        </nav>
      )}
      <div className="wms-sidebar-bottom">
        <span className="wms-side-label">아이블 WMS</span>
        <button
          className="wms-icon-button"
          onClick={onToggle}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          aria-expanded={!collapsed}
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          {collapsed ? (
            <PanelLeftOpen size={19} />
          ) : (
            <PanelLeftClose size={19} />
          )}
        </button>
      </div>
    </aside>
  )
}
