import PageSizeSelect from '../PageSizeSelect'
import { readFixedPage } from '../../read-fixed-page'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import Pagination from '../Pagination'
import { PageHeading } from './WorkspaceUI'
import SearchFilters from './SearchFilters'
import ReportPeriodFields from './ReportPeriodFields'
import OrganizationDialog from './OrganizationDialog'

const sources: Record<string, string> = { organization: '기업·조직·구성원', permissions: '권한 설정', collaborators: '외부 협력사 권한', warehouses: '창고·도면·바코드', products: '상품·바코드', partners: '거래처' }
type Entry = { id: number; source: string; action: string; actor: string; changedAt: string }
type Result = { items: Entry[]; total: number; pageSize: number }
const empty = { search: '', source: '', start: '', end: '' }
const fields: Record<string, string> = { Name: '이름', DisplayName: '사용자 이름', Address: '주소', ContactName: '담당자', ContactPhone: '연락처', RepresentativeName: '대표자', BusinessRegistrationNumber: '사업자등록번호', LogoVersion: '기업 로고', IsActive: '사용 여부', Code: '코드', Barcode: '바코드', Role: '권한', DepartmentId: '부서', PositionId: '직급' }
function content(value: unknown): string { return value == null ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value) }
function changes(before: unknown, after: unknown) {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [{ name: '변경 내용', before: content(before), after: content(after) }]
  const a = before as Record<string, unknown>, b = after as Record<string, unknown>
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map(key => ({ name: fields[key] || key, before: content(a[key]), after: content(b[key]) }))
}
export default function ActivityLog({ tenantId }: { tenantId: string }) {
  const [draft, setDraft] = useState(empty), [applied, setApplied] = useState(empty), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20), [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; data?: Result; error?: string }>()
  const [detail, setDetail] = useState<{ entry: Entry; rows?: ReturnType<typeof changes>; reason?: string; error?: string }>()
  const detailRequest = useRef(0)
  const endpoint = `/api/tenants/${tenantId}/activity-log`
  const query = `${endpoint}?${new URLSearchParams({ ...applied, page: String(page), pageSize: String(pageSize) })}`
  const key = `${query}:${revision}`, busy = result?.key !== key, data = result?.data, error = !busy && result?.error
  useEffect(() => { let live = true; readFixedPage<Result>(query).then(data => { if (live) setResult({ key, data }) }).catch(e => { if (live) setResult({ key, error: e instanceof Error ? e.message : '활동 로그를 조회하지 못했습니다.' }) }); return () => { live = false } }, [query, key])
  useEffect(() => () => { detailRequest.current++ }, [])
  async function open(entry: Entry) { const request = ++detailRequest.current; setDetail({ entry }); try { const result = await api<{ before: unknown; after: unknown; reason?: string }>(`${endpoint}/${entry.source}/${entry.id}`); if (request === detailRequest.current) setDetail({ entry, rows: changes(result.before, result.after), reason: result.reason }) } catch (e) { if (request === detailRequest.current) setDetail({ entry, error: e instanceof Error ? e.message : '변경 내용을 불러오지 못했습니다.' }) } }
  return <><PageHeading title="활동 로그" />
    <SearchFilters className="mobile-management-filters" busy={busy} onSearch={() => { setApplied({ ...draft }); setPage(1); setRevision(x => x + 1) }} onReset={() => { setDraft(empty); setApplied(empty); setPage(1); setRevision(x => x + 1) }}>
      <ReportPeriodFields prefix="활동 로그" start={draft.start} end={draft.end} onChange={range => setDraft({ ...draft, ...range })} />

      <label>구분<select value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value })}><option value="">전체</option>{Object.entries(sources).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>검색<input value={draft.search} maxLength={200} placeholder="작업자·작업 검색" onChange={e => setDraft({ ...draft, search: e.target.value })} /></label>
</SearchFilters>
    {error && <p className="alert error" role="alert">{error}</p>}
    <div className="wms-table-scroll"><table className="wms-table mobile-record-table mobile-management-table"><thead><tr><th>변경일시</th><th>구분</th><th>작업자</th><th>작업</th><th>관리</th></tr></thead><tbody>{data?.items.map(entry => <tr key={`${entry.source}:${entry.id}`}><td data-label="변경일시">{new Date(entry.changedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</td><td data-label="구분">{sources[entry.source]}</td><td data-label="작업자">{entry.actor}</td><td data-label="작업">{entry.action}</td><td data-label="관리"><button className="text-button" onClick={() => void open(entry)}>변경 내용</button></td></tr>)}{!busy && !error && !data?.items.length && <tr><td colSpan={5}>조회된 활동 로그가 없습니다.</td></tr>}</tbody></table></div>
    <Pagination pageSizeControl={<PageSizeSelect value={pageSize} onChange={size => { setPageSize(size); setPage(1) }} />} page={page} pageSize={data?.pageSize || 20} total={data?.total || 0} loading={busy} onChange={setPage} />
    {detail && <OrganizationDialog title="활동 로그 상세" onClose={() => { detailRequest.current++; setDetail(undefined) }}>
      <p>{sources[detail.entry.source]} · {detail.entry.actor} · {detail.entry.action}</p>
      {detail.reason && <p>변경 사유: {detail.reason}</p>}
      {detail.error ? <p role="alert" className="alert error">{detail.error}</p> : !detail.rows ? <p role="status">변경 내용을 불러오는 중…</p> : <div className="wms-table-scroll"><table className="wms-table activity-detail"><thead><tr><th>항목</th><th>변경 전</th><th>변경 후</th></tr></thead><tbody>{detail.rows.map(row => <tr key={row.name}><th>{row.name}</th><td><pre>{row.before}</pre></td><td><pre>{row.after}</pre></td></tr>)}</tbody></table>{!detail.rows.length && <p>변경된 값이 없습니다.</p>}</div>}
    </OrganizationDialog>}
  </>
}
