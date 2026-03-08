import { useState } from 'react'
import { deleteRecord } from '../api'
import { useAuth } from '../hooks/useAuth'
import type { LatestRecord } from '../types'

interface Props {
  records: LatestRecord[]
  onDeleted: (id: string) => void
}

function formatTime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleString('ja-JP', {
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return isoStr
  }
}

function RecordSummary({ record }: { record: LatestRecord }) {
  if (record.record_type === 'event') {
    try {
      const fields = JSON.parse(record.custom_fields || '[]') as { label: string; value: unknown }[]
      const summary = fields.map((f) => `${f.label}: ${f.value}`).join(' / ')
      return <span className="text-muted small">{summary || 'イベント'}</span>
    } catch {
      return <span className="text-muted small">イベント</span>
    }
  }
  const parts: string[] = []
  if (record.fatigue_score)    parts.push(`疲労:${record.fatigue_score}`)
  if (record.mood_score)       parts.push(`気分:${record.mood_score}`)
  if (record.motivation_score) parts.push(`やる気:${record.motivation_score}`)
  return <span className="text-muted small">{parts.join(' ')}</span>
}

export default function RecordHistory({ records, onDeleted }: Props) {
  const { token } = useAuth()
  const [expanded, setExpanded]   = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const displayed = expanded ? records : records.slice(0, 5)

  const handleDelete = async (record: LatestRecord) => {
    const label = formatTime(record.recorded_at)
    if (!window.confirm(`${label} の記録を削除しますか？`)) return
    if (!token) return

    setDeleting(record.id)
    setError(null)
    try {
      await deleteRecord(record.id, token)
      onDeleted(record.id)
    } catch (e) {
      setError((e as Error).message ?? '削除に失敗しました')
    } finally {
      setDeleting(null)
    }
  }

  if (records.length === 0) return null

  return (
    <div className="mt-4">
      <h2 className="h6 text-muted mb-2">最近の記録</h2>

      {error && (
        <div className="alert alert-danger py-1 small">{error}</div>
      )}

      <ul className="list-group list-group-flush">
        {displayed.map((record) => (
          <li
            key={record.id}
            className="list-group-item d-flex justify-content-between align-items-center px-0 py-2"
          >
            <div className="d-flex flex-column">
              <span className="small fw-semibold">
                {formatTime(record.recorded_at)}
                <span className={`badge ms-2 ${record.record_type === 'event' ? 'bg-info' : 'bg-success'} bg-opacity-75`}>
                  {record.record_type === 'event' ? 'イベント' : '日次'}
                </span>
              </span>
              <RecordSummary record={record} />
            </div>
            <button
              className="btn btn-sm btn-outline-danger"
              onClick={() => handleDelete(record)}
              disabled={deleting === record.id}
              title="削除"
            >
              {deleting === record.id ? '…' : '🗑'}
            </button>
          </li>
        ))}
      </ul>

      {records.length > 5 && (
        <button
          className="btn btn-sm btn-link text-muted p-0 mt-1"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '折りたたむ' : `もっと見る（${records.length} 件中 5 件表示）`}
        </button>
      )}
    </div>
  )
}
