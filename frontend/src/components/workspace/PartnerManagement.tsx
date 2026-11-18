import PageSizeSelect from '../PageSizeSelect'
import FormLabel from '../FormLabel'
import AddressSearchField from "../AddressSearchField"
import SearchFilters from './SearchFilters'
import UnsavedChangesContent from './UnsavedChangesContent'
import ContactLink from './ContactLink'
import DialogSection from './DialogSection'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../../api'
import Pagination from '../Pagination'
import { requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import { businessNumberError, partnerDraft, partnerDirty, partnerError, partnerRequest, partnerTextFields, partnerTypes } from '../../partner-model'
import type { Partner, PartnerDraft, PartnerList, PartnerSave } from '../../partner-model'
import OrganizationDialog from './OrganizationDialog'
import { PageHeading } from './WorkspaceUI'
import './products.css'

export default function PartnerManagement({ tenantId, grants }: { tenantId: string; grants: string[] }) {
  const endpoint = `/api/tenants/${tenantId}/partners`
  const [query, setQuery] = useState({ search: '', type: 'all', status: 'all', page: 1, pageSize: 20 })
  const [filters, setFilters] = useState(query)
  const [revision, refresh] = useState(0), [data, setData] = useState<{ key: string; value: PartnerList } | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [selection, setSelection] = useState<{ id: string | null } | null>(null)
  const url = endpoint + '?' + new URLSearchParams({ ...query, page: String(query.page), pageSize: String(query.pageSize) })
  const key = `${url}:${revision}`, loading = data?.key !== key
  useEffect(() => {
    let live = true
    const timer = window.setTimeout(() => {
      api<PartnerList>(url).then(value => { if (live) { setData({ key, value }); setError('') } }).catch(e => { if (live) setError(e instanceof Error ? e.message : '거래처를 불러오지 못했습니다.') })
    }, 180)
    return () => { live = false; window.clearTimeout(timer) }
  }, [url, key])
  return <>
    <PageHeading title="거래처관리" actions={<> {grants.includes('create') && <button className="primary" onClick={() => { setSelection({ id: null }); setNotice('') }}>거래처 등록</button>} </>} />
    {notice && <p role="status" className="alert">{notice}</p>}
    {error && <p role="alert" className="alert error">{error} <button className="secondary" onClick={() => refresh(n => n + 1)}>다시 시도</button></p>}
    <section className="wms-card products-card mobile-management-list">
      <SearchFilters onReset={() => { const next = { search: '', type: 'all', status: 'all', page: 1, pageSize: 20 }; setFilters(next); setQuery(next);  refresh(n => n + 1) }} busy={loading && !error} onSearch={() => { setQuery({ ...filters, page: 1 }); refresh(n => n + 1) }} className="products-toolbar mobile-management-filters">

        <label>거래처 유형<select aria-label="거래처 유형 필터" value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}><option value="all">전체 유형</option>{Object.entries(partnerTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>사용 여부<select aria-label="사용 여부 필터" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="all">전체</option><option value="active">사용</option><option value="inactive">미사용</option></select></label>

      <label>거래처 검색<input aria-label="거래처 검색" placeholder="거래처명·코드·사업자등록번호·이메일" maxLength={100} value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} /></label>
</SearchFilters>
      <div className="table-scroll"><table className="organization-table mobile-record-table mobile-management-table partner-management-table"><thead><tr>{['거래처코드', '거래처명', '거래처 유형', '사업자등록번호', '대표 전화번호', '이메일', '담당자명', '담당자 연락처', '사용 여부', '관리'].map(text => <th key={text}>{text}</th>)}</tr></thead>
        <tbody>{loading ? <tr><td colSpan={10}>{error ? '목록을 불러오지 못했습니다.' : '거래처를 불러오는 중…'}</td></tr> : !data.value.items.length ? <tr><td colSpan={10}>조회된 거래처가 없습니다.</td></tr> : data.value.items.map(p => <tr key={p.id}><td data-label="거래처코드">{p.code}</td><td data-label="거래처명"><span className="partner-card-name">{p.name}</span><span className="partner-card-meta">{p.code} / {partnerTypes[p.type]}</span></td><td data-label="거래처 유형">{partnerTypes[p.type]}</td><td data-label="사업자등록번호">{p.businessRegistrationNumber || '—'}</td><td data-label="대표 전화번호">{p.phone || '—'}</td><td data-label="이메일"><ContactLink value={p.email} email /></td><td data-label="담당자명">{p.contactName || '—'}</td><td data-label="담당자 연락처">{p.contactPhone || '—'}</td><td data-label="사용 여부" className="mobile-card-usage"><span className={`partner-card-status ${p.isActive ? "is-active" : "is-inactive"}`}>{p.isActive ? '사용' : '미사용'}</span></td><td data-label="관리"><button className="secondary" aria-label={`${p.name} 상세`} onClick={() => setSelection({ id: p.id })}>상세</button></td></tr>)}</tbody>
      </table></div>
      <Pagination pageSizeControl={<PageSizeSelect value={query.pageSize} onChange={pageSize => { setQuery(v => ({ ...v, pageSize, page: 1 })); setFilters(v => ({ ...v, pageSize, page: 1 }));  }} />} page={query.page} pageSize={data?.value.pageSize || query.pageSize} total={data?.value.total || 0} loading={loading} onChange={page => setQuery(q => ({ ...q, page }))} label="거래처 목록 페이지" />
    </section>
    {selection && <PartnerDialog key={selection.id || 'new'} id={selection.id} endpoint={endpoint} canUpdate={grants.includes('update')} onClose={() => setSelection(null)} onSaved={warning => { refresh(n => n + 1); setNotice('거래처 정보를 저장했습니다.' + (warning ? ` ${warning}` : '')) }} />}
  </>
}

function PartnerDialog({ id, endpoint, canUpdate, onClose, onSaved }: {
  id: string | null; endpoint: string; canUpdate: boolean; onClose: () => void; onSaved: (warning: string | null) => void
}) {
  const [data, setData] = useState<Partner | null>(null), [editing, setEditing] = useState(!id), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [warning, setWarning] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    let live = true
    api<Partner>(`${endpoint}/${id}`).then(value => { if (live) { setData(value); setError('') } }).catch(e => { if (live) setError(e instanceof Error ? e.message : '거래처를 불러오지 못했습니다.') })
    return () => { live = false }
  }, [id, endpoint, retry])
  if (editing && (!id || data)) return <PartnerEditor partner={data || undefined} endpoint={endpoint} onClose={() => data ? setEditing(false) : onClose()} onSaved={result => { setData(result.partner); setWarning(result.warning); setEditing(false); onSaved(result.warning) }} />
  return <OrganizationDialog title="거래처 상세" onClose={onClose} detailHeader={{code:data?.code,status:data && <span className="status-badge">{data.isActive ? '사용' : '미사용'}</span>,actions:data && canUpdate && <button type="button" className="primary" onClick={() => setEditing(true)}>거래처 수정</button>}}>

    {error && <p role="alert" className="alert error">{error} <button className="secondary" onClick={() => setRetry(n => n + 1)}>다시 시도</button></p>}
    {!data ? <p>거래처를 불러오는 중…</p> : <>
      {warning && <p role="status" className="alert">{warning}</p>}
      <dl className="products-detail">{[
        ...partnerTextFields.map(([key, label]) => [label, data[key] || '—']),
        ['거래처 유형', partnerTypes[data.type]], ['사업자번호 구분', data.registrationCountry === 'KR' ? '국내' : '해외'],
        ['사용 여부', data.isActive ? '사용' : '미사용'],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </>}
  </OrganizationDialog>
}

function PartnerEditor({ partner, endpoint, onClose, onSaved }: {
  partner?: Partner; endpoint: string; onClose: () => void; onSaved: (result: PartnerSave) => void
}) {
  const [initial] = useState(() => partnerDraft(partner)), [draft, setDraft] = useState(initial)
  const [requestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const inFlight = useRef(false)
  const navigation = useUnsavedNavigation(partnerDirty(draft, initial) || busy, busy, () => { setDraft(initial); setConfirm(false) })
  const checkKey = JSON.stringify([draft.businessRegistrationNumber, draft.registrationCountry, partner?.id])
  const [duplicates, setDuplicates] = useState<{ key: string; matches: { id: string; code: string; name: string }[]; error?: string } | null>(null)
  useEffect(() => {
    if (!draft.businessRegistrationNumber.trim() || businessNumberError(draft.businessRegistrationNumber, draft.registrationCountry)) return
    let live = true
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ number: draft.businessRegistrationNumber, country: draft.registrationCountry, ...(partner ? { excludeId: partner.id } : {}) })
      api<{ matches: { id: string; code: string; name: string }[] }>(`${endpoint}/business-number-check?${params}`).then(result => { if (live) setDuplicates({ key: checkKey, matches: result.matches }) }).catch(() => { if (live) setDuplicates({ key: checkKey, matches: [], error: '기존 사업자번호 확인에 실패했습니다. 저장 시 다시 확인합니다.' }) })
    }, 250)
    return () => { live = false; window.clearTimeout(timer) }
  }, [checkKey, draft.businessRegistrationNumber, draft.registrationCountry, endpoint, partner])
  function change<K extends keyof PartnerDraft>(key: K, value: PartnerDraft[K]) { setDraft(d => ({ ...d, [key]: value })) }
  function submit(e: FormEvent) { e.preventDefault(); const problem = partnerError(draft); if (problem) { setError(problem); return } setError(''); setConfirm(true) }
  async function save() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = await api<PartnerSave>(endpoint + (partner ? `/${partner.id}` : ''), partnerRequest(draft, requestId, partner))
      navigation.saved(); onSaved(result)
    } catch (e) { setError(e instanceof Error ? e.message : '거래처를 저장하지 못했습니다.'); setConfirm(false) }
    finally { inFlight.current = false; setBusy(false) }
  }
  function textFields(keys: readonly string[]) { return partnerTextFields.filter(([key]) => keys.includes(key)).map(([key, label, max]) => <label key={key} className={['address', 'addressDetail', 'notes', 'paymentTerms'].includes(key) ? 'products-full' : key === 'code' ? 'partner-code-field' : undefined}><FormLabel required={key === 'name'}>{label}</FormLabel>{key === 'notes' ? <textarea aria-label={label} maxLength={max} value={draft[key]} onChange={e => change(key, e.target.value)} /> : <input aria-label={label} required={key === 'name'} type={key === 'email' ? 'email' : key === 'phone' || key === 'contactPhone' ? 'tel' : 'text'} maxLength={max} placeholder={key === 'code' ? partner ? '미입력 시 기존 코드 유지' : '미입력 시 자동 생성' : undefined} value={draft[key]} onChange={e => change(key, e.target.value)} />}</label>) }
  const matches = duplicates?.key === checkKey ? duplicates : null
  return <OrganizationDialog detailHeader={{code:partner?.code,status:partner && <span className="status-badge">{partner.isActive ? '사용' : '미사용'}</span>,actions:<button type="submit" form="partner-editor" className="primary" disabled={busy}>거래처 저장</button>}} wide confirmation={confirm || navigation.blocked} size={confirm || navigation.blocked ? 'small' : 'large'} title={navigation.blocked ? '저장하지 않은 거래처 작업' : `거래처 ${partner ? '수정' : '등록'}`} busy={busy} onClose={() => navigation.blocked ? navigation.stay() : confirm ? setConfirm(false) : requestNavigation(onClose)}>
    {error && <p role="alert" className="alert error">{error}</p>}
    {!!matches?.matches.length && <p role="status" className="alert">같은 사업자등록번호의 거래처: {matches.matches.map(p => `${p.name} (${p.code})`).join(', ')}. 지점·거래 관계에 따른 별도 등록이면 저장할 수 있습니다.</p>}
    {matches?.error && <p role="status">{matches.error}</p>}
    {navigation.blocked && <UnsavedChangesContent stay={navigation.stay} discard={navigation.discard} message="저장하지 않은 거래처 변경을 버리고 이동하시겠습니까?" />}
    {confirm && !navigation.blocked && <section role="alertdialog" aria-label="거래처 저장 확인"><p>거래처 정보를 저장하시겠습니까?</p><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>계속 편집</button>{' '}<button className="primary" disabled={busy} onClick={save}>{busy ? '저장 중…' : '확인'}</button></section>}
    <form id="partner-editor" className="dialog-form" onSubmit={submit} hidden={confirm || navigation.blocked}>
      <div className="dialog-form-scroll"><fieldset disabled={busy}><DialogSection title="기본 정보">{textFields(['code','name'])}        <label><FormLabel required>거래처 유형</FormLabel><select aria-label="거래처 유형" required value={draft.type} onChange={e => change('type', e.target.value as Partner['type'])}>{Object.entries(partnerTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>

{textFields(['businessRegistrationNumber'])}</DialogSection><DialogSection title="사업장 정보">{textFields(['representativeName','phone'])}<label>주소 국가<select aria-label="주소 국가" value={draft.registrationCountry} onChange={e => change('registrationCountry', e.target.value as Partner['registrationCountry'])}><option value="KR">국내</option><option value="OTHER">해외</option></select></label><AddressSearchField value={draft} overseas={draft.registrationCountry !== 'KR'} disabled={busy} onChange={address => setDraft(d => ({ ...d, ...address }))} /></DialogSection><DialogSection title="담당자 정보">{textFields(['contactName','contactPhone','email'])}</DialogSection><DialogSection title="기타">{textFields(['paymentTerms'])}        <label><FormLabel required>사용 여부</FormLabel><select aria-label="사용 여부" required value={String(draft.isActive)} onChange={e => change('isActive', e.target.value === 'true')}><option value="true">사용</option><option value="false">미사용</option></select></label>
{textFields(['notes'])}</DialogSection>      </fieldset></div>

    </form>
  </OrganizationDialog>
}
