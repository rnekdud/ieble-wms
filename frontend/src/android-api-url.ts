/** Only same-origin WMS API requests are forwarded; assets and external URLs stay untouched. */
export function androidApiUrl(input: string, appOrigin: string, apiBaseUrl: string): string {
  const url = new URL(input, appOrigin)
  if (url.origin !== appOrigin || !url.pathname.startsWith('/api/')) return url.href
  const base = new URL(apiBaseUrl)
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Invalid Android API origin')
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && base.hostname === 'localhost')) throw new Error('Android debug API requires HTTPS or USB localhost')
  return base.origin + url.pathname + url.search
}
