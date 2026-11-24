import LanguageSelect from './LanguageSelect'
import { t as uiText } from '../i18n.ts'
import type { ReactNode } from 'react'
import '../login.css'
import MobileRuntime from './mobile/MobileRuntime'

function AuthBrand({ visual = false }: { visual?: boolean }) {
  return <div className={visual ? 'login-image-brand' : 'auth-header-brand'} aria-label={uiText("아이블 WMS")}>
    <img src="/wms_logo.svg" alt="" width={36} height={36} />
    <span>{uiText("아이블 WMS")}</span>
  </div>
}

function AuthHeader() {
  return <header className="auth-header">
    <AuthBrand /><LanguageSelect />
  </header>
}

function LoginVisualPanel() {
  return <section className="login-image-panel" aria-label={uiText("아이블 WMS 소개")}>
    <img className="login-background" src="/login_bg.png" alt="" />
    <div className="login-image-overlay" aria-hidden="true" />
    <div className="login-image-content">
      <p className="login-image-copy">{uiText("복잡한 창고 관리,")}<br />{uiText("더 간단하게.")}</p>
      <span className="login-image-divider" aria-hidden="true" />
      <AuthBrand visual />
    </div>
  </section>
}

export default function AuthLayout({ register, children }: { register: boolean; children: ReactNode }) {
  return <>
    <AuthHeader />
    <main className={`auth-layout login-layout${register ? ' auth-register' : ''}`}>
      <LoginVisualPanel />
      <section className="auth-card" aria-label={register ? uiText("기업 회원가입") : uiText("로그인")}>
        <h1 className="auth-form-title">{register ? uiText("기업 회원가입") : uiText("로그인")}</h1>
        {children}
        <footer className="login-copyright">© {new Date().getFullYear()} {uiText("아이블소프트(주)")}</footer>
      </section>
    </main>
    <MobileRuntime />
  </>
}
