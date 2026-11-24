import { useEffect, useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'
import { fitLabelZoom, zoomPanAt, clampZoom } from './viewport'
import type { Point } from './viewport'

type View = { identity: string; manualZoom: number | null; pan: Point }
type Gesture = { kind: 'object' } | { kind: 'pan'; id: number; start: Point; pan: Point; zoom: number; moved: boolean; clear: boolean } | { kind: 'pinch'; midpoint: Point; distance: number; pan: Point; zoom: number }
const origin = { x: 0, y: 0 }
const editable = (target: EventTarget | null) => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable=true],dialog')
const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** OrganizationChart's pointer-capture/grab interaction, with a separate label view transform.
 * View state is transient: never write pan or zoom into a Design or print request. */
export function useLabelPanZoom(viewport: RefObject<HTMLDivElement | null>, identity: string, size: { width: number; height: number }, labelWidth: number, labelHeight: number, clearSelection: () => void, editing = false) {
  const [view, setView] = useState<View>({ identity, manualZoom: null, pan: origin })
  const [panning, setPanning] = useState(false), [space, setSpace] = useState(false), [cancelRevision, setCancelRevision] = useState(0)
  const gesture = useRef<Gesture | null>(null), touches = useRef(new Map<number, Point>()), spaceHeld = useRef(false), hovered = useRef(false)
  // A label change is an explicit navigation. Retain the user's zoom, reset only its view position.
  if (view.identity !== identity) { setView({ ...view, identity, pan: origin }); setPanning(false) }
  const pan = view.identity === identity ? view.pan : origin
  const zoom = view.manualZoom ?? fitLabelZoom(size.width, size.height, labelWidth, labelHeight)
  function point(clientX: number, clientY: number): Point {
    const node = viewport.current!, rect = node.getBoundingClientRect()
    return { x: clientX - rect.left - node.clientLeft - node.clientWidth / 2, y: clientY - rect.top - node.clientTop - node.clientHeight / 2 }
  }
  function zoomTo(value: number, anchor = origin) {
    const next = clampZoom(value)
    setView({ identity, manualZoom: next, pan: zoomPanAt(pan, zoom, next, anchor) })
  }
  function resetGesture() {
    gesture.current = null; touches.current.clear(); setPanning(false)
    setCancelRevision(value => value + 1)
  }
  function fit() { resetGesture(); setView({ identity, manualZoom: null, pan: origin }) }
  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (editing || event.code !== 'Space' || editable(event.target)) return
      if (!hovered.current && !viewport.current?.contains(document.activeElement)) return
      event.preventDefault(); spaceHeld.current = true; setSpace(true)
    }
    function keyUp(event: KeyboardEvent) { if (event.code === 'Space') { if (spaceHeld.current) event.preventDefault(); spaceHeld.current = false; setSpace(false) } }
    function blur() { spaceHeld.current = false; setSpace(false); gesture.current = null; touches.current.clear(); setPanning(false); setCancelRevision(value => value + 1) }
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur) }
  }, [viewport, editing])
  useEffect(() => {
    const node = viewport.current!
    function wheel(event: WheelEvent) {
      if (editing && editable(event.target)) { event.stopPropagation(); return }
      // Native non-passive listener also prevents browser/page zoom on trackpad pinch / Ctrl+wheel.
      event.preventDefault(); event.stopPropagation()
      if (editing || gesture.current || node.closest('[inert]')) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1
      const rect = node.getBoundingClientRect(), anchor = { x: event.clientX - rect.left - node.clientLeft - node.clientWidth / 2, y: event.clientY - rect.top - node.clientTop - node.clientHeight / 2 }
      const next = clampZoom(zoom * Math.exp(-Math.max(-500, Math.min(500, event.deltaY * unit)) * .002))
      setView({ identity, manualZoom: next, pan: zoomPanAt(pan, zoom, next, anchor) })
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
  }, [viewport, identity, pan, zoom, editing])
  // Clear pending captures when navigating to another label, without recentering on object selection.
  useEffect(() => { gesture.current = null; touches.current.clear() }, [identity])
  function stop(event: PointerEvent<HTMLDivElement>) { event.preventDefault(); event.stopPropagation() }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (editing || editable(event.target)) return
    if (event.button !== 0 && event.button !== 1) return
    const node = event.currentTarget, at = point(event.clientX, event.clientY)
    const object = !!(event.target as Element).closest('[data-object-id],[data-resize-handle]')
    if (event.pointerType === 'touch') {
      touches.current.set(event.pointerId, at)
      if (touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()]
        gesture.current = { kind: 'pinch', midpoint: middle(a, b), distance: Math.max(1, distance(a, b)), pan, zoom }
        // A second finger takes over from object editing; discard its uncommitted drag preview.
        setCancelRevision(value => value + 1)
        for (const id of touches.current.keys()) node.setPointerCapture(id)
        setPanning(true); stop(event); return
      }
    }
    if (gesture.current?.kind === 'pan' && event.pointerType !== 'touch') return
    const marquee = event.pointerType !== 'touch' && !!(event.target as Element).closest('.label-edit-canvas')
    if ((object || marquee) && !spaceHeld.current && event.button === 0) { gesture.current = { kind: 'object' }; return }
    gesture.current = { kind: 'pan', id: event.pointerId, start: at, pan, zoom, moved: false, clear: !object && event.button === 0 && !spaceHeld.current }
    node.setPointerCapture(event.pointerId); node.focus({ preventScroll: true }); setPanning(true); stop(event)
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (editing) return
    const at = point(event.clientX, event.clientY)
    if (touches.current.has(event.pointerId)) touches.current.set(event.pointerId, at)
    const active = gesture.current
    if (!active || active.kind === 'object') return
    if (active.kind === 'pinch') {
      const [a, b] = [...touches.current.values()]; if (!a || !b) return
      const midpoint = middle(a, b), next = clampZoom(active.zoom * distance(a, b) / active.distance)
      const anchored = zoomPanAt(active.pan, active.zoom, next, active.midpoint)
      setView({ identity, manualZoom: next, pan: { x: anchored.x + midpoint.x - active.midpoint.x, y: anchored.y + midpoint.y - active.midpoint.y } })
    } else {
      if (active.id !== event.pointerId) return
      const dx = at.x - active.start.x, dy = at.y - active.start.y
      if (!active.moved && Math.hypot(dx, dy) < 3) return
      active.moved = true
      setView({ identity, manualZoom: active.zoom, pan: { x: active.pan.x + dx, y: active.pan.y + dy } })
    }
    stop(event)
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current
    touches.current.delete(event.pointerId)
    if (!active || active.kind === 'object') { gesture.current = null; return }
    if (active.kind === 'pan' && active.id !== event.pointerId) return
    if (active.kind === 'pinch' && touches.current.size) {
      const [id, start] = [...touches.current.entries()][0]
      gesture.current = { kind: 'pan', id, start, pan, zoom, moved: true, clear: false }
    } else {
      if (active.kind === 'pan' && !active.moved && active.clear && event.type === 'pointerup') clearSelection()
      gesture.current = null; setPanning(false)
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    stop(event)
  }
  return { zoom, pan, fit, zoomTo, mode: view.manualZoom === null ? 'fit' : 'manual', cancelRevision,
    className: `${panning ? ' is-panning' : ''}${space ? ' is-space-panning' : ''}`,
    handlers: { onPointerDownCapture: down, onPointerMoveCapture: move, onPointerUpCapture: end, onPointerCancelCapture: end,
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => { if (event.target === event.currentTarget && gesture.current?.kind === 'pan' && gesture.current.id === event.pointerId) end(event) },
      onPointerEnter: () => { hovered.current = true }, onPointerLeave: () => { hovered.current = false }, onAuxClick: (event: React.MouseEvent<HTMLDivElement>) => event.preventDefault() }
  }
}
