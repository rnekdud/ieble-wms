import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from './native-environment'
export type DocumentFormat = 'xlsx' | 'pdf'
export type DocumentLanguage = 'ko' | 'en'
export const documentOptions = {
  receipts: [{ kind: 'statement', label: '입고 명세서' }, { kind: 'inspection', label: '입고 검수표' }],
  shipments: [{ kind: 'order', label: '출고지시서' }, { kind: 'packing', label: '출고 패킹리스트' }, { kind: 'picking', label: '출고 피킹리스트' }],
} as const
export const nativeDocuments = registerPlugin<{ save(options: { fileName: string; mimeType: string; base64: string }): Promise<{ cancelled?: boolean }> }>('WmsDocuments')
export function documentFileName(disposition: string | null, fallback: string) {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  let value = disposition?.match(/filename="([^"]+)"/i)?.[1] || fallback
  if (encoded) { try { value = decodeURIComponent(encoded) } catch { /* safe fallback */ } }
  return Array.from(value, c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || '/\\:*?"<>|'.includes(c) ? '_' : c).join('')
}
export async function downloadBusinessDocument(endpoint: string, kind: string, format: DocumentFormat, language: DocumentLanguage, signal?: AbortSignal) {
  let response: Response
  try { response = await fetch(`${endpoint}/documents/${kind}?format=${format}&language=${language}`, { credentials: 'same-origin', cache: 'no-store', signal }) }
  catch (error) { if (signal?.aborted) throw error; throw new Error('서류를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.', { cause: error }) }
  if (!response.ok) {
    throw new Error(response.status === 401 ? '로그인이 필요하거나 세션이 만료되었습니다.' : response.status === 403 ? '이 화면에 접근할 권한이 없습니다.' : response.status === 404 ? '서류를 찾을 수 없거나 다운로드 API가 활성화되지 않았습니다.' : response.status === 429 ? '요청이 많습니다. 1분 후 다시 시도해 주세요.' : '서류 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.')
  }
  const mimeType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (response.headers.get('content-type')?.split(';')[0] !== mimeType) throw new Error('서류 파일 형식을 확인하지 못했습니다.')
  const blob = await response.blob()
  const bytes = new Uint8Array(await blob.slice(0, 5).arrayBuffer())
  if (format === 'pdf' ? String.fromCharCode(...bytes) !== '%PDF-' : bytes[0] !== 80 || bytes[1] !== 75) throw new Error('서류 파일 형식을 확인하지 못했습니다.')
  const fileName = documentFileName(response.headers.get('content-disposition'), `WMS_${kind}.${format}`)
  if (signal?.aborted) return
  if (isNativeApp()) {
    if (blob.size > 32 * 1024 * 1024) throw new Error('파일이 큽니다. PC 웹에서 다운로드해 주세요.')
    const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('서류 파일을 읽지 못했습니다.')); reader.readAsDataURL(blob) })
    if (signal?.aborted) return
    try { await nativeDocuments.save({ fileName, mimeType, base64 }) }
    catch { throw new Error('앱의 서류 저장 기능을 실행하지 못했습니다. 최신 앱 빌드가 필요하거나 파일 저장이 지원되지 않습니다. PC 웹에서 다운로드해 주세요.') }
    return
  }
  const url = URL.createObjectURL(blob), anchor = document.createElement('a')
  anchor.href = url; anchor.download = fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
