import { useMobile } from '../../use-mobile'
import CameraScanButton from '../mobile/CameraScanButton'
import FormLabel from '../FormLabel'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, RefObject } from 'react'
import { api } from '../../api'
import type { Choice } from '../../receipt-model'
import Pagination from '../Pagination'
import './searchable-choice.css'

export type ChoicePage = { items: Choice[]; total: number; pageSize?: number }
export type ChoiceFieldProps = { onCreate?: (name: string) => void; emptyOptionLabel?: string; scrollOptions?: boolean; titleTrigger?: boolean; hideLabel?: boolean; compact?: boolean; floating?: boolean; loadPage?: (search: string, page: number) => Promise<ChoicePage>; disabled?: boolean; placeholder?: string; searchPlaceholder?: string; emptyMessage?: string; productId?: string; locationId?: string; required?: boolean; labelRequired?: boolean; endpoint: string; kind: string; label: string; value: string; current?: Choice; warehouseId?: string; zoneId?: string; rackId?: string; onChange: (p: Choice | undefined) => void }

/** Server-paged choice picker. Search is local to the open popup, never the selected value. */
export default function SearchableChoiceField({ onCreate, emptyOptionLabel, scrollOptions = false, titleTrigger = false, hideLabel, compact, floating = true, loadPage, disabled, placeholder, searchPlaceholder, emptyMessage, productId, locationId, required, labelRequired, endpoint, kind, label, value, current, warehouseId, zoneId, rackId, onChange }: ChoiceFieldProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const [resolved, setResolved] = useState<{ key: string; item: Choice }>()
  const resolveKey = `${endpoint}:${kind}:${productId}:${value}`
  const savedName = current?.name
  const needsCode = !!current && current.id === value && !current.code && /warehouses$/.test(kind) && !titleTrigger
  useEffect(() => {
    if (!needsCode || !savedName) return
    let live = true
    const query = new URLSearchParams({ kind, search: savedName, page: '1', ...(productId ? { productId } : {}) })
    api<ChoicePage>(`${endpoint}/choices?${query}`).then(page => {
      const item = page.items.find(item => item.id === value)
      if (live && item) setResolved({ key: resolveKey, item })
    }).catch(() => { /* Keep the saved name if additional authorized information is unavailable. */ })
    return () => { live = false }
  }, [needsCode, savedName, endpoint, kind, productId, value, resolveKey])
  const displayed = needsCode && resolved?.key === resolveKey ? { ...current, ...resolved.item } : current
  const description = displayed?.id === value && !compact && !titleTrigger ? choiceDescription(displayed) : ''
  const selectedName = displayed?.id === value ? choiceName(displayed) : ''
  const selectionSummary = description ? `${selectedName} · ${description}` : selectedName
  useEffect(() => {
    if (!open) return
    function outside(e: PointerEvent) { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const close = (focus = false) => { setOpen(false); if (focus) trigger.current?.focus() }
  return <div className="searchable-choice" ref={root} onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) close() }}>
    <label className={hideLabel ? 'sr-only' : undefined} id={`${id}-label`}><FormLabel required={required || labelRequired}>{label}</FormLabel></label>
    <button ref={trigger} disabled={disabled} type="button" className={`searchable-choice-trigger${description ? ' has-selection-detail' : ''}${titleTrigger ? ' is-title-trigger' : ''}`} aria-labelledby={`${id}-label ${id}-value`} title={selectionSummary || undefined} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(v => !v)} onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true) } }}>
      <span id={`${id}-value`}>{displayed?.id === value ? <><strong>{selectedName}</strong>{description && <small className="searchable-choice-selection-detail">{description}</small>}</> : <span className="searchable-choice-placeholder">{placeholder || '선택하세요'}</span>}</span>{titleTrigger ? <svg className="choice-title-arrow" width="18" height="9" viewBox="0 0 18 9" fill="currentColor" aria-hidden="true" focusable="false"><path d="M2 0H16C17.8 0 18.6 2.2 17.1 3.3L11.1 7.9C9.85 8.85 8.15 8.85 6.9 7.9L.9 3.3C-.6 2.2 .2 0 2 0Z" /></svg> : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>}
    </button>
    {open && !disabled && <ChoicePopup selectedSummary={description ? selectionSummary : undefined} onCreate={onCreate && (name => { onCreate(name); close(true) })} emptyOptionLabel={emptyOptionLabel} scrollOptions={scrollOptions} anchor={floating ? trigger : undefined} loadPage={loadPage} key={`${kind}:${productId}:${warehouseId}:${rackId}:${locationId}`} productId={productId} locationId={locationId} searchPlaceholder={searchPlaceholder} emptyMessage={emptyMessage} id={id} endpoint={endpoint} kind={kind} label={label} value={value} warehouseId={warehouseId} zoneId={zoneId} rackId={rackId} required={required} labelRequired={labelRequired} onChange={item => { onChange(item); close(true) }} onClose={() => close(true)} />}
  </div>
}
function ChoicePopup({ selectedSummary, onCreate, emptyOptionLabel, scrollOptions, anchor, loadPage, productId, locationId, searchPlaceholder, emptyMessage, id, endpoint, kind, label, value, warehouseId, zoneId, rackId, required, labelRequired, onChange, onClose }: Omit<ChoiceFieldProps, 'current'> & { selectedSummary?: string; anchor?: RefObject<HTMLButtonElement | null>; id: string; onClose: () => void }) {
  const mobile = useMobile()
  const [search, setSearch] = useState(''), [page, setPage] = useState(1), [active, setActive] = useState(0), [retry, setRetry] = useState(0)
  const [result, setResult] = useState<(ChoicePage & { key: string }) | null>(null), [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const popup = useRef<HTMLDivElement>(null), more = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!anchor) return
    const element = popup.current!
    const position = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 24)
      const below = window.innerHeight - rect.bottom - 18, above = rect.top - 18
      const down = below >= 300 || below >= above
      Object.assign(element.style, { width: `${width}px`, left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`, top: down ? `${Math.max(12, rect.bottom + 6)}px` : 'auto', bottom: down ? 'auto' : `${Math.max(12, window.innerHeight - rect.top + 6)}px`, maxHeight: `${Math.max(120, down ? below : above)}px` })
    }
    position(); element.showPopover()
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true)
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); if (element.matches(':popover-open')) element.hidePopover() }
  }, [anchor])
  const url = endpoint + '/choices?' + new URLSearchParams({ kind, search, page: String(page), ...(warehouseId ? { warehouseId } : {}), ...(zoneId ? { zoneId } : {}), ...(rackId ? { rackId } : {}), ...(productId ? { productId } : {}), ...(locationId ? { locationId } : {}) })
  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    let live = true
    const timer = window.setTimeout(() => {
      (loadPage ? loadPage(search, page) : api<ChoicePage>(url)).then(r => { if (live) { setResult(previous => ({ ...r, key: url, items: scrollOptions && page > 1 && previous?.key.split('&page=')[0] === url.split('&page=')[0] ? [...previous.items, ...r.items.filter(item => !previous.items.some(old => old.id === item.id))] : r.items })); setError('') } }).catch(() => { if (live) setError('목록을 불러오지 못했습니다.') })
    }, 150)
    return () => { live = false; window.clearTimeout(timer) }
  }, [url, retry, loadPage, search, page, scrollOptions])
  const ready = result?.key === url, items = ready || (scrollOptions && page > 1 && result?.key.split('&page=')[0] === url.split('&page=')[0]) ? result!.items : []
  useEffect(() => {
    if (!scrollOptions || !ready || error || items.length >= (result?.total || 0) || !more.current) return
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) setPage(p => p + 1) }, { root: more.current.parentElement })
    observer.observe(more.current)
    return () => observer.disconnect()
  }, [scrollOptions, ready, error, items.length, result?.total])
  const selectable = !required && emptyOptionLabel && !search && ready ? [{ id:'', name:emptyOptionLabel, code:'', unit:null, lotManaged:false, expiryManaged:false, serialManaged:false }, ...items] : items
  useEffect(() => { document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [active, id])
  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    if (e.nativeEvent.isComposing) return
    if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation()
      if (e.key === 'Enter') { if (selectable[active]) onChange(selectable[active].id ? selectable[active] : undefined); else if (onCreate && search.trim()) onCreate(search.trim()); return }
      if (scrollOptions && e.key === 'ArrowDown' && active === selectable.length - 1 && ready && !error && items.length < (result?.total || 0)) { setPage(p => p + 1); return }
      setActive(n => Math.max(0, Math.min(selectable.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))))
    }
  }
  return <div ref={popup} popover={anchor ? 'manual' : undefined} className="searchable-choice-popup" onKeyDown={e => { if (e.key === 'Escape') keys(e) }}>
    {selectedSummary && <p className="searchable-choice-current" id={`${id}-current`}>{selectedSummary}</p>}
    <div className="searchable-choice-search"><input ref={input} role="combobox" aria-label={`${label} 검색`} aria-describedby={selectedSummary ? `${id}-current` : undefined} aria-expanded="true" aria-autocomplete="list" aria-controls={id} aria-activedescendant={selectable[active] ? `${id}-${active}` : undefined}
      placeholder={searchPlaceholder || (kind === 'collaborators' ? '업체명 검색' : kind === 'products' ? '상품명·코드·모델·바코드 검색' : kind === 'partners' ? '거래처명·코드·사업자번호 검색' : '창고명·코드 검색')} maxLength={onCreate ? 200 : 100} value={search} onKeyDown={keys}
      onChange={e => { setSearch(e.target.value); setPage(1); setActive(0); setError('') }} /></div>
    {mobile && (searchPlaceholder?.includes('바코드') || kind === 'products') && <CameraScanButton onManual={() => input.current?.focus()} onScan={code => { setSearch(code); setPage(1); setActive(0); setError('') }} />}
    {error ? <div className="searchable-choice-message" role="alert">{error} <button type="button" className="secondary" onClick={() => { setError(''); setRetry(n => n + 1) }}>다시 시도</button></div> : !ready ? <p className="searchable-choice-message" role="status">불러오는 중…</p> : !items.length && <p className="searchable-choice-message" role="status">{search ? '검색 결과가 없습니다.' : emptyMessage || '선택 가능한 항목이 없습니다.'}</p>}
    <div id={id} role="listbox" aria-required={required || labelRequired || undefined} aria-label={`${label} 선택 목록`} className="searchable-choice-options">
      {selectable.map((item, index) => <button key={item.id} id={`${id}-${index}`} type="button" role="option" aria-selected={value === item.id} tabIndex={-1} className={index === active ? 'is-highlighted' : ''} onMouseEnter={() => setActive(index)} onMouseDown={e => e.preventDefault()} onClick={() => onChange(item.id ? item : undefined)}><span><strong>{choiceName(item)}</strong><small>{choiceDescription(item)}</small></span>{value === item.id && <span aria-hidden="true">✓</span>}</button>)}
      {scrollOptions && <div ref={more} aria-hidden="true" style={{ height: 1 }} />}
    </div>
    {!scrollOptions && ready && result.total > (result.pageSize || 30) && <Pagination page={page} pageSize={result.pageSize || 30} total={result.total} loading={!ready} onChange={n => { setPage(n); setActive(0); setError(''); input.current?.focus() }} label={`${label} 선택 페이지`} />}
    {onCreate && search.trim() && <button className="secondary searchable-choice-clear" type="button" onClick={() => onCreate(search.trim())}>입력한 업체명 사용</button>}
    {!emptyOptionLabel && !required && value && <button className="secondary searchable-choice-clear" type="button" onClick={() => onChange(undefined)}>선택 해제</button>}
  </div>
}

function choiceName(item: Choice) {
  return item.rackName ? `${item.rackName} / ${item.level ?? '—'}단 / ${item.bay ?? '—'}칸` : item.name
}
function choiceDescription(item: Choice) {
  if (item.email !== undefined) return [item.customCode, item.email].filter(Boolean).join(' · ')
  if (item.rackAvailable != null) return `${item.code} · 가용 ${item.rackAvailable.toLocaleString('ko-KR')} ${item.unit || ''} · 현재고 ${item.rackPhysical?.toLocaleString('ko-KR')}${item.ownReserved ? ` · 이 문서 예약 포함 ${item.rackRequestable?.toLocaleString('ko-KR')}` : ''}`
  if (item.quantity != null) return `유통기한 ${item.expiryDate || '없음'} · 현재 ${item.quantity} / 출고 예정 ${item.reservedQuantity} / 출고 가능 ${item.availableQuantity} ${item.unit || ''} · 재고 ${item.id}`
  return [item.code, item.rackCode, item.customCode, item.level != null ? `${item.level}단` : '', item.bay != null ? `${item.bay}칸` : '', item.barcode, item.unit].filter(Boolean).join(' · ')
}
