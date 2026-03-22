import { useEffect, useMemo, useState } from 'react'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Slider from '@mui/material/Slider'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { createRecord } from '../api'
import { useAuth } from '../hooks/useAuth'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import type { CustomFieldValue, HealthRecordInput, ItemConfig, LatestRecord } from '../types'
import VoiceInputButton from './VoiceInputButton'
import VoiceConfirmModal from './VoiceConfirmModal'
import { parseVoiceInput } from '../utils/voiceParser'
import type { ParsedVoiceItem, VoiceParseResult } from '../utils/voiceParser'

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

/** スライダー各項目の色 */
const SLIDER_COLORS = {
  fatigue:       '#dc3545',
  mood:          '#fd7e14',
  motivation:    '#198754',
  concentration: '#0d6efd',
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
  return new Date(value).toISOString()
}

export type ToastVariant = 'success' | 'danger' | 'warning'

interface Props {
  formItems:    ItemConfig[]
  eventItems:   ItemConfig[]
  statusItems:  ItemConfig[]
  latestDailyRecord?: LatestRecord
  onToast: (message: string, variant: ToastVariant) => void
  onRecordsSubmitted?: () => void
}

export default function HealthForm({ formItems, eventItems, statusItems, latestDailyRecord, onToast, onRecordsSubmitted }: Props) {
  const { token } = useAuth()
  const { enqueue, flush } = useOfflineQueue(API_ENDPOINT)

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

  const [recordedAt, setRecordedAt] = useState(() => toDatetimeLocal(new Date()))
  const isNowSelected = useMemo(() => {
    const diff = Math.abs(new Date(recordedAt).getTime() - Date.now())
    return diff < 60 * 1000
  }, [recordedAt])

  const resetToNow = () => setRecordedAt(toDatetimeLocal(new Date()))

  const [fatigue, setFatigue]             = useState(prevFatigue)
  const [mood, setMood]                   = useState(prevMood)
  const [motivation, setMotivation]       = useState(prevMotivation)
  const [concentration, setConcentration] = useState(prevConcentration)
  const [note, setNote]               = useState('')
  const [customValues, setCustomValues] = useState<Record<string, number | boolean | string>>({})
  const [submitting, setSubmitting]   = useState(false)

  // Voice input state
  const [voiceResult, setVoiceResult]       = useState<VoiceParseResult | null>(null)
  const [voiceSubmitting, setVoiceSubmitting] = useState(false)

  // Quick event state
  const [eventInputs, setEventInputs] = useState<Record<string, string>>({})
  const [eventSending, setEventSending] = useState<Record<string, boolean>>({})

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

  // スライダーのオン/オフ設定（localStorage で永続化）
  type SliderKey = 'fatigue' | 'mood' | 'motivation' | 'concentration'
  const [enabledSliders, setEnabledSliders] = useState<Record<SliderKey, boolean>>(() => {
    try {
      const stored = localStorage.getItem('health_logger_enabled_sliders')
      const defaults = { fatigue: true, mood: true, motivation: true, concentration: true }
      return stored ? { ...defaults, ...(JSON.parse(stored) as Partial<Record<SliderKey, boolean>>) } : defaults
    } catch {
      return { fatigue: true, mood: true, motivation: true, concentration: true }
    }
  })

  const toggleSlider = (key: SliderKey) => {
    setEnabledSliders((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem('health_logger_enabled_sliders', JSON.stringify(next)) } catch {}
      return next
    })
  }


  const handleVoiceTranscript = (text: string) => {
    const customLabels = [
      ...eventItems.map((e) => e.label),
      ...statusItems.map((s) => s.label),
    ]
    const parsed = parseVoiceInput(text, customLabels)
    setVoiceResult(parsed)
  }

  const handleVoiceConfirm = async (items: ParsedVoiceItem[]) => {
    if (!token) return
    setVoiceSubmitting(true)
    let successCount = 0
    for (const item of items) {
      const base = {
        flags: 0,
        note: '',
        recorded_at: item.recordedAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        device_id: navigator.userAgent.slice(0, 100),
        app_version: '1.0.0',
      }
      let record: HealthRecordInput
      if (item.type === 'daily') {
        record = {
          ...base,
          record_type: 'daily',
          fatigue_score:        item.fatigue,
          mood_score:           item.mood,
          motivation_score:     item.motivation,
          concentration_score:  item.concentration,
          custom_fields: [],
        }
      } else {
        record = {
          ...base,
          record_type: 'event',
          custom_fields: [
            {
              item_id: item.eventLabel,
              label:   item.eventLabel,
              type:    'checkbox',
              value:   true,
            },
          ],
        }
      }
      try {
        await createRecord(record, token)
        successCount++
      } catch {
        if (!navigator.onLine) {
          await enqueue(record, token).catch(() => {})
        }
      }
    }
    setVoiceSubmitting(false)
    setVoiceResult(null)
    if (successCount > 0) {
      onToast(`${successCount}件を記録しました`, 'success')
      flush(token).catch(() => {})
      onRecordsSubmitted?.()
    } else {
      onToast('送信に失敗しました', 'danger')
    }
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

  const getRecordedAtISO = () => datetimeLocalToISO(recordedAt)

  const submitRecord = async (record: HealthRecordInput) => {
    try {
      await createRecord(record, token!)
      return true
    } catch {
      if (!navigator.onLine) {
        await enqueue(record, token!).catch(() => {})
        onToast('オフラインのためキューに保存しました', 'warning')
      } else {
        onToast('送信に失敗しました', 'danger')
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
      ...(enabledSliders.fatigue       && { fatigue_score:       fatigue }),
      ...(enabledSliders.mood          && { mood_score:          mood }),
      ...(enabledSliders.motivation    && { motivation_score:    motivation }),
      ...(enabledSliders.concentration && { concentration_score: concentration }),
      flags:                0,
      note:             note.slice(0, 280),
      recorded_at:      getRecordedAtISO(),
      timezone:         Intl.DateTimeFormat().resolvedOptions().timeZone,
      device_id:        navigator.userAgent.slice(0, 100),
      app_version:      '1.0.0',
      custom_fields:    buildCustomFields(formItems),
    }
    const ok = await submitRecord(record)
    if (ok) {
      onToast('記録しました！', 'success')
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
      recorded_at:   getRecordedAtISO(),
      timezone:      Intl.DateTimeFormat().resolvedOptions().timeZone,
      device_id:     navigator.userAgent.slice(0, 100),
      app_version:   '1.0.0',
      custom_fields: [{ item_id: item.item_id, label: item.label, type: 'checkbox', value: true }],
    }
    const ok = await submitRecord(record)
    if (ok) {
      onToast(`${item.label} を記録しました`, 'success')
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
      onToast(`${label} を${nextActive ? 'ON' : 'OFF'}にしました`, 'success')
      flush(token).catch(() => {})
    } else {
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
      recorded_at:   getRecordedAtISO(),
      timezone:      Intl.DateTimeFormat().resolvedOptions().timeZone,
      device_id:     navigator.userAgent.slice(0, 100),
      app_version:   '1.0.0',
      custom_fields: [{ item_id: item.item_id, label: item.label, type: item.type, value }],
    }
    const ok = await submitRecord(record)
    if (ok) {
      onToast(`${item.label} を記録しました`, 'success')
      setEventInputs((prev) => ({ ...prev, [item.item_id]: '' }))
      flush(token).catch(() => {})
    }
    setEventSending((s) => ({ ...s, [item.item_id]: false }))
  }

  const hasPrev = latestDailyRecord != null

  return (
    <div className="container py-3" style={{ maxWidth: '540px' }}>
      {/* ── 記録日時ピッカー ──────────────────────── */}
      <div
        className="mb-3 p-3 rounded"
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
            max={toDatetimeLocal(new Date())}
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
      <Card variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
        <CardContent sx={{ pb: '12px !important', pt: 1.5, px: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 600 }}>
            ステータス
          </Typography>
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
        </CardContent>
      </Card>

      {/* ── Quick Events (flags + custom event items) ──────────── */}
      <Card variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
        <CardContent sx={{ pb: '12px !important', pt: 1.5, px: 2 }}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            sx={{ mb: 1.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            クイックイベント
            <VoiceInputButton onTranscript={handleVoiceTranscript} size="sm" />
          </Typography>
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
        </CardContent>
      </Card>

      {/* ── Daily Form ────────────────────────────────────────── */}
      <Card variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
        <CardContent sx={{ pt: 1.5, px: 2 }}>
          <div className="d-flex align-items-start justify-content-between mb-2 flex-wrap gap-2">
            <Typography
              variant="h6"
              color="success.main"
              sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}
            >
              体調記録
              <VoiceInputButton onTranscript={handleVoiceTranscript} />
            </Typography>
            {/* スライダーのオン/オフ切り替え */}
            <div className="d-flex flex-wrap gap-2">
              {(
                [
                  { key: 'fatigue',       label: '疲労感', color: SLIDER_COLORS.fatigue       },
                  { key: 'mood',          label: '気分',   color: SLIDER_COLORS.mood           },
                  { key: 'motivation',    label: 'やる気', color: SLIDER_COLORS.motivation     },
                  { key: 'concentration', label: '集中力', color: SLIDER_COLORS.concentration  },
                ] as const
              ).map(({ key, label, color }) => (
                <label
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    border: `1px solid ${enabledSliders[key] ? color : '#dee2e6'}`,
                    backgroundColor: enabledSliders[key] ? `${color}18` : '#f8f9fa',
                    color: enabledSliders[key] ? color : '#adb5bd',
                    userSelect: 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enabledSliders[key]}
                    onChange={() => toggleSlider(key)}
                    style={{ accentColor: color, width: '13px', height: '13px', cursor: 'pointer' }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            {/* MUI Sliders */}
            {(
              [
                { label: '疲労感', value: fatigue,       setter: setFatigue,       colorKey: 'fatigue'       as const, prev: prevFatigue       },
                { label: '気分',   value: mood,          setter: setMood,          colorKey: 'mood'          as const, prev: prevMood          },
                { label: 'やる気', value: motivation,    setter: setMotivation,    colorKey: 'motivation'    as const, prev: prevMotivation    },
                { label: '集中力', value: concentration, setter: setConcentration, colorKey: 'concentration' as const, prev: prevConcentration },
              ] as const
            ).filter(({ colorKey }) => enabledSliders[colorKey])
             .map(({ label, value, setter, colorKey, prev }) => (
              <div className="mb-2" key={label}>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{label}</Typography>
                  <div className="d-flex align-items-center gap-2">
                    {hasPrev && (
                      <Typography variant="caption" color="text.secondary" title="前回の記録値">
                        前回: {prev}
                      </Typography>
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
                  </div>
                </div>
                <Slider
                  min={0}
                  max={100}
                  value={value}
                  onChange={(_, v) => setter(v as number)}
                  sx={{
                    color: SLIDER_COLORS[colorKey],
                    py: 0.5,
                    '& .MuiSlider-thumb': { width: 20, height: 20 },
                  }}
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
                    {item.type === 'slider' && (
                      <div>
                        <label className="form-label d-flex justify-content-between">
                          <span>{item.icon && <span className="me-1">{item.icon}</span>}{item.label}</span>
                          <span className="badge bg-secondary">
                            {customValues[item.item_id] ?? item.min ?? 0}
                            {item.unit && ` ${item.unit}`}
                          </span>
                        </label>
                        <Slider
                          min={item.min ?? 0}
                          max={item.max ?? 100}
                          value={Number(customValues[item.item_id] ?? item.min ?? 0)}
                          onChange={(_, v) => setCustomValue(item.item_id, v as number)}
                          sx={{ color: '#6c757d', py: 0.5 }}
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

            {/* Note - MUI TextField */}
            <TextField
              label="メモ"
              multiline
              rows={3}
              fullWidth
              variant="outlined"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              inputProps={{ maxLength: 280 }}
              helperText={`${note.length}/280`}
              placeholder="体調についてメモ（任意）"
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  '&.Mui-focused fieldset': { borderColor: '#198754' },
                },
                '& .MuiInputLabel-root.Mui-focused': { color: '#198754' },
              }}
            />

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
        </CardContent>
      </Card>

      {/* ── Voice Confirm Modal ──────────────────────────────── */}
      {voiceResult && (
        <VoiceConfirmModal
          result={voiceResult}
          onConfirm={handleVoiceConfirm}
          onCancel={() => setVoiceResult(null)}
          submitting={voiceSubmitting}
        />
      )}
    </div>
  )
}
