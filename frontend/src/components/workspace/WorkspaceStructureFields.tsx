import type { DraftStructure, StructureKind } from '../../warehouse-workspace-model'

export default function WorkspaceStructureFields({ kind, value, zones, disabled, onChange }: { kind: StructureKind; value: DraftStructure; zones: DraftStructure[]; disabled: boolean; onChange: (patch: Partial<DraftStructure>) => void }) {
  const label = { zones: '구역', racks: '랙', floorLocations: '바닥 위치' }[kind]
  return <fieldset disabled={disabled} className="workspace-structure-fields">
    <h3>{label} 정보</h3>
    <p className="organization-help">{value.id ? '기존 항목 · 저장 시 변경사항을 함께 반영합니다.' : '저장 전 항목 · 아직 DB에 등록되지 않았습니다.'}</p>
    <label>{label}명<input aria-label={`${label} 이름`} required maxLength={200} value={value.name} onChange={e => onChange({ name: e.target.value })} /></label>
    <label>{label} 코드<input aria-label={`${label} 코드`} required maxLength={kind === 'floorLocations' ? 64 : 32} value={value.code} onChange={e => onChange({ code: e.target.value })} /></label>
    {kind === 'racks' && <>
      <div className="plan-structure-dimensions"><label>단수<input aria-label="랙 단수" type="number" step={1} min={value.minimumLevels} max={100} value={value.levels || ''} onChange={e => onChange({ levels: Number(e.target.value) })} /></label><label>칸수<input aria-label="랙 칸수" type="number" step={1} min={value.minimumBays} max={100} value={value.bays || ''} onChange={e => onChange({ bays: Number(e.target.value) })} /></label></div>
      <p className="organization-help">{value.levels * value.bays}개 보관 위치 · {value.id ? '기존 위치 ID는 유지하며 확장만 가능합니다.' : '최종 저장 시 함께 생성됩니다.'}</p>
    </>}
    {kind !== 'zones' && <label>소속 구역<select aria-label={`${label} 소속 구역`} disabled={!!value.id} value={value.zoneClientId || ''} onChange={e => onChange({ zoneClientId: e.target.value || null })}><option value="">구역 없음</option>{zones.map(z => <option key={z.clientId} value={z.clientId}>{z.code || '코드 미입력'} · {z.name}{z.isActive ? '' : ' (미사용)'}</option>)}</select></label>}
    <label className="organization-checkbox"><input type="checkbox" aria-label={`${label} 사용`} checked={value.isActive} onChange={e => onChange({ isActive: e.target.checked })} />사용</label>
  </fieldset>
}
