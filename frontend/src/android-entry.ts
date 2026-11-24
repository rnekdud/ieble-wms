import { t as uiText } from './i18n.ts'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'
import { androidApiUrl } from './android-api-url'
import { requestNavigation } from './navigation-guard'

async function start() {
  if (Capacitor.getPlatform() === 'android') {
    const nativeApi = registerPlugin<{ getConfiguration(): Promise<{ baseUrl: string }> }>('WmsApi')
    const { baseUrl } = await nativeApi.getConfiguration()
    const nativeFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const original = input instanceof Request ? input.url : String(input)
      const url = androidApiUrl(original, location.origin, baseUrl)
      return nativeFetch(input instanceof Request ? new Request(url, input) : url, init)
    }
    await App.addListener('backButton', ({ canGoBack }) => {
      const dialogs = document.querySelectorAll('dialog[open]')
      const dialog = dialogs[dialogs.length - 1]
      if (dialog) { dialog.dispatchEvent(new Event('cancel', { bubbles: false, cancelable: true })); return }
      if (canGoBack) history.back()
      else requestNavigation(() => { void App.minimizeApp() })
    })
  }
  await import('./main')
}
// Keep a usable error screen if native initialization fails, even without the API or Vite server.
void start().catch(() => {
  const root = document.getElementById('root')
  if (root) root.textContent = uiText('앱을 시작하지 못했습니다. 앱을 종료한 뒤 다시 실행해 주세요.')
})
