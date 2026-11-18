import { registerPlugin } from '@capacitor/core'

type LabelPrint = { html: string; title: string; width: number; height: number }
const nativePrint = registerPlugin<{ printLabel(options: LabelPrint): Promise<void> }>('WmsPrint')

export function printNativeLabel(options: LabelPrint) {
  return nativePrint.printLabel(options)
}

// Print an isolated document without replacing the WMS document or adding history.
// Keep the frame until afterprint, the next request, or unmount. Returning from print()
// alone does not mean the user has finished, and afterprint does not imply success.
export function printMobileLabel(html: string, onError: () => void): () => void {
  const frame = document.createElement('iframe')
  frame.title = '바코드 라벨 인쇄 문서'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:500px;border:0;'
  let printed = false
  const dispose = () => { frame.onload = null; frame.remove() }
  frame.onload = () => {
    if (printed) return
    printed = true
    const target = frame.contentWindow
    if (!target) { dispose(); onError(); return }
    target.addEventListener('afterprint', () => window.setTimeout(dispose, 0), { once: true })
    try { target.print() } catch { dispose(); onError() }
  }
  frame.srcdoc = html
  document.body.append(frame)
  return dispose
}
