import PermissionMatrix from './PermissionMatrix'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { notifyAccessChanged } from '../../access-events'
import { requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import type { Choice } from '../../receipt-model'
import Pagination from '../Pagination'
import SearchableChoiceField from './SearchableChoiceField'
import UnsavedChangesDialog from './UnsavedChangesDialog'
import './collaborator-permissions.css'

type Grants = Record<string, string[]>
type Detail = { id: string; name: string; version: string; isActive: boolean; partnerActive: boolean; memberCount: number; grants: Grants; features: { key: string; label: string; actions: string[] }[] }
type Members = { items: { userId: string; name: string; loginId: string; isActive: boolean; useIndividualPermissions: boolean }[]; total: number; pageSize: number }
export default function CollaboratorPermissions({ tenantId }: { tenantId: string }) {
  const [selected, setSelected] = useState<Choice>()
  const endpoint = `/api/tenants/${tenantId}/collaborators`
  return <section className="wms-card collaborator-permissions">
    <div className="collaborator-picker"><SearchableChoiceField endpoint={endpoint} kind="collaborators" label="외부 협력사 선택" value={selected?.id || ''} current={selected} onChange={item => requestNavigation(() => setSelected(item))} />
      <p className="organization-help">같은 협력사의 모든 소속 계정에 적용됩니다. 이름이 같아도 업체 ID가 다르면 별도로 관리합니다.</p></div>
    {selected ? <Editor key={selected.id} endpoint={`${endpoint}/${selected.id}`} /> : <div className="collaborator-empty" aria-disabled="true">외부 협력사를 선택하면 현재 권한과 소속 사용자가 표시됩니다.</div>}
  </section>
}
function Editor({ endpoint }: { endpoint: string }) {
  const [data, setData] = useState<Detail | null>(null), [draft, setDraft] = useState<Grants>({}), [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [reload, setReload] = useState(0)
  const saving = useRef(false)
  const dirty = !!data && (JSON.stringify(draft) !== JSON.stringify(data.grants) || active !== data.isActive)
  function reset() { if (data) { setDraft(data.grants); setActive(data.isActive) } }
  const guard = useUnsavedNavigation(dirty || busy, busy, reset)
  useEffect(() => { let live = true; api<Detail>(endpoint).then(v => { if (live) { setData(v); setDraft(v.grants); setActive(v.isActive); setError('') } }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [endpoint, reload])
  function toggle(key: string, actions: string[], checked: boolean) {
    setNotice(''); setDraft(old => {
      const values = new Set(old[key]); if (checked) { actions.forEach(a => values.add(a)); values.add('menu'); values.add('read') }
      else if (actions.includes('menu') || actions.includes('read')) values.clear(); else actions.forEach(a => values.delete(a))
      return { ...old, [key]: data!.features.find(f => f.key === key)!.actions.filter(a => values.has(a)) }
    })
  }
  async function save() {
    if (!data || !dirty || saving.current) return
    saving.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const result = await api<{ version: string; grants: Grants; isActive: boolean }>(`${endpoint}/permissions`, { version: data.version, grants: draft, isActive: active })
      setData({ ...data, ...result }); setDraft(result.grants); setActive(result.isActive); guard.saved(); notifyAccessChanged()
      try { const latest = await api<Detail>(endpoint); setData(latest); setDraft(latest.grants); setActive(latest.isActive); setNotice('협력사 권한을 저장했습니다. 소속 계정의 다음 요청부터 적용됩니다.') }
      catch { setNotice('권한은 저장되었습니다. 최신 정보 조회에 실패했으니 다시 불러오세요.') }
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다. 변경한 설정은 유지됩니다.') }
    finally { saving.current = false; setBusy(false) }
  }
  return <>
    {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert success" role="status">{notice}</p>}
    <div className="collaborator-footer"><span aria-live="polite">{dirty ? '저장하지 않은 변경사항이 있습니다.' : '저장된 설정입니다.'}</span><div className="dialog-actions">{error && <button className="secondary" disabled={busy} onClick={() => requestNavigation(() => { setReload(x => x + 1); guard.saved() })}>다시 불러오기</button>}<button className="secondary" disabled={busy || !dirty} onClick={() => requestNavigation(() => { reset(); guard.saved(); setNotice('변경을 취소했습니다.') })}>변경 취소</button><button className="primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? '저장 중…' : '권한 저장'}</button></div></div>
    {!data ? <p role="status">권한을 불러오는 중입니다.</p> : <>
      <div className="collaborator-heading"><div><h2>{data.name}</h2><p>소속 사용자 {data.memberCount}명 · 업체 ID {data.id.slice(0, 8)}</p></div><label className="permission-option"><input type="checkbox" aria-label="협력사 사용" checked={active} disabled={busy} onChange={e => { setActive(e.target.checked); setNotice('') }} />협력사 사용</label></div>
      {!active && <p className="alert warning">저장하면 이 협력사의 모든 계정은 로그인 중이어도 WMS에 접근할 수 없습니다.</p>}
      {!data.partnerActive && <p className="alert warning">연결된 거래처가 사용 중지되어 소속 계정의 접근이 차단되어 있습니다.</p>}
      <p className="organization-help">개인별 추가 제한이 있으면 협력사 권한과 모두 허용한 기능만 사용합니다. 검수·피킹은 기존 업무의 수정 권한으로 제어합니다.</p>
      <PermissionMatrix caption={`${data.name} 메뉴·기능 접근 권한`} features={data.features}
        checked={(key, action) => draft[key].includes(action)} disabled={() => busy}
        onChange={(key, action, checked) => toggle(key, [action], checked)} />
      <p className="organization-help">메뉴 또는 조회를 끄면 해당 업무 권한이 해제됩니다. 저장 전까지 적용되지 않습니다. 관리자·사용자·권한·결제 관리 권한은 부여할 수 없습니다.</p>
      <MembersList endpoint={endpoint} />
    </>}

    <UnsavedChangesDialog guard={guard} />
  </>
}
function MembersList({ endpoint }: { endpoint: string }) {
  const [page, setPage] = useState(1), [data, setData] = useState<{ page: number; value: Members } | null>(null), [error, setError] = useState('')
  useEffect(() => { let live = true; api<Members>(`${endpoint}/members?page=${page}`).then(value => { if (live) { setData({ page, value }); setError('') } }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [endpoint, page])
  const current = data?.page === page ? data.value : null
  return <details className="collaborator-members"><summary>소속 사용자 확인</summary>{error && <p role="alert">{error}</p>}{current ? <><ul>{current.items.map(u => <li key={u.userId}><strong>{u.name}</strong> · {u.loginId} · {u.isActive ? '활성' : '비활성'} · {u.useIndividualPermissions ? '개인별 추가 제한 적용' : '협력사 권한 적용'}</li>)}</ul><Pagination page={page} pageSize={current.pageSize} total={current.total} onChange={setPage} /></> : <p>조회 중…</p>}</details>
}
