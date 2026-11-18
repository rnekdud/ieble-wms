/** Identity text only: never substitute a barcode, draft ID, or the word "상품". */
export function productLabelIdentity(name?: string | null, code?: string | null) {
  return [name?.trim(), code?.trim()].filter(Boolean).join(' · ')
}

/** Print-job titles also supply the default PDF filename; keep the label text intact. */
export function labelPrintTitle(identity: string) {
  return Array.from(identity, ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 || /[\\/:*?"<>|]/.test(ch) ? '_' : ch).join('').replace(/[. ]+$/, '')
}

// Keep the original one-line caption slot (and therefore barcode position) fixed.
// Long product identities wrap upward into the existing space above the barcode.
// Measure in the main WebView: Android's isolated print WebView disables JavaScript.
export function productCaptionLayout(text: string, widthMm: number, heightMm: number) {
  const measure = document.createElement('div')
  measure.style.cssText = `all:initial;position:fixed;left:-10000px;top:0;visibility:hidden;display:block;box-sizing:border-box;width:${widthMm - 6}mm;padding:0;border:0;margin:0;font:9pt sans-serif;line-height:normal;white-space:nowrap;`
  measure.textContent = text
  document.body.append(measure)
  try {
    const slotHeight = measure.getBoundingClientRect().height
    const available = ((heightMm - 6 - 32 - 1) * 96 / 25.4 + slotHeight) / 2
    measure.style.whiteSpace = 'normal'
    measure.style.overflowWrap = 'anywhere'
    let fontSize = 12 // existing 9pt
    while (fontSize > 1 && measure.getBoundingClientRect().height > available) {
      fontSize -= 0.25
      measure.style.fontSize = `${fontSize}px`
    }
    return `.caption{position:relative;flex-shrink:0;width:100%;height:${slotHeight}px;overflow:visible}.caption-text{position:absolute;bottom:0;left:0;width:100%;font-size:${fontSize}px;line-height:normal;white-space:normal;overflow-wrap:anywhere}`
  } finally { measure.remove() }
}
