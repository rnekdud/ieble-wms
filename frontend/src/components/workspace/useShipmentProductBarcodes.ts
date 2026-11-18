import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { SelectionResult } from '../../product-selection-model'

// Reuse shipment-read permission; deduplicate products shared by multiple LOT/location rows.
export default function useShipmentProductBarcodes(endpoint: string, warehouseId: string | undefined, productIds: string[]) {
  const ids = [...new Set(productIds.filter(Boolean))].sort().join(',')
  const key = `${endpoint}:${warehouseId}:${ids}`
  const [result, setResult] = useState<{ key: string; values: Record<string, string | null>; failed: boolean }>()
  useEffect(() => {
    if (!warehouseId || !ids) return
    let live = true
    async function load() {
      const list = ids.split(','), values: Record<string, string | null> = {}
      try {
        for (let offset = 0; offset < list.length; offset += 100) {
          const params = new URLSearchParams({ kind: 'product-table', warehouseId: warehouseId!, pageSize: '100' })
          list.slice(offset, offset + 100).forEach(id => params.append('ids', id))
          const data = await api<SelectionResult>(`${endpoint}/choices?${params}`)
          if (!live) return
          data.items.forEach(product => { values[product.id] = product.barcode || null })
        }
        if (live) setResult({ key, values, failed: false })
      } catch { if (live) setResult({ key, values, failed: true }) }
    }
    void load()
    return () => { live = false }
  }, [endpoint, warehouseId, ids, key])
  return (id: string) => {
    if (!warehouseId || !id) return '조회 불가'
    if (result?.key !== key) return '조회 중…'
    if (Object.hasOwn(result.values, id)) return result.values[id] || '미등록'
    return result.failed ? '조회 실패' : '조회 불가'
  }
}
