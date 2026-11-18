import DetailHeader from './DetailHeader'
import { readFixedPage } from '../../read-fixed-page'
import PageSizeSelect from '../PageSizeSelect'
import SearchFilters from './SearchFilters'
import WarehouseBasicFields from './WarehouseBasicFields'
import { hydrateWorkspace } from '../../warehouse-workspace-model'
import UnsavedChangesContent from './UnsavedChangesContent'
import { ArrowLeft, Building2, Layers, Columns3, MapPin, ArrowUpRight, Warehouse, Thermometer, Refrigerator, Snowflake, ThermometerSnowflake, Droplets, TriangleAlert, Sun, Boxes } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import './warehouse-management.css'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../api'
import Pagination from '../Pagination'
import { editSnapshot, requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import WarehouseStructureReadOnly from './WarehouseStructureReadOnly'
import type {
  WarehouseList,
  WarehouseDetailData,
  StorageItem,
} from '../../types/warehouse'
import OrganizationDialog from './OrganizationDialog'
import { PageHeading } from './WorkspaceUI'
const WarehouseWorkspaceEditor = lazy(() => import('./WarehouseWorkspaceEditor'))

const warehouseTypeIcons: Record<string, LucideIcon> = {
  '일반/상온': Warehouse,
  '실온': Thermometer,
  '냉장': Refrigerator,
  '냉동': Snowflake,
  '저온': ThermometerSnowflake,
  '항온·항습': Droplets,
  '위험물': TriangleAlert,
  '야외': Sun,
  '기타': Boxes,
}

function WarehouseTypeIcon({ type }: { type?: string | null }) {
  const key = type?.trim() ?? ''
  const Icon = Object.hasOwn(warehouseTypeIcons, key) ? warehouseTypeIcons[key] : Building2
  return <span className="warehouse-building-icon" role="img" aria-label={`${type || '유형 미지정'} 창고`} title={type || '유형 미지정'}><Icon size={22} aria-hidden="true" /></span>
}

const blankVersion = '00000000-0000-0000-0000-000000000000'
const statusLabel = (active: boolean) => (active ? '사용' : '미사용')

export default function WarehouseManagement(props: { tenantId: string; grants: string[] }) {
  return props.grants.includes('read') ? <WarehouseManagementContent {...props}/> : <p role="alert" className="alert error">창고 조회 권한이 없습니다.</p>
}

function WarehouseManagementContent({
  tenantId,
  grants,
}: {
  tenantId: string
  grants: string[]
}) {
  const [workspace, setWorkspace] = useState<{ id?: string; initialStep?: 1 | 2 } | null>(null)
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get('warehouseId'))
  const [query, setQuery] = useState({ search: '', status: 'all', page: 1, pageSize: 20 })
  const [filters,setFilters] = useState(query)
  const [listView, setListView] = useState<{ key: string; data: WarehouseList | null } | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const endpoint = `/api/tenants/${tenantId}/warehouses`
  const listKey = JSON.stringify([endpoint, query, revision])
  const list = listView?.key === listKey ? listView.data : null
  const canCreate = grants.includes('create'),
    canUpdate = grants.includes('update')
  useEffect(() => {
    let live = true
    readFixedPage<WarehouseList>(
      `${endpoint}?${new URLSearchParams({ ...query, page: String(query.page), pageSize: String(query.pageSize) })}`,
    )
      .then((value) => {
        if (live) {
          setListView({ key: listKey, data: value })
          setError('')
        }
      })
      .catch((e) => {
        if (live) {
          setListView({ key: listKey, data: null })
          setError(
            e instanceof Error ? e.message : '창고를 불러오지 못했습니다.',
          )
        }
      })
    return () => {
      live = false
    }
  }, [endpoint, query, revision, listKey])
  useEffect(() => {
    const sync = () => setSelected(new URLSearchParams(window.location.search).get('warehouseId'))
    window.addEventListener('popstate',sync); return () => window.removeEventListener('popstate',sync)
  }, [])
  function selectWarehouse(id: string | null) {
    const url = new URL(window.location.href)
    for (const key of ['warehouseId', 'tab', 'view', 'rackId', 'locationCode', 'level', 'bay']) url.searchParams.delete(key)
    if (id) url.searchParams.set('warehouseId', id)
    window.history.replaceState(window.history.state, '', url)
    setSelected(id); setNotice('')
  }

  return (
    <>
      {!workspace && !selected && <PageHeading
        title="창고관리"
        actions={<>             {canCreate && (
              <button
                className="primary"
                onClick={() => { setNotice(''); setWorkspace({}) }}
              >
                창고 등록
              </button>
            )} </>}
      />}
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="alert success">
          {notice}
        </div>
      )}
      {workspace ? (
        <Suspense fallback={<p>통합 편집기를 불러오는 중…</p>}>
          <WarehouseWorkspaceEditor key={workspace.id || 'new'} endpoint={endpoint} warehouseId={workspace.id} initialStep={workspace.initialStep} canCreate={canCreate} canUpdate={canUpdate} canDelete={grants.includes('delete')}
            onBack={() => {setWorkspace(null);setRevision(r=>r+1)}} onSaved={result => { setWorkspace(null); selectWarehouse(result.warehouseId); if (workspace.initialStep === 2) { const url = new URL(window.location.href); url.searchParams.set('tab', 'plan'); window.history.replaceState(window.history.state, '', url) } setRevision(r => r + 1); setNotice(`${result.code} 창고와 도면·구조를 함께 저장했습니다.`) }} />
        </Suspense>
      ) : selected ? (
        <WarehouseDetail
          key={selected}
          endpoint={endpoint}
          id={selected}
          revision={revision}
          canCreate={canCreate && canUpdate}
          canUpdate={canUpdate}
          canDelete={grants.includes('delete')}
          onBack={() => {
            selectWarehouse(null)
            setNotice('')
          }}
          onWorkspaceEdit={initialStep => setWorkspace({ id: selected, initialStep })}
          onRefresh={() => setRevision((x) => x + 1)}

        />
      ) : (
        <section className="warehouse-directory">
          <div className="organization-toolbar">
            <SearchFilters className="organization-filters mobile-management-filters" busy={!list && !error} onSearch={() => { setQuery({ ...filters, search:filters.search.trim(), page:1 }); setRevision(n=>n+1) }} onReset={() => { const next={search:"",status:"all",page:1,pageSize:20}; setFilters(next); setQuery(next); setRevision(n=>n+1) }}>

              <label>
                상태
                <select
                  name="status"
                  aria-label="창고 상태 필터"
                  value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value}))}
                >
                  <option value="all">전체</option>
                  <option value="active">사용</option>
                  <option value="inactive">미사용</option>
                </select>
              </label>

            <label>
                창고 검색
                <input
                  name="search"
                  maxLength={100}
                  placeholder="창고명, 시스템 코드 또는 자체 코드"
                  value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))}
                />
              </label>
