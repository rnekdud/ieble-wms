import { getLocale, t as uiText } from './i18n.ts'
export type Packaging = { innerPackQuantity?: number | null; outerPackQuantity?: number | null; outerPackUnit?: string; palletPackQuantity?: number | null }
export const packageLabels = { EA: '낱개', INNER: '인박스', OUTER: '아웃박스', PALLET: '파레트' }
export type PackageCode = keyof typeof packageLabels
export function packageFactors(p: Packaging): Record<PackageCode, number | null> {
  const inner = p.innerPackQuantity || null
  const outer = p.outerPackQuantity ? p.outerPackQuantity * (p.outerPackUnit === 'EA' ? 1 : inner || 0) || null : null
  return { EA: 1, INNER: inner, OUTER: outer, PALLET: p.palletPackQuantity && outer ? p.palletPackQuantity * outer : null }
}
export function packagingError(p: Packaging) {
  const values = [p.innerPackQuantity, p.outerPackQuantity, p.palletPackQuantity].filter(v => v != null)
  if (values.some(v => !Number.isSafeInteger(v) || v! < 1 || v! > 999999999)) return '포장 수량은 1 이상의 정수로 입력해 주세요.'
  const factors = packageFactors(p)
  if (p.outerPackQuantity && !factors.OUTER || p.palletPackQuantity && !factors.PALLET) return '포장 단계에 필요한 인박스·아웃박스 수량을 입력해 주세요.'
  if (Object.values(factors).some(v => v != null && v > 999999999)) return '환산 수량은 999,999,999개 이내로 입력해 주세요.'
  return null
}

export function barcodePackageError(p: Packaging, unit: string, code = 'EA'): string | null {
  if (code === 'EA') return null // Existing non-EA labels retain their original one-unit meaning.
  if (!(code in packageLabels)) return '바코드의 포장 단위를 확인해 주세요.'
  if (unit !== 'EA') return '기존 재고 단위의 환산 기준 확인 전에는 포장 바코드를 연결할 수 없습니다.'
  const factor = packageFactors(p)[code as PackageCode]
  if (packagingError(p) || factor == null || !Number.isSafeInteger(factor) || factor < 1)
    return `${packageLabels[code as PackageCode]} 수량이 설정되지 않았거나 올바르지 않습니다. 포장 수량을 복원하거나 바코드 적용 단위를 변경해 주세요.`
  return null
}

export function barcodePackageSummary(p: Packaging & { unit: string }, code = 'EA') {
  if (barcodePackageError(p, p.unit, code)) return uiText('포장 설정 확인 필요')
  if (p.unit !== 'EA') return uiText('기존 단위 · 1 {v0} (자동 환산 없음)', {v0:p.unit})
  return `${uiText(packageLabels[code as PackageCode])} · ${packageFactors(p)[code as PackageCode]!.toLocaleString(getLocale())} EA`
}
