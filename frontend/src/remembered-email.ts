const emailKey = 'ieble.savedEmail'
const rememberKey = 'ieble.rememberEmail'
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function readRememberedEmail(storage?: PreferenceStorage): {
  email: string
  remember: boolean
} {
  try {
    const target = storage ?? window.localStorage
    const email = target.getItem(emailKey)
    return target.getItem(rememberKey) === 'true' &&
      email &&
      email.length <= 256
      ? { email, remember: true }
      : { email: '', remember: false }
  } catch {
    return { email: '', remember: false }
  }
}
export function clearRememberedEmail(storage?: PreferenceStorage): void {
  try {
    const target = storage ?? window.localStorage
    target.removeItem(emailKey)
    target.removeItem(rememberKey)
  } catch {
    /* Storage may be blocked; authentication must continue normally. */
  }
}
export function saveRememberedEmail(
  email: string,
  remember: boolean,
  storage?: PreferenceStorage,
): void {
  if (!remember) {
    clearRememberedEmail(storage)
    return
  }
  try {
    const target = storage ?? window.localStorage
    target.setItem(emailKey, email.trim())
    target.setItem(rememberKey, 'true')
  } catch {
    clearRememberedEmail(storage)
  }
}
