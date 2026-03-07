import { useEffect } from 'react'
import AuthGuard from './components/AuthGuard'
import HealthForm from './components/HealthForm'
import { useAuth } from './hooks/useAuth'
import { useOfflineQueue } from './hooks/useOfflineQueue'
import { usePushNotification } from './hooks/usePushNotification'

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT as string

function AppContent() {
  const { token, signOut } = useAuth()
  const { flush } = useOfflineQueue(API_ENDPOINT)
  const { subscribed, subscribe, unsubscribe } = usePushNotification(token)

  // Flush offline queue when connection is restored
  useEffect(() => {
    if (!token) return
    const handleOnline = () => flush(token).catch(() => {})
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [token, flush])

  return (
    <div>
      <nav className="navbar navbar-expand navbar-light bg-light border-bottom">
        <div className="container">
          <span className="navbar-brand fw-bold text-success">Health Logger</span>
          <div className="d-flex gap-2">
            <button
              className={`btn btn-sm ${subscribed ? 'btn-outline-warning' : 'btn-outline-success'}`}
              onClick={subscribed ? unsubscribe : subscribe}
              title={subscribed ? '通知をオフ' : '毎日21時に通知を受け取る'}
            >
              {subscribed ? '🔔' : '🔕'}
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={signOut}>
              ログアウト
            </button>
          </div>
        </div>
      </nav>
      <HealthForm />
    </div>
  )
}

export default function App() {
  return (
    <AuthGuard>
      <AppContent />
    </AuthGuard>
  )
}