</SearchFilters>

          </div>
          {!list ? (
            <p>
              {error
                ? '접근 권한과 연결 상태를 확인해 주세요.'
                : '불러오는 중…'}
            </p>
          ) : (
            <>
              <p className="organization-help">검색 결과 {list.total}개</p>
              {!list.items.length && <div className="warehouse-directory-empty"><Building2 size={34} /><h3>{query.search || query.status !== 'all' ? '조건에 맞는 창고가 없습니다.' : '첫 창고를 등록해 보세요.'}</h3><p>창고 정보와 도면을 한 번에 구성할 수 있습니다.</p></div>}
              <div className="warehouse-directory-grid">
                {list.items.map(({ warehouse: w, zoneCount, rackCount, locationCount }) => <article className="warehouse-directory-item" key={w.id}>
                  <div className="warehouse-directory-top"><WarehouseTypeIcon type={w.type} /><span className={`warehouse-status ${w.isActive ? 'active' : ''}`}>{statusLabel(w.isActive)}</span></div>
                  <span className="warehouse-code">{w.code}{w.customCode ? ` / ${w.customCode}` : ''}</span>
                  <h2>{w.name}</h2><p>{w.type || '유형 미지정'} · {w.contactName || '담당자 미지정'}</p>
                  <p className="warehouse-directory-address"><MapPin size={14} />{w.address || '주소 미지정'}</p>
                  <dl className="warehouse-directory-counts"><div><dt>구역</dt><dd>{zoneCount}</dd></div><div><dt>랙</dt><dd>{rackCount}</dd></div><div><dt>보관 위치</dt><dd>{locationCount}</dd></div></dl>
                  <button className="warehouse-directory-open" aria-label={`${w.name} 상세`} onClick={() => selectWarehouse(w.id)}>창고 상세<ArrowUpRight size={16} /></button>
                </article>)}
              </div>
              <Pagination pageSizeControl={<PageSizeSelect value={query.pageSize} onChange={pageSize => { setQuery(v => ({ ...v, pageSize, page: 1 })); setFilters(v => ({ ...v, pageSize, page: 1 }));  }} />}
                page={query.page}
                label="창고 목록 페이지"
                pageSize={list.pageSize}
                total={list.total}
                onChange={(page) => setQuery((q) => ({ ...q, page }))}
              />
            </>
          )}

        </section>
      )}
    </>
  )
}

