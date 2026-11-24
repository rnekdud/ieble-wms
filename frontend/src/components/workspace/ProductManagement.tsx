import { t as uiText } from '../../i18n.ts'
import { Trash2 } from 'lucide-react'
import PageSizeSelect from '../PageSizeSelect'
import LocalChoiceField from './LocalChoiceField'
import SearchFilters from './SearchFilters'
import ProductImportDialog from './ProductImportDialog'
import ProductDeleteDialog from './ProductDeleteDialog'
import UnsavedChangesContent from './UnsavedChangesContent'
import RegistrationSurface, { RegistrationPrompt, RegistrationFields } from './RegistrationSurface'
import ProductMasterFields from './ProductMasterFields'
import { barcodeDrafts, barcodeRowsError, barcodePayload } from '../../product-master-model'
import { imageDrafts, imagePayload } from '../../product-images'
import ProductMasterDetail from './ProductMasterDetail'
import { businessEntry } from '../../dashboard-model'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, SetStateAction } from 'react'
import { api } from '../../api'
import Pagination from '../Pagination'
import { requestNavigation } from '../../navigation-guard'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import { productDraft, productDirty, productError, productRequest } from '../../product-model'
import type { Product, ProductDraft, ProductItem, ProductList, ProductOptions } from '../../product-model'
import DetailSurface from './DetailSurface'
import { PageHeading } from './WorkspaceUI'
import { ownedProductListEntry, productListDefaults, productListQuery, productListStateKey, productListUrl, safeProductReturn, writeProductListEntry } from '../../product-list-navigation'
import type { ProductListQuery } from '../../product-list-navigation'
import './products.css'

