import StorageTreeNode from './StorageTreeNode'
import { useStorageExpansion } from './useStorageExpansion'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Hand, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { api } from '../../api'
import type { LocationList, StorageItem, WarehouseDetailData } from '../../types/warehouse'
import type { PlanObject } from '../../warehouse-plan-model'
import type { WorkspaceRead } from '../../warehouse-workspace-model'
import Pagination from '../Pagination'
import RackBarcodeLabel from './RackBarcodeLabel'
import { RackStock } from './RackFrontDialog'
import type { RackFrontData } from './RackFrontDialog'
const PlanCanvas = lazy(() => import('./PlanCanvas'))
const Warehouse3DView = lazy(() => import('./Warehouse3DView'))
import type { PlanCanvasHandle } from './PlanCanvas'
import { useLiveInventory } from './useLiveInventory'
import './warehouse-plan.css'
import './warehouse-structure-readonly.css'

type Selection = { kind: 'zone' | 'rack' | 'location'; item: StorageItem; request?: number }
type SelectStructure = (next:Selection|null, reveal?:boolean)=>void
type Props = { endpoint: string; data: WarehouseDetailData; canUpdate: boolean; onEditPlan: () => void }
export default function WarehouseStructureReadOnly({ endpoint, data, canUpdate, onEditPlan }: Props) {
  const [search, setSearch] = useState(() => new URLSearchParams(location.search).get('locationCode') || '')
  const [status, setStatus] = useState('all'), [page, setPage] = useState(1)
  const [view, setView] = useState('all'), [pan, setPan] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(() => { const item=data.racks.find(r=>r.id===new URLSearchParams(location.search).get('rackId')); return item?{kind:'rack',item}:null })
  const [linkedSlot,setLinkedSlot] = useState(() => { const q=new URLSearchParams(location.search); return {rackId:q.get('rackId'),level:Number(q.get('level')),bay:Number(q.get('bay'))} })
  const [dimension,setDimension] = useState<'2d'|'3d'>(()=>new URLSearchParams(location.search).get('view')==='3d'?'3d':'2d')
  function changeDimension(next:'2d'|'3d') { setDimension(next); const url=new URL(location.href);url.searchParams.set('view',next);window.history.replaceState(window.history.state,'',url) }
  const [planState, setPlan] = useState<{key: string; value: WorkspaceRead} | null>(null), [planError, setPlanError] = useState(''), [retry, setRetry] = useState(0)
  const canvas = useRef<PlanCanvasHandle>(null), tree = useRef<HTMLElement>(null)
  const [reveal,setReveal] = useState<{rackId:string;version:number}|null>(null)
  useEffect(() => {
    if (!reveal || dimension!=='2d') return
    let second=0
    const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{
      const node=Array.from(tree.current?.querySelectorAll<HTMLElement>('[data-rack-id]')||[]).find(n=>n.dataset.rackId===reveal.rackId)
      node?.querySelector('summary')?.scrollIntoView({block:'start',behavior:'instant'})
    })})
    return ()=>{cancelAnimationFrame(first);cancelAnimationFrame(second)}
  },[reveal,dimension])
  const plan = planState?.key === endpoint ? planState.value.plan : null
  useEffect(() => {
    let live = true
    api<WorkspaceRead>(`${endpoint}/workspace`).then(value => { if (live) { setPlan({key:endpoint,value}); setPlanError('') } }).catch(e => { if (live) setPlanError(e.message) })
    return () => { live = false }
  }, [endpoint, retry])
  const floorLocations = planState?.key === endpoint ? planState.value.floorLocations : []
  const rack = selection?.kind === 'rack' ? selection.item : selection?.kind === 'location' ? data.racks.find(r => r.id === selection.item.rackId) : undefined
  const zone = selection?.kind === 'zone' ? selection.item : data.zones.find(z => z.id === (rack?.zoneId || selection?.item.zoneId))
  const term = search.trim().toLocaleLowerCase()
  const matches = (item: StorageItem) => `${item.name} ${item.code}`.toLocaleLowerCase().includes(term)
  const searchable = Array.from(term).length >= 2
  const params = new URLSearchParams({search:search.trim(),status,page:String(page)})
  const { data: rows, error, loading } = useLiveInventory<LocationList>(searchable?`${endpoint}/locations?${params}`:null, endpoint.split('/')[3], 0)
  const { data: front, error: frontError, refresh: refreshFront } = useLiveInventory<RackFrontData>(rack ? `${endpoint}/racks/${rack.id}/front` : null, endpoint.split('/')[3])
  const floorQuery = selection?.kind==='location'&&!rack ? `${endpoint}/locations?${new URLSearchParams({search:selection.item.code,page:'1'})}` : null
  const { data: floorInfo, error: floorError } = useLiveInventory<LocationList>(floorQuery,endpoint.split('/')[3])
  const inventoryAvailable = rack ? front?.inventoryAvailable : floorInfo?.inventoryAvailable
  function choose(next: Selection | null, revealTree=true) {
    setLinkedSlot({rackId:null,level:0,bay:0});setSelection(current=>next?{...next,request:(current?.request||0)+1}:null);setSearch('');setPage(1)
    const rackId=next?.kind==='rack'?next.item.id:next?.kind==='location'?next.item.rackId:null
    if(revealTree&&rackId)setReveal(current=>({rackId,version:(current?.version||0)+1}))
  }
  const [linkError, setLinkError] = useState('')
  function objectSelection(o: PlanObject): Selection | null {
    const z = data.zones.find(z => z.id === o.zoneId), r = data.racks.find(r => r.id === o.rackId)
    const l = floorLocations.find(l => l.id === o.locationId)
    return l ? {kind:'location',item:l} : o.type === 'rack' && r ? {kind:'rack',item:r} : o.type === 'zone' && z ? {kind:'zone',item:z} : null
  }
  function pickObjects(ids: string[]) {
    const o = plan?.objects.find(o => o.id === ids.at(-1)), next = o ? objectSelection(o) : null
    setLinkError(o && !next && (o.type === 'rack' || o.type === 'zone' || o.locationId) ? '연결된 구조 정보가 없습니다. 도면 편집에서 연결 상태를 확인해 주세요.' : '')
    choose(next)
  }
  const linkedLocation = selection?.kind==='rack' && selection.item.id===linkedSlot.rackId ? front?.locations.find(l=>l.location.level===linkedSlot.level&&l.location.bay===linkedSlot.bay)?.location : undefined
  const picked:Selection|null = linkedLocation ? {kind:'location',item:linkedLocation,request:selection?.request} : selection
  const selectedItem = picked?.item
  const locationZone = picked?.kind === 'location' ? data.zones.find(z => z.id === (rack?.zoneId || picked.item.zoneId)) : zone
  const activeObjects = plan?.objects.filter(o => picked?.kind === 'zone' ? o.type === 'zone' && o.zoneId === picked.item.id : picked?.kind === 'rack' ? o.type === 'rack' && o.rackId === picked.item.id : picked?.kind === 'location' ? o.locationId === picked.item.id || !!rack && o.type === 'rack' && o.rackId === rack.id : false).map(o => o.id) || []
  const relatedRackIds = new Set((picked?.kind === 'zone' ? data.racks.filter(r => r.zoneId === picked.item.id) : rack ? [rack] : []).map(r => r.id))
  const isRelated = (o: PlanObject) => !!o.rackId && relatedRackIds.has(o.rackId) || !!locationZone && o.type === 'zone' && o.zoneId === locationZone.id
  function effectiveActive(s: Selection) {
    const parentRack = s.kind === 'location' ? data.racks.find(r => r.id === s.item.rackId) : undefined
    const parentZone = data.zones.find(z => z.id === (parentRack?.zoneId || s.item.zoneId))
    return data.warehouse.isActive && s.item.isActive && (!parentRack || parentRack.isActive) && (!parentZone || parentZone.isActive)
  }
  const visibleStatus = (s: Selection) => status === 'all' || effectiveActive(s) === (status === 'active')
  const displayedPlan = plan && {...plan, objects:plan.objects.map(o => ({...o, label:o.type === 'zone' ? data.zones.find(z=>z.id===o.zoneId)?.name || o.label : o.locationId ? floorLocations.find(l=>l.id===o.locationId)?.name || o.label : o.label, fill:activeObjects.includes(o.id) ? '#f4ca50' : isRelated(o) ? '#fff0b6' : objectSelection(o) && !visibleStatus(objectSelection(o)!) ? '#edf0f4' : (view === 'zone' && o.type !== 'zone' || view === 'rack' && o.type !== 'rack') && ['zone','rack','shape'].includes(o.type) ? '#edf0f4' : o.fill}))}
  const rackAppearance = Object.fromEntries((displayedPlan?.objects || []).flatMap(o => {
    const r = data.racks.find(r=>r.id===o.rackId)
    return r ? [[r.id,{fill:o.fill,label:r.name,summary:`${r.code}${effectiveActive({kind:'rack',item:r})?'':' · 미사용'}`}]] : []
  }))
  const placement = (kind: Selection['kind'], item: StorageItem) => !plan ? '배치 확인 중' : plan.objects.some(o => kind === 'rack' ? o.type === 'rack' && o.rackId === item.id : kind === 'zone' ? o.type === 'zone' && o.zoneId === item.id : o.locationId === item.id || !!item.rackId && o.type === 'rack' && o.rackId === item.rackId) ? '도면 배치' : '도면 미배치'

  const rackCount = (r: StorageItem) => data.rackLocationCounts?.[r.id] ?? (r.levels || 0)*(r.bays || 0)
  const currentSlot = picked?.kind === 'location' ? front?.locations.find(l => l.location.id === picked.item.id) : undefined
  function selectStructure(next: Selection | null, revealTree=true) { setLinkError(''); choose(next,revealTree) }
  const matchedZones=searchable?data.zones.filter(z=>matches(z)&&visibleStatus({kind:'zone',item:z})):[]
  const matchedRacks=searchable?data.racks.filter(r=>matches(r)&&visibleStatus({kind:'rack',item:r})):[]
  return <div className="structure-readonly">
    <div className="structure-heading"><div><h3>창고 도면</h3><p className="structure-summary">구역 {data.zones.length}개 · 랙 {data.racks.length}개 · 보관위치 {data.locationCount}개</p></div>{canUpdate && <button className="secondary" onClick={onEditPlan}>도면 편집</button>}</div>
    <div className="structure-filters" hidden={dimension==='3d'&&!!plan?.exists}><label>구조 검색<input type="search" maxLength={100} value={search} aria-label="구조 검색" placeholder="구역·랙·보관위치 검색 (2글자 이상)" onChange={e => {setSearch(e.target.value);setPage(1)}}/>{term&&!searchable&&<small className="structure-search-hint">2글자 이상 입력해 주세요.</small>}</label><label>대상 선택<select aria-label="구역·랙 선택" value={selection?.kind === 'zone' ? `zone:${selection.item.id}` : rack ? `rack:${rack.id}` : ''} onChange={e => {const [kind,id]=e.target.value.split(':');const item=(kind==='zone'?data.zones:data.racks).find(x=>x.id===id);selectStructure(item?{kind:kind as 'zone'|'rack',item}:null)}}><option value="">전체 구조</option><optgroup label="구역">{data.zones.map(z=><option key={z.id} value={`zone:${z.id}`}>{z.name}</option>)}</optgroup><optgroup label="랙">{data.racks.map(r=><option key={r.id} value={`rack:${r.id}`}>{r.name} · {r.code}</option>)}</optgroup></select></label><label>사용 상태<select aria-label="사용 상태" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="all">전체</option><option value="active">사용 가능</option><option value="inactive">미사용</option></select></label></div>
    {searchable && <section className="structure-search-results" hidden={dimension==='3d'&&!!plan?.exists} aria-label="구조 검색 결과">
      <strong>검색 결과 {matchedZones.length+matchedRacks.length+(rows?.total||0)}건</strong>
      <ul>{[...matchedZones.map(item=>({kind:'zone' as const,item})),...matchedRacks.map(item=>({kind:'rack' as const,item})),...(rows?.items.map(({location:item})=>({kind:'location' as const,item}))||[])].map(result=><li key={`${result.kind}:${result.item.id}`}><button type="button" onClick={()=>selectStructure(result)}><span>{{zone:'구역',rack:'랙',location:'위치'}[result.kind]}</span><strong>{result.item.name}</strong><small>{result.item.code}</small></button></li>)}</ul>
      {loading&&<span role="status">검색 중…</span>}{error&&<p role="alert">{error}</p>}
      {!loading&&!error&&rows?.total===0&&!matchedZones.length&&!matchedRacks.length&&<p>검색 결과가 없습니다.</p>}
      {rows&&rows.total>rows.pageSize&&<Pagination page={page} total={rows.total} pageSize={rows.pageSize} onChange={setPage} loading={loading} label="검색 위치 페이지"/>}
    </section>}
    <div className="wms-segmented warehouse-plan-tabs" role="group" aria-label="도면 보기 방식">{(['2d','3d'] as const).map(d=><button key={d} aria-label={`${d.toUpperCase()} 도면`} aria-pressed={dimension===d} onClick={()=>changeDimension(d)}>{d.toUpperCase()}</button>)}</div>
    {dimension==='3d' && plan?.exists && <Suspense fallback={<p role="status">3D 도면을 불러오는 중…</p>}><Warehouse3DView plan={plan} warehouse={data} endpoint={endpoint}/></Suspense>}
    <div className="structure-map-layout" hidden={dimension==='3d'&&!!plan?.exists}>
      <section className="structure-map-main" aria-label="창고 구조맵">
        <div hidden={dimension!=='2d'&&!!plan?.exists}>
        <div className="structure-map-toolbar"><div role="group" aria-label="구조맵 보기">{[['all','전체 보기'],['zone','구역 강조'],['rack','랙 강조']].map(([value,label])=><button className="secondary" key={value} aria-pressed={view===value} onClick={()=>setView(value)}>{label}</button>)}</div><div><button className="secondary" aria-label="도면 화면 맞춤" onClick={()=>canvas.current?.fit()}><Scan size={17}/></button><button className="secondary" aria-label="도면 확대" onClick={()=>canvas.current?.zoom(1.25)}><ZoomIn size={17}/></button><button className="secondary" aria-label="도면 축소" onClick={()=>canvas.current?.zoom(.8)}><ZoomOut size={17}/></button><button className="secondary" aria-label="화면 이동" aria-pressed={pan} onClick={()=>setPan(v=>!v)}><Hand size={17}/></button></div></div>
        <div className="structure-legend"><span className="legend-zone">구역</span><span className="legend-rack">랙</span><span className="legend-selected">선택</span><span className="legend-related">연결된 구조</span><span>미사용 항목은 상태 표시로 확인</span></div>
        {planError ? <p role="alert" className="alert error">도면을 불러오지 못했습니다. <button onClick={()=>setRetry(n=>n+1)}>다시 시도</button></p> : !plan ? <p role="status">도면을 불러오는 중…</p> : !plan.exists ? <div className="structure-map-empty"><h4>저장된 창고 도면이 없습니다.</h4><p>전체 보관 구조나 검색에서 기존 데이터를 조회할 수 있습니다.</p></div> : <Suspense fallback={<p role="status">구조맵을 준비하는 중…</p>}><PlanCanvas rackAppearance={rackAppearance} ref={canvas} document={displayedPlan!} structureView editing={false} selected={activeObjects} grid={false} snap={false} pan={pan} onSelect={ids=>void pickObjects(ids)} onOpenRack={()=>{}} onChange={()=>{}} onAdd={()=>{}}/></Suspense>}
        </div>

      </section>
      <aside className="structure-inspector" aria-label="선택 정보 패널">
        {floorError && <p role="alert">{floorError}</p>}
        {frontError && <p role="alert">{frontError} <button onClick={refreshFront}>다시 시도</button></p>}
        {linkError && <p role="alert">{linkError}</p>}
        {!picked ? <div className="structure-selection-empty"><h3>도면에서 선택해 주세요</h3><p>구역·랙을 선택하면 연결 정보와 보관위치를 확인할 수 있습니다.</p></div> : <><div className="structure-heading"><h3>{{zone:'구역',rack:'랙',location:'보관위치'}[picked.kind]} 상세</h3><button className="text-button" onClick={()=>selectStructure(null)}>선택 해제</button></div><h4>{selectedItem!.name}</h4><p className="structure-breadcrumb">{data.warehouse.name} → {locationZone?.name||'구역 미지정'}{rack&&` → ${rack.name}`}</p><dl className="structure-detail-fields">{[
          ['코드',selectedItem!.code],['소속 창고',data.warehouse.name],...(picked.kind!=='zone'?[['소속 구역',locationZone?.name||'구역 미지정']]:[]),
          ...(picked.kind==='zone'?[['포함 랙',`${data.racks.filter(r=>r.zoneId===picked.item.id).length}개`],['보관위치',`${data.racks.filter(r=>r.zoneId===picked.item.id).reduce((n,r)=>n+rackCount(r),0)+floorLocations.filter(l=>l.zoneId===picked.item.id).length}개`]]:[]),
          ...(picked.kind==='rack'?[['도면 표시 이름',plan?.objects.find(o=>o.type==='rack'&&o.rackId===picked.item.id)?.label||'미배치'],['단수 · 칸수',`${picked.item.levels}단 × ${picked.item.bays}칸`],['총 보관위치',`${front?.locations.length??rackCount(picked.item)}개`],['랙 바코드',picked.item.barcode||'미등록']]:[]),
          ...(picked.kind==='location'?[['소속 랙',rack?.name||'바닥 위치'],['단 · 칸',rack?`${picked.item.level}단 / ${picked.item.bay}칸`:'—'],['LocationId',picked.item.id]]:[]),
          ['사용 상태',(currentSlot?.effectiveActive ?? (data.warehouse.isActive&&selectedItem!.isActive&&(!rack||rack.isActive)&&(!locationZone||locationZone.isActive)))?'사용':'미사용'],['도면 배치',planError?'배치 확인 불가':placement(picked.kind,picked.item)],...(picked.item.notes?[['설명',picked.item.notes]]:[])
        ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {picked.kind==='zone' && <div className="structure-related-racks" aria-label="구역의 랙">{data.racks.filter(r=>r.zoneId===picked.item.id).map(item=><button className="secondary" key={item.id} onClick={()=>selectStructure({kind:'rack',item})}>{item.name}<small>{item.levels}단 × {item.bays}칸 · {rackCount(item)}개</small></button>)}</div>}
        {picked.kind!=='zone' && <details className="structure-extra"><summary>바코드 조회·인쇄</summary><RackBarcodeLabel kind={picked.kind==='rack'?'rack':'location'} value={picked.item.barcode} rackId={picked.item.id} rackCode={picked.item.code}/></details>}
        {picked.kind!=='zone' && (inventoryAvailable ? <details className="structure-extra" key={picked.item.id}><summary>현재 재고 조회</summary>{picked.kind==='rack'?<RackStock endpoint={endpoint} rackId={picked.item.id}/>:<RackStock endpoint={endpoint} stockEndpoint={`${endpoint.split('/warehouses/')[0]}/barcodes/locations/${picked.item.id}/stock`}/>}</details>:<p className="organization-help">{inventoryAvailable===false?'재고 조회 권한이 없습니다.':'재고 조회 권한 확인 중…'}</p>)}
        </>}
      </aside>
    </div>
    <section ref={tree} className="structure-storage-tree" hidden={dimension==='3d'&&!!plan?.exists} aria-label="전체 보관 구조"><h3>전체 보관 구조</h3><div className="workspace-structure-tree">
      {data.zones.map(z=><ReadOnlyZoneNode key={z.id} zone={z} racks={data.racks.filter(r=>r.zoneId===z.id)} floors={floorLocations.filter(l=>l.zoneId===z.id)} endpoint={endpoint} selection={picked} onSelect={selectStructure} rackCount={rackCount}/>)}
      {(data.racks.some(r=>!r.zoneId)||floorLocations.some(l=>!l.zoneId))&&<div className="workspace-unassigned"><h4>구역 미지정</h4>{data.racks.filter(r=>!r.zoneId).map(r=><ReadOnlyRackNode key={r.id} rack={r} endpoint={endpoint} selection={picked} onSelect={selectStructure} count={rackCount(r)}/>)}{floorLocations.filter(l=>!l.zoneId).map(l=><StorageTreeNode key={l.id} name={l.name} code={l.code} kind="location" selected={picked?.item.id===l.id} onSelect={()=>selectStructure({kind:'location',item:l})}/>)}</div>}
    </div></section>

  </div>
}

function ReadOnlyZoneNode({zone,racks,floors,endpoint,selection,onSelect,rackCount}:{zone:StorageItem;racks:StorageItem[];floors:StorageItem[];endpoint:string;selection:Selection|null;onSelect:SelectStructure;rackCount:(r:StorageItem)=>number}) {
  const selected=selection?.kind==='zone'&&selection.item.id===zone.id
  const active=selected||racks.some(r=>r.id===selection?.item.id||r.id===selection?.item.rackId)||floors.some(l=>l.id===selection?.item.id)
  const [expanded,setExpanded]=useStorageExpansion(active,false,`${selection?.item.id}:${selection?.request}`)
  return <StorageTreeNode name={zone.name} code={zone.code} kind="zone" selected={selected} expanded={expanded} onExpanded={setExpanded} onSelect={()=>onSelect({kind:'zone',item:zone})} summary={`랙 ${racks.length}개 · 위치 ${racks.reduce((n,r)=>n+rackCount(r),floors.length)}개`}><div className="workspace-tree-children">{racks.map(r=><ReadOnlyRackNode key={r.id} rack={r} endpoint={endpoint} selection={selection} onSelect={onSelect} count={rackCount(r)}/>)}{floors.map(l=><StorageTreeNode key={l.id} name={l.name} code={l.code} kind="location" selected={selection?.item.id===l.id} onSelect={()=>onSelect({kind:'location',item:l})}/>)}</div></StorageTreeNode>
}
function ReadOnlyRackNode({rack,endpoint,selection,onSelect,count}:{rack:StorageItem;endpoint:string;selection:Selection|null;onSelect:SelectStructure;count:number}) {
  const selected=selection?.kind==='rack'&&selection.item.id===rack.id,active=selected||selection?.item.rackId===rack.id
  const [expanded,setExpanded]=useStorageExpansion(active,false,`${selection?.item.id}:${selection?.request}`)
  const {data:front,error,refresh}=useLiveInventory<RackFrontData>(expanded?`${endpoint}/racks/${rack.id}/front`:null,endpoint.split('/')[3])
  const selectRack=()=>{setExpanded(true);onSelect({kind:'rack',item:rack})}
  return <div className="structure-rack-node" data-rack-id={rack.id} onClick={e=>{
    const target=e.target as HTMLElement
    if(target.closest('summary')&&!target.closest('button')){e.preventDefault();selectRack()}
  }}><StorageTreeNode name={rack.name} code={rack.code} kind="rack" selected={active} expanded={expanded} onExpanded={setExpanded} onSelect={selectRack} summary={`${rack.levels}단 × ${rack.bays}칸 · 위치 ${front?.locations.length??count}개${rack.isActive?'':' · 미사용'}`} actions={<button type="button" className="text-button structure-rack-toggle" aria-label={`${rack.code} ${expanded?'접기':'펼치기'}`} aria-expanded={expanded} onClick={e=>{e.preventDefault();setExpanded(v=>!v)}}>{expanded?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button>}>
    {expanded&&(error?<p role="alert">{error} <button onClick={refresh}>다시 조회</button></p>:!front?<p role="status">위치 조회 중…</p>:<RackLocationGrid rack={rack} front={front} selection={selection} onSelect={onSelect}/>)}
  </StorageTreeNode></div>
}
function RackLocationGrid({rack,front,selection,onSelect}:{rack:StorageItem;front:RackFrontData;selection:Selection|null;onSelect:SelectStructure}) {
  const slots=new Map(front.locations.map(l=>[`${l.location.level}:${l.location.bay}`,l]))
  const levels=Array.from({length:rack.levels||0},(_,i)=>(rack.levels||0)-i),bays=Array.from({length:rack.bays||0},(_,i)=>i+1)
  return <div className="structure-slot-scroll" role="region" aria-label={`${rack.code} 보관위치 구성`}><div className="structure-slot-grid" style={{gridTemplateColumns:`32px repeat(${rack.bays},100px)`}}>
    <span aria-hidden="true"/>{bays.map(bay=><span className="structure-grid-axis" key={`bay-${bay}`}>{bay}칸</span>)}
    {levels.map(level=><div className="structure-grid-row" key={level}><span className="structure-grid-axis">{level}단</span>{bays.map(bay=>{const slot=slots.get(`${level}:${bay}`);return <button key={bay} type="button" disabled={!slot} className={slot?.effectiveActive?'':'is-inactive'} data-location-id={slot?.location.id} aria-label={`${level}단 ${bay}칸 ${slot?.location.code||'위치 없음'}`} aria-pressed={selection?.kind==='location'&&selection.item.id===slot?.location.id} onClick={()=>slot&&onSelect({kind:'location',item:slot.location},false)}><strong>{level}단 · {bay}칸</strong><small>{slot?.location.code||'위치 없음'}</small>{slot&&!slot.effectiveActive&&<span>미사용</span>}</button>})}</div>)}
  </div></div>
}
