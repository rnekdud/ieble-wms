import FormLabel from '../FormLabel'
import QuantityInput from './QuantityInput'
import { packageFactors } from '../../product-packaging'
import type { ImageDraft } from '../../product-images'
import ProductImageGallery from './ProductImageGallery'
import type { Dispatch, SetStateAction } from 'react'
import type { BarcodeDraft } from '../../product-master-model'
import { gramsToOunces, gramsToPounds, productUnitLabel } from '../../product-model'
import type { Product, ProductDraft, ProductOptions } from '../../product-model'
import DialogSection from './DialogSection'
import ProductBarcodes from './ProductBarcodes'
import ProductClassification from './ProductClassification'

export default function ProductMasterFields({ product, draft, change, rows, setRows, images, setImages, onImageReading, endpoint, options, onOptions, busy, onClassificationEditing }: {
  product?: Product; draft: ProductDraft; change: <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => void
  rows: BarcodeDraft[]; setRows: Dispatch<SetStateAction<BarcodeDraft[]>>; images: ImageDraft[]; setImages: (images: ImageDraft[]) => void; onImageReading: (reading: boolean) => void
  endpoint: string; options: ProductOptions; onOptions: (options: ProductOptions) => void; busy: boolean; onClassificationEditing: (editing: boolean) => void
}) {
  const numeric = (key: keyof ProductDraft, label: string, step = '0.000001') => <label key={key}>{label}<input aria-label={label} type="number" min="0" max={step === '0.01' ? '999999999999.99' : '999999999.999999'} step={step} value={String(draft[key])} onChange={e => change(key, e.target.value as never)} /></label>
  const packaging = { innerPackQuantity: draft.innerPackQuantity ? Number(draft.innerPackQuantity) : null, outerPackQuantity: draft.outerPackQuantity ? Number(draft.outerPackQuantity) : null, outerPackUnit: draft.outerPackUnit, palletPackQuantity: draft.palletPackQuantity ? Number(draft.palletPackQuantity) : null }
  const factors = packageFactors(packaging)
  const packRequired = (key: string) => draft.unit === 'EA' && (key === 'innerPackQuantity' ? draft.outerPackUnit !== 'EA' && (!!draft.outerPackQuantity || !!draft.palletPackQuantity || rows.some(r => ['INNER', 'OUTER', 'PALLET'].includes(r.packageCode || 'EA'))) || rows.some(r => r.packageCode === 'INNER') : key === 'outerPackQuantity' ? !!draft.palletPackQuantity || rows.some(r => ['OUTER', 'PALLET'].includes(r.packageCode || 'EA')) : rows.some(r => r.packageCode === 'PALLET'))
  const packInput = (key: 'innerPackQuantity' | 'outerPackQuantity' | 'palletPackQuantity', label: string, note: string) => <label><FormLabel required={packRequired(key)}>{label}</FormLabel><QuantityInput aria-required={packRequired(key)} unit={"EA"} aria-label={label} type="number" min="1" max="999999999" step="1" value={draft[key]} disabled={draft.unit !== 'EA'} onChange={e => change(key, e.target.value)}/><small>{note}</small></label>
  return <div className="product-master-sections">
    <DialogSection title="기본 정보" className="product-basic-section">
      <label className="product-code-field">상품코드<input aria-label="상품코드" maxLength={64} placeholder="비워 두면 자동 생성" value={draft.code} onChange={e => change('code', e.target.value)} /></label>
      <label className="product-name-field"><FormLabel required>상품명</FormLabel><input aria-label="상품명" required maxLength={200} value={draft.name} onChange={e => change('name', e.target.value)} /></label>

      <label className="product-status-field">사용 여부<select aria-label="상품 사용 여부" value={String(draft.isActive)} onChange={e => change('isActive', e.target.value === 'true')}><option value="true">사용</option><option value="false">사용 중지</option></select></label>
      <label className="product-safety-field">안전재고 수량<QuantityInput unit={draft.unit} aria-label="안전재고 수량" type="number" min="0" max="999999999.999" step="0.001" value={draft.safetyStock} onChange={e => change('safetyStock', e.target.value)} /><small>{productUnitLabel(draft.unit)} · 비워 두면 미설정</small></label>
      {draft.unit !== 'EA' && <p className="products-full organization-help">기존 {draft.unit} 상품입니다. EA 이관 기준 확인 전까지 기존 재고 단위를 보존합니다.</p>}
    </DialogSection>
    <DialogSection title="포장 수량 설정" className="product-packaging-section">
      {packInput('innerPackQuantity', '인박스 수량', '낱개 / 인박스')}
      {packInput('outerPackQuantity', '아웃박스 수량', draft.outerPackUnit === 'EA' ? '낱개 / 아웃박스' : '인박스 / 아웃박스')}
      <label>아웃박스 구성<select aria-label="아웃박스 구성" disabled={draft.unit !== 'EA'} value={draft.outerPackUnit} onChange={e => change('outerPackUnit', e.target.value)}><option value="INNER">인박스</option><option value="EA">낱개 직접 포장</option></select></label>
      {packInput('palletPackQuantity', '파레트당 아웃박스', '아웃박스 / 파레트 · 선택 입력')}
      <p className="products-full" aria-live="polite">{draft.unit === 'EA' ? <>자동 환산 · 낱개 1개 = 1개{factors.INNER && ` · 인박스 1개 = ${factors.INNER.toLocaleString()}개`}{factors.OUTER && ` · 아웃박스 1개 = ${factors.OUTER.toLocaleString()}개`}{factors.PALLET && ` · 파레트 1개 = ${factors.PALLET.toLocaleString()}개`}</> : 'EA 이관 후 포장 수량을 설정할 수 있습니다.'}</p>
    </DialogSection>
    <ProductBarcodes packaging={packaging} packagingDraft={draft} onPackagingChange={change} unit={draft.unit} rows={rows} setRows={setRows} endpoint={endpoint} productId={product?.id} code={draft.code || draft.name} productName={draft.name} productCode={draft.code} busy={busy} />
    <DialogSection title="상품 분류·모델 정보" className="product-classification-section">
      <ProductClassification endpoint={endpoint} options={options} onOptions={onOptions} categoryId={draft.categoryId} productTypeId={draft.productTypeId} onCategory={id => change('categoryId', id)} onType={id => change('productTypeId', id)} onEditing={onClassificationEditing} />
      <label>모델 번호<input aria-label="모델 번호" maxLength={100} value={draft.modelNumber} onChange={e => change('modelNumber', e.target.value)} /></label>
      <label>원산지<input aria-label="원산지" maxLength={100} placeholder="국가명 또는 원산지 정보" value={draft.origin} onChange={e => change('origin', e.target.value)} /></label>
    </DialogSection>
    <DialogSection title="규격·무게·박스 정보" className="product-dimensions-section">
      <div className="products-full product-measure-row">{numeric('weightGrams', '상품 무게 (g)')}
      <div className="product-conversion" aria-live="polite"><span>표시용 환산</span><strong>{draft.weightGrams ? gramsToOunces(Number(draft.weightGrams)).toLocaleString('ko-KR', { maximumFractionDigits: 6 }) : '—'} oz</strong><strong>{draft.weightGrams ? gramsToPounds(Number(draft.weightGrams)).toLocaleString('ko-KR', { maximumFractionDigits: 6 }) : '—'} lb</strong></div>
      {numeric('widthCm', '상품 가로 (cm)')}{numeric('depthCm', '상품 세로 (cm)')}{numeric('heightCm', '상품 높이 (cm)')}</div>
      <div className="products-full product-subheading"><h4>박스 정보</h4><p>박스 무게는 입력한 값 그대로 관리합니다. 포장 포함 여부는 비고에 기록해 주세요.</p></div>
      <div className="products-full product-measure-row">{numeric('boxWeightGrams', '박스 무게 (g)')}{numeric('boxWidthCm', '박스 가로 (cm)')}{numeric('boxDepthCm', '박스 세로 (cm)')}{numeric('boxHeightCm', '박스 높이 (cm)')}</div>
    </DialogSection>
    <DialogSection title="원가·판매가격" className="product-price-section">{numeric('costPrice', '상품 원가 (KRW)', '0.01')}{numeric('retailPrice', '소비자가 (KRW)', '0.01')}<p className="products-full organization-help">원가는 상품 등록·수정 권한을 가진 사용자만 확인할 수 있습니다.</p></DialogSection>
    <DialogSection title="상품 이미지·기타 정보">
      <ProductImageGallery images={images} onChange={setImages} endpoint={endpoint} productId={product?.id} busy={busy} onReading={onImageReading} />
      <label className="products-full">비고<textarea aria-label="비고" rows={3} maxLength={2000} value={draft.notes} onChange={e => change('notes', e.target.value)} /></label>
      <p className="products-full organization-help">LOT·유통기한·시리얼은 입고 시 필요에 따라 입력합니다.</p>
    </DialogSection>
  </div>
}
