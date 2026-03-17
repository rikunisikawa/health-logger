import { useEffect, useRef, useState } from 'react'
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
  const [page, setPage] = useState(0)
  const [records, setRecords] = useState<LatestRecord[]>([])

  const touchStartX = useRef(0)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].screenX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].screenX
    if (Math.abs(diff) > 50) {
      if (diff > 0) setPage(p => Math.min(p + 1, 2))
      if (diff < 0) setPage(p => Math.max(p - 1, 0))
    }
  }

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

  const formItems   = configs.filter((c) => c.mode === 'form').sort((a, b) => a.order - b.order)
  const eventItems  = configs.filter((c) => c.mode === 'event').sort((a, b) => a.order - b.order)
  const statusItems = configs.filter((c) => c.mode === 'status').sort((a, b) => a.order - b.order)

  const latestDailyRecord = records.find((r) => r.record_type === 'daily')

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Navbar */}
      <nav className="navbar navbar-expand navbar-light bg-light border-bottom" style={{ flexShrink: 0 }}>
        <div className="container">
          <span className="navbar-brand fw-bold text-success d-flex align-items-center gap-2">
            <img src="/icon-192.png" alt="Health Logger" width={28} height={28} style={{ borderRadius: '6px' }} />
            Health Logger
          </span>
          <div className="d-flex gap-2">
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

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #dee2e6', backgroundColor: '#fff', flexShrink: 0 }}>
        {['📝 記録', '📋 履歴', '📊 分析'].map((label, i) => (
          <button
            key={i}
            onClick={() => setPage(i)}
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              borderBottom: page === i ? '2px solid #198754' : '2px solid transparent',
              backgroundColor: 'transparent',
              fontWeight: page === i ? 600 : 400,
              color: page === i ? '#198754' : '#6c757d',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Swipeable pages */}
      <div
        style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          style={{
            display: 'flex',
            width: '300%',
            height: '100%',
            transform: `translateX(-${page * 33.333}%)`,
            transition: 'transform 0.3s ease',
          }}
        >
          {/* Page 0: 記録フォーム */}
          <div style={{ width: '33.333%', height: '100%', overflowY: 'auto' }}>
            <HealthForm
              formItems={formItems}
              eventItems={eventItems}
              statusItems={statusItems}
              latestDailyRecord={latestDailyRecord}
            />
          </div>

          {/* Page 1: 履歴 */}
          <div style={{ width: '33.333%', height: '100%', overflowY: 'auto' }}>
            <div className="container py-3" style={{ maxWidth: '540px' }}>
              <RecordHistory records={records} onDeleted={handleRecordDeleted} />
            </div>
          </div>

          {/* Page 2: 分析 */}
          <div style={{ width: '33.333%', height: '100%', overflowY: 'auto' }}>
            <DashboardPage onBack={() => setPage(0)} />
          </div>
        </div>
      </div>

      {/* Page dots */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          padding: '12px 0',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(255,255,255,0.9)',
          zIndex: 100,
        }}
      >
        {[0, 1, 2].map(i => (
          <div
            key={i}
            onClick={() => setPage(i)}
            style={{
              width: page === i ? '20px' : '8px',
              height: '8px',
              borderRadius: '4px',
              backgroundColor: page === i ? '#198754' : '#dee2e6',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>

      {/* Settings modal */}
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
