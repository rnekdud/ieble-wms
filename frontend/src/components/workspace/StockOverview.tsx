import { t as uiText, getLocale } from '../../i18n.ts'
import { useMobile } from '../../use-mobile'
import PageSizeSelect from '../PageSizeSelect'
import SearchFilters from './SearchFilters'
import { canTask, reportEntry } from '../../dashboard-model'
import { lazy, Suspense, useRef, useState } from 'react'
import { Download, Package, Boxes, TriangleAlert, PackageCheck, List, Map, ChevronDown } from 'lucide-react'
import { useReportRead as useRead } from './useReportRead'
import Pagination from '../Pagination'
import OrganizationDialog from './OrganizationDialog'
import ChoiceField from './BusinessChoiceField'
import { PageHeading } from './WorkspaceUI'
import type { Choice } from '../../receipt-model'
import { movementLabels } from '../../inventory-model'
import { overviewDefaults, overviewDetailQuery, overviewFilter, overviewFilters, overviewParams, overviewRowKey, overviewViews, overviewLocationSpans } from '../../stock-overview-model'
import type { WarehouseOverviewRow, WarehouseOverviewResult, OverviewDetail, OverviewMovement, OverviewQuery, OverviewResult, OverviewRow } from '../../stock-overview-model'
import './receipts.css'
import './stock-overview.css'
import './warehouse-dashboard.css'
const WarehouseMap = lazy(() => import('./WarehouseDashboard'))

