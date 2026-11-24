import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ChevronDown, ChevronRight, Download, FileSpreadsheet, FileText } from 'lucide-react'
import { t } from '../../i18n'
import { useLanguage } from '../../use-language'
import { documentOptions, downloadBusinessDocument } from '../../business-documents'
import type { DocumentFormat, DocumentLanguage } from '../../business-documents'
import './business-documents.css'
export default function BusinessDocumentMenu({ endpoint, type, disabled = false }: { endpoint: string; type: keyof typeof documentOptions; disabled?: boolean }) {
  useLanguage()
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const previousDocument = useRef<string | null>(null)
  const selectedDocument = documentOptions[type].find(option => option.kind === selected)
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), flight = useRef<AbortController | null>(null), id = useId()
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 320 })
  useEffect(() => () => flight.current?.abort(), [endpoint])
  useLayoutEffect(() => {
    if (!open) return
    const align = () => { const r = trigger.current!.getBoundingClientRect(), w = Math.min(304, window.innerWidth - 16), h = Math.min(260, window.innerHeight - 16), below = window.innerHeight - r.bottom - 12; setPosition({ left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), top: below >= Math.min(h, 200) ? r.bottom + 4 : Math.max(8, r.top - h - 4), maxHeight: below >= Math.min(h, 200) ? below : h }) }
    align()
    const close = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key); window.addEventListener('resize', align); window.addEventListener('scroll', align, true)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); window.removeEventListener('resize', align); window.removeEventListener('scroll', align, true) }
  }, [open])
  useLayoutEffect(() => {
    if (!open) return
    const target = selected ? panel.current?.querySelector<HTMLButtonElement>('.business-document-back')
      : panel.current?.querySelector<HTMLButtonElement>(`[data-document-kind="${previousDocument.current}"]`) ?? panel.current?.querySelector<HTMLButtonElement>('.business-document-kind')
    target?.focus({ preventScroll: true })
  }, [open, selected])
  async function handleDownload(kind: string, format: DocumentFormat, language: DocumentLanguage) {
    if (flight.current) return
    const controller = new AbortController(); flight.current = controller; setBusy(true); setError('')
    try { await downloadBusinessDocument(endpoint, kind, format, language, controller.signal); if (!controller.signal.aborted) { setOpen(false); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })) } }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '서류 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.') }
    finally { if (flight.current === controller) { flight.current = null; setBusy(false) } }
  }
  return <div className="business-document-control">
    <button ref={trigger} type="button" className="secondary" disabled={disabled || busy} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog" onClick={() => { if (!open) { previousDocument.current = null; setSelected(null); setError('') } setOpen(v => !v) }}><Download size={16} aria-hidden="true" />{t(busy ? '서류 생성 중…' : '서류 다운로드')}<ChevronDown size={14} aria-hidden="true" /></button>
    {open && createPortal(<div ref={panel} id={id} className="business-document-menu" role="dialog" aria-label={t('서류 다운로드')} aria-busy={busy} style={position} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) setOpen(false) }}>
      <div className="business-document-heading">
        {selectedDocument && <button type="button" className="business-document-back" aria-label={t('뒤로가기')} disabled={busy} onClick={() => { setSelected(null); setError('') }}><ArrowLeft size={18} aria-hidden="true" /></button>}
        <span>{t(selectedDocument?.label ?? '서류 다운로드')}</span>
      </div>
      {selectedDocument ? <div className="business-document-formats" role="group" aria-label={t(selectedDocument.label)}>
        {(['ko', 'en'] as const).map(language => <div className="business-document-language" key={language}>
          <span lang={language}>{language === 'ko' ? '한국어' : 'English'}</span>
          {(['xlsx', 'pdf'] as const).map(format => <button className="secondary" type="button" disabled={busy || disabled} key={format} aria-label={`${t(selectedDocument.label)} ${language === 'ko' ? '한국어' : 'English'} ${format === 'xlsx' ? 'Excel' : 'PDF'}`} onClick={() => void handleDownload(selectedDocument.kind, format, language)}>{format === 'xlsx' ? <FileSpreadsheet size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}{format === 'xlsx' ? 'Excel' : 'PDF'}</button>)}
        </div>)}
      </div> : <div className="business-document-list">
        {documentOptions[type].map(option => <button className="business-document-kind" type="button" disabled={busy || disabled} key={option.kind} data-document-kind={option.kind} onClick={() => { previousDocument.current = option.kind; setSelected(option.kind); setError('') }}><FileText size={17} aria-hidden="true" /><span>{t(option.label)}</span><ChevronRight size={16} aria-hidden="true" /></button>)}
      </div>}
      {selected === 'packing' && <p className="muted">{t('포장 기록이 없는 패킹리스트는 초안으로 생성됩니다.')}</p>}
      {busy && <p role="status">{t('서류 생성 중…')}</p>}
      {error && <p className="alert error" role="alert">{t(error)}</p>}
    </div>, document.body)}
  </div>
}
