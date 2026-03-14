import { useEffect, useState } from 'react'
import AuthGuard from './components/AuthGuard'
import DashboardPage from './components/DashboardPage'
import HealthForm from './components/HealthForm'
import ItemConfigScreen from './components/ItemConfigScreen'
import RecordHistory from './components/RecordHistory'
import { getLatest } from './api'
import { useAuth } from './hooks/useAuth'
import { useItemConfig } from './hooks/useItemConfig'
import { useOfflineQueue } from './hooks/useOfflineQueue'
import { usePushNotification } from './hooks/usePushNotification'
import type { LatestRecord } from './types'

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT as string

function AppContent() {
  const { token, signOut } = useAuth()
  const { flush } = useOfflineQueue(API_ENDPOINT)
  const { subscribed, subscribe, unsubscribe } = usePushNotification(token)
  const { configs, save } = useItemConfig(token)
  const [showSettings, setShowSettings] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [records, setRecords] = useState<LatestRecord[]>([])

  useEffect(() => {
    if (!token) return
    const handleOnline = () => flush(token).catch(() => {})
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [token, flush])

  useEffect(() => {
    if (!token) return
    getLatest(token, 10)
      .then((res) => setRecords(res.records))
      .catch(() => {})
  }, [token])

  const handleRecordDeleted = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id))
  }

  const formItems  = configs.filter((c) => c.mode === 'form').sort((a, b) => a.order - b.order)
  const eventItems = configs.filter((c) => c.mode === 'event').sort((a, b) => a.order - b.order)

  // 最新の daily 記録を HealthForm に渡す（前回値表示用）
  const latestDailyRecord = records.find((r) => r.record_type === 'daily')

  if (showDashboard) {
    return <DashboardPage onBack={() => setShowDashboard(false)} />
  }

  return (
    <div>
      <nav className="navbar navbar-expand navbar-light bg-light border-bottom">
        <div className="container">
          <span className="navbar-brand fw-bold text-success">Health Logger</span>
          <div className="d-flex gap-2">
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setShowDashboard(true)}
              title="ダッシュボード"
            >
              📊
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setShowSettings(true)}
              title="記録項目の設定"
            >
              ⚙️
            </button>
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

      <HealthForm
        formItems={formItems}
        eventItems={eventItems}
        latestDailyRecord={latestDailyRecord}
      />

      <div className="container" style={{ maxWidth: '540px' }}>
        <RecordHistory records={records} onDeleted={handleRecordDeleted} />
      </div>

      {showSettings && (
        <ItemConfigScreen
          configs={configs}
          onSave={save}
          onClose={() => setShowSettings(false)}
        />
      )}
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
