import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../api'
import { formValues } from '../../form-values'
import type {
  WarehouseList,
  WarehouseDetailData,
  WarehouseEdit,
  StorageItem,
  LocationList,
} from '../../types/warehouse'
import OrganizationDialog from './OrganizationDialog'
import { PageHeading } from './WorkspaceUI'

const labels = {
  warehouse: '창고',
  zones: '구역',
  racks: '랙',
  locations: '보관 위치',
}
const blankVersion = '00000000-0000-0000-0000-000000000000'
const statusLabel = (active: boolean) => (active ? '사용' : '미사용')

export default function WarehouseManagement({
  tenantId,
  grants,
}: {
  tenantId: string
  grants: string[]
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState({ search: '', status: 'all', page: 1 })
  const [list, setList] = useState<WarehouseList | null>(null)
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<WarehouseEdit | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const endpoint = `/api/tenants/${tenantId}/warehouses`
  const canCreate = grants.includes('create'),
    canUpdate = grants.includes('update')
  useEffect(() => {
    let live = true
    api<WarehouseList>(
      `${endpoint}?${new URLSearchParams({ ...query, page: String(query.page) })}`,
    )
      .then((value) => {
        if (live) {
          setList(value)
          setError('')
        }
      })
      .catch((e) => {
        if (live) {
          setList(null)
          setError(
            e instanceof Error ? e.message : '창고를 불러오지 못했습니다.',
          )
        }
      })
    return () => {
      live = false
    }
  }, [endpoint, query, revision])
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const values = formValues(e.currentTarget)
    setQuery({ search: values.search.trim(), status: values.status, page: 1 })
  }
  return (
    <>
      <PageHeading
        title="창고관리"
        description="창고와 구역·랙·보관 위치를 관리하세요."
      />
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
      {selected ? (
        <WarehouseDetail
          key={selected}
          endpoint={endpoint}
          id={selected}
          revision={revision}
          canCreate={canCreate}
          canUpdate={canUpdate}
          onBack={() => {
            setSelected(null)
            setNotice('')
          }}
          onEdit={setEditing}
          onRefresh={() => setRevision((x) => x + 1)}
        />
      ) : (
        <section className="wms-card organization-card">
          <div className="organization-toolbar">
            <form className="organization-filters" onSubmit={search}>
              <label>
                창고 검색
                <input
                  name="search"
                  maxLength={100}
                  placeholder="창고명, 시스템 코드 또는 자체 코드"
                  defaultValue={query.search}
                />
              </label>
              <label>
                상태
                <select
                  name="status"
                  aria-label="창고 상태 필터"
                  defaultValue={query.status}
                >
                  <option value="all">전체</option>
                  <option value="active">사용</option>
                  <option value="inactive">미사용</option>
                </select>
              </label>
              <button className="secondary">검색</button>
            </form>
            {canCreate && (
              <button
                className="primary"
                onClick={() => setEditing({ kind: 'warehouse' })}
              >
                창고 등록
              </button>
            )}
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
              <div className="wms-table-scroll">
                <table className="wms-table warehouse-table">
                  <caption>창고 목록</caption>
                  <thead>
                    <tr>
                      <th>시스템 / 자체 코드</th>
                      <th>창고명</th>
                      <th>유형</th>
                      <th>담당자</th>
                      <th>상태</th>
                      <th>구역 / 랙 / 위치</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!list.items.length && (
                      <tr>
                        <td colSpan={7}>
                          {query.search || query.status !== 'all'
                            ? '조건에 맞는 창고가 없습니다.'
                            : '등록된 창고가 없습니다. 창고 등록으로 시작해 주세요.'}
                        </td>
                      </tr>
                    )}
                    {list.items.map(
                      ({
                        warehouse: w,
                        zoneCount,
                        rackCount,
                        locationCount,
                      }) => (
                        <tr key={w.id}>
                          <td>{w.code}<br /><small>{w.customCode || '자체 코드 미지정'}</small></td>
                          <td>{w.name}</td>
                          <td>{w.type || '미지정'}</td>
                          <td>{w.contactName || '미지정'}</td>
                          <td>{statusLabel(w.isActive)}</td>
                          <td>
                            {zoneCount} / {rackCount} / {locationCount}
                          </td>
                          <td>
                            <div className="organization-row-actions">
                              <button
                                className="secondary"
                                aria-label={`${w.name} 상세`}
                                onClick={() => {
                                  setSelected(w.id)
                                  setNotice('')
                                }}
                              >
                                상세
                              </button>
                              {canUpdate && (
                                <button
                                  className="text-button"
                                  aria-label={`${w.name} 수정`}
                                  onClick={() =>
                                    setEditing({ kind: 'warehouse', item: w })
                                  }
                                >
                                  수정
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={query.page}
                size={20}
                total={list.total}
                onChange={(page) => setQuery((q) => ({ ...q, page }))}
              />
            </>
          )}
          <button
            className="text-button"
            onClick={() => setRevision((x) => x + 1)}
          >
            창고 목록 새로고침
          </button>
        </section>
      )}
      {editing && (
        <StorageEditor
          key={`${editing.kind}:${editing.item?.id || 'new'}`}
          editing={editing}
          endpoint={endpoint}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setNotice(`${labels[editing.kind]} 정보를 저장했습니다.`)
            setEditing(null)
            setRevision((x) => x + 1)
            if (editing.kind === 'warehouse' && !editing.item) setSelected(null)
          }}
        />
      )}
    </>
  )
}

