import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'
import {
  readRememberedEmail,
  saveRememberedEmail,
  clearRememberedEmail,
} from './remembered-email'
import BillingFeedbackAdmin from './components/BillingFeedbackAdmin'
import AdminTenants from './components/AdminTenants'
import CompanyWorkspace from './components/workspace/CompanyWorkspace'
import PasswordChangeGate from './components/PasswordChangeGate'
import PasswordInput from './components/PasswordInput'
import UserProfileMenu from './components/UserProfileMenu'
import {
  normalizeBusinessNumber,
  validBusinessNumber,
  validNewPassword,
} from './registration-validation'

function App() {
  const [path, setPath] = useState(window.location.pathname)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [health, setHealth] = useState('연결 확인 중')
  const [duplicateCompany, setDuplicateCompany] = useState(false)
  const [savedLogin] = useState(() => readRememberedEmail())
  const [loginEmail, setLoginEmail] = useState(savedLogin.email)
  const [rememberId, setRememberId] = useState(savedLogin.remember)
  const [autoLogin, setAutoLogin] = useState(false)
  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to)
    setPath(to)
    setError('')
  }, [])
  const refresh = useCallback(async () => {
    const current = await api<Session>('/api/auth/me')
    setSession(current)
    return current
  }, [])
  const home = (current: Session) =>
    current.user.systemRole === 'IebleAdministrator' ? '/admin' : '/app'

  const route = loading
    ? path
    : !session
      ? path === '/register'
        ? '/register'
        : '/login'
      : ['/', '/login', '/register'].includes(path)
        ? home(session)
        : path === '/app/settings/billing'
          ? '/app/master/billing'
          : path

  useEffect(() => {
    const pop = () => {
      setPath(window.location.pathname)
      setError('')
    }
    window.addEventListener('popstate', pop)
    api<Session>('/api/auth/me')
      .then((current) => {
        setSession(current)
      })
      .catch((e: unknown) => {
        if (!(e instanceof ApiError && e.status === 401))
          setError('로그인 상태를 확인하지 못했습니다. 새로고침해 주세요.')
      })
      .finally(() => setLoading(false))
    api<{ status: string; database: string }>('/api/health/db')
      .then((d) =>
        setHealth(
          d.status === 'connected' ? 'DB 연결 정상' : 'DB 연결 확인 필요',
        ),
      )
      .catch(() => setHealth('DB 연결 확인 필요'))
    return () => window.removeEventListener('popstate', pop)
  }, [])

  useEffect(() => {
    if (!loading) window.history.replaceState({}, '', route)
  }, [route, loading])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const register = route === '/register'
    const values: Record<string, string> = {}
    form.forEach((value, key) => {
      values[key] = String(value)
    })
    if (register && values.password !== values.passwordConfirm) {
      setError('비밀번호 확인이 일치하지 않습니다.')
      setBusy(false)
      return
    }
    if (register) {
      values.companyName = values.companyName.trim()
      if (
        !values.companyName ||
        !validBusinessNumber(values.businessRegistrationNumber)
      ) {
        setError('기업명과 사업자등록번호 10자리를 확인해 주세요.')
        setBusy(false)
        return
      }
      if (values.password.length < 8) {
        setError('비밀번호는 최소 8자 이상 입력해 주세요.')
        setBusy(false)
        return
      }
      if (!validNewPassword(values.password)) {
        setError(
          '비밀번호는 8~128자이며 영문 소문자, 숫자, 특수문자를 포함해야 합니다.',
        )
        setBusy(false)
        return
      }
      values.businessRegistrationNumber = normalizeBusinessNumber(
        values.businessRegistrationNumber,
      )
    }
    setDuplicateCompany(false)
    delete values.passwordConfirm
    try {
      await api(
        register ? '/api/auth/register' : '/api/auth/login',
        register ? values : { ...values, rememberMe: autoLogin },
      )
      if (register) {
        navigate('/login')
        setNotice(
          '기업 가입이 완료되었습니다. 로그인하여 활성화 상태를 확인해 주세요.',
        )
      } else {
        saveRememberedEmail(values.email, rememberId)
        setAutoLogin(false)
        const current = await refresh()
        navigate(home(current))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결에 실패했습니다.')
      setDuplicateCompany(
        e instanceof ApiError && e.code === 'duplicate_company',
      )
    } finally {
      setBusy(false)
    }
  }
  function restoreLoginPreferences() {
    const saved = readRememberedEmail()
    setLoginEmail(saved.email)
    setRememberId(saved.remember)
    setAutoLogin(false)
  }
  async function logout() {
    setBusy(true)
    setError('')
    try {
      await api('/api/auth/logout', {})
      setSession(null)
      restoreLoginPreferences()
      setNotice('모든 기기에서 로그아웃되었습니다.')
      navigate('/login')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setSession(null)
        restoreLoginPreferences()
        navigate('/login')
      } else
        setError(e instanceof Error ? e.message : '로그아웃에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }
  const register = route === '/register'
  if (!loading && session?.user.mustChangePassword)
    return <PasswordChangeGate name={session.user.displayName} loginId={session.user.userName} onChanged={refresh} onLogout={logout} />
  if (
    !loading &&
    session &&
    (route === '/app' || route.startsWith('/app/')) &&
    session.user.systemRole !== 'IebleAdministrator'
  )
    return (
      <CompanyWorkspace
        session={session}
        path={route}
        onNavigate={navigate}
        onLogout={logout}
        busy={busy}
        error={error}
        health={health}
        onResolved={refresh}
        onExpired={() => {
          setSession(null)
          restoreLoginPreferences()
          navigate('/login')
        }}
      />
    )
  return (
    <div className="shell">
      <header>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            navigate(session ? home(session) : '/login')
          }}
        >
          <span className="brand-mark">i</span> IEBLE{' '}
          <span className="brand-sub">WMS</span>
        </a>
        <span className="header-caption">기업을 연결하는 물류의 시작</span>
        {session && (
          <UserProfileMenu session={session} roleLabel={session.user.systemRole === 'IebleAdministrator' ? '아이블 관리자' : '기업 구성원'} busy={busy} onLogout={logout} />
        )}
      </header>
      {loading ? (
        <main className="loading" aria-live="polite">
          로그인 상태를 확인하고 있습니다…
        </main>
      ) : !session ? (
        <main className={`auth-layout ${register ? 'registration' : ''}`}>
          <section className="intro">
            <span className="eyebrow">YOUR OPERATIONS, CONNECTED</span>
            <h1>
              흐름을 잇고,
              <br />
              업무를 가볍게.
            </h1>
            <p>
              기업과 구성원이 함께하는
              <br />
              아이블 물류 관리 워크스페이스
            </p>
            <div className="flow" aria-hidden="true">
              <div>
                입고 <span>01</span>
              </div>
              <div>
                재고 <span>02</span>
              </div>
              <div>
                출고 <span>03</span>
              </div>
            </div>
            <div className="intro-bottom">
              <span className="dot" /> 하나의 계정으로 여러 기업을 관리하세요.
            </div>
          </section>
          <section className="auth-card">
            <div className="card-heading">
              <span className="eyebrow">
                {register ? 'CREATE YOUR WORKSPACE' : 'WELCOME BACK'}
              </span>
              <h2>{register ? '기업 회원가입' : '로그인'}</h2>
              <p>
                {register
                  ? '기업 정보를 등록하고 마스터 계정을 만드세요.'
                  : '아이블 계정으로 업무를 시작하세요.'}
              </p>
            </div>
            {error && (
              <div className="alert error" role="alert">
                {error}
                {duplicateCompany && register && (
                  <p>
                    <a
                      href="/login"
                      onClick={(e) => {
                        e.preventDefault()
                        navigate('/login')
                      }}
                    >
                      기존 기업 계정으로 로그인
                    </a>
                  </p>
                )}
              </div>
            )}
            {notice && (
              <div className="alert success" role="status">
                {notice}
              </div>
            )}
            <form key={route} onSubmit={submit}>
              <fieldset disabled={busy}>
                {register && (
                  <>
                    <label>
                      기업명
                      <input
                        name="companyName"
                        required
                        maxLength={200}
                        autoComplete="organization"
                        placeholder="주식회사 아이블"
                      />
                    </label>
                    <label>
                      사업자등록번호
                      <input
                        name="businessRegistrationNumber"
                        required
                        maxLength={64}
                        inputMode="numeric"
                        placeholder="000-00-00000"
                        title="하이픈과 공백을 제외한 숫자 10자리"
                      />
                      <small>
                        하이픈과 공백을 제외한 숫자 10자리를 입력해 주세요.
                      </small>
                    </label>
                    <div className="form-grid">
                      <label>
                        담당자 이름
                        <input
                          name="contactName"
                          required
                          maxLength={200}
                          autoComplete="name"
                          placeholder="홍길동"
                        />
                      </label>
                      <label>
                        연락처
                        <input
                          name="contactPhone"
                          type="tel"
                          required
                          pattern="\+?[0-9][0-9 \-]{7,18}[0-9]"
                          maxLength={20}
                          autoComplete="tel"
                          placeholder="010-0000-0000"
                        />
                      </label>
                    </div>
                  </>
                )}
                <label>
                  {register ? '이메일' : '로그인 아이디 또는 이메일'}
                  <input
                    name="email"
                    value={register ? undefined : loginEmail}
                    onChange={
                      register
                        ? undefined
                        : (e) => setLoginEmail(e.target.value)
                    }
                    type={register ? "email" : "text"}
                    required
                    maxLength={256}
                    autoComplete="username"
                    placeholder={register ? "name@company.com" : "직원 아이디 또는 이메일"}
                  />
                </label>
                <div className={register ? 'password-with-help' : undefined}>
                  <PasswordInput label="비밀번호" key={register ? 'register-password' : 'login-password'}
                    name="password"
                    pattern={
                      register
                        ? '(?=.*[a-z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{8,128}'
                        : undefined
                    }
                    required
                    minLength={register ? 8 : undefined}
                    maxLength={128}
                    autoComplete={
                      register ? 'new-password' : 'current-password'
                    }
                    placeholder={
                      register ? '8자 이상 입력' : '비밀번호를 입력하세요'
                    }
                  />
                  {register && (
                    <small>
                      8~128자, 영문 소문자, 숫자, 특수문자 (대문자 선택)를
                      포함해 주세요.
                    </small>
                  )}
                </div>
                {register && (
                  <PasswordInput label="비밀번호 확인"
                      name="passwordConfirm"
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      placeholder="비밀번호를 다시 입력하세요"
                    />
                )}
                {register && (
                  <p className="signup-note">
                    가입한 담당자가 기업 마스터가 됩니다. 가입 후 카드 등록
                    안내와 적용되는 이용 요금을 확인해 주세요. 현재 카드
                    등록·결제 연동은 준비 중입니다.
                  </p>
                )}
                <button className="primary full" type="submit">
                  {busy ? '처리 중…' : register ? '기업 계정 만들기' : '로그인'}
                  <span aria-hidden="true">→</span>
                </button>
                {!register && (
                  <div className="login-preferences">
                    <label>
                      <input
                        type="checkbox"
                        checked={rememberId}
                        onChange={(e) => {
                          setRememberId(e.target.checked)
                          if (!e.target.checked) clearRememberedEmail()
                        }}
                      />
                      아이디 저장
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={autoLogin}
                        onChange={(e) => setAutoLogin(e.target.checked)}
                      />
                      자동 로그인
                    </label>
                  </div>
                )}
              </fieldset>
            </form>
            <p className="switch-auth">
              {register
                ? '이미 아이블 계정이 있으신가요?'
                : '아이블이 처음이신가요?'}{' '}
              <a
                href={register ? '/login' : '/register'}
                onClick={(e) => {
                  e.preventDefault()
                  setNotice('')
                  navigate(register ? '/login' : '/register')
                }}
              >
                {register ? '로그인' : '기업 회원가입'}
              </a>
            </p>
          </section>
        </main>
      ) : (
        <main className="workspace-layout">
          <aside>
            <span className="eyebrow">WORKSPACE</span>
            <strong>
              {
                session.memberships.find(
                  (m) => m.tenantId === session.selectedTenantId,
                )?.name
              }
            </strong>
            <nav>
              {session.user.systemRole === 'IebleAdministrator' && (
                <button
                  className={route === '/admin' ? 'nav-active' : ''}
                  onClick={() => navigate('/admin')}
                >
                  아이블 관리
                </button>
              )}
              <button
                className={route === '/app' ? 'nav-active' : ''}
                onClick={() => navigate('/app')}
              >
                기업 워크스페이스
              </button>
            </nav>
            <div className="sidebar-foot">
              {session.user.email}
              <br />
              <small>
                {session.user.systemRole === 'IebleAdministrator'
                  ? '아이블 관리자'
                  : '기업 구성원'}
              </small>
            </div>
          </aside>
          <section className="workspace-content">
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            {route === '/admin' ? (
              session.user.systemRole !== 'IebleAdministrator' ? (
                <div className="panel">
                  <h1>접근 권한이 없습니다</h1>
                  <p>아이블 관리자 전용 화면입니다.</p>
                  <button className="primary" onClick={() => navigate('/app')}>
                    기업 화면으로 이동
                  </button>
                </div>
              ) : (
                <><AdminTenants /><BillingFeedbackAdmin /></>
              )
            ) : (
              <div className="panel">
                <h1>페이지를 찾을 수 없습니다</h1>
                <button
                  className="primary"
                  onClick={() => navigate(home(session))}
                >
                  홈으로 이동
                </button>
              </div>
            )}
          </section>
        </main>
      )}
      <footer>
        <span>© {new Date().getFullYear()} IEBLE. All rights reserved.</span>
        <span className="health">
          <span className="dot" />
          {health}
        </span>
      </footer>
    </div>
  )
}
export default App
