import SidebarLanguage from './components/SidebarLanguage'
import { useLanguage } from './use-language'
import { t as uiText } from './i18n.ts'
import FormLabel from './components/FormLabel'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'
import {
  readRememberedEmail,
  saveRememberedEmail,
  clearRememberedEmail,
} from './remembered-email'
const AdminWorkspace = lazy(() => import('./components/AdminWorkspace'))
const CompanyWorkspace = lazy(() => import('./components/workspace/CompanyWorkspace'))
import PasswordChangeGate from './components/PasswordChangeGate'
import PasswordInput from './components/PasswordInput'
import OrganizationDialog from './components/workspace/OrganizationDialog'
import AuthLayout from './components/AuthLayout'
import RegistrationAgreements from './components/RegistrationAgreements'
import LoginIdField from './components/workspace/LoginIdField'
import UserProfileMenu from './components/UserProfileMenu'
import {
  normalizeBusinessNumber,
  validBusinessNumber,
  validNewPassword,
} from './registration-validation'

import { createBrowserNavigation } from './browser-navigation'
import { pageTitle } from './page-title'
import { requestNavigation } from './navigation-guard'

function App() {
  const language = useLanguage()
  const [unavailableRegistrationLogin, setUnavailableRegistrationLogin] = useState<string>()
  const [registrationLoginAvailable, setRegistrationLoginAvailable] = useState(false)
  const [path, setPath] = useState(window.location.pathname)
  const [navigationRevision, setNavigationRevision] = useState(0)
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
  const [passwordHelp, setPasswordHelp] = useState(false)
  const navigation = useRef<ReturnType<typeof createBrowserNavigation> | null>(null)
  useLayoutEffect(() => {
    const router = createBrowserNavigation(next => { setPath(next); setNavigationRevision(value => value + 1); setError('') })
    navigation.current = router
    return () => { router.dispose(); if (navigation.current === router) navigation.current = null }
  }, [])
  const navigate = useCallback((to: string, options?: { replace?: boolean }) => { navigation.current?.navigate(to, options) }, [])
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

  useEffect(() => { document.title = pageTitle(route, session?.user.mustChangePassword) }, [route, session?.user.mustChangePassword, language])

  useEffect(() => {
    api<Session>('/api/auth/me')
      .then((current) => {
        setSession(current)
      })
      .catch((e: unknown) => {
        if (!(e instanceof ApiError && e.status === 401))
          setError('로그인 상태를 확인하지 못했습니다. 새로고침해 주세요.')
      })
      .finally(() => setLoading(false))
    api<{ status: string; database?: string }>('/api/health/db')
      .then((d) =>
        setHealth(
          d.status === 'connected' ? 'DB 연결 정상' : 'DB 연결 확인 필요',
        ),
      )
      .catch(() => setHealth('DB 연결 확인 필요'))
  }, [])

  useEffect(() => {
    if (!loading) navigation.current?.replace(route)
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
    if (register && !registrationLoginAvailable) { setError('로그인 아이디 중복 확인을 완료해 주세요.'); setBusy(false); return }
    if (register && values.password !== values.passwordConfirm) {
      setError('비밀번호 확인이 일치하지 않습니다.')
      setBusy(false)
      return
    }
    if (register) {
      if (values.termsConsent !== 'on' || values.privacyConsent !== 'on') {
        setError('서비스 이용약관과 개인정보 수집·이용 필수 항목에 동의해 주세요.')
        setBusy(false)
        return
      }
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
    delete values.termsConsent
    delete values.privacyConsent
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
      if (register && e instanceof ApiError && e.code === 'duplicate_login_id') { setRegistrationLoginAvailable(false); setUnavailableRegistrationLogin(values.loginId.trim()) }
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
  function logout(): Promise<void> {
    return new Promise(resolve => { requestNavigation(() => { void performLogout().finally(resolve) }, resolve) })
  }
  async function performLogout() {
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
      <Suspense fallback={<main className="app-recovery" role="status">{uiText("업무 화면을 불러오는 중…")}</main>}><CompanyWorkspace
        key={session.selectedTenantId || 'choose-company'}
        session={session}
        path={route}
        navigationRevision={navigationRevision}
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
      /></Suspense>
    )
  return (
    <div className={`shell${!session ? ` auth-shell ${register ? 'register-shell' : 'login-shell'}` : ''}`}>
      {session && <header>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            navigate(session ? home(session) : '/login')
          }}
        >
          <img className="auth-service-logo" src="/wms_logo.svg" alt="" width={36} height={36} />
          <span>{uiText("아이블 WMS")}</span>
        </a>
        <span className="header-caption">{uiText("기업을 연결하는 물류의 시작")}</span>
        {session && (
          <UserProfileMenu session={session} roleLabel={session.user.systemRole === 'IebleAdministrator' ? uiText("아이블 관리자") : uiText("기업 구성원")} busy={busy} onLogout={logout} />
        )}
      </header>}
      {loading ? (<main className="loading" aria-live="polite"> {uiText("로그인 상태를 확인하고 있습니다…")} </main>) : !session ? (<>
          <AuthLayout register={register}>
            {error && (
              <div className="alert error" role="alert">
                {uiText(error)}
                {duplicateCompany && register && (
                  <p>
                    <a
                      href="/login"
                      onClick={(e) => {
                        e.preventDefault()
                        navigate('/login')
                      }}
                    > {uiText("기존 기업 계정으로 로그인")} </a>
                  </p>
                )}
              </div>
            )}
            {notice && (
              <div className="alert success" role="status">
                {uiText(notice)}
              </div>
            )}
            <form key={route} onSubmit={submit}>
              <fieldset disabled={busy}>
                {register && (
                  <>
                    <label><FormLabel required>{uiText("기업명")}</FormLabel><input aria-label={uiText("기업명")}
                        name="companyName"
                        required
                        maxLength={200}
                        autoComplete="organization"
                        placeholder={uiText("주식회사 아이블")}
                      />
                    </label>
                    <label><FormLabel required>{uiText("사업자등록번호")}</FormLabel><input aria-label={uiText("사업자등록번호")}
                        name="businessRegistrationNumber"
                        required
                        maxLength={64}
                        inputMode="numeric"
                        placeholder="000-00-00000"
                        title={uiText("하이픈과 공백을 제외한 숫자 10자리")}
                      />
                      <small> {uiText("하이픈과 공백을 제외한 숫자 10자리를 입력해 주세요.")} </small>
                    </label>
                    <div className="form-grid">
                      <label><FormLabel required>{uiText("담당자 이름")}</FormLabel><input aria-label={uiText("담당자 이름")}
                          name="contactName"
                          required
                          maxLength={200}
                          autoComplete="name"
                          placeholder={uiText("홍길동")}
                        />
                      </label>
                      <label><FormLabel required>{uiText("연락처")}</FormLabel><input aria-label={uiText("연락처")}
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
                <label><FormLabel required>{register ? uiText("이메일") : uiText("아이디")}</FormLabel><input aria-label={uiText(register ? '이메일' : '아이디')}
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
                    placeholder={register ? "name@company.com" : uiText("아이디 또는 이메일")}
                  />
                </label>
                {register && <LoginIdField unavailableValue={unavailableRegistrationLogin} endpoint="/api/auth" onAvailable={setRegistrationLoginAvailable} />}
                <div className={register ? 'password-with-help' : undefined}>
                  <PasswordInput label={uiText("비밀번호")} key={register ? 'register-password' : 'login-password'}
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
                      register ? uiText("8자 이상 입력") : uiText("비밀번호를 입력하세요")
                    }
                  />
                  {register && (
                    <small> {uiText("8~128자, 영문 소문자, 숫자, 특수문자 (대문자 선택)를 포함해 주세요.")} </small>
                  )}
                </div>
                {register && (
                  <PasswordInput label={uiText("비밀번호 확인")}
                      name="passwordConfirm"
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      placeholder={uiText("비밀번호를 다시 입력하세요")}
                    />
                )}
                {register && (
                  <p className="signup-note"> {uiText("가입한 담당자가 기업 마스터가 됩니다. 가입 후 카드 등록 안내와 적용되는 이용 요금을 확인해 주세요. 현재 카드 등록·결제 연동은 준비 중입니다.")} </p>
                )}
                {register && <RegistrationAgreements />}
                {!register && (
                  <div className="login-options">
                   <div className="login-preferences">
                    <label>
                      <input
                        type="checkbox"
                        checked={rememberId}
                        onChange={(e) => {
                          setRememberId(e.target.checked)
                          if (!e.target.checked) clearRememberedEmail()
                        }}
                      /> {uiText("아이디 저장")} </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={autoLogin}
                        onChange={(e) => setAutoLogin(e.target.checked)}
                      /> {uiText("자동 로그인")} </label>
                   </div>
                   <button className="login-password-help" type="button" onClick={() => setPasswordHelp(true)}>{uiText("비밀번호를 잊으셨나요?")}</button>
                  </div>
                )}
                <button className="primary full" type="submit" disabled={busy || (register && !registrationLoginAvailable)}>
                  {busy ? uiText("처리 중…") : register ? uiText("기업 계정 만들기") : uiText("로그인")}
                </button>

              </fieldset>
            </form>
            <p className="switch-auth">
              {register ? uiText("이미 계정이 있으신가요?") : uiText("아이블 WMS가 처음이신가요?")}{' '}
              <a
                href={register ? '/login' : '/register'}
                onClick={(e) => {
                  e.preventDefault()
                  setNotice('')
                  navigate(register ? '/login' : '/register')
                }}
              >
                {register ? uiText("로그인") : uiText("회원가입")}
              </a>
            </p>
          </AuthLayout>
          {!register && passwordHelp && <OrganizationDialog title={uiText("비밀번호 찾기")} size="small" onClose={() => setPasswordHelp(false)}>
            <p>{uiText("구성원 계정은 기업 마스터 또는 권한 있는 관리자에게 비밀번호 초기화를 요청해 주세요.")}</p>
            <p>{uiText("기업 마스터 계정은 이 화면에서 직접 초기화할 수 없습니다.")}</p>
          </OrganizationDialog>}
        </>) : (<main className="workspace-layout">
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
                > {uiText("아이블 관리")} </button>
              )}
              <button
                className={route === '/app' ? 'nav-active' : ''}
                onClick={() => navigate('/app')}
              > {uiText("기업 워크스페이스")} </button>
            </nav>
            <div className="sidebar-foot">
              {session.user.email}
              <br />
              <small>
                {session.user.systemRole === 'IebleAdministrator' ? uiText("아이블 관리자") : uiText("기업 구성원")}
              </small>
            </div>
            <SidebarLanguage />
          </aside>
          <section className="workspace-content">
            {error && (
              <div className="alert error" role="alert">
                {uiText(error)}
              </div>
            )}
            {route === '/admin' ? (
              session.user.systemRole !== 'IebleAdministrator' ? (
                <div className="panel">
                  <h1>{uiText("접근 권한이 없습니다")}</h1>
                  <p>{uiText("아이블 관리자 전용 화면입니다.")}</p>
                  <button className="primary" onClick={() => navigate('/app')}> {uiText("기업 화면으로 이동")} </button>
                </div>
              ) : (
                <Suspense fallback={<p role="status">{uiText("관리자 화면을 불러오는 중…")}</p>}><AdminWorkspace /></Suspense>
              )
            ) : (
              <div className="panel">
                <h1>{uiText("페이지를 찾을 수 없습니다")}</h1>
                <button
                  className="primary"
                  onClick={() => navigate(home(session))}
                > {uiText("홈으로 이동")} </button>
              </div>
            )}
          </section>
        </main>)}
      {session && <footer>
        <span>© {new Date().getFullYear()} {uiText("아이블소프트(주)")}</span>
      </footer>}
    </div>
  )
}
export default App
