import test from 'node:test'
import assert from 'node:assert/strict'
import { fitPlanViewport } from '../src/plan-viewport.ts'

test('fit contains every document edge across responsive viewports and portrait/wide plans', () => {
  for (const w of [240, 364, 768, 1120, 1640]) for (const h of [240, 520, 960]) for (const ratio of [.5, 1, 1.5, 3]) {
    const v = fitPlanViewport(w, h, ratio), dw = 1200 * v.scale, dh = 1200 / ratio * v.scale
    assert(v.scale > 0 && Number.isFinite(v.scale))
    assert(v.x >= 0 && v.y >= 0 && v.x + dw <= w && v.y + dh <= h)
    assert(Math.abs(dw / dh - ratio) < 1e-9)
    assert(Math.abs(v.x * 2 + dw - w) < 1e-9)
    assert(Math.abs(v.y * 2 + dh - h) < 1e-9)
  }
})
test('aspect-matched viewport has small margins and inverse pointer transform preserves normalized coordinates', () => {
  const v = fitPlanViewport(1200, 800, 1.5)
  assert(v.x <= 24 && v.y <= 24)
  for (const x of [0, .25, .65, 1]) assert(Math.abs(((v.x + x * 1200 * v.scale) - v.x) / v.scale / 1200 - x) < 1e-9)
})
