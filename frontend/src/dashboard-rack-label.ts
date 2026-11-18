export type RackTotal = { rackId: string; unit: string; quantity: number }
export function rackQuantitySummary(totals: RackTotal[], products: number) {
  const values = totals.filter(t => t.quantity !== 0)
  const format = (t: RackTotal) => `${t.quantity.toLocaleString('ko-KR', { maximumFractionDigits: 3 })} ${t.unit}`
  if (!values.length) return '총 0개'
  if (values.length === 1) return `총 ${['EA', '개'].includes(values[0].unit) ? values[0].quantity.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) + '개' : format(values[0])}`
  return `${products}종 · ${values.slice(0, 2).map(format).join(' / ')}${values.length > 2 ? ` 외 ${values.length - 2}단위` : ''}`
}
// Screen-pixel cap keeps dashboard text subordinate to the drawing at every zoom.
export function rackLabelFont(label: string, width: number, height: number, scale: number, maximum = 12) {
  const length = Math.max(1, Array.from(label).reduce((n, ch) => n + (ch.codePointAt(0)! > 127 ? 1 : .65), 0))
  const font = Math.max(0, Math.min(maximum / scale, Math.max(0, width - 8) / length, Math.max(0, height - 8) / 2.6))
  return font * scale >= 8 ? font : 0
}
