import { t as uiText } from '../../i18n.ts'
import { useEffect, useRef, useState } from 'react'
import { useReceiptPhotos } from '../../use-receipt-photos'
import { api } from '../../api'
import { photoRequest, readReceiptPhoto, receiptPhotoError, receiptPhotoLimit } from '../../receipt-photos'
import type { ReceiptPhoto, ReceiptPhotoGallery } from '../../receipt-photos'
import type { ReceiptDetail } from '../../receipt-model'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import UnsavedChangesDialog from './UnsavedChangesDialog'
import ReceiptPhotoViewer from './ReceiptPhotoViewer'
import './receipt-photos.css'

export function ReceiptPhotoPicker({ photos, onChange, endpoint, id, busy = false, onReading }: { photos: ReceiptPhoto[]; onChange?: (value: ReceiptPhoto[]) => void; endpoint: string; id?: string; busy?: boolean; onReading?: (value: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null), flight = useRef(false), live = useRef(true)
  const [reading, setReading] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState<string | null>(null)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const locked = busy || reading
  async function add(files: File[]) {
    if (!onChange || locked || flight.current || !files.length) return
    const problem = receiptPhotoError(files, photos.length); if (problem) { setError(problem); return }
    flight.current = true; setReading(true); onReading?.(true); setError('')
    try {
      // Decode sequentially to avoid loading ten full-resolution camera photos simultaneously.
      const additions: ReceiptPhoto[] = []
      for (const file of files) additions.push(await readReceiptPhoto(file))
      if (live.current) onChange([...photos, ...additions])
    } catch (e) { if (live.current) setError(e instanceof Error ? e.message : '사진을 읽지 못했습니다. 다시 선택해 주세요.') }
    finally { flight.current = false; if (live.current) { setReading(false); onReading?.(false) } }
  }
  const source = (p: ReceiptPhoto, thumbnail: boolean) => (thumbnail ? p.thumbnail : p.preview) || `${endpoint}/${id}/photos/${p.id}${thumbnail ? '?thumbnail=true' : ''}`
  return <section className="receipt-photos" aria-label={uiText("입고 사진")}>
    <h3>{uiText("입고 사진")} <span>{photos.length} / {receiptPhotoLimit}</span></h3>
    <div className="receipt-photo-grid">
      {!photos.length && <div className="receipt-photo-empty"><span aria-hidden="true">▧</span>{uiText("등록된 이미지 없음")}</div>}
      {photos.map((p, i) => <div className="receipt-photo-thumb" key={p.key}>
        <button type="button" className="receipt-photo-open" aria-label={uiText("입고 사진 {v0} 확대", { v0: i + 1 })} onClick={() => setSelected(p.key)}><img src={source(p, true)} alt={p.fileName} loading="lazy" /></button>
        {onChange && <button type="button" className="receipt-photo-delete" aria-label={uiText("입고 사진 {v0} 삭제", { v0: i + 1 })} disabled={locked} onClick={() => { onChange(photos.filter(x => x.key !== p.key)); setError('') }}>{uiText("제거")}</button>}
      </div>)}
      {onChange && <button className="receipt-photo-add" type="button" disabled={locked || photos.length >= receiptPhotoLimit} onClick={() => input.current?.click()}><span aria-hidden="true">+</span>{reading ? uiText("사진 준비 중…") : uiText("사진 추가")}</button>}
    </div>
    {onChange ? <><input ref={input} hidden type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label={uiText("입고 사진 파일")} onChange={e => { void add(Array.from(e.target.files || [])); e.target.value = '' }} /><p className="receipt-photo-hint">{uiText("JPG·PNG·WebP · 최대 10장 · 파일당 5MB. 사진 변경은 저장 시 반영됩니다.")}</p></> : null}
    {error && <p className="alert error" role="alert">{uiText(error)}</p>}
    {selected && photos.some(p => p.key === selected) && <ReceiptPhotoViewer key={selected} photos={photos} initial={photos.findIndex(p => p.key === selected)} source={p => source(p, false)} onClose={() => setSelected(null)} />}
  </section>
}
export default function ReceiptPhotos({ data, endpoint, writable, busy = false, onChange, onBusy, onPending }: { data: ReceiptDetail; endpoint: string; writable: boolean; busy?: boolean; onChange: (d: ReceiptDetail) => void; onBusy?: (busy: boolean) => void; onPending?: (pending: boolean) => void }) {
  const gallery = useReceiptPhotos(endpoint, data.receipt.id)
  const [saving, setSaving] = useState(false), [reading, setReading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  useEffect(() => { onPending?.(gallery.dirty); return () => onPending?.(false) }, [gallery.dirty, onPending])
  const flight = useRef(false)
  const navigation = useUnsavedNavigation(gallery.dirty || saving || reading, saving || reading)
  const locked = busy || saving || reading
  async function save() {
    if (flight.current || locked || !gallery.dirty) return
    flight.current = true; setSaving(true); onBusy?.(true); setError(''); setNotice('')
    try {
      const result = await api<{ detail: ReceiptDetail; gallery: ReceiptPhotoGallery }>(`${endpoint}/${data.receipt.id}/photos`, { version: data.receipt.version, photosVersion: gallery.version, photos: photoRequest(gallery.photos) })
      gallery.accept(result.gallery); onChange(result.detail); setNotice('입고 사진을 저장했습니다.'); navigation.saved()
    } catch (e) { setError(e instanceof Error ? e.message : '사진 저장에 실패했습니다. 입력한 사진은 유지됩니다.') }
    finally { flight.current = false; setSaving(false); onBusy?.(false) }
  }
  return <>
    {gallery.error ? <p role="alert" className="alert error">{uiText(gallery.error)} <button type="button" className="secondary" onClick={gallery.reload}>{uiText("다시 시도")}</button></p> : !gallery.ready ? <p>{uiText("입고 사진 불러오는 중…")}</p> : <ReceiptPhotoPicker photos={gallery.photos} onChange={writable ? p => { gallery.setPhotos(p); setNotice('') } : undefined} endpoint={endpoint} id={data.receipt.id} busy={busy || saving} onReading={value => { setReading(value); onBusy?.(value) }} />}
    {gallery.dirty && writable && <p className="receipt-photo-hint">{uiText("사진 변경사항을 저장하거나 취소한 후 입고 작업을 계속해 주세요.")}</p>}
    {gallery.dirty && writable && <div className="receipt-photo-actions"><button type="button" className="secondary" disabled={locked} onClick={() => { gallery.setPhotos(gallery.original); setError('') }}>{uiText("사진 변경 취소")}</button><button type="button" className="primary" disabled={locked} onClick={() => void save()}>{saving ? uiText("사진 저장 중…") : uiText("사진 저장")}</button></div>}
    {error && <p role="alert" className="alert error">{uiText(error)}</p>}{notice && <p role="status">{uiText(notice)}</p>}
    {navigation.blocked && <UnsavedChangesDialog guard={navigation} />}
  </>
}
