import { t as uiText } from '../i18n.ts'
import { Component } from 'react'
import type { ReactNode } from 'react'

export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="app-recovery" role="alert"><h1>{uiText("화면을 불러오지 못했습니다.")}</h1><p>{uiText("연결 상태를 확인한 후 다시 열어 주세요. 문제가 계속되면 관리자에게 문의해 주세요.")}</p><button className="primary" onClick={() => window.location.reload()}>{uiText("화면 다시 열기")}</button></main>
  }
}
