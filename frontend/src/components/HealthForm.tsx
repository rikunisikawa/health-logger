import { useState } from 'react'
import { createRecord } from '../api'
import { useAuth } from '../hooks/useAuth'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import type { HealthRecordInput } from '../types'

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

type ToastVariant = 'success' | 'danger' | 'warning'

interface ToastState {
  show: boolean
  message: string
  variant: ToastVariant
}

export default function HealthForm() {
  const { token } = useAuth()
  const { enqueue, flush } = useOfflineQueue(API_ENDPOINT)

  const [fatigue, setFatigue]       = useState(50)
  const [mood, setMood]             = useState(50)
  const [motivation, setMotivation] = useState(50)
  const [flags, setFlags]           = useState(0)
  const [note, setNote]             = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast]           = useState<ToastState>({ show: false, message: '', variant: 'success' })

  const showToast = (message: string, variant: ToastVariant) => {
    setToast({ show: true, message, variant })
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3000)
  }

  const toggleFlag = (bit: number) => setFlags((f) => f ^ bit)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    setSubmitting(true)

    const record: HealthRecordInput = {
      fatigue_score:    fatigue,
      mood_score:       mood,
      motivation_score: motivation,
      flags,
      note:             note.slice(0, 280),
      recorded_at:      new Date().toISOString(),
      timezone:         Intl.DateTimeFormat().resolvedOptions().timeZone,
      device_id:        navigator.userAgent.slice(0, 100),
      app_version:      '1.0.0',
    }

    try {
      await createRecord(record, token)
      showToast('記録しました！', 'success')
      setNote('')
      setFlags(0)
      flush(token).catch(() => {})
    } catch {
      if (!navigator.onLine) {
        await enqueue(record, token).catch(() => {})
        showToast('オフラインのためキューに保存しました', 'warning')
      } else {
        showToast('送信に失敗しました', 'danger')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container py-4" style={{ maxWidth: '540px' }}>
      <h1 className="h4 mb-4 text-success">体調記録</h1>

      {toast.show && (
        <div className={`alert alert-${toast.variant}`} role="alert">
          {toast.message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Sliders */}
        {(
          [
            { label: '疲労感', value: fatigue,     setter: setFatigue },
            { label: '気分',   value: mood,        setter: setMood },
            { label: 'やる気', value: motivation,  setter: setMotivation },
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

        {/* Flag checkboxes */}
        <div className="mb-3">
          <label className="form-label">フラグ</label>
          <div className="d-flex flex-wrap gap-3">
            {(Object.entries(FLAGS) as [keyof typeof FLAGS, number][]).map(([key, bit]) => (
              <div className="form-check" key={key}>
                <input
                  type="checkbox"
                  className="form-check-input"
                  id={`flag-${key}`}
                  checked={(flags & bit) !== 0}
                  onChange={() => toggleFlag(bit)}
                />
                <label className="form-check-label" htmlFor={`flag-${key}`}>
                  {FLAG_LABELS[key]}
                </label>
              </div>
            ))}
          </div>
        </div>

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
