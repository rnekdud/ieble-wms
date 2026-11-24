import { t as uiText, getLocale } from '../../i18n.ts'
import ReadOnlyInput from '../ReadOnlyInput'
import PageSizeSelect from '../PageSizeSelect'
import FormLabel from '../FormLabel'
import SearchFilters from './SearchFilters'
import LoginIdField from './LoginIdField'
import PermissionGradeChoice from './PermissionGradeChoice'
import type { PermissionGrade } from './PermissionGradeChoice'
import ContactLink from './ContactLink'
import ExternalCompanyFields from './ExternalCompanyFields'
import DialogSection from './DialogSection'
import GuardedForm from './GuardedForm'
import { requestNavigation } from '../../navigation-guard'
import { formValues } from '../../form-values'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../api'
import Pagination from '../Pagination'
import type {
  Employee,
  EmployeeList,
  EmployeeCredentialResult,
} from '../../types/organization'
import type { OrganizationOptions } from '../../types/organization-structure'
import { PageHeading } from './WorkspaceUI'
import MasterTransferDialog from './MasterTransferDialog'
import { notifyAccessChanged } from '../../access-events'
import OrganizationDialog from './OrganizationDialog'
import './user-account-dialog.css'

const roles: Record<string, string> = {
  Master: '기업 마스터',
  Administrator: '기업 관리자',
  Employee: '일반 직원',
}
export default function UserManagement({
  tenantId,
  currentUserId,
  canCreate,
  canUpdate,
  isMaster,
  onAccessChanged,
}: {
  tenantId: string
  currentUserId: string
  canCreate: boolean
  canUpdate: boolean
  isMaster: boolean
  onAccessChanged: () => Promise<unknown>
}) {
  const [grades, setGrades] = useState<PermissionGrade[]>([])
  const [gradeKey, setGradeKey] = useState('Employee')
  const gradeLabel = (key: string) => { const grade = grades.find(x => x.id === key); return grade ? (grade.isBuiltIn ? uiText(grade.name) : grade.name) : uiText(roles[key] || '사용자 정의 권한') }
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    accountType: '',
    status: 'all',
    page: 1, pageSize: 20,
  })
  const [filterDraft, setFilterDraft] = useState(filters)
  const [accountType, setAccountType] = useState('Internal')
  const [options, setOptions] = useState<OrganizationOptions | null>(null)
  const [revision, setRevision] = useState(0)
  const [view, setView] = useState<{
    key: string
    data: EmployeeList | null
    error?: string
  } | null>(null)
  const [editing, setEditing] = useState<Employee | 'create' | null>(null)
  const [registrationResult, setRegistrationResult] =
    useState<EmployeeCredentialResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [loginAvailable, setLoginAvailable] = useState(false)
  const saving = useRef(false)
  const [pending, setPending] = useState<{ values: Record<string, string>; assignment: { departmentId: string | null; positionId: string | null }; active: boolean; selectedRole: string; confirmation: string } | null>(null)
  const endpoint = `/api/tenants/${tenantId}/users`
  useEffect(() => { let live = true; api<PermissionGrade[]>(`${endpoint}/permission-grades`).then(x => { if (live) setGrades(x) }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [endpoint, revision, editing])
  const query = new URLSearchParams({
    ...filters,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  }).toString()
  const key = `${endpoint}?${query}:${revision}`
  const current = view?.key === key ? view : null
  useEffect(() => {
    let live = true
    api<EmployeeList>(`${endpoint}?${query}`)
      .then((data) => {
        if (live) setView({ key, data })
      })
      .catch((e) => {
        if (live)
          setView({
            key,
            data: null,
            error:
              e instanceof Error ? e.message : '목록을 불러오지 못했습니다.',
          })
      })
    return () => {
      live = false
    }
  }, [endpoint, query, key])
  useEffect(() => {
    if (!canCreate && !canUpdate) return
    let live = true
    api<OrganizationOptions>(
      `/api/tenants/${tenantId}/users/organization-options`,
    )
      .then((value) => {
        if (live) setOptions(value)
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error
              ? e.message
              : '부서·직급 목록을 불러오지 못했습니다.',
          )
      })
    return () => {
      live = false
    }
  }, [tenantId, canCreate, canUpdate, revision])
  function openEditor(value: Employee | 'create') {
    setError('')
    setNotice('')
    setAccountType(value === 'create' ? 'Internal' : value.accountType)
    setGradeKey(value === 'create' ? 'Employee' : value.permissionGradeId || value.role)
    setLoginAvailable(false)
    setEditing(value)
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || busy || pending) return
    if (editing === 'create' && !loginAvailable) { setError('로그인 아이디 중복 확인을 완료해 주세요.'); return }
    const values = formValues(event.currentTarget)
    if (editing !== 'create' && editing.role === 'Master')
      values.name = editing.name
    values.accountType = accountType
    const assignment = {
      departmentId: accountType === 'External' ? null : values.departmentId || null,
      positionId: accountType === 'External' ? null : values.positionId || null,
    }
    if (!String(values.name).trim()) {
      setError('사용자 이름을 입력해 주세요.')
      return
    }
    if (accountType === 'External' && !values.companyName?.trim()) {
      setError('소속 업체를 선택하거나 새 업체명을 입력해 주세요.')
      return
    }
    const active = editing !== 'create' && editing.userId === currentUserId ? editing.membershipIsActive : values.isActive === 'on'
    const selectedKey = accountType === 'External' || (editing !== 'create' && editing.accountType !== accountType) ? 'Employee' : gradeKey
    const selectedRole = roles[selectedKey] ? selectedKey : 'Employee'
    values.permissionGradeId = roles[selectedKey] ? '' : selectedKey
    const confirmation =
      editing === 'create'
        ? `${values.name.trim()}님을 ${values.accountType === 'External' ? '외부 협력사' : gradeLabel(selectedKey)}로 등록하시겠습니까? 첫 로그인 시 비밀번호 변경이 필요합니다.`
        : editing.membershipIsActive && !active
          ? `${values.name.trim()}님을 비활성화하시겠습니까? 해당 기업의 로그인·API 접근이 차단됩니다. 과거 이력은 유지되며 과금 종료일은 변경하지 않습니다.`
          : `${values.name.trim()}님의 정보를 저장하시겠습니까? 시스템 권한: ${gradeLabel(editing.permissionGradeId || editing.role)} → ${gradeLabel(selectedKey)}, 계정 활성화: ${active ? '활성' : '비활성'}`
    setPending({ values, assignment, active, selectedRole, confirmation: confirmation + (editing !== 'create' && editing.accountType !== accountType ? ' 계정 유형 변경 시 기존 외부 개별 권한은 모두 해제됩니다. 내부 직원으로 변경하면 일반 직원 역할 권한이 적용됩니다.' : '') })
  }
  async function commitSave() {
    if (!pending || !editing || saving.current) return
    saving.current = true
    const { values, assignment, active, selectedRole } = pending
    const external = { collaboratorId: values.collaboratorId || null, accountType: values.accountType, partnerId: values.partnerId || null, companyName: values.companyName || null, businessRegistrationNumber: values.businessRegistrationNumber || null, companyPhone: values.companyPhone || null, contactPhone: values.contactPhone || null, contactEmail: values.contactEmail || null }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (editing === 'create') {
        const result = await api<EmployeeCredentialResult>(endpoint, {
          name: values.name, loginId: values.loginId, email: values.email, role: selectedRole, permissionGradeId: values.permissionGradeId || null, isActive: active,
          ...assignment, ...external,
        })
        setRegistrationResult(result)
        setEditing(null)
      } else {
        if (editing.role === 'Master')
          await api(`${endpoint}/${editing.userId}/organization`, {
            ...assignment,
            contactPhone: values.contactPhone || null,
            email: values.email,
            version: editing.version,
          })
        else
          await api(`${endpoint}/${editing.userId}`, {
            ...assignment, ...external,
            name: values.name,
            role: selectedRole, permissionGradeId: values.permissionGradeId || null,
            isActive: active,
            version: editing.version,
          })
        setEditing(null)
        setNotice(
          editing.membershipIsActive && !active
            ? '사용자를 비활성화했습니다. 해당 기업 접근이 차단됩니다.'
            : '사용자 정보를 저장했습니다.',
        )
      }
      setPending(null)
      setRevision((x) => x + 1)
      notifyAccessChanged()
    } catch (e) {
      setPending(null)
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  async function resetPassword(user: Employee) {
    if (
      !window.confirm(
        uiText('{v0}님의 비밀번호를 초기화하시겠습니까? 로그인 아이디와 같은 초기 비밀번호로 설정됩니다. 기존 로그인은 해제되고 개인 비밀번호 변경이 필요합니다.', { v0: user.name }),
      )
    )
      return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setRegistrationResult(
        await api<EmployeeCredentialResult>(
          `${endpoint}/${user.userId}/reset-password`,
          { version: user.version },
        ),
      )
      setRevision((x) => x + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : '초기화하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  const contactField = editing && (<label className="member-contact">{uiText("연락처 (선택)")}<input name="contactPhone" type="text" inputMode="tel" autoComplete="tel" maxLength={50} placeholder="010-1234-5678" defaultValue={editing === 'create' ? '' : editing.contactPhone || ''} /></label>)
  const data = current?.data
  function closeEditor() {
    if (pending) setPending(null)
    else requestNavigation(() => { setEditing(null); setError('') })
  }
  return (
    <>
      <PageHeading
        title={uiText("사용자 관리")}
        actions={<>           {canCreate && (
            <button
              className="primary"
              disabled={busy || !options}
              onClick={() => openEditor('create')}
            > {uiText("사용자 등록")} </button>
          )} {isMaster && <button className="secondary" disabled={busy} onClick={() => setTransferring(true)}>{uiText("마스터 위임")}</button>}</>}
      />
      {transferring && isMaster && <MasterTransferDialog tenantId={tenantId} onClose={() => setTransferring(false)} onTransferred={async () => { setNotice('마스터 위임이 완료되었습니다.'); setRevision(x => x + 1); await onAccessChanged() }} />}
      <section className="wms-card organization-card mobile-management-list">
        {!editing && error && (
          <div className="alert error" role="alert">
            {uiText(error)}
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            {uiText(notice)}
          </div>
        )}
        <div className="organization-toolbar">
          <SearchFilters className="organization-filters mobile-management-filters" busy={!current}
            onSearch={() => { setFilters({ ...filterDraft, search:filterDraft.search.trim(), page:1 }); setRevision(n=>n+1) }}
            onReset={() => { const next={ search:'', role:'', accountType:'', status:'all', page:1, pageSize:20 }; setFilterDraft(next); setFilters(next); setRevision(n=>n+1) }}>

            <label>{uiText("계정 유형 필터")}<select aria-label={uiText("계정 유형 필터")} value={filterDraft.accountType} onChange={e=>setFilterDraft(f=>({...f,accountType:e.target.value,page:1}))}><option value="">{uiText("전체 사용자")}</option><option value="Internal">{uiText("내부 직원")}</option><option value="External">{uiText("외부 협력사")}</option></select></label>
            <label> {uiText("권한 필터")} <select
                aria-label={uiText("권한 필터")}
                value={filterDraft.role}
                onChange={(e) =>
                  setFilterDraft((f) => ({ ...f, role: e.target.value, page: 1 }))
                }
              >
                <option value="">{uiText("전체 권한")}</option>
                {Object.entries(roles).map(([value, label]) => (
                  <option key={value} value={value}>
                    {uiText(label)}
                  </option>
                ))}
              </select>
            </label>
            <label> {uiText("계정 활성화 필터")} <select
                aria-label={uiText("계정 활성화 필터")}
                value={filterDraft.status}
                onChange={(e) =>
                  setFilterDraft((f) => ({ ...f, status: e.target.value, page: 1 }))
                }
              >
                <option value="all">{uiText("전체 상태")}</option>
                <option value="active">{uiText("활성")}</option>
                <option value="inactive">{uiText("비활성")}</option>
              </select>
            </label>

          <label> {uiText("사용자 검색")} <input
                name="search"
                value={filterDraft.search}
                onChange={e => setFilterDraft(f => ({ ...f, search: e.target.value }))}
                maxLength={100}
                placeholder={uiText("이름, 아이디, 이메일, 연락처, 소속 업체")}
              />
            </label>
</SearchFilters>

        </div>
        {!current ? (<p role="status">{uiText("사용자 목록을 불러오는 중입니다.")}</p>) : current.error ? (<div className="alert error" role="alert">
            {uiText(current.error)}
          </div>) : (data && (
            <>
              <p aria-live="polite">{uiText("검색 결과")} {data.total}{uiText("명")}</p>
              <div className="wms-table-scroll">
                <table className="wms-table organization-user-table mobile-record-table mobile-management-table">
                  <thead>
                    <tr>
                      <th>{uiText("이름")}</th><th>{uiText("계정 유형 / 소속 업체")}</th>
                      <th>{uiText("로그인 아이디 / 이메일")}</th>
                      <th>{uiText("부서")}</th>
                      <th>{uiText("직급")}</th>
                      <th>{uiText("연락처")}</th>
                      <th>{uiText("권한 등급")}</th>
                      <th>{uiText("계정 활성화")}</th>
                      <th>{uiText("등록일")}</th>
                      <th>{uiText("관리")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.length === 0 ? (
                      <tr>
                        <td colSpan={10}>{uiText("조건에 맞는 사용자가 없습니다.")}</td>
                      </tr>
                    ) : (
                      data.items.map((user) => (
                        <tr key={user.userId}>
                          <td data-label={uiText("이름")}>
                            <div className="user-card-heading"><span className="user-card-name">{user.name}</span>
                              <div className="user-card-mobile-badges">
                                <span className="badge account-type-tag" data-account-type={user.accountType}>{user.accountType === 'External' ? uiText("외부 협력사") : uiText("내부 직원")}</span>
                                <span className={`badge ${user.isActive ? 'active' : ''}`}>{user.isActive ? uiText("활성") : uiText("비활성")}</span>
                              </div>
                            </div>
                            <div className="user-card-mobile-meta">
                              {user.accountType === 'External' && <small>{uiText("소속 업체 ·")} {user.companyName || '—'}</small>}
                              {user.mustChangePassword && <small className="organization-password-required">{uiText("비밀번호 변경 필요")}</small>}
                            </div>
                          </td>
                          <td data-label={uiText("계정 유형 / 소속 업체")}>
                            <div className="organization-account-company">
                              <span className="badge account-type-tag" data-account-type={user.accountType}>{user.accountType === 'External' ? uiText("외부 협력사") : uiText("내부 직원")}</span>
                              {user.accountType === 'External' && <span>{user.companyName || '—'}</span>}
                            </div>
                          </td>
                          <td data-label={uiText("로그인 아이디 / 이메일")}>
                            {user.loginId}
                            <br />
                            <small>{user.email}</small>
                          </td>
                          <td data-label={uiText("부서")}>{user.departmentName || uiText("미지정")}</td>
                          <td data-label={uiText("직급")}>{user.positionName || uiText("미지정")}</td>
                          <td data-label={uiText("연락처")}><ContactLink value={user.contactPhone} /></td>
                          <td data-label={uiText("권한 등급")}>{user.accountType === 'External' ? uiText("협력사 업무 권한") : gradeLabel(user.permissionGradeId || user.role)}</td>
                          <td data-label={uiText("계정 활성화")}>
                            <span
                              className={`badge ${user.isActive ? 'active' : ''}`}
                            >
                              {user.isActive ? uiText("활성") : uiText("비활성")}
                            </span>
                            {user.mustChangePassword && (
                              <small className="organization-password-required"> {uiText("비밀번호 변경 필요")} </small>
                            )}
                          </td>
                          <td data-label={uiText("등록일")}>
                            {new Date(user.registeredAt).toLocaleDateString(
                              getLocale(),
                            )}
                          </td>

                          <td data-label={uiText("관리")}>
                            {user.role === 'Master' ? (
                              <>
                                {user.userId === currentUserId && canUpdate && (
                                  <button
                                    className="secondary"
                                    disabled={busy || !options}
                                    onClick={() => openEditor(user)}
                                  > {uiText("수정")} </button>
                                )}
                              </>
                            ) : canUpdate ? (
                              <div className="organization-row-actions">
                                <button
                                  className="secondary"
                                  disabled={busy || !options}
                                  onClick={() => openEditor(user)}
                                  aria-label={uiText("{v0} 수정", { v0: user.name })}
                                > {uiText("수정")} </button>
                                {user.accountType !== 'External' && user.userId !== currentUserId &&
                                  user.isActive && (
                                    <button
                                      className="text-button"
                                      disabled={busy}
                                      onClick={() => resetPassword(user)}
                                      aria-label={uiText("{v0} 비밀번호 초기화", { v0: user.name })}
                                    > {uiText("비밀번호 초기화")} </button>
                                  )}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination pageSizeControl={<PageSizeSelect value={filters.pageSize} onChange={pageSize => { setFilters(v => ({ ...v, pageSize, page: 1 })); setFilterDraft(v => ({ ...v, pageSize, page: 1 }));  }} />}
                label={uiText("사용자 목록 페이지")}
                page={filters.page}
                pageSize={data.pageSize}
                total={data.total}
                disabled={busy}
                onChange={(page) => setFilters((f) => ({ ...f, page }))}
              />

            </>
          ))}
        {data && (
              <p className="organization-help"> {uiText("사용자당 월")} {data.monthlyPerUserKrw.toLocaleString(getLocale())}{uiText("원 · 기업 마스터 포함. 사용자 등록 월은 무료이며 다음 달부터 도래하는 기업 정기결제일부터 과금 대상입니다. 비활성화에 따른 과금 종료 규칙은 미정이며 실제 결제·청구는 실행하지 않습니다.")} </p>
        )}
      </section>
      {editing && (
        <OrganizationDialog
          title={editing === 'create' ? uiText("사용자 등록") : uiText("사용자 정보 수정")}
          detailHeader={{hideBack:editing !== 'create',actionsInFooter:editing !== 'create',code:editing === 'create' ? undefined : editing.loginId,status:editing !== 'create' && <span className="status-badge">{editing.isActive ? uiText("사용") : uiText("사용 중지")}</span>,actions:<>{editing !== 'create' && <button type="button" className="secondary" disabled={busy} onClick={closeEditor}>{uiText("닫기")}</button>}<button className="primary" form="user-account-editor" disabled={busy || (editing === 'create' && !loginAvailable)} type="submit">{busy ? uiText("저장 중…") : editing === 'create' ? uiText("계정 생성") : uiText("사용자 정보 저장")}</button></>}}
          className="user-account-dialog"
          confirmation={!!pending}
          busy={busy}
          onClose={closeEditor}
        >
          {error && (
            <div className="alert error" role="alert">
              {uiText(error)}
            </div>
          )}
          {pending && <section role="alertdialog" aria-label={uiText("사용자 변경 확인")}><p>{pending.confirmation}</p><button type="button" className="secondary" disabled={busy} onClick={() => setPending(null)}>{uiText("취소")}</button>{' '}<button type="button" className="primary" disabled={busy} onClick={commitSave}>{uiText("확인")}</button></section>}
          <GuardedForm id="user-account-editor" className="dialog-form" busy={busy} onSubmit={save} hidden={!!pending}>
<div className="dialog-form-scroll"><fieldset disabled={busy}><DialogSection title={uiText("계정 정보")} description={uiText("로그인 및 사용자 식별")}>
              <label><FormLabel required={editing === 'create' || isMaster && editing.userId !== currentUserId && editing.role !== 'Master'}>{uiText("계정 유형")}</FormLabel><select aria-required="true" name="accountType" aria-label={uiText("계정 유형")} value={accountType} disabled={editing !== 'create' && (!isMaster || editing.userId === currentUserId || editing.role === 'Master')} onChange={e=>setAccountType(e.target.value)}><option value="Internal">{uiText("내부 직원")}</option><option value="External">{uiText("외부 협력사")}</option></select></label>              <label><FormLabel required={editing === 'create' || editing.role !== 'Master'}>{accountType === 'External' ? uiText("담당자명") : uiText("사용자 이름")}</FormLabel><input aria-label={uiText(accountType === 'External' ? '담당자명' : '사용자 이름')}
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={editing === 'create' ? '' : editing.name}
                  disabled={editing !== 'create' && editing.role === 'Master'}
                  autoFocus
                />
              </label>
              <div className="dialog-span member-credentials">
              {editing === 'create' ? <LoginIdField endpoint={endpoint} onAvailable={setLoginAvailable} /> : <label><span>{uiText("로그인 아이디")}<small className="readonly-field-note">{uiText("수정 불가")}</small></span><ReadOnlyInput aria-label={uiText("로그인 아이디")} title={uiText("로그인 아이디는 변경할 수 없습니다.")} value={editing.loginId} readOnly autoComplete="off" /></label>}
              <div className="member-password">
                <label> {uiText("비밀번호")} <ReadOnlyInput type="text" value={uiText("자동 생성 · 직접 입력 불가")} readOnly autoComplete="off" aria-describedby="employee-password-help" />
                </label>
                <p id="employee-password-help" className="organization-help member-password-help" style={editing === 'create' ? { fontSize: 13, margin: '6px 0 0' } : undefined}>
                  {editing === 'create' ? uiText("초기 비밀번호는 로그인 아이디와 동일하게 생성됩니다. 구성원에게 로그인 정보를 안내하고, 첫 로그인 후 반드시 비밀번호를 변경하도록 안내해 주세요.") : editing.role === 'Master' ? uiText("비밀번호는 본인 계정에서 변경할 수 있습니다.") : uiText("초기 비밀번호는 로그인 아이디와 동일하며, 첫 로그인 후 변경해야 합니다.")}
                </p>
              </div>
              </div>
              <label><FormLabel required={editing === 'create' || editing.role === 'Master'}>{uiText("이메일")}</FormLabel><ReadOnlyInput aria-label={uiText("이메일")} name={editing === 'create' || editing.role === 'Master' ? 'email' : undefined} type="email" required readOnly={editing !== 'create' && editing.role !== 'Master'} defaultValue={editing === 'create' ? '' : editing.email || ''} maxLength={256} autoComplete="off" /></label>
{contactField}
</DialogSection>{accountType === 'External' ? <ExternalCompanyFields tenantId={tenantId} user={editing === 'create' ? undefined : editing} /> : <DialogSection title={uiText("조직 정보")} description={uiText("부서와 직급")}>              <label> {uiText("부서")} <select
                  name="departmentId"
                  aria-label={uiText("부서")}
                  defaultValue={
                    editing === 'create' ? '' : editing.departmentId || ''
                  }
                >
                  <option value="">{uiText("부서 미지정")}</option>
                  {options?.departments
                    .filter(
                      (x) =>
                        x.isActive ||
                        (editing !== 'create' && editing.departmentId === x.id),
                    )
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                        {x.isActive ? '' : uiText("(사용 중지)")}
                      </option>
                    ))}
                </select>
              </label>
              <label> {uiText("직급")} <select
                  name="positionId"
                  aria-label={uiText("직급")}
                  defaultValue={
                    editing === 'create' ? '' : editing.positionId || ''
                  }
                >
                  <option value="">{uiText("직급 미지정")}</option>
                  {options?.positions
                    .filter(
                      (x) =>
                        x.isActive ||
                        (editing !== 'create' && editing.positionId === x.id),
                    )
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                        {x.isActive ? '' : uiText("(사용 중지)")}
                      </option>
                    ))}
                </select>
              </label>
</DialogSection>}<DialogSection title={uiText("접근 권한")} description={accountType === 'External' ? uiText("협력사 공통 권한과 개인별 추가 제한") : uiText("직급과 별도로 관리")}>{accountType === 'External' ? <p className="organization-help">{uiText("신규 협력사는 업무 권한 없이 생성됩니다. 기존 업체에 연결된 계정은 해당 업체의 공통 권한이 적용됩니다. 기업 마스터는 권한 설정의 외부 협력사 탭에서 권한을 지정하고 사용자별로 추가 제한할 수 있습니다. 관리자·결제·사용자 관리 권한은 부여할 수 없습니다.")}</p> : <PermissionGradeChoice name="permissionGrade" label={uiText("권한 등급")} grades={gradeKey === 'Master' ? [{ id: 'Master', name: '기업 마스터', isActive: true, isBuiltIn: true, memberCount: 1, version: '' }] : grades.filter(x => x.isActive || x.id === gradeKey)} value={gradeKey} onChange={setGradeKey} disabled={!isMaster || (editing !== 'create' && editing.userId === currentUserId)} />}
              {accountType === 'Internal' && <p className="organization-help">{uiText("직급은 조직 내 직함이며 시스템 접근 권한과 별개입니다.")}</p>}
              {<label className="organization-checkbox">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={editing === 'create' || editing.membershipIsActive}
                    disabled={editing !== 'create' && editing.userId === currentUserId}
                  /> {uiText("계정 활성화")} </label>}
              <p className="organization-help"> {uiText("비활성화하면 해당 기업 접근이 차단됩니다. 과거 이력과 다른 기업 소속은 유지합니다.")} </p>
</DialogSection></fieldset></div>          </GuardedForm>
        </OrganizationDialog>
      )}
      {registrationResult && (
        <OrganizationDialog
          title={uiText("초기 비밀번호 설정 완료")}
          className="user-credential-dialog"
          actions={<button
            className="primary"
            onClick={() => {
              setRegistrationResult(null)
              setNotice(
                '계정 설정을 완료했습니다. 초기 비밀번호는 로그인 아이디와 동일하며 첫 로그인 때 변경해야 합니다.',
              )
            }}
          > {uiText("확인하고 닫기")} </button>}
          onClose={() => {
            setRegistrationResult(null)
            setNotice(
              '초기 비밀번호는 로그인 아이디와 같습니다. 직원은 첫 로그인 때 개인 비밀번호로 변경해야 합니다.',
            )
          }}
        >
          <dl className="user-credential-details" aria-label={uiText("계정 정보")}>
            <div><dt>{uiText("사용자 이름")}</dt><dd>{registrationResult.user.name}</dd></div>
            <div><dt>{uiText("로그인 아이디")}</dt><dd>{registrationResult.user.loginId}</dd></div>
          </dl>
          <p> {uiText("초기 비밀번호는 위 로그인 아이디와 동일합니다(대소문자 구분). 직원은 첫 로그인 때 개인 비밀번호로 반드시 변경해야 하며, 변경 전에는 업무를 이용할 수 없습니다.")} </p>

        </OrganizationDialog>
      )}
    </>
  )
}
