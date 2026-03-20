import { useState } from 'react'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { deleteRecord } from '../api'
import { useAuth } from '../hooks/useAuth'
import type { LatestRecord } from '../types'
import { formatTime } from '../utils/time'
import { buildSummaryParts } from '../utils/recordSummary'

interface Props {
  records: LatestRecord[]
  onDeleted: (id: string) => void
}

function RecordSummary({ record }: { record: LatestRecord }) {
  const parts = buildSummaryParts(record)
  if (record.record_type === 'event' || record.record_type === 'status') {
    return <span className="text-muted small">{parts.join(' / ') || record.record_type}</span>
  }
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
    <div className="mt-2">
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 600 }}>
        最近の記録
      </Typography>

      {error && (
        <div className="alert alert-danger py-1 small">{error}</div>
      )}

      <div className="d-flex flex-column gap-2">
        {displayed.map((record) => (
          <Card
            key={record.id}
            variant="outlined"
            sx={{ borderRadius: 2 }}
          >
            <CardContent
              sx={{
                py: '10px !important',
                px: 2,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div className="d-flex flex-column">
                <span className="small fw-semibold">
                  {formatTime(record.recorded_at)}
                  <span className={`badge ms-2 ${record.record_type === 'event' ? 'bg-info' : 'bg-success'} bg-opacity-75`}>
                    {record.record_type === 'event' ? 'イベント' : record.record_type === 'status' ? 'ステータス' : '日次'}
                  </span>
                </span>
                <RecordSummary record={record} />
              </div>
              <button
                className="btn btn-sm btn-outline-danger"
                onClick={() => handleDelete(record)}
                disabled={deleting === record.id}
                title="削除"
                style={{ flexShrink: 0 }}
              >
                {deleting === record.id ? '…' : '🗑'}
              </button>
            </CardContent>
          </Card>
        ))}
      </div>

      {records.length > 5 && (
        <button
          className="btn btn-sm btn-link text-muted p-0 mt-2"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '折りたたむ' : `もっと見る（${records.length} 件中 5 件表示）`}
        </button>
      )}
    </div>
  )
}
