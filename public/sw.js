// Installability helper only. Do not cache photos, IndexedDB contents, API responses or credentials.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
// Keep requests network-only. A fetch listener improves compatibility with older
// Chromium installability checks without introducing stale app shells or API caches.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  event.respondWith(fetch(event.request))
})
