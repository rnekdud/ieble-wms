import { useLanguage } from '../../use-language'
import { t as uiText, getLocale } from '../../i18n.ts'
import type { ReactNode } from 'react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Hand, RefreshCw, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import PlanCanvas, { type PlanCanvasHandle } from './PlanCanvas'
import { type RackFrontData } from './RackFrontDialog'
import { useLiveInventory } from './useLiveInventory'
import type { PlanResponse } from '../../warehouse-plan-model'
import type { OverviewRow } from '../../stock-overview-model'
import { riskStates } from '../../warehouse-risk'
import type { RiskSnapshot } from '../../warehouse-risk'
import { RackRiskPopover } from './WarehouseRiskDetails'
import ScheduledWorkDialog from './ScheduledWorkDialog'
import DashboardRackDialog from './DashboardRackDialog'
import DashboardAlertDialog from './DashboardAlertDialog'
import { rackQuantitySummary, type RackTotal } from '../../dashboard-rack-label'
import SearchableChoiceField, { type ChoicePage } from './SearchableChoiceField'
import { api } from '../../api'
import { readDashboardWarehouse, rememberDashboardWarehouse, resolveDashboardWarehouse } from '../../dashboard-warehouse-selection'
import type { Choice } from '../../receipt-model'
import { readDashboardView, rememberDashboardView } from '../../dashboard-view-preference'
const DashboardWarehouse3D = lazy(() => import('./DashboardWarehouse3D'))
import './warehouse-plan.css'
import './warehouse-risk.css'
type Summary = { id: string; code: string; name: string }
type Rack = { id: string; code: string; name: string; products: number }
type Snapshot = { asOf: string; warehouse: Summary; plan: PlanResponse; racks: Rack[]; rackTotals: RackTotal[]; risk: RiskSnapshot; detail: null | { front: RackFrontData; locations: { id: string; products: number; reserved: boolean }[]; stock: { items: OverviewRow[]; total: number; page: number; pageSize: number; locationId: string | null } } }
const asChoice = (w: Summary): Choice => ({ ...w, unit: null, lotManaged: false, expiryManaged: false, serialManaged: false })
const date = (v: string) => new Date(v).toLocaleTimeString(getLocale(), { timeZone: 'Asia/Seoul' })
export default function WarehouseDashboard({ tenantId, userId = '', onNavigate, inventory = false, warehouseSelection, onWarehouseSelection, mobile = false, mobileActions }: { userId?: string; mobile?: boolean; mobileActions?: ReactNode; tenantId: string; onNavigate: (path: string) => void; inventory?: boolean; warehouseSelection?: string; onWarehouseSelection?: (id: string, warehouse: Choice) => void }) {
  const [viewSettings, setViewSettings] = useState(() => readDashboardView(userId, tenantId))
  const view = inventory ? '2d' : viewSettings.view
  function changeView(settings: typeof viewSettings) { setViewSettings(settings); rememberDashboardView(userId, tenantId, settings); clearHover() }
  const root = `/api/tenants/${tenantId}/${inventory ? 'reports/stock-overview' : 'dashboard'}/warehouses`
  const list = useLiveInventory<{ asOf: string; warehouses: Summary[] }>(`${root}?compact=true`, tenantId, 15000)
  const [selection, setSelection] = useState(() => inventory ? '' : readDashboardWarehouse(tenantId))
  const warehouse = resolveDashboardWarehouse(list.data?.warehouses || [], warehouseSelection ?? selection)
  const warehouseId = warehouse?.id || ''
  useEffect(() => {
    if (list.data && !inventory) rememberDashboardWarehouse(tenantId, warehouseId)
  }, [warehouseId, tenantId, list.data, inventory])
  useEffect(() => {
    if (inventory && warehouse && warehouseSelection !== warehouse.id) onWarehouseSelection?.(warehouse.id, asChoice(warehouse))
  }, [inventory, warehouse, warehouseSelection, onWarehouseSelection])
  const loadWarehouses = useCallback(async (search: string, page: number): Promise<ChoicePage> => {
    const result = await api<{ items: { warehouse: Summary & { customCode?: string } }[]; total: number; pageSize: number }>(`/api/tenants/${tenantId}/warehouses?${new URLSearchParams({ status: 'active', search, page: String(page) })}`)
    return { ...result, items: result.items.map(item => asChoice(item.warehouse)) }
  }, [tenantId])
  const [pick, setPick] = useState({ warehouse: '', rack: '', location: '', page: 1, riskPage:1, expiryPage:1 })
  const current = pick.warehouse === warehouseId ? pick : { warehouse: warehouseId, rack: '', location: '', page: 1, riskPage:1, expiryPage:1 }
  const query = new URLSearchParams({ page: String(current.page), riskPage:String(current.riskPage), expiryPage:String(current.expiryPage), ...(current.rack ? { rackId: current.rack } : {}), ...(current.location ? { locationId: current.location } : {}) })
  const live = useLiveInventory<Snapshot>(warehouseId ? `${root}/${warehouseId}?${query}` : null, tenantId, 15000, warehouseId ? `${root}/${warehouseId}` : null)
  const data = live.data, risk = data?.risk, canvas = useRef<PlanCanvasHandle>(null), [pan, setPan] = useState(false)
  const [alertKind, setAlertKind] = useState<'shortage' | 'expiry' | null>(null)
  const [scheduled, setScheduled] = useState<'receipts' | 'shipments' | null>(null)
  const [hover, setHover] = useState<{ warehouse:string; id:string; x:number; y:number } | null>(null), hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearHover = useCallback(() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setHover(null) }, [setHover])
  const keepHover = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }
  const leaveHover = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setHover(null), 180) }
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])
  const language = useLanguage()
  const riskById = useMemo(() => new Map(risk?.racks.map(r => [r.id, r]) || []), [risk?.racks])
  const rack = data?.racks.find(r => r.id === current.rack), rackRisk = risk?.racks.find(r => r.id === current.rack)
  const hovered = hover?.warehouse === warehouseId ? risk?.racks.find(r => r.id === hover.id) : undefined
  const appearance = useMemo(() => Object.fromEntries((data?.racks || []).map(r => { const status = riskById.get(r.id)?.status || 'review'; return [r.id, { fill: riskStates[status].fill, label: r.name || r.code, quantity: rackQuantitySummary((data?.rackTotals || []).filter(t => t.rackId === r.id), r.products), statusLabel: language === 'en' ? uiText(riskStates[status].label) : riskStates[status].label, meshColor: status === 'danger' ? '#d64545' : status === 'warning' ? '#df9c24' : undefined, summary: `${uiText(riskStates[status].label)} · ${rackQuantitySummary((data?.rackTotals || []).filter(t => t.rackId === r.id), r.products)}` }] })), [data?.racks, data?.rackTotals, riskById, language])
  const displayPlan = useMemo(() => data ? { ...data.plan, objects: data.plan.objects.map(o => o.type === 'rack' && (!o.rackId || !appearance[o.rackId]) ? { ...o, fill: riskStates.review.fill, label: `${o.label}\n${uiText('연결 확인 필요')}` } : o) } : null, [data, appearance])
  const selected = data?.plan.objects.filter(o => o.rackId === current.rack).map(o => o.id) || []
  function selectRack(id: string) { clearHover(); setPick({ warehouse: warehouseId, rack: id, location: '', page: 1, riskPage:1, expiryPage:1 }) }
  const detail = data?.detail?.front.rack.id === current.rack ? data.detail : null
  const riskDetail = risk?.detail?.rackId === current.rack ? risk.detail : null
  const stock = detail?.stock.locationId === (current.location || null) && detail.stock.page === current.page ? detail.stock : undefined
  const warehousePicker = <div className="dashboard-warehouse-title is-title-picker" role="heading" aria-level={2}>
      <SearchableChoiceField titleTrigger hideLabel compact floating endpoint={root} kind="warehouses" label={inventory ? uiText("재고 도면 창고") : uiText("대시보드 창고")} required value={warehouseId} current={warehouse ? asChoice(warehouse) : undefined} loadPage={loadWarehouses}
        disabled={!list.data?.warehouses.length || list.data.warehouses.length === 1} placeholder={list.data ? uiText("활성 창고 없음") : uiText("창고 불러오는 중…")} searchPlaceholder={uiText("창고명·시스템 코드·내부 코드 검색")}
        onChange={item => { if (!item) return; setSelection(item.id); onWarehouseSelection?.(item.id, item); setPick({ warehouse: item.id, rack: '', location: '', page: 1, riskPage: 1, expiryPage: 1 }); clearHover(); setScheduled(null); setAlertKind(null); setPan(false); list.refresh() }}/>
    </div>
  return <>
    <div className={`warehouse-dashboard-heading${inventory ? '' : ' wms-page-header dashboard-summary-heading'}`}>
      {!inventory && <div className="warehouse-dashboard-title dashboard-title-with-warehouse"><h1>{uiText("대시보드")}</h1><span aria-hidden="true">/</span>{warehousePicker}</div>}
      {!inventory && <div className={`warehouse-dashboard-controls${mobile ? ' mobile-dashboard-refresh' : ''}`}><small className="warehouse-dashboard-updated"><span>{uiText("15초 자동 갱신")}</span><span>{uiText("마지막 갱신")} {data ? mobile ? new Date(data.asOf).toLocaleTimeString(getLocale(), { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : `${date(data.asOf)} KST` : '—'}</span></small><button className={`secondary${mobile ? ' wms-icon-button' : ''}`} aria-label={uiText("관제 새로고침")} disabled={live.loading || list.loading} onClick={() => { list.refresh(); live.refresh() }}><RefreshCw size={15}/>{!mobile && <span>{uiText("새로고침")}</span>}</button></div>}
    </div>
    {mobile && !inventory && <h2 className="mobile-section-title">{uiText("오늘의 업무")}</h2>}
    {!inventory && <div className="risk-today-work dashboard-today-work" aria-label={uiText("선택 창고 현황")}><button disabled={!risk || risk.todayReceipts === null} onClick={() => { clearHover(); setScheduled('receipts') }}><span>{uiText("오늘 입고 예정")}</span> <strong>{!risk ? '—' : risk.todayReceipts === null ? uiText("권한 없음") : uiText("{v0}건", { v0: risk.todayReceipts.toLocaleString(getLocale()) })}</strong></button><button disabled={!risk || risk.todayShipments === null} onClick={() => { clearHover(); setScheduled('shipments') }}><span>{uiText("오늘 출고 예정")}</span> <strong>{!risk ? '—' : risk.todayShipments === null ? uiText("권한 없음") : uiText("{v0}건", { v0: risk.todayShipments.toLocaleString(getLocale()) })}</strong></button><button disabled={!risk} onClick={() => { clearHover(); setAlertKind('shortage') }}><span>{uiText("안전재고 부족")}</span> <strong>{risk ? uiText("{v0}종", { v0: risk.lowProducts.toLocaleString(getLocale()) }) : '—'}</strong></button><button disabled={!risk} onClick={() => { clearHover(); setAlertKind('expiry') }}><span>{uiText("유통기한 임박")}</span> <strong>{risk ? uiText("{v0}종", { v0: risk.expiryProducts.toLocaleString(getLocale()) }) : '—'}</strong></button></div>}
    {mobile && !inventory && mobileActions}
    {inventory && <div className="inventory-map-title-row dashboard-summary-heading">{warehousePicker}<div className="warehouse-dashboard-controls"><small className="warehouse-dashboard-updated"><span>{uiText("15초 자동 갱신")}</span><span>{uiText("마지막 갱신")} {data ? `${date(data.asOf)} KST` : '—'}</span></small>{live.error && <button className="secondary" disabled={live.loading || list.loading} onClick={() => { list.refresh(); live.refresh() }}>{uiText("다시 조회")}</button>}</div></div>}
    {(list.error || live.error) && <p className="alert error" role="alert">{uiText("갱신하지 못했습니다.")} {uiText(list.error) || uiText(live.error)} {(data || list.data) && uiText("마지막 정상 데이터를 표시합니다.")}</p>}
    {!list.data ? <p role="status">{list.error ? uiText("창고 목록을 조회할 수 없습니다.") : uiText("창고를 불러오는 중…")}</p> : !list.data.warehouses.length ? <div className="warehouse-live-empty"><h2>{uiText("운영 중인 창고가 없습니다")}</h2><p>{uiText("창고관리에서 창고와 2D 도면을 등록해 주세요.")}</p></div> : !data || !displayPlan || !risk ? <p role="status">{live.error ? uiText("관제 데이터를 조회할 수 없습니다.") : uiText("창고 도면과 위험 정보를 불러오는 중…")}</p> : <>

      <div className="warehouse-live-workspace risk-workspace">
        <section className="warehouse-live-map" aria-label={uiText("창고 재고 위험 도면")}><div className="warehouse-map-toolbar">{inventory ? <h2>{uiText("2D 창고 도면")}</h2> : <h2 className="dashboard-map-heading"><span className="dashboard-map-select"><select aria-label={uiText("창고 도면 보기")} value={view} onChange={e => changeView({ ...viewSettings, view: e.target.value === '2d' ? '2d' : '3d' })}><option value="3d">{uiText("3D 창고 도면")}</option><option value="2d">{uiText("2D 창고 도면")}</option></select><svg className="choice-title-arrow" width="18" height="9" viewBox="0 0 18 9" fill="currentColor" aria-hidden="true" focusable="false"><path d="M2 0H16C17.8 0 18.6 2.2 17.1 3.3L11.1 7.9C9.85 8.85 8.15 8.85 6.9 7.9L.9 3.3C-.6 2.2 .2 0 2 0Z" /></svg></span></h2>}{view === '2d' && <div className="warehouse-map-actions dashboard-map-actions" role="group" aria-label={uiText("도면 조작")}><button className="secondary" title={uiText("화면 맞춤")} aria-label={uiText("도면 화면 맞춤")} onClick={() => { clearHover(); canvas.current?.fit() }}><Scan size={16}/></button><button className="secondary" title={uiText("확대")} aria-label={uiText("도면 확대")} onClick={() => { clearHover(); canvas.current?.zoom(1.25) }}><ZoomIn size={16}/></button><button className="secondary" title={uiText("축소")} aria-label={uiText("도면 축소")} onClick={() => { clearHover(); canvas.current?.zoom(.8) }}><ZoomOut size={16}/></button><button className="secondary" title={uiText("화면 이동")} aria-label={uiText("화면 이동")} aria-pressed={pan} onClick={() => { clearHover(); setPan(v => !v) }}><Hand size={16}/></button></div>}{!inventory && view === '3d' && <label className="dashboard-quantity-toggle"><input type="checkbox" checked={!viewSettings.showQuantities} onChange={e => changeView({ ...viewSettings, showQuantities: !e.target.checked })}/>{uiText("총 수량 말풍선 숨기기")}</label>}</div>
          <div className="risk-operation-bar" aria-label={uiText("랙 상태 범례")}><div className="risk-rack-counts">{(['safe','warning','danger','review','empty'] as const).filter(key => ['safe','warning','danger'].includes(key) || risk.counts[key] > 0).map(key => <span key={key} className={`risk-count risk-${key}`}><i/>{uiText(riskStates[key].label)} <strong>{risk.counts[key]}</strong><small>{uiText("랙")}</small></span>)}</div></div>
          {data.plan.exists ? view === '3d' ? <Suspense fallback={<p role="status">{uiText("3D 도면을 불러오는 중…")}</p>}><DashboardWarehouse3D key={`${tenantId}:${warehouseId}`} tenantId={tenantId} warehouseId={warehouseId} plan={data.plan} appearance={appearance} selectedRack={current.rack} showQuantities={viewSettings.showQuantities} onSelectRack={selectRack}/></Suspense> : <PlanCanvas key={warehouseId} ref={canvas} document={displayPlan} rackAppearance={appearance} editing={false} selected={selected} grid snap={false} pan={pan} onSelect={() => {}} onChange={() => {}} onAdd={() => {}} onOpenRack={selectRack} onRackHover={(id,x,y) => { if (window.innerWidth <= 768 || window.matchMedia('(hover: none)').matches) return; if (id) { keepHover(); setHover({warehouse:warehouseId,id,x,y}) } else leaveHover() }}/> : <div className="warehouse-live-empty"><h3>{uiText("저장된 2D 도면이 없습니다")}</h3><p>{uiText("아래 랙 찾기에서 위험 상태와 실제 재고를 확인하세요.")}</p>{!inventory && <button className="secondary" onClick={() => onNavigate(`/app/warehouses?warehouseId=${warehouseId}&tab=plan`)}>{uiText("창고 도면 보기")}</button>}</div>}

          <details className="risk-rack-index" open={!data.plan.exists ? true : undefined}><summary>{uiText("랙 찾기 ·")} {data.racks.length}{uiText("개")}</summary><div>{data.racks.map(r => { const status = riskById.get(r.id)?.status || 'review'; return <button key={r.id} className={`risk-${status}`} aria-pressed={current.rack === r.id} onClick={() => selectRack(r.id)}>{r.code} · {uiText(riskStates[status].label)}</button> })}</div></details>
        </section>
        {rack && <DashboardRackDialog key={`${warehouseId}:${rack.id}`} name={rack.name || rack.code} code={rack.code} warehouse={data.warehouse.name} products={rack.products} needsReview={rackRisk?.needsReview} error={live.error} onRefresh={live.refresh} status={rackRisk?.status || 'review'} stock={stock} risks={riskDetail?.stockProducts || []} today={risk.today} onPage={page => setPick({...current,page})} onClose={() => selectRack('')}/>}

      </div>
      {hover && hovered && <RackRiskPopover hover={hover} rack={hovered} code={data.racks.find(r => r.id === hovered.id)?.code || ''} onEnter={keepHover} onLeave={leaveHover} onClose={clearHover}/>}
      {alertKind && <DashboardAlertDialog key={`${warehouseId}:${alertKind}`} tenantId={tenantId} warehouseId={warehouseId} warehouseName={data.warehouse.name} kind={alertKind} onClose={() => setAlertKind(null)}/>}
      {scheduled && <ScheduledWorkDialog key={`${warehouseId}:${scheduled}`} tenantId={tenantId} warehouseId={warehouseId} warehouseName={data.warehouse.name} kind={scheduled} onClose={() => setScheduled(null)} onNavigate={onNavigate}/>}
    </>}
  </>
}
