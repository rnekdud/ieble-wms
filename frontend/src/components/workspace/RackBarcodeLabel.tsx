import { t as uiText, getLanguage } from '../../i18n.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { barcodeError, barcodeFilename, barcodeGraphic, escapeXml } from '../../rack-barcode'
import { barcodeImageBlob } from '../../rack-barcode-image'
import { useMobile } from '../../use-mobile'
import { isAndroidApp } from '../../native-environment'
import { printMobileLabel, printNativeLabel } from '../../label-print'
import './rack-barcode.css'
import { productLabelIdentity, labelPrintTitle, productCaptionLayout } from '../../product-label'

export default function RackBarcodeLabel({ value, rackId, rackCode = '', productName, productCode, draft = false, kind = 'rack' }: { value?: string | null; rackId: string; rackCode?: string; productName?: string; productCode?: string; draft?: boolean; kind?: 'rack' | 'product' | 'location' }) {
  const label = kind === 'product' ? '상품 바코드' : kind === 'location' ? '보관 위치 바코드' : '랙 바코드'
  const graphic = useMemo(() => value && !barcodeError(value) ? barcodeGraphic(value) : null, [value])
  const [error, setError] = useState(''), [size, setSize] = useState('auto')
  const [formats, setFormats] = useState(false), [downloading, setDownloading] = useState(false)
  const mobile = useMobile(), printFrame = useRef<(() => void) | null>(null)
  const [printing, setPrinting] = useState(false)
  useEffect(() => () => { printFrame.current?.() }, [])
  if (!graphic) return null
  async function download(format: 'png' | 'jpg' | 'svg') {
    if (downloading) return
    setDownloading(true); setError('')
    try {
      const blob = format === 'svg' ? new Blob([graphic!.svg], { type: 'image/svg+xml;charset=utf-8' }) : await barcodeImageBlob(graphic!, format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = barcodeFilename(rackCode || rackId, value!, format, kind); a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setFormats(false)
    } catch (e) { setError(e instanceof Error ? e.message : '이미지를 다운로드하지 못했습니다.') }
    finally { setDownloading(false) }
  }
  async function print() {
    if (printing) return
    setError('')
    const width = size === 'auto' ? Math.ceil(graphic!.widthMm + 8) : Number(size), height = 50
    if (width < graphic!.widthMm + 8) { setError('선폭과 여백을 유지하려면 더 넓은 라벨을 선택해 주세요.'); return }
    const caption = kind === 'product' ? productLabelIdentity(productName, productCode ?? rackCode) : `${uiText(label.replace(' 바코드', ''))} · ${rackCode || rackId}`
    if (!caption) { setError('상품명 또는 상품코드를 확인한 뒤 인쇄해 주세요.'); return }
    const title = kind === 'product' ? labelPrintTitle(caption) : uiText("{v0} 라벨", {v0:uiText(label)})
    const captionStyle = kind === 'product' ? productCaptionLayout(caption, width, height) : ''
    const captionHtml = kind === 'product' ? `<span class="caption-text">${escapeXml(caption)}</span>` : escapeXml(caption)
    const html = `<!doctype html><html lang="${getLanguage()}"><head><meta charset="utf-8"><title>${escapeXml(title)}</title><style>@page{size:${width}mm ${height}mm;margin:0}body{margin:0;background:white;color:black;font-family:sans-serif}.label{width:${width}mm;height:${height}mm;box-sizing:border-box;padding:3mm;display:flex;flex-direction:column;align-items:center;justify-content:center;break-inside:avoid}.caption{font-size:9pt;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;margin-bottom:1mm}svg{display:block;width:${graphic!.widthMm}mm;height:32mm;max-width:none;flex-shrink:0}@media print{.controls{display:none}}.controls{margin:16px}${captionStyle}</style></head><body><div class="label"><div class="caption">${captionHtml}</div>${graphic!.svg}</div></body></html>`
    if (isAndroidApp()) {
      setPrinting(true)
      try { await printNativeLabel({ html, title, width, height }) }
      catch { setError('인쇄 화면을 열지 못했습니다. 최신 WMS 앱인지 확인 후 다시 시도해 주세요.') }
      finally { setPrinting(false) }
      return
    }
    if (mobile) {
      printFrame.current?.()
      printFrame.current = printMobileLabel(html, () => setError('인쇄 화면을 열지 못했습니다. 다시 시도해 주세요.'))
      return
    }
    const popup = window.open('', '_blank', 'width=900,height=500')
    if (!popup) { setError('인쇄 창을 열 수 없습니다. 팝업 허용 후 다시 시도해 주세요.'); return }
    popup.opener = null
    popup.document.write(html.replace('<body>', `<body><div class="controls"><p>${escapeXml(uiText("라벨 용지 {v0} × {v1} mm · 실제 크기(100%)로 인쇄하세요. 용지에 맞게 축소하지 마세요.", {v0:width,v1:height}))}</p><p>${escapeXml(value!)}</p><button type="button" id="back">${escapeXml(uiText("WMS로 돌아가기"))}</button> <button type="button" id="print">${escapeXml(uiText("라벨 인쇄"))}</button></div>`))
    popup.document.close()
    popup.document.getElementById('print')!.onclick = () => popup.print()
    popup.document.getElementById('back')!.onclick = () => popup.close()
    popup.focus()
    // The explicit button also permits reprinting after cancellation; no automatic popup dismissal.
    popup.setTimeout(() => popup.print(), 150)
  }
  return <section className="rack-barcode-label" aria-label={uiText("{v0} 라벨", { v0: uiText(label) })}>
    {draft && <small className="organization-help">{uiText("저장 전 미리보기")}</small>}
    <img alt={`${uiText(label)} ${value}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(graphic.svg)}`} />
    <p className="rack-barcode-value">{value}</p>{/^880\d{17}$/.test(value || '') && <small>{uiText("WMS 내부 식별번호 · Code 128 · GS1/GTIN 아님")}</small>}
    <p className="organization-help">Code 128 · {graphic.widthMm} {uiText("× 32 mm · 100% 인쇄")}</p>
    <label>{uiText("라벨 크기")}<select aria-label={uiText("라벨 크기")} value={size} onChange={e => setSize(e.target.value)}><option value="auto">{uiText("바코드에 맞춤 (권장)")}</option><option value="60">60 × 50 mm</option><option value="80">80 × 50 mm</option><option value="100">100 × 50 mm</option></select></label>
    <div className="organization-row-actions"><button type="button" className="secondary" aria-expanded={formats} disabled={downloading} onClick={() => setFormats(open => !open)}>{downloading ? uiText("이미지 생성 중…") : uiText("이미지 다운로드")}</button><button type="button" className="secondary" disabled={printing} onClick={() => void print()}>{uiText("라벨 인쇄")}</button></div>
    {formats && <div className="rack-barcode-downloads" role="group" aria-label={uiText("다운로드 형식")}>{(['png', 'jpg', 'svg'] as const).map(format => <button type="button" className="secondary" key={format} disabled={downloading} onClick={() => void download(format)}>{format.toUpperCase()} {uiText("다운로드")}</button>)}</div>}
    {error && <p role="alert">{uiText(error)}</p>}
  </section>
}
