export type OrganizationItem = {
  id: string
  name: string
  parentId?: string | null
  sortOrder: number
  isActive: boolean
  version: string
  memberCount: number
  childCount?: number
}
export type OrganizationOptions = { departments: OrganizationItem[]; positions: OrganizationItem[] }
export type ChartData = {
  departments: Pick<OrganizationItem, 'id' | 'name' | 'parentId' | 'isActive' | 'sortOrder'>[]
  employees: { userId: string; name: string; departmentId: string | null; positionId: string | null; positionName: string | null }[]
}
