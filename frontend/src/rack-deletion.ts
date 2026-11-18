import type { PlanDocument, PlanHistory } from './warehouse-plan-model.ts'
export type RackDeletion = { zoneIds?:string[]; rackIds:string[]; locationIds:string[]; objectIds:string[]; planVersion:string }
export function removeDeletedRacks<T extends PlanDocument>(doc:T, deleted:RackDeletion):T {
  return {...doc,objects:doc.objects.filter(o=>!deleted.objectIds.includes(o.id)&&!(o.zoneId&&deleted.zoneIds?.includes(o.zoneId))&&!(o.rackId&&deleted.rackIds.includes(o.rackId))&&!(o.locationId&&deleted.locationIds.includes(o.locationId)))}
}
// Purge permanent deletions from undo/redo as well, without discarding unrelated edits.
export function removeDeletedRackHistory(history:PlanHistory, deleted:RackDeletion):PlanHistory {
 return {past:history.past.map(p=>removeDeletedRacks(p,deleted)),present:removeDeletedRacks(history.present,deleted),future:history.future.map(p=>removeDeletedRacks(p,deleted))}
}
