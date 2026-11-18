import type { RoutePoint } from './barcode-route.ts'

const lerp = (a: RoutePoint, b: RoutePoint, t: number): RoutePoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export function routePresentation(points: RoutePoint[], aspectRatio: number) {
  // The planner already returns entrance → rack. Preserve every vertex, including
  // right-angle turns; this is only a coordinate projection, never a shortcut.
  const projected = points.map(p => ({ x: p.x * 1200, y: p.y * 1200 / aspectRatio }))
  let total = 0
  const segments = projected.slice(1).flatMap((end, i) => {
    const start = projected[i], length = Math.hypot(end.x - start.x, end.y - start.y), offset = total
    total += length
    return length > 0 ? [{ start, end, length, offset }] : []
  })
  const travelMs = Math.max(4000, Math.min(6000, total / 180 * 1000))
  return { points: projected, segments, total, travelMs, cycleMs: travelMs + 750 }
}
export type RoutePresentation = ReturnType<typeof routePresentation>
export function pointAtDistance(path: RoutePresentation, distance: number): RoutePoint {
  const d = Math.max(0, Math.min(path.total, distance))
  const segment = path.segments.find(s => d <= s.offset + s.length) || path.segments.at(-1)
  return segment ? lerp(segment.start, segment.end, (d - segment.offset) / segment.length) : path.points[0] || { x: 0, y: 0 }
}
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x) }
export function routeTrailFrame(path: RoutePresentation, elapsedMs: number, scale: number) {
  const time = Math.max(0, elapsedMs) % path.cycleMs
  const distance = path.total * Math.min(1, time / path.travelMs)
  const opacity = smooth(time / 180) * (1 - smooth((time - path.travelMs) / 450))
  const length = Math.min(path.total * .35, 110 / Math.max(.05, scale))
  const from = Math.max(0, distance - length)
  const distances = [from, ...path.segments.map(s => s.offset + s.length).filter(d => d > from && d < distance), distance]
  const trail = length > 0 && distance > from ? distances.map(d => ({ ...pointAtDistance(path, d), distance: d, alpha: .85 * smooth(1 - (distance - d) / length) * opacity })) : []
  return { point: pointAtDistance(path, distance), distance, opacity, trail, from }
}
export type TrailPoint = ReturnType<typeof routeTrailFrame>['trail'][number]
// Shared miter edges make a continuous ribbon without overlapping translucent
// strokes or rounding/cutting any corner. Both sides use the original polyline.
export function trailRibbon(points: TrailPoint[], halfWidth: number) {
  return points.slice(1).map((_, i) => {
    const edge = (index: number) => {
      const p = points[index], prev = points[Math.max(0, index - 1)], next = points[Math.min(points.length - 1, index + 1)]
      const normal = (a: RoutePoint, b: RoutePoint) => { const l = Math.hypot(b.x - a.x, b.y - a.y); return l ? { x: -(b.y - a.y) / l, y: (b.x - a.x) / l } : null }
      const a = normal(prev, p) || normal(p, next)!, b = normal(p, next) || a
      const dot = Math.max(.25, 1 + a.x * b.x + a.y * b.y)
      const dx = (a.x + b.x) * halfWidth / dot, dy = (a.y + b.y) * halfWidth / dot
      return [{ x: p.x + dx, y: p.y + dy }, { x: p.x - dx, y: p.y - dy }]
    }
    const a = edge(i), b = edge(i + 1)
    return { start: points[i], end: points[i + 1], polygon: [a[0], b[0], b[1], a[1]] }
  })
}
