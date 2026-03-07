// Health Logger Service Worker
const CACHE_VERSION = 'v2'
const CACHE_NAME = `health-logger-${CACHE_VERSION}`

const PRECACHE_URLS = [
  '/',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
]

// ── Install ────────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

// ── Activate ───────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

// ── Fetch (cache-first for assets, network-first for navigation) ───────────────
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only handle same-origin GET requests
  if (request.method !== 'GET') return
  if (!request.url.startsWith(self.location.origin)) return

  if (request.destination === 'document') {
    event.respondWith(networkFirst(request))
  } else {
    event.respondWith(cacheFirst(request))
  }
})

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    return (
      cached ||
      new Response('<h1>オフライン</h1><p>インターネット接続を確認してください。</p>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    )
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  return cached || fetch(request).catch(() => new Response('', { status: 503 }))
}

// ── Push Notifications ─────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'Health Logger', {
      body: data.body || '今日の体調を記録しましょう',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
      requireInteraction: false,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin))
      if (existing) {
        existing.focus()
        existing.navigate(targetUrl)
      } else {
        self.clients.openWindow(targetUrl)
      }
    }),
  )
})

// ── Background Sync (flush offline queue) ──────────────────────────────────────
// Note: The offline queue (IndexedDB) is managed by useOfflineQueue.ts.
// Background Sync is triggered by the app on reconnect via the 'online' event.
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-health-records') {
    // Notify all clients to flush their queue
    event.waitUntil(
      self.clients.matchAll().then((clients) =>
        clients.forEach((client) => client.postMessage({ type: 'SYNC_QUEUE' })),
      ),
    )
  }
})
