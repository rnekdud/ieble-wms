// Device adapters create one event per deliberate scan. API/document/stage routing belongs to the caller.
export type BarcodeScanEvent = { barcode: string; requestId: string }
export function scanEvent(barcode: string): BarcodeScanEvent {
  // getRandomValues also works in an HTTP intranet where camera/randomUUID may be unavailable.
  if (typeof crypto.randomUUID === 'function') return { barcode, requestId: crypto.randomUUID() }
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return { barcode, requestId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` }
}
export type BarcodeDetectorApi = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
export type BarcodeDetectorConstructor = { new(options: { formats: string[] }): BarcodeDetectorApi; getSupportedFormats(): Promise<string[]> }
export const cameraFormats = ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'qr_code', 'data_matrix']
export function cameraSupport(): string | null {
  if (!window.isSecureContext) return '카메라는 HTTPS 또는 localhost에서 사용할 수 있습니다. 바코드를 직접 입력하세요.'
  if (!navigator.mediaDevices?.getUserMedia) return '이 브라우저는 카메라를 지원하지 않습니다. 바코드를 직접 입력하세요.'
  return null
}
export function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return '카메라 권한이 거부되었습니다. 브라우저 권한을 허용하거나 직접 입력하세요.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '사용 가능한 카메라가 없습니다. 직접 입력하세요.'
  if (name === 'NotReadableError') return '카메라를 사용할 수 없습니다. 다른 앱의 카메라 사용을 종료하거나 직접 입력하세요.'
  return '카메라 인식에 실패했습니다. 다시 시도하거나 직접 입력하세요.'
}
