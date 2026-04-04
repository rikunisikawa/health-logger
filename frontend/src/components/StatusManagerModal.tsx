import { useCallback, useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import IconButton from '@mui/material/IconButton'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { createRecord, deleteRecord, getStatusRecords } from '../api'
import type { CustomFieldValue, HealthRecordInput, ItemConfig, LatestRecord } from '../types'
import type { ToastVariant } from './HealthForm'

// ── types ────────────────────────────────────────────────────────────────────

interface StatusPeriod {
  id_on: string
  id_off?: string
  item_id: string
  label: string
  startAt: Date
  endAt?: Date
}

interface EditTarget {
  period: StatusPeriod
  editType: 'start' | 'end'
}

// ── helpers ──────────────────────────────────────────────────────────────────

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

function toYMD(date: Date): string {
  return date.toLocaleDateString('sv')  // "YYYY-MM-DD"
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

function parseStatusPeriods(records: LatestRecord[]): StatusPeriod[] {
  const sorted = [...records].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  )

  const open: Record<string, StatusPeriod> = {}
  const periods: StatusPeriod[] = []

  for (const rec of sorted) {
    let fields: CustomFieldValue[] = []
    try { fields = JSON.parse(rec.custom_fields) } catch { continue }

    for (const field of fields) {
      const isOn = field.value === true || field.value === 'true'
      const isOff = field.value === false || field.value === 'false'

      if (isOn) {
        open[field.item_id] = {
          id_on: rec.id,
          item_id: field.item_id,
          label: String(field.label),
          startAt: new Date(rec.recorded_at),
        }
      } else if (isOff && open[field.item_id]) {
        periods.push({ ...open[field.item_id], id_off: rec.id, endAt: new Date(rec.recorded_at) })
        delete open[field.item_id]
      }
    }
  }

  for (const p of Object.values(open)) periods.push(p)
  return periods
}

// ── Gantt chart ───────────────────────────────────────────────────────────────

const AXIS_HOURS = [0, 4, 8, 12, 16, 20, 24]

function timeToPercent(dt: Date, axisStartH: number, axisEndH: number): number {
  const minutes = dt.getHours() * 60 + dt.getMinutes()
  return Math.max(0, Math.min(100, (minutes - axisStartH * 60) / ((axisEndH - axisStartH) * 60) * 100))
}

interface GanttRowProps {
  label: string
  periods: StatusPeriod[]
  dateStr: string       // "YYYY-MM-DD"
  axisStartH: number
  axisEndH: number
  onBarClick: (p: StatusPeriod) => void
}

function GanttRow({ label, periods, dateStr, axisStartH, axisEndH, onBarClick }: GanttRowProps) {
  const now = new Date()

  const rowPeriods = periods.filter((p) => {
    const startDate = toYMD(p.startAt)
    const endDate = p.endAt ? toYMD(p.endAt) : toYMD(now)
    return startDate <= dateStr && endDate >= dateStr
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
      <div style={{ width: 72, fontSize: '0.72rem', flexShrink: 0, color: '#495057' }}>{label}</div>
      <div
        style={{
          flex: 1,
          position: 'relative',
          height: 24,
          backgroundColor: '#f1f3f5',
          borderRadius: 4,
        }}
      >
        {rowPeriods.map((period) => {
          const effectiveEnd = period.endAt ?? now
          const isActive = !period.endAt

          // Clamp times to the selected date and axis range
          const dayStart = new Date(`${dateStr}T00:00:00`)
          const dayEnd = new Date(`${dateStr}T23:59:59`)
          const clampedStart = new Date(Math.max(period.startAt.getTime(), dayStart.getTime()))
          const clampedEnd = new Date(Math.min(effectiveEnd.getTime(), dayEnd.getTime()))

          const leftPct = timeToPercent(clampedStart, axisStartH, axisEndH)
          const rightPct = timeToPercent(clampedEnd, axisStartH, axisEndH)
          const widthPct = Math.max(0, rightPct - leftPct)
          if (widthPct <= 0) return null

          return (
            <div
              key={period.id_on}
              onClick={() => onBarClick(period)}
              title={`${period.startAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${period.endAt ? period.endAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '継続中'}`}
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                height: '100%',
                backgroundColor: isActive ? '#ffc107' : '#fd7e14',
                borderRadius: 4,
                cursor: 'pointer',
                minWidth: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {isActive && widthPct > 8 && (
                <span style={{ fontSize: '0.55rem', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  継続中
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface GanttChartProps {
  periods: StatusPeriod[]
  statusLabels: { item_id: string; label: string }[]
  dateStr: string
  axisStartH: number
  axisEndH: number
  onBarClick: (p: StatusPeriod) => void
}

function GanttChart({ periods, statusLabels, dateStr, axisStartH, axisEndH, onBarClick }: GanttChartProps) {
  const visibleHours = AXIS_HOURS.filter((h) => h >= axisStartH && h <= axisEndH)

  return (
    <div>
      {/* Time axis */}
      <div style={{ display: 'flex', paddingLeft: 72, marginBottom: 4 }}>
        {visibleHours.map((h, i) => (
          <div
            key={h}
            style={{
              flex: i < visibleHours.length - 1 ? 1 : 0,
              fontSize: '0.65rem',
              color: '#868e96',
            }}
          >
            {`${String(h).padStart(2, '0')}:00`}
          </div>
        ))}
      </div>

      {/* Grid lines background */}
      <div style={{ position: 'relative' }}>
        {statusLabels.map(({ item_id, label }) => (
          <GanttRow
            key={item_id}
            label={label}
            periods={periods.filter((p) => p.item_id === item_id)}
            dateStr={dateStr}
            axisStartH={axisStartH}
            axisEndH={axisEndH}
            onBarClick={onBarClick}
          />
        ))}
      </div>
    </div>
  )
}

// ── edit modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  target: EditTarget
  token: string
  onSaved: () => void
  onClose: () => void
  onToast: (message: string, variant: ToastVariant) => void
}

function EditModal({ target, token, onSaved, onClose, onToast }: EditModalProps) {
  const { period, editType } = target
  const isEnd = editType === 'end'
  const defaultDt = isEnd
    ? (period.endAt ? toDatetimeLocal(period.endAt) : toDatetimeLocal(new Date()))
    : toDatetimeLocal(period.startAt)
  const [value, setValue] = useState(defaultDt)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const newRecordedAt = new Date(value).toISOString()
    const base: Omit<HealthRecordInput, 'custom_fields'> = {
      record_type: 'status',
      flags: 0,
      note: '',
      recorded_at: newRecordedAt,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      device_id: navigator.userAgent.slice(0, 100),
      app_version: '1.0.0',
    }
    const fieldValue = isEnd ? false : true
    const newRecord: HealthRecordInput = {
      ...base,
      custom_fields: [
        { item_id: period.item_id, label: period.label, type: 'checkbox', value: fieldValue },
      ],
    }

    try {
      // Delete old record
      const idToDelete = isEnd ? period.id_off : period.id_on
      if (idToDelete) await deleteRecord(idToDelete, token)

      // Create new record with corrected time
      await createRecord(newRecord, token)

      onToast('時刻を修正しました', 'success')
      onSaved()
    } catch {
      onToast('保存に失敗しました', 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem' }}>
        {period.label} — {isEnd ? '終了時刻' : '開始時刻'}の修正
        <IconButton onClick={onClose} size="small" sx={{ position: 'absolute', right: 8, top: 8 }}>
          ×
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {isEnd ? '終了' : '開始'}時刻を変更してください
        </Typography>
        <input
          type="datetime-local"
          className="form-control"
          value={value}
          max={toDatetimeLocal(new Date())}
          onChange={(e) => setValue(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <button className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={saving}>
          キャンセル
        </button>
        <button className="btn btn-warning btn-sm" onClick={handleSave} disabled={saving || !value}>
          {saving ? <span className="spinner-border spinner-border-sm" /> : '保存'}
        </button>
      </DialogActions>
    </Dialog>
  )
}

// ── period action modal (choose start/end) ────────────────────────────────────

interface PeriodActionModalProps {
  period: StatusPeriod
  onEdit: (editType: 'start' | 'end') => void
  onClose: () => void
}

function PeriodActionModal({ period, onEdit, onClose }: PeriodActionModalProps) {
  const fmt = (d: Date) =>
    d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem' }}>
        {period.label}
        <IconButton onClick={onClose} size="small" sx={{ position: 'absolute', right: 8, top: 8 }}>
          ×
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: '0.85rem', color: '#495057' }}>
            <span>開始: </span>
            <strong>{fmt(period.startAt)}</strong>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#495057' }}>
            <span>終了: </span>
            <strong>{period.endAt ? fmt(period.endAt) : '（継続中）'}</strong>
          </div>
        </div>
      </DialogContent>
      <DialogActions sx={{ flexDirection: 'column', gap: 1, px: 2, pb: 2 }}>
        <button
          className="btn btn-outline-warning btn-sm w-100"
          onClick={() => onEdit('start')}
        >
          開始時刻を修正
        </button>
        <button
          className="btn btn-outline-secondary btn-sm w-100"
          onClick={() => onEdit('end')}
        >
          {period.endAt ? '終了時刻を修正' : '終了時刻を設定（OFF忘れ）'}
        </button>
      </DialogActions>
    </Dialog>
  )
}

// ── main component ────────────────────────────────────────────────────────────

const BUILTIN_STATUS_ITEMS = [
  { item_id: 'headache',    label: '頭痛' },
  { item_id: 'stomachache', label: '腹痛' },
  { item_id: 'sleepy',      label: '眠い' },
  { item_id: 'working',     label: '勤務中' },
]

type ViewType = '12h' | '24h' | '1week'

interface Props {
  open: boolean
  onClose: () => void
  token: string
  statusItems: ItemConfig[]
  onToast: (message: string, variant: ToastVariant) => void
}

export default function StatusManagerModal({ open, onClose, token, statusItems, onToast }: Props) {
  const [view, setView] = useState<ViewType>('12h')
  const [records, setRecords] = useState<LatestRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [weekTab, setWeekTab] = useState(0)
  const [selectedPeriod, setSelectedPeriod] = useState<StatusPeriod | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)

  const allStatusLabels = [
    ...BUILTIN_STATUS_ITEMS,
    ...statusItems.map((s) => ({ item_id: s.item_id, label: s.label })),
  ]

  const today = toYMD(new Date())

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const dateFrom = view === '1week' ? toYMD(addDays(new Date(), -7)) : today
      const { records: recs } = await getStatusRecords(token, dateFrom, today)
      setRecords(recs)
    } catch {
      onToast('ステータス履歴の取得に失敗しました', 'danger')
    } finally {
      setLoading(false)
    }
  }, [token, view, today, onToast])

  useEffect(() => {
    if (open) fetchRecords()
  }, [open, fetchRecords])

  const periods = parseStatusPeriods(records)

  const axisStartH = view === '12h' ? 8 : 0
  const axisEndH = 24

  // Last 7 days for 1週間 view
  const last7Days = Array.from({ length: 7 }, (_, i) => toYMD(addDays(new Date(), -6 + i)))

  const handleBarClick = (p: StatusPeriod) => setSelectedPeriod(p)

  const handleEditType = (editType: 'start' | 'end') => {
    if (!selectedPeriod) return
    setEditTarget({ period: selectedPeriod, editType })
    setSelectedPeriod(null)
  }

  const handleSaved = () => {
    setEditTarget(null)
    fetchRecords()
    onToast('ガントチャートを更新しました', 'success')
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          ステータスの管理
          <IconButton onClick={onClose} size="small" sx={{ position: 'absolute', right: 8, top: 8 }}>
            ×
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 0 }}>
          {/* View toggle */}
          <div className="btn-group mb-3" role="group">
            {(['12h', '24h', '1week'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`btn btn-sm ${view === v ? 'btn-warning' : 'btn-outline-secondary'}`}
                onClick={() => setView(v)}
              >
                {v === '12h' ? '12h（08-24）' : v === '24h' ? '24h（00-24）' : '1週間'}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-4">
              <span className="spinner-border spinner-border-sm text-warning" />
              <span className="ms-2 text-muted" style={{ fontSize: '0.85rem' }}>読み込み中...</span>
            </div>
          ) : view !== '1week' ? (
            /* 12h / 24h view */
            <GanttChart
              periods={periods}
              statusLabels={allStatusLabels}
              dateStr={today}
              axisStartH={axisStartH}
              axisEndH={axisEndH}
              onBarClick={handleBarClick}
            />
          ) : (
            /* 1週間 view */
            <>
              <Tabs
                value={weekTab}
                onChange={(_, v: number) => setWeekTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ mb: 2, minHeight: 36 }}
              >
                {allStatusLabels.map(({ label }, i) => (
                  <Tab key={i} label={label} sx={{ minHeight: 36, fontSize: '0.8rem', py: 0.5 }} />
                ))}
              </Tabs>

              {allStatusLabels[weekTab] && (
                <div>
                  {/* Time axis */}
                  <div style={{ display: 'flex', paddingLeft: 72, marginBottom: 4 }}>
                    {AXIS_HOURS.filter((h) => h >= 8).map((h, i, arr) => (
                      <div
                        key={h}
                        style={{ flex: i < arr.length - 1 ? 1 : 0, fontSize: '0.65rem', color: '#868e96' }}
                      >
                        {`${String(h).padStart(2, '0')}:00`}
                      </div>
                    ))}
                  </div>
                  {last7Days.map((dateStr) => (
                    <GanttRow
                      key={dateStr}
                      label={dateStr.slice(5)}  // "MM-DD"
                      periods={periods.filter((p) => p.item_id === allStatusLabels[weekTab].item_id)}
                      dateStr={dateStr}
                      axisStartH={8}
                      axisEndH={24}
                      onBarClick={handleBarClick}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {!loading && periods.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              この期間のステータス記録はありません。
            </Typography>
          )}
        </DialogContent>
      </Dialog>

      {selectedPeriod && !editTarget && (
        <PeriodActionModal
          period={selectedPeriod}
          onEdit={handleEditType}
          onClose={() => setSelectedPeriod(null)}
        />
      )}

      {editTarget && (
        <EditModal
          target={editTarget}
          token={token}
          onSaved={handleSaved}
          onClose={() => setEditTarget(null)}
          onToast={onToast}
        />
      )}
    </>
  )
}
