import { Capacitor, registerPlugin } from '@capacitor/core'
import { iosApiBaseUrl, iosApiUrl } from './ios-api-url'

async function start() {
  if (Capacitor.getPlatform() === 'ios') {
    const nativeApi = registerPlugin<{ getConfiguration(): Promise<{ baseUrl: string }> }>('WmsApi')
    const { baseUrl } = await nativeApi.getConfiguration()
    iosApiBaseUrl(baseUrl)
    const nativeFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const original = input instanceof Request ? input.url : String(input)
      const url = iosApiUrl(original, location.href, baseUrl)
      return nativeFetch(input instanceof Request ? new Request(url, input) : url, init)
    }
  }
  await import('./main')
}

void start().catch(() => {
  const root = document.getElementById('root')
  if (root) root.textContent = '앱을 시작하지 못했습니다. iPhone용 API 주소 설정을 확인한 뒤 다시 실행해 주세요. Simulator의 localhost 주소는 실제 iPhone에서 사용할 수 없습니다.'
})
