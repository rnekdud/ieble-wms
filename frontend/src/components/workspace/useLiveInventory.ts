import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../api'
import { inventoryChannel, inventoryEvent } from '../../inventory-refresh'

// Preserve the map while changing its detail query, but never reuse another warehouse or tenant snapshot.
export function useLiveInventory<T>(url: string | null, tenantId: string, interval = 15000, scope = url) {
  const [state, setState] = useState<{ key: string; scope: string | null; data?: T; error?: string; loading: boolean }>()
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(v => v + 1), [])
  useEffect(() => {
    if (!url) return
    let alive = true, inFlight = false, queued = false
    const read = async () => {
      if (!alive || document.hidden) return
      if (inFlight) { queued = true; return }
      inFlight = true
      setState(s => ({ key: url, scope, data: s?.scope === scope ? s.data : undefined, loading: true }))
      try {
        const data = await api<T>(url)
        if (alive) setState({ key: url, scope, data, loading: false })
      } catch (e) {
        if (alive) setState(s => ({ key: url, scope, data: e instanceof ApiError && [401, 403, 404].includes(e.status) ? undefined : s?.scope === scope ? s.data : undefined, loading: false, error: e instanceof Error ? e.message : '갱신에 실패했습니다.' }))
      } finally { inFlight = false; if (queued && alive) { queued = false; void read() } }
    }
    const tick = () => { void read() }
    const changed = (e: Event) => { if ((e as CustomEvent<string>).detail === tenantId) tick() }
    const timer = window.setTimeout(tick, 0), poll = interval > 0 ? window.setInterval(tick, interval) : undefined
    let channel: BroadcastChannel | undefined
    try { channel = new BroadcastChannel(inventoryChannel); channel.onmessage = e => { if (e.data === tenantId) tick() } } catch { /* Manual/focus refresh still works. */ }
    document.addEventListener('visibilitychange', tick); window.addEventListener('focus', tick); window.addEventListener(inventoryEvent, changed)
    return () => { alive = false; clearTimeout(timer); clearInterval(poll); channel?.close(); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); window.removeEventListener(inventoryEvent, changed) }
  }, [url, tenantId, interval, revision, scope])
  const current = state?.scope === scope ? state : undefined
  return { data: current?.data, error: current?.error, loading: !!url && (state?.key !== url || current?.loading !== false), refresh }
}
