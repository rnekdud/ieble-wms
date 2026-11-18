import PageSizeSelect from '../PageSizeSelect'
import Pagination from '../Pagination'
import FormLabel from '../FormLabel'
import SearchFilters from './SearchFilters'
import PermissionGradeManagement from './PermissionGradeManagement'
import { departmentHierarchy } from '../../department-hierarchy'
import './organization-items.css'
import GuardedForm from './GuardedForm'
import { requestNavigation } from '../../navigation-guard'
import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { api } from '../../api'
import { formValues } from '../../form-values'
import type {
  OrganizationItem,
  OrganizationOptions,
} from '../../types/organization-structure'
import OrganizationDialog from './OrganizationDialog'
import { PageHeading } from './WorkspaceUI'

export default function OrganizationItems({
  tenantId,
  grants,
}: {
  tenantId: string
  grants: string[]
}) {
  const [tab, setTab] = useState<'departments' | 'positions' | 'permission-grades'>('departments')
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState(''), [appliedSearch, setAppliedSearch] = useState('')
  const [data, setData] = useState<OrganizationOptions | null>(null)
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<OrganizationItem | 'create' | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const endpoint = `/api/tenants/${tenantId}/organization-items`
  const label = tab === 'departments' ? '부서' : '직급'
  useEffect(() => {
    let live = true
    api<OrganizationOptions>(endpoint)
      .then((value) => {
        if (live) {
          setData(value)
          setError('')
        }
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error ? e.message : '항목을 불러오지 못했습니다.',
          )
      })
    return () => {
      live = false
    }
  }, [endpoint, revision])
  function forbiddenParent(id: string) {
    const seen = new Set<string>()
    let current: string | null | undefined = id
    while (current) {
      if (
        seen.has(current) ||
        (editing !== 'create' && editing?.id === current)
      )
        return true
      seen.add(current)
      current = data?.departments.find((x) => x.id === current)?.parentId
    }
    return false
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const values = formValues(event.currentTarget)
    if (!values.name.trim()) {
      setError(`${label}명을 입력해 주세요.`)
      return
    }
    if (
      !window.confirm(
        `${label} 정보를 저장하시겠습니까? 사용 중지해도 기존 직원의 소속과 이력은 유지됩니다.`,
      )
    )
      return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api(
        `${endpoint}/${tab}${editing === 'create' ? '' : `/${editing.id}`}`,
        {
          name: values.name,
          parentId: values.parentId || null,
          sortOrder: Number(values.sortOrder),
          isActive: values.isActive === 'on',
          version:
            editing === 'create'
              ? '00000000-0000-0000-0000-000000000000'
              : editing.version,
        },
      )
      setEditing(null)
      setNotice(`${label} 정보를 저장했습니다.`)
      setRevision((x) => x + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  async function remove(item: OrganizationItem) {
    if (
      !window.confirm(
        `${item.name} ${label}를 삭제하시겠습니까? 직원과 하위 부서가 없는 항목만 삭제할 수 있습니다.`,
      )
    )
      return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api(`${endpoint}/${tab}/${item.id}/delete`, {
        version: item.version,
      })
      setNotice(`${label}를 삭제했습니다.`)
      setRevision((x) => x + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  const tabs = (<>        <div
          className="wms-segmented organization-item-tabs"
          role="tablist"
          aria-label="조직 항목"
        >
          {(['departments', 'positions', 'permission-grades'] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? 'primary' : 'secondary'}
              disabled={busy}
              onClick={() => {
                setTab(key); setSearch(''); setAppliedSearch(''); setPage(1)
                setError('')
                setNotice('')
              }}
            >
              {key === 'departments' ? '부서 관리' : key === 'positions' ? '직급 관리' : '권한 등급 관리'}
            </button>
          ))}
        </div></>)
  if (tab === 'permission-grades') return <PermissionGradeManagement tenantId={tenantId} grants={grants} header={actions => <><PageHeading title="항목 관리" actions={actions} />{tabs}</>} />
  const itemRows = tab==='departments' ? departmentHierarchy(data?.departments||[]) : (data?.positions||[]).map(item=>({item,depth:0,ancestors:[] as string[]}))
  const visibleItems = itemRows.filter(({item}) => item.name.toLowerCase().includes(appliedSearch.toLowerCase()))
  return (
    <>
      <PageHeading
        title="항목 관리"
        actions={<>           {grants.includes('create') && (
            <button
              className="primary"
              disabled={busy || !data}
              onClick={() => {
                setEditing('create')
                setError('')
              }}
            >
              {label} 등록
            </button>
          )} </>}
      />
      {tabs}
      <section className="wms-card organization-card mobile-management-list">


        {!editing && error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            {notice}
          </div>
        )}
        <div className="organization-toolbar">
          <p className="organization-help">
            사용 중인 항목은 삭제할 수 없습니다. 사용 중지된 항목은 새 직원에게
            지정할 수 없습니다.
          </p>

        </div>
        <SearchFilters className="mobile-management-filters" onReset={() => { setSearch(''); setAppliedSearch(''); setPage(1) }} busy={busy} onSearch={() => { setAppliedSearch(search.trim()); setPage(1) }}><label>{label} 검색<input value={search} onChange={e => setSearch(e.target.value)} maxLength={100} /></label></SearchFilters>
        {!data ? (
          <p>{error ? '목록을 확인할 수 없습니다.' : '불러오는 중…'}</p>
        ) : (
          <><div className="wms-table-scroll">
            <table className="wms-table mobile-record-table mobile-management-table organization-items-list" aria-label={`${label} 목록`}>

              <thead>
                <tr>
                  <th>이름</th>
                  {tab === 'departments' && <th>상위 부서</th>}
                  <th>정렬 순서</th>
                  <th>상태</th>
                  <th>소속 인원</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {!visibleItems.length ? (
                  <tr>
                    <td colSpan={tab==='departments'?6:5}>{appliedSearch ? '검색 조건에 맞는 항목이 없습니다.' : `등록된 ${label}가 없습니다.`}</td>
                  </tr>
                ) : (
                  visibleItems.slice((page - 1) * pageSize, page * pageSize).map(({item,depth,ancestors}) => (
                    <tr key={item.id} className={tab === 'departments' && depth > 0 ? 'mobile-department-child' : undefined} style={tab === 'departments' ? { '--department-depth': depth } as CSSProperties : undefined}>
                      <td data-label="이름">{tab==='departments'?<span className={`organization-department-name ${depth===0?'is-root':''}`} style={{'--department-depth':depth} as CSSProperties} title={[...ancestors,item.name].join(' › ')}>{item.name}{appliedSearch&&ancestors.length>0&&<small>{ancestors.join(' › ')}</small>}</span>:item.name}</td>
                      {tab === 'departments' && (
                        <td data-label="상위 부서">
                          {data.departments.find((x) => x.id === item.parentId)
                            ?.name || '최상위'}
                        </td>
                      )}
                      <td data-label="정렬 순서">{item.sortOrder}</td>
                      <td data-label="상태" className="mobile-card-usage"><span className={`mobile-usage-badge ${item.isActive ? 'is-active' : 'is-inactive'}`}>{item.isActive ? '사용 중' : '사용 중지'}</span></td>
                      <td data-label="소속 인원">{item.memberCount}명</td>
                      <td data-label="관리">
                        <div className="organization-row-actions">
                          {grants.includes('update') && (
                            <button
                              className="secondary"
                              disabled={busy}
                              aria-label={`${item.name} 수정`}
                              onClick={() => {
                                setEditing(item)
                                setError('')
                              }}
                            >
                              수정
                            </button>
                          )}
                          {grants.includes('delete') && (
                            <button
                              className="text-button"
                              disabled={
                                busy ||
                                item.memberCount > 0 ||
                                (item.childCount || 0) > 0
                              }
                              aria-label={`${item.name} 삭제`}
                              onClick={() => remove(item)}
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div><Pagination pageSizeControl={<PageSizeSelect value={pageSize} disabled={busy} onChange={size=>{setPageSize(size);setPage(1)}} />} page={page} pageSize={pageSize} total={visibleItems.length} disabled={busy} onChange={setPage} /></>
        )}

      </section>
      {editing && (
        <OrganizationDialog
          className="organization-item-dialog"
          title={`${label} ${editing === 'create' ? '등록' : '수정'}`}
          busy={busy}
          onClose={() => requestNavigation(() => {
            setEditing(null)
            setError('')
          })}
        >
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <GuardedForm className="dialog-form" busy={busy} onSubmit={save}>
            <div className="dialog-form-scroll"><fieldset disabled={busy}>
              <label><FormLabel required>{label}명</FormLabel><input aria-label={String(label) + "명"}
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={editing === 'create' ? '' : editing.name}
                  autoFocus
                />
              </label>
              {tab === 'departments' && (
                <label>
                  상위 부서
                  <select
                    name="parentId"
                    defaultValue={
                      editing === 'create' ? '' : editing.parentId || ''
                    }
                  >
                    <option value="">최상위 부서</option>
                    {data?.departments
                      .filter(
                        (x) =>
                          !forbiddenParent(x.id) &&
                          (x.isActive ||
                            (editing !== 'create' &&
                              editing.parentId === x.id)),
                      )
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                          {x.isActive ? '' : ' (사용 중지)'}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label><FormLabel required>정렬 순서</FormLabel><input aria-label={"정렬 순서"}
                  type="number"
                  name="sortOrder"
                  min={0}
                  max={100000}
                  required
                  defaultValue={editing === 'create' ? 0 : editing.sortOrder}
                />
              </label>
              <label className="organization-checkbox">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={editing === 'create' || editing.isActive}
                />
                사용
              </label>
</fieldset></div><div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={() => requestNavigation(() => { setEditing(null); setError('') })}>취소</button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? '저장 중…' : `${label} 저장`}
              </button>
            </div>
          </GuardedForm>
        </OrganizationDialog>
      )}
    </>
  )
}
