import { t } from './i18n.ts'
/** Localize display only; the browser and existing custom validators remain authoritative. */
export function inputValidationMessage(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const v = input.validity
  if (v.valid) return ''
  if (v.customError) return t(input.validationMessage)
  if (v.valueMissing) return t('필수 항목을 입력해 주세요.')
  if (v.typeMismatch) return t('입력 형식을 확인해 주세요.')
  if (v.rangeUnderflow && 'min' in input) return t('{v0} 이상의 값을 입력해 주세요.', { v0: input.min })
  if (v.rangeOverflow && 'max' in input) return t('{v0} 이하의 값을 입력해 주세요.', { v0: input.max })
  if (v.tooLong) return t('입력 가능한 최대 길이를 초과했습니다.')
  if (v.tooShort) return t('입력값이 너무 짧습니다.')
  return t('입력값을 확인해 주세요.')
}