function readWarehouseTab(): 'info' | 'plan' {
  const q = new URLSearchParams(window.location.search), tab = q.get('tab')
  return tab === 'info' ? 'info' : tab === 'plan' || tab === 'structure' || q.has('view') || q.has('rackId') || q.has('locationCode') ? 'plan' : 'info'
}

function WarehouseDetail({
  endpoint,
  id,
  revision,
  canUpdate,
  onBack,
  onWorkspaceEdit,
  onRefresh,
}: {
  endpoint: string
  id: string
  revision: number
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  onBack: () => void
  onWorkspaceEdit: (initialStep?: 1 | 2) => void
  onRefresh: () => void
}) {
  const [data, setData] = useState<WarehouseDetailData | null>(null)
  const [tab, setTab] = useState<'info' | 'plan'>(readWarehouseTab)
  useEffect(() => {
    const sync = () => { setTab(readWarehouseTab()); const url = new URL(window.location.href); if (url.searchParams.get('tab') === 'structure') { url.searchParams.set('tab','plan'); window.history.replaceState(window.history.state,'',url) } }
    sync(); window.addEventListener('popstate',sync); return () => window.removeEventListener('popstate',sync)
  }, [])
  function changeTab(next: typeof tab) {
    requestNavigation(() => { setTab(next); const url = new URL(window.location.href); url.searchParams.set('tab', next); window.history.replaceState(window.history.state, '', url) })
  }
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    api<WarehouseDetailData>(`${endpoint}/${id}`)
      .then((value) => {
        if (live) {
          setData(value)
          setError('')
        }
      })
      .catch((e) => {
        if (live) {
          setData(null)
          setError(
            e instanceof Error ? e.message : '상세 정보를 불러오지 못했습니다.',
          )
        }
      })
    return () => {
      live = false
    }
  }, [endpoint, id, revision])
  return (
    <section className="warehouse-detail">
      {!data && <div className="organization-toolbar">
        <button className="secondary" onClick={() => requestNavigation(onBack)}>
          <ArrowLeft size={15} />창고 목록으로
        </button>
        {error && <button className="text-button" onClick={() => requestNavigation(onRefresh)}>다시 조회</button>}
      </div>}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <p>{error ? '상세 정보를 확인할 수 없습니다.' : '불러오는 중…'}</p>
      ) : (
        <>
          <DetailHeader level={2} className="warehouse-detail-header" title={data.warehouse.name} code={`WAREHOUSE / ${data.warehouse.code}`} status={<span className={`warehouse-status ${data.warehouse.isActive ? 'active' : ''}`}>{statusLabel(data.warehouse.isActive)}</span>} onBack={() => requestNavigation(onBack)} backLabel="창고 목록으로" />
          {tab === 'info' && <div className="warehouse-overview-metrics"><div><Building2 size={19}/><span>창고 유형<strong>{data.warehouse.type || '미지정'}</strong></span></div><div><Layers size={19}/><span>등록 구역<strong>{data.zones.length}<small>개</small></strong></span></div><div><Columns3 size={19}/><span>등록 랙<strong>{data.racks.length}<small>개</small></strong></span></div><div><MapPin size={19}/><span>보관 위치<strong>{data.locationCount}<small>개</small></strong></span></div></div>}
          <div className="wms-segmented warehouse-detail-tabs" role="tablist" aria-label="창고 상세 보기">
            {([['info', '창고 정보'], ['plan', '창고 도면']] as const).map(([key, label]) => <button type="button" role="tab" key={key} id={`warehouse-tab-${key}`} aria-controls={`warehouse-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onClick={() => changeTab(key)} onKeyDown={e => { const keys = ['info', 'plan'] as const; const direction = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (direction) { e.preventDefault(); const next = keys[(keys.indexOf(key) + direction + 2) % 2]; changeTab(next); document.getElementById(`warehouse-tab-${next}`)?.focus() } }}>{label}</button>)}
          </div>
          {tab === 'info' && <section role="tabpanel" id="warehouse-panel-info" aria-labelledby="warehouse-tab-info" className="warehouse-info-panel">
            <div className="warehouse-section-title"><div><h3>창고 기본 정보</h3><p>운영 정보와 담당 연락처를 확인하세요.</p></div>{canUpdate && <button className="secondary" onClick={() => requestNavigation(() => onWorkspaceEdit())}>창고·도면 함께 수정</button>}</div>
            <WarehouseInlineBasics key={data.warehouse.version} endpoint={endpoint} data={data} canUpdate={canUpdate} onSaved={warehouse => setData(current => current ? {...current, warehouse} : current)}/>
          </section>}
          {!data.warehouse.isActive && (
            <p className="alert">
              미사용 창고입니다. 하위 위치의 설정과 이력은 보존되며 실제 사용
              가능 상태는 미사용으로 표시됩니다.
            </p>
          )}
          {tab === 'plan' && <section role="tabpanel" id="warehouse-panel-plan" aria-labelledby="warehouse-tab-plan"><Suspense fallback={<p>창고 도면을 불러오는 중…</p>}>
            <WarehouseStructureReadOnly key={`${id}:${revision}`} endpoint={`${endpoint}/${id}`} data={data} canUpdate={canUpdate} onEditPlan={() => requestNavigation(() => onWorkspaceEdit(2))}/>
          </Suspense></section>}
        </>
      )}
    </section>
  )
}

function WarehouseInlineBasics({endpoint,data,canUpdate,onSaved}:{endpoint:string;data:WarehouseDetailData;canUpdate:boolean;onSaved:(warehouse:StorageItem)=>void}) {
  const [initial] = useState(() => hydrateWorkspace({detail:data, floorLocations:[], plan:{schemaVersion:1,aspectRatio:1.6,objects:[],exists:false,version:blankVersion,updatedAt:'',updatedByUserId:''}}).warehouse)
  const [value,setValue] = useState(initial), [busy,setBusy] = useState(false), [error,setError] = useState('')
  const sending = useRef(false)
  const dirty = editSnapshot(value) !== editSnapshot(initial)
  const reset = () => { setValue(initial); setError('') }
  const navigation = useUnsavedNavigation(dirty || busy, busy, reset)
  async function save(event:FormEvent) {
    event.preventDefault()
    if (!canUpdate || sending.current || !dirty) return
    sending.current=true; setBusy(true); setError('')
    try {
      const {code: systemCode, ...fields} = value
      void systemCode
      const result=await api<StorageItem>(`${endpoint}/${data.warehouse.id}`, {...fields, name:value.name.trim(),customCode:value.customCode.trim()||null,requestId:crypto.randomUUID()})
      navigation.saved(); onSaved(result)
    } catch(e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.') }
    finally { sending.current=false;setBusy(false) }
  }
  return <><form className="warehouse-inline-basics" onSubmit={save}>
    {error&&<p role="alert" className="alert error">{error}</p>}
    <label>시스템 창고 코드<input value={value.code||''} readOnly/></label>
    <WarehouseBasicFields wizard inline value={value} disabled={!canUpdate||busy} onChange={patch=>setValue(current=>({...current,...patch}))}/>
    {canUpdate&&<div className="organization-row-actions"><button type="button" className="secondary" disabled={!dirty||busy} onClick={reset}>변경 취소</button><button type="submit" className="primary" disabled={!dirty||busy}>{busy?'저장 중…':'변경사항 저장'}</button></div>}
  </form>{navigation.blocked&&<OrganizationDialog confirmation title="저장하지 않은 창고 작업" busy={busy} onClose={navigation.stay}><UnsavedChangesContent stay={navigation.stay} discard={navigation.discard} busy={busy} message="창고 정보 변경사항을 버리고 이동하시겠습니까?" detail="저장하지 않은 내용은 복구할 수 없습니다."/></OrganizationDialog>}</>
}
