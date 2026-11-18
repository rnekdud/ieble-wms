import { useRef, useState } from 'react'
import type { ImageDraft } from '../../product-images'
import { imageFilesError, imageLimit, removeImage } from '../../product-images'

export default function ProductImageGallery({ images, onChange, endpoint, productId, busy = false, onReading, featured = false }: {
  images: ImageDraft[]; onChange?: (images: ImageDraft[]) => void; endpoint: string; productId?: string; busy?: boolean; onReading?: (reading: boolean) => void; featured?: boolean
}) {
  const input = useRef<HTMLInputElement>(null), reading = useRef(false)
  const [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const selectedIndex = images.findIndex(i => i.key === selected)
  const locked = busy || loading
  function move(direction: -1 | 1) {
    const target = selectedIndex + direction
    if (!onChange || locked || selectedIndex < 0 || target < 0 || target >= images.length) return
    const next = [...images]
    ;[next[selectedIndex], next[target]] = [next[target], next[selectedIndex]]
    onChange(next)
  }
  const current = images.find(i => i.key === selected) || images.find(i => i.isPrimary) || images[0]
  const imageUrl = (item: ImageDraft) => item.preview || `${endpoint}/${productId}/images/${item.id}`
  async function add(files: File[]) {
    if (!files.length || !onChange || reading.current) return
    const problem = imageFilesError(files, images.length)
    if (problem) { setError(problem); return }
    reading.current = true; setLoading(true); onReading?.(true); setError('')
    try {
      const additions = await Promise.all(files.map(async (file, index): Promise<ImageDraft> => {
        const preview = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('read')); reader.readAsDataURL(file) })
        return { key: crypto.randomUUID(), fileName: file.name, contentType: file.type, base64: preview.split(',')[1], preview, isPrimary: images.length === 0 && index === 0 }
      }))
      onChange([...images, ...additions])
    } catch { setError('이미지를 읽지 못했습니다. 기존 이미지는 유지됩니다. 파일을 다시 선택해 주세요.') }
    finally { reading.current = false; setLoading(false); onReading?.(false) }
  }
  if (featured && !onChange) return <div className="product-gallery product-gallery-featured">
    {current ? <a className="product-gallery-preview" href={imageUrl(current)} target="_blank" rel="noreferrer" aria-label={`${current.fileName} 원본 보기`}><img src={imageUrl(current)} alt={current.fileName} />{current.isPrimary && <span>대표 이미지</span>}</a> : <div className="product-gallery-empty"><span aria-hidden="true">▧</span>등록된 이미지 없음</div>}
    {images.length > 1 && <div className="product-gallery-thumbnails" role="group" aria-label="상품 이미지 선택">{images.map(item => <button key={item.key} type="button" aria-label={`${item.fileName} 보기`} aria-pressed={current?.key === item.key} onClick={() => setSelected(item.key)}><img src={imageUrl(item)} alt="" />{item.isPrimary && <small>대표</small>}</button>)}</div>}
  </div>
  return <div className="products-full product-gallery">
    <div className="product-gallery-heading"><h4>상품 이미지 <span>{images.length} / {imageLimit}</span></h4>{onChange && <div className="product-gallery-order" role="group" aria-label="선택 이미지 순서 변경">
      <button type="button" className="secondary" aria-label="선택 이미지 왼쪽으로 이동" title="선택 이미지 왼쪽으로 이동" disabled={locked || selectedIndex <= 0} onClick={() => move(-1)}>←</button>
      <button type="button" className="secondary" aria-label="선택 이미지 오른쪽으로 이동" title="선택 이미지 오른쪽으로 이동" disabled={locked || selectedIndex < 0 || selectedIndex >= images.length - 1} onClick={() => move(1)}>→</button>
    </div>}</div>
    <div className="product-gallery-grid">
      {!images.length && <div className="product-gallery-empty"><span aria-hidden="true">▧</span>등록된 이미지 없음</div>}
      {images.map(item => <div key={item.key} className={`product-gallery-item${onChange ? ' is-editable' : ''}${selected === item.key ? ' is-selected' : ''}`}>
        {onChange ? <>
          <button type="button" className="product-gallery-preview product-gallery-select" title={item.fileName} aria-label={`${item.fileName} 선택`} aria-pressed={selected === item.key} disabled={locked} onClick={() => setSelected(item.key)}><img src={imageUrl(item)} alt="" />{item.isPrimary && <span>대표</span>}</button>
          <div className="product-gallery-actions">
            {!item.isPrimary && <button type="button" disabled={locked} aria-label={`${item.fileName} 대표 지정`} onClick={() => onChange(images.map(i => ({ ...i, isPrimary: i.key === item.key })))}>대표 지정</button>}
            <button type="button" disabled={locked} aria-label={`${item.fileName} 제거`} onClick={() => { onChange(removeImage(images, item.key)); if (selected === item.key) setSelected(null); setError('') }}>제거</button>
          </div>
        </> : <><a className="product-gallery-preview" href={imageUrl(item)} target="_blank" rel="noreferrer" aria-label={`${item.fileName} 원본 보기`}><img src={imageUrl(item)} alt={item.fileName} />{item.isPrimary && <span>대표</span>}</a><p title={item.fileName}>{item.fileName}</p></>}
      </div>)}
      {onChange && <button type="button" className="product-gallery-add" disabled={busy || loading || images.length >= imageLimit} onClick={() => input.current?.click()}><span aria-hidden="true">+</span>{loading ? '이미지 읽는 중…' : '이미지 추가'}</button>}
    </div>
    {onChange && <input ref={input} hidden type="file" multiple accept="image/png,image/jpeg" aria-label="상품 이미지 파일" onChange={e => { void add(Array.from(e.target.files || [])); e.target.value = '' }} />}
    {error && <p role="alert" className="alert error">{error}</p>}
  </div>
}
