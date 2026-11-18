import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { SelectionProduct, SelectionResult } from '../../product-selection-model'
export default function useShipmentAvailability(endpoint: string, warehouseId: string | undefined, shipmentId: string | undefined, productIds: string[]) {
  const ids = [...new Set(productIds)].sort().join(','), [revision, setRevision] = useState(0)
  const key = `${endpoint}:${warehouseId}:${shipmentId}:${ids}:${revision}`
  const [result, setResult] = useState<{ key: string; items?: SelectionProduct[]; error?: string }>()
  useEffect(() => {
    const refresh = () => setRevision(n => n + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  useEffect(() => {
    if (!warehouseId || !ids) return
    let live = true
    const params = new URLSearchParams({ kind: 'product-table', warehouseId, pageSize: '100', ...(shipmentId ? { shipmentId } : {}) })
    ids.split(',').forEach(id => params.append('ids', id))
    api<SelectionResult>(`${endpoint}/choices?${params}`).then(data => { if (live) setResult({ key, items: data.items }) }).catch(e => { if (live) setResult({ key, error: e.message }) })
    return () => { live = false }
  }, [endpoint, warehouseId, shipmentId, ids, key])
  const current = result?.key === key ? result : undefined
  return { stocks: new Map((current?.items || []).map(p => [p.id, p])), loading: !!warehouseId && !!ids && !current, error: current?.error || '', refresh: () => setRevision(n => n + 1) }
}
