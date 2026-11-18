type SelectionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const key = (tenantId: string) => `ieble-wms:dashboard:warehouse:${tenantId}`

export function readDashboardWarehouse(tenantId: string, storage?: SelectionStorage): string {
  try { return (storage ?? globalThis.localStorage).getItem(key(tenantId)) || '' } catch { return '' }
}

export function rememberDashboardWarehouse(tenantId: string, warehouseId: string, storage?: SelectionStorage) {
  try {
    const target = storage ?? globalThis.localStorage
    if (warehouseId) target.setItem(key(tenantId), warehouseId)
    else target.removeItem(key(tenantId))
  } catch { /* The dashboard remains usable when browser storage is unavailable. */ }
}

// Only server-authorized active warehouses can become the current selection.
export function resolveDashboardWarehouse<T extends { id: string }>(warehouses: readonly T[], selectedId: string): T | undefined {
  return warehouses.find(warehouse => warehouse.id === selectedId) ?? warehouses[0]
}
