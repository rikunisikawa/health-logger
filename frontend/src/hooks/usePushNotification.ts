import { useCallback, useEffect, useState } from 'react'

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT as string
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const array = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) array[i] = rawData.charCodeAt(i)
  return array.buffer
}

export function usePushNotification(token: string | null) {
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscribed(!!sub)
      })
    })
  }, [])

  const subscribe = useCallback(async () => {
    if (!token || !VAPID_PUBLIC_KEY) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const reg = await navigator.serviceWorker.ready
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    await fetch(`${API_ENDPOINT}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    })

    setSubscribed(true)
  }, [token])

  const unsubscribe = useCallback(async () => {
    if (!token) return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()

    await fetch(`${API_ENDPOINT}/push/subscribe`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    setSubscribed(false)
  }, [token])

  return { subscribed, subscribe, unsubscribe }
}
