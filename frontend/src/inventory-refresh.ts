export const inventoryEvent = 'wms:inventory-changed'
export const inventoryChannel = 'ieble-wms-inventory'
export function notifyInventoryChanged(path: string) {
  const tenant = path.match(/^\/api\/tenants\/([^/]+)\/(?:receipts|shipments|inventory|stocktakes|warehouses|products)(?:\/|$|\?)/)?.[1]
  if (!tenant) return
  window.dispatchEvent(new CustomEvent(inventoryEvent, { detail: tenant }))
  try { const channel = new BroadcastChannel(inventoryChannel); channel.postMessage(tenant); channel.close() } catch { /* Polling remains available. */ }
}
