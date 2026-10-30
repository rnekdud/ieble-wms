export type PlanType = 'wall' | 'zone' | 'rack' | 'aisle' | 'door' | 'text' | 'shape'
export type PlanObject = { id: string; type: PlanType; label: string; x: number; y: number; width: number; height: number; rotation: number; fill: string; shape: 'rectangle' | 'ellipse'; rackId: string | null; zoneId: string | null; locationId: string | null }
export type PlanDocument = { schemaVersion: number; aspectRatio: number; objects: PlanObject[] }
export type PlanResponse = PlanDocument & { exists: boolean; version: string; updatedAt: string | null; updatedByUserId: string | null }
export type PlanHistory = { past: PlanDocument[]; present: PlanDocument; future: PlanDocument[] }
export const blankPlan = (): PlanDocument => ({ schemaVersion: 1, aspectRatio: 1.5, objects: [] })
export const planLabels: Record<PlanType, string> = { wall: '벽', zone: '구역', rack: '랙', aisle: '통로', door: '출입문', text: '텍스트', shape: '일반 도형' }
export const planColors: Record<PlanType, string> = { wall: '#536460', zone: '#dbeee6', rack: '#a7ccdf', aisle: '#f2e7bd', door: '#d6c3a7', text: '#24483e', shape: '#dfece7' }
export function createPlanObject(type: PlanType, id: string, x = .5, y = .5): PlanObject {
  return { id, type, label: planLabels[type], x, y, width: type === 'wall' ? .24 : type === 'zone' ? .3 : .14, height: type === 'wall' ? .02 : type === 'zone' ? .3 : type === 'aisle' ? .3 : .12, rotation: 0, fill: planColors[type], shape: 'rectangle', rackId: null, zoneId: null, locationId: null }
}
export function editPlan(history: PlanHistory, next: PlanDocument): PlanHistory {
  if (JSON.stringify(next) === JSON.stringify(history.present)) return history
  return { past: [...history.past, history.present].slice(-100), present: next, future: [] }
}
export function undoPlan(h: PlanHistory): PlanHistory { return h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h }
export function redoPlan(h: PlanHistory): PlanHistory { return h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h }
export const round = (v: number) => Math.round(v * 1e6) / 1e6
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
export const rotation = (v: number) => round(((v + 180) % 360 + 360) % 360 - 180)
export function movePlanObjects(doc: PlanDocument, ids: string[], dx: number, dy: number, snap: boolean): PlanDocument {
  const selected = doc.objects.filter(o => ids.includes(o.id))
  if (!selected.length) return doc
  // Snap one anchor and apply the same delta to preserve the selected group's relative arrangement.
  if (snap) { dx = Math.round((selected[0].x + dx) * 60) / 60 - selected[0].x; const units = 60 / doc.aspectRatio; dy = Math.round((selected[0].y + dy) * units) / units - selected[0].y }
  dx = clamp(dx, -Math.min(...selected.map(o => o.x)), 1 - Math.max(...selected.map(o => o.x)))
  dy = clamp(dy, -Math.min(...selected.map(o => o.y)), 1 - Math.max(...selected.map(o => o.y)))
  return { ...doc, objects: doc.objects.map(o => ids.includes(o.id) ? { ...o, x: round(o.x + dx), y: round(o.y + dy) } : o) }
}
export function duplicatePlanObjects(doc: PlanDocument, ids: string[], nextId: () => string): PlanDocument {
  const copy = doc.objects.filter(o => ids.includes(o.id)).map(o => ({ ...o, id: nextId(), rackId: null, zoneId: null, locationId: null, x: round(clamp(o.x + .025, 0, 1)), y: round(clamp(o.y + .025, 0, 1)) }))
  return { ...doc, objects: [...doc.objects, ...copy].slice(0, 500) }
}
export function deletePlanObjects(doc: PlanDocument, ids: string[]): PlanDocument { return { ...doc, objects: doc.objects.filter(o => !ids.includes(o.id)) } }

export function unlinkedStructureObjects(doc: PlanDocument): PlanObject[] {
  return doc.objects.filter(o => (o.type === 'rack' && !o.rackId) || (o.type === 'zone' && !o.zoneId))
}
export function duplicateRackLinks(doc: PlanDocument): boolean {
  const ids = doc.objects.flatMap(o => o.rackId ? [o.rackId] : [])
  return new Set(ids).size !== ids.length
}
