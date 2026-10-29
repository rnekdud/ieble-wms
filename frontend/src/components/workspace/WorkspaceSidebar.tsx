import { useState } from 'react'
import {
  LayoutDashboard,
  Warehouse,
  Package,
  PackagePlus,
  Truck,
  Boxes,
  UsersRound,
  ChartNoAxesCombined,
  MessagesSquare,
  Settings2,
  Shield,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { workspaceMenus, canViewPage } from './navigation'
import type { WorkspacePage } from './navigation'
const icons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  warehouse: Warehouse,
  products: Package,
  receipts: PackagePlus,
  shipments: Truck,
  inventory: Boxes,
  partners: UsersRound,
  reports: ChartNoAxesCombined,
  support: MessagesSquare,
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
}: {
  path: string
  permissions: Record<string, string[]>
  role: string | undefined
  collapsed: boolean
  onToggle: () => void
  onNavigate: (path: string) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  function link(page: WorkspacePage, nested = false) {
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
        className={`wms-nav-link ${nested ? 'is-nested' : ''} ${path === page.path ? 'is-current' : ''}`}
        aria-current={path === page.path ? 'page' : undefined}
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
        aria-label="IEBLE WMS 대시보드"
      >
        <span className="brand-mark">i</span>
        <span className="wms-side-label">
          IEBLE <small>WMS</small>
        </span>
      </a>
      <div className="wms-sidebar-caption wms-side-label">
        기업 워크스페이스
      </div>
      <nav aria-label="WMS 메뉴">
        {workspaceMenus.map((menu) => {
          if (menu.page)
            return canViewPage(menu.page, role, permissions) ? link(menu.page) : null
          const children = menu.children!.filter((page) =>
            canViewPage(page, role, permissions),
          )
          if (!children.length) return null
          const current = children.some((page) => path === page.path)
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
      <div className="wms-sidebar-bottom">
        <span className="wms-side-label">IEBLE WMS</span>
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
