import { t as uiText, getLocale } from '../../i18n.ts'
import { ChevronRight } from 'lucide-react'
import { useMobile } from '../../use-mobile'
import CameraScanButton from '../mobile/CameraScanButton'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { DocumentProductLine, ImportedProduct } from '../../document-paste'
import { refreshSelection, selectedProducts } from '../../product-selection-model'
import type { SelectedProduct, SelectionOptions, SelectionProduct, SelectionResult } from '../../product-selection-model'
import OrganizationDialog from './OrganizationDialog'
import Pagination from '../Pagination'
import './product-selection.css'

const num = (n: number | null) => n == null ? '—' : n.toLocaleString(getLocale(), { maximumFractionDigits: 3 })
export default function ProductSelectionDialog({ endpoint, mode, warehouseId, rackId, shipmentId, lines, capacity = Infinity, onAdd, onClose, onDirtyChange }: {
  endpoint: string; mode: 'receipt' | 'shipment'; warehouseId?: string; rackId?: string; rackName?: string; shipmentId?: string; lines: DocumentProductLine[]; capacity?: number; onAdd: (products: ImportedProduct[]) => void; onClose: () => void; onDirtyChange: (dirty: boolean) => void
}) {
  const [categories, setCategories] = useState(['', '', ''])
  const [resetOpen, setResetOpen] = useState(false)
  const [rackFilter, setRackFilter] = useState(rackId)
  const shipping = mode === 'shipment'
  const mobile = useMobile()
  const [query, setQuery] = useState({ search: '', categoryId: '', productTypeId: '', page: 1 })
  const [selected, setSelected] = useState<Record<string, SelectedProduct>>({}), [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ key: string; data?: SelectionResult; error?: string }>(), [options, setOptions] = useState<SelectionOptions>(), [optionsError, setOptionsError] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [errors, setErrors] = useState<Record<string, string>>({})
  const flight = useRef(false)
  const url = `${endpoint}/choices?${new URLSearchParams({ kind: 'product-table', ...query, page: String(query.page), pageSize: '20', ...(warehouseId ? { warehouseId } : {}), ...(shipmentId ? { shipmentId } : {}), ...(shipping ? { stockOnly: 'true' } : {}), ...(shipping && rackFilter ? { rackId: rackFilter } : {}) })}`
  const key = `${url}:${retry}`, data = result?.key === key ? result.data : undefined, error = result?.key === key ? result.error : undefined
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => { api<SelectionResult>(url).then(data => { if (live) setResult({ key, data }) }).catch(e => { if (live) setResult({ key, error: e.message }) }) }, 180)
    return () => { live = false; clearTimeout(timer) }
  }, [url, key])
  useEffect(() => {
    let live = true
    api<SelectionOptions>(`${endpoint}/choices?kind=product-options`).then(data => { if (live) { setOptions(data); setOptionsError('') } }).catch(e => { if (live) setOptionsError(e.message) })
    return () => { live = false }
  }, [endpoint, retry])
  const count = Object.keys(selected).length, issues = errors
  useEffect(() => { onDirtyChange(count > 0) }, [count, onDirtyChange])
  const pageChoices = (data?.items || []).filter(p=>mode!=='receipt'||!lines.some(l=>l.product?.id===p.id)), pageSelected = pageChoices.length > 0 && pageChoices.every(p => !!selected[p.id])
  function filter(patch: Partial<typeof query>) { setQuery(q => ({ ...q, ...patch, page: 1 })) }
  function choose(product: SelectionProduct, checked: boolean) {
    if (checked && mode==='receipt' && lines.some(l=>l.product?.id===product.id)) { setMessage('이미 등록된 상품입니다. 기존 상품의 총 수량을 수정해 주세요.'); return }
    if (checked && count >= capacity) { setMessage(`현재 목록에는 ${capacity}개 상품 행까지 추가할 수 있습니다.`); return }
    setSelected(current => { const next = { ...current }; if (checked) next[product.id] = { product }; else delete next[product.id]; return next })
    setErrors(current => { const next = { ...current }; delete next[product.id]; return next }); setMessage('')
  }
  function choosePage() {
    if (!pageSelected && new Set([...Object.keys(selected), ...pageChoices.map(p => p.id)]).size > capacity) { setMessage(`현재 목록에는 ${capacity}개 상품 행까지 추가할 수 있습니다. 필요한 상품을 개별 선택하세요.`); return }
    setSelected(current => { const next = { ...current }; for (const p of pageChoices) { if (pageSelected) delete next[p.id]; else next[p.id] ||= { product: p } } return next }); setErrors(current => Object.fromEntries(Object.entries(current).filter(([id]) => !pageChoices.some(p => p.id === id)))); setMessage('')
  }
  async function add() {
    if (flight.current || !count || count > capacity || Object.keys(issues).length) return
    flight.current = true; setBusy(true); setMessage('')
    try {
      // Re-read all selected IDs, independent of the currently visible search/page. No document write occurs here.
      const ids = Object.keys(selected), latestItems: SelectionProduct[] = []
      for (let offset = 0; offset < ids.length; offset += 100) {
        const params = new URLSearchParams({ kind: 'product-table', pageSize: '100', ...(warehouseId ? { warehouseId } : {}), ...(shipmentId ? { shipmentId } : {}), ...(shipping ? { stockOnly: 'true' } : {}), ...(shipping && rackFilter ? { rackId: rackFilter } : {}) })
        for (const id of ids.slice(offset, offset + 100)) params.append('ids', id)
        const latest = await api<SelectionResult>(`${endpoint}/choices?${params}`)
        latestItems.push(...latest.items)
      }
      const next = refreshSelection(selected, latestItems), available = new Set(latestItems.map(p => p.id))
      const nextErrors = Object.fromEntries(Object.entries(next).map(([id]) => [id, !available.has(id) ? '사용 중지되었거나 조회할 수 없는 상품입니다. 선택을 해제해 주세요.' : '']).filter(([, issue]) => issue))
      setSelected(next); setErrors(nextErrors)
      if (Object.keys(nextErrors).length) { setMessage('선택한 상품 정보가 변경되었습니다. 오류 항목을 확인해 주세요.'); setRetry(n => n + 1); return }
      onAdd(selectedProducts(next))
    } catch (e) { setMessage(e instanceof Error ? e.message : '상품을 확인하지 못했습니다. 다시 시도해 주세요.') }
    finally { flight.current = false; setBusy(false) }
  }
  const categoryFields = [0, 1, 2].map(level => <label key={level}>{level + 1}{uiText("차 카테고리")}<select aria-label={uiText("상품 추가 {v0}차 카테고리", { v0: level + 1 })} value={categories[level]} disabled={!options || (level > 0 && !categories[level - 1])} onChange={e => {
            const next = categories.map((id, i) => i < level ? id : i === level ? e.target.value : '')
            setCategories(next); filter({ categoryId: [...next].reverse().find(Boolean) || '' })
          }}><option value="">{uiText("전체")} {level + 1}{uiText("차 카테고리")}</option>{options?.categories.filter(c => (c.parentId || '') === (level === 0 ? '' : categories[level - 1])).map(c => <option key={c.id} value={c.id}>{c.name}{!c.isActive ? uiText("(사용 중지 분류)") : ''}</option>)}</select></label>)
  return <OrganizationDialog title={uiText("상품 추가")} description={mobile ? undefined : uiText("등록된 상품을 검색하고 선택하세요.")} size="large" busy={busy} onClose={onClose}>
    <form className="dialog-form product-selection-form" noValidate onSubmit={e => { e.preventDefault(); void add() }}>
      <div inert={busy} className="product-selection-content">
        <div className="product-selection-filters">
          {mobile ? <div className="product-selection-search"><label><span className="product-selection-filter-label">{uiText("상품 검색")}</span><input aria-label={uiText("상품 추가 검색")} placeholder={uiText("상품명·상품코드·바코드")} maxLength={100} value={query.search} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }} onChange={e => filter({ search: e.target.value })} /></label><CameraScanButton disabled={busy} onScan={code => filter({ search: code })} /></div> : <label>{uiText("상품 검색")}<input aria-label={uiText("상품 추가 검색")} placeholder={uiText("상품명·상품코드·바코드")} maxLength={100} value={query.search} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }} onChange={e => filter({ search: e.target.value })} /></label>}
          <label><span className="product-selection-filter-label">{uiText("상품 구분")}</span><select aria-label={uiText("상품 추가 구분")} value={query.productTypeId} onChange={e => filter({ productTypeId: e.target.value })}><option value="">{mobile ? uiText("전체 상품 구분") : uiText("전체 구분")}</option>{options?.productTypes.map(p => <option key={p.id} value={p.id}>{p.name}{!p.isActive ? uiText("(사용 중지 분류)") : ''}</option>)}</select></label>
          {mobile ? <details className="product-selection-categories"><summary><ChevronRight size={16} aria-hidden="true" />{uiText("카테고리 설정")}</summary><div>{categoryFields}</div></details> : categoryFields}
          <button type="button" className="secondary product-selection-reset" aria-label={uiText("필터 초기화")} onClick={() => setResetOpen(true)}>{mobile ? uiText("초기화") : uiText("필터 초기화")}</button>
        </div>
        <div className="product-selection-summary">{mobile ? <label className="product-selection-all"><input type="checkbox" aria-label={uiText("현재 페이지 전체 선택")} checked={pageSelected} disabled={!pageChoices.length} onChange={choosePage} />{uiText("현재 페이지 전체 선택")}</label> : <><span>{uiText("활성 상품만 표시 · 전체 선택은")} <strong>{uiText("현재 페이지")}</strong>{uiText("에만 적용됩니다.")}</span><strong role="status">{uiText("선택")} {count}{uiText("건")}</strong></>}</div>
        {(error || optionsError || message) && <p className="alert error" role="alert">{uiText(error) || optionsError || message}{(error || optionsError) && <button type="button" className="secondary" onClick={() => setRetry(n => n + 1)}>{uiText("다시 조회")}</button>}</p>}
        {mobile ? <div className="product-selection-cards" aria-label={uiText("상품 선택 목록")}>
          {!data ? <p role="status">{error ? uiText("상품을 불러오지 못했습니다.") : uiText("상품을 불러오는 중…")}</p> : !data.items.length ? <p role="status">{uiText("검색 조건에 맞는 활성 상품이 없습니다.")}</p> : data.items.map(p => {
            const chosen = selected[p.id], issue = issues[p.id], existing = lines.filter(l => l.product?.id === p.id).length
            const disabled = mode === 'receipt' && existing > 0
            return <label key={p.id} className={`product-selection-card ${chosen ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}>
              <span className="product-selection-card-heading">
                <SelectionImage endpoint={endpoint} product={p} />
                <span className="product-selection-card-identity"><strong>{p.name}</strong><small>{p.code}</small></span>
                <input type="checkbox" aria-label={uiText("{v0} 선택", { v0: p.code })} checked={!!chosen} disabled={disabled} onChange={e => choose(p, e.target.checked)} />
              </span>
              <span className="product-selection-card-fields">
                <span>{uiText("상품 구분")}</span><span>{p.productTypeName || uiText("미지정")}</span>
                <span>{uiText("대표 바코드")}</span><span>{p.barcode || '—'}</span>
                {p.unit !== 'EA' && <><span>{uiText("단위")}</span><span>{p.unit || '—'}</span></>}
                {shipping && <><span>{uiText("가용 재고")}</span><span>{num(p.available)} {p.unit}</span><span>{uiText("현재고")}</span><span>{num(p.physical)} {p.unit}</span>{(p.ownReserved || 0) > 0 && <><span>{uiText("이 문서 예약")}</span><span>{num(p.ownReserved)} {p.unit} {uiText("포함 · 재요청 가능")} {num(p.requestable)}</span></>}</>}
              </span>
              {existing > 0 && <small>{mode === 'receipt' ? uiText("이미 등록된 상품 · 기존 총 수량을 수정하세요.") : uiText("기존 {v0}행 · 별도 행으로 추가", { v0: existing })}</small>}
              <small className={issue ? 'product-selection-error' : chosen ? 'product-selection-ready' : ''} role={issue ? 'alert' : undefined}>{issue || (chosen ? uiText("선택됨") : shipping && !p.requestable ? uiText("출고 가능한 재고 없음") : uiText("선택 가능"))}</small>
            </label>
          })}
        </div> : <div className="product-selection-table-wrap"><table className={`organization-table product-selection-table ${shipping ? 'is-shipping' : ''}`}><caption className="sr-only">{uiText("상품 선택 목록")}</caption><thead><tr><th><input type="checkbox" aria-label={uiText("현재 페이지 전체 선택")} checked={pageSelected} disabled={!pageChoices.length} onChange={choosePage} /></th><th>{uiText("이미지")}</th><th>{uiText("상품코드")}</th><th>{uiText("상품명")}</th><th>{uiText("상품 구분")}</th><th>{uiText("대표 바코드")}</th>{shipping && <th>{uiText("현재고 / 가용 재고")}</th>}<th>{uiText("상태")}</th></tr></thead><tbody>
          {!data ? <tr><td colSpan={shipping ? 8 : 7}>{error ? uiText("상품을 불러오지 못했습니다.") : uiText("상품을 불러오는 중…")}</td></tr> : !data.items.length ? <tr><td colSpan={shipping ? 8 : 7}>{uiText("검색 조건에 맞는 활성 상품이 없습니다.")}</td></tr> : data.items.map(p => {
            const chosen = selected[p.id], issue = issues[p.id], existing = lines.filter(l => l.product?.id === p.id).length
            return <tr key={p.id} className={chosen ? 'is-selected' : ''}>
              <td data-label={uiText("선택")}><input type="checkbox" aria-label={uiText("{v0} 선택", { v0: p.code })} checked={!!chosen} disabled={mode==='receipt'&&existing>0} onChange={e => choose(p, e.target.checked)} /></td><td data-label={uiText("이미지")}><SelectionImage key={p.id} endpoint={endpoint} product={p} /></td>
              <td data-label={uiText("상품코드")}>{p.code}</td><td data-label={uiText("상품명")}><strong>{p.name}</strong>{p.unit !== "EA" && <small>{p.unit}</small>}{existing > 0 && <small>{mode==='receipt' ? uiText("이미 등록된 상품 · 기존 총 수량을 수정하세요.") : uiText("기존 {v0}행 · 별도 행으로 추가", { v0: existing })}</small>}</td><td data-label={uiText("상품 구분")}>{p.productTypeName || uiText("미지정")}</td><td data-label={uiText("대표 바코드")}>{p.barcode || '—'}</td>
              {shipping && <td data-label={uiText("출고 가능")} className="numeric">{num(p.available)} {p.unit}<small>{uiText("현재고")} {num(p.physical)} {p.unit}</small>{(p.ownReserved || 0) > 0 && <small>{uiText("이 문서 예약")} {num(p.ownReserved)} {uiText("포함")}<br />{uiText("재요청 가능")} {num(p.requestable)}</small>}</td>}
              <td data-label={uiText("상태")}>{issue ? <span className="product-selection-error" role="alert">{issue}</span> : chosen ? <span className="product-selection-ready">{uiText("선택됨")}</span> : shipping && !p.requestable ? uiText("출고 가능한 재고 없음") : uiText("선택 가능")}</td>
            </tr>
          })}
        </tbody></table></div>}
        <Pagination page={query.page} pageSize={20} total={data?.total || 0} loading={!data || !!error} onChange={page => setQuery(q => ({ ...q, page }))} label={uiText("상품 추가 목록 페이지")} />
        {Object.keys(issues).some(key => !data?.items.some(p => p.id === key)) && <details className="product-selection-offpage" open><summary>{uiText("다른 페이지의 선택 오류 확인")}</summary>{Object.entries(issues).filter(([key]) => !data?.items.some(p => p.id === key)).map(([key, issue]) => <p key={key}><strong>{selected[key].product.name}</strong> · {issue} <button type="button" className="text-button" onClick={() => { setCategories(['', '', '']); filter({ search: selected[key].product.code, categoryId: '', productTypeId: '' }) }}>{uiText("상품 찾기")}</button><button type="button" className="text-button" onClick={() => choose(selected[key].product, false)}>{uiText("선택 해제")}</button></p>)}</details>}
        <p className="product-selection-help">{uiText("수량과 LOT·유통기한·시리얼은 추가 후 상품 테이블에서 입력하세요. 상품 선택만으로 문서 저장이나 출고 예약이 이루어지지 않습니다.")}</p>
      </div>
      <div className="dialog-actions">{mobile && <strong className="product-selection-count" role="status">{uiText("선택")} {count}{uiText("건")}</strong>}<button type="button" className="secondary" disabled={busy} onClick={onClose}>{uiText("취소")}</button><button type="submit" className="primary" disabled={busy || !count || count > capacity || Object.keys(issues).length > 0}>{busy ? uiText("상품 확인 중…") : uiText("선택 상품 추가")}</button></div>
    </form>
    {resetOpen && <OrganizationDialog title={uiText("필터 초기화")} confirmation size="small" onClose={() => setResetOpen(false)} actions={<><button type="button" className="secondary" onClick={() => setResetOpen(false)}>{uiText("취소")}</button><button type="button" className="primary" onClick={() => { setQuery({ search: '', categoryId: '', productTypeId: '', page: 1 }); setCategories(['', '', '']); setRackFilter(undefined); setResetOpen(false) }}>{uiText("초기화")}</button></>}><p>{uiText("검색어와 필터 조건을 초기화합니다. 선택한 상품은 유지됩니다.")}</p></OrganizationDialog>}
  </OrganizationDialog>
}
function SelectionImage({ endpoint, product }: { endpoint: string; product: SelectionProduct }) {
  const [failed, setFailed] = useState(false)
  return product.hasImage && !failed ? <img className="product-selection-image" alt={uiText("{v0} 대표 이미지", { v0: product.name })} loading="lazy" src={`${endpoint}/products/${product.id}/image`} onError={() => setFailed(true)} /> : <span className="product-selection-image is-placeholder" aria-label={uiText("상품 이미지 없음")}>{uiText("이미지")}<br />{uiText("없음")}</span>
}