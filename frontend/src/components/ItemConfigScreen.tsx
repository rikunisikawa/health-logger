import { useState } from 'react'
import type { ItemConfig, ItemMode, ItemType } from '../types'

const ICON_OPTIONS = [
  '😴', '💤', '🤕', '🤢', '😣', '🤧', '💊', '🌡️',
  '🏃', '🚶', '🧘', '🏋️', '🚴', '🤸', '⚽', '🏊',
  '🍺', '🍷', '🍸', '🍻', '☕', '🧃', '💧', '🍵',
  '😊', '😔', '😤', '😰', '💪', '🧠', '❤️', '💔',
  '🌙', '☀️', '🌿', '⚡', '🎯', '📝', '⏰', '🔥',
  '🍎', '🥗', '🥦', '🍣', '🍜', '🍕', '🎂', '🍫',
]

const TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: 'checkbox', label: 'チェックボックス' },
  { value: 'number',   label: '数値入力' },
  { value: 'slider',   label: 'スライダー (0-100)' },
  { value: 'text',     label: 'テキスト' },
]

const MODE_OPTIONS: { value: ItemMode; label: string }[] = [
  { value: 'status', label: 'ステータス（状態管理）' },
  { value: 'event',  label: 'クイックイベント（即時記録）' },
  { value: 'form',   label: '日次フォームに追加' },
]

interface EditState {
  item_id: string
  label:   string
  type:    ItemType
  mode:    ItemMode
  icon:    string
  min:     string
  max:     string
  unit:    string
}

const emptyEdit = (): EditState => ({
  item_id: crypto.randomUUID(),
  label:   '',
  type:    'checkbox',
  mode:    'event',
  icon:    '',
  min:     '',
  max:     '',
  unit:    '',
})

interface Props {
  configs: ItemConfig[]
  onSave:  (configs: ItemConfig[]) => Promise<void>
  onClose: () => void
}

