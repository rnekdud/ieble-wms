import { getLocale, t as uiText } from './i18n.ts'
export type RackTotal = { rackId: string; unit: string; quantity: number }
export function rackQuantitySummary(totals: RackTotal[], products: number) {
  const values = totals.filter(t => t.quantity !== 0)
  const format = (t: RackTotal) => `${t.quantity.toLocaleString(getLocale(), { maximumFractionDigits: 3 })} ${t.unit}`
  if (!values.length) return uiText('총 0개')
  if (values.length === 1) return ['EA', '개'].includes(values[0].unit) ? uiText('총 {v0}개', {v0:values[0].quantity.toLocaleString(getLocale(), {maximumFractionDigits:3})}) : uiText('총 {v0}', {v0:format(values[0])})
  return uiText('{v0}종 · {v1}{v2}', {v0:products,v1:values.slice(0, 2).map(format).join(' / '),v2:values.length > 2 ? uiText(' 외 {v0}단위', {v0:values.length-2}) : ''})
}
// Screen-pixel cap keeps dashboard text subordinate to the drawing at every zoom.
export function rackLabelFont(label: string, width: number, height: number, scale: number, maximum = 12) {
  const length = Math.max(1, Array.from(label).reduce((n, ch) => n + (ch.codePointAt(0)! > 127 ? 1 : .65), 0))
  const font = Math.max(0, Math.min(maximum / scale, Math.max(0, width - 8) / length, Math.max(0, height - 8) / 2.6))
  return font * scale >= 8 ? font : 0
}
