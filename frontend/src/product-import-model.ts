import { ApiError } from './api.ts'
export type ImportError = { row: number; column: string; value: string; message: string; productName?: string | null; productCode?: string | null }
export type ImportRow = { row: number; name: string; code: string; innerPackQuantity: number | null; outerPackQuantity: number | null; outerPackUnit: string; palletPackQuantity: number | null }
export type ImportReview = { committed: boolean; total: number; valid?: number; invalid?: number; errors: ImportError[]; rows: ImportRow[] }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isError = (value: unknown): value is ImportError => object(value) && Number.isInteger(value.row) && Number(value.row) >= 0 && ['column', 'value', 'message'].every(key => typeof value[key] === 'string')
export function importReview(value: unknown): ImportReview | null {
  if (!object(value) || typeof value.committed !== 'boolean' || !Number.isInteger(value.total) || Number(value.total) < 0 || !Array.isArray(value.errors) || !value.errors.every(isError) || !Array.isArray(value.rows)) return null
  if (!value.rows.every(row => object(row) && Number.isInteger(row.row) && typeof row.name === 'string' && typeof row.code === 'string')) return null
  return value as ImportReview
}
export function importErrors(errors: ImportError[], previous?: ImportReview | null): ImportReview {
  const total = previous?.total ?? 0, rows = previous?.rows ?? []
  const invalid = errors.some(e => e.row <= 1) ? total : rows.filter(r => errors.some(e => e.row === r.row)).length
  return { committed: false, total, valid: Math.max(0, total - invalid), invalid, errors, rows }
}
export function importFailure(error: unknown, previous?: ImportReview | null): { review: ImportReview | null; message: string } {
  if (error instanceof ApiError && [400, 409, 413, 422].includes(error.status)) {
    const data = error.details
    const parsed = importReview(data)
    if (parsed?.errors.length) return { review: parsed.total || !previous ? parsed : importErrors(parsed.errors, previous), message: '' }
    if (object(data) && Array.isArray(data.errors) && data.errors.length && data.errors.every(isError)) return { review: importErrors(data.errors, previous), message: '' }
    // ASP.NET model-binding errors have no reliable Excel row; never invent one or expose parser internals.
    if (object(data) && object(data.errors)) {
      const fields: Record<string, string> = { FileBase64: '파일', RequestId: '등록 요청' }
      const errors = Object.entries(data.errors).flatMap(([field, messages]) => (Array.isArray(messages) ? messages : [messages]).map(() => ({ row: 0, column: fields[field.split('.').at(-1) ?? ''] || '파일', value: '', message: error.status === 413 ? '5MB 이내의 .xlsx 파일을 선택해 주세요.' : '업로드 요청 형식을 확인할 수 없습니다. 파일을 다시 선택해 주세요.' })))
      if (errors.length) return { review: importErrors(errors, previous), message: '' }
    }
    return { review: importErrors([{ row: 0, column: '파일 / 등록', value: '', message: error.message }], previous), message: '' }
  }
  return { review: null, message: error instanceof ApiError ? error.message : '파일 처리 중 문제가 발생했습니다. 파일을 다시 선택해 주세요.' }
}
