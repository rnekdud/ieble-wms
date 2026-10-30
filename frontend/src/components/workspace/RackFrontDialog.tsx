import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { StorageItem } from '../../types/warehouse'
import OrganizationDialog from './OrganizationDialog'
export type RackFrontData = { rack: StorageItem; locations: { location: StorageItem; effectiveActive: boolean }[]; inventoryAvailable: false }
export default function RackFrontDialog({ endpoint, rackId, preview, onClose }: { endpoint?: string; rackId?: string; preview?: RackFrontData; onClose: () => void }) {
  const [remote, setData] = useState<RackFrontData | null>(null), [error, setError] = useState(''), [selected, setSelected] = useState<string | null>(null)
  const data = preview || remote
  useEffect(() => { if (preview || !endpoint || !rackId) return; let live = true; api<RackFrontData>(`${endpoint}/racks/${rackId}/front`).then(d => { if (live) setData(d) }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [endpoint, rackId, preview])
  const detail = data?.locations.find(l => l.location.id === selected)
  return <OrganizationDialog title={preview ? '랙 정면도 미리보기' : '랙 정면도'} onClose={onClose}>
    {error && <p role="alert" className="alert error">{error}</p>}
    {!data ? <p>{error ? '랙을 조회할 수 없습니다.' : '실제 보관 위치를 불러오는 중…'}</p> : <>
      {preview && <p className="organization-help">저장 전 미리보기입니다. 새 위치의 실제 ID는 최종 저장 시 부여됩니다.</p>}
      <h3>{data.rack.name} · {data.rack.code}</h3><p>{data.rack.levels}단 × {data.rack.bays}칸 · {data.locations.length}개 보관 위치</p>
      <div className="rack-front-scroll"><div className="rack-front-grid" style={{ gridTemplateColumns: `repeat(${data.rack.bays}, minmax(100px, 1fr))` }}>
        {Array.from({ length: data.rack.levels! }, (_, i) => data.rack.levels! - i).flatMap(level => Array.from({ length: data.rack.bays! }, (_, i) => {
          const bay = i + 1, slot = data.locations.find(l => l.location.level === level && l.location.bay === bay)
          return <button type="button" key={`${level}:${bay}`} className={`secondary ${slot?.effectiveActive ? '' : 'is-inactive'}`} disabled={!slot} aria-label={`${level}단 ${bay}칸 ${slot?.location.code || '위치 없음'}`} aria-pressed={selected === slot?.location.id} onClick={() => setSelected(slot!.location.id)}><strong>{level}단 · {bay}칸</strong><small>{slot?.location.code || '위치 없음'}</small>{slot && <small>{slot.effectiveActive ? '사용' : '미사용'}</small>}</button>
        }))}
      </div></div>
      {detail && <section className="rack-location-detail" aria-label="보관 위치 상세"><h3>{detail.location.code}</h3><dl className="warehouse-details"><dt>위치명</dt><dd>{detail.location.name}</dd><dt>위치 ID</dt><dd>{detail.location.id.includes(':') ? '저장 시 부여' : detail.location.id}</dd><dt>사용 가능 상태</dt><dd>{detail.effectiveActive ? '사용' : '미사용'}</dd><dt>단 / 칸</dt><dd>{detail.location.level} / {detail.location.bay}</dd></dl></section>}
      <p className="organization-help">재고 조회 API는 아직 연결되지 않았습니다. 보관 위치 정보만 표시합니다.</p>
    </>}
  </OrganizationDialog>
}
