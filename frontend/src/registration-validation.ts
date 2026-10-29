export const normalizeBusinessNumber = (value: string) =>
  value.replace(/[-\s]/g, '')
export const validBusinessNumber = (value: string) =>
  /^[0-9]{10}$/.test(normalizeBusinessNumber(value))
export const validNewPassword = (value: string) =>
  value.length >= 8 &&
  value.length <= 128 &&
  /[a-z]/.test(value) &&
  /[0-9]/.test(value) &&
  /[^a-zA-Z0-9]/.test(value)