export default function ProductManagement({ tenantId, userId, grants, registration = false, detailId, onNavigate }: { tenantId: string; userId: string; grants: string[]; registration?: boolean; detailId?: string; onNavigate: (path: string, options?: { replace?: boolean }) => void }) {
  const endpoint = `/api/tenants/${tenantId}/products`
  const owner = `${userId}:${tenantId}`
  const [entry] = useState(() => ownedProductListEntry(window.history.state, owner))
  const [foreignEntry] = useState(() => !!window.history.state?.[productListStateKey] && !entry)
  const [query] = useState(() => foreignEntry ? productListDefaults() : productListQuery(window.location.search))
  const [filters, setFilters] = useState(entry?.draft || query)
  const restoredScroll = useRef(false)
  function setQuery(update: SetStateAction<ProductListQuery>, replace = false, draft = filters) {
    const next = typeof update === 'function' ? update(query) : update
    if (productListUrl(next) !== window.location.pathname + window.location.search) {
      onNavigate(productListUrl(next), { replace })
      writeProductListEntry({ owner, draft: { ...draft, page: next.page, pageSize: next.pageSize }, scroll: replace ? entry?.scroll : undefined })
    }
  }
  function openProduct(id: string) {
    const point = { url: productListUrl(query), draft: filters, scroll: window.scrollY, ...window.history.state?.__iebleNavigation }
    writeProductListEntry({ owner, draft: filters, scroll: point.scroll })
    onNavigate(`/app/products/${id}`)
    writeProductListEntry({ owner, returnTo: point })
  }
  function returnToProducts() {
    const point = safeProductReturn(entry)
    const current = window.history.state?.__iebleNavigation
    if (point && point.stack === current?.stack && point.index === current?.index - 1) {
      window.history.back()
    } else {
      onNavigate(point?.url || '/app/products')
      writeProductListEntry({ owner, draft: point?.draft, scroll: point?.scroll })
    }
  }
  useEffect(() => {
    if (registration || detailId) return
    if (foreignEntry) { writeProductListEntry({ owner }); onNavigate('/app/products', { replace: true }); return }
    writeProductListEntry({ owner, draft: filters, scroll: entry?.scroll })
  }, [owner, filters, entry, foreignEntry, registration, detailId, onNavigate])
  const [revision, refresh] = useState(0), [data, setData] = useState<{ key: string; value: ProductList } | null>(null)
  const [options, setOptions] = useState<ProductOptions | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [selection] = useState<{ id: string | null } | null>(() => businessEntry(window.location.search, grants.includes('create')))
  const url = endpoint + '?' + new URLSearchParams({ ...query, page: String(query.page), pageSize: String(query.pageSize) })
  const key = `${url}:${revision}`, loading = data?.key !== key
  const [checked, setChecked] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] })
  const [deleting, setDeleting] = useState<Product[] | null>(null)
  const [importing, setImporting] = useState(false)
  const selectedIds = checked.key === key ? checked.ids : []
  const pageProducts = !loading ? data.value.items.map(x => x.product) : []
  const canDelete = grants.includes('delete')
  function toggle(id: string) { setChecked({ key, ids: selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id] }) }
  function deleted(count: number) {
    setDeleting(null); setChecked({ key: '', ids: [] }); setNotice(`${count}개 상품을 삭제했습니다.`)
    setQuery(q => ({ ...q, page: Math.max(1, Math.min(q.page, Math.ceil(((data?.value.total || count) - count) / q.pageSize))) })); refresh(n => n + 1)
  }
  useEffect(() => {
    let live = true
    const timer = window.setTimeout(() => {
      Promise.all([(registration || detailId) ? Promise.resolve(null) : api<ProductList>(url), api<ProductOptions>(endpoint + '/options')]).then(([value, choices]) => { if (live) { if (value) setData({ key, value }); setOptions(choices); setError('') } }).catch(e => { if (live) setError(e instanceof Error ? e.message : '상품을 불러오지 못했습니다.') })
    }, 180)
    return () => { live = false; window.clearTimeout(timer) }
  }, [url, endpoint, key, registration, detailId])
  useEffect(() => { if (!registration && !detailId && selection) onNavigate(selection.id ? `/app/products/${selection.id}` : '/app/products/new') }, [registration, detailId, selection, onNavigate])
  useEffect(() => {
    if (registration || detailId || loading || restoredScroll.current || entry?.scroll === undefined) return
    restoredScroll.current = true
    const frame = requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, Math.min(entry.scroll!, document.documentElement.scrollHeight - window.innerHeight)), behavior: 'instant' }))
    return () => cancelAnimationFrame(frame)
  }, [registration, detailId, loading, entry])
  function filter(values: Partial<typeof query>) { setChecked({ key: '', ids: [] }); setQuery(q => ({ ...q, ...values, page: 1 })) }
  if (detailId) return options ? <ProductDetailPage key={detailId} id={detailId} endpoint={endpoint} options={options} onOptions={setOptions} canUpdate={grants.includes('update')} canDelete={canDelete} onClose={returnToProducts} /> : <DetailSurface title={uiText("상품 상세")} onClose={returnToProducts}><p role={error ? 'alert' : 'status'}>{uiText(error) || uiText("상품 정보를 불러오는 중…")}</p>{error && <button onClick={() => refresh(n => n + 1)}>{uiText("다시 시도")}</button>}</DetailSurface>
  if (registration) return !grants.includes('create') ? <p role="alert">{uiText("상품 등록 권한이 없습니다.")}</p> : options ? <ProductEditor page endpoint={endpoint} options={options} onOptions={setOptions} onClose={() => onNavigate('/app/products')} onSaved={() => onNavigate('/app/products')} /> : <p role={error ? 'alert' : 'status'}>{uiText(error) || uiText("등록 정보를 불러오는 중…")}{error && <button className="secondary" onClick={() => refresh(n => n + 1)}>{uiText("다시 시도")}</button>}</p>
  return <>
    <PageHeading title={uiText("상품관리")} actions={<> {grants.includes('create') && <button className="secondary" onClick={() => setImporting(true)}>{uiText("엑셀 대량등록")}</button>}        {grants.includes('create') && <button className="primary" disabled={!options} onClick={() => { onNavigate('/app/products/new') }}>{uiText("상품 등록")}</button>} </>} />
    {notice && <p role="status" className="alert">{uiText(notice)}</p>}
    {error && <p role="alert" className="alert error">{uiText(error)} <button className="secondary" onClick={() => refresh(n => n + 1)}>{uiText("다시 시도")}</button></p>}
    <section className="wms-card products-card">
      <SearchFilters onReset={() => { const next = { search: '', categoryId: '', status: 'all', page: 1, pageSize: 20 }; setFilters(next); setQuery(next, false, next); setChecked({ key: "", ids: [] }); refresh(n => n + 1) }} busy={loading && !error} onSearch={() => { setQuery({ ...filters, page: 1 }); refresh(n => n + 1) }} className="products-toolbar">

        <LocalChoiceField label={uiText("상품 분류")} emptyLabel={uiText("전체 분류")} options={(options?.categories || []).map(c => { const names=[c.name], seen=new Set([c.id]); let parent=options?.categories.find(p=>p.id===c.parentId); while(parent && !seen.has(parent.id)){seen.add(parent.id);names.unshift(parent.name);const parentId=parent.parentId;parent=options?.categories.find(p=>p.id===parentId)} return {id:c.id,name:names.join(' › ')} })} value={filters.categoryId} onChange={categoryId=>setFilters({...filters,categoryId})} />
        <label>{uiText("사용 여부")}<select aria-label={uiText("사용 여부 필터")} value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="all">{uiText("전체")}</option><option value="active">{uiText("사용")}</option><option value="inactive">{uiText("미사용")}</option></select></label>

      <label>{uiText("상품 검색")}<input aria-label={uiText("상품 검색")} placeholder={uiText("상품명·코드·바코드·LOT·시리얼 검색")} maxLength={100} value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} /></label>
