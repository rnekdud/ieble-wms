/** Native bridge detection also works when Android serves the ordinary Vite development entry. */
export function isAndroidApp(): boolean {
  const nativeWindow = window as Window & { Capacitor?: { getPlatform?: () => string } }
  return import.meta.env.MODE === 'android' || nativeWindow.Capacitor?.getPlatform?.() === 'android'
}

/** Native apps do not offer PWA installation or install a web service worker. */
export function isNativeApp(): boolean {
  const nativeWindow = window as Window & { Capacitor?: { getPlatform?: () => string } }
  return isAndroidApp() || import.meta.env.MODE === 'ios' || nativeWindow.Capacitor?.getPlatform?.() === 'ios'
}
