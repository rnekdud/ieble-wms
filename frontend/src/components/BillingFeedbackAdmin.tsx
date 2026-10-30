import { useEffect, useState } from 'react'
import { api } from '../api'
import Pagination from './Pagination'

type Feedback = { id: string; company: string; author: string; message: string; createdAt: string }
type FeedbackList = { items: Feedback[]; total: number }

export default function BillingFeedbackAdmin() {
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [view, setView] = useState<{ key: string; data?: FeedbackList; error?: string } | null>(null)
  const key = `${page}:${revision}`
  const current = view?.key === key ? view : null
  const data = current?.data
  useEffect(() => {
    let live = true
    api<FeedbackList>(`/api/admin/billing-feedback?page=${page}`)
      .then(data => { if (live) setView({ key, data }) })
      .catch(e => { if (live) setView({ key, error: e instanceof Error ? e.message : '문의·피드백을 불러오지 못했습니다.' }) })
    return () => { live = false }
  }, [page, key])
  return <section className="panel">
    <h2>문의·피드백 관리</h2>
    {current?.error && <p role="alert">{current.error}</p>}
    {!current && <p role="status">문의·피드백을 불러오는 중입니다.</p>}
    <div className="table-scroll">
      <table className="wms-table" aria-busy={!current}>
        <caption>서비스 이용 소감</caption>
        <thead><tr><th>기업</th><th>작성자</th><th>소감</th><th>일시</th></tr></thead>
        <tbody>{data?.items.map(f => <tr key={f.id}>
          <td>{f.company}</td><td>{f.author}</td>
          <td style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{f.message}</td>
          <td>{new Date(f.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {data?.total === 0 && <p>등록된 이용 소감이 없습니다.</p>}
    {data && <Pagination label="문의·피드백 목록 페이지" page={page} pageSize={20} total={data.total} onChange={setPage} />}
    <button type="button" className="text-button" disabled={!current} onClick={() => setRevision(x => x + 1)}>피드백 새로고침</button>
  </section>
}
