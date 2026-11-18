import type { ReceiptDetail, ReceiptLine } from './receipt-model'
export type ScanCommand = { groupByProduct?: boolean; kind: 'scan'; requestId: string; barcode: string; lineId: string | null } | { groupByProduct?: boolean; kind: 'quantity'; requestId: string; version: string; lineId: string; reason: string; quantity?: number; undoScanRequestId?: string }
export type ScanResponse = { outcome: 'applied' | 'select-line' | 'manual' | 'over-limit'; detail: ReceiptDetail; lineId?: string; requestId?: string; candidateLineIds: string[]; replayed: boolean }
export function scanProgress(lines: ReceiptLine[]) {
  const products = [...new Set(lines.map(l => l.productId))]
  const complete = products.filter(id => lines.filter(l => l.productId === id).every(l => l.inspectedQuantity === l.expectedQuantity)).length
  return { total: products.length, complete, percent: products.length ? Math.round(complete / products.length * 100) : 0 }
}
export function scanLineStatus(line: ReceiptLine, finished: boolean, exceeded: boolean) {
  if (exceeded) return '초과 시도'
  if (line.inspectedQuantity === line.expectedQuantity) return '검수 완료'
  if (finished) return '수량 부족'
  return line.inspectedQuantity == null || line.inspectedQuantity === 0 ? '검수 대기' : '검수 중'
}
export function restoreScanQueue(value: string | null): ScanCommand[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]')
    if (!Array.isArray(parsed) || parsed.length > 100) return []
    return parsed.filter((x): x is ScanCommand => x && typeof x.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(x.requestId) && (x.kind === 'scan' && typeof x.barcode === 'string' && x.barcode.length <= 64 || x.kind === 'quantity' && typeof x.lineId === 'string' && typeof x.version === 'string' && typeof x.reason === 'string'))
  } catch { return [] }
}
