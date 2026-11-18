import { useMobile } from '../../use-mobile'
import PageSizeSelect from '../PageSizeSelect'
import SearchFilters from './SearchFilters'
import { useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Download, ChevronDown, PackageCheck, PackageOpen } from 'lucide-react'
import MovementTrendChart from './MovementTrendChart'
import Pagination from '../Pagination'
import OrganizationDialog from './OrganizationDialog'
import ChoiceField from './BusinessChoiceField'
import ReportPeriodFields from './ReportPeriodFields'
import { PageHeading } from './WorkspaceUI'
import { useReportRead } from './useReportRead'
import type { Choice } from '../../receipt-model'
import { statsDefaults, statsDetailQuery, statsFilter, statsParams, statsViews } from '../../movement-stats-model'
import type { StatsFact, StatsQuery, StatsResult, StatsRow } from '../../movement-stats-model'
import './receipts.css'
import './stock-overview.css'
import './movement-stats.css'
const num = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 3 })
const date = (s?: string) => s ? new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '—'
const types: Record<string, string> = { SUPPLIER: '매입처', CUSTOMER: '매출처', BOTH: '매입·매출처' }
export default function MovementStats({ tenantId }: { tenantId: string }) {
  const mobile = useMobile(), [advancedOpen, setAdvancedOpen] = useState(false)
  const endpoint = `/api/tenants/${tenantId}/reports/movement-stats`, [q, setQ] = useState<StatsQuery>(statsDefaults), [revision, refresh] = useState(0), [preset, setPreset] = useState('30')
 const [filters, setFilters] = useState(q)
  const [choiceRevision, resetChoices] = useState(0), [choices, setChoices] = useState<Record<string, Choice | undefined>>({}), [selected, setSelected] = useState<{ title: string; query: StatsQuery }>(), [busy, setBusy] = useState(''), [notice, setNotice] = useState(''), locked = useRef(false)
  const { data, error, loading } = useReportRead<StatsResult>(endpoint + '?' + statsParams(q), revision)
  function filter(p: Partial<StatsQuery>) { setFilters(v => statsFilter(v, p)) }
  async function download(format: string) {
    if (locked.current) return; locked.current = true; setBusy(format); setNotice('')
    try { const r = await fetch(`${endpoint}/export?${statsParams(q)}&format=${format}`, { credentials: 'same-origin', cache: 'no-store' }); if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || '다운로드하지 못했습니다. 잠시 후 다시 시도해 주세요.') } const url = URL.createObjectURL(await r.blob()), a = document.createElement('a'); a.href = url; a.download = `입출고통계-${q.view}-${data?.start}-${data?.end}.${format}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice(`${format.toUpperCase()} 다운로드 완료 · 선택한 기간과 필터의 전체 결과입니다.`) } catch (e) { setNotice((e as Error).message) } finally { locked.current = false; setBusy('') }
  }
  function detail(row: StatsRow | StatsFact) { setSelected({ title: 'documentId' in row ? row.number : row.name, query: statsDetailQuery({ ...q, start: q.start || data!.start, end: q.end || data!.end }, row) }) }
  const cards = [{ label: '입고 확정 건수', key: 'receipts', icon: ArrowDownToLine, unit: '건' }, { label: '출고 확정 건수', key: 'shipments', icon: ArrowUpFromLine, unit: '건' }, { label: '입고 처리 상품 종류', key: 'receiptProducts', icon: PackageCheck, unit: '종' }, { label: '출고 처리 상품 종류', key: 'shipmentProducts', icon: PackageOpen, unit: '종' }] as const
  const filterPanel = <section className="stats-filter-row"><SearchFilters id="movement-stats-filters" onReset={() => { const next = statsDefaults; setFilters(next); setQ(next); setChoices({}); resetChoices(n => n + 1); setPreset('30'); refresh(n => n + 1) }} busy={loading} onSearch={() => { setQ({ ...filters, page: 1 }); refresh(n => n + 1) }}><div className="stats-period"><ReportPeriodFields start={filters.start || data?.start || ''} end={filters.end || data?.end || ''} today={data?.today} preset={preset} prefix="통계" onPreset={setPreset} onChange={filter} /><label>입출고 구분<select value={filters.direction} aria-label="입출고 구분" onChange={e => filter({ direction: e.target.value })}><option value="all">입고·출고 전체</option><option value="receipt">입고</option><option value="shipment">출고</option></select></label></div>

    {mobile && <button type="button" className="overview-filter-toggle" aria-expanded={advancedOpen} aria-controls="stats-filters" onClick={() => setAdvancedOpen(open => !open)}>상세 필터<ChevronDown size={16} aria-hidden="true" /></button>}
    <div id="stats-filters" className="overview-advanced" hidden={mobile && !advancedOpen}>{([{ kind: 'warehouses', key: 'warehouseId', label: '조회 창고' }, { kind: 'products', key: 'productId', label: '조회 상품' }, { kind: 'categories', key: 'categoryId', label: '상품 분류' }, { kind: 'partners', key: 'partnerId', label: '조회 거래처' }] as const).map(c => <ChoiceField key={`${c.kind}:${choiceRevision}`} endpoint={endpoint} kind={c.kind} label={c.label} value={filters[c.key]} current={choices[c.key]} onChange={v => { setChoices(old => ({ ...old, [c.key]: v })); filter({ [c.key]: v?.id || '' }) }} />)}</div>
    <p className="overview-help">KST 확정일 기준 · 예정·예약·취소 및 재고 이동·조정·실사는 제외합니다. 상품과 거래처가 미사용 상태여도 과거 실적은 조회됩니다.</p><label>통합 검색<input aria-label="입출고 통계 검색" value={filters.search} maxLength={100} placeholder="문서번호·상품명·상품코드·거래처명" onChange={e => filter({ search: e.target.value })} /></label>
</SearchFilters></section>
  return <div className="movement-stats"><PageHeading title="입출고 통계" actions={<> {['xlsx', 'csv'].map(f => <button type="button" key={f} className="secondary" disabled={!!busy || !data} onClick={() => download(f)}><Download size={15} />{busy === f ? '생성 중…' : `${f === 'xlsx' ? 'Excel' : 'CSV'}${mobile ? '' : ' 다운로드'}`}</button>)} </>} />
    {!mobile && filterPanel}
    <div className="overview-summary" aria-label="입출고 통계 요약">{cards.map(({ label, key, icon: Icon, unit }) => <div key={key}><div><span>{label}</span><Icon size={18} /></div><strong>{data ? num(data.summary[key]) : '—'}<small>{unit}</small></strong><p>{key.endsWith('Products') ? '조회 기간의 중복 없는 상품 수' : '상품 행·배치 수와 무관한 문서 수'}</p></div>)}</div>
    {error && <p className="alert error" role="alert">{error}<button className="secondary" onClick={() => refresh(v => v + 1)}>다시 조회</button></p>}
    <section className="wms-card stats-chart-card"><div className="stats-chart-heading"><div><h2>입출고 추이</h2><p>확정 문서 수 · {data ? `${data.start} ~ ${data.end}` : '조회 중'}</p></div><label>집계 간격<select aria-label="추이 집계 간격" value={q.bucket} onChange={e => { setQ(v => ({ ...v, bucket: e.target.value })); setFilters(v => ({ ...v, bucket: e.target.value })) }}><option value="auto">자동</option><option value="day">일별</option><option value="week">주별</option><option value="month">월별</option></select></label></div>
    {data ? <><MovementTrendChart data={data.trend} />{data.summary.receipts + data.summary.shipments === 0 && <p className="overview-help">선택한 기간과 조건에 확정된 입출고가 없습니다.</p>}<details className="stats-trend-data"><summary>추이 데이터 표 보기</summary><div className="table-scroll"><table className="organization-table"><thead><tr><th>기간</th><th>입고 확정</th><th>출고 확정</th></tr></thead><tbody>{data.trend.map(d => <tr key={d.start}><td>{d.start} ~ {d.end}</td><td>{num(d.receipts)}</td><td>{num(d.shipments)}</td></tr>)}</tbody></table></div></details></> : <p role="status">{error ? '추이를 불러오지 못했습니다.' : '입출고 추이를 불러오는 중…'}</p>}</section>
    <section className="wms-card products-card stats-results"><div className="overview-topbar"><div className="wms-segmented overview-tabs" role="group" aria-label="입출고 통계 조회 방식">{Object.entries(statsViews).map(([key, label]) => <button key={key} className={q.view === key ? 'primary' : 'secondary'} aria-pressed={q.view === key} onClick={() => { setQ(v => ({ ...v, view: key as StatsQuery['view'], page: 1 })); setFilters(v => ({ ...v, view: key as StatsQuery['view'] })) }}>{label}</button>)}</div></div>
    {mobile && filterPanel}
    <p className="overview-help">{q.view === 'product' ? '수량 차이 = 입고 수량 − 출고 수량. 현재 재고를 의미하지 않으며, 상품과 기준 단위별로 구분합니다.' : q.view === 'detail' ? '입고는 상품 행, 출고는 확정된 위치·LOT·시리얼 배치별로 표시합니다. 아래 행 수는 문서 건수와 다릅니다.' : '문서 및 상품 종류는 중복을 제외합니다. 서로 다른 단위의 수량은 합산하지 않습니다.'}</p>
    {notice && <p className="alert" role="status">{notice}</p>}<StatsTable items={data?.items} view={q.view} error={error} onDetail={detail} /><div className="overview-footer"><small>다운로드: 현재 필터 전체 결과 · 최대 {num(data?.maxExportRows || 20000)}행</small></div><Pagination pageSizeControl={<PageSizeSelect value={q.pageSize} onChange={pageSize => { setQ(v => ({ ...v, pageSize, page: 1 })); setFilters(v => ({ ...v, pageSize, page: 1 }));  }} />} page={q.page} total={data?.total || 0} pageSize={q.pageSize} loading={loading || !!error} onChange={page => setQ(v => ({ ...v, page }))} label="입출고 통계 페이지" /></section>
    {selected && <StatsDetail endpoint={endpoint} title={selected.title} query={selected.query} onClose={() => setSelected(undefined)} />}
  </div>
}
function StatsTable({ items, view, error, onDetail }: { items?: (StatsRow | StatsFact)[]; view: string; error?: string; onDetail?: (row: StatsRow | StatsFact) => void }) {
  const mobile = useMobile()
  if (mobile) return <StatsCards items={items} view={view} error={error} onDetail={onDetail} />
  const headers = view === 'detail' ? ['확정일시 / 구분', '문서번호', '거래처 / 창고', '상품코드 / 상품명', 'LOT / 유통기한 / 시리얼', '확정 수량', '확정 담당자'] : view === 'product' ? ['상품코드 / 상품명', '분류', '입고 건수', '입고 수량', '출고 건수', '출고 수량', '수량 차이'] : view === 'warehouse' ? ['창고코드 / 창고명', '입고 건수', '출고 건수', '입고 상품 종류', '출고 상품 종류'] : ['거래처코드 / 거래처명', '유형', '입고 건수', '출고 건수', '최근 처리일']
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="입출고 통계 표 (가로 스크롤 가능)"><table className={`organization-table stats-table stats-${view}`}><thead><tr>{headers.map(h => <th key={h} className={/건수|수량|상품 종류/.test(h) ? 'quantity' : ''}>{h}</th>)}{onDetail && <th>관리</th>}</tr></thead><tbody>{!items || !items.length ? <tr><td colSpan={headers.length + (onDetail ? 1 : 0)}><div className="overview-empty"><strong>{error ? '통계를 불러오지 못했습니다.' : !items ? '통계를 불러오는 중…' : '확정된 입출고 실적이 없습니다.'}</strong><span>조회 기간과 필터를 확인해 주세요.</span></div></td></tr> : items.map(row => { if ('documentId' in row) return <tr key={`${row.direction}:${row.rowId}`}><td>{date(row.confirmedAt)}<small className={`stats-direction stats-${row.direction}`}>{row.direction === 'receipt' ? '입고' : '출고'}</small></td><td>{row.number}</td><td>{row.partnerName}<small>{row.warehouseName}</small></td><td>{row.productCode}<small>{row.productName}</small>{row.unit !== "EA" && <small>{row.unit}</small>}</td><td>{row.lotNumber || '—'}<small>{row.expiryDate || '—'} / {row.serialNumber || '—'}</small></td><td className="quantity">{num(row.quantity)}</td><td>{row.actorName}</td>{onDetail && <td><button className="secondary" aria-label={`${row.number} 상세`} onClick={() => onDetail(row)}>상세</button></td>}</tr>
    return <tr key={`${row.id}:${row.unit || ''}`}><td><strong>{row.code}</strong><small>{row.name}</small>{row.unit && row.unit !== "EA" && <small>{row.unit}</small>}</td>{view === 'product' && <><td>{row.categoryName || '미분류'}</td></>}{view === 'partner' && <td>{types[row.partnerType || ''] || '—'}</td>}<td className="quantity">{num(row.receipts)}</td>{view === 'product' && <td className="quantity">{num(row.receiptQuantity)}</td>}<td className="quantity">{num(row.shipments)}</td>{view === 'product' && <><td className="quantity">{num(row.shipmentQuantity)}</td><td className="quantity">{row.difference > 0 ? '+' : ''}{num(row.difference)}</td></>}{view === 'warehouse' && <><td className="quantity">{num(row.receiptProducts)}</td><td className="quantity">{num(row.shipmentProducts)}</td></>}{view === 'partner' && <td>{date(row.lastProcessedAt)}</td>}{onDetail && <td><button className="secondary" aria-label={`${row.code} 상세`} onClick={() => onDetail(row)}>상세</button></td>}</tr> })}</tbody></table></div>
}
function StatsCards({ items, view, error, onDetail }: { items?: (StatsRow | StatsFact)[]; view: string; error?: string; onDetail?: (row: StatsRow | StatsFact) => void }) {
  if (!items?.length) return <div className="overview-empty" role="status"><strong>{error ? '통계를 불러오지 못했습니다.' : !items ? '통계를 불러오는 중…' : '확정된 입출고 실적이 없습니다.'}</strong><span>조회 기간과 필터를 확인해 주세요.</span></div>
  return <div className="mobile-stock-list stats-mobile-list" aria-label="입출고 통계 목록">{items.map(row => {
    if ('documentId' in row) return <article className="mobile-stock-card" key={`${row.direction}:${row.rowId}`}>
      <div className="mobile-stock-heading"><h3>{row.number}</h3><span className={`status-badge stats-${row.direction}`}>{row.direction === 'receipt' ? '입고' : '출고'}</span></div>
      <p>{row.productName} · {row.productCode}</p>
      <dl><dt>확정일시</dt><dd>{date(row.confirmedAt)}</dd><dt>거래처</dt><dd>{row.partnerName}</dd><dt>창고</dt><dd>{row.warehouseName}</dd>
        <dt>확정 수량</dt><dd>{num(row.quantity)} {row.unit}</dd><dt>확정 담당자</dt><dd>{row.actorName}</dd>
        <dt>LOT</dt><dd>{row.lotNumber || '—'}</dd><dt>유통기한</dt><dd>{row.expiryDate || '—'}</dd><dt>시리얼</dt><dd>{row.serialNumber || '—'}</dd></dl>
      {onDetail && <div className="stats-mobile-actions"><button className="secondary" aria-label={`${row.number} 상세`} onClick={() => onDetail(row)}>상세 보기</button></div>}
    </article>
    return <article className="mobile-stock-card" key={`${row.id}:${row.unit || ''}`}>
      <div className="mobile-stock-heading"><h3>{row.name}</h3></div><p>{row.code}{view === 'product' ? ` · ${row.categoryName || '미분류'}` : view === 'partner' ? ` · ${types[row.partnerType || ''] || '—'}` : ''}</p>
      <dl><dt>입고 건수</dt><dd>{num(row.receipts)}건</dd>{view === 'product' && <><dt>입고 수량</dt><dd>{num(row.receiptQuantity)} {row.unit}</dd></>}
        <dt>출고 건수</dt><dd>{num(row.shipments)}건</dd>{view === 'product' && <><dt>출고 수량</dt><dd>{num(row.shipmentQuantity)} {row.unit}</dd><dt>수량 차이</dt><dd>{row.difference > 0 ? '+' : ''}{num(row.difference)} {row.unit}</dd></>}
        {view === 'warehouse' && <><dt>입고 상품 종류</dt><dd>{num(row.receiptProducts)}종</dd><dt>출고 상품 종류</dt><dd>{num(row.shipmentProducts)}종</dd></>}
        {view === 'partner' && <><dt>최근 처리일</dt><dd>{date(row.lastProcessedAt)}</dd></>}</dl>
      {onDetail && <div className="stats-mobile-actions"><button className="secondary" aria-label={`${row.code} 상세`} onClick={() => onDetail(row)}>상세 보기</button></div>}
    </article>
  })}</div>
}
function StatsDetail({ endpoint, title, query, onClose }: { endpoint: string; title: string; query: StatsQuery; onClose: () => void }) {
  const [page, setPage] = useState(1), { data, error, loading } = useReportRead<StatsResult>(endpoint + '?' + statsParams({ ...query, page }))
  return <OrganizationDialog title="입출고 실적 상세" wide onClose={onClose}><h3>{title}</h3><p className="overview-help">{query.start} ~ {query.end} · 확정 기록 조회{query.documentId ? ' · 선택한 문서의 전체 상품·배치' : ''}</p>{error && <p className="alert error" role="alert">{error}</p>}<StatsTable items={data?.items} view="detail" error={error} /><Pagination page={page} total={data?.total || 0} pageSize={query.pageSize} loading={loading || !!error} onChange={setPage} label="통계 상세 페이지" /></OrganizationDialog>
}
