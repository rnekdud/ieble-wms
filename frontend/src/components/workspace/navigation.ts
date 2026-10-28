export type WorkspacePage = {
  key: string
  label: string
  path: string
  managerOnly?: boolean
  business: boolean
}
export type WorkspaceMenu = {
  label: string
  icon: string
  page?: WorkspacePage
  children?: WorkspacePage[]
}
const page = (
  key: string,
  label: string,
  path: string,
  business = true,
  managerOnly = false,
): WorkspacePage => ({ key, label, path, business, managerOnly })
export const workspaceMenus: WorkspaceMenu[] = [
  {
    label: '대시보드',
    icon: 'dashboard',
    page: page('dashboard', '대시보드', '/app'),
  },
  {
    label: '창고관리',
    icon: 'warehouse',
    page: page('warehouses', '창고관리', '/app/warehouses'),
  },
  {
    label: '상품관리',
    icon: 'products',
    page: page('products', '상품관리', '/app/products'),
  },
  {
    label: '입고관리',
    icon: 'receipts',
    page: page('receipts', '입고관리', '/app/receipts'),
  },
  {
    label: '출고관리',
    icon: 'shipments',
    page: page('shipments', '출고관리', '/app/shipments'),
  },
  {
    label: '재고관리',
    icon: 'inventory',
    children: [
      page(
        'stock-adjustments',
        '재고 이동 및 조정',
        '/app/inventory/adjustments',
      ),
      page('stocktake', '재고 실사', '/app/inventory/counts'),
    ],
  },
  {
    label: '거래처관리',
    icon: 'partners',
    page: page('partners', '거래처관리', '/app/partners'),
  },
  {
    label: '통계 및 보고서',
    icon: 'reports',
    children: [
      page('stock-overview', '재고 현황', '/app/reports/stock'),
      page('movement-stats', '입출고 통계', '/app/reports/movements'),
      page('stock-history', '재고 변동 이력', '/app/reports/history'),
    ],
  },
  {
    label: '문의하기',
    icon: 'support',
    page: page('support', '문의하기', '/app/support', false),
  },
  {
    label: '환경설정',
    icon: 'settings',
    children: [
      page('company', '기업 정보 관리', '/app/settings/company', false, true),
      page('users', '사용자 및 권한 관리', '/app/settings/users', false, true),
      page(
        'billing',
        '요금제 및 결제 관리',
        '/app/settings/billing',
        false,
        true,
      ),
    ],
  },
]
export const workspacePages = workspaceMenus.flatMap((menu) =>
  menu.page ? [menu.page] : menu.children || [],
)
export const isManager = (role: string | undefined) =>
  role === 'Master' || role === 'Administrator'
export const canViewPage = (page: WorkspacePage, role: string | undefined) =>
  !page.managerOnly || isManager(role)
export const findWorkspacePage = (path: string) =>
  workspacePages.find((page) => page.path === path)
