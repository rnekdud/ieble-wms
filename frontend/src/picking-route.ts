import { warehouseNavigation } from './barcode-route.ts'
import type { RackRoute, RoutePoint } from './barcode-route.ts'
import type { PlanDocument } from './warehouse-plan-model.ts'

const costOf = (order: number[], start: number[], matrix: number[][]) => order.reduce((sum, node, i) => sum + (i ? matrix[order[i - 1]][node] : start[node]), 0)
/** Open tour: no invented return/dispatch point. Exact for <=10 fixed access points. */
export function pickingVisitOrder(start: number[], matrix: number[][]) {
  const n = start.length
  if (!n) return { order: [] as number[], distance: 0, exact: true }
  if (n <= 10) {
    const costs = new Float64Array((1 << n) * n).fill(Infinity), parent = new Int16Array(costs.length).fill(-1)
    for (let i = 0; i < n; i++) costs[(1 << i) * n + i] = start[i]
    for (let mask = 1; mask < 1 << n; mask++) for (let i = 0; i < n; i++) if (mask & 1 << i) {
      for (let j = 0; j < n; j++) if (!(mask & 1 << j)) {
        const next = (mask | 1 << j) * n + j, value = costs[mask * n + i] + matrix[i][j]
        if (value < costs[next]) { costs[next] = value; parent[next] = i }
      }
    }
    let mask = (1 << n) - 1, last = 0
    for (let i = 1; i < n; i++) if (costs[mask * n + i] < costs[mask * n + last]) last = i
    const distance = costs[mask * n + last], order: number[] = []
    while (last >= 0) { order.push(last); const previous = parent[mask * n + last]; mask ^= 1 << last; last = previous }
    return { order: order.reverse(), distance, exact: true }
  }
  const remaining = new Set(start.map((_, i) => i)), order: number[] = []
  while (remaining.size) {
    const last = order.at(-1), next = [...remaining].sort((a, b) => (last === undefined ? start[a] - start[b] : matrix[last][a] - matrix[last][b]) || a - b)[0]
    order.push(next); remaining.delete(next)
  }
  // Bounded 2-opt passes; report as a recommendation, never an absolute optimum.
  let distance = costOf(order, start, matrix)
  for (let pass = 0; pass < 5; pass++) {
    let changed = false
    for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)], cost = costOf(candidate, start, matrix)
      if (cost < distance - 1e-10) { order.splice(0, n, ...candidate); distance = cost; changed = true }
    }
    if (!changed) break
  }
  return { order, distance, exact: false }
}
export type PickingTour = { route?: RackRoute; order: string[]; individual: Record<string, RackRoute>; unreachable: string[]; exact: boolean; notice: string }
export function pickingRackTour(plan: PlanDocument, rackIds: string[]): PickingTour {
  const ids = [...new Set(rackIds)].sort(), empty = (notice: string): PickingTour => ({ order: [], individual: {}, unreachable: ids, exact: false, notice })
  if (!ids.length) return empty('남은 피킹 위치가 없습니다.')
  if (ids.length > 100) return empty('피킹 대상이 100개 랙을 초과하여 동선을 계산할 수 없습니다. 아래 위치 목록으로 확인해 주세요.')
  const nav = warehouseNavigation(plan)
  if (!nav) return empty('출입구 또는 도면 구조를 확인해 주세요.')
  const doors = nav.entries.map(entry => nav.search(entry.nodes.filter(i => nav.valid[i]).map(node => ({ node, cost: Math.hypot(nav.points[node].x - entry.start.x, nav.points[node].y - entry.start.y) }))))
  // Stable physical access points, not rack centres. All pairwise distances use
  // the same obstacle-aware grid used by barcode lookup.
  const targets = ids.flatMap(id => {
    const candidates = nav.access(id).map(a => ({ ...a, distance: Math.min(...doors.map(d => d.costs[a.node])) + a.offset })).sort((a, b) => a.distance - b.distance || a.node - b.node)
    return candidates[0] && Number.isFinite(candidates[0].distance) ? [{ id, ...candidates[0] }] : []
  })
  const searches = targets.map(t => nav.search([{ node: t.node, cost: 0 }]))
  const matrix = targets.map((a, i) => targets.map((b, j) => i === j ? 0 : a.offset + searches[i].costs[b.node] + b.offset))
  let best: { door: number; order: number[]; distance: number; exact: boolean } | undefined
  for (let d = 0; d < doors.length; d++) {
    const reachable = targets.flatMap((t, i) => Number.isFinite(doors[d].costs[t.node]) ? [i] : [])
    if (!reachable.length) continue
    const result = pickingVisitOrder(reachable.map(i => doors[d].costs[targets[i].node] + targets[i].offset), reachable.map(i => reachable.map(j => matrix[i][j])))
    const order = result.order.map(i => reachable[i])
    if (Number.isFinite(result.distance) && (!best || order.length > best.order.length || order.length === best.order.length && result.distance < best.distance)) best = { ...result, door: d, order }
  }
  if (!best) return empty('출입구에서 이동 가능한 피킹 경로를 찾을 수 없습니다.')
  const entrance = nav.doors[best.door], entry = nav.entries[best.door]
  const gridPath = (prev: Int32Array, node: number) => { const points: RoutePoint[] = []; for (let i = node; i >= 0; i = prev[i]) points.push(nav.points[i]); return points.reverse() }
  const individual: Record<string, RackRoute> = {}, full: RoutePoint[] = []
  for (let k = 0; k < best.order.length; k++) {
    const index = best.order[k], target = targets[index], previous = k ? targets[best.order[k - 1]] : undefined
    const leg = nav.render(previous ? [previous.end, ...gridPath(searches[best.order[k - 1]].prev, target.node), target.end] : [entry.start, ...gridPath(doors[best.door].prev, target.node), target.end])
    for (const p of leg) if (!full.length || Math.hypot(p.x - full.at(-1)!.x, p.y - full.at(-1)!.y) > 1e-12) full.push(p)
    individual[target.id] = { entranceId: entrance.id, entranceLabel: entrance.label || '출입구', distance: doors[best.door].costs[target.node] + target.offset, points: nav.render([entry.start, ...gridPath(doors[best.door].prev, target.node), target.end]) }
  }
  const order = best.order.map(i => targets[i].id), unreachable = ids.filter(id => !order.includes(id))
  return { order, unreachable, individual, exact: best.exact, route: { entranceId: entrance.id, entranceLabel: entrance.label || '출입구', distance: best.distance, points: full }, notice: unreachable.length ? '일부 랙은 선택한 출입구와 연결되지 않아 동선에서 제외했습니다. 해당 위치를 확인해 주세요.' : '' }
}
