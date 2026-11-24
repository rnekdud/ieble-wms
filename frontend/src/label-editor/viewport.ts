/** Presentation geometry only. Never included in a saved design or print request. */
export const pixelsPerMm = 96 / 25.4
export function fitLabelZoom(width: number, height: number, labelWidth: number, labelHeight: number, padding = 24) {
  if (![width, height, labelWidth, labelHeight].every(v => Number.isFinite(v) && v > 0)) return 1
  return Math.max(.01, Math.min((width - padding * 2) / (labelWidth * pixelsPerMm), (height - padding * 2) / (labelHeight * pixelsPerMm)))
}
export function pointerDeltaMm(dx: number, dy: number, width: number, height: number, labelWidth: number, labelHeight: number) {
  return { x: dx * labelWidth / width, y: dy * labelHeight / height }
}

export type Point = { x: number; y: number }
export const clampZoom = (zoom: number) => Math.max(.1, Math.min(32, zoom))
/** Anchor and pan are viewport-centred screen pixels, independent of label millimetres. */
export function zoomPanAt(pan: Point, previousZoom: number, nextZoom: number, anchor: Point): Point {
  const ratio = nextZoom / previousZoom
  return { x: anchor.x - (anchor.x - pan.x) * ratio, y: anchor.y - (anchor.y - pan.y) * ratio }
}
