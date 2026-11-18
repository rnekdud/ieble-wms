/** iOS API origin is explicit: an iPhone's localhost is not the development Mac. */
export function iosApiBaseUrl(value: string, options: { device?: boolean; release?: boolean } = {}): string {
  const url = new URL(value)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('API URL에는 서버 주소와 포트만 지정해 주세요.')
  if (options.device && loopback) throw new Error('iPhone에서는 localhost 대신 Mac의 .local 주소 또는 HTTPS API 주소를 지정해 주세요.')
  if (url.protocol !== 'https:' && (url.protocol !== 'http:' || options.release || (!loopback && !url.hostname.endsWith('.local')))) {
    throw new Error('HTTPS API 주소를 사용해 주세요. 개발 HTTP는 Simulator localhost 또는 Mac의 .local 주소만 허용합니다.')
  }
  return url.origin
}

export function iosApiUrl(input: string, appUrl: string, apiBase: string): string {
  const app = new URL(appUrl)
  const url = new URL(input, app)
  // Custom scheme origins are both "null"; compare scheme and authority instead.
  if (url.protocol === app.protocol && url.host === app.host && !url.username && !url.password && url.pathname.startsWith('/api/')) {
    return `${iosApiBaseUrl(apiBase)}${url.pathname}${url.search}`
  }
  return input
}
