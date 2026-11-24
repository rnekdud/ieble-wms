import { t as uiText } from '../../i18n.ts'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { ReceiptPhoto } from '../../receipt-photos'
import OrganizationDialog from './OrganizationDialog'

export default function ReceiptPhotoViewer({ photos, initial, source, onClose }: { photos: ReceiptPhoto[]; initial: number; source: (p: ReceiptPhoto) => string; onClose: () => void }) {
  const [index, setIndex] = useState(initial)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.receipt-photo-viewer')) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setIndex(i => Math.max(0, Math.min(photos.length - 1, i + (e.key === 'ArrowLeft' ? -1 : 1)))) }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [photos.length])
  const move = (delta: number) => setIndex(i => Math.max(0, Math.min(photos.length - 1, i + delta)))
  return <OrganizationDialog title={uiText("입고 사진")} className="receipt-photo-viewer" wide showClose hideFooter closeOnBackdrop onClose={onClose} headingActions={<span aria-live="polite">{index + 1} / {photos.length}</span>}>
    <div className="receipt-photo-viewer-content">
      <PhotoStage key={photos[index].key} src={source(photos[index])} name={photos[index].fileName} move={move} />
      {photos.length > 1 && <div className="receipt-photo-navigation"><button type="button" className="secondary" aria-label={uiText("이전 사진")} disabled={index === 0} onClick={() => move(-1)}>{uiText("〈 이전")}</button><button type="button" className="secondary" aria-label={uiText("다음 사진")} disabled={index === photos.length - 1} onClick={() => move(1)}>{uiText("다음 〉")}</button></div>}
    </div>
  </OrganizationDialog>
}
function PhotoStage({ src, name, move }: { src: string; name: string; move: (n: number) => void }) {
  const [pose, setPose] = useState({ scale: 1, x: 0, y: 0 }), latest = useRef(pose), stage = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0)
  const points = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ x: 0, y: 0, distance: 0, scale: 1, panX: 0, panY: 0, multi: false })
  function apply(scale: number, x: number, y: number) {
    scale = Math.max(1, Math.min(4, scale))
    const rect = stage.current?.getBoundingClientRect(), maxX = (rect?.width || 0) * (scale - 1) / 2, maxY = (rect?.height || 0) * (scale - 1) / 2
    latest.current = { scale, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) }; setPose(latest.current)
  }
  function begin(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as Element).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId); points.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const ps = [...points.current.values()]
    if (ps.length === 1) gesture.current = { x: e.clientX, y: e.clientY, distance: 0, scale: latest.current.scale, panX: latest.current.x, panY: latest.current.y, multi: false }
    else { gesture.current.multi = true; gesture.current.distance = Math.hypot(ps[1].x - ps[0].x, ps[1].y - ps[0].y); gesture.current.scale = latest.current.scale }
  }
  function drag(e: PointerEvent<HTMLDivElement>) {
    if (!points.current.has(e.pointerId)) return
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const ps = [...points.current.values()], g = gesture.current
    if (ps.length === 2 && g.distance > 0) apply(g.scale * Math.hypot(ps[1].x - ps[0].x, ps[1].y - ps[0].y) / g.distance, latest.current.x, latest.current.y)
    else if (ps.length === 1 && !g.multi && latest.current.scale > 1) apply(latest.current.scale, g.panX + e.clientX - g.x, g.panY + e.clientY - g.y)
  }
  function end(e: PointerEvent<HTMLDivElement>, cancel = false) {
    if (!points.current.has(e.pointerId)) return
    const g = gesture.current, dx = e.clientX - g.x, dy = e.clientY - g.y
    if (!cancel && !g.multi && latest.current.scale === 1 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1)
    points.current.delete(e.pointerId)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  return <>
    <div ref={stage} className="receipt-photo-stage" tabIndex={0} aria-label={uiText("사진 확대 영역")} onPointerDown={begin} onPointerMove={drag} onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)} onWheel={e => { apply(latest.current.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), latest.current.x, latest.current.y) }}>
      {failed ? <p role="alert">{uiText("사진을 불러오지 못했습니다.")} <button type="button" onClick={() => { setFailed(false); setRetry(x => x + 1) }}>{uiText("다시 시도")}</button></p> : <img key={retry} src={src} alt={name} draggable={false} onError={() => setFailed(true)} style={{ transform: `translate(${pose.x}px, ${pose.y}px) scale(${pose.scale})` }} />}
    </div>
    <div className="receipt-photo-zoom"><button type="button" className="secondary" aria-label={uiText("사진 축소")} disabled={pose.scale === 1} onClick={() => apply(pose.scale / 1.25, pose.x, pose.y)}>−</button><button type="button" className="secondary" onClick={() => apply(1, 0, 0)} aria-label={uiText("사진 원래 크기")}>{Math.round(pose.scale * 100)}%</button><button type="button" className="secondary" aria-label={uiText("사진 확대")} disabled={pose.scale === 4} onClick={() => apply(pose.scale * 1.25, pose.x, pose.y)}>+</button></div>
  </>
}
