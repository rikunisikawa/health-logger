import { useEffect, useMemo, useState } from 'react'
import { createRecord } from '../api'
import { useAuth } from '../hooks/useAuth'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import type { CustomFieldValue, HealthRecordInput, ItemConfig, LatestRecord } from '../types'

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT as string

const FLAG_ITEMS = [
  { item_id: 'poor_sleep', label: '睡眠不足',    icon: '😴' },
  { item_id: 'exercise',   label: '運動',        icon: '🏃' },
  { item_id: 'alcohol',    label: 'アルコール', icon: '🍺' },
  { item_id: 'caffeine',   label: 'カフェイン', icon: '☕' },
] as const

const STATUS_ITEMS = [
  { item_id: 'headache',    label: '頭痛',   icon: '🤕' },
  { item_id: 'stomachache', label: '腹痛',   icon: '🤢' },
  { item_id: 'sleepy',      label: '眠い',   icon: '😪' },
  { item_id: 'working',     label: '勤務中', icon: '💼' },
] as const

/** スライダー各項目の accent-color */
const SLIDER_COLORS = {
  fatigue:       '#dc3545', // 赤: 疲労が高い = 注意
  mood:          '#fd7e14', // オレンジ: 気分
  motivation:    '#198754', // 緑: やる気
  concentration: '#0d6efd', // 青: 集中力
} as const

/** Date → datetime-local input の値形式 "YYYY-MM-DDTHH:MM" (ローカル時刻) */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** datetime-local の値 "YYYY-MM-DDTHH:MM" → ISO 8601 文字列 (UTC) */
function datetimeLocalToISO(value: string): string {
  // new Date("YYYY-MM-DDTHH:MM") はローカル時刻として解釈される
  return new Date(value).toISOString()
}

type ToastVariant = 'success' | 'danger' | 'warning'
interface ToastState { show: boolean; message: string; variant: ToastVariant }

interface Props {
  formItems:    ItemConfig[]
  eventItems:   ItemConfig[]
  statusItems:  ItemConfig[]
  latestDailyRecord?: LatestRecord
}

