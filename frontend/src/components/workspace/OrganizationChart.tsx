import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import {
  Minus,
  Plus,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Scan,
} from 'lucide-react'
import { api } from '../../api'
import type { ChartData } from '../../types/organization-structure'
import { PageHeading } from './WorkspaceUI'

export default function OrganizationChart({
  tenantId,
  canManage,
  onNavigate,
}: {
  tenantId: string
  canManage: boolean
  onNavigate: (path: string) => void
}) {
  const [data, setData] = useState<ChartData | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(100)
  const [dragging, setDragging] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const previousZoom = useRef(100)
  const fitting = useRef(false)
  const fitFrame = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (fitFrame.current !== null) cancelAnimationFrame(fitFrame.current)
    },
    [],
  )
  const drag = useRef<{
    id: number
    x: number
    y: number
    left: number
    top: number
  } | null>(null)

  useEffect(() => {
    let live = true
    let loading = false
    async function refresh() {
      if (loading || document.visibilityState === 'hidden') return
      loading = true
      try {
        const value = await api<ChartData>(
          `/api/tenants/${tenantId}/organization-chart`,
        )
        if (live) {
          setData(value)
          setError('')
        }
      } catch (e) {
        // Do not retain organization data after permissions/session are revoked.
        if (live) {
          setData(null)
          setError(
            e instanceof Error ? e.message : '조직도를 불러오지 못했습니다.',
          )
        }
      } finally {
        loading = false
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      live = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [tenantId, revision])

  const groups = useMemo(() => {
    const children = new Map<string | null, ChartData['departments']>()
    const employees = new Map<string | null, ChartData['employees']>()
    for (const department of data?.departments || []) {
      const parent = department.parentId || null
      const siblings = children.get(parent) || []
      siblings.push(department)
      children.set(parent, siblings)
    }
    for (const person of data?.employees || []) {
      const department = person.departmentId || null
      const people = employees.get(department) || []
      people.push(person)
      employees.set(department, people)
    }
    return { children, employees }
  }, [data])

  useLayoutEffect(() => {
    const view = viewport.current
    if (view) {
      const ratio = zoom / previousZoom.current
      view.scrollLeft = fitting.current
        ? 0
        : (view.scrollLeft + view.clientWidth / 2) * ratio -
          view.clientWidth / 2
      view.scrollTop = fitting.current
        ? 0
        : (view.scrollTop + view.clientHeight / 2) * ratio -
          view.clientHeight / 2
    }
    previousZoom.current = zoom
    fitting.current = false
  }, [zoom])

  function fit() {
    if (fitFrame.current !== null) cancelAnimationFrame(fitFrame.current)
    function measure(pass: number) {
      fitFrame.current = null
      if (!viewport.current || !canvas.current) return
      const view = viewport.current
      const content = canvas.current
      const current = Number(content.style.zoom) * 100
      const rect = content.getBoundingClientRect()
      // CSS zoom rounds text/row dimensions. Re-measure after scaling instead
      // of assuming a large employee list scales perfectly linearly.
      const ratio = Math.min(
        (view.clientWidth - 32) / rect.width,
        (view.clientHeight - 32) / rect.height,
      )
      const next = Math.max(
        1,
        Math.min(pass === 0 ? 100 : current, Math.floor(current * ratio)),
      )
      view.scrollTo(0, 0)
      if (Math.abs(next - current) < 0.01 || pass >= 8) return
      fitting.current = true
      setZoom(next)
      fitFrame.current = requestAnimationFrame(() => measure(pass + 1))
    }
    measure(0)
  }
  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (
      event.pointerType !== 'mouse' ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest('button, a')
    )
      return
    const view = event.currentTarget
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: view.scrollLeft,
      top: view.scrollTop,
    }
    view.setPointerCapture(event.pointerId)
    view.focus({ preventScroll: true })
    setDragging(true)
  }
  function pan(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current
    if (!start || start.id !== event.pointerId) return
    event.currentTarget.scrollLeft = start.left - (event.clientX - start.x)
    event.currentTarget.scrollTop = start.top - (event.clientY - start.y)
  }
  function endPan(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function employeeList(id: string | null) {
    const people = groups.employees.get(id) || []
    return people.length ? (
      <ul className="org-card-employees" aria-label="소속 직원">
        {people.map((person) => (
          <li key={person.userId}>
            <strong>{person.name}</strong>
            <span>{person.positionName || '직급 미지정'}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="org-card-empty">소속 직원 없음</p>
    )
  }
  function branch(parent: string | null, ancestors = new Set<string>()) {
    return (groups.children.get(parent) || []).map((department) => {
      if (ancestors.has(department.id)) return null
      const path = new Set(ancestors).add(department.id)
      const hasChildren = (groups.children.get(department.id)?.length || 0) > 0
      const expanded = !closed.has(department.id)
      return (
        <li key={department.id} className="org-branch">
          <article
            className="org-department-card"
            aria-label={`${department.name} 부서`}
            data-department-id={department.id}
          >
            <header>
              <div>
                <h2>{department.name}</h2>
                <p>
                  직속 {groups.employees.get(department.id)?.length || 0}명
                  {department.isActive ? '' : ' · 사용 중지'}
                </p>
              </div>
              {hasChildren && (
                <button
                  className="wms-icon-button"
                  aria-label={`${department.name} ${expanded ? '접기' : '펼치기'}`}
                  aria-expanded={expanded}
                  onClick={() =>
                    setClosed((value) => {
                      const next = new Set(value)
                      if (expanded) next.add(department.id)
                      else next.delete(department.id)
                      return next
                    })
                  }
                >
                  {expanded ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </button>
              )}
            </header>
            {employeeList(department.id)}
          </article>
          {hasChildren && expanded && (
            <ul className="org-children">{branch(department.id, path)}</ul>
          )}
        </li>
      )
    })
  }
  return (
    <>
      <PageHeading
        title="조직도"
        description="부서별 소속 직원과 직급을 한눈에 확인하세요. 인원수는 활성 계정의 직속 소속 기준입니다."
      />
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <section className="wms-card organization-card">
        <div className="organization-toolbar org-chart-toolbar">
          <div className="organization-row-actions">
            <button
              className="secondary"
              aria-label="조직도 축소"
              disabled={zoom <= 1}
              onClick={() => setZoom((x) => Math.max(1, x - 10))}
            >
              <Minus size={16} />
            </button>
            <span className="org-zoom-label" aria-live="polite">
              {zoom}%
            </span>
            <button
              className="secondary"
              aria-label="조직도 확대"
              disabled={zoom >= 200}
              onClick={() => setZoom((x) => Math.min(200, x + 10))}
            >
              <Plus size={16} />
            </button>
            <button className="secondary" disabled={!data} onClick={fit}>
              <Scan size={16} /> 전체 화면 맞춤
            </button>
            <button className="text-button" onClick={() => setZoom(100)}>
              100% 보기
            </button>
            <button
              className="text-button"
              onClick={() => setClosed(new Set())}
            >
              전체 펼치기
            </button>
            <button
              className="text-button"
              onClick={() =>
                setClosed(new Set(data?.departments.map((x) => x.id)))
              }
            >
              전체 접기
            </button>
          </div>
          <button
            className="secondary"
            onClick={() => setRevision((x) => x + 1)}
          >
            <RefreshCw size={14} /> 조직도 새로고침
          </button>
        </div>
        <p className="organization-help" id="org-chart-help">
          마우스로 끌거나 스크롤하여 이동하세요. 키보드는 영역을 선택한 뒤
          방향키를 사용하세요. 변경사항은 15초마다 자동 반영됩니다.
        </p>
        {!data ? (
          <p>
            {error
              ? '접근 권한과 연결 상태를 확인해 주세요.'
              : '조직도를 불러오는 중…'}
          </p>
        ) : (
          <>
            {!data.departments.length && (
              <div className="organization-section">
                <h2>아직 조직도가 없습니다</h2>
                <p>
                  항목 관리에서 부서를 등록한 뒤 사용자 관리에서 직원의 부서를
                  지정해 주세요.
                </p>
                {canManage && (
                  <button
                    className="primary"
                    onClick={() => onNavigate('/app/settings/items')}
                  >
                    부서 등록하러 가기
                  </button>
                )}
              </div>
            )}
            <div
              ref={viewport}
              className={`org-chart-viewport${dragging ? ' is-panning' : ''}`}
              role="region"
              aria-label="부서 계층"
              aria-describedby="org-chart-help"
              tabIndex={0}
              onPointerDown={startPan}
              onPointerMove={pan}
              onPointerUp={endPan}
              onPointerCancel={endPan}
              onLostPointerCapture={endPan}
            >
              <div
                ref={canvas}
                className="org-chart-canvas"
                style={{ zoom: zoom / 100 }}
              >
                <ul className="org-forest">
                  {branch(null)}
                  <li className="org-branch org-unassigned">
                    <article
                      className="org-department-card"
                      aria-label="부서 미지정"
                    >
                      <header>
                        <div>
                          <h2>부서 미지정</h2>
                          <p>
                            소속 직원 {groups.employees.get(null)?.length || 0}
                            명
                          </p>
                        </div>
                      </header>
                      {employeeList(null)}
                    </article>
                  </li>
                </ul>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  )
}
