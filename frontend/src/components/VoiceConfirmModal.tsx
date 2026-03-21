import { useState } from 'react'
import { createPortal } from 'react-dom'
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

  // createPortal で document.body 直下に描画することで、
  // App.tsx の transform: translateX() による position: fixed の
  // 座標系ずれを防ぐ（CSS "transformed ancestor" ルールの回避）
  return createPortal(
    <div
      className="modal d-block"
      tabIndex={-1}
      role="dialog"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
        role="document"
        style={{ margin: '1rem auto', maxWidth: 'min(360px, calc(100% - 2rem))' }}
      >
        <div className="modal-content">
          <div className="modal-header py-2 px-3">
            <h6 className="modal-title mb-0">🎤 音声入力の確認</h6>
            <button
              type="button"
              className="btn-close"
              onClick={onCancel}
              aria-label="閉じる"
              disabled={submitting}
            />
          </div>

          <div className="modal-body px-3 py-2">
            {/* 元のテキスト */}
            <div className="mb-2">
              <small className="text-muted d-block mb-1">認識テキスト</small>
              <div
                className="p-2 rounded"
                style={{
                  backgroundColor: '#f8f9fa',
                  border: '1px solid #dee2e6',
                  fontSize: '0.85rem',
                  wordBreak: 'break-all',
                }}
              >
                {result.originalText}
              </div>
            </div>

            {/* 警告 */}
            {result.warnings.length > 0 && (
              <div className="alert alert-warning py-2 mb-2" style={{ fontSize: '0.8rem' }}>
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
              <ul className="list-group list-group-flush">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="list-group-item d-flex align-items-center gap-2 px-0"
                    style={{ paddingTop: '8px', paddingBottom: '8px' }}
                  >
                    <span
                      className={`badge ${item.type === 'daily' ? 'bg-success' : 'bg-info text-dark'}`}
                      style={{ fontSize: '0.65rem', flexShrink: 0 }}
                    >
                      {item.type === 'daily' ? '体調' : 'イベント'}
                    </span>
                    <span
                      className="badge bg-secondary"
                      style={{ fontSize: '0.65rem', flexShrink: 0 }}
                    >
                      {item.timeLabel}
                    </span>
                    <span style={{ fontSize: '0.85rem', flex: 1, minWidth: 0 }}>
                      {formatItemSummary(item)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      style={{ fontSize: '0.75rem', padding: '2px 10px', flexShrink: 0 }}
                      onClick={() => removeItem(item.id)}
                      disabled={submitting}
                      aria-label={`${formatItemSummary(item)}を削除`}
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="modal-footer flex-column gap-2 px-3 py-2">
            <button
              type="button"
              className="btn btn-success w-100"
              onClick={() => onConfirm(items)}
              disabled={submitting || items.length === 0}
            >
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  送信中...
                </>
              ) : (
                `この内容で登録（${items.length}件）`
              )}
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary w-100"
              onClick={onCancel}
              disabled={submitting}
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
