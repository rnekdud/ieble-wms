import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from '../api'
import Pagination from './Pagination'

import {
  tenantStatuses,
  historicalTenantStatuses,
  billingStatuses,
} from '../tenant-status'

type Tenant = {
  id: string
  name: string
  businessRegistrationNumber: string | null
  createdAt: string
  version: string
  isActive: boolean
  billingStatus: string
  billingAccess: { state: string }
  canReactivate: boolean
  serviceStatus: string
  contacts: { name: string; email: string; phone: string | null }[]
}
type TenantList = {
  items: Tenant[]
  total: number
  page: number
  pageSize: number
}
type History = {
  id: string
  fromStatus: string
  toStatus: string
  reason: string
  changedAt: string
  administrator: string
}
type Action = 'suspend' | 'reactivate'
const labels: Record<Action, string> = {
  suspend: '이용정지',
  reactivate: '재활성화',
}
const actions: Record<string, Action[]> = {
  Active: ['suspend'],
  Suspended: ['reactivate'],
}
const date = (value: string) => new Date(value).toLocaleString('ko-KR')

export default function AdminTenants() {
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({
    status: '',
    search: '',
    page: 1,
  })
  const [data, setData] = useState<TenantList | null>(null)
  const [overview, setOverview] = useState<{
    tenantCount: number
    userCount: number
    billingPendingCount: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [selection, setSelection] = useState<{
    tenant: Tenant
    action: Action
  } | null>(null)
  const [history, setHistory] = useState<{
    tenant: Tenant
    items: History[]
  } | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const historyRequest = useRef(0)
  const reload = () => {
    setLoading(true)
    setRevision((x) => x + 1)
  }
  useEffect(() => {
    let live = true
    const cancelHistory = () => {
      historyRequest.current++
    }
    const params = new URLSearchParams({
      status: query.status,
      search: query.search,
      page: String(query.page),
    })
    Promise.all([
      api<TenantList>(`/api/admin/tenants?${params}`),
      api<{
        tenantCount: number
        userCount: number
        billingPendingCount: number
      }>('/api/admin/overview'),
    ])
      .then(([list, summary]) => {
        if (live) {
          setData(list)
          setOverview(summary)
          setError('')
        }
      })
      .catch((e: unknown) => {
        if (live) {
          setData(null)
          setOverview(null)
          setError(
            e instanceof Error ? e.message : '기업 목록을 불러오지 못했습니다.',
          )
        }
      })
      .finally(() => {
        if (live) {
          setLoading(false)
          setHistoryLoading(false)
        }
      })
    return () => {
      live = false
      cancelHistory()
    }
  }, [query, revision])
  function applyFilter(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setQuery({ status: filter, search, page: 1 })
    setHistory(null)
    setNotice('')
  }
  async function showHistory(tenant: Tenant) {
    const request = ++historyRequest.current
    setHistoryLoading(true)
    setError('')
    try {
      const response = await api<{ items: History[] }>(
        `/api/admin/tenants/${tenant.id}/history`,
      )
      if (request === historyRequest.current)
        setHistory({ tenant, items: response.items })
    } catch (e) {
      if (request === historyRequest.current)
        setError(e instanceof Error ? e.message : '이력을 불러오지 못했습니다.')
    } finally {
      if (request === historyRequest.current) setHistoryLoading(false)
    }
  }
  return (
    <>
      <span className="eyebrow">PLATFORM MANAGEMENT</span>
      <h1>아이블 관리</h1>
      <p className="subtitle">
        가입 기업의 결제 준비와 서비스 이용 상태를 확인하세요.
      </p>
      <div className="stats">
        <div>
          <span>등록 기업</span>
          <strong>{overview?.tenantCount ?? '—'}</strong>
        </div>
        <div>
          <span>전체 사용자</span>
          <strong>{overview?.userCount ?? '—'}</strong>
        </div>
        <div>
          <span>미결제 기업 (무료 이용 포함)</span>
          <strong>{overview?.billingPendingCount ?? '—'}</strong>
        </div>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      <section className="panel admin-panel">
        <div className="panel-title">
          <h2>기업 관리</h2>
          <button className="secondary" onClick={reload} disabled={loading}>
            새로고침
          </button>
        </div>
        <form className="admin-filters" onSubmit={applyFilter}>
          <label>
            기업 상태
            <select
              aria-label="기업 상태"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value)
                setLoading(true)
                setQuery((q) => ({ ...q, status: e.target.value, page: 1 }))
                setHistory(null)
              }}
            >
              <option value="">전체 상태</option>
              {Object.entries(tenantStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            기업 검색
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
              placeholder="기업명 또는 사업자등록번호"
            />
          </label>
          <button className="primary" disabled={loading}>
            조회
          </button>
        </form>
        <p className="list-count" aria-live="polite">
          {loading
            ? '기업 목록을 불러오는 중…'
            : `${data?.total ?? 0}개 기업 · 기업명순`}
        </p>
        <div className="table-scroll">
          <table className="tenant-table" aria-busy={loading}>
            <thead>
              <tr>
                <th>기업 / 사업자등록번호</th>
                <th>가입일</th>
                <th>담당자 (기업 마스터)</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {!loading && data?.items.map((tenant) => (
                <tr key={tenant.id}>
                  <td>
                    <strong>{tenant.name}</strong>
                    <small>
                      {tenant.businessRegistrationNumber || '미등록'}
                    </small>
                  </td>
                  <td>{date(tenant.createdAt)}</td>
                  <td>
                    {tenant.contacts.length ? (
                      tenant.contacts.map((contact) => (
                        <div className="contact" key={contact.email}>
                          <span>{contact.name}</span>
                          <small>{contact.email}</small>
                          <small>{contact.phone || '연락처 미등록'}</small>
                        </div>
                      ))
                    ) : (
                      <small>활성 마스터 없음</small>
                    )}
                  </td>
                  <td>
                    <span className={`badge status-${tenant.serviceStatus}`}>
                      {tenantStatuses[tenant.serviceStatus]}
                    </span>
                    <small>
                      {tenant.billingAccess.state === 'RegistrationMonthFree'
                        ? '가입 월 무료 이용'
                        : billingStatuses[tenant.billingStatus]}
                    </small>
                    {!tenant.isActive && <small>계정 비활성</small>}
                  </td>
                  <td>
                    <div className="row-actions">
                      {tenant.isActive &&
                        (actions[tenant.serviceStatus] || [])
                          .filter(
                            (action) =>
                              action !== 'reactivate' || tenant.canReactivate,
                          )
                          .map((action) => (
                            <button
                              key={action}
                              disabled={loading}
                              className={`secondary ${action === 'suspend' ? 'danger-text' : ''}`}
                              onClick={() => {
                                setNotice('')
                                setSelection({ tenant, action })
                              }}
                            >
                              {labels[action]}
                            </button>
                          ))}
                      <button
                        className="text-button"
                        disabled={loading || historyLoading}
                        onClick={() => showHistory(tenant)}
                      >
                        변경 이력
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !data?.items.length && (
          <p className="empty-state">조건에 맞는 기업이 없습니다.</p>
        )}
        <Pagination
          label="기업 목록 페이지"
          page={query.page}
          pageSize={data?.pageSize ?? 20}
          total={data?.total ?? 0}
          loading={loading || !data}
          onChange={(page) => {
            setLoading(true)
            setQuery((q) => ({ ...q, page }))
          }}
        />
      </section>
      {history && (
        <section className="panel">
          <div className="panel-title">
            <h2>{history.tenant.name} · 변경 이력</h2>
            <button className="text-button" onClick={() => setHistory(null)}>
              이력 닫기
            </button>
          </div>
          <p className="history-help">
            최근 100건 · 변경 사유는 기업 구성원에게도 표시됩니다.
          </p>
          {history.items.length ? (
            <ol className="history-list">
              {history.items.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>
                      {historicalTenantStatuses[item.fromStatus]} →{' '}
                      {historicalTenantStatuses[item.toStatus]}
                    </strong>
                    <small>
                      {date(item.changedAt)} · {item.administrator}
                    </small>
                  </div>
                  <p>{item.reason}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">아직 상태 변경 이력이 없습니다.</p>
          )}
        </section>
      )}
      <p className="scope-note">
        기업 운영 상태만 관리합니다. 고객사의 WMS 업무 데이터 접근 권한은
        부여되지 않습니다.
      </p>
      {selection && (
        <StatusDialog
          tenant={selection.tenant}
          action={selection.action}
          onClose={() => setSelection(null)}
          onConflict={reload}
          onDone={() => {
            setNotice(
              `${selection.tenant.name} 기업의 ${labels[selection.action]} 처리가 완료되었습니다.`,
            )
            setSelection(null)
            setHistory(null)
            reload()
          }}
        />
      )}
    </>
  )
}

function StatusDialog({
  tenant,
  action,
  onClose,
  onDone,
  onConflict,
}: {
  tenant: Tenant
  action: Action
  onClose: () => void
  onDone: () => void
  onConflict: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflicted, setConflicted] = useState(false)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!reason.trim()) {
      setError('변경 사유를 입력해 주세요.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/tenants/${tenant.id}/status`, {
        action,
        version: tenant.version,
        reason: reason.trim(),
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : '상태를 변경하지 못했습니다.')
      if (e instanceof ApiError && e.status === 409) {
        setConflicted(true)
        onConflict()
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="status-dialog"
      aria-labelledby="status-dialog-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
    >
      <form onSubmit={submit}>
        <span className="eyebrow">CONFIRM CHANGE</span>
        <h2 id="status-dialog-title">기업 {labels[action]}</h2>
        <p>
          <strong>{tenant.name}</strong> 기업을 {labels[action]}하시겠습니까?
        </p>
        <p className="dialog-help">
          {action === 'suspend'
            ? '처리 후 기업의 WMS 업무 접근이 제한됩니다.'
            : '처리 후 소속 구성원이 WMS 업무에 접근할 수 있습니다.'}{' '}
          변경 사유는 기업 구성원에게 표시됩니다.
        </p>
        <label>
          변경 사유
          <textarea
            autoFocus
            required
            maxLength={1000}
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy || conflicted}
            placeholder="검토 결과와 변경 사유를 입력하세요"
          />
        </label>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            disabled={busy}
          >
            {conflicted ? '닫고 다시 선택' : '취소'}
          </button>
          <button className="primary" disabled={busy || conflicted}>
            {busy ? '처리 중…' : `${labels[action]} 확정`}
          </button>
        </div>
      </form>
    </dialog>
  )
}
