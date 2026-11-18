import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { Product } from '../../product-model'
import { useUnsavedNavigation } from '../../use-unsaved-navigation'
import OrganizationDialog from './OrganizationDialog'

type Review = { canDelete: boolean; items: { id: string; code: string; name: string; canDelete: boolean; reasons: string[] }[] }
export default function ProductDeleteDialog({ endpoint, products, single = false, onClose, onDeleted }: {
  endpoint: string; products: Product[]; single?: boolean; onClose: () => void; onDeleted: (count: number) => void
}) {
  const [review, setReview] = useState<Review | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0)
  const inFlight = useRef(false)
  const request = JSON.stringify({ items: products.map(p => ({ id: p.id, version: p.version })) })
  const navigation = useUnsavedNavigation(busy, busy)
  useEffect(() => {
    let live = true
    api<Review>(endpoint + '/delete-check', JSON.parse(request)).then(result => { if (live) { setReview(result); setError('') } }).catch(e => { if (live) setError(e instanceof Error ? e.message : '삭제 가능 여부를 확인하지 못했습니다.') })
    return () => { live = false }
  }, [endpoint, request, retry])
  async function remove() {
    if (inFlight.current || !review?.canDelete) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = await api<{ deletedCount: number }>(single ? `${endpoint}/${products[0].id}/delete` : endpoint + '/delete', single ? { version: products[0].version } : JSON.parse(request))
      navigation.saved(); onDeleted(result.deletedCount)
    } catch (e) { setError(e instanceof Error ? e.message : '삭제하지 못했습니다.'); setReview(null) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <OrganizationDialog confirmation title={single ? '상품을 삭제하시겠습니까?' : '선택한 상품을 삭제하시겠습니까?'} busy={busy} onClose={() => { if (!inFlight.current) onClose() }}>
    <section className="product-delete-content">
      <p>{single ? `${products[0].name} 상품을 삭제합니다.` : `선택한 상품 ${products.length}개를 삭제합니다.`}</p>
      <p>입출고·재고 이력이 있는 상품은 삭제할 수 없습니다.</p>
      {!review && !error && <p role="status">삭제 가능 여부를 확인하는 중…</p>}
      {review && <><div className="product-delete-results" aria-label="상품별 삭제 가능 여부">{review.items.map(item => <div key={item.id}><strong>{item.name} <small>{item.code}</small></strong><span className={item.canDelete ? '' : 'danger-text'}>{item.canDelete ? '삭제 가능 — 참조 이력 없음' : `삭제 불가 — ${item.reasons.join(', ')}`}</span></div>)}</div>{!review.canDelete && <p role="alert">전체 삭제를 중단했습니다. 삭제 불가 상품을 선택 해제하거나 사용 중지 기능을 이용해 주세요.</p>}</>}
      {error && <p role="alert" className="alert error">{error}</p>}
      <div className="confirmation-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>취소</button>{error && !review && <button type="button" className="secondary" disabled={busy} onClick={() => { setError(''); setRetry(n => n + 1) }}>다시 확인</button>}<button type="button" className="primary" disabled={busy || !review?.canDelete} onClick={() => void remove()}>{busy ? '삭제 중…' : single ? '상품 삭제' : '선택 상품 삭제'}</button></div>
    </section>
  </OrganizationDialog>
}
