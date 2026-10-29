export type StorageItem = {
  id: string
  code: string
  name: string
  isActive: boolean
  version: string
  createdAt: string
  updatedAt: string
  customCode?: string | null
  typeDescription?: string | null
  type?: string | null
  address?: string | null
  addressDetail?: string | null
  contactName?: string | null
  notes?: string | null
  zoneId?: string | null
  rackId?: string | null
  levels?: number
  bays?: number
  level?: number | null
  bay?: number | null
}
export type WarehouseDetailData = {
  warehouse: StorageItem
  zones: StorageItem[]
  racks: StorageItem[]
  locationCount: number
}
export type WarehouseList = {
  items: {
    warehouse: StorageItem
    zoneCount: number
    rackCount: number
    locationCount: number
  }[]
  total: number
  page: number
  pageSize: number
}
export type LocationList = {
  items: { location: StorageItem; effectiveActive: boolean }[]
  total: number
  page: number
  pageSize: number
}
export type WarehouseEdit = {
  kind: 'warehouse' | 'zones' | 'racks' | 'locations'
  item?: StorageItem
  warehouseId?: string
  zones?: StorageItem[]
}
