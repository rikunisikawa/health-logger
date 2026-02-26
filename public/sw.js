// Health Logger Service Worker
const CACHE_VERSION = 'v1';
const CACHE_NAME = `health-logger-${CACHE_VERSION}`;
const OFFLINE_QUEUE_KEY = 'health_logger_offline_queue';

const PRECACHE_URLS = [
  '/',
  '/records/new',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
];

// ── Install ────────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ───────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // POST /records → intercept offline
  if (request.method === 'POST' && url.pathname === '/records') {
    event.respondWith(handleRecordPost(request));
    return;
  }

  // GET requests: cache-first for static assets, network-first for HTML
  if (request.method === 'GET') {
    if (request.destination === 'document') {
      event.respondWith(networkFirst(request));
    } else {
      event.respondWith(cacheFirst(request));
    }
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('<h1>オフライン</h1><p>インターネット接続を確認してください。</p>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  return cached || fetch(request).catch(() => new Response('', { status: 503 }));
}

// ── Offline POST queue ─────────────────────────────────────────────────────────
async function handleRecordPost(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Save to IndexedDB queue
    const body = await request.text();
    await enqueueOfflineRecord(body, request.url, Object.fromEntries(request.headers));
    // Return a fake redirect to mimic success
    return Response.redirect('/records/new?offline=1', 302);
  }
}

async function enqueueOfflineRecord(body, url, headers) {
  const db = await openDb();
  const tx = db.transaction('queue', 'readwrite');
  tx.objectStore('queue').add({
    url,
    body,
    headers,
    timestamp: Date.now()
  });
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

// ── Sync (Background Sync) ─────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-health-records') {
    event.waitUntil(flushQueue());
  }
});

async function flushQueue() {
  const db = await openDb();
  const records = await getAllQueued(db);

  for (const record of records) {
    try {
      const response = await fetch(record.url, {
        method: 'POST',
        headers: record.headers,
        body: record.body
      });
      if (response.ok || response.redirected) {
        await deleteQueued(db, record.id);
      }
    } catch {
      // Will retry on next sync
    }
  }
}

// ── IndexedDB helpers ──────────────────────────────────────────────────────────
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('health_logger_db', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('queue')) {
        const store = db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

function getAllQueued(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readonly');
    const req = tx.objectStore('queue').getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

function deleteQueued(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    const req = tx.objectStore('queue').delete(id);
    req.onsuccess = resolve;
    req.onerror = e => reject(e.target.error);
  });
}
