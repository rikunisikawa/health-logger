// Offline queue: flush pending records when connectivity returns
// Works alongside the Service Worker for progressive enhancement

const DB_NAME = 'health_logger_db';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function getQueuedCount() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function flushQueue() {
  if (!navigator.onLine) return;

  const db = await openDb();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });

  if (records.length === 0) return;

  console.log(`[HealthLogger] Flushing ${records.length} offline record(s)`);

  for (const record of records) {
    try {
      const resp = await fetch(record.url, {
        method: 'POST',
        headers: record.headers,
        body: record.body
      });

      if (resp.ok || resp.redirected || resp.status < 400) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(record.id);
        await new Promise(r => { tx.oncomplete = r; });
        console.log(`[HealthLogger] Synced offline record id=${record.id}`);
      }
    } catch (err) {
      console.warn(`[HealthLogger] Sync failed for id=${record.id}:`, err);
    }
  }

  // Try Background Sync API as backup
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('sync-health-records').catch(() => {});
  }
}

// Flush on page load if online
if (navigator.onLine) {
  document.addEventListener('DOMContentLoaded', flushQueue);
}

// Flush when connection restored
window.addEventListener('online', () => {
  console.log('[HealthLogger] Back online — flushing queue');
  flushQueue().then(async () => {
    const count = await getQueuedCount();
    if (count === 0) {
      // Show synced notification
      const toastContainer = document.querySelector('.position-fixed');
      if (toastContainer) {
        const toast = document.createElement('div');
        toast.className = 'toast align-items-center text-bg-info border-0 show';
        toast.innerHTML = `<div class="d-flex">
          <div class="toast-body"><i class="bi bi-cloud-check-fill"></i> オフライン記録を同期しました</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>`;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
      }
    }
  });
});

export { flushQueue, getQueuedCount };