</SearchFilters>
      <div className="products-list-controls">

        {canDelete && <label className="products-mobile-select-all"><input type="checkbox" aria-label={uiText("현재 페이지 상품 전체 선택")} disabled={loading || !pageProducts.length} checked={pageProducts.length > 0 && selectedIds.length === pageProducts.length} ref={node => { if (node) node.indeterminate = selectedIds.length > 0 && selectedIds.length < pageProducts.length }} onChange={e => setChecked({ key, ids: e.target.checked ? pageProducts.map(p => p.id) : [] })} />{uiText("전체 선택")}</label>}
        {canDelete && selectedIds.length > 0 && <div className="product-selection-actions"><span role="status">{selectedIds.length}{uiText("개 선택됨")}</span><button type="button" className="secondary danger-text" onClick={() => setDeleting(pageProducts.filter(p => selectedIds.includes(p.id)))}>{uiText("선택 상품 삭제")}</button></div>}
      </div>
      <div className="table-scroll products-desktop-list"><table className="organization-table"><thead><tr>{canDelete && <th className="product-select-cell"><input type="checkbox" aria-label={uiText("현재 페이지 상품 전체 선택")} disabled={loading || !pageProducts.length} checked={pageProducts.length > 0 && selectedIds.length === pageProducts.length} ref={node => { if (node) node.indeterminate = selectedIds.length > 0 && selectedIds.length < pageProducts.length }} onChange={e => setChecked({ key, ids: e.target.checked ? pageProducts.map(p => p.id) : [] })} /></th>}{['이미지', '상품코드', '상품명', '모델 번호', '상품 구분', '카테고리', '대표 바코드', '사용 여부', '관리'].map(text => <th key={text}>{uiText(text)}</th>)}</tr></thead>
        <tbody>{loading ? <tr><td colSpan={canDelete ? 10 : 9}>{error ? uiText("목록을 불러오지 못했습니다.") : uiText("상품을 불러오는 중…")}</td></tr> : !data.value.items.length ? <tr><td colSpan={canDelete ? 10 : 9}>{uiText("조회된 상품이 없습니다.")}</td></tr> : data.value.items.map(({ product: p, categoryName, productTypeName }) => <tr key={p.id}>{canDelete && <td className="product-select-cell"><input type="checkbox" aria-label={uiText("{v0} 선택", { v0: p.name })} checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} /></td>}<td>{p.hasImage ? <img className="product-thumbnail" src={`${endpoint}/${p.id}/image?v=${p.version}`} alt={p.name} loading="lazy" /> : <span className="product-thumbnail-placeholder" aria-label={uiText("이미지 없음")}>—</span>}</td><td>{p.code}</td><td>{p.name}</td><td>{p.modelNumber || '—'}</td><td>{productTypeName || uiText("미지정")}</td><td>{categoryName || uiText("미분류")}</td><td className="products-barcode-cell">{p.barcode || '—'}</td><td>{p.isActive ? uiText("사용") : uiText("미사용")}</td><td><button className="secondary" aria-label={uiText("{v0} 상세", { v0: p.name })} onClick={() => openProduct(p.id)}>{uiText("상세")}</button></td></tr>)}</tbody>
      </table></div>
      <div className="products-mobile-list">
        {loading ? <p role="status">{error ? uiText("목록을 불러오지 못했습니다.") : uiText("상품을 불러오는 중…")}</p> : !data.value.items.length ? <p role="status">{uiText("조회된 상품이 없습니다.")}</p> : <>
          <ul className="products-mobile-cards" aria-label={uiText("상품 목록")}>
            {data.value.items.map(({ product: p, categoryName, productTypeName }) => {
              const title = p.name.trim() || p.code || p.barcode || uiText('상품')
              return <li key={p.id} className="products-mobile-item">
                <div className="products-mobile-heading">
                  {p.hasImage ? <img className="product-thumbnail" src={`${endpoint}/${p.id}/image?v=${p.version}`} alt={title} loading="lazy" /> : <span className="product-thumbnail-placeholder" aria-label={uiText("이미지 없음")}>—</span>}
                  <div className="products-mobile-identity"><h2>{title}</h2>{p.code && p.code !== title && <p>{p.code}</p>}</div>
                  <div className="products-mobile-corner"><span className={`products-mobile-status${p.isActive ? ' is-active' : ''}`}>{p.isActive ? uiText("사용") : uiText("미사용")}</span>{canDelete && <input type="checkbox" aria-label={uiText("{v0} 선택", { v0: title })} checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />}</div>
                </div>
                <dl className="products-mobile-facts">
                  <dt>{uiText("상품구분")}</dt><dd>{productTypeName || uiText("미지정")}</dd>
                  <dt>{uiText("카테고리")}</dt><dd>{categoryName || uiText("미분류")}</dd>
                  <dt>{uiText("대표바코드")}</dt><dd className="products-mobile-barcode">{p.barcode || '—'}</dd>

                </dl>
                <div className="products-mobile-actions"><button type="button" className="secondary" aria-label={uiText("{v0} 상세", { v0: title })} onClick={() => openProduct(p.id)}>{uiText("상세")}</button></div>
              </li>
            })}
          </ul>
        </>}
      </div>
      <Pagination pageSizeControl={<PageSizeSelect value={query.pageSize} onChange={pageSize => { setQuery(v => ({ ...v, pageSize, page: 1 })); setFilters(v => ({ ...v, pageSize, page: 1 })); setChecked({ key: '', ids: [] }); }} />} page={query.page} pageSize={data?.value.pageSize || query.pageSize} total={data?.value.total || 0} loading={loading} onChange={page => { setChecked({ key: '', ids: [] }); setQuery(q => ({ ...q, page }), query.page > Math.max(1, Math.ceil((data?.value.total || 0) / (data?.value.pageSize || query.pageSize)))) }} label={uiText("상품 목록 페이지")} />
    </section>
    {importing && <ProductImportDialog endpoint={endpoint} onClose={() => setImporting(false)} onImported={count => { setImporting(false); setNotice(`${count}개 상품을 등록했습니다.`); filter({ page: 1 }); refresh(n => n + 1) }}/>}
    {deleting && <ProductDeleteDialog endpoint={endpoint} products={deleting} onClose={() => setDeleting(null)} onDeleted={deleted} />}
  </>
}

