import { barcodePackageSummary, packageFactors } from '../../product-packaging'
import { useState } from 'react'
import ProductImageGallery from './ProductImageGallery'
import { imageDrafts } from '../../product-images'
import { categoryPath } from '../../product-model'
import type { Product, ProductOptions } from '../../product-model'
import DialogSection from './DialogSection'
import RackBarcodeLabel from './RackBarcodeLabel'
export default function ProductMasterDetail({ product: p, endpoint, options, canViewCost, compact = false }: { product: Product; endpoint: string; options: ProductOptions; canViewCost: boolean; compact?: boolean }) {
  const [selectedBarcode, setSelectedBarcode] = useState<string | null>(null)
  const preview = p.barcodes?.find(b => b.id === selectedBarcode) || p.barcodes?.find(b => b.isPrimary) || p.barcodes?.[0]
  const field = (name: string, value: string | number | null | undefined) => compact && (value == null || value === '') ? null : <div key={name}><dt>{name}</dt><dd>{value ?? '—'}</dd></div>
  const dimension = (a?: number | null, b?: number | null, c?: number | null) => compact && [a,b,c].every(v => v == null) ? null : [a, b, c].map(v => v ?? '—').join(' × ') + ' cm'
  return <div className="product-master-sections product-master-detail">
    <DialogSection title="포장 수량 설정"><p>인박스 1개 = {packageFactors(p).INNER ?? '미설정'} EA · 아웃박스 1개 = {packageFactors(p).OUTER ?? '미설정'} EA · 파레트 1개 = {packageFactors(p).PALLET ?? '미설정'} EA</p></DialogSection>
    <DialogSection title="기본 정보"><dl className="products-detail products-full">{field('상품코드', p.code)}{field('상품명', p.name)}{field('사용 여부', p.isActive ? '사용' : '사용 중지')}{field('안전재고', p.safetyStock == null ? (compact ? null : '미설정') : `${p.safetyStock} ${p.unit}`)}</dl></DialogSection>
    {!compact && <DialogSection title="바코드 관리"><div className="products-full product-barcode-workspace"><div>{!p.barcodes?.length ? <p>등록된 바코드가 없습니다.</p> : p.barcodes.map(b => <div key={b.id} className="product-detail-barcode"><button type="button" className="secondary" aria-pressed={preview?.id === b.id} onClick={() => setSelectedBarcode(b.id)}>{b.isPrimary ? '대표 · ' : ''}{b.value}</button><p>{barcodePackageSummary(p, b.packageCode)}</p>{b.description && <p>{b.description}</p>}<small>{b.createdAt ? `등록 ${new Date(b.createdAt).toLocaleString('ko-KR')}` : '등록 시각 미기록'}{b.updatedAt && ` · 수정 ${new Date(b.updatedAt).toLocaleString('ko-KR')}`}</small></div>)}</div><aside className="product-barcode-preview">{preview ? <RackBarcodeLabel kind="product" productName={p.name} value={preview.value} rackId={p.id} rackCode={p.code} /> : <p>등록된 바코드 이미지 없음</p>}</aside></div></DialogSection>}
    <DialogSection title="상품 분류·모델 정보"><dl className="products-detail products-full">{field('모델 번호', p.modelNumber)}{field('원산지', p.origin)}{field('카테고리', categoryPath(p.categoryId, options.categories).map(c => c.name).join(' › ') || '미분류')}{field('상품 구분', options.productTypes?.find(t => t.id === p.productTypeId)?.name || '미지정')}</dl></DialogSection>
    {(!compact || [p.weightGrams,p.widthCm,p.depthCm,p.heightCm,p.boxWeightGrams,p.boxWidthCm,p.boxDepthCm,p.boxHeightCm].some(v => v != null)) && <DialogSection title="규격·무게·박스 정보"><dl className="products-detail products-full">{field('상품 무게', p.weightGrams == null ? null : `${p.weightGrams} g`)}{field('상품 가로 × 세로 × 높이', dimension(p.widthCm, p.depthCm, p.heightCm))}{field('박스 무게 (입력 기준)', p.boxWeightGrams == null ? null : `${p.boxWeightGrams} g`)}{field('박스 가로 × 세로 × 높이', dimension(p.boxWidthCm, p.boxDepthCm, p.boxHeightCm))}</dl></DialogSection>}
    {(!compact || (canViewCost && p.costPrice != null) || p.retailPrice != null) && <DialogSection title="원가·판매가격"><dl className="products-detail products-full">{canViewCost && field('원가', p.costPrice == null ? null : `${p.costPrice.toLocaleString('ko-KR')} ${p.currency || 'KRW'}`)}{field('소비자가', p.retailPrice == null ? null : `${p.retailPrice.toLocaleString('ko-KR')} ${p.currency || 'KRW'}`)}</dl></DialogSection>}
    {(!compact || p.notes) && <DialogSection title={compact ? "비고" : "상품 이미지·기타 정보"}>{!compact && <ProductImageGallery images={imageDrafts(p)} endpoint={endpoint} productId={p.id} />}<dl className="products-detail products-full">{field('비고', p.notes)}{!compact && field('등록일', new Date(p.createdAt).toLocaleString('ko-KR'))}{!compact && field('수정일', new Date(p.updatedAt).toLocaleString('ko-KR'))}</dl></DialogSection>}
  </div>
}
