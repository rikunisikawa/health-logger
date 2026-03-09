import { useState } from 'react'
import { createRecord } from '../api'
import { useAuth } from '../hooks/useAuth'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import type { CustomFieldValue, HealthRecordInput, ItemConfig } from '../types'

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT as string

const FLAGS = {
  poor_sleep:  1,
  headache:    2,
  stomachache: 4,
  exercise:    8,
  alcohol:     16,
  caffeine:    32,
} as const

const FLAG_LABELS: Record<keyof typeof FLAGS, string> = {
  poor_sleep:  '睡眠不足',
  headache:    '頭痛',
  stomachache: '腹痛',
  exercise:    '運動',
  alcohol:     'アルコール',
  caffeine:    'カフェイン',
}

const FLAG_ICONS: Record<keyof typeof FLAGS, string> = {
  poor_sleep:  '😴',
  headache:    '🤕',
  stomachache: '🤢',
  exercise:    '🏃',
  alcohol:     '🍺',
  caffeine:    '☕',
}

type ToastVariant = 'success' | 'danger' | 'warning'
interface ToastState { show: boolean; message: string; variant: ToastVariant }

interface Props {
  formItems:  ItemConfig[]
  eventItems: ItemConfig[]
}

export default function HealthForm({ formItems, eventItems }: Props) {
  const { token } = useAuth()
  const { enqueue, flush } = useOfflineQueue(API_ENDPOINT)

  // Daily form state
  const [fatigue, setFatigue]         = useState(50)
  const [mood, setMood]               = useState(50)
  const [motivation, setMotivation]   = useState(50)
  const [flags, setFlags]             = useState(0)
  const [note, setNote]               = useState('')
  const [customValues, setCustomValues] = useState<Record<string, number | boolean | string>>({})
  const [submitting, setSubmitting]   = useState(false)

  // Quick event state: eventItemId → pending number value (for number/slider types)
  const [eventInputs, setEventInputs] = useState<Record<string, string>>({})
  const [eventSending, setEventSending] = useState<Record<string, boolean>>({})

  const [toast, setToast] = useState<ToastState>({ show: false, message: '', variant: 'success' })

  const showToast = (message: string, variant: ToastVariant) => {
    setToast({ show: true, message, variant })
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3000)
  }

  const toggleFlag = (bit: number) => setFlags((f) => f ^ bit)

  const setCustomValue = (itemId: string, value: number | boolean | string) =>
    setCustomValues((prev) => ({ ...prev, [itemId]: value }))

  const buildCustomFields = (items: ItemConfig[]): CustomFieldValue[] =>
    items.map((item) => ({
      item_id: item.item_id,
      label:   item.label,
      type:    item.type,
      value:   customValues[item.item_id] ?? (item.type === 'checkbox' ? false : item.type === 'text' ? '' : item.min ?? 0),
    }))

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
      record_type:      'daily',
      fatigue_score:    fatigue,
      mood_score:       mood,
      motivation_score: motivation,
      flags,
      note:             note.slice(0, 280),
      recorded_at:      new Date().toISOString(),
      timezone:         Intl.DateTimeFormat().resolvedOptions().timeZone,
      device_id:        navigator.userAgent.slice(0, 100),
      app_version:      '1.0.0',
      custom_fields:    buildCustomFields(formItems),
    }
    const ok = await submitRecord(record)
    if (ok) {
      showToast('記録しました！', 'success')
      setNote('')
      setFlags(0)
      setCustomValues({})
      flush(token).catch(() => {})
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setTimeout(() => window.close(), 1500)
      }
    }
    setSubmitting(false)
  }

  const handleQuickEvent = async (item: ItemConfig) => {
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
      record_type:   'event',
      flags:         0,
      note:          '',
      recorded_at:   new Date().toISOString(),
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

  return (
    <div className="container py-4" style={{ maxWidth: '540px' }}>
      {toast.show && (
        <div className={`alert alert-${toast.variant}`} role="alert">
          {toast.message}
        </div>
      )}

      {/* ── Quick Events ──────────────────────────────────────── */}
      {eventItems.length > 0 && (
        <div className="mb-4">
          <h2 className="h6 text-muted mb-2">クイックイベント</h2>
          <div className="d-flex flex-column gap-2">
            {eventItems.map((item) => (
              <div key={item.item_id} className="d-flex align-items-center gap-2">
                {(item.type === 'number' || item.type === 'slider') && (
                  <input
                    type="number"
                    className="form-control"
                    style={{ width: '100px' }}
                    placeholder={item.unit ?? '値'}
                    value={eventInputs[item.item_id] ?? ''}
                    onChange={(e) =>
                      setEventInputs((prev) => ({ ...prev, [item.item_id]: e.target.value }))
                    }
                  />
                )}
                {item.type === 'text' && (
                  <input
                    type="text"
                    className="form-control"
                    placeholder={item.label}
                    value={eventInputs[item.item_id] ?? ''}
                    onChange={(e) =>
                      setEventInputs((prev) => ({ ...prev, [item.item_id]: e.target.value }))
                    }
                  />
                )}
                <button
                  className="btn btn-outline-success"
                  onClick={() => handleQuickEvent(item)}
                  disabled={eventSending[item.item_id]}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {eventSending[item.item_id]
                    ? '…'
                    : <>{item.icon ? item.icon : '✓'} {item.label}{item.unit ? ` (${item.unit})` : ''}</>
                  }
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Daily Form ────────────────────────────────────────── */}
      <h1 className="h4 mb-4 text-success">体調記録</h1>
      <form onSubmit={handleSubmit}>
        {/* Sliders */}
        {(
          [
            { label: '疲労感', value: fatigue,    setter: setFatigue },
            { label: '気分',   value: mood,       setter: setMood },
            { label: 'やる気', value: motivation, setter: setMotivation },
          ] as const
        ).map(({ label, value, setter }) => (
          <div className="mb-3" key={label}>
            <label className="form-label d-flex justify-content-between">
              <span>{label}</span>
              <span className="badge bg-secondary">{value}</span>
            </label>
            <input
              type="range"
              className="form-range"
              min={0}
              max={100}
              value={value}
              onChange={(e) => setter(Number(e.target.value))}
            />
          </div>
        ))}

        {/* Flags */}
        <div className="mb-3">
          <label className="form-label">フラグ</label>
          <div className="d-flex flex-wrap gap-2">
            {(Object.entries(FLAGS) as [keyof typeof FLAGS, number][]).map(([key, bit]) => {
              const active = (flags & bit) !== 0
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleFlag(bit)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    padding: '8px 12px',
                    border: `2px solid ${active ? '#198754' : '#dee2e6'}`,
                    borderRadius: '12px',
                    background: active ? '#d1e7dd' : '#f8f9fa',
                    cursor: 'pointer',
                    minWidth: '64px',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{FLAG_ICONS[key]}</span>
                  <span style={{ fontSize: '0.7rem', color: active ? '#198754' : '#6c757d', fontWeight: active ? 600 : 400 }}>
                    {FLAG_LABELS[key]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

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
