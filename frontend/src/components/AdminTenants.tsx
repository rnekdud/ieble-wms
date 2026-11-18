import PageSizeSelect from './PageSizeSelect'
import FormLabel from './FormLabel'
import ReportPeriodFields from './workspace/ReportPeriodFields'
import SearchFilters from './workspace/SearchFilters'
import OrganizationDialog from './workspace/OrganizationDialog'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from '../api'
import Pagination from './Pagination'
import AdminTenantDetail from './AdminTenantDetail'

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
  userCount: number
  estimatedMonthlyKrw: number
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

export default function AdminTenants({ billingOnly = false }: { billingOnly?: boolean }) {
  const [detailId, setDetailId] = useState<string | null>(null)
  const [extra, setExtra] = useState({ start: '', end: '', billingStatus: '' })
  const [appliedExtra, setAppliedExtra] = useState(extra)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({
    status: '',
    search: '',
    page: 1, pageSize: 20,
  })
  const [data, setData] = useState<TenantList | null>(null)
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
      ...appliedExtra,
      status: query.status,
      search: query.search,
      page: String(query.page), pageSize: String(query.pageSize),
    })
    api<TenantList>(`/api/admin/tenants?${params}`)
      .then((list) => {
        if (live) {
          setData(list)
          setError('')
        }
      })
      .catch((e: unknown) => {
        if (live) {
          setData(null)
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
  }, [query, revision, appliedExtra])
  function applyFilter() {
    if (loading) return
    setAppliedExtra(extra)
    setLoading(true)
    setQuery(q => ({ ...q, status: filter, search, page: 1 }))
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
      {detailId && <AdminTenantDetail id={detailId} onClose={() => setDetailId(null)} />}
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
          <h2>{billingOnly ? '요금제 및 결제 현황' : '기업 관리'}</h2>

        </div>
        {billingOnly && <p className="alert">실제 저장된 결제 상태와 월 예상 요금 조회입니다. 결제·카드 등록·환불은 실행하지 않습니다.</p>}
        <SearchFilters className="admin-filters" busy={loading} onSearch={applyFilter} onReset={() => { const defaults={start:"",end:"",billingStatus:""}; setExtra(defaults); setAppliedExtra(defaults); setFilter(""); setSearch(""); setQuery({status:"",search:"",page:1,pageSize:20}); setHistory(null); setNotice(""); reload() }}>
          <label>결제 상태<select value={extra.billingStatus} onChange={e => { setExtra(x => ({...x,billingStatus:e.target.value})) }}><option value="">전체</option>{Object.entries(billingStatuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <ReportPeriodFields prefix="가입일" start={extra.start} end={extra.end} onChange={range => setExtra(x => ({ ...x, ...range }))} />
          <label>
            기업 상태
            <select
              aria-label="기업 상태"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value)
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

        </SearchFilters>
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
                <th>활성 사용자 / 예상 요금</th>
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
                  <td>{date(tenant.createdAt)}<small>최근 접속: 미기록</small></td>
                  <td>{tenant.userCount}명<small>사용자당 월 요금제</small><small>{tenant.estimatedMonthlyKrw?.toLocaleString()}원 / 월 예상</small></td>
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
                      <button className="secondary" onClick={() => setDetailId(tenant.id)}>상세</button>
                      {!billingOnly && tenant.isActive &&
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
        <Pagination pageSizeControl={<PageSizeSelect value={query.pageSize} onChange={pageSize => { setQuery(v => ({ ...v, pageSize, page: 1 })); setLoading(true); }} />}
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
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflicted, setConflicted] = useState(false)
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
    <OrganizationDialog size="small" title={`기업 ${labels[action]}`} busy={busy} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}><div className="dialog-form-scroll"><fieldset disabled={busy}>
        <p>
          <strong>{tenant.name}</strong> 기업을 {labels[action]}하시겠습니까?
        </p>
        <p className="dialog-help">
          {action === 'suspend'
            ? '처리 후 기업의 WMS 업무 접근이 제한됩니다.'
            : '처리 후 소속 구성원이 WMS 업무에 접근할 수 있습니다.'}{' '}
          변경 사유는 기업 구성원에게 표시됩니다.
        </p>
        <label><FormLabel required>변경 사유</FormLabel><textarea
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
        </fieldset></div><div className="dialog-actions">
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
    </OrganizationDialog>
  )
}
