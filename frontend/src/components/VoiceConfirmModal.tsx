import { useState } from 'react'
import type { ParsedVoiceItem, VoiceParseResult } from '../utils/voiceParser'

interface Props {
  result: VoiceParseResult
  onConfirm: (items: ParsedVoiceItem[]) => void
  onCancel: () => void
  submitting?: boolean
}

function formatItemSummary(item: ParsedVoiceItem): string {
  if (item.type === 'daily') {
    const parts: string[] = []
    if (item.fatigue !== undefined) parts.push(`疲労:${item.fatigue}`)
    if (item.mood !== undefined) parts.push(`気分:${item.mood}`)
    if (item.motivation !== undefined) parts.push(`やる気:${item.motivation}`)
    if (item.concentration !== undefined) parts.push(`集中力:${item.concentration}`)
    return parts.join(' ')
  }
  return item.eventLabel
}

export default function VoiceConfirmModal({ result, onConfirm, onCancel, submitting }: Props) {
  const [items, setItems] = useState<ParsedVoiceItem[]>(result.items)

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleConfirm = () => {
    onConfirm(items)
  }

  return (
    <div
      className="modal d-block"
      tabIndex={-1}
      role="dialog"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">音声入力の確認</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onCancel}
              aria-label="閉じる"
              disabled={submitting}
            />
          </div>

          <div className="modal-body">
            {/* 元のテキスト */}
            <div className="mb-3">
              <small className="text-muted d-block mb-1">認識テキスト:</small>
              <div
                className="p-2 rounded"
                style={{
                  backgroundColor: '#f8f9fa',
                  border: '1px solid #dee2e6',
                  fontSize: '0.9rem',
                }}
              >
                {result.originalText}
              </div>
            </div>

            {/* 警告 */}
            {result.warnings.length > 0 && (
              <div className="alert alert-warning py-2 mb-3" style={{ fontSize: '0.85rem' }}>
                {result.warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}

            {/* 解析結果リスト */}
            {items.length === 0 ? (
              <div className="text-muted text-center py-3" style={{ fontSize: '0.9rem' }}>
                登録する項目がありません
              </div>
            ) : (
              <ul className="list-group">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="list-group-item d-flex align-items-center justify-content-between gap-2"
                    style={{ padding: '8px 12px' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="me-2" aria-hidden="true">
                        {item.type === 'daily' ? '📊' : '📌'}
                      </span>
                      <span
                        className="badge bg-secondary me-2"
                        style={{ fontSize: '0.7rem' }}
                      >
                        {item.timeLabel}
                      </span>
                      <span style={{ fontSize: '0.9rem' }}>
                        {formatItemSummary(item)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      style={{ fontSize: '0.75rem', padding: '2px 8px', flexShrink: 0 }}
                      onClick={() => removeItem(item.id)}
                      disabled={submitting}
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={onCancel}
              disabled={submitting}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="btn btn-success"
              onClick={handleConfirm}
              disabled={submitting || items.length === 0}
            >
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  送信中...
                </>
              ) : (
                'この内容で登録'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
