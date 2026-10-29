import { useEffect, useState } from 'react'
import { api } from '../api'
type Feedback = { id: string; company: string; author: string; message: string; createdAt: string }
export default function BillingFeedbackAdmin() {
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0)
  const [data, setData] = useState<{ items: Feedback[]; total: number } | null>(null), [error, setError] = useState('')
  useEffect(() => { let live = true; api<{ items: Feedback[]; total: number }>(`/api/admin/billing-feedback?page=${page}`).then(d => { if (live) { setData(d); setError('') } }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [page, revision])
  return <section className="panel"><h2>문의·피드백 관리</h2>{error && <p role="alert">{error}</p>}
    <table className="wms-table"><caption>서비스 이용 소감</caption><thead><tr><th>기업</th><th>작성자</th><th>소감</th><th>일시</th></tr></thead><tbody>{data?.items.map(f => <tr key={f.id}><td>{f.company}</td><td>{f.author}</td><td style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{f.message}</td><td>{new Date(f.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</td></tr>)}</tbody></table>
    {data?.total === 0 && <p>등록된 이용 소감이 없습니다.</p>}
    <button disabled={page === 1} onClick={() => setPage(x => x - 1)}>이전</button>{' '}<button disabled={!data || page * 20 >= data.total} onClick={() => setPage(x => x + 1)}>다음</button>{' '}<button onClick={() => setRevision(x => x + 1)}>피드백 새로고침</button>
  </section>
}