function ProductDetailPage({ id, endpoint, options, onOptions, canUpdate, canDelete, onClose }: {
  id: string; endpoint: string; options: ProductOptions; onOptions: (v: ProductOptions) => void; canUpdate: boolean; canDelete: boolean; onClose: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [data, setData] = useState<ProductItem | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [notice, setNotice] = useState('')
  useEffect(() => {
    let live = true
    api<ProductItem>(`${endpoint}/${id}`).then(value => { if (live) { setData(value); setError('') } }).catch(e => { if (live) setError(e instanceof Error ? e.message : '상품을 불러오지 못했습니다.') })
    return () => { live = false }
  }, [id, endpoint, retry])
  if (!data) return <DetailSurface title={uiText("상품 상세")} onClose={onClose}><p role={error ? 'alert' : 'status'}>{uiText(error) || uiText("상품을 불러오는 중…")}</p>{error && <button className="secondary" onClick={() => setRetry(n => n + 1)}>{uiText("다시 시도")}</button>}</DetailSurface>
  return <>{notice && <p role="status" className="alert success">{uiText(notice)}</p>}{canUpdate ? <ProductEditor key={data.product.version} canDelete={canDelete} page product={data.product} endpoint={endpoint} options={options} onOptions={onOptions} onClose={onClose} onSaved={p => { setData({ ...data, product: p }); setNotice('변경사항을 저장했습니다.'); }} /> : <DetailSurface title={uiText("상품 상세")} code={data.product.code} status={<span className="status-badge">{data.product.isActive ? uiText("사용") : uiText("사용 중지")} {uiText("· 읽기 전용")}</span>} onClose={onClose} actions={canDelete && <button type="button" className="secondary danger-text detail-delete" aria-label={uiText("상품 삭제")} title={uiText("상품 삭제")} onClick={() => setDeleting(true)}><Trash2 size={18} /></button>}><ProductMasterDetail product={data.product} endpoint={endpoint} options={options} canViewCost={data.canViewCost ?? false} /></DetailSurface>}{deleting && <ProductDeleteDialog single endpoint={endpoint} products={[data.product]} onClose={() => setDeleting(false)} onDeleted={onClose} />}</>
}

function ProductEditor({ page = false, canDelete = false, product, endpoint, options, onOptions, onClose, onSaved }: {
  page?: boolean; canDelete?: boolean; product?: Product; endpoint: string; options: ProductOptions; onOptions: (v: ProductOptions) => void
  onClose: () => void; onSaved: (p: Product) => void
}) {
  const [initial] = useState(() => productDraft(product)), [draft, setDraft] = useState(initial)
  const [initialBarcodes] = useState(() => barcodeDrafts(product)), [rows, setRows] = useState(initialBarcodes)
  const [initialImages] = useState(() => imageDrafts(product)), [images, setImages] = useState(initialImages), [imageReading, setImageReading] = useState(false)
  const [requestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const [codeCheckRevision, setCodeCheckRevision] = useState(0)
  const codeConflictShown = useCallback(() => setError(message => message.includes('상품코드') ? '' : message), [])
  const [deleting, setDeleting] = useState(false)
  const [classificationEditing, setClassificationEditing] = useState(false)
  const inFlight = useRef(false)
  const dirty = productDirty(draft, initial, { mode: 'keep' }, product) || JSON.stringify(rows) !== JSON.stringify(initialBarcodes) || JSON.stringify(images) !== JSON.stringify(initialImages) || classificationEditing
  const navigation = useUnsavedNavigation(dirty || busy || imageReading, busy || imageReading, () => { setDraft(initial); setRows(initialBarcodes); setImages(initialImages); setClassificationEditing(false); setConfirm(false) })
  function change<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) { setDraft(d => ({ ...d, [key]: value })) }
  function submit(e: FormEvent) { e.preventDefault(); if (imageReading) { setError('이미지를 읽는 중입니다. 잠시 후 저장해 주세요.'); return } if (classificationEditing) { setError('분류 관리에서 저장하거나 닫은 뒤 상품을 저장해 주세요.'); return } const problem = productError(draft, { mode: 'keep' }) || barcodeRowsError(rows); if (problem) { setError(problem); return } setError(''); setConfirm(true) }
  async function save() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const p = await api<Product>(endpoint + (product ? `/${product.id}` : ''), { ...productRequest(draft, { mode: 'keep' }, requestId, product), barcodes: barcodePayload(rows), images: imagePayload(images) })
      navigation.saved(); onSaved(p)
    } catch (e) { setError(e instanceof Error ? e.message : '상품을 저장하지 못했습니다.'); setConfirm(false); setCodeCheckRevision(value => value + 1) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <RegistrationSurface page={page} formId="product-registration" action={product ? '변경사항 저장' : '상품 등록'} context={product?.code} status={product && <span className="status-badge">{product.isActive ? uiText("사용") : uiText("사용 중지")}</span>} headerActions={product && canDelete && <button type="button" className="secondary danger-text detail-delete" aria-label={uiText("상품 삭제")} title={uiText("상품 삭제")} disabled={busy || imageReading || classificationEditing} onClick={() => setDeleting(true)}><Trash2 size={18} /></button>} description={product ? uiText("상품 정보를 수정한 뒤 변경사항을 저장하세요. 기존 재고와 이력은 유지됩니다.") : undefined} confirmation={confirm || navigation.blocked} size={confirm || navigation.blocked ? 'small' : 'large'} title={!page && navigation.blocked ? uiText("저장하지 않은 상품 작업") : uiText("상품 {v0}", { v0: product ? uiText('상세 · 수정') : uiText('등록') })} busy={busy || imageReading} onClose={() => navigation.blocked ? navigation.stay() : confirm ? setConfirm(false) : requestNavigation(onClose)}>
    <RegistrationPrompt page={page} active={confirm || navigation.blocked} title={navigation.blocked ? uiText("저장하지 않은 변경사항") : product ? uiText("상품 변경 확인") : uiText("상품 등록 확인")} busy={busy || imageReading} onClose={() => navigation.blocked ? navigation.stay() : setConfirm(false)}>
    {!page && error && <p role="alert" className="alert error">{uiText(error)}</p>}
    {navigation.blocked && <UnsavedChangesContent stay={navigation.stay} discard={navigation.discard} message="저장하지 않은 상품 변경을 버리고 이동하시겠습니까?" />}
    {confirm && !navigation.blocked && <section role="alertdialog" aria-label={uiText("상품 저장 확인")}><p>{uiText("상품 정보를 저장하시겠습니까?")}</p><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>{uiText("계속 편집")}</button>{' '}<button className="primary" disabled={busy} onClick={save}>{busy ? uiText("저장 중…") : uiText("확인")}</button></section>}
    </RegistrationPrompt>
    <RegistrationFields page={page} error={page ? error : ''} onEdit={() => setError('')}>
    <form id="product-registration" className={page ? "registration-form" : "dialog-form"} onSubmit={submit} hidden={!page && (confirm || navigation.blocked)}>
      <div className={page ? "registration-content" : "dialog-form-scroll"}><fieldset disabled={busy}>
<ProductMasterFields onCodeConflict={codeConflictShown} codeCheckRevision={codeCheckRevision} product={product} draft={draft} change={change} rows={rows} setRows={setRows} images={images} setImages={setImages} onImageReading={setImageReading} endpoint={endpoint} options={options} onOptions={onOptions} busy={busy} onClassificationEditing={setClassificationEditing} />      </fieldset></div>
      {!page && <div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={() => requestNavigation(onClose)}>{uiText("취소")}</button>{product && canDelete && <button type="button" className="secondary danger-text" disabled={busy || imageReading || classificationEditing} onClick={() => setDeleting(true)}>{uiText("상품 삭제")}</button>}<button type="submit" className="primary" disabled={busy || imageReading}>{product ? uiText("변경사항 저장") : uiText("상품 등록")}</button></div>}
    </form>
    </RegistrationFields>
    {deleting && product && <ProductDeleteDialog single endpoint={endpoint} products={[product]} onClose={() => setDeleting(false)} onDeleted={() => { navigation.saved(); onClose() }} />}
  </RegistrationSurface>
}
