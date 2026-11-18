import { packagingError } from './product-packaging.ts'
import type { ProductImage } from './product-images'
import { barcodeChangeError, barcodeChanged } from './rack-barcode.ts'
import type { BarcodeChange } from './rack-barcode.ts'
export type Product = {
  innerPackQuantity?: number | null; outerPackQuantity?: number | null; outerPackUnit?: string; palletPackQuantity?: number | null
  modelNumber?: string | null; origin?: string | null; productTypeId?: string | null
  costPrice?: number | null; retailPrice?: number | null; currency?: string
  weightGrams?: number | null; widthCm?: number | null; depthCm?: number | null; heightCm?: number | null
  boxWeightGrams?: number | null; boxWidthCm?: number | null; boxDepthCm?: number | null; boxHeightCm?: number | null
  images?: ProductImage[]; hasImage?: boolean; barcodes?: ProductBarcode[]
  id: string; code: string; name: string; categoryId: string | null; unit: string
  barcode: string | null; barcodeType: 'Internal' | 'External'; barcodeIsGenerated: boolean
  lotManaged: boolean; expiryManaged: boolean; serialManaged: boolean; safetyStock: number | null
  isActive: boolean; notes: string | null; trackingLockedAt: string | null; version: string
  createdAt: string; updatedAt: string; createdByUserId: string | null; updatedByUserId: string | null
}
export type ProductBarcode = { packageCode?: string; id: string; value: string; isPrimary: boolean; description: string | null; barcodeType: 'Internal' | 'External'; isGenerated: boolean; createdAt?: string; updatedAt?: string }
export type ProductCategory = { isSystem?: boolean; id: string; name: string; parentId: string | null; isActive: boolean; version: string }
export type ProductType = { isSystem?: boolean; id: string; name: string; isActive: boolean; version: string }
export type ProductItem = { product: Product; categoryName: string | null; productTypeName?: string | null; canViewCost?: boolean }
export type ProductList = { items: ProductItem[]; total: number; page: number; pageSize: number }
export type ProductOptions = { categories: ProductCategory[]; productTypes: ProductType[]; units: string[] }
export function productUnitCode(unit: string) {
  return unit === '개' ? 'EA' : unit === '박스' ? 'BOX' : unit
}
export function productUnitLabel(unit: string) {
  const code = productUnitCode(unit)
  const labels: Record<string, string> = { EA: '개', PCS: '피스', SET: '세트', PAIR: '쌍', DOZEN: '다스', BOX: '박스', PACK: '팩', CTN: '카톤', PALLET: '팔레트', ROLL: '롤', BAG: '포대', BUNDLE: '묶음' }; return labels[code] ? `${code} / ${labels[code]}` : code
}
export function productDraft(p?: Product) {
  const decimal = (v?: number | null) => v == null ? '' : String(v)
  return { innerPackQuantity: decimal(p?.innerPackQuantity), outerPackQuantity: decimal(p?.outerPackQuantity), outerPackUnit: p?.outerPackUnit || 'INNER', palletPackQuantity: decimal(p?.palletPackQuantity), modelNumber: p?.modelNumber || '', origin: p?.origin || '', productTypeId: p?.productTypeId || '',
    costPrice: decimal(p?.costPrice), retailPrice: decimal(p?.retailPrice), currency: p?.currency || 'KRW',
    weightGrams: decimal(p?.weightGrams), widthCm: decimal(p?.widthCm), depthCm: decimal(p?.depthCm), heightCm: decimal(p?.heightCm),
    boxWeightGrams: decimal(p?.boxWeightGrams), boxWidthCm: decimal(p?.boxWidthCm), boxDepthCm: decimal(p?.boxDepthCm), boxHeightCm: decimal(p?.boxHeightCm),
    code: p?.code || '', name: p?.name || '', categoryId: p?.categoryId || '', unit: productUnitCode(p?.unit || 'EA'), barcodeType: p?.barcodeType || 'Internal',
    lotManaged: p?.lotManaged || false, expiryManaged: p?.expiryManaged || false, serialManaged: p?.serialManaged || false,
    safetyStock: p?.safetyStock == null ? '' : String(p.safetyStock), isActive: p?.isActive ?? true, notes: p?.notes || '' }
}
export type ProductDraft = ReturnType<typeof productDraft>
export function productError(d: ProductDraft, barcode: BarcodeChange): string | null {
  if (!d.name.trim()) return '상품명을 입력해 주세요.'
  for (const field of productDecimalFields) if (d[field] && (!Number.isFinite(Number(d[field])) || Number(d[field]) < 0)) return '금액·무게·규격은 0 이상의 숫자로 입력해 주세요.'
  if (d.safetyStock && (!/^\d+(\.\d{1,3})?$/.test(d.safetyStock) || Number(d.safetyStock) > 999999999.999)) return '안전재고는 0 이상, 소수점 3자리 이내로 입력해 주세요.'
  return packagingError({ innerPackQuantity: d.innerPackQuantity ? Number(d.innerPackQuantity) : null, outerPackQuantity: d.outerPackQuantity ? Number(d.outerPackQuantity) : null, outerPackUnit: d.outerPackUnit, palletPackQuantity: d.palletPackQuantity ? Number(d.palletPackQuantity) : null }) || barcodeChangeError(barcode)
}
export function productRequest(d: ProductDraft, barcode: BarcodeChange, requestId: string, p?: Product) {
  return { ...d, ...Object.fromEntries(productDecimalFields.map(key => [key, d[key] === '' ? null : Number(d[key])])), productTypeId: d.productTypeId || null, code: d.code.trim(), name: d.name.trim(), categoryId: d.categoryId || null, notes: d.notes.trim() || null,
    safetyStock: d.safetyStock ? Number(d.safetyStock) : null, barcode, requestId, version: p?.version || '00000000-0000-0000-0000-000000000000' }
}
export function productDirty(d: ProductDraft, initial: ProductDraft, barcode: BarcodeChange, p?: Product) {
  const normalized = (value: ProductDraft) => JSON.stringify({ ...value, code: value.code.trim(), name: value.name.trim(), notes: value.notes.trim(), safetyStock: value.safetyStock ? Number(value.safetyStock) : null })
  return normalized(d) !== normalized(initial) || barcodeChanged(p?.barcode, barcode, !p)
}

export const productDecimalFields = ['innerPackQuantity','outerPackQuantity','palletPackQuantity','costPrice','retailPrice','weightGrams','widthCm','depthCm','heightCm','boxWeightGrams','boxWidthCm','boxDepthCm','boxHeightCm'] as const
export function categoryPath(id: string | null, categories: ProductCategory[]) {
  const result: ProductCategory[] = [], seen = new Set<string>(); let current = categories.find(c => c.id === id)
  while (current && !seen.has(current.id) && result.length < 3) { seen.add(current.id); result.unshift(current); current = categories.find(c => c.id === current?.parentId) }
  return result
}
export const gramsToOunces = (grams: number) => grams / 28.349523125
export const gramsToPounds = (grams: number) => grams / 453.59237
