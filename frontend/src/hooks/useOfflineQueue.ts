import { useCallback } from 'react'
import type { HealthRecordInput } from '../types'

const DB_NAME = 'health_logger_db'
const STORE_NAME = 'offline_queue'

interface QueueEntry {
  id?: number
  url: string
  body: string
  token: string
  timestamp: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
        store.createIndex('timestamp', 'timestamp')
      }
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error)
  })
}

export function useOfflineQueue(apiEndpoint: string) {
  const enqueue = useCallback(
    async (record: HealthRecordInput, token: string): Promise<void> => {
      const db = await openDb()
      const entry: Omit<QueueEntry, 'id'> = {
        url: `${apiEndpoint}/records`,
        body: JSON.stringify(record),
        token,
        timestamp: Date.now(),
      }
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).add(entry)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
    [apiEndpoint],
  )

  const flush = useCallback(
    async (token: string): Promise<void> => {
      const db = await openDb()
      const entries = await new Promise<QueueEntry[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).getAll()
        req.onsuccess = (e) => resolve((e.target as IDBRequest<QueueEntry[]>).result)
        req.onerror = (e) => reject((e.target as IDBRequest).error)
      })

      for (const entry of entries) {
        try {
          const res = await fetch(entry.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: entry.body,
          })
          if (res.ok) {
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction(STORE_NAME, 'readwrite')
              tx.objectStore(STORE_NAME).delete(entry.id!)
              tx.oncomplete = () => resolve()
              tx.onerror = () => reject(tx.error)
            })
          }
        } catch {
          // Will retry on next flush
        }
      }
    },
    [],
  )

  return { enqueue, flush }
}
