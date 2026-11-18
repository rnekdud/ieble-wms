/** New EA input only; legacy units/stock values are never converted. */
export const isEachUnit = (unit?: string | null) => unit === 'EA' || unit === '개'
/** Input grammar only: reject unsupported characters without converting quantities. */
export const isQuantityDraft = (value: string, unit?: string | null) =>
  isEachUnit(unit) || !unit ? /^\d*$/.test(value) : /^(?:\d+(?:\.\d*)?|\.\d*)?$/.test(value)
export function eachQuantityError(value: string | number | null | undefined, unit?: string | null) {
  if (!isEachUnit(unit) || value == null || String(value).trim() === '') return null
  return !Number.isFinite(Number(value)) || !Number.isInteger(Number(value)) ? '개(EA) 수량은 정수로 입력해 주세요.' : null
}
