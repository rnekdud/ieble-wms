import { validNewPassword } from './registration-validation.ts'

export function validPersonalPassword(
  password: string,
  loginId: string,
  currentPassword: string,
): boolean {
  return (
    validNewPassword(password) &&
    password !== currentPassword &&
    password.toLowerCase() !== loginId.toLowerCase()
  )
}