const num = (value: number) => value.toLocaleString(getLocale(), { maximumFractionDigits: 3 })
const date = (value: string) => new Date(value).toLocaleString(getLocale(), { timeZone: 'Asia/Seoul' })
function Statuses({ row }: { row: OverviewRow }) { return <div className="overview-statuses">{row.statuses.map(s => <span key={s} className={`status-badge overview-${s === '정상' ? 'normal' : s === '재고 없음' ? 'zero' : s === '유통기한 경과' ? 'expired' : 'warning'}`}>{uiText(s)}</span>)}</div> }
export default function StockOverview({ tenantId, permissions }: { tenantId: string; permissions: Record<string, string[]> }) {
  const mobile = useMobile(), [advancedOpen, setAdvancedOpen] = useState(false)
  const [mode, setMode] = useState<'list' | 'map'>('list')
  const mapAllowed = canTask(permissions, 'warehouses', 'read') && canTask(permissions, 'stock-overview', 'read')
  const endpoint = `/api/tenants/${tenantId}/reports/stock-overview`, [q, setQ] = useState<OverviewQuery>(() => ({ ...overviewDefaults, search: new URLSearchParams(window.location.search).get('search') || '', ...reportEntry(window.location.search) })), [revision, refresh] = useState(0)
  const [filters, setFilters] = useState(q)
  const [selectedWarehouse, setSelectedWarehouse] = useState<{ row: WarehouseOverviewRow; query: OverviewQuery }>()
  const [choiceRevision, resetChoices] = useState(0), [choices, setChoices] = useState<{ category?: Choice; warehouse?: Choice; zone?: Choice; rack?: Choice; location?: Choice }>({}), [selected, setSelected] = useState<{ row: OverviewRow; query: OverviewQuery }>()
  const [appliedChoices, setAppliedChoices] = useState(choices)
  const [downloading, setDownloading] = useState(''), [notice, setNotice] = useState(''), locked = useRef(false), { data, error, loading } = useRead<OverviewResult | WarehouseOverviewResult>(endpoint + (q.view === 'warehouse' ? '/warehouse-summary' : '') + '?' + overviewParams(q), revision)
  function filter(patch: Partial<OverviewQuery>) { setFilters(current => overviewFilter(current, patch)) }
  async function download(format: string) {
    if (locked.current) return; locked.current = true; setDownloading(format); setNotice('')
    try { const response = await fetch(`${endpoint}/export?${overviewParams({ ...q, format })}`, { credentials: 'same-origin', cache: 'no-store' }); if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.message || (response.status === 403 ? '다운로드 권한이 없습니다.' : '다운로드하지 못했습니다. 잠시 후 다시 시도해 주세요.')) }
      const blob = await response.blob(), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `재고현황-${q.view}-${new Date().toISOString().slice(0, 10)}.${format}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice(`${format.toUpperCase()} 파일을 다운로드했습니다. 클릭 시점의 필터에 해당하는 전체 결과입니다.`)
    } catch (e) { setNotice((e as Error).message) } finally { locked.current = false; setDownloading('') }
  }
  const cards = [
    { label: '등록 상품', value: data?.summary.registeredProducts, hint: '검색·분류·상품 사용 여부 기준', icon: Package },
    { label: '재고 보유 상품', value: data?.summary.holdingProducts, hint: '조회 범위에서 현재 재고가 있는 상품', icon: Boxes },
    { label: '안전재고 부족 상품', value: data?.summary.lowProducts, hint: '해당 상품의 전체 창고 가용 수량 기준', icon: TriangleAlert },
    { label: '출고 예약 상품', value: data?.summary.reservedProducts, hint: '조회 범위에 출고 예약이 있는 상품', icon: PackageCheck },
  ]
  return <div className="stock-overview"><PageHeading title={uiText("재고 현황")} actions={mode === 'list' && <> <button className="secondary" disabled={!!downloading || !data} onClick={() => download('xlsx')}><Download size={15} aria-hidden="true" />{downloading === 'xlsx' ? uiText("생성 중…") : mobile ? 'Excel' : uiText("Excel 다운로드")}</button><button className="secondary" disabled={!!downloading || !data} onClick={() => download('csv')}><Download size={15} aria-hidden="true" />{downloading === 'csv' ? uiText("생성 중…") : mobile ? 'CSV' : uiText("CSV 다운로드")}</button> </>} />
    <div className="wms-segmented overview-tabs overview-display-tabs" role="group" aria-label={uiText("재고 화면 보기")}>
      <button className={mode === 'list' ? 'primary' : 'secondary'} aria-pressed={mode === 'list'} onClick={() => { if (mode !== 'list') refresh(n => n + 1); setMode('list') }}><List size={16} aria-hidden="true" />{uiText("리스트 보기")}</button>
      {mapAllowed && <button className={mode === 'map' ? 'primary' : 'secondary'} aria-pressed={mode === 'map'} onClick={() => { setSelected(undefined); setMode('map') }}><Map size={16} aria-hidden="true" />{uiText("도면 보기")}</button>}
    </div>
    {mode === 'map' && mapAllowed ? <div className="warehouse-dashboard overview-map"><p className="overview-help">{uiText("선택 창고의 전체 재고 · 창고 선택은 리스트 보기에도 적용됩니다.")}</p><Suspense fallback={<p role="status">{uiText("재고 도면을 불러오는 중…")}</p>}><WarehouseMap tenantId={tenantId} inventory warehouseSelection={q.warehouseId} onWarehouseSelection={(id, warehouse) => { setQ(v => overviewFilter(v,{warehouseId:id})); setFilters(v => overviewFilter(v,{warehouseId:id})); setChoices(v => ({ category:v.category, warehouse })); setAppliedChoices(v => ({ category:v.category, warehouse })); }} onNavigate={() => {}} /></Suspense></div> : <>
    <div className="overview-summary" aria-label={uiText("재고 현황 요약")}>{cards.map(({ label, value, hint, icon: Icon }) => <div key={label}><div><span>{uiText(label)}</span><Icon size={18} aria-hidden="true" /></div><strong>{value === undefined ? '—' : num(value)}<small>{uiText("개")}</small></strong><p>{uiText(hint)}</p></div>)}</div>
    <section className="wms-card products-card"><div className="overview-topbar"><div className="wms-segmented overview-tabs" role="group" aria-label={uiText("재고 조회 방식")}>{Object.entries(overviewViews).map(([key, label]) => <button key={key} className={q.view === key ? 'primary' : 'secondary'} aria-pressed={q.view === key} onClick={() => { setQ(current => ({ ...current, view: key as OverviewQuery['view'], page: 1 })); setFilters(current => ({ ...current, view: key as OverviewQuery['view'] })) }}>{uiText(label)}</button>)}</div></div>
    <SearchFilters onReset={() => { const next = { ...overviewDefaults, view: q.view }; setFilters(next); setQ(next); setChoices({}); setAppliedChoices({}); resetChoices(n => n + 1); refresh(n => n + 1) }} busy={loading} onSearch={() => { setQ({ ...filters, page: 1 }); setAppliedChoices(choices); refresh(n => n + 1) }}>
<div className="overview-main-filters"><label>{uiText("재고 상태")}<select aria-label={uiText("재고 현황 상태")} value={filters.status} onChange={e => filter({ status: e.target.value })}>{Object.entries(overviewFilters).map(([key, value]) => <option key={key} value={key}>{uiText(value)}</option>)}</select></label><label>{uiText("상품 사용 여부")}<select aria-label={uiText("상품 사용 여부")} value={filters.active} onChange={e => filter({ active: e.target.value })}><option value="all">{uiText("전체")}</option><option value="active">{uiText("사용")}</option><option value="inactive">{uiText("미사용")}</option></select></label></div>
    {mobile && <button type="button" className="overview-filter-toggle" aria-expanded={advancedOpen} aria-controls="overview-advanced" onClick={() => setAdvancedOpen(open => !open)}>{uiText("상세 필터")}<ChevronDown size={16} aria-hidden="true" /></button>}
    <div id="overview-advanced" className="overview-advanced" hidden={mobile && !advancedOpen}><ChoiceField key={`category:${choiceRevision}`} endpoint={endpoint} kind="categories" label={uiText("상품 분류")} placeholder={uiText("상품 분류")} emptyOptionLabel="전체 분류" searchPlaceholder={uiText("상품 분류 검색")} value={filters.categoryId} current={choices.category} onChange={c => { setChoices(v => ({ ...v, category: c })); filter({ categoryId: c?.id || '' }) }} /><ChoiceField key={`warehouse:${choiceRevision}`} endpoint={endpoint} kind="warehouses" label={uiText("조회 창고")} placeholder={uiText("조회 창고")} emptyOptionLabel="전체 창고" searchPlaceholder={uiText("창고명·시스템 코드·내부 코드 검색")} value={filters.warehouseId} current={choices.warehouse} onChange={w => { setChoices(v => ({ category: v.category, warehouse: w })); filter({ warehouseId: w?.id || '' }) }} />{filters.warehouseId && <><ChoiceField key={`zone:${filters.warehouseId}`} endpoint={endpoint} kind="zones" label={uiText("조회 구역")} warehouseId={filters.warehouseId} value={filters.zoneId} current={choices.zone} onChange={z => { setChoices(v => ({ ...v, zone: z, rack: undefined, location: undefined })); filter({ zoneId: z?.id || '' }) }} /><ChoiceField key={`rack:${filters.warehouseId}:${filters.zoneId}`} endpoint={endpoint} kind="racks" label={uiText("조회 랙")} warehouseId={filters.warehouseId} zoneId={filters.zoneId} value={filters.rackId} current={choices.rack} onChange={r => { setChoices(v => ({ ...v, rack: r, location: undefined })); filter({ rackId: r?.id || '' }) }} /><ChoiceField key={`location:${filters.warehouseId}:${filters.zoneId}:${filters.rackId}`} endpoint={endpoint} kind="locations" label={uiText("조회 위치")} warehouseId={filters.warehouseId} zoneId={filters.zoneId} rackId={filters.rackId} value={filters.locationId} current={choices.location} onChange={l => { setChoices(v => ({ ...v, location: l })); filter({ locationId: l?.id || '' }) }} /></>}</div>
<label>{uiText("재고 검색")}<input aria-label={uiText("재고 현황 검색")} placeholder={uiText("상품명·코드·바코드·LOT·시리얼 검색")} maxLength={100} value={filters.search} onChange={e => filter({ search: e.target.value })} /></label>
</SearchFilters>
    <div className="overview-context"><span>{appliedChoices.warehouse ? `${appliedChoices.warehouse.name}${appliedChoices.zone ? ` / ${appliedChoices.zone.name}` : ''}${appliedChoices.rack ? ` / ${appliedChoices.rack.code}` : ''}${appliedChoices.location ? ` / ${appliedChoices.location.code}` : ''}` : uiText("전체 창고")} · {data ? uiText("조회 상품 {v0}개", { v0: num(data.summary.matchingProducts) }) : uiText("조회 중")}</span></div><p className="overview-help">{uiText("출고 가능 = 현재 재고 − 출고 예정. 안전재고 부족은 위치 필터와 관계없이 상품의 전체 창고 가용 수량으로 판단합니다. 미설정 상품은 부족으로 분류하지 않습니다.")}</p>
    {(error || notice) && <p className={`alert ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{uiText(error) || uiText(notice)}{error && <button className="secondary" onClick={() => refresh(n => n + 1)}>{uiText("다시 조회")}</button>}</p>}
    {q.view === 'warehouse' ? <WarehouseTotals items={data?.items as WarehouseOverviewRow[] | undefined} error={error} onDetail={row => setSelectedWarehouse({ row, query: { ...q } })} /> : <OverviewTable items={data?.items as OverviewRow[] | undefined} view={q.view} locationHierarchy={q.view === 'location'} error={error} onDetail={row => setSelected({ row, query: { ...q } })} />}
    <div className="overview-footer"><small>{uiText("다운로드:")} {q.view === 'warehouse' ? uiText("창고별 상품 상세") : uiText("필터 전체 결과")} {uiText("· 최대")} {num(data?.maxExportRows || 20000)}{uiText("행")}</small></div><Pagination pageSizeControl={<PageSizeSelect value={q.pageSize} onChange={pageSize => { setQ(v => ({ ...v, pageSize, page: 1 })); setFilters(v => ({ ...v, pageSize, page: 1 })); }} />} page={q.page} total={data?.total || 0} pageSize={q.pageSize} loading={loading || !!error} onChange={page => setQ({ ...q, page })} label={uiText("재고 현황 페이지")} /></section>
    </>}
    {mode === 'list' && selected && (selected.row.warehouseId ? <Detail endpoint={endpoint} row={selected.row} query={selected.query} onClose={() => setSelected(undefined)} /> : <ProductWarehouses endpoint={endpoint} row={selected.row} query={selected.query} onClose={() => setSelected(undefined)} />)}
    {mode === 'list' && selectedWarehouse && <WarehouseProducts endpoint={endpoint} warehouse={selectedWarehouse.row} query={selectedWarehouse.query} onClose={() => setSelectedWarehouse(undefined)} />}
  </div>
}
function OverviewTable({ items, view, locationHierarchy = false, error, onDetail }: { items?: OverviewRow[]; view: string; locationHierarchy?: boolean; error?: string; onDetail?: (row: OverviewRow) => void }) {
  const mobile = useMobile()
  if (mobile) return <div className="mobile-stock-list" aria-label={uiText("재고 현황 목록")}>{!items ? <p role="status">{uiText(error) || uiText("재고 현황을 불러오는 중…")}</p> : !items.length ? <p>{uiText("조회된 재고가 없습니다.")}</p> : items.map(row => <article className="mobile-stock-card" key={overviewRowKey(row)}>
    <div className="mobile-stock-heading"><h3>{row.productName}</h3><div className="mobile-stock-badges"><Statuses row={row}/><span className={`mobile-usage-badge ${row.isActive ? 'is-active' : 'is-inactive'}`}>{row.isActive ? uiText("사용") : uiText("미사용")}</span></div></div><p>{row.productCode} · {row.categoryName || uiText("미분류")}</p>
    {view !== 'product' && <p>{[row.warehouseName,row.zoneName,row.rackCode,row.locationName,row.locationCode].filter(Boolean).join(' · ') || uiText("미배치 재고")}</p>}
    {(row.lotNumber || row.expiryDate || row.serialNumber) && <p>{[row.lotNumber && `LOT ${row.lotNumber}`, row.expiryDate && uiText("유통기한 {v0}", { v0: row.expiryDate }), row.serialNumber && uiText("시리얼 {v0}", { v0: row.serialNumber })].filter(Boolean).join(' · ')}</p>}
    <dl><dt>{uiText("현재고")}</dt><dd>{num(row.quantity)} {row.unit}</dd><dt>{uiText("예약수량")}</dt><dd>{num(row.reservedQuantity)} {row.unit}</dd><dt>{uiText("가용재고")}</dt><dd>{num(row.availableQuantity)} {row.unit}</dd><dt>{uiText("안전재고 (상품 전체)")}</dt><dd>{row.safetyStock == null ? uiText("미설정") : `${num(row.safetyStock)} ${row.unit}`}</dd></dl>
    {onDetail && <button className="secondary" aria-label={uiText("{v0} 재고 상세", { v0: row.productName })} onClick={() => onDetail(row)}>{uiText("상세 보기")}</button>}
  </article>)}</div>
  const location = view === 'location', warehouse = view !== 'product', hierarchy = location && locationHierarchy
  const count = 8 + (warehouse ? 1 : 0) + (location ? 5 : 0) + (onDetail ? 1 : 0)
  const spans = hierarchy ? overviewLocationSpans(items || []) : []
  return <div className="table-scroll overview-scroll" tabIndex={0} role="region" aria-label={uiText("재고 현황 표 (가로 스크롤 가능)")}><table className={`organization-table overview-table ${location ? 'overview-location' : ''} ${hierarchy ? 'overview-location-groups' : ''}`}>
    <thead><tr>
      {hierarchy ? <><th>{uiText("창고")}</th><th>{uiText("구역 / 랙")}</th><th>{uiText("보관위치")}</th><th>{uiText("상품 정보")}</th></> : <><th>{uiText("상품코드 / 상품명")}</th><th>{uiText("상품 분류")}</th>{warehouse && <th>{uiText("창고")}</th>}{location && <><th>{uiText("구역 / 랙")}</th><th>{uiText("보관 위치")}</th><th>LOT</th><th>{uiText("유통기한")}</th><th>{uiText("시리얼")}</th></>}</>}
      <th className="quantity">{hierarchy ? uiText("현재고") : uiText("현재 재고")}</th><th className="quantity">{hierarchy ? uiText("예약 수량") : uiText("출고 예정")}</th><th className="quantity">{hierarchy ? uiText("가용 재고") : uiText("출고 가능")}</th>
      {hierarchy && <><th>{uiText("상품 분류")}</th><th>LOT</th><th>{uiText("유통기한")}</th><th>{uiText("시리얼")}</th></>}
      <th className="quantity">{uiText("안전재고")}<small>{uiText("상품 전체")}</small></th><th>{uiText("재고 상태")}</th><th>{uiText("사용 여부")}</th>{onDetail && <th>{uiText("관리")}</th>}
    </tr></thead>
    <tbody>{!items ? <tr><td colSpan={count}>{error ? uiText("재고 현황을 불러오지 못했습니다.") : uiText("재고 현황을 불러오는 중…")}</td></tr> : !items.length ? <tr><td colSpan={count}><div className="overview-empty"><Boxes size={28} aria-hidden="true" /><strong>{uiText("조회된 재고가 없습니다")}</strong><span>{uiText("검색 조건을 변경해 주세요. 재고 행이 없는 상품은 위치 필터 없이 상품별 보기에서 확인할 수 있습니다.")}</span></div></td></tr> : items.map((r, index) => <tr key={overviewRowKey(r)} className={hierarchy && spans[index].warehouse ? 'overview-warehouse-start' : hierarchy && spans[index].location ? 'overview-location-start' : undefined}>
      {hierarchy && <>
        {spans[index].warehouse > 0 && <td rowSpan={spans[index].warehouse} className="overview-location-cell overview-warehouse-cell">{r.warehouseName || uiText("창고 미지정")}</td>}
        {spans[index].rack > 0 && <td rowSpan={spans[index].rack} className="overview-location-cell"><div className="overview-cell-lines"><span>{r.zoneName || uiText("구역 미지정")}</span><small>{r.rackId ? r.rackName || r.rackCode || uiText("랙") : uiText("랙 미지정")}</small></div></td>}
        {spans[index].location > 0 && <td rowSpan={spans[index].location} className="overview-location-cell"><div className="overview-cell-lines"><span>{r.locationId ? r.locationName || r.locationCode || uiText("보관위치") : uiText("미배치")}</span>{r.locationId && r.locationCode && r.locationCode !== r.locationName && <small>{r.locationCode}</small>}</div></td>}
      </>}
      <td className="overview-product"><strong>{r.productCode}</strong><span title={r.productName}>{r.productName}</span>{r.unit !== 'EA' && <small>{r.unit}</small>}<small>{r.barcode || ''}</small></td>
      {!hierarchy && <><td>{r.categoryName || uiText("미분류")}</td>{warehouse && <td>{r.warehouseName}</td>}{location && <><td><div className="overview-cell-lines"><span>{r.zoneName || uiText("구역 미지정")}</span><small>{r.rackName || r.rackCode || uiText("바닥")}</small></div></td><td><div className="overview-cell-lines">{r.locationName && <span>{r.locationName}</span>}{r.locationCode && r.locationCode !== r.locationName && <small>{r.locationCode}</small>}</div></td><td>{r.lotNumber || '—'}</td><td>{r.expiryDate || '—'}</td><td>{r.serialNumber || '—'}</td></>}</>}
      <td className="quantity">{num(r.quantity)}</td><td className="quantity">{num(r.reservedQuantity)}</td><td className="quantity overview-available">{num(r.availableQuantity)}</td>
      {hierarchy && <><td>{r.categoryName || uiText("미분류")}</td><td>{r.lotNumber || '—'}</td><td>{r.expiryDate || '—'}</td><td>{r.serialNumber || '—'}</td></>}
      <td className="quantity" title={uiText("전체 창고 출고 가능 {v0} {v1}", { v0: num(r.globalAvailableQuantity), v1: r.unit })}>{!r.safetyComparable ? uiText("단위 확인") : r.safetyStock === null ? <span className="overview-unset">{uiText("미설정")}</span> : num(r.safetyStock)}{r.isLow && <small>{uiText("전체 가용")} {num(r.globalAvailableQuantity)}</small>}</td><td><Statuses row={r} /></td><td>{r.isActive ? uiText("사용") : uiText("미사용")}</td>{onDetail && <td><button className="secondary" aria-label={uiText("{v0} {v1} {v2} 상세", { v0: r.productCode, v1: r.warehouseName || '', v2: r.locationCode || '' })} onClick={() => onDetail(r)}>{uiText("상세")}</button></td>}
    </tr>)}</tbody>
  </table></div>
}
function Detail({ endpoint, row, query, onClose, onBack }: { endpoint: string; row: OverviewRow; query: OverviewQuery; onClose: () => void; onBack?: () => void }) {
  const [page, setPage] = useState(1), [revision, refresh] = useState(0), { data, error, loading } = useRead<OverviewDetail>(`${endpoint}/products/${row.productId}?${overviewParams(overviewDetailQuery(query, row, page))}`, revision)
  return <OrganizationDialog title={uiText("재고 현황 상세")} wide onClose={onClose}>{onBack && <button className="secondary" onClick={onBack}>{uiText("이전 목록")}</button>}{error ? <p role="alert" className="alert error">{uiText(error)}<button className="secondary" onClick={() => refresh(n => n + 1)}>{uiText("다시 조회")}</button></p> : !data ? <p role="status">{uiText("상세 정보를 불러오는 중…")}</p> : <><div className="receipt-summary"><h3>{data.product.name}<small>{data.product.code} · {data.product.barcode || uiText("바코드 미등록")}</small></h3><span className="status-badge">{data.product.isActive ? uiText("사용") : uiText("미사용")}</span></div><dl className="products-detail"><div><dt>{uiText("기준 단위 / 안전재고")}</dt><dd>{data.product.unit} / {data.product.safetyStock === null ? uiText("미설정") : num(data.product.safetyStock)}</dd></div><div><dt>{uiText("상품 추적")}</dt><dd>{[data.product.lotManaged && 'LOT', data.product.expiryManaged && '유통기한', data.product.serialManaged && '시리얼'].filter(Boolean).join(' · ') || uiText("일반 수량 관리")}</dd></div></dl><h3 className="overview-section-title">{uiText("창고·위치·추적별 재고")}</h3><OverviewTable items={data.items} view="location" /><Pagination page={page} pageSize={20} total={data.total} loading={loading} onChange={setPage} label={uiText("재고 상세 위치 페이지")} /><div className="overview-history"><History title={uiText("최근 입고")} items={data.recentReceipts} limit={5} /><History title={uiText("최근 출고")} items={data.recentShipments} limit={5} /><History title={uiText("최근 이동·조정·실사")} items={data.recentChanges} limit={10} /></div><p className="overview-help">{uiText("현재 선택한 상품·위치·추적 범위에 연결된 실제 재고 변동 기록입니다. 입고·출고는 각각 5건, 이동·조정·실사는 10건까지 표시합니다.")}</p></>}</OrganizationDialog>
}
function History({ title, items, limit }: { title: string; items: OverviewMovement[]; limit: number }) {
  return <section><h3>{uiText(title)}<small>{uiText("최근")} {limit}{uiText("건")}</small></h3>{!items.length ? <p className="overview-help">{uiText("연결된 처리 내역이 없습니다.")}</p> : <div className="table-scroll"><table className="organization-table overview-history-table"><thead><tr><th>{uiText("처리일시 / 문서")}</th><th>{uiText("작업")}</th><th className="quantity">{uiText("변동 수량")}</th><th>{uiText("담당자")}</th></tr></thead><tbody>{items.map(m => <tr key={m.id}><td>{date(m.createdAt)}<small>{m.number || '—'}</small>{(m.source || m.destination) && <small>{m.source}{m.destination ? ` → ${m.destination}` : ''}</small>}</td><td>{uiText(movementLabels[m.type]) || m.type}</td><td className="quantity">{m.quantity > 0 ? '+' : ''}{num(m.quantity)} {m.unit}</td><td>{m.actorName}</td></tr>)}</tbody></table></div>}</section>
}

