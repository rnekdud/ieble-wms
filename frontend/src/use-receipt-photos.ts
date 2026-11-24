import { useEffect, useState } from 'react'
import { api } from './api'
import { photoRequest } from './receipt-photos'
import type { ReceiptPhoto, ReceiptPhotoGallery } from './receipt-photos'

export function useReceiptPhotos(endpoint: string, id?: string) {
  const [photos, setPhotos] = useState<ReceiptPhoto[]>([]), [original, setOriginal] = useState<ReceiptPhoto[]>([])
  const [version, setVersion] = useState(''), [ready, setReady] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    let live = true
    if (!id) {
      api(`${endpoint}/photo-options`).then(() => { if (live) { setReady(true); setError('') } }).catch(() => { if (live) setError('입고 사진 기능을 사용할 수 없습니다. 사진 API와 저장소 적용 상태를 확인한 후 다시 시도해 주세요.') })
      return () => { live = false }
    }
    api<ReceiptPhotoGallery>(`${endpoint}/${id}/photos`).then(g => { if (live) { const items = g.photos.map(p => ({ ...p, key: p.id })); setPhotos(items); setOriginal(items); setVersion(g.photosVersion); setReady(true); setError('') } }).catch(() => { if (live) setError('입고 사진을 불러오지 못했습니다. 사진 API 적용 상태와 연결을 확인한 후 다시 시도해 주세요.') })
    return () => { live = false }
  }, [endpoint, id, retry])
  return { photos, setPhotos, original, version, ready, error, reload: () => setRetry(x => x + 1), dirty: photos !== original && JSON.stringify(photoRequest(photos)) !== JSON.stringify(photoRequest(original)), accept(g: ReceiptPhotoGallery) { const items = g.photos.map(p => ({ ...p, key: p.id })); setPhotos(items); setOriginal(items); setVersion(g.photosVersion) } }
}
