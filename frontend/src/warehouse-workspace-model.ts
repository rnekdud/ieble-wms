import { blankPlan, duplicateRackLinks } from './warehouse-plan-model.ts'
import type { PlanDocument, PlanResponse } from './warehouse-plan-model.ts'
import type { StorageItem, WarehouseDetailData } from './types/warehouse.ts'

export const emptyVersion = '00000000-0000-0000-0000-000000000000'
export const warehouseTypes = ['일반/상온', '실온', '냉장', '냉동', '저온', '항온·항습', '위험물', '야외', '기타']
export type WarehouseBasics = { version: string; code?: string; name: string; type: string; typeDescription: string; customCode: string; address: string; addressDetail: string; contactName: string; notes: string; isActive: boolean }
export type DraftStructure = { clientId: string; id: string | null; version: string; name: string; code: string; isActive: boolean; zoneClientId: string | null; levels: number; bays: number; minimumLevels: number; minimumBays: number }
export type StructureKind = 'zones' | 'racks' | 'floorLocations'
export type WorkspaceDraft = { warehouse: WarehouseBasics; zones: DraftStructure[]; racks: DraftStructure[]; floorLocations: DraftStructure[] }
export type WorkspaceRead = { detail: WarehouseDetailData; plan: PlanResponse; floorLocations: StorageItem[] }
export type WorkspaceSaved = { warehouseId: string; code: string; zones: Record<string, string>; racks: Record<string, string>; floorLocations: Record<string, string>; rackLocations: Record<string, string> }
export function newStructure(clientId: string, name: string): DraftStructure {
  return { clientId, id: null, version: emptyVersion, name, code: '', isActive: true, zoneClientId: null, levels: 3, bays: 4, minimumLevels: 1, minimumBays: 1 }
}
export function emptyWorkspace(): WorkspaceDraft {
  return { warehouse: { version: emptyVersion, name: '', type: '', typeDescription: '', customCode: '', address: '', addressDetail: '', contactName: '', notes: '', isActive: true }, zones: [], racks: [], floorLocations: [] }
}
export function hydrateWorkspace(data: WorkspaceRead): WorkspaceDraft {
  const w = data.detail.warehouse
  const row = (s: StorageItem): DraftStructure => ({ ...newStructure(s.id, s.name), id: s.id, version: s.version, code: s.code, isActive: s.isActive, zoneClientId: s.zoneId || null, levels: s.levels || 1, bays: s.bays || 1, minimumLevels: s.levels || 1, minimumBays: s.bays || 1 })
  return { warehouse: { version: w.version, code: w.code, name: w.name, type: w.type || '', typeDescription: w.typeDescription || '', customCode: w.customCode || '', address: w.address || '', addressDetail: w.addressDetail || '', contactName: w.contactName || '', notes: w.notes || '', isActive: w.isActive }, zones: data.detail.zones.map(row), racks: data.detail.racks.map(row), floorLocations: data.floorLocations.map(row) }
}
const normalizeCode = (value: string) => value.trim().normalize('NFKC').toUpperCase()
export function workspaceError(draft: WorkspaceDraft, plan: PlanDocument): string | null {
  if (!draft.warehouse.name.trim()) return '창고명을 입력해 주세요.'
  const all = [...draft.zones, ...draft.racks, ...draft.floorLocations]
  if (new Set(all.map(x => x.clientId)).size !== all.length) return '구조 ID가 중복되었습니다.'
  for (const kind of ['zones', 'racks', 'floorLocations'] as const) {
    const rows = draft[kind], limit = kind === 'floorLocations' ? 64 : 32, label = { zones: '구역', racks: '랙', floorLocations: '바닥 위치' }[kind]
    if (rows.length > (kind === 'floorLocations' ? 1000 : 500)) return `${label} 개수가 저장 한도를 초과했습니다.`
    if (rows.some(x => !x.name.trim() || x.name.trim().length > 200 || normalizeCode(x.code).length > limit || !/^[A-Z0-9][A-Z0-9._-]*$/.test(normalizeCode(x.code)))) return `${label}의 이름과 코드를 입력해 주세요. 코드는 영문·숫자·점·밑줄·하이픈 ${limit}자 이내입니다.`
    if (new Set(rows.map(x => normalizeCode(x.code))).size !== rows.length) return `${label} 코드가 중복되었습니다.`
  }
  if (draft.racks.some(r => !Number.isInteger(r.levels) || !Number.isInteger(r.bays) || r.levels < r.minimumLevels || r.bays < r.minimumBays || r.levels > 100 || r.bays > 100 || r.levels * r.bays > 1000)) return '랙은 단·칸 각각 1~100, 총 1,000개 이내로 입력해 주세요. 기존 구조는 확장만 가능합니다.'
  if ([...draft.racks, ...draft.floorLocations].some(r => r.zoneClientId && !draft.zones.some(z => z.clientId === r.zoneClientId))) return '소속 구역 연결을 확인해 주세요.'
  if (duplicateRackLinks(plan)) return '동일 랙은 도면의 한 객체에만 연결할 수 있습니다.'
  const generated = new Set<string>()
  for (const r of draft.racks) for (let l = 1; l <= r.levels; l++) for (let b = 1; b <= r.bays; b++) {
    if (r.id && l <= r.minimumLevels && b <= r.minimumBays) continue
    generated.add(`${normalizeCode(r.code)}-L${String(l).padStart(2, '0')}-B${String(b).padStart(2, '0')}`)
  }
  if (draft.floorLocations.some(x => generated.has(normalizeCode(x.code)))) return '바닥 위치 코드가 랙에서 생성할 위치 코드와 중복됩니다.'
  if (generated.size + draft.floorLocations.filter(x => !x.id).length > 10_000) return '한 번의 저장에서는 보관 위치를 최대 10,000개까지 추가할 수 있습니다.'
  return null
}
export function workspaceRequest(draft: WorkspaceDraft, plan: PlanDocument, planVersion: string, hadPlan: boolean, requestId: string) {
  const common = (x: DraftStructure) => ({ clientId: x.clientId, id: x.id, version: x.version, name: x.name, code: x.code, isActive: x.isActive })
  return { requestId, warehouse: draft.warehouse, zones: draft.zones.map(common), racks: draft.racks.map(x => ({ ...common(x), zoneClientId: x.zoneClientId, levels: x.levels, bays: x.bays })), floorLocations: draft.floorLocations.map(x => ({ ...common(x), zoneClientId: x.zoneClientId })), plan: hadPlan || plan.objects.length ? { ...plan, version: planVersion } : null }
}
export function previewRack(rack: DraftStructure, existing: StorageItem[] = []): StorageItem[] {
  if (!Number.isInteger(rack.levels) || !Number.isInteger(rack.bays) || rack.levels < 1 || rack.bays < 1 || rack.levels > 100 || rack.bays > 100 || rack.levels * rack.bays > 1000) return []
  const slots = new Map(existing.map(s => [`${s.level}:${s.bay}`, s]))
  return Array.from({ length: rack.levels * rack.bays }, (_, i) => {
    const level = Math.floor(i / rack.bays) + 1, bay = i % rack.bays + 1
    return slots.get(`${level}:${bay}`) || { id: `${rack.clientId}:${level}:${bay}`, code: `${normalizeCode(rack.code) || '랙코드'}-L${String(level).padStart(2, '0')}-B${String(bay).padStart(2, '0')}`, name: `${rack.name} ${level}단 ${bay}칸`, rackId: rack.clientId, level, bay, isActive: true, version: emptyVersion, createdAt: '', updatedAt: '' }
  })
}
export const initialPlan = (response?: PlanResponse): PlanDocument => response ? { schemaVersion: response.schemaVersion, aspectRatio: response.aspectRatio, objects: response.objects } : blankPlan()
