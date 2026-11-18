import { App } from '@capacitor/app'
import { requestNavigation } from './navigation-guard'

// Live Reload uses browser fetch and the existing Vite proxy; no API URL rewriting.
export async function startAndroidLive() {
  const listener = await App.addListener('backButton', ({ canGoBack }) => {
    const dialogs = document.querySelectorAll('dialog[open]')
    const dialog = dialogs[dialogs.length - 1]
    if (dialog) { dialog.dispatchEvent(new Event('cancel', { bubbles: false, cancelable: true })); return }
    if (canGoBack) history.back()
    else requestNavigation(() => { void App.minimizeApp() })
  })
  import.meta.hot?.dispose(() => { void listener.remove() })
}
