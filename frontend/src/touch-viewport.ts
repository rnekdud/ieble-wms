export type TouchFrame = { x: number; y: number; distance: number; count: number }
export function touchFrame(points: { x: number; y: number }[]): TouchFrame | null {
  const [a, b] = points
  if (!a) return null
  return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(b.x - a.x, b.y - a.y), count: 2 } : { ...a, distance: 0, count: 1 }
}
// Keep the same document point under the fingers while zooming and translating.
export function touchViewport(view: { x: number; y: number; scale: number }, from: TouchFrame, to: TouchFrame) {
  const scale = Math.max(.05, Math.min(4, view.scale * (from.count === 2 && from.distance > 0 ? to.distance / from.distance : 1)))
  return { scale, x: to.x - (from.x - view.x) * scale / view.scale, y: to.y - (from.y - view.y) * scale / view.scale }
}
