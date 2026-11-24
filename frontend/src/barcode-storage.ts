import { getLocale } from './i18n.ts'
import type { OverviewRow } from './stock-overview-model.ts'
export type StorageQuantity = { unit: string; quantity: number; reservedQuantity: number; availableQuantity: number }
export type ProductStorageLocation = StorageQuantity & Pick<OverviewRow,'warehouseId'|'zoneId'|'zoneName'|'rackId'|'rackCode'|'rackName'|'locationId'|'locationCode'|'locationName'> & { key:string }
/** Sum disjoint trace rows within one real location/unit, not warehouse/product totals. */
export function barcodeStorageLocations(rows:OverviewRow[]):ProductStorageLocation[]{
  const groups=new Map<string,ProductStorageLocation>()
  for(const row of rows){
    const key=JSON.stringify([row.productId,row.warehouseId,row.rackId,row.locationId,row.unit])
    const current=groups.get(key)
    if(current){current.quantity+=row.quantity;current.reservedQuantity+=row.reservedQuantity;current.availableQuantity+=row.availableQuantity}
    else groups.set(key,{...row,key})
  }
  return [...groups.values()].filter(row=>row.quantity>0)
}
export function storageQuantityLabel(rows:StorageQuantity[]){
  const units=new Map<string,number>();for(const row of rows)units.set(row.unit,(units.get(row.unit)||0)+row.quantity)
  return [...units].map(([unit,value])=>`${value.toLocaleString(getLocale())} ${unit}`).join(' · ')
}