export default function HealthForm({ formItems, eventItems, statusItems, latestDailyRecord }: Props) {
  const { token } = useAuth()
  const { enqueue, flush } = useOfflineQueue(API_ENDPOINT)

  // 前回値を初期値として設定
  const prevFatigue    = useMemo(() => {
    const v = parseFloat(latestDailyRecord?.fatigue_score ?? '')
    return isNaN(v) ? 50 : v
  }, [latestDailyRecord])
  const prevMood       = useMemo(() => {
    const v = parseFloat(latestDailyRecord?.mood_score ?? '')
    return isNaN(v) ? 50 : v
  }, [latestDailyRecord])
  const prevMotivation = useMemo(() => {
    const v = parseFloat(latestDailyRecord?.motivation_score ?? '')
    return isNaN(v) ? 50 : v
  }, [latestDailyRecord])
  const prevConcentration = useMemo(() => {
    const v = parseFloat(latestDailyRecord?.concentration_score ?? '')
    return isNaN(v) ? 50 : v
  }, [latestDailyRecord])

  // 記録日時（フォーム全体で共通。デフォルト = 現在時刻）
  const [recordedAt, setRecordedAt] = useState(() => toDatetimeLocal(new Date()))
  const isNowSelected = useMemo(() => {
    // 現在時刻から1分以内なら「現在」とみなす
    const diff = Math.abs(new Date(recordedAt).getTime() - Date.now())
    return diff < 60 * 1000
  }, [recordedAt])

  const resetToNow = () => setRecordedAt(toDatetimeLocal(new Date()))

  // Daily form state（前回値で初期化）
  const [fatigue, setFatigue]             = useState(prevFatigue)
  const [mood, setMood]                   = useState(prevMood)
  const [motivation, setMotivation]       = useState(prevMotivation)
  const [concentration, setConcentration] = useState(prevConcentration)
  const [note, setNote]               = useState('')
  const [customValues, setCustomValues] = useState<Record<string, number | boolean | string>>({})
  const [submitting, setSubmitting]   = useState(false)

  // Quick event state
  const [eventInputs, setEventInputs] = useState<Record<string, string>>({})
  const [eventSending, setEventSending] = useState<Record<string, boolean>>({})

  // Status toggle state: item_id → true(ON) / false(OFF)
  // localStorage で永続化し、リロード後も復元する
  const [activeStatuses, setActiveStatuses] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('health_logger_active_statuses')
      return stored ? (JSON.parse(stored) as Record<string, boolean>) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('health_logger_active_statuses', JSON.stringify(activeStatuses))
    } catch {}
  }, [activeStatuses])

  const [toast, setToast] = useState<ToastState>({ show: false, message: '', variant: 'success' })

  const showToast = (message: string, variant: ToastVariant) => {
    setToast({ show: true, message, variant })
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3000)
  }

  const setCustomValue = (itemId: string, value: number | boolean | string) =>
    setCustomValues((prev) => ({ ...prev, [itemId]: value }))

  const buildCustomFields = (items: ItemConfig[]): CustomFieldValue[] =>
    items.map((item) => ({
      item_id: item.item_id,
      label:   item.label,
      type:    item.type,
      value:   customValues[item.item_id] ?? (item.type === 'checkbox' ? false : item.type === 'text' ? '' : item.min ?? 0),
    }))

  /** recordedAt の値を ISO 文字列に変換（共通） */
  const getRecordedAtISO = () => datetimeLocalToISO(recordedAt)

  const submitRecord = async (record: HealthRecordInput) => {
    try {
      await createRecord(record, token!)
      return true
    } catch {
      if (!navigator.onLine) {
        await enqueue(record, token!).catch(() => {})
        showToast('オフラインのためキューに保存しました', 'warning')
      } else {
        showToast('送信に失敗しました', 'danger')
      }
      return false
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSubmitting(true)
    const record: HealthRecordInput = {
      record_type:          'daily',
      fatigue_score:        fatigue,
      mood_score:           mood,
      motivation_score:     motivation,
      concentration_score:  concentration,
      flags:                0,
      note:             note.slice(0, 280),
      recorded_at:      getRecordedAtISO(),   // ← 選択日時を使用
      timezone:         Intl.DateTimeFormat().resolvedOptions().timeZone,
      device_id:        navigator.userAgent.slice(0, 100),
      app_version:      '1.0.0',
      custom_fields:    buildCustomFields(formItems),
    }
    const ok = await submitRecord(record)
    if (ok) {
      showToast('記録しました！', 'success')
      setNote('')
      setCustomValues({})
      flush(token).catch(() => {})
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setTimeout(() => window.close(), 1500)
      }
    }
    setSubmitting(false)
  }

  const sendFlagEvent = async (item: typeof FLAG_ITEMS[number]) => {
    if (!token) return
    setEventSending((s) => ({ ...s, [item.item_id]: true }))
    const record: HealthRecordInput = {
      record_type:   'event',
      flags:         0,
      note:          '',
      recorded_at:   getRecordedAtISO(),   // ← 選択日時を使用
      timezone:      Intl.DateTimeFormat().resolvedOptions().timeZone,
      device_id:     navigator.userAgent.slice(0, 100),
      app_version:   '1.0.0',
      custom_fields: [{ item_id: item.item_id, label: item.label, type: 'checkbox', value: true }],
    }
    const ok = await submitRecord(record)
    if (ok) {
      showToast(`${item.label} を記録しました`, 'success')
      flush(token).catch(() => {})
    }
    setEventSending((s) => ({ ...s, [item.item_id]: false }))
  }

  const toggleStatus = async (itemId: string, label: string) => {
    if (!token) return
    const nextActive = !activeStatuses[itemId]
    setActiveStatuses((s) => ({ ...s, [itemId]: nextActive }))
    setEventSending((s) => ({ ...s, [itemId]: true }))
    const record: HealthRecordInput = {
      record_type:   'status',
      flags:         0,
      note:          '',
      recorded_at:   getRecordedAtISO(),
      timezone:      Intl.DateTimeFormat().resolvedOptions().timeZone,
      device_id:     navigator.userAgent.slice(0, 100),
      app_version:   '1.0.0',
      custom_fields: [{ item_id: itemId, label, type: 'checkbox', value: nextActive }],
    }
    const ok = await submitRecord(record)
    if (ok) {
      showToast(`${label} を${nextActive ? 'ON' : 'OFF'}にしました`, 'success')
      flush(token).catch(() => {})
    } else {
      // 失敗時は状態を元に戻す
      setActiveStatuses((s) => ({ ...s, [itemId]: !nextActive }))
    }
    setEventSending((s) => ({ ...s, [itemId]: false }))
  }

  const handleQuickEvent = async (item: ItemConfig, recordType: 'event' | 'status' = 'event') => {
    if (!token) return
    let value: number | boolean | string
    if (item.type === 'checkbox') {
      value = true
    } else if (item.type === 'number' || item.type === 'slider') {
      const raw = eventInputs[item.item_id]
      if (!raw) return
      value = Number(raw)
    } else {
      value = eventInputs[item.item_id] ?? ''
    }

    setEventSending((s) => ({ ...s, [item.item_id]: true }))
    const record: HealthRecordInput = {
      record_type:   recordType,
      flags:         0,
      note:          '',
      recorded_at:   getRecordedAtISO(),   // ← 選択日時を使用
      timezone:      Intl.DateTimeFormat().resolvedOptions().timeZone,
      device_id:     navigator.userAgent.slice(0, 100),
      app_version:   '1.0.0',
      custom_fields: [{ item_id: item.item_id, label: item.label, type: item.type, value }],
    }
    const ok = await submitRecord(record)
    if (ok) {
      showToast(`${item.label} を記録しました`, 'success')
      setEventInputs((prev) => ({ ...prev, [item.item_id]: '' }))
      flush(token).catch(() => {})
    }
    setEventSending((s) => ({ ...s, [item.item_id]: false }))
  }

  const hasPrev = latestDailyRecord != null

  return (
    <div className="container py-4" style={{ maxWidth: '540px' }}>
      {toast.show && (
        <div
          className={`alert alert-${toast.variant} mb-0`}
          role="alert"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2000,
            borderRadius: 0,
            textAlign: 'center',
          }}
        >
          {toast.message}
        </div>
      )}

      {/* ── 記録日時ピッカー（全体共通）──────────────────────── */}
      <div
        className="mb-4 p-3 rounded"
        style={{
          backgroundColor: isNowSelected ? '#f8f9fa' : '#fff3cd',
          border: `1px solid ${isNowSelected ? '#dee2e6' : '#ffc107'}`,
        }}
      >
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <label className="form-label mb-0 fw-semibold" style={{ whiteSpace: 'nowrap' }}>
            🕐 記録日時
          </label>
          <input
            type="datetime-local"
            className="form-control form-control-sm"
            style={{ maxWidth: '220px' }}
            value={recordedAt}
            max={toDatetimeLocal(new Date())}   // 未来日時は選択不可
            onChange={(e) => setRecordedAt(e.target.value)}
          />
          {!isNowSelected && (
            <>
              <span className="badge bg-warning text-dark" style={{ fontSize: '0.72rem' }}>
                過去日時で記録中
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={resetToNow}
                style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
              >
                現在時刻に戻す
              </button>
            </>
          )}
        </div>
        {!isNowSelected && (
          <p className="mb-0 mt-1 text-warning-emphasis" style={{ fontSize: '0.72rem' }}>
            ※ ステータス・クイックイベント・体調記録ともにこの日時で登録されます
          </p>
        )}
      </div>

      {/* ── Status (ongoing conditions) ───────────────────────── */}
      <div className="mb-4">
        <h2 className="h6 text-muted mb-2">ステータス</h2>
        <div className="d-flex flex-wrap gap-2">
          {[...STATUS_ITEMS, ...statusItems].map((item) => {
            const isOn = activeStatuses[item.item_id] ?? false
            return (
              <button
                key={item.item_id}
                type="button"
                className={isOn ? 'btn btn-warning' : 'btn btn-outline-warning'}
                onClick={() => toggleStatus(item.item_id, item.label)}
                disabled={eventSending[item.item_id]}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  padding: '8px 12px',
                  minWidth: '64px',
                }}
              >
                {eventSending[item.item_id] ? (
                  <span className="spinner-border spinner-border-sm" role="status" />
                ) : (
                  <>
                    <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>
                      {'icon' in item ? item.icon : (item.icon ?? '●')}
                    </span>
                    <span style={{ fontSize: '0.7rem' }}>{item.label}</span>
                    {isOn && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>ON</span>
                    )}
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Quick Events (flags + custom event items) ──────────── */}
      <div className="mb-4">
        <h2 className="h6 text-muted mb-2">クイックイベント</h2>
        <div className="d-flex flex-wrap gap-2">
          {FLAG_ITEMS.map((item) => (
            <button
              key={item.item_id}
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => sendFlagEvent(item)}
              disabled={eventSending[item.item_id]}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                padding: '8px 12px',
                minWidth: '64px',
              }}
            >
              {eventSending[item.item_id] ? (
                <span className="spinner-border spinner-border-sm" role="status" />
              ) : (
                <>
                  <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{item.icon}</span>
                  <span style={{ fontSize: '0.7rem' }}>{item.label}</span>
                </>
              )}
            </button>
          ))}

          {/* カスタムイベント: checkbox は同じボタンスタイル */}
          {eventItems
            .filter((item) => item.type === 'checkbox')
            .map((item) => (
              <button
                key={item.item_id}
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => handleQuickEvent(item)}
                disabled={eventSending[item.item_id]}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  padding: '8px 12px',
                  minWidth: '64px',
                }}
              >
                {eventSending[item.item_id] ? (
                  <span className="spinner-border spinner-border-sm" role="status" />
                ) : (
                  <>
                    <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{item.icon ?? '✓'}</span>
                    <span style={{ fontSize: '0.7rem' }}>{item.label}</span>
                  </>
                )}
              </button>
            ))}

          {/* カスタムイベント: number/slider/text はコンパクトカード */}
          {eventItems
            .filter((item) => item.type !== 'checkbox')
            .map((item) => (
              <div
                key={item.item_id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: '6px 10px',
                  border: '1px solid #dee2e6',
                  borderRadius: '6px',
                  minWidth: '100px',
                  maxWidth: '140px',
                  backgroundColor: '#f8f9fa',
                }}
              >
                <span style={{ fontSize: '0.72rem', color: '#6c757d', fontWeight: 500 }}>
                  {item.icon ? `${item.icon} ` : ''}{item.label}
                  {item.unit ? ` (${item.unit})` : ''}
                </span>
                <input
                  type={item.type === 'text' ? 'text' : 'number'}
                  className="form-control form-control-sm"
                  placeholder={item.unit ?? '値'}
                  value={eventInputs[item.item_id] ?? ''}
                  onChange={(e) =>
                    setEventInputs((prev) => ({ ...prev, [item.item_id]: e.target.value }))
                  }
                  style={{ fontSize: '0.8rem', padding: '2px 6px' }}
                />
                <button
                  className="btn btn-outline-success btn-sm"
                  onClick={() => handleQuickEvent(item)}
                  disabled={eventSending[item.item_id]}
                  style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                >
                  {eventSending[item.item_id] ? '…' : '記録'}
                </button>
              </div>
            ))}
        </div>
      </div>

      {/* ── Daily Form ────────────────────────────────────────── */}
      <h1 className="h4 mb-4 text-success">体調記録</h1>
      <form onSubmit={handleSubmit}>
        {/* Sliders */}
        {(
          [
            { label: '疲労感', value: fatigue,       setter: setFatigue,       colorKey: 'fatigue'       as const, prev: prevFatigue       },
            { label: '気分',   value: mood,          setter: setMood,          colorKey: 'mood'          as const, prev: prevMood          },
            { label: 'やる気', value: motivation,    setter: setMotivation,    colorKey: 'motivation'    as const, prev: prevMotivation    },
            { label: '集中力', value: concentration, setter: setConcentration, colorKey: 'concentration' as const, prev: prevConcentration },
          ] as const
        ).map(({ label, value, setter, colorKey, prev }) => (
          <div className="mb-3" key={label}>
            <label className="form-label d-flex justify-content-between align-items-center">
              <span>{label}</span>
              <span className="d-flex align-items-center gap-2">
                {hasPrev && (
                  <span
                    className="text-muted"
                    style={{ fontSize: '0.75rem' }}
                    title="前回の記録値"
                  >
                    前回: {prev}
                  </span>
                )}
                <span
                  className="badge"
                  style={{
                    backgroundColor: SLIDER_COLORS[colorKey],
                    color: '#fff',
                    minWidth: '2.5rem',
                  }}
                >
                  {value}
                </span>
              </span>
            </label>
            <input
              type="range"
              className="form-range"
              min={0}
              max={100}
              value={value}
              onChange={(e) => setter(Number(e.target.value))}
              style={{ accentColor: SLIDER_COLORS[colorKey] }}
            />
          </div>
        ))}

        {/* Custom form items */}
        {formItems.length > 0 && (
          <div className="mb-3">
            <label className="form-label text-muted">カスタム項目</label>
            {formItems.map((item) => (
              <div className="mb-2" key={item.item_id}>
                {item.type === 'checkbox' && (
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id={`custom-${item.item_id}`}
                      checked={Boolean(customValues[item.item_id])}
                      onChange={(e) => setCustomValue(item.item_id, e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor={`custom-${item.item_id}`}>
                      {item.icon && <span className="me-1">{item.icon}</span>}
                      {item.label}
                    </label>
                  </div>
                )}
                {(item.type === 'slider') && (
                  <div>
                    <label className="form-label d-flex justify-content-between">
                      <span>{item.icon && <span className="me-1">{item.icon}</span>}{item.label}</span>
                      <span className="badge bg-secondary">
                        {customValues[item.item_id] ?? item.min ?? 0}
                        {item.unit && ` ${item.unit}`}
                      </span>
                    </label>
                    <input
                      type="range"
                      className="form-range"
                      min={item.min ?? 0}
                      max={item.max ?? 100}
                      value={Number(customValues[item.item_id] ?? item.min ?? 0)}
                      onChange={(e) => setCustomValue(item.item_id, Number(e.target.value))}
                    />
                  </div>
                )}
                {item.type === 'number' && (
                  <div>
                    <label className="form-label">
                      {item.icon && <span className="me-1">{item.icon}</span>}
                      {item.label}
                    </label>
                    <div className="input-group" style={{ maxWidth: '200px' }}>
                      <input
                        type="number"
                        className="form-control"
                        min={item.min}
                        max={item.max}
                        value={String(customValues[item.item_id] ?? '')}
                        onChange={(e) => setCustomValue(item.item_id, Number(e.target.value))}
                        placeholder="0"
                      />
                      {item.unit && <span className="input-group-text">{item.unit}</span>}
                    </div>
                  </div>
                )}
                {item.type === 'text' && (
                  <div>
                    <label className="form-label">
                      {item.icon && <span className="me-1">{item.icon}</span>}
                      {item.label}
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={String(customValues[item.item_id] ?? '')}
                      onChange={(e) => setCustomValue(item.item_id, e.target.value)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Note */}
        <div className="mb-4">
          <label className="form-label d-flex justify-content-between">
            <span>メモ</span>
            <span className="text-muted small">{note.length}/280</span>
          </label>
          <textarea
            className="form-control"
            rows={3}
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="体調についてメモ（任意）"
          />
        </div>

        <button type="submit" className="btn btn-success w-100" disabled={submitting}>
          {submitting ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" />
              送信中...
            </>
          ) : (
            '記録する'
          )}
        </button>
      </form>
    </div>
  )
}
