/* Never cache authentication, API responses, uploads, or successful document HTML. */
const CACHE = 'ieble-mobile-static-v1'
const STATIC = ['/offline.html', '/app-icon-192.png', '/app-icon-512.png']
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC))) })
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('ieble-mobile-static-') && key !== CACHE).map(key => caches.delete(key))))) })
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) || Response.error()))
    return
  }
  if (!STATIC.includes(url.pathname) && !/^\/assets\/[\w.-]+-[\w-]+\.(js|css|woff2)$/.test(url.pathname)) return
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(request)
    if (cached) return cached
    const response = await fetch(request)
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone())
    return response
  }))
})
