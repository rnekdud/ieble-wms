import { t as uiText } from '../../i18n.ts'
import CameraScanButton from '../mobile/CameraScanButton'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { MapPin, ScanLine } from 'lucide-react'
import { api } from '../../api'
import BarcodeProductStock from './BarcodeProductStock'
import { barcodePackageSummary } from '../../product-packaging'
import { barcodeError } from '../../rack-barcode'
import { imageDrafts } from '../../product-images'
import type { Product, ProductItem, ProductOptions } from '../../product-model'
import type { StorageItem } from '../../types/warehouse'
import RackBarcodeLabel from './RackBarcodeLabel'
import ProductImageGallery from './ProductImageGallery'
import ProductMasterDetail from './ProductMasterDetail'
import { PageHeading } from './WorkspaceUI'
import { RackFrontDetails, RackStock } from './RackFrontDialog'
import type { RackFrontData } from './RackFrontDialog'
import './barcode-lookup.css'

const BarcodeLocationDialog = lazy(() => import('./BarcodeLocationDialog'))

type Result = { kind: 'product'; item: Product; inventoryAvailable: boolean } | { kind: 'rack'; item: RackFrontData } | { kind: 'location'; item: StorageItem; warehouseName: string; rackCode: string | null; zoneName: string | null; inventoryAvailable: boolean }
type Loaded = { result: Result; scanned: string; detail?: ProductItem; options?: ProductOptions }


