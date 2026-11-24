import SidebarLanguage from '../SidebarLanguage'
import { t as uiText } from '../../i18n.ts'
import { useMenuExpansion, useMenuScroll } from '../../use-menu-scroll'
import '../menu-scroll.css'
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
  const [expanded, setExpanded] = useMenuExpansion(path)
  const [menuScroll, revealToggle] = useMenuScroll(path, true, false, collapsed)
  // Detail/registration screens belong to the same existing menu entry.
  const activePath = findWorkspacePage(path)?.path ?? path
  const supportPages = workspaceMenus.flatMap(menu => menu.page && ['guide', 'support'].includes(menu.page.key) && canViewPage(menu.page, role, permissions) ? [menu.page] : [])
  function link(page: WorkspacePage, nested = false) {
    if (page.key === 'guide') return <button key={page.key} type="button" className="wms-nav-link" aria-haspopup="dialog" title={collapsed ? uiText(page.label) : undefined} onClick={() => { setExpanded('', false); onOpenGuide() }}><BookOpen size={19} aria-hidden="true"/><span className="wms-side-label">{uiText(page.label)}</span></button>
    return (
      <a
        key={page.key}
        href={page.path}
        onClick={(e) => {
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            setExpanded(workspaceMenus.find(menu => menu.children?.some(child => child.path === page.path))?.label || '', true)
            onNavigate(page.path)
          }
        }}
        className={`wms-nav-link ${nested ? 'is-nested' : ''} ${activePath === page.path ? 'is-current' : ''}`}
        aria-current={activePath === page.path ? 'page' : undefined}
        title={collapsed ? uiText(page.label) : undefined}
      >
        {!nested &&
          (() => {
            const menu = workspaceMenus.find((m) => m.page?.key === page.key)!
            const Icon = icons[menu.icon]
            return <Icon size={19} aria-hidden="true" />
          })()}
        <span className="wms-side-label">{uiText(page.label)}</span>
      </a>
    )
  }
  return (
    <aside
      className={`wms-sidebar ${collapsed ? 'is-collapsed' : ''}`}
      aria-label={uiText("기업 업무 사이드바")}
    >
      <a
        href="/app"
        className="wms-brand"
        onClick={(e) => {
          e.preventDefault()
          setExpanded('', false)
          onNavigate('/app')
        }}
        aria-label={uiText("아이블 WMS 대시보드")}
      >
        <img
          className={`wms-service-logo${collapsed ? ' is-symbol' : ''}`}
          src="/wms_logo.svg"
          alt={collapsed ? uiText("아이블 WMS") : ''}
          width={36}
          height={36}
        />
        {!collapsed && <span className="wms-side-label">{uiText("아이블 WMS")}</span>}
      </a>
      <div className="wms-sidebar-caption wms-side-label"> {uiText("기업 워크스페이스")} </div>
      <nav ref={menuScroll} className="wms-business-nav" aria-label={uiText("WMS 메뉴")}>
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
                title={collapsed ? uiText(menu.label) : undefined}
                className={`wms-nav-link ${current ? 'is-parent-current' : ''}`}
                aria-label={uiText(menu.label)}
                data-current-menu={current}
                aria-expanded={!collapsed && open}
                onClick={event => {
                  if (collapsed) onToggle()
                  setExpanded(menu.label, collapsed ? true : undefined)
                  revealToggle(event.currentTarget)
                }}
              >
                <Icon size={19} aria-hidden="true" />
                <span className="wms-side-label">{uiText(menu.label)}</span>
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
        <nav className="wms-support-nav" aria-label={uiText("고객지원")}>
          <div className="wms-support-caption wms-side-label">{uiText("고객지원")}</div>
          {supportPages.map(page => link(page))}
        </nav>
      )}
      <div className="wms-sidebar-bottom">
        <SidebarLanguage collapsed={collapsed} />
        <button
          className="wms-icon-button"
          onClick={onToggle}
          aria-label={collapsed ? uiText("사이드바 펼치기") : uiText("사이드바 접기")}
          aria-expanded={!collapsed}
          title={collapsed ? uiText("사이드바 펼치기") : uiText("사이드바 접기")}
        >
          {collapsed ? (<PanelLeftOpen size={19} />) : (<PanelLeftClose size={19} />)}
        </button>
      </div>
    </aside>
  )
}
