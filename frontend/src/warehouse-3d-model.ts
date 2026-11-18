import type { PlanDocument, PlanObject } from './warehouse-plan-model'
import type { StorageItem } from './types/warehouse'

// Display units only: the source plan stores normalized, center-based coordinates.
// Positive canvas rotation is clockwise; Three.js Y rotation has the opposite sign.
export const sceneWidth = 30
export const shelfStep = .8
export function planToWorld(object: PlanObject, aspectRatio: number) {
  const depth = sceneWidth / aspectRatio
  return { x: (object.x - .5) * sceneWidth, z: (object.y - .5) * depth,
    width: object.width * sceneWidth, depth: object.height * depth,
    rotation: -object.rotation * Math.PI / 180 }
}
export type RackSceneItem = { object: PlanObject; rack: StorageItem; world: ReturnType<typeof planToWorld> }
export function sceneRacks(plan: PlanDocument, racks: StorageItem[]): RackSceneItem[] {
  const byId = new Map(racks.map(r => [r.id, r]))
  return plan.objects.flatMap(object => {
    const rack = object.type === 'rack' && object.rackId ? byId.get(object.rackId) : undefined
    return rack ? [{ object, rack, world: planToWorld(object, plan.aspectRatio) }] : []
  })
}
export type RackPick = { rackId: string; level?: number; bay?: number }
export function resolveSlot(locations: { location: StorageItem }[], pick: RackPick) {
  return locations.find(({ location }) => location.rackId === pick.rackId && location.level === pick.level && location.bay === pick.bay)?.location
}
export function detailedShelves(racks: RackSceneItem[]) {
  return racks.reduce((sum, r) => sum + (r.rack.levels || 0) * (r.rack.bays || 0) + (r.rack.bays || 0) * 2, 0) <= 30000
}
