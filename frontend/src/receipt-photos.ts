export const receiptPhotoLimit = 10
export const receiptPhotoMaxBytes = 5 * 1024 * 1024
export type ReceiptPhoto = { id?: string; key: string; fileName: string; contentType: string; base64?: string; thumbnailBase64?: string; preview?: string; thumbnail?: string }
export type ReceiptPhotoInfo = Pick<ReceiptPhoto, 'fileName' | 'contentType'> & { id: string }
export type ReceiptPhotoGallery = { photos: ReceiptPhotoInfo[]; version: string; photosVersion: string }
export function photoRequest(photos: ReceiptPhoto[]) {
  return photos.map(p => p.id ? { id: p.id } : { fileName: p.fileName, contentType: p.contentType, base64: p.base64, thumbnailBase64: p.thumbnailBase64 })
}
export function receiptPhotoError(files: Pick<File, 'name' | 'size' | 'type'>[], count: number) {
  if (count + files.length > receiptPhotoLimit) return '입고 사진은 최대 10장입니다.'
  for (const file of files) {
    if (!/\.(jpe?g|png|webp)$/i.test(file.name) || (file.type && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) return 'JPG·PNG·WebP 사진만 지원합니다. HEIC/HEIF는 JPG로 변환해 주세요.'
    if (!file.size || file.size > receiptPhotoMaxBytes) return '사진은 파일당 5MB 이하로 선택해 주세요.'
    if (file.name.length > 160) return '사진 파일명은 160자 이하로 입력해 주세요.'
  }
  return null
}
export async function readReceiptPhoto(file: File): Promise<ReceiptPhoto> {
  const preview = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('사진을 읽지 못했습니다. 다시 선택해 주세요.')); reader.readAsDataURL(file)
  })
  // Browser decoding honors EXIF orientation, while the original bytes remain unchanged.
  const image = new Image(); image.src = preview
  try { await image.decode() } catch { throw new Error(`${file.name}: 사진을 열 수 없습니다. JPG·PNG·WebP 형식을 확인해 주세요.`) }
  const scale = Math.min(1, 240 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('사진 미리보기를 만들지 못했습니다.')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const thumbnail = canvas.toDataURL('image/jpeg', .82)
  return { key: crypto.randomUUID(), fileName: file.name, contentType: file.type || (/\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : 'image/jpeg'), base64: preview.split(',')[1], thumbnailBase64: thumbnail.split(',')[1], preview, thumbnail }
}
