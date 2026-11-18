import { useEffect, useMemo, useRef } from 'react'
import { Circle, Layer, Line, Shape } from 'react-konva'
import Konva from 'konva'
import type { RackRoute } from '../../barcode-route'
import type { PlanDocument } from '../../warehouse-plan-model'
import { routePresentation, routeTrailFrame, trailRibbon } from '../../route-presentation'

export default function PlanRouteOverlay({ route, document: plan, scale }: { route: RackRoute; document: PlanDocument; scale: number }) {
  const layer = useRef<Konva.Layer>(null), trail = useRef<Konva.Shape>(null), point = useRef<Konva.Circle>(null), guide = useRef<Konva.Line>(null)
  const currentScale = useRef(scale)
  const path = useMemo(() => routePresentation(route.points, plan.aspectRatio), [route.points, plan.aspectRatio])
  useEffect(() => { currentScale.current = scale }, [scale])
  useEffect(() => {
    const surface = layer.current, tail = trail.current, dot = point.current, line = guide.current
    if (!surface || !tail || !dot || !line || !path.total) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (time: number) => {
      const frame = routeTrailFrame(path, time, currentScale.current)
      tail.setAttr('trailFrame', frame)
      dot.position(frame.point); dot.opacity(frame.opacity)
    }
    update(0)
    // Konva's RAF redraws only this layer. No React state update per frame.
    const animation = new Konva.Animation(frame => { if (frame) update(frame.time) }, surface)
    const sync = () => {
      const reduced = motion.matches
      line.stroke(reduced ? '#258BFF' : 'rgba(22,52,95,.15)')
      tail.visible(!reduced && !document.hidden); dot.visible(!reduced && !document.hidden)
      if (reduced || document.hidden) animation.stop()
      else animation.start()
      surface.batchDraw()
    }
    sync(); motion.addEventListener('change', sync); document.addEventListener('visibilitychange', sync)
    return () => { animation.stop(); motion.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync) }
  }, [path])
  if (!path.total) return null
  return <Layer ref={layer} listening={false} name="barcode-route-layer">
    <Line ref={guide} name="barcode-route-line" points={path.points.flatMap(p => [p.x, p.y])} stroke="rgba(22,52,95,.15)" strokeWidth={1 / scale} lineJoin="miter" lineCap="butt" tension={0} />
    <Shape ref={trail} name="barcode-route-trail" sceneFunc={(context, shape) => {
      const frame = shape.getAttr('trailFrame') as ReturnType<typeof routeTrailFrame> | undefined
      if (!frame || !frame.opacity) return
      const ctx = context._context
      ctx.save()
      const tailLength = Math.min(path.total * .35, 110 / Math.max(.05, scale))
      const color = (distance: number, alpha: number) => {
        const position = Math.max(0, Math.min(1, 1 - (frame.distance - distance) / tailLength))
        const from = position < .5 ? [188, 232, 255] : [84, 184, 255]
        const to = position < .5 ? [84, 184, 255] : [37, 139, 255]
        const blend = position < .5 ? position * 2 : (position - .5) * 2
        return `rgba(${from.map((value, i) => Math.round(value + (to[i] - value) * blend)).join(',')},${alpha})`
      }
      for (const section of trailRibbon(frame.trail, 1.75 / scale)) {
        const { start, end, polygon } = section
        const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y)
        gradient.addColorStop(0, color(start.distance, start.alpha))
        const middle = frame.distance - tailLength / 2
        if (middle > start.distance && middle < end.distance) {
          const offset = (middle - start.distance) / (end.distance - start.distance)
          gradient.addColorStop(offset, color(middle, start.alpha + (end.alpha - start.alpha) * offset))
        }
        gradient.addColorStop(1, color(end.distance, end.alpha))
        ctx.fillStyle = gradient; ctx.beginPath()
        polygon.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y) })
        ctx.closePath(); ctx.fill()
      }
      ctx.restore()
    }} />
    <Circle ref={point} name="barcode-route-motion" x={path.points[0].x} y={path.points[0].y} radius={4.5 / scale} opacity={0} fill="#258BFF" stroke="#FFFFFF" strokeWidth={1 / scale} />
  </Layer>
}
