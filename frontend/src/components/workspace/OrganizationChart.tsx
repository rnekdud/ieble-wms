import { t as uiText } from '../../i18n.ts'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import {
  Minus,
  Plus,
  ChevronDown,
  ChevronRight,
  Scan,
} from 'lucide-react'
import { api } from '../../api'
import type { ChartData } from '../../types/organization-structure'
import { PageHeading } from './WorkspaceUI'
import './organization-chart.css'

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
  }, [tenantId])

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
      <ul className="org-card-employees" aria-label={uiText("소속 직원")}>
        {people.map((person) => (
          <li key={person.userId}>
            <strong>{person.name}</strong>
            <span>{person.positionName || uiText("직급 미지정")}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="org-card-empty">{uiText("소속 직원 없음")}</p>
    )
  }
  const expandable = (data?.departments || []).filter(d => (groups.children.get(d.id)?.length || 0) > 0).map(d => d.id)
  const allExpanded = expandable.length > 0 && expandable.every(id => !closed.has(id))
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
            aria-label={uiText("{v0} 부서", { v0: department.name })}
            data-department-id={department.id}
          >
            <header>
              <div>
                <h2>{department.name}</h2>
                <p> {uiText("직속")} {groups.employees.get(department.id)?.length || 0}{uiText("명")} {department.isActive ? '' : uiText("· 사용 중지")}
                </p>
              </div>
              {hasChildren && (
                <button
                  className="wms-icon-button"
                  aria-label={uiText("{v0} {v1}", { v0: department.name, v1: expanded ? uiText('접기') : uiText('펼치기') })}
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
                  {expanded ? (<ChevronDown size={18} />) : (<ChevronRight size={18} />)}
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
        title={uiText("조직도")}
      />
      {error && (
        <div className="alert error" role="alert">
          {uiText(error)}
        </div>
      )}
      <section className="wms-card organization-card">
        <div className="organization-toolbar org-chart-toolbar">
          <div className="org-chart-zoom-controls" role="group" aria-label={uiText("조직도 배율")}>
            <button
              className="secondary wms-icon-button"
              aria-label={uiText("조직도 축소")}
              disabled={zoom <= 1}
              onClick={() => setZoom((x) => Math.max(1, x - 10))}
            >
              <Minus size={16} />
            </button>
            <span className="org-zoom-label" aria-live="polite">
              {zoom}%
            </span>
            <button
              className="secondary wms-icon-button"
              aria-label={uiText("조직도 확대")}
              disabled={zoom >= 200}
              onClick={() => setZoom((x) => Math.min(200, x + 10))}
            >
              <Plus size={16} />
            </button>
            <button className="secondary org-chart-reset" onClick={() => setZoom(100)}> {uiText("100% 보기")} </button>
          </div>
          <div className="org-chart-view-controls" role="group" aria-label={uiText("조직도 보기")}>
            <button className="secondary" disabled={!data} onClick={fit}>
              <Scan size={16} /> {uiText("전체 화면 맞춤")} </button>
            <button className="secondary" disabled={!expandable.length} onClick={() => setClosed(allExpanded ? new Set(expandable) : new Set())}>
              {allExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{allExpanded ? uiText("전체 접기") : uiText("전체 펼치기")}
            </button>
          </div>

        </div>
        {!data ? (<p>
            {error ? uiText("접근 권한과 연결 상태를 확인해 주세요.") : uiText("조직도를 불러오는 중…")}
          </p>) : (<>
            {!data.departments.length && (
              <div className="organization-section">
                <h2>{uiText("아직 조직도가 없습니다")}</h2>
                <p> {uiText("항목 관리에서 부서를 등록한 뒤 사용자 관리에서 직원의 부서를 지정해 주세요.")} </p>
                {canManage && (
                  <button
                    className="primary"
                    onClick={() => onNavigate('/app/settings/items')}
                  > {uiText("부서 등록하러 가기")} </button>
                )}
              </div>
            )}
            <div
              ref={viewport}
              className={`org-chart-viewport${dragging ? ' is-panning' : ''}`}
              role="region"
              aria-label={uiText("부서 계층")}
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
                      aria-label={uiText("부서 미지정")}
                    >
                      <header>
                        <div>
                          <h2>{uiText("부서 미지정")}</h2>
                          <p> {uiText("소속 직원")} {groups.employees.get(null)?.length || 0} {uiText("명")} </p>
                        </div>
                      </header>
                      {employeeList(null)}
                    </article>
                  </li>
                </ul>
              </div>
            </div>
          </>)}
      </section>
    </>
  )
}