export default function ItemConfigScreen({ configs, onSave, onClose }: Props) {
  const [items, setItems]     = useState<ItemConfig[]>(configs)
  const [edit, setEdit]       = useState<EditState | null>(null)
  const [saving, setSaving]   = useState(false)

  const startAdd = () => setEdit(emptyEdit())

  const startEdit = (item: ItemConfig) =>
    setEdit({
      item_id: item.item_id,
      label:   item.label,
      type:    item.type,
      mode:    item.mode,
      icon:    item.icon ?? '',
      min:     item.min != null ? String(item.min) : '',
      max:     item.max != null ? String(item.max) : '',
      unit:    item.unit ?? '',
    })

  const commitEdit = () => {
    if (!edit || !edit.label.trim()) return
    const updated: ItemConfig = {
      item_id: edit.item_id,
      label:   edit.label.trim(),
      type:    edit.type,
      mode:    edit.mode,
      order:   0,
      ...(edit.icon !== '' && { icon: edit.icon }),
      ...(edit.min !== '' && { min: Number(edit.min) }),
      ...(edit.max !== '' && { max: Number(edit.max) }),
      ...(edit.unit !== '' && { unit: edit.unit }),
    }
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.item_id === edit.item_id)
      const next = idx >= 0 ? prev.map((i, j) => (j === idx ? updated : i)) : [...prev, updated]
      return next.map((item, i) => ({ ...item, order: i }))
    })
    setEdit(null)
  }

  const deleteItem = (id: string) =>
    setItems((prev) =>
      prev.filter((i) => i.item_id !== id).map((item, i) => ({ ...item, order: i })),
    )

  const move = (id: string, dir: -1 | 1) =>
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.item_id === id)
      if (idx + dir < 0 || idx + dir >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[idx + dir]] = [next[idx + dir], next[idx]]
      return next.map((item, i) => ({ ...item, order: i }))
    })

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(items)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const showMinMax = edit?.type === 'slider' || edit?.type === 'number'

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 bg-white overflow-auto"
      style={{ zIndex: 1050 }}
    >
      <div className="container py-3" style={{ maxWidth: '540px' }}>
        {/* Header */}
        <div className="d-flex align-items-center mb-4">
          <button className="btn btn-link p-0 me-3 text-dark" onClick={onClose}>
            ←
          </button>
          <h1 className="h5 mb-0 fw-bold">記録項目の設定</h1>
        </div>

        {/* Item list */}
        {items.length === 0 && !edit && (
          <p className="text-muted text-center py-4">項目がありません</p>
        )}
        {items.map((item, idx) => (
          <div key={item.item_id} className="card mb-2">
            <div className="card-body py-2 d-flex align-items-center gap-2">
              <div className="flex-grow-1">
                <div className="fw-semibold">
                  {item.icon && <span className="me-2" style={{ fontSize: '1.1rem' }}>{item.icon}</span>}
                  {item.label}
                </div>
                <small className="text-muted">
                  {TYPE_OPTIONS.find((t) => t.value === item.type)?.label}
                  {' · '}
                  {item.mode === 'event' ? 'クイックイベント' : '日次フォーム'}
                  {item.unit && ` · ${item.unit}`}
                </small>
              </div>
              <div className="d-flex gap-1">
                <button
                  className="btn btn-sm btn-outline-secondary px-1 py-0"
                  onClick={() => move(item.item_id, -1)}
                  disabled={idx === 0}
                >
                  ↑
                </button>
                <button
                  className="btn btn-sm btn-outline-secondary px-1 py-0"
                  onClick={() => move(item.item_id, 1)}
                  disabled={idx === items.length - 1}
                >
                  ↓
                </button>
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => startEdit(item)}
                >
                  編集
                </button>
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => deleteItem(item.item_id)}
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Edit form */}
        {edit && (
          <div className="card mb-3 border-primary">
            <div className="card-body">
              <div className="mb-2">
                <label className="form-label fw-semibold">項目名</label>
                <input
                  className="form-control"
                  value={edit.label}
                  onChange={(e) => setEdit({ ...edit, label: e.target.value })}
                  placeholder="例: 水分補給, 筋トレ"
                  autoFocus
                />
              </div>
              <div className="mb-2">
                <label className="form-label fw-semibold">アイコン（任意）</label>
                <div
                  className="d-flex flex-wrap gap-1 p-2 border rounded"
                  style={{ maxHeight: '120px', overflowY: 'auto' }}
                >
                  <button
                    type="button"
                    onClick={() => setEdit({ ...edit, icon: '' })}
                    style={{
                      width: '36px',
                      height: '36px',
                      border: `2px solid ${edit.icon === '' ? '#0d6efd' : '#dee2e6'}`,
                      borderRadius: '6px',
                      background: edit.icon === '' ? '#cfe2ff' : '#f8f9fa',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                      color: '#6c757d',
                    }}
                  >
                    なし
                  </button>
                  {ICON_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setEdit({ ...edit, icon: emoji })}
                      style={{
                        width: '36px',
                        height: '36px',
                        border: `2px solid ${edit.icon === emoji ? '#0d6efd' : '#dee2e6'}`,
                        borderRadius: '6px',
                        background: edit.icon === emoji ? '#cfe2ff' : '#f8f9fa',
                        cursor: 'pointer',
                        fontSize: '1.2rem',
                        lineHeight: 1,
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-2">
                <label className="form-label fw-semibold">入力タイプ</label>
                <select
                  className="form-select"
                  value={edit.type}
                  onChange={(e) => setEdit({ ...edit, type: e.target.value as ItemType })}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="mb-2">
                <label className="form-label fw-semibold">記録モード</label>
                <select
                  className="form-select"
                  value={edit.mode}
                  onChange={(e) => setEdit({ ...edit, mode: e.target.value as ItemMode })}
                >
                  {MODE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {showMinMax && (
                <div className="row mb-2">
                  <div className="col">
                    <label className="form-label">最小値</label>
                    <input
                      className="form-control"
                      type="number"
                      value={edit.min}
                      onChange={(e) => setEdit({ ...edit, min: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="col">
                    <label className="form-label">最大値</label>
                    <input
                      className="form-control"
                      type="number"
                      value={edit.max}
                      onChange={(e) => setEdit({ ...edit, max: e.target.value })}
                      placeholder="100"
                    />
                  </div>
                  <div className="col">
                    <label className="form-label">単位</label>
                    <input
                      className="form-control"
                      value={edit.unit}
                      onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                      placeholder="ml, kg..."
                    />
                  </div>
                </div>
              )}
              <div className="d-flex gap-2">
                <button
                  className="btn btn-primary"
                  onClick={commitEdit}
                  disabled={!edit.label.trim()}
                >
                  追加
                </button>
                <button className="btn btn-outline-secondary" onClick={() => setEdit(null)}>
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}

        {!edit && (
          <button className="btn btn-outline-success w-100 mb-4" onClick={startAdd}>
            ＋ 項目を追加
          </button>
        )}

        <button
          className="btn btn-success w-100"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  )
}
