import { findWorkspacePage, isRegistrationPath, workspaceDetailId } from './components/workspace/navigation.ts'
export const serviceName = '아이블 WMS'
export function pageTitle(path: string, mustChangePassword = false) {
  if (mustChangePassword) return `${serviceName} · 비밀번호 변경`
  let label = path === '/register' ? '회원가입' : path === '/login' || path === '/' ? '로그인' : path.startsWith('/admin') ? '아이블 관리자' : ''
  const page = findWorkspacePage(path)
  if (page) label = page.label + (isRegistrationPath(path) ? ' · 등록' : workspaceDetailId(path) ? ' · 상세' : '')
  return `${serviceName} · ${label || '페이지 확인'}`
}
