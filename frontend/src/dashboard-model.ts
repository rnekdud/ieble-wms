import type { OverviewRow } from './stock-overview-model'
export type DashboardData = {
 tenantId: string; name: string; asOf: string; today: string; days: number; timeZone: string; expirySoonDays: number
 access: { products: boolean; warehouses: boolean; receipts: boolean; shipments: boolean; stock: boolean; statistics: boolean; trendReceipts: boolean; trendShipments: boolean }
 metrics: { activeProducts: number | null; activeWarehouses: number | null; lowProducts: number | null; openReceipts: number | null; openShipments: number | null; reservedShipments: number | null }
 todayReceipts: { confirmed: number; scheduled: number; working: number } | null; todayShipments: { confirmed: number; scheduled: number; working: number } | null
 trend: { start: string; end: string; receipts: number | null; shipments: number | null }[] | null
 recent: { id: string; direction: string; number: string; partnerName: string; warehouseName: string; status: string; expectedDate: string; confirmedAt: string | null; updatedAt: string }[] | null
 lowItems: OverviewRow[] | null; expiryCount: number | null; expiryItems: { item: OverviewRow; remainingDays: number }[] | null
}
export const canTask = (permissions: Record<string, string[]>, feature: string, action = 'read') => ['menu', 'read', action].every(a => permissions[feature]?.includes(a))
// Entry hints only open existing UI. Every actual read/write still uses existing permission-checked APIs.
export function businessEntry(search: string, canCreate: boolean): { id: string | null } | null {
 const p = new URLSearchParams(search), id = p.get('document')
 if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { id }
 return p.get('action') === 'new' && canCreate ? { id: null } : null
}
export function reportEntry(search: string): { status?: string; view?: 'product' | 'location' } {
 const p = new URLSearchParams(search), status = p.get('status'), view = p.get('view')
 return { ...(['low', 'expiring', 'expired', 'reserved'].includes(status || '') ? { status: status! } : {}), ...(view === 'product' || view === 'location' ? { view } : {}) }
}
