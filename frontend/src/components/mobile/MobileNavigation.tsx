import { useState } from 'react'
import { Home, PackageOpen, Truck, Boxes, Menu, ScanLine, Warehouse, Package, Users, ChartNoAxesCombined, Settings, BookOpen, MessageCircle, Shield, ChevronDown, type LucideIcon } from 'lucide-react'
import { canViewPage, findWorkspacePage, workspaceMenus, type WorkspacePage } from '../workspace/navigation'
import OrganizationDialog from '../workspace/OrganizationDialog'
import { requestNavigation } from '../../navigation-guard'

const icons: Record<string, LucideIcon> = { dashboard: Home, warehouse: Warehouse, products: Package, barcode: ScanLine, receipts: PackageOpen, shipments: Truck, inventory: Boxes, partners: Users, reports: ChartNoAxesCombined, settings: Settings, shield: Shield, guide: BookOpen, support: MessageCircle }
export default function MobileNavigation({ path, role, permissions, onNavigate, onGuide }: {
  path: string; role?: string; permissions: Record<string, string[]>; onNavigate: (path: string) => void; onGuide: () => void
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const visit = (destination: string) => requestNavigation(() => { setOpen(false); onNavigate(destination) })
  const sections: { label: string; collapsible: boolean; icon: LucideIcon; items: { page: WorkspacePage; icon: LucideIcon }[] }[] = []
  for (const menu of workspaceMenus) {
    const label = menu.children || menu.page?.key === 'partners' ? menu.label : ['guide', 'support'].includes(menu.page?.key || '') ? '고객지원' : '주요 메뉴'
    const items = (menu.page ? [menu.page] : menu.children || []).filter(page => canViewPage(page, role, permissions)).map(page => ({ page, icon: icons[menu.icon] || Menu }))
    if (!items.length) continue
    const section = sections.find(section => section.label === label)
    if (section) section.items.push(...items)
    else sections.push({ label, items, collapsible: Boolean(menu.children), icon: icons[menu.icon] || Menu })
  }
  const currentPage = findWorkspacePage(path)?.key
  return <>
    <button type="button" className="wms-icon-button mobile-header-menu" aria-label="전체 메뉴 열기" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={22} aria-hidden="true" /></button>
    {open && <OrganizationDialog className="mobile-menu-sheet mobile-all-menu" closeOnBackdrop showClose hideFooter title="전체 메뉴" onClose={() => setOpen(false)}>
        <nav aria-label="전체 업무 메뉴">
          {sections.map(section => {
            const current = section.items.some(({ page }) => currentPage === page.key)
            const isExpanded = expanded[section.label] ?? current
            const listId = `mobile-menu-${section.items[0].page.key}`
            const Icon = section.icon
            return <section key={section.label} className={`mobile-menu-section${section.collapsible ? ' mobile-menu-group' : ''}`} aria-label={section.label}>
              {section.collapsible ? <button type="button" className={`mobile-menu-item mobile-menu-toggle${current ? ' is-parent-current' : ''}`} aria-expanded={isExpanded} aria-controls={listId} onClick={() => setExpanded(previous => ({ ...previous, [section.label]: !isExpanded }))}>
                <Icon size={20} aria-hidden="true" /><span>{section.label}</span><ChevronDown className={`mobile-menu-chevron${isExpanded ? ' is-open' : ''}`} size={18} aria-hidden="true" />
              </button> : <h3>{section.label}</h3>}
              <div id={listId} className={`mobile-menu-list${section.collapsible ? ' mobile-menu-sublist' : ''}`} hidden={section.collapsible && !isExpanded}>{section.items.map(({ page, icon: ItemIcon }) => <button key={page.key} type="button" className="mobile-menu-item" aria-current={currentPage === page.key ? 'page' : undefined} onClick={() => page.key === 'guide' ? (setOpen(false), onGuide()) : visit(page.path)}>
                {!section.collapsible && <ItemIcon size={20} aria-hidden="true" />}<span>{page.label}</span>
              </button>)}</div>
            </section>
          })}
        </nav>
    </OrganizationDialog>}
  </>
}