export default function BarcodeLookup({ tenantId, onNavigate }: { tenantId: string; onNavigate: (path: string) => void }) {
  const [value, setValue] = useState(''), [loaded, setLoaded] = useState<Loaded | null>(null)
  const [selectedBarcode, setSelectedBarcode] = useState(''), [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')

  const input = useRef<HTMLInputElement>(null), sending = useRef(false), revision = useRef(0), alive = useRef(false)
  const endpoint = `/api/tenants/${tenantId}/barcodes`, products = `/api/tenants/${tenantId}/products`
  useEffect(() => { alive.current = true; if (!window.matchMedia('(max-width:1024px)').matches) input.current?.focus(); return () => { alive.current = false } }, [])
  async function lookup(code = value) {
    if (sending.current) return
    const invalid = barcodeError(code)
    if (invalid) { revision.current++; setError(invalid); setLoaded(null); return }
    const scanned = code, request = ++revision.current
    sending.current = true; setLocationOpen(false); setBusy(true); setError(''); setLoaded(null)
    try {
      const result = await api<Result>(`${endpoint}/lookup?${new URLSearchParams({ value: scanned })}`)
      let detail: ProductItem | undefined, options: ProductOptions | undefined
      if (result.kind === 'product') {
        // The existing detail endpoint redacts cost on the server, and supplies
        // gallery metadata and ALL barcode aliases. Never substitute primary for scanned.
        [detail, options] = await Promise.all([api<ProductItem>(`${products}/${result.item.id}`), api<ProductOptions>(`${products}/options`)])
      }
      if (!alive.current || request !== revision.current) return
      setLoaded({ result, scanned, detail, options }); setSelectedBarcode(scanned)
      // Keep a scanner-ready field focused without stealing focus from result controls.
      if (input.current?.value === scanned) setValue('')
    } catch (e) {
      if (alive.current && request === revision.current) setError(e instanceof Error ? e.message : '조회하지 못했습니다.')
    } finally {
      if (alive.current && request === revision.current) { sending.current = false; setBusy(false) }
    }
  }
  const result = loaded?.result
  const product = loaded?.detail?.product
  // Detail is fetched after lookup: use that same latest identity for heading and label.
  const target = result?.kind === 'rack' ? result.item.rack : result?.kind === 'product' ? product || result.item : result?.item
  const scannedBarcode = product?.barcodes?.find(b => b.value === loaded?.scanned)
  const preview = product?.barcodes?.find(b => b.value === selectedBarcode)
  return <div className="barcode-lookup-page">
    <PageHeading title={uiText("바코드 조회")} actions={<CameraScanButton onError={setCameraError} onManual={() => input.current?.focus()} disabled={busy} onScan={code => { setValue(code); void lookup(code) }} />} />
    <form className="barcode-lookup-search" onSubmit={e => { e.preventDefault(); void lookup() }} aria-busy={busy}>
      <label htmlFor="barcode-lookup-input">{uiText("바코드 입력 / 스캔")}</label>
      <div><ScanLine size={23} aria-hidden="true" /><input ref={input} id="barcode-lookup-input" aria-label={uiText("조회 바코드")} placeholder={uiText("바코드를 입력하거나 스캔하세요")} value={value} autoComplete="off" spellCheck={false} onChange={e => { setValue(e.target.value); setError('') }} onKeyDown={e => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault() }} /><button className="primary" disabled={busy}>{busy ? uiText("조회 중…") : uiText("조회")}</button></div>
      <small>{uiText("리더기의 Enter 또는 조회 버튼으로 검색합니다. 조회는 상품·재고를 변경하지 않습니다.")}</small>
    </form>
    {cameraError && <p role="alert" className="alert error">{uiText(cameraError)}</p>}
    {error && <p role="alert" className="alert error">{uiText(error)}</p>}
    {busy && <p role="status">{uiText("등록된 정보를 조회하고 있습니다…")}</p>}
    {!loaded && !busy && !error && <div className="barcode-lookup-empty"><ScanLine size={38} aria-hidden="true" /><p>{uiText("바코드를 스캔하면 등록된 정보를 확인할 수 있습니다.")}</p></div>}
    {loaded && result && target && <section className="barcode-result" aria-label={uiText("바코드 조회 결과")}>
      <div className="barcode-result-heading"><div><span className="wms-chip">{result.kind === 'product' ? uiText("상품") : result.kind === 'rack' ? uiText("랙") : uiText("보관 위치")}</span><h2>{target.name} <small>{target.code}</small></h2>{product && result.kind === 'product' && result.inventoryAvailable && <button type="button" className="secondary barcode-find-location" onClick={() => setLocationOpen(true)}><MapPin size={16} aria-hidden="true" />{uiText("상품 위치 찾기")}</button>}</div></div>
      {product && <p className="barcode-package-summary" aria-label={uiText("조회한 바코드 포장 단위")}>{loaded.scanned} · {uiText(barcodePackageSummary(product, scannedBarcode?.packageCode))}</p>}
      <p className="sr-only" role="status">{target.name} {uiText("조회 완료")}</p>
      {result.kind === 'product' && product && loaded.options && <div className="barcode-product-layout">
        <div className="barcode-product-information"><ProductImageGallery key={product.id} featured images={imageDrafts(product)} endpoint={products} productId={product.id} />{result.inventoryAvailable ? <BarcodeProductStock key={`${tenantId}:${product.id}:${loaded.scanned}`} tenantId={tenantId} productId={product.id} /> : <p>{uiText("재고 현황 조회 권한이 없습니다.")}</p>}<ProductMasterDetail compact product={product} endpoint={products} options={loaded.options} canViewCost={loaded.detail?.canViewCost === true} />{result.inventoryAvailable && <button className="secondary" onClick={() => onNavigate('/app/reports/stock?search=' + encodeURIComponent(product.code))}>{uiText("재고 현황 보기")}</button>}</div>
        <aside className="barcode-label-panel" aria-label={uiText("상품 바코드 라벨 및 목록")}><h3>{uiText("바코드 라벨")}</h3><p>{preview?.isPrimary ? uiText("대표 바코드") : uiText("추가 바코드")}{selectedBarcode === loaded.scanned && <span className="barcode-scanned-tag">{uiText("스캔한 바코드")}</span>}</p>
          <p>{uiText(barcodePackageSummary(product, preview?.packageCode))}</p>
          <RackBarcodeLabel key={selectedBarcode} kind="product" productName={product.name} value={selectedBarcode} rackId={product.id} rackCode={product.code} />
          <div className="barcode-aliases" role="group" aria-label={uiText("등록된 상품 바코드")}>{product.barcodes?.map(b => <button key={b.id} className="secondary" type="button" aria-pressed={selectedBarcode === b.value} onClick={() => setSelectedBarcode(b.value)}><span>{b.value}</span><small>{[b.isPrimary ? uiText('대표') : uiText('추가'), b.value === loaded.scanned ? uiText('스캔한 바코드') : '', uiText(barcodePackageSummary(product, b.packageCode)), b.description].filter(Boolean).join(' · ')}</small></button>)}</div>
        </aside>
      </div>}
      {result.kind === 'rack' && <><RackFrontDetails key={target.id} endpoint={`/api/tenants/${tenantId}/warehouses/${result.item.rack.warehouseId}`} rackId={result.item.rack.id} /><button className="secondary" onClick={() => onNavigate(`/app/warehouses?warehouseId=${result.item.rack.warehouseId}&rackId=${result.item.rack.id}&view=2d`)}>{uiText("창고에서 보기")}</button></>}
      {result.kind === 'location' && <><dl className="warehouse-details"><dt>{uiText("위치명")}</dt><dd>{result.item.name}</dd><dt>{uiText("창고 / 구역")}</dt><dd>{result.warehouseName} / {result.zoneName || uiText("미지정")}</dd><dt>{uiText("랙 / 단 / 칸")}</dt><dd>{result.rackCode || uiText("바닥 위치")} / {result.item.level ?? '—'} / {result.item.bay ?? '—'}</dd></dl><RackBarcodeLabel key={target.id} kind="location" value={result.item.barcode} rackId={result.item.id} rackCode={result.item.code} />{result.inventoryAvailable ? <RackStock key={target.id} endpoint={endpoint} stockEndpoint={`${endpoint}/locations/${result.item.id}/stock`} /> : <p>{uiText("재고 현황 조회 권한이 없습니다.")}</p>}<button className="secondary" onClick={() => onNavigate(`/app/warehouses?warehouseId=${result.item.warehouseId}&rackId=${result.item.rackId || ''}&locationCode=${encodeURIComponent(result.item.code)}&level=${result.item.level || ''}&bay=${result.item.bay || ''}&view=2d`)}>{uiText("창고에서 보기")}</button></>}

      {locationOpen && product && result.kind === 'product' && result.inventoryAvailable && <Suspense fallback={<p role="status">{uiText("상품 위치 찾기를 여는 중…")}</p>}><BarcodeLocationDialog key={`${tenantId}:${product.id}`} tenantId={tenantId} productId={product.id} productName={product.name} onClose={() => setLocationOpen(false)} /></Suspense>}
    </section>}
  </div>
}