function WarehouseTotals({ items, error, onDetail }: { items?: WarehouseOverviewRow[]; error?: string; onDetail: (row: WarehouseOverviewRow) => void }) {
 const quantity = (row: WarehouseOverviewRow, key: 'quantity' | 'reservedQuantity' | 'availableQuantity') => row.quantities.map(q => <div key={q.unit}>{num(q[key])}{q.unit === 'EA' ? uiText("개") : ` ${q.unit}`}</div>)
 const mobile = useMobile()
 if (mobile) return <div className="mobile-stock-list" aria-label={uiText("창고별 재고 목록")}>
  {!items ? <p role="status">{uiText(error) || uiText("재고를 불러오는 중…")}</p> : !items.length ? <p>{uiText("조회된 재고가 없습니다.")}</p> : items.map(row => <article className="mobile-stock-card" key={row.warehouseId}>
   <h3>{row.warehouseName}</h3><p>{uiText("상품 종류")} {num(row.productCount)}{uiText("종")}</p>
   <dl><dt>{uiText("현재고")}</dt><dd>{quantity(row, 'quantity')}</dd><dt>{uiText("예약수량")}</dt><dd>{quantity(row, 'reservedQuantity')}</dd><dt>{uiText("가용재고")}</dt><dd>{quantity(row, 'availableQuantity')}</dd></dl>
   <button className="secondary" aria-label={uiText("{v0} 상품별 재고", { v0: row.warehouseName })} onClick={() => onDetail(row)}>{uiText("상세")}</button>
  </article>)}
 </div>
 return <div className="table-scroll overview-scroll"><table className="organization-table" aria-label={uiText("창고별 재고")}><thead><tr><th>{uiText("창고명")}</th><th className="quantity">{uiText("상품 종류")}</th><th className="quantity">{uiText("현재고")}</th><th className="quantity">{uiText("예약")}</th><th className="quantity">{uiText("가용 재고")}</th><th>{uiText("관리")}</th></tr></thead><tbody>{!items ? <tr><td colSpan={6}>{error ? uiText("재고를 불러오지 못했습니다.") : uiText("재고를 불러오는 중…")}</td></tr> : !items.length ? <tr><td colSpan={6}>{uiText("조회된 재고가 없습니다.")}</td></tr> : items.map(row => <tr key={row.warehouseId}><td>{row.warehouseName}</td><td className="quantity">{num(row.productCount)}{uiText("종")}</td><td className="quantity">{quantity(row, 'quantity')}</td><td className="quantity">{quantity(row, 'reservedQuantity')}</td><td className="quantity">{quantity(row, 'availableQuantity')}</td><td><button className="secondary" aria-label={uiText("{v0} 상품별 재고", { v0: row.warehouseName })} onClick={() => onDetail(row)}>{uiText("상세")}</button></td></tr>)}</tbody></table></div>
}
function WarehouseProducts({ endpoint, warehouse, query, onClose }: { endpoint: string; warehouse: WarehouseOverviewRow; query: OverviewQuery; onClose: () => void }) {
 const [page, setPage] = useState(1), [revision, refresh] = useState(0), [selected, setSelected] = useState<OverviewRow>()
 const scoped = { ...query, warehouseId: warehouse.warehouseId, view: 'warehouse' as const, page, pageSize: 20 }
 const { data, error, loading } = useRead<OverviewResult>(endpoint + '?' + overviewParams(scoped), revision)
 if (selected) return <Detail endpoint={endpoint} row={selected} query={scoped} onClose={onClose} onBack={() => setSelected(undefined)} />
 return <OrganizationDialog title={uiText("{v0} · 상품별 재고", { v0: warehouse.warehouseName })} wide onClose={onClose}>{error && <p role="alert">{uiText(error)}<button className="secondary" onClick={() => refresh(n => n + 1)}>{uiText("다시 조회")}</button></p>}<OverviewTable items={data?.items} view="product" error={error} onDetail={setSelected} /><Pagination page={page} pageSize={20} total={data?.total || 0} loading={loading} onChange={setPage} label={uiText("창고 상품 페이지")} /></OrganizationDialog>
}
function ProductWarehouses({ endpoint, row, query, onClose }: { endpoint: string; row: OverviewRow; query: OverviewQuery; onClose: () => void }) {
 const [page, setPage] = useState(1), [revision, refresh] = useState(0), [selected, setSelected] = useState<OverviewRow>()
 const scoped = { ...overviewDetailQuery(query, row, page), view: 'warehouse', productId: row.productId }
 const { data, error, loading } = useRead<OverviewResult>(endpoint + '?' + overviewParams(scoped), revision)
 if (selected) return <Detail endpoint={endpoint} row={selected} query={query} onClose={onClose} onBack={() => setSelected(undefined)} />
 return <OrganizationDialog title={uiText("{v0} · 창고별 재고", { v0: row.productName })} wide onClose={onClose}>{error && <p role="alert">{uiText(error)}<button className="secondary" onClick={() => refresh(n => n + 1)}>{uiText("다시 조회")}</button></p>}<OverviewTable items={data?.items} view="warehouse" error={error} onDetail={setSelected} /><Pagination page={page} pageSize={20} total={data?.total || 0} loading={loading} onChange={setPage} label={uiText("상품 창고 페이지")} /></OrganizationDialog>
}
