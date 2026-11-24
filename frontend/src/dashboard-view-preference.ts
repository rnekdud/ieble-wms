export type DashboardViewSettings = { view: '2d' | '3d'; showQuantities: boolean }
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>
const key = (userId: string, tenantId: string) => `ieble-wms:dashboard:view:${encodeURIComponent(userId)}:${encodeURIComponent(tenantId)}`
export function readDashboardView(userId: string, tenantId: string, storage?: PreferenceStorage): DashboardViewSettings {
  const defaults: DashboardViewSettings = { view: '3d', showQuantities: true }
  if (!userId || !tenantId) return defaults
  try {
    const value = JSON.parse((storage ?? globalThis.localStorage).getItem(key(userId, tenantId)) || 'null')
    return { view: value?.view === '2d' ? '2d' : '3d', showQuantities: typeof value?.showQuantities === 'boolean' ? value.showQuantities : true }
  } catch { return defaults }
}
export function rememberDashboardView(userId: string, tenantId: string, value: DashboardViewSettings, storage?: PreferenceStorage) {
  if (!userId || !tenantId) return
  try { (storage ?? globalThis.localStorage).setItem(key(userId, tenantId), JSON.stringify(value)) } catch { /* Private/blocked storage must not prevent switching views. */ }
}
