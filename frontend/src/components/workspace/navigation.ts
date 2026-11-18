export type WorkspacePage = {
  key: string
  label: string
  path: string
  managerOnly?: boolean
  masterOnly?: boolean
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
    label: '바코드 조회',
    icon: 'barcode',
    page: page('barcode-lookup', '바코드 조회', '/app/barcode-lookup'),
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
      page('stocktake', '재고 실사/조사', '/app/inventory/counts'),
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
    label: '조직관리',
    icon: 'settings',
    children: [
      page('org-chart', '조직도', '/app/settings/organization', false),
      page('users', '사용자 관리', '/app/settings/users', false, true),
      page('organization-items', '항목 관리', '/app/settings/items', false, true),
    ],
  },
  {
    label: '마스터 관리',
    icon: 'shield',
    children: [
      page('company', '기업 관리', '/app/settings/company', false, true),
      { ...page('billing', '요금제 및 결제 관리', '/app/master/billing', false), masterOnly: true },
      { ...page('activity-log', '활동 로그', '/app/master/activity-log', false), masterOnly: true },
      { ...page('permissions', '권한 설정', '/app/master/permissions', false), masterOnly: true },
    ],
  },
  {
    label: '이용 가이드',
    icon: 'guide',
    page: page('guide', '이용 가이드', '/app/guide', false),
  },
  {
    label: '문의하기',
    icon: 'support',
    page: page('support', '문의하기', '/app/support', false),
  },
]
export const workspacePages = workspaceMenus.flatMap((menu) =>
  menu.page ? [menu.page] : menu.children || [],
)
export const isManager = (role: string | undefined) =>
  role === 'Master' || role === 'Administrator'
export const canViewPage = (page: WorkspacePage, role: string | undefined, permissions?: Record<string, string[]>) => {
  if (role === 'Master') return true
  if (page.masterOnly || !role) return false
  if (page.key === 'guide') return true
  // A read-only entry point into existing product/warehouse permissions.
  if (page.key === 'barcode-lookup' && permissions)
    return ['products', 'warehouses'].some(area => permissions[area]?.includes('read'))
  if (permissions) return permissions[page.key]?.includes('menu') === true && permissions[page.key]?.includes('read') === true
  return !page.managerOnly || isManager(role)
}
export const registrationPaths = ['/app/products/new', '/app/receipts/new', '/app/shipments/new', '/app/inventory/counts/new']
export const isRegistrationPath = (path: string) => registrationPaths.includes(path)
export const workspaceDetailId = (path: string) => {
  const match = /^\/app\/(products|receipts|shipments|inventory\/counts)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(path)
  return match?.[2]
}
export const findWorkspacePage = (path: string) =>
  workspacePages.find((page) => page.path === (/^\/app\/guide\/[a-z-]+$/.test(path) ? '/app/guide' : isRegistrationPath(path) ? path.slice(0, -4) : workspaceDetailId(path) ? path.slice(0, path.lastIndexOf('/')) : path))
export const canOpenRegistration = (path: string, permissions: Record<string, string[]>) =>
  !isRegistrationPath(path) || permissions[findWorkspacePage(path)!.key]?.includes('create') === true
