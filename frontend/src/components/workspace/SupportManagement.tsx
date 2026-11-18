import PageSizeSelect from '../PageSizeSelect'
import FormLabel from '../FormLabel'
import ReportPeriodFields from './ReportPeriodFields'
import SearchFilters from './SearchFilters'
import UnsavedChangesContent from './UnsavedChangesContent'
import DialogSection from './DialogSection'
import { supportCategories, supportStatuses } from '../../support-model'
import { useRef, useState } from 'react'
import { api } from '../../api'
import { requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import { useReportRead } from './useReportRead'
import { PageHeading } from './WorkspaceUI'
import OrganizationDialog from './OrganizationDialog'
import Pagination from '../Pagination'
import './support.css'

type Inquiry = { id: string; tenantId: string; number: string; title: string; category: string; status: string; createdAt: string; answeredAt: string | null; company: string; author: string; assignee: string | null }
type Detail = Inquiry & { message: string; answer: string | null; answerer: string | null; assignedToId: string | null; version: string; attachments: { id: string; fileName: string; size: number }[]; history: { id: number; actor: string; changedAt: string; beforeJson: string; afterJson: string }[] }
const date = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '—'

export default function SupportManagement({ tenantId, canCreate = false, admin = false }: { tenantId?: string; canCreate?: boolean; canReadAll?: boolean; admin?: boolean }) {
  const endpoint = admin ? '/api/admin/support' : `/api/tenants/${tenantId}/support`
  const [query, setQuery] = useState({ search: '', company: '', category: '', status: '', start: '', end: '', page: 1, pageSize: 20 })
  const [filters, setFilters] = useState(query)
  const [revision, setRevision] = useState(0), [create, setCreate] = useState(false), [detail, setDetail] = useState<string | null>(null), [notice, setNotice] = useState('')
  const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '').map(([k, v]) => [k, String(v)]))
  const { data, loading, error } = useReportRead<{ items: Inquiry[]; total: number; page: number; pageSize: number }>(`${endpoint}?${params}`, revision)
  function filter(key: string, value: string) { setFilters(q => ({ ...q, [key]: value, page: 1 })) }
  return <section className="support-page">
    <PageHeading title={admin ? '문의·피드백 관리' : '문의하기'} actions={<>{!admin && canCreate && <button className="primary" onClick={() => { setNotice(''); setCreate(true) }}>문의 등록</button>}</>} />
    <div className="panel support-toolbar"><SearchFilters onReset={() => { const next={ search:'', company:'', category:'', status:'', start:'', end:'', page:1, pageSize:20 }; setFilters(next); setQuery(next); setRevision(n=>n+1) }} className="support-filters mobile-management-filters" busy={loading} onSearch={() => { setQuery({ ...filters, page: 1 }); setRevision(n => n + 1) }}>

      <label>문의 유형<select value={filters.category} onChange={e => filter('category', e.target.value)}><option value="">전체 유형</option>{Object.entries(supportCategories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>처리 상태<select value={filters.status} onChange={e => filter('status', e.target.value)}><option value="">전체 상태</option>{Object.entries(supportStatuses).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <ReportPeriodFields prefix="등록일" start={filters.start} end={filters.end} onChange={range => setFilters(x => ({ ...x, start:range.start, end:range.end }))} />
    {admin && <label>기업명<input aria-label="문의 기업 검색" value={filters.company} maxLength={100} onChange={e => filter('company', e.target.value)} /></label>}
<label>문의 검색<input aria-label="문의 검색" placeholder="문의번호 또는 제목" value={filters.search} maxLength={100} onChange={e => filter('search', e.target.value)} /></label>
</SearchFilters></div>
    {notice && <p className="alert success" role="status">{notice}</p>}{error && <p role="alert" className="alert error">{error}</p>}
    <section className="panel mobile-management-list"><div className="table-scroll"><table className="wms-table support-table mobile-record-table mobile-management-table" aria-busy={loading}><thead><tr><th>문의번호 / 유형</th>{admin && <th>기업</th>}<th>제목</th><th>작성자</th><th>등록일</th><th>처리 상태</th><th>{admin ? '담당 관리자' : '최종 답변일'}</th><th>관리</th></tr></thead><tbody>
      {loading && <tr><td colSpan={8} role="status">문의 목록을 불러오는 중입니다.</td></tr>}
      {!loading && data?.items.map(row => <tr key={row.id}><td data-label="문의번호 / 유형"><small className="support-number" title={row.number}>{row.number}</small><span>{supportCategories[row.category]}</span></td>{admin && <td data-label="기업">{row.company}</td>}<td data-label="제목" className="support-title mobile-card-wide">{row.title}</td><td data-label="작성자">{row.author}</td><td data-label="등록일">{date(row.createdAt)}</td><td data-label="처리 상태"><span className={`badge support-${row.status}`}>{supportStatuses[row.status]}</span></td><td data-label={admin ? "담당 관리자" : "최종 답변일"}>{admin ? row.assignee || '미지정' : date(row.answeredAt)}</td><td data-label="관리"><button className="secondary" onClick={() => setDetail(row.id)}>상세</button></td></tr>)}
      {!loading && data?.items.length === 0 && <tr><td colSpan={8}>조회 조건에 맞는 문의가 없습니다.</td></tr>}
    </tbody></table></div>{data && <Pagination pageSizeControl={<PageSizeSelect value={query.pageSize} onChange={pageSize => { setQuery(v => ({ ...v, pageSize, page: 1 })); setFilters(v => ({ ...v, pageSize, page: 1 }));  }} />} page={data.page} total={data.total} pageSize={data.pageSize} onChange={page => setQuery(q => ({ ...q, page }))} />}</section>
    {create && <CreateInquiry endpoint={endpoint} onClose={() => setCreate(false)} onSaved={id => { setCreate(false); setDetail(id); setRevision(r => r + 1); setNotice('문의를 등록했습니다.') }} />}
    {detail && <InquiryDetail key={detail} endpoint={endpoint} id={detail} admin={admin} onClose={() => setDetail(null)} onChanged={() => { setRevision(r => r + 1); setNotice('문의 처리 내용을 저장했습니다.') }} />}
  </section>
}
function CreateInquiry({ endpoint, onClose, onSaved }: { endpoint: string; onClose: () => void; onSaved: (id: string) => void }) {
  const [category, setCategory] = useState('Service'), [title, setTitle] = useState(''), [message, setMessage] = useState(''), [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const [requestId] = useState(() => crypto.randomUUID()), flight = useRef(false)
  const navigation = useUnsavedNavigation(!!title || !!message || !!files.length || category !== 'Service', busy)
  async function save() {
    if (flight.current) return
    flight.current = true; setBusy(true); setError('')
    try {
      const form = new FormData(); form.set('requestId', requestId); form.set('category', category); form.set('title', title); form.set('message', message); files.forEach(file => form.append('files', file))
      const result = await api<{ id: string }>(endpoint, form); navigation.saved(); onSaved(result.id)
    } catch (e) { setError(e instanceof Error ? e.message : '문의를 등록하지 못했습니다.'); setConfirm(false) }
    finally { setBusy(false); flight.current = false }
  }
  return <OrganizationDialog confirmation={confirm || navigation.blocked} size={confirm || navigation.blocked ? 'small' : 'medium'} title="문의 등록" className="support-create-dialog" busy={busy} onClose={() => navigation.blocked ? navigation.stay() : requestNavigation(onClose)}>
    {error && <p className="alert error" role="alert">{error}</p>}
    {navigation.blocked ? <LeaveConfirm stay={navigation.stay} discard={navigation.discard} /> : confirm ? <section role="alertdialog" aria-label="문의 등록 확인"><p>아이블소프트에 문의를 등록하시겠습니까? 등록 후 문의 원문은 수정할 수 없습니다.</p><div className="row-actions"><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>계속 작성</button><button className="primary" disabled={busy} onClick={save}>{busy ? '등록 중…' : '확인'}</button></div></section> : null}
    <form className="dialog-form" hidden={navigation.blocked || confirm} onSubmit={e => { e.preventDefault(); if (!title.trim() || !message.trim()) { setError('제목과 문의 내용을 입력해 주세요.'); return } setConfirm(true) }}><div className="dialog-form-scroll"><fieldset disabled={busy}><DialogSection title="문의 정보">
      <label><FormLabel required>문의 유형</FormLabel><select aria-required="true" aria-label="문의 유형" value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(supportCategories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="dialog-span"><FormLabel required>제목</FormLabel><input aria-label={"제목"} required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="dialog-span"><FormLabel required>문의 내용</FormLabel><textarea required rows={9} maxLength={10000} value={message} onChange={e => setMessage(e.target.value)} /></label>
      <label className="dialog-span">첨부파일<input aria-label="첨부파일" type="file" multiple accept=".png,.jpg,.jpeg,.pdf,.txt,.docx,.xlsx,.pptx" onChange={e => { const selected = Array.from(e.target.files || []); if (selected.length > 3 || selected.some(f => f.size <= 0 || f.size > 5 * 1024 * 1024)) { setError('파일은 최대 3개, 각 5MB 이하로 선택해 주세요.'); e.target.value = ''; setFiles([]) } else { setError(''); setFiles(selected) } }} /><small>이미지(PNG/JPG), PDF, TXT, DOCX, XLSX, PPTX · 최대 3개, 각 5MB</small></label>
      {files.map((file, i) => <small key={i}>{file.name} ({Math.ceil(file.size / 1024)}KB)</small>)}</DialogSection></fieldset></div>
      <div className="dialog-actions"><button type="button" disabled={busy} className="secondary" onClick={() => requestNavigation(onClose)}>취소</button><button className="primary" disabled={busy}>문의 등록</button></div>
    </form>
  </OrganizationDialog>
}
function LeaveConfirm({ stay, discard }: { stay: () => void; discard: () => void }) { return <UnsavedChangesContent label="저장하지 않은 문의 작업" stay={stay} discard={discard} message="저장하지 않은 문의 내용을 버리고 이동하시겠습니까?" /> }
export function InquiryDetail({ endpoint, id, admin, onClose, onChanged }: { endpoint: string; id: string; admin: boolean; onClose: () => void; onChanged: () => void }) {
  const [revision, setRevision] = useState(0), view = useReportRead<Detail>(`${endpoint}/${id}`, revision)
  if (!view.data) return <OrganizationDialog title="문의 상세" onClose={onClose}>{view.error ? <p role="alert">{view.error}</p> : <p role="status">문의를 불러오는 중입니다.</p>}</OrganizationDialog>
  return <InquiryEditor key={view.data.version} data={view.data} endpoint={endpoint} admin={admin} onClose={onClose} onSaved={() => { setRevision(r => r + 1); onChanged() }} />
}
function InquiryEditor({ data, endpoint, admin, onClose, onSaved }: { data: Detail; endpoint: string; admin: boolean; onClose: () => void; onSaved: () => void }) {
  const [answer, setAnswer] = useState(data.answer || ''), [status, setStatus] = useState(data.status), [assigned, setAssigned] = useState(data.assignedToId || '')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState(false), flight = useRef(false)
  const dirty = admin && (answer !== (data.answer || '') || status !== data.status || assigned !== (data.assignedToId || ''))
  const navigation = useUnsavedNavigation(dirty, busy)
  async function downloadFile(file: Detail['attachments'][number]) {
    setError('')
    try {
      const response = await fetch(`${endpoint}/${data.id}/attachments/${file.id}`, { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || '첨부파일을 다운로드할 권한이 없거나 세션이 만료되었습니다.')
      const url = URL.createObjectURL(await response.blob()), link = document.createElement('a')
      link.href = url; link.download = file.fileName; document.body.append(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(e instanceof Error ? e.message : '첨부파일 다운로드에 실패했습니다.') }
  }
  async function save() {
    if (flight.current) return
    flight.current = true; setBusy(true); setError('')
    try { await api(`${endpoint}/${data.id}`, { version: data.version, status, assignedToId: assigned || null, answer }); navigation.saved(); onSaved() }
    catch (e) { setError(e instanceof Error ? e.message : '문의 처리 내용을 저장하지 못했습니다.'); setConfirm(false) }
    finally { setBusy(false); flight.current = false }
  }
  return <OrganizationDialog confirmation={confirm || navigation.blocked} size={confirm || navigation.blocked ? 'small' : 'large'} title="문의 상세" detailHeader={{code:data.number,status:<span className={`badge support-${data.status}`}>{supportStatuses[data.status]}</span>,actions:admin && data.status !== 'Closed' && <button type="submit" form="support-detail-editor" className="primary" disabled={busy || !dirty}>처리 내용 저장</button>}} wide busy={busy} onClose={() => navigation.blocked ? navigation.stay() : requestNavigation(onClose)}>
    {error && <p role="alert" className="alert error">{error}</p>}
    {navigation.blocked && <LeaveConfirm stay={navigation.stay} discard={navigation.discard} />}
    {confirm && !navigation.blocked && <section role="alertdialog" aria-label="문의 처리 저장 확인"><p>{status === 'Closed' ? '문의를 종료하면 답변과 상태를 더 이상 수정할 수 없습니다.' : '답변 및 처리 상태를 저장하시겠습니까?'}</p><div className="row-actions"><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>계속 편집</button><button className="primary" disabled={busy} onClick={save}>확인</button></div></section>}
    <div hidden={navigation.blocked || confirm} className="support-detail">
      <div className="support-meta"><span>{supportCategories[data.category]}</span><span>{data.company} · {data.author}</span><time>{date(data.createdAt)}</time></div>
      <h3>{data.title}</h3><p className="support-message">{data.message}</p>
      {data.attachments.length > 0 && <section><h3>첨부파일</h3><ul className="support-files">{data.attachments.map(file => <li key={file.id}><a href={`${endpoint}/${data.id}/attachments/${file.id}`} download={file.fileName} onClick={e => { e.preventDefault(); void downloadFile(file) }}>{file.fileName}</a><small>{Math.ceil(file.size / 1024)}KB</small></li>)}</ul></section>}
      <section className="support-answer"><h3>아이블소프트 답변</h3>{data.answer ? <><p className="support-message">{data.answer}</p><small>{data.answerer} · {date(data.answeredAt)}</small></> : <p>아직 등록된 답변이 없습니다.</p>}</section>
      {admin && data.status !== 'Closed' && <form id="support-detail-editor" className="support-admin-editor" onSubmit={e => { e.preventDefault(); setConfirm(true) }}><h3>답변 및 처리</h3><fieldset className="support-form" disabled={busy}>
        <div className="support-filters"><label>처리 상태<select aria-label="처리 상태" value={status} onChange={e => setStatus(e.target.value)}>{(data.status === 'Answered' ? ['Answered', 'Closed'] : data.status === 'InProgress' ? ['InProgress', 'Answered'] : ['Received', 'InProgress', 'Answered']).map(v => <option key={v} value={v}>{supportStatuses[v]}</option>)}</select></label><AdminAssignment value={assigned} onChange={setAssigned} /></div>
        <label><FormLabel required={status === "Answered" || status === "Closed"}>관리자 답변</FormLabel><textarea aria-required={status === "Answered" || status === "Closed"} aria-label="관리자 답변" rows={8} maxLength={10000} value={answer} onChange={e => { setAnswer(e.target.value); if (e.target.value.trim()) setStatus('Answered') }} /></label>
      </fieldset></form>}
      {data.status === 'Closed' && <p className="alert">종료된 문의입니다. 추가 도움이 필요하면 새로운 문의를 등록해 주세요.</p>}
      <details><summary>답변·상태 변경 이력 (최근 100건)</summary>{data.history.map(h => { const before = JSON.parse(h.beforeJson), after = JSON.parse(h.afterJson); return <article className="support-history" key={h.id}><strong>{h.actor} · {date(h.changedAt)}</strong><p>{before.Status ? supportStatuses[before.Status] : '문의 등록'} → {supportStatuses[after.Status]}</p>{before.Answer !== after.Answer && <><small>변경 전 답변</small><p className="support-message">{before.Answer || '없음'}</p><small>변경 후 답변</small><p className="support-message">{after.Answer || '없음'}</p></>}</article> })}{!data.history.length && <p>과거 피드백에는 처리 이력이 기록되어 있지 않습니다.</p>}</details>
    </div>
  </OrganizationDialog>
}
function AdminAssignment({ value, onChange }: { value: string; onChange: (value: string) => void }) { const view = useReportRead<{ id: string; name: string }[]>('/api/admin/support/administrators'); return <label>담당 관리자<select aria-label="담당 관리자" value={value} onChange={e => onChange(e.target.value)} disabled={!view.data}><option value="">미지정</option>{view.data?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>{view.error && <small role="alert">{view.error}</small>}</label> }
