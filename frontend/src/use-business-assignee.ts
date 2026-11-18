import { useContext, useEffect, useState } from 'react'
import { api } from './api'
import { BusinessAssigneeContext, type BusinessAssignee } from './business-assignee'
export type AssigneeFeature = 'receipts' | 'shipments' | 'stocktake' | 'stock-adjustments' | 'warehouses'

/** Resolve saved IDs in the current tenant, including inactive historical assignees. */
export function useBusinessAssignee(feature: AssigneeFeature, userId?: string | null, selected?: { tenantId?: string; member: BusinessAssignee }) {
  const { tenantId, current } = useContext(BusinessAssigneeContext)
  const known = selected && selected.tenantId === tenantId && selected.member.id === userId ? selected.member : current?.id === userId ? current : undefined
  const key = `${tenantId}:${feature}:${userId}`
  const [loaded, setLoaded] = useState<{ key: string; member?: BusinessAssignee; error?: string }>()
  useEffect(() => {
    if (!tenantId || !userId || known) return
    let live = true
    api<BusinessAssignee>(`/api/tenants/${tenantId}/assignees/${encodeURIComponent(userId)}?kind=${feature}`)
      .then(member => { if (live) setLoaded({ key, member }) })
      .catch(() => { if (live) setLoaded({ key, error: '담당자 추가 정보를 불러오지 못했습니다.' }) })
    return () => { live = false }
  }, [tenantId, userId, feature, key, known])
  return { tenantId, member: known || (loaded?.key === key ? loaded.member : undefined), error: !known && loaded?.key === key ? loaded.error : undefined }
}
