import type { Product } from './product-model'
export type ProductImage = { id: string; fileName: string; contentType: string; isPrimary: boolean; position: number; createdAt?: string | null }
export type ImageDraft = { key: string; id?: string; fileName: string; contentType: string; isPrimary: boolean; base64?: string; preview?: string }
export const imageLimit = 8
export function imageDrafts(product?: Product): ImageDraft[] {
  return (product?.images || []).map(i => ({ key: i.id, id: i.id, fileName: i.fileName, contentType: i.contentType, isPrimary: i.isPrimary }))
}
export function imagePayload(images: ImageDraft[]) {
  return images.map(({ id, fileName, contentType, base64, isPrimary }) => ({ id: id || null, fileName, contentType, base64, isPrimary }))
}
export function removeImage(images: ImageDraft[], key: string) {
  const remaining = images.filter(i => i.key !== key)
  return remaining.some(i => i.isPrimary) ? remaining : remaining.map((i, index) => ({ ...i, isPrimary: index === 0 }))
}
export function imageFilesError(files: File[], existing: number) {
  if (files.length + existing > imageLimit) return '상품 이미지는 최대 8장까지 등록할 수 있습니다.'
  if (files.some(f => !['image/png', 'image/jpeg'].includes(f.type) || !/\.(png|jpe?g)$/i.test(f.name) || f.size < 1 || f.size > 2 * 1024 * 1024)) return '이미지는 장당 2MB 이하 PNG·JPG 파일을 선택해 주세요.'
  return null
}
