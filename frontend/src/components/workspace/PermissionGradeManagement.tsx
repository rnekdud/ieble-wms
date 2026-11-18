import PageSizeSelect from '../PageSizeSelect'
import Pagination from '../Pagination'
import FormLabel from '../FormLabel'
import './organization-items.css'
import SearchFilters from './SearchFilters'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api } from '../../api'
import { formValues } from '../../form-values'
import { requestNavigation } from '../../navigation-guard'
import { notifyAccessChanged } from '../../access-events'
import type { PermissionGrade } from './PermissionGradeChoice'
import OrganizationDialog from './OrganizationDialog'
import GuardedForm from './GuardedForm'

export default function PermissionGradeManagement({ tenantId, grants, header }: { tenantId: string; grants: string[]; header: (actions: ReactNode) => ReactNode }) {
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState(''), [appliedSearch, setAppliedSearch] = useState('')
  const [items, setItems] = useState<PermissionGrade[]>([]), [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<PermissionGrade | 'create' | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const saving = useRef(false), endpoint = `/api/tenants/${tenantId}/organization-items/permission-grades`
  useEffect(() => { let live = true; api<PermissionGrade[]>(endpoint).then(x => { if (live) setItems(x) }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [endpoint, revision])
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!editing || saving.current) return
    const values = formValues(e.currentTarget); saving.current = true; setBusy(true); setError('')
    try {
      await api(endpoint + (editing === 'create' ? '' : `/${editing.id}`), { name: values.name, description: values.description || null, isActive: values.isActive === 'true', version: editing === 'create' ? '00000000-0000-0000-0000-000000000000' : editing.version })
      setEditing(null); setRevision(x => x + 1); setNotice('권한 등급을 저장했습니다.'); notifyAccessChanged()
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.') } finally { saving.current = false; setBusy(false) }
  }
  const visibleItems = items.filter(x => x.name.toLowerCase().includes(appliedSearch.toLowerCase()))
  return <>
    {header(grants.includes('create') && <button className="primary" onClick={() => { setEditing('create'); setError('') }}>권한 등급 추가</button>)}
    <section className="wms-card organization-card mobile-management-list">
    <SearchFilters className="mobile-management-filters" onReset={() => { setSearch(''); setAppliedSearch(''); setPage(1) }} busy={busy} onSearch={() => { setAppliedSearch(search.trim()); setPage(1) }}><label>권한 등급 검색<input value={search} onChange={e => setSearch(e.target.value)} maxLength={100} /></label></SearchFilters>
    {!editing && error && <p role="alert" className="alert error">{error}</p>}{notice && <p role="status" className="alert success">{notice}</p>}
    <><div className="wms-table-scroll"><table className="wms-table mobile-record-table mobile-management-table permission-grades-list" aria-label="권한 등급 목록"><thead><tr><th>권한명</th><th>구분</th><th>사용 인원</th><th>사용 여부</th><th>관리</th></tr></thead><tbody>{visibleItems.slice((page - 1) * pageSize, page * pageSize).map(x => <tr key={x.id}><td data-label="권한명">{x.name}</td><td data-label="구분">{x.isBuiltIn ? '—' : '사용자 추가'}</td><td data-label="사용 인원">{x.memberCount}명</td><td data-label="사용 여부" className="mobile-card-usage"><span className={`mobile-usage-badge ${x.isActive ? 'is-active' : 'is-inactive'}`}>{x.isActive ? '사용' : '사용 중지'}</span></td><td data-label="관리">{grants.includes('update') && <button className="secondary" aria-label={`${x.name} 수정`} onClick={() => { setEditing(x); setError('') }}>수정</button>}</td></tr>)}{!visibleItems.length && <tr><td colSpan={5}>조회된 권한 등급이 없습니다.</td></tr>}</tbody></table></div><Pagination pageSizeControl={<PageSizeSelect value={pageSize} disabled={busy} onChange={size=>{setPageSize(size);setPage(1)}} />} page={page} pageSize={pageSize} total={visibleItems.length} disabled={busy} onChange={setPage} /></>
    <p className="organization-help">이력과 사용자 연결을 보존하기 위해 삭제 대신 사용 중지합니다. 사용 중인 권한은 사용자 재배정 후 중지할 수 있습니다.</p>
    </section>
    {editing && <OrganizationDialog className="organization-item-dialog" title={`권한 등급 ${editing === 'create' ? '추가' : '수정'}`} busy={busy} onClose={() => requestNavigation(() => setEditing(null))}>
      {error && <p className="alert error" role="alert">{error}</p>}
      <GuardedForm className="dialog-form" busy={busy} onSubmit={save}><div className="dialog-form-scroll"><fieldset disabled={busy}>
        <label><FormLabel required>권한명</FormLabel><input aria-label={"권한명"} autoFocus required name="name" maxLength={100} defaultValue={editing === 'create' ? '' : editing.name} /></label>
        <label>설명 (선택)<textarea name="description" maxLength={500} defaultValue={editing === 'create' ? '' : editing.description || ''} /></label>
        <label className="organization-checkbox"><input type="checkbox" name="isActive" value="true" defaultChecked={editing === 'create' || editing.isActive}/>사용</label>
        {editing !== 'create' && editing.isBuiltIn && <p className="organization-help">이름을 바꾸어도 기존 사용자와 세부 권한은 유지됩니다. 세부 권한을 변경하면 연결된 사용자의 접근에 적용됩니다.</p>}
      </fieldset></div><div className="dialog-actions"><button className="secondary" type="button" disabled={busy} onClick={() => requestNavigation(() => setEditing(null))}>취소</button><button className="primary" disabled={busy}>{editing === 'create' ? '등록' : '저장'}</button></div></GuardedForm>
    </OrganizationDialog>}
  </>
}
