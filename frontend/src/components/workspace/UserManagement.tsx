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
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    status: 'all',
    page: 1,
  })
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
  const saving = useRef(false)
  const [pending, setPending] = useState<{ values: Record<string, string>; assignment: { departmentId: string | null; positionId: string | null }; active: boolean; selectedRole: string; confirmation: string } | null>(null)
  const endpoint = `/api/tenants/${tenantId}/users`
  const query = new URLSearchParams({
    ...filters,
    page: String(filters.page),
    pageSize: '20',
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
    setEditing(value)
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || busy || pending) return
    const values = formValues(event.currentTarget)
    if (editing !== 'create' && editing.role === 'Master')
      values.name = editing.name
    const assignment = {
      departmentId: values.departmentId || null,
      positionId: values.positionId || null,
    }
    if (!String(values.name).trim()) {
      setError('직원 이름을 입력해 주세요.')
      return
    }
    const active =
      editing === 'create' || editing.userId === currentUserId
        ? editing === 'create' || editing.membershipIsActive
        : values.isActive === 'on'
    const selectedRole =
      values.role || (editing === 'create' ? 'Employee' : editing.role)
    const confirmation =
      editing === 'create'
        ? `${values.name.trim()}님을 ${roles[selectedRole]}로 등록하시겠습니까? 첫 로그인 시 비밀번호 변경이 필요합니다.`
        : editing.membershipIsActive && !active
          ? `${values.name.trim()}님을 비활성화하시겠습니까? 해당 기업의 로그인·API 접근이 차단됩니다. 과거 이력은 유지되며 과금 종료일은 변경하지 않습니다.`
          : `${values.name.trim()}님의 정보를 저장하시겠습니까? 시스템 권한: ${roles[editing.role]} → ${roles[selectedRole]}, 소속 상태: ${active ? '활성' : '비활성'}`
    setPending({ values, assignment, active, selectedRole, confirmation })
  }
  async function commitSave() {
    if (!pending || !editing || saving.current) return
    saving.current = true
    const { values, assignment, active, selectedRole } = pending
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (editing === 'create') {
        const result = await api<EmployeeCredentialResult>(endpoint, {
          ...values,
          ...assignment,
        })
        setRegistrationResult(result)
        setEditing(null)
      } else {
        if (editing.role === 'Master')
          await api(`${endpoint}/${editing.userId}/organization`, {
            ...assignment,
            version: editing.version,
          })
        else
          await api(`${endpoint}/${editing.userId}`, {
            ...assignment,
            name: values.name,
            role: selectedRole,
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
        `${user.name}님의 비밀번호를 초기화하시겠습니까? 로그인 아이디와 같은 초기 비밀번호로 설정됩니다. 기존 로그인은 해제되고 개인 비밀번호 변경이 필요합니다.`,
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
  const data = current?.data
  return (
    <>
      <PageHeading
        title="사용자 관리"
        description="소속 직원의 계정과 권한, 활성 상태를 관리하세요."
      />
      {isMaster && <div className="organization-toolbar"><p className="organization-help">기업 관리자는 시스템 접근 권한입니다. 부서·직급과 별개로 여러 명을 지정할 수 있습니다.</p><button className="secondary" disabled={busy} onClick={() => setTransferring(true)}>마스터 위임</button></div>}
      {transferring && isMaster && <MasterTransferDialog tenantId={tenantId} onClose={() => setTransferring(false)} onTransferred={async () => { setNotice('마스터 위임이 완료되었습니다.'); setRevision(x => x + 1); await onAccessChanged() }} />}
      <section className="wms-card organization-card">
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
          <form
            className="organization-filters"
            onSubmit={(e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              setFilters((f) => ({
                ...f,
                search: String(form.get('search') || '').trim(),
                page: 1,
              }))
            }}
          >
            <label>
              사용자 검색
              <input
                name="search"
                maxLength={100}
                placeholder="이름, 아이디, 이메일"
              />
            </label>
            <button className="secondary" type="submit">
              검색
            </button>
            <label>
              권한 필터
              <select
                aria-label="권한 필터"
                value={filters.role}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, role: e.target.value, page: 1 }))
                }
              >
                <option value="">전체 권한</option>
                {Object.entries(roles).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              상태 필터
              <select
                aria-label="상태 필터"
                value={filters.status}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))
                }
              >
                <option value="all">전체 상태</option>
                <option value="active">활성</option>
                <option value="inactive">비활성</option>
              </select>
            </label>
          </form>
          {canCreate && (
            <button
              className="primary"
              disabled={busy || !options}
              onClick={() => openEditor('create')}
            >
              직원 등록
            </button>
          )}
        </div>
        {!current ? (
          <p role="status">사용자 목록을 불러오는 중입니다.</p>
        ) : current.error ? (
          <div className="alert error" role="alert">
            {current.error}
          </div>
        ) : (
          data && (
            <>
              <p aria-live="polite">검색 결과 {data.total}명</p>
              <div className="wms-table-scroll">
                <table className="wms-table organization-user-table">
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>로그인 아이디 / 이메일</th>
                      <th>부서</th>
                      <th>직급</th>
                      <th>접근 권한</th>
                      <th>상태</th>
                      <th>등록일</th>
                      <th>최근 로그인</th>
                      <th>과금 시작일 (서울)</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.length === 0 ? (
                      <tr>
                        <td colSpan={10}>조건에 맞는 사용자가 없습니다.</td>
                      </tr>
                    ) : (
                      data.items.map((user) => (
                        <tr key={user.userId}>
                          <td>{user.name}</td>
                          <td>
                            {user.loginId}
                            <br />
                            <small>{user.email}</small>
                          </td>
                          <td>{user.departmentName || '미지정'}</td>
                          <td>{user.positionName || '미지정'}</td>
                          <td>{roles[user.role]}</td>
                          <td>
                            <span
                              className={`badge ${user.isActive ? 'active' : ''}`}
                            >
                              {user.isActive ? '활성' : '비활성'}
                            </span>
                            {user.mustChangePassword && (
                              <small className="organization-password-required">
                                비밀번호 변경 필요
                              </small>
                            )}
                          </td>
                          <td>
                            {new Date(user.registeredAt).toLocaleDateString(
                              'ko-KR',
                            )}
                          </td>
                          <td>
                            {user.lastLoginAt
                              ? new Date(user.lastLoginAt).toLocaleString(
                                  'ko-KR',
                                )
                              : '미수집'}
                          </td>
                          <td>{new Date(user.billingStartsAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</td>
                          <td>
                            {user.role === 'Master' ? (
                              <>
                                <span>마스터 보호</span>
                                {user.userId === currentUserId && canUpdate && (
                                  <button
                                    className="secondary"
                                    disabled={busy || !options}
                                    onClick={() => openEditor(user)}
                                  >
                                    부서·직급 설정
                                  </button>
                                )}
                              </>
                            ) : canUpdate ? (
                              <div className="organization-row-actions">
                                <button
                                  className="secondary"
                                  disabled={busy || !options}
                                  onClick={() => openEditor(user)}
                                  aria-label={`${user.name} 수정`}
                                >
                                  수정
                                </button>
                                {user.userId !== currentUserId &&
                                  user.isActive && (
                                    <button
                                      className="text-button"
                                      disabled={busy}
                                      onClick={() => resetPassword(user)}
                                      aria-label={`${user.name} 비밀번호 초기화`}
                                    >
                                      비밀번호 초기화
                                    </button>
                                  )}
                              </div>
                            ) : (
                              '조회 전용'
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                label="사용자 목록 페이지"
                page={filters.page}
                pageSize={data.pageSize}
                total={data.total}
                disabled={busy}
                onChange={(page) => setFilters((f) => ({ ...f, page }))}
              />
              <p className="organization-help">
                사용자당 월 {data.monthlyPerUserKrw.toLocaleString('ko-KR')}원 ·
                기업 마스터 포함. 직원 등록 월은 무료이며 다음 달부터 도래하는 기업 정기결제일부터 과금
                대상입니다. 비활성화에 따른 과금 종료 규칙은 미정이며 실제
                결제·청구는 실행하지 않습니다.
              </p>
            </>
          )
        )}
        <button
          className="text-button"
          disabled={busy}
          onClick={() => setRevision((x) => x + 1)}
        >
          사용자 목록 새로고침
        </button>
      </section>
      {editing && (
        <OrganizationDialog
          title={editing === 'create' ? '직원 등록' : '사용자 정보 수정'}
          busy={busy}
          onClose={() => {
            if (pending) setPending(null)
            else setEditing(null)
            setError('')
          }}
        >
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {pending && <section role="alertdialog" aria-label="사용자 변경 확인"><p>{pending.confirmation}</p><button type="button" className="secondary" disabled={busy} onClick={() => setPending(null)}>취소</button>{' '}<button type="button" className="primary" disabled={busy} onClick={commitSave}>확인</button></section>}
          <form onSubmit={save} hidden={!!pending}>
            <fieldset disabled={busy}>
              <label>
                직원 이름
                <input
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={editing === 'create' ? '' : editing.name}
                  disabled={editing !== 'create' && editing.role === 'Master'}
                  autoFocus
                />
              </label>
              {editing === 'create' && (
                <>
                  <label>
                    로그인 아이디
                    <input
                      name="loginId"
                      required
                      minLength={3}
                      maxLength={64}
                      pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,63}"
                      autoComplete="off"
                      aria-describedby="employee-login-id-help"
                    />
                  </label>
                  <small id="employee-login-id-help">
                    영문·숫자로 시작하는 3~64자. 영문, 숫자, 점, 밑줄, 하이픈을
                    사용할 수 있습니다.
                  </small>
                  <label>
                    이메일
                    <input
                      name="email"
                      type="email"
                      required
                      maxLength={256}
                      autoComplete="off"
                    />
                  </label>
                </>
              )}
              <label>
                권한
                <select
                  name="role"
                  aria-label="권한"
                  defaultValue={
                    editing === 'create' ? 'Employee' : editing.role
                  }
                  disabled={
                    !isMaster || (editing !== 'create' && editing.userId === currentUserId)
                  }
                >
                  {editing !== 'create' && editing.role === 'Master' && (
                    <option value="Master">기업 마스터</option>
                  )}
                  <option value="Employee">일반 직원</option>
                  <option value="Administrator">기업 관리자</option>
                </select>
              </label>
              <label>
                부서
                <select
                  name="departmentId"
                  defaultValue={
                    editing === 'create' ? '' : editing.departmentId || ''
                  }
                >
                  <option value="">부서 미지정</option>
                  {options?.departments
                    .filter(
                      (x) =>
                        x.isActive ||
                        (editing !== 'create' && editing.departmentId === x.id),
                    )
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                        {x.isActive ? '' : ' (사용 중지)'}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                직급
                <select
                  name="positionId"
                  defaultValue={
                    editing === 'create' ? '' : editing.positionId || ''
                  }
                >
                  <option value="">직급 미지정</option>
                  {options?.positions
                    .filter(
                      (x) =>
                        x.isActive ||
                        (editing !== 'create' && editing.positionId === x.id),
                    )
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                        {x.isActive ? '' : ' (사용 중지)'}
                      </option>
                    ))}
                </select>
              </label>
              <p className="organization-help">
                직급은 조직 내 직함이며 시스템 접근 권한과 별개입니다.
              </p>
              {editing !== 'create' && (
                <label className="organization-checkbox">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={editing.membershipIsActive}
                    disabled={editing.userId === currentUserId}
                  />
                  기업 소속 활성 상태
                </label>
              )}
              <p className="organization-help">
                {editing === 'create'
                  ? '초기 비밀번호는 등록한 로그인 아이디와 동일하게 자동 설정됩니다(대소문자 구분). 직원은 첫 로그인 때 개인 비밀번호로 변경해야 합니다.'
                  : '비활성화하면 해당 기업 접근이 차단됩니다. 과거 이력과 다른 기업 소속은 유지합니다.'}
              </p>
              <button className="primary full" type="submit">
                {busy
                  ? '저장 중…'
                  : editing === 'create'
                    ? '계정 생성'
                    : '사용자 정보 저장'}
              </button>
            </fieldset>
          </form>
        </OrganizationDialog>
      )}
      {registrationResult && (
        <OrganizationDialog
          title="초기 비밀번호 설정 완료"
          onClose={() => {
            setRegistrationResult(null)
            setNotice(
              '초기 비밀번호는 로그인 아이디와 같습니다. 직원은 첫 로그인 때 개인 비밀번호로 변경해야 합니다.',
            )
          }}
        >
          <p>
            {registrationResult.user.name} · 로그인 아이디{' '}
            <strong>{registrationResult.user.loginId}</strong>
          </p>
          <p>
            초기 비밀번호는 위 로그인 아이디와 동일합니다(대소문자 구분). 직원은
            첫 로그인 때 개인 비밀번호로 반드시 변경해야 하며, 변경 전에는
            업무를 이용할 수 없습니다.
          </p>
          <button
            className="primary full"
            onClick={() => {
              setRegistrationResult(null)
              setNotice(
                '계정 설정을 완료했습니다. 초기 비밀번호는 로그인 아이디와 동일하며 첫 로그인 때 변경해야 합니다.',
              )
            }}
          >
            확인하고 닫기
          </button>
        </OrganizationDialog>
      )}
    </>
  )
}
