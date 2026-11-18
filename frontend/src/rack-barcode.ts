import JsBarcode from 'jsbarcode'

export type BarcodeChange = { mode: 'keep' | 'auto' | 'manual' | 'none'; value?: string; proof?: string }
export function barcodeInputValue(change?: BarcodeChange, current?: string | null): string {
  return !change || change.mode === 'keep' ? current || '' : change.value || ''
}
export function barcodeInputChange(value: string, current?: string | null): BarcodeChange {
  return value === (current || '') ? { mode: 'keep' } : value === '' ? { mode: 'none' } : { mode: 'manual', value }
}
export function barcodeError(value: string): string | null {
  return value.trim().length > 0 && value.length <= 64 && !/[^\x20-\x7e]/.test(value) ? null : '인쇄 가능한 영문·숫자·공백·기호(ASCII) 1~64자로 입력해 주세요. 공백만 있는 값·한글·제어문자는 지원하지 않습니다.'
}
export function barcodeChangeError(change?: BarcodeChange): string | null {
  return change?.mode === 'manual' || (change?.mode === 'auto' && change.value !== undefined) ? barcodeError(change.value ?? '') : null
}
export function barcodeChanged(current: string | null | undefined, change?: BarcodeChange, creating = false): boolean {
  if (!change || change.mode === 'keep') return false
  if (change.mode === 'auto') return change.value !== undefined ? change.value !== current : !creating
  if (change.mode === 'none') return !!current
  return change.value !== current
}
export function barcodeFilename(rackCode: string, value: string, extension: 'png' | 'jpg' | 'svg', kind: 'rack' | 'product' | 'location' = 'rack'): string {
  const safe = (part: string) => part.normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'barcode'
  return `${kind}-${safe(rackCode || 'rack')}-${safe(value)}.${extension}`
}
export function barcodeBits(value: string): string {
  const error = barcodeError(value)
  if (error) throw new Error(error)
  const result: { encodings?: { data: string }[] } = {}
  JsBarcode(result, value, { format: 'CODE128', displayValue: false })
  return result.encodings!.map(e => e.data).join('')
}
export const escapeXml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
export function barcodeGraphic(value: string) {
  const bits = barcodeBits(value), modules = bits.length + 20 // 10-module quiet zones on each side.
  const widthMm = Number((modules * 0.254).toFixed(3)) // 3 printer dots/module at 300 dpi.
  const bars = [...bits.matchAll(/1+/g)].map(m => `<rect x="${10 + m.index!}" y="10" width="${m[0].length}" height="80"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="32mm" viewBox="0 0 ${modules} 126"><rect width="${modules}" height="126" fill="white"/><g fill="black">${bars}</g><text x="${modules / 2}" y="111" text-anchor="middle" font-family="monospace" font-size="10" fill="black" xml:space="preserve">${escapeXml(value)}</text></svg>`
  return { svg, widthMm, modules }
}
