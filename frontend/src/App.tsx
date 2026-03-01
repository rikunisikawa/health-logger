import { useEffect } from 'react'
import AuthGuard from './components/AuthGuard'
import HealthForm from './components/HealthForm'
import { useAuth } from './hooks/useAuth'
import { useOfflineQueue } from './hooks/useOfflineQueue'

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT as string

function AppContent() {
  const { token, signOut } = useAuth()
  const { flush } = useOfflineQueue(API_ENDPOINT)

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
          <button className="btn btn-sm btn-outline-secondary" onClick={signOut}>
            ログアウト
          </button>
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
