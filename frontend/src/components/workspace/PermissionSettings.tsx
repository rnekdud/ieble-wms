import { t as uiText } from '../../i18n.ts'
import './permission-settings-layout.css'
import PermissionGradeChoice from './PermissionGradeChoice'
import type { PermissionGrade } from './PermissionGradeChoice'
import PermissionMatrix from './PermissionMatrix'
import CollaboratorPermissions from './CollaboratorPermissions'
import { requestNavigation } from '../../navigation-guard'
import UserPermissionAccess from './UserPermissionAccess'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, ApiError } from '../../api'
import { notifyAccessChanged } from '../../access-events'
import OrganizationDialog from './OrganizationDialog'
import { PageHeading } from './WorkspaceUI'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import UnsavedChangesDialog from './UnsavedChangesDialog'

type Grants = Record<string, Record<string, string[]>>
type Settings = {
  grades?: PermissionGrade[]
  version: string
  roles: Grants
  defaults: Grants
  features: { key: string; label: string; actions: string[]; roleActions: Record<string, string[]>; implementedActions: string[] }[]
}
const defaultLabels: Record<string, string> = { Administrator: '기업 관리자', Employee: '일반 직원' }
const actionLabels: Record<string, string> = {
  readAll: '기업 전체 문의 조회', menu: '메뉴 접근', read: '조회', create: '등록', update: '수정', delete: '삭제',
  confirm: '입출고 확정', move: '재고 이동', adjust: '재고 조정', count: '실사 수행', manageUsers: '사용자 관리',
}
const actionLabel = (feature: string, action: string) => action === 'confirm' ? ({ receipts: '입고 확정', shipments: '출고 확정', stocktake: '실사 최종 확정' }[feature] || '최종 확정') : actionLabels[action]
export default function PermissionSettings({ tenantId }: { tenantId: string }) {
  const [tab, setTab] = useState('existing')
  const tabs = <div className="wms-segmented permission-tabs" role="tablist" aria-label={uiText("권한 설정 구분")}>{[['existing', '권한 설정'], ['collaborators', '외부 협력사']].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'primary' : 'secondary'} onClick={() => { if (key !== tab) requestNavigation(() => setTab(key)) }}>{uiText(label)}</button>)}</div>
  return <><PageHeading title={uiText("권한 설정")} />
    {tab === 'existing' ? <ExistingPermissionSettings tenantId={tenantId} tabs={tabs} /> : <><div className="permission-viewbar">{tabs}</div><div role="tabpanel"><CollaboratorPermissions tenantId={tenantId} /></div></>}
  </>
}
function ExistingPermissionSettings({ tenantId, tabs }: { tenantId: string; tabs: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Grants>({})
  const [role, setRole] = useState('Administrator')
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const [stale, setStale] = useState(false)
  const [reloadConfirm, setReloadConfirm] = useState(false)
  const [restoreConfirm, setRestoreConfirm] = useState(false)
  const saving = useRef(false)
  useEffect(() => {
    let live = true
    api<Settings>(`/api/tenants/${tenantId}/permissions`).then(data => {
      if (live) { setSettings(data); setDraft(data.roles); setError(''); setStale(false); setReview(false) }
    }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : '권한을 불러오지 못했습니다.') })
    return () => { live = false }
  }, [tenantId, reload])
  const roleLabels = settings?.grades ? Object.fromEntries(settings.grades.map(g => [g.id, g.name])) : defaultLabels
  const changes = settings ? Object.keys(roleLabels).flatMap(r => settings.features.flatMap(f => f.actions.flatMap(a => {
    const before = settings.roles[r][f.key].includes(a)
    const after = draft[r]?.[f.key]?.includes(a) ?? false
    return before === after ? [] : [{ key: `${r}:${f.key}:${a}`, label: `${roleLabels[r]} · ${f.label} · ${actionLabel(f.key, a)}`, before, after }]
  }))) : []
  const navigation = useUnsavedNavigation(changes.length > 0 || busy, busy, () => {
    if (settings) setDraft(settings.roles)
    setReview(false)
  })
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
    if (!settings || !review || !changes.length || saving.current) return
    saving.current = true
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api<{ version: string; roles: Grants }>(`/api/tenants/${tenantId}/permissions`, { version: settings.version, roles: draft })
      setSettings({ ...settings, ...result }); setDraft(result.roles); setReview(false)
      navigation.saved()
      setNotice('권한 설정을 저장했습니다. 로그인 중인 사용자도 다음 요청부터 적용됩니다.')
      notifyAccessChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
      if (e instanceof ApiError && e.status === 409) { setStale(true); setReview(false) }
    } finally { saving.current = false; setBusy(false) }
  }
  return <>
    <div className="permission-viewbar">{tabs}<div className="permission-view-actions"><button className="primary" disabled={!settings || busy || stale || !changes.length} onClick={() => setReview(true)}>{uiText("저장")}</button><button className="secondary" disabled={busy || !settings} onClick={() => setRestoreConfirm(true)}>{uiText("안전한 기본값 복원")}</button></div></div>
    <div role="tabpanel"><section className="wms-card permission-settings">
      {error && <div className="alert error" role="alert">{uiText(error)}</div>}
      {notice && <div className="alert success" role="status">{uiText(notice)}</div>}
      {!settings ? <><p role="status">{uiText("권한 설정을 불러오는 중입니다.")}</p>{error && <button className="secondary" onClick={() => setReload(x => x + 1)}>{uiText("다시 불러오기")}</button>}</> : <>
        <div className="permission-toolbar permission-role-toolbar">
          <PermissionGradeChoice grades={settings.grades || Object.entries(defaultLabels).map(([id, name]) => ({ id, name, isActive: true, isBuiltIn: true, memberCount: 0, version: '' }))} value={role} onChange={setRole} label={uiText("설정할 권한")} disabled={busy} />
          <span className="permission-change-count" aria-live="polite">{uiText("저장하지 않은 변경")} {changes.length}{uiText("건")}</span>
        </div>
        {stale && <div className="permission-toolbar"><button className="secondary" disabled={busy} onClick={() => { if (changes.length) setReloadConfirm(true); else setReload(x => x + 1) }}>{uiText("최신 설정 다시 불러오기")}</button></div>}
        <PermissionMatrix caption={uiText("{v0} 기능별 권한", { v0: defaultLabels[role] ? uiText(roleLabels[role]) : roleLabels[role] })}
          features={settings.features.filter(f => f.roleActions[role]?.length > 0).map(f => ({ ...f, actions: f.roleActions[role].filter(a => f.implementedActions.includes(a)) }))}
          labelPrefix={`${defaultLabels[role] ? uiText(roleLabels[role]) : roleLabels[role]} `} checked={(key, action) => draft[role][key].includes(action)} disabled={() => busy || stale} onChange={toggle} />
        <p className="permission-help">{uiText("기능 권한을 켜면 메뉴·조회도 허용됩니다. 메뉴나 조회를 끄면 해당 기능의 모든 권한이 해제됩니다. 새 사용자 정의 권한은 업무 접근 없이 시작합니다. 조직도·항목 관리는 마스터가 별도로 허용하며, 일반 직원에게는 조직도 조회만 부여할 수 있습니다.")}</p>
        {review && <OrganizationDialog confirmation size="small" title={uiText("권한 변경 확인")} busy={busy} onClose={() => setReview(false)}>
          <section className="permission-review" aria-label={uiText("저장 전 변경사항 확인")}>
            <h3>{uiText("변경사항")} {changes.length}{uiText("건")}</h3>
            <ul>{changes.map(change => <li key={change.key}>{uiText(change.label)}: {change.before ? uiText("허용") : uiText("차단")} → <strong>{change.after ? uiText("허용") : uiText("차단")}</strong></li>)}</ul>
            <p>{uiText("현재 기업에만 적용하며 변경자·일시·변경 전후 값이 감사 로그에 기록됩니다.")}</p>
          </section>
          {error && <p role="alert" className="alert error">{uiText(error)}</p>}
          <button className="secondary" disabled={busy} onClick={() => setReview(false)}>{uiText("계속 수정")}</button>{' '}
          <button className="primary" disabled={busy || stale || !changes.length} onClick={save}>{busy ? uiText("저장 중…") : uiText("확인 후 저장")}</button>
        </OrganizationDialog>}
        {reloadConfirm && <OrganizationDialog confirmation size="small" title={uiText("최신 권한 다시 불러오기")} onClose={() => setReloadConfirm(false)}>
          <p>{uiText("저장하지 않은 변경을 버리고 최신 설정을 불러오시겠습니까?")}</p>
          <button className="secondary" onClick={() => setReloadConfirm(false)}>{uiText("취소")}</button>{' '}
          <button className="primary" onClick={() => { setReloadConfirm(false); setReload(x => x + 1) }}>{uiText("확인")}</button>
        </OrganizationDialog>}
      </>}
    </section>
    <UserPermissionAccess tenantId={tenantId} />
    </div>
    {restoreConfirm && settings && <OrganizationDialog confirmation size="small" title={uiText("안전한 기본값 복원")} onClose={() => setRestoreConfirm(false)}>
      <p>{uiText("기본 권한은 안전한 기본값으로, 사용자 정의 권한은 업무 접근 없음으로 되돌리시겠습니까? 변경사항 확인 후 저장해야 적용됩니다.")}</p>
      <div className="organization-row-actions"><button className="secondary" onClick={() => setRestoreConfirm(false)}>{uiText("취소")}</button><button className="primary" onClick={() => { setDraft(settings.defaults); setReview(false); setRestoreConfirm(false); setNotice('변경사항을 확인한 뒤 저장해야 적용됩니다.') }}>{uiText("복원")}</button></div>
    </OrganizationDialog>}
    <UnsavedChangesDialog guard={navigation} />
  </>
}
