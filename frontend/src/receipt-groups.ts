import type { ReceiptLine, TrackingAllocation } from './receipt-model'

export type ReceiptProductGroup = { productId: string; lines: ReceiptLine[]; productName: string; productCode: string; unit: string; expectedQuantity: number; inspectedQuantity: number | null }
export type GroupAllocation = TrackingAllocation & { sourceLineIds: string[] }
const sum = (values: number[]) => values.reduce((a, b) => a + Math.round(b * 1000), 0) / 1000
export function receiptProductGroups(lines: ReceiptLine[]): ReceiptProductGroup[] {
  const groups = new Map<string, ReceiptProductGroup>()
  for (const line of lines) {
    let group = groups.get(line.productId)
    if (!group) { group = { productId: line.productId, productName: line.productName, productCode: line.productCode, unit: line.unit, lines: [], expectedQuantity: 0, inspectedQuantity: null }; groups.set(line.productId, group) }
    group.lines.push(line)
    group.expectedQuantity = sum(group.lines.map(l => l.expectedQuantity))
    group.inspectedQuantity = group.lines.some(l => l.inspectedQuantity != null) ? sum(group.lines.map(l => l.inspectedQuantity ?? 0)) : null
  }
  return [...groups.values()]
}
export function groupAllocations(group: ReceiptProductGroup): GroupAllocation[] {
  const result = new Map<string, GroupAllocation>()
  for (const line of group.lines) {
    const entries = line.trackingAllocations ?? (line.lotNumber || line.expiryDate || line.serials.length ? [{ id: line.id, lotNumber: line.lotNumber, expiryDate: line.expiryDate, quantity: line.inspectedQuantity ?? line.expectedQuantity, serials: line.serials }] : [])
    for (const entry of entries) {
      const prior = result.get(entry.id)
      if (prior) { prior.quantity = sum([prior.quantity, entry.quantity]); prior.serials.push(...entry.serials); prior.sourceLineIds.push(line.id) }
      else result.set(entry.id, { ...entry, serials: [...entry.serials], sourceLineIds: [line.id] })
    }
  }
  return [...result.values()]
}
export function allocationIssue(group: ReceiptProductGroup, entries: GroupAllocation[]) {
  if (group.lines.some(l => l.unit !== group.unit)) return '동일 상품의 원본 단위가 서로 다릅니다.'
  if (entries.length > 100) return 'LOT·시리얼 구분은 최대 100개입니다.'
  if (entries.some(a => !Number.isFinite(a.quantity) || a.quantity <= 0 || Number(a.quantity.toFixed(3)) !== a.quantity || a.quantity > 999999999.999 || group.unit === 'EA' && !Number.isInteger(a.quantity))) return 'LOT 수량은 유효한 양수로 입력해 주세요. EA는 정수만 가능합니다.'
  const serials = entries.flatMap(a => a.serials)
  if (serials.some(s => !s.trim() || s.length > 100 || [...s].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)) || new Set(serials.map(s => s.trim())).size !== serials.length) return '시리얼의 공백·형식·중복을 확인해 주세요.'
  if (entries.some(a => a.serials.length > a.quantity || a.serials.length > 0 && !Number.isInteger(a.quantity))) return '시리얼 개수가 LOT 수량을 초과하거나 수량이 정수가 아닙니다.'
  if (entries.some(a => a.lotNumber && (a.lotNumber.length > 100 || [...a.lotNumber].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)))) return 'LOT 번호 형식을 확인해 주세요.'
  const expiries = new Map<string, string | null>()
  for (const entry of entries) {
    if (!entry.lotNumber) continue
    if (expiries.has(entry.lotNumber) && expiries.get(entry.lotNumber) !== entry.expiryDate) return '동일 LOT 번호의 유통기한이 서로 다릅니다.'
    expiries.set(entry.lotNumber, entry.expiryDate)
  }
  const extra = sum(entries.map(a => a.quantity)) - (group.inspectedQuantity ?? 0)
  return extra > 0 ? `LOT·시리얼 할당 수량이 검수수량보다 ${extra.toLocaleString('ko-KR')}개 초과합니다.` : null
}
/** Split tracking across preserved source rows; never replace a ReceiptLineId or count it twice. */
export function distributeTracking(group: ReceiptProductGroup, entries: GroupAllocation[]) {
  const issue = allocationIssue(group, entries)
  if (issue) throw new Error(issue)
  const result = group.lines.map(l => ({ lineId: l.id, allocations: [] as TrackingAllocation[], remaining: Math.round((l.inspectedQuantity ?? 0) * 1000) }))
  // Existing entries keep their original row association whenever capacity permits.
  for (const entry of [...entries].sort((a, b) => Number(b.sourceLineIds.length > 0) - Number(a.sourceLineIds.length > 0))) {
    let remaining = Math.round(entry.quantity * 1000), serialOffset = 0
    const targets = [...result].sort((a, b) => Number(entry.sourceLineIds.includes(b.lineId)) - Number(entry.sourceLineIds.includes(a.lineId)))
    for (const target of targets) {
      const amount = Math.min(remaining, target.remaining)
      if (!amount) continue
      const serials = entry.serials.slice(serialOffset, serialOffset + Math.floor(amount / 1000))
      target.allocations.push({ id: entry.id, lotNumber: entry.lotNumber?.trim() || null, expiryDate: entry.expiryDate || null, quantity: amount / 1000, serials })
      serialOffset += serials.length; target.remaining -= amount; remaining -= amount
    }
    if (remaining || serialOffset !== entry.serials.length) throw new Error('원본 행별 검수 수량과 시리얼 할당을 확인해 주세요.')
  }
  return result.map(({ lineId, allocations }) => ({ lineId, allocations }))
}
export function groupInspectionStatus(group: ReceiptProductGroup, finished: boolean, editing = false) {
  if (finished) return '검수 완료'
  if (group.inspectedQuantity == null) return '미검수'
  if (group.inspectedQuantity === group.expectedQuantity) return '수량 일치'
  if (editing) return '검수 중'
  return '수량 불일치'
}
export function receiptPlacementSlices(lines: ReceiptLine[]): ReceiptLine[] {
  return lines.flatMap(line => {
    if (line.trackingAllocations == null) return [line]
    const entries = line.trackingAllocations.map(a => ({ ...line, placementTrackingId: a.id, inspectedQuantity: a.quantity, lotNumber: a.lotNumber, expiryDate: a.expiryDate, serials: a.serials, placements: line.placements.filter(p => p.trackingId === a.id) }))
    const remainder = sum([line.inspectedQuantity ?? 0, -sum(line.trackingAllocations.map(a => a.quantity))])
    if (remainder > 0 || entries.length === 0) entries.push({ ...line, placementTrackingId: null, inspectedQuantity: remainder, lotNumber: null, expiryDate: null, serials: [], placements: line.placements.filter(p => !p.trackingId) })
    return entries
  })
}