function Pagination({
  page,
  size,
  total,
  onChange,
}: {
  page: number
  size: number
  total: number
  onChange: (page: number) => void
}) {
  return (
    <div className="organization-toolbar">
      <span>
        {page} / {Math.max(1, Math.ceil(total / size))} 페이지
      </span>
      <div className="organization-row-actions">
        <button
          className="secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          이전
        </button>
        <button
          className="secondary"
          disabled={page * size >= total}
          onClick={() => onChange(page + 1)}
        >
          다음
        </button>
      </div>
    </div>
  )
}

function StorageEditor({
  editing,
  endpoint,
  onClose,
  onSaved,
}: {
  editing: WarehouseEdit
  endpoint: string
  onClose: () => void
  onSaved: (item: StorageItem) => void
}) {
  const { kind, item } = editing,
    label = labels[kind]
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [levels, setLevels] = useState(item?.levels || 1),
    [bays, setBays] = useState(item?.bays || 1)
  const [pending, setPending] = useState<Record<string, unknown> | null>(null)
  const [warehouseType, setWarehouseType] = useState(item?.type || '')
  const inFlight = useRef(false)
  const [requestId] = useState(() => crypto.randomUUID())
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const values = formValues(e.currentTarget)
    if (!values.name.trim()) {
      setError('이름을 입력해 주세요.')
      return
    }
    if (kind === 'racks' && levels * bays > 1000) {
      setError('랙당 총 1,000개 위치 이내로 설정해 주세요.')
      return
    }
    if (busy || pending || inFlight.current) return
    setError('')
    const body: Record<string, unknown> = {
      name: values.name.trim(),
      ...(kind !== 'warehouse' ? { code: values.code.trim() } : { requestId, customCode: values.customCode?.trim() || null }),
      isActive: values.isActive === 'on',
      version: item?.version || blankVersion,
    }
    if (kind === 'warehouse')
      for (const key of [
        'type',
        'typeDescription',
        'address',
        'addressDetail',
        'contactName',
        'notes',
      ])
        body[key] = values[key]?.trim() || null
    if (kind === 'racks') {
      body.levels = levels
      body.bays = bays
      body.zoneId = item ? item.zoneId || null : values.zoneId || null
    }
    if (kind === 'locations' && !item) body.zoneId = values.zoneId || null
    setPending(body)
  }
  async function confirmSave() {
    if (!pending || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    const body = pending
    const url =
      kind === 'warehouse'
        ? endpoint
        : `${endpoint}/${editing.warehouseId}/${kind}`
    try {
      onSaved(
        await api<StorageItem>(`${url}${item ? `/${item.id}` : ''}`, body),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
      setPending(null)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return (
    <OrganizationDialog
      title={`${label} ${item ? '수정' : '등록'}`}
      busy={busy}
      onClose={() => pending ? setPending(null) : onClose()}
    >
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {pending && <section role="alertdialog" aria-label="저장 확인" aria-modal="false" className="alert">
        <p>{label} 정보를 저장하시겠습니까?</p>
        {kind === 'racks' && <p>새 단·칸의 보관 위치가 함께 생성됩니다.</p>}
        <button type="button" className="secondary" disabled={busy} onClick={() => setPending(null)}>취소</button>{' '}
        <button type="button" className="primary" disabled={busy} onClick={confirmSave} autoFocus>{busy ? '저장 중…' : '확인'}</button>
      </section>}
      <form onSubmit={save} hidden={!!pending}>
        <fieldset disabled={busy}>
          <label>
            {label}명
            <input
              name="name"
              required
              maxLength={200}
              defaultValue={item?.name || ''}
              autoFocus
            />
          </label>
          {kind === 'warehouse' ? <>
            <label>시스템 창고 코드<input value={item?.code || '저장 시 자동 생성 (WH-0001…)'} readOnly /></label>
            <label>자체 창고 코드<input name="customCode" maxLength={64} defaultValue={item?.customCode || ''} /></label>
            <p className="organization-help">자체 코드는 선택사항이며 기업 내에서 중복 사용할 수 없습니다. 시스템 코드는 변경할 수 없습니다.</p>
          </> : <label>{label} 코드<input name="code" required maxLength={kind === 'locations' ? 64 : 32} pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]*" defaultValue={item?.code || ''} /></label>}
          {kind === 'warehouse' && (
            <>
              <label>
                창고 유형
                <select name="type" aria-label="창고 유형" value={warehouseType} onChange={e => setWarehouseType(e.target.value)}>
                  <option value="">미지정</option>
                  {['일반/상온', '실온', '냉장', '냉동', '저온', '항온·항습', '위험물', '야외', '기타'].map(t => <option key={t}>{t}</option>)}
                  {item?.type && !['일반/상온', '실온', '냉장', '냉동', '저온', '항온·항습', '위험물', '야외', '기타'].includes(item.type) && <option value={item.type}>{item.type} (기존 유형)</option>}
                </select>
              </label>
              {warehouseType === '기타' && <label>기타 유형 설명<textarea aria-label="기타 유형 설명" name="typeDescription" maxLength={500} defaultValue={item?.typeDescription || ''} /></label>}
              <p className="organization-help">일반/상온: 별도 온도 관리 없음 · 실온: 실내 환경 기준 · 냉장: 냉각 보관 · 냉동: 동결 보관 · 저온: 냉장 외 지정 저온 · 항온·항습: 온도·습도 일정 관리 · 위험물: 위험물 취급 · 야외: 실외 보관. 분류 기준이며 실제 센서·온도 제어 기능은 제공하지 않습니다.</p>
              <label>
                주소
                <input
                  name="address"
                  maxLength={500}
                  defaultValue={item?.address || ''}
                />
              </label>
              <label>
                상세 주소
                <input
                  name="addressDetail"
                  maxLength={300}
                  defaultValue={item?.addressDetail || ''}
                />
              </label>
              <label>
                담당자
                <input
                  name="contactName"
                  maxLength={200}
                  defaultValue={item?.contactName || ''}
                />
              </label>
              <label>
                비고
                <textarea
                  name="notes"
                  maxLength={2000}
                  defaultValue={item?.notes || ''}
                  rows={3}
                />
              </label>
            </>
          )}
          {(kind === 'racks' || (kind === 'locations' && !item)) && (
            <label>
              소속 구역
              <select
                name="zoneId"
                aria-label="소속 구역"
                defaultValue={item?.zoneId || ''}
                disabled={!!item}
              >
                <option value="">구역 없이 창고에 직접 연결</option>
                {editing.zones
                  ?.filter((x) => x.isActive || x.id === item?.zoneId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.code} · {x.name}
                      {x.isActive ? '' : ' (미사용)'}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {kind === 'racks' && (
            <>
              <div className="organization-form-grid">
                <label>
                  단 수
                  <input
                    type="number"
                    min={item?.levels || 1}
                    max={100}
                    value={levels}
                    onChange={(e) => setLevels(Number(e.target.value))}
                    required
                  />
                </label>
                <label>
                  칸 수
                  <input
                    type="number"
                    min={item?.bays || 1}
                    max={100}
                    value={bays}
                    onChange={(e) => setBays(Number(e.target.value))}
                    required
                  />
                </label>
              </div>
              <p className="organization-help">
                {levels}단 × {bays}칸 = 총 {levels * bays}개 위치. 랙당 최대
                1,000개입니다. 위치 코드는 랙 코드-L01-B01 형식으로 생성됩니다.
              </p>
              {item && (
                <p className="organization-help">
                  단·칸은 확장만 가능합니다. 기존 위치의 ID·이름·코드는
                  유지되며, 랙 코드 변경은 기존 위치 코드를 바꾸지 않습니다.
                </p>
              )}
            </>
          )}
          {kind === 'locations' && !item && (
            <p className="organization-help">
              랙 없이 구역 또는 창고 바닥에 직접 보관 위치를 만듭니다. 랙의
              선반·칸은 랙 등록으로 생성하세요.
            </p>
          )}
          <label className="organization-checkbox">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={item?.isActive ?? true}
            />
            사용
          </label>
          <button className="primary full" type="submit">
            {busy ? '저장 중…' : `${label} 저장`}
          </button>
        </fieldset>
      </form>
    </OrganizationDialog>
  )
}

function WarehouseDetail({
  endpoint,
  id,
  revision,
  canCreate,
  canUpdate,
  onBack,
  onEdit,
  onRefresh,
}: {
  endpoint: string
  id: string
  revision: number
  canCreate: boolean
  canUpdate: boolean
  onBack: () => void
  onEdit: (edit: WarehouseEdit) => void
  onRefresh: () => void
}) {
  const [data, setData] = useState<WarehouseDetailData | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState({
    search: '',
    status: 'all',
    parent: 'all',
    page: 1,
  })
  const [locations, setLocations] = useState<{
    key: string
    data: LocationList
  } | null>(null)
  const params = new URLSearchParams({
    search: filter.search,
    status: filter.status,
    page: String(filter.page),
  })
  if (filter.parent.startsWith('z:'))
    params.set('zoneId', filter.parent.slice(2))
  if (filter.parent.startsWith('r:'))
    params.set('rackId', filter.parent.slice(2))
  if (filter.parent === 'floor') params.set('floorOnly', 'true')
  const locationUrl = `${endpoint}/${id}/locations?${params}`
  const rowsKey = `${locationUrl}:${revision}`
  const rows = locations?.key === rowsKey ? locations.data : null
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
  useEffect(() => {
    let live = true
    api<LocationList>(locationUrl)
      .then((value) => {
        if (live) {
          setLocations({ key: rowsKey, data: value })
          setError('')
        }
      })
      .catch((e) => {
        if (live) {
          setLocations(null)
          setError(
            e instanceof Error ? e.message : '보관 위치를 불러오지 못했습니다.',
          )
        }
      })
    return () => {
      live = false
    }
  }, [locationUrl, rowsKey])
  function pick(parent: string) {
    setFilter((f) => ({ ...f, parent, page: 1 }))
  }
  function edit(kind: WarehouseEdit['kind'], item?: StorageItem) {
    onEdit({ kind, item, warehouseId: id, zones: data?.zones })
  }
  function rackNode(rack: StorageItem) {
    return (
      <li key={rack.id}>
        <div className="warehouse-tree-row">
          <button
            className="text-button"
            aria-pressed={filter.parent === `r:${rack.id}`}
            onClick={() => pick(`r:${rack.id}`)}
          >
            {rack.code} · {rack.name} ({rack.levels}단 × {rack.bays}칸)
            {rack.isActive ? '' : ' · 미사용'}
          </button>
          {canUpdate && (
            <button
              className="secondary"
              aria-label={`${rack.name} 랙 수정`}
              onClick={() => edit('racks', rack)}
            >
              수정
            </button>
          )}
        </div>
      </li>
    )
  }
  return (
    <section className="wms-card organization-card">
      <div className="organization-toolbar">
        <button className="secondary" onClick={onBack}>
          창고 목록으로
        </button>
        <button className="text-button" onClick={onRefresh}>
          창고 상세 새로고침
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <p>{error ? '상세 정보를 확인할 수 없습니다.' : '불러오는 중…'}</p>
      ) : (
        <>
          <div className="organization-toolbar">
            <h2>
              {data.warehouse.name} <small>({data.warehouse.code})</small>
            </h2>
            {canUpdate && (
              <button
                className="secondary"
                onClick={() => edit('warehouse', data.warehouse)}
              >
                창고 정보 수정
              </button>
            )}
          </div>
          <dl className="warehouse-details">
            <dt>상태</dt>
            <dd>{statusLabel(data.warehouse.isActive)}</dd>
            <dt>자체 창고 코드</dt><dd>{data.warehouse.customCode || '미지정'}</dd>
            <dt>유형</dt>
            <dd>{data.warehouse.type || '미지정'}{data.warehouse.typeDescription && ` · ${data.warehouse.typeDescription}`}</dd>
            <dt>주소</dt>
            <dd>
              {[data.warehouse.address, data.warehouse.addressDetail]
                .filter(Boolean)
                .join(' ') || '미지정'}
            </dd>
            <dt>담당자</dt>
            <dd>{data.warehouse.contactName || '미지정'}</dd>
            <dt>비고</dt>
            <dd>{data.warehouse.notes || '없음'}</dd>
            <dt>최종 수정</dt>
            <dd>
              {new Date(data.warehouse.updatedAt).toLocaleString('ko-KR')}
            </dd>
          </dl>
          <p>
            구역 {data.zones.length}개 · 랙 {data.racks.length}개 · 보관 위치{' '}
            {data.locationCount}개
          </p>
          {!data.warehouse.isActive && (
            <p className="alert">
              미사용 창고입니다. 하위 위치의 설정과 이력은 보존되며 실제 사용
              가능 상태는 미사용으로 표시됩니다.
            </p>
          )}
          <div className="organization-row-actions">
            {canCreate && (
              <>
                <button
                  className="secondary"
                  disabled={!data.warehouse.isActive}
                  onClick={() => edit('zones')}
                >
                  구역 등록
                </button>
                <button
                  className="secondary"
                  disabled={!data.warehouse.isActive}
                  onClick={() => edit('racks')}
                >
                  랙 등록
                </button>
                <button
                  className="primary"
                  disabled={!data.warehouse.isActive}
                  onClick={() => edit('locations')}
                >
                  바닥 보관 위치 등록
                </button>
              </>
            )}
          </div>
          <div className="warehouse-structure">
            <section aria-label="창고 내부 구조" className="warehouse-tree">
              <h3>구역 · 랙 구조</h3>
              <button
                className="text-button"
                aria-pressed={filter.parent === 'all'}
                onClick={() => pick('all')}
              >
                전체 보관 위치
              </button>
              <button
                className="text-button"
                aria-pressed={filter.parent === 'floor'}
                onClick={() => pick('floor')}
              >
                랙 없는 바닥 위치
              </button>
              {!data.zones.length && !data.racks.length && (
                <p className="organization-help">
                  구역·랙 없이 바닥 위치부터 등록할 수 있습니다.
                </p>
              )}
              <ul>
                {data.zones.map((zone) => (
                  <li key={zone.id}>
                    <div className="warehouse-tree-row">
                      <button
                        className="text-button"
                        aria-pressed={filter.parent === `z:${zone.id}`}
                        onClick={() => pick(`z:${zone.id}`)}
                      >
                        {zone.code} · {zone.name}
                        {zone.isActive ? '' : ' · 미사용'}
                      </button>
                      {canUpdate && (
                        <button
                          className="secondary"
                          aria-label={`${zone.name} 구역 수정`}
                          onClick={() => edit('zones', zone)}
                        >
                          수정
                        </button>
                      )}
                    </div>
                    <ul>
                      {data.racks
                        .filter((r) => r.zoneId === zone.id)
                        .map(rackNode)}
                    </ul>
                  </li>
                ))}
              </ul>
              {data.racks.some((r) => !r.zoneId) && (
                <>
                  <h4>구역 미지정 랙</h4>
                  <ul>{data.racks.filter((r) => !r.zoneId).map(rackNode)}</ul>
                </>
              )}
            </section>
            <section
              className="warehouse-locations"
              aria-label="보관 위치 목록"
            >
              <h3>선반 · 보관 위치</h3>
              <form
                className="organization-filters"
                onSubmit={(e) => {
                  e.preventDefault()
                  const v = formValues(e.currentTarget)
                  setFilter((f) => ({
                    ...f,
                    search: v.search.trim(),
                    status: v.status,
                    page: 1,
                  }))
                }}
              >
                <label>
                  위치 검색
                  <input
                    name="search"
                    maxLength={100}
                    placeholder="위치명 또는 코드"
                  />
                </label>
                <label>
                  사용 가능 상태
                  <select name="status" aria-label="위치 상태 필터">
                    <option value="all">전체</option>
                    <option value="active">사용 가능</option>
                    <option value="inactive">미사용</option>
                  </select>
                </label>
                <button className="secondary">위치 검색</button>
              </form>
              <p className="organization-help">
                상위 창고·구역·랙 중 하나라도 미사용이면 위치도 사용 불가입니다.
                현재 위치 정보만 관리하며 실제 재고 수량은 표시하지 않습니다.
              </p>
              {!rows ? (
                <p>
                  {error ? '위치 목록을 확인할 수 없습니다.' : '불러오는 중…'}
                </p>
              ) : (
                <>
                  <p className="organization-help">보관 위치 {rows.total}개</p>
                  <div className="wms-table-scroll">
                    <table className="wms-table warehouse-table">
                      <thead>
                        <tr>
                          <th>위치 코드 / 이름</th>
                          <th>구역 / 랙</th>
                          <th>단 / 칸</th>
                          <th>상태</th>
                          <th>관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!rows.items.length && (
                          <tr>
                            <td colSpan={5}>
                              조건에 맞는 보관 위치가 없습니다.
                            </td>
                          </tr>
                        )}
                        {rows.items.map(({ location: l, effectiveActive }) => {
                          const rack = data.racks.find(
                              (r) => r.id === l.rackId,
                            ),
                            zone = data.zones.find(
                              (z) => z.id === (rack?.zoneId || l.zoneId),
                            )
                          return (
                            <tr key={l.id}>
                              <td>
                                {l.code}
                                <small>{l.name}</small>
                              </td>
                              <td>
                                {zone?.name || '구역 없음'}
                                <small>{rack?.name || '바닥 위치'}</small>
                              </td>
                              <td>
                                {l.rackId ? `${l.level}단 / ${l.bay}칸` : '—'}
                              </td>
                              <td>
                                {effectiveActive
                                  ? '사용 가능'
                                  : l.isActive
                                    ? '상위 항목 미사용'
                                    : '미사용'}
                              </td>
                              <td>
                                {canUpdate && (
                                  <button
                                    className="secondary"
                                    aria-label={`${l.code} 위치 수정`}
                                    onClick={() => edit('locations', l)}
                                  >
                                    수정
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={filter.page}
                    size={50}
                    total={rows.total}
                    onChange={(page) => setFilter((f) => ({ ...f, page }))}
                  />
                </>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  )
}
