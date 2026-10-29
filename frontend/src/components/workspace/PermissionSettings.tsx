import { useEffect, useState } from 'react'
import { api, ApiError } from '../../api'
import { PageHeading } from './WorkspaceUI'

type Grants = Record<string, Record<string, string[]>>
type Settings = {
  version: string
  roles: Grants
  defaults: Grants
  features: { key: string; label: string; actions: string[] }[]
}
const roleLabels: Record<string, string> = { Administrator: '기업 관리자', Employee: '일반 직원' }
const actionLabels: Record<string, string> = {
  menu: '메뉴 접근', read: '조회', create: '등록', update: '수정', delete: '삭제',
  confirm: '입출고 확정', move: '재고 이동', adjust: '재고 조정', count: '실사 수행', manageUsers: '사용자 관리',
}
const actions = Object.keys(actionLabels)
export default function PermissionSettings({ tenantId }: { tenantId: string }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Grants>({})
  const [role, setRole] = useState('Administrator')
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const [stale, setStale] = useState(false)
  useEffect(() => {
    let live = true
    api<Settings>(`/api/tenants/${tenantId}/permissions`).then(data => {
      if (live) { setSettings(data); setDraft(data.roles); setError(''); setStale(false); setReview(false) }
    }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : '권한을 불러오지 못했습니다.') })
    return () => { live = false }
  }, [tenantId, reload])
  const changes = settings ? Object.keys(roleLabels).flatMap(r => settings.features.flatMap(f => f.actions.flatMap(a => {
    const before = settings.roles[r][f.key].includes(a)
    const after = draft[r]?.[f.key]?.includes(a) ?? false
    return before === after ? [] : [{ key: `${r}:${f.key}:${a}`, label: `${roleLabels[r]} · ${f.label} · ${actionLabels[a]}`, before, after }]
  }))) : []
  function toggle(feature: string, action: string, checked: boolean) {
    setReview(false); setNotice('')
    setDraft(previous => {
      const selected = new Set(previous[role][feature])
      if (checked) {
        selected.add(action); selected.add('menu'); selected.add('read')
        if (feature === 'users' && action !== 'menu' && action !== 'read') selected.add('manageUsers')
      } else if (action === 'menu' || action === 'read') selected.clear()
      else if (action === 'manageUsers') { for (const a of selected) if (a !== 'menu' && a !== 'read') selected.delete(a) }
      else selected.delete(action)
      return { ...previous, [role]: { ...previous[role], [feature]: [...selected] } }
    })
  }
  async function save() {
    if (!settings || !review || !changes.length) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api<{ version: string; roles: Grants }>(`/api/tenants/${tenantId}/permissions`, { version: settings.version, roles: draft })
      setSettings({ ...settings, ...result }); setDraft(result.roles); setReview(false)
      setNotice('권한 설정을 저장했습니다. 로그인 중인 사용자도 다음 요청부터 적용됩니다.')
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
      if (e instanceof ApiError && e.status === 409) { setStale(true); setReview(false) }
    } finally { setBusy(false) }
  }
  return <>
    <PageHeading title="권한 설정" description="기업 관리자와 일반 직원의 기능별 접근 권한을 관리하세요." />
    <section className="wms-card permission-settings">
      <p className="wms-note">기업 마스터는 모든 권한을 유지합니다. 마스터 관리 권한은 위임할 수 없습니다. 물류 등록·수정 등 준비 중인 기능은 제공될 때 설정에 따라 접근이 제한됩니다.</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert success" role="status">{notice}</div>}
      {!settings ? <><p role="status">권한 설정을 불러오는 중입니다.</p>{error && <button className="secondary" onClick={() => setReload(x => x + 1)}>다시 불러오기</button>}</> : <>
        <div className="permission-toolbar">
          <div className="permission-roles" role="group" aria-label="설정할 권한">
            {Object.entries(roleLabels).map(([key, label]) => <button key={key} className={role === key ? 'primary' : 'secondary'} aria-pressed={role === key} onClick={() => setRole(key)}>{label}</button>)}
          </div>
          <button className="secondary" disabled={busy} onClick={() => { setDraft(settings.defaults); setReview(false); setNotice('두 역할을 안전한 기본값으로 복원했습니다. 변경사항을 확인한 뒤 저장해야 적용됩니다.') }}>안전한 기본값 복원</button>
        </div>
        <div className="wms-table-scroll">
          <table className="wms-table permission-table">
            <caption>{roleLabels[role]} 기능별 권한</caption>
            <thead><tr><th scope="col">기능</th>{actions.map(a => <th key={a} scope="col">{actionLabels[a]}</th>)}</tr></thead>
            <tbody>{settings.features.map(f => <tr key={f.key}><th scope="row">{f.label}</th>{actions.map(a => <td key={a}>{f.actions.includes(a) ? <input type="checkbox" checked={draft[role][f.key].includes(a)} disabled={busy || stale || (role === 'Employee' && f.key === 'organization-items')} onChange={e => toggle(f.key, a, e.target.checked)} aria-label={`${roleLabels[role]} ${f.label} ${actionLabels[a]}`} /> : <span aria-label="해당 없음">—</span>}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <p className="permission-help">기능 권한을 켜면 메뉴·조회도 허용됩니다. 메뉴나 조회를 끄면 해당 기능의 모든 권한이 해제됩니다. 기존 기능의 기본값은 관리자 전체 허용, 직원 업무 조회 허용입니다. 조직도·항목 관리는 마스터가 별도로 허용하며, 일반 직원에게는 조직도 조회만 부여할 수 있습니다.</p>
        {review && <section className="permission-review" aria-label="저장 전 변경사항 확인">
          <h2>변경사항 확인 ({changes.length}건)</h2>
          <ul>{changes.map(change => <li key={change.key}>{change.label}: {change.before ? '허용' : '차단'} → <strong>{change.after ? '허용' : '차단'}</strong></li>)}</ul>
          <p>현재 기업에만 적용하며 변경자·일시·변경 전후 값이 감사 로그에 기록됩니다.</p>
        </section>}
        <div className="permission-toolbar">
          <span aria-live="polite">저장하지 않은 변경 {changes.length}건</span>
          <div className="permission-roles">
            <button className="secondary" disabled={busy} onClick={() => { if (!changes.length || window.confirm('저장하지 않은 변경을 버리고 최신 설정을 불러오시겠습니까?')) setReload(x => x + 1) }}>최신 설정 다시 불러오기</button>
            {review ? <><button className="secondary" disabled={busy} onClick={() => setReview(false)}>계속 수정</button><button className="primary" disabled={busy || stale || !changes.length} onClick={save}>{busy ? '저장 중…' : '확인 후 저장'}</button></> : <button className="primary" disabled={busy || stale || !changes.length} onClick={() => setReview(true)}>변경사항 확인</button>}
          </div>
        </div>
      </>}
    </section>
  </>
}
