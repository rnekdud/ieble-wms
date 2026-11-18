import type { BarcodeScanEvent } from './barcode-scan'
import type { ShipmentDetail } from './shipment-model'
export type ShipmentScanCommand = BarcodeScanEvent & { allocationId: string | null; locationId: string | null }
export type ShipmentScanResult = { outcome: 'applied' | 'location' | 'select-allocation' | 'manual' | 'over-limit'; detail: ShipmentDetail; allocationId: string | null; candidateAllocationIds: string[]; locationId: string | null; locationCode: string | null; requestId: string; replayed: boolean }
export function restoreShipmentScans(value: string | null): ShipmentScanCommand[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]')
    const guid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)
    if (!Array.isArray(parsed) || parsed.length > 100) return []
    return parsed.filter((v): v is ShipmentScanCommand => v && guid(v.requestId) && typeof v.barcode === 'string' && v.barcode.length > 0 && v.barcode.length <= 64 && (v.locationId === null || guid(v.locationId)) && (v.allocationId === null || guid(v.allocationId)))
  } catch { return [] }
}
