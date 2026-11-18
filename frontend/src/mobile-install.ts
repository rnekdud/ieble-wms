import { isNativeApp } from './native-environment'
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let pending: InstallEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(listener => listener())
export const subscribeInstall = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const installState = () => installed ? 'installed' : pending ? 'available' : 'help'
export function observeInstall() {
  const offer = (event: Event) => { event.preventDefault(); pending = event as InstallEvent; notify() }
  const done = () => { installed = true; pending = null; notify() }
  if (isNativeApp() || matchMedia('(display-mode: standalone)').matches) done()
  window.addEventListener('beforeinstallprompt', offer); window.addEventListener('appinstalled', done)
  return () => { window.removeEventListener('beforeinstallprompt', offer); window.removeEventListener('appinstalled', done) }
}
export async function installMobileApp() {
  const event = pending
  if (!event) return
  pending = null; notify()
  await event.prompt(); await event.userChoice
}
