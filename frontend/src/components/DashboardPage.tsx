import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getEnvData, getLatest } from '../api'
import { useAuth } from '../hooks/useAuth'
import type { EnvDataRecord, LatestRecord } from '../types'
import { parseUtc, toLocalDateStr, toLocalTimeStr, toLocalMinutes } from '../utils/time'

type MetricKey = 'fatigue' | 'mood' | 'motivation' | 'concentration'
type Tab = 'trend' | 'intraday' | 'events' | 'env' | 'correlation'
type EventsView = 'timeline' | 'trend'
type TrendAggMode = 'daily' | 'weekday' | 'timeband'

const ALL_METRICS: MetricKey[] = ['fatigue', 'mood', 'motivation', 'concentration']

const METRIC_CONFIG: Record<MetricKey, { name: string; stroke: string; btnVariant: string }> = {
  fatigue:       { name: '疲労度', stroke: '#dc3545', btnVariant: 'danger' },
  mood:          { name: '気分',   stroke: '#fd7e14', btnVariant: 'warning' },
  motivation:    { name: 'やる気', stroke: '#198754', btnVariant: 'success' },
  concentration: { name: '集中力', stroke: '#0d6efd', btnVariant: 'primary' },
}

interface DailyAvg {
  date: string
  fatigue: number | null
  mood: number | null
  motivation: number | null
  concentration: number | null
}

interface IntradayPoint {
  time: string
  minutes: number
  fatigue: number | null
  mood: number | null
  motivation: number | null
  concentration: number | null
}

interface EventPoint {
  x: number
  y: number
  label: string
  timeStr: string
  valueStr: string
}

interface StatusPeriod {
  label: string
  startMinutes: number
  endMinutes: number
}

interface EventTooltipProps {
  payload?: { payload: EventPoint }[]
}

interface RegressionResult {
  slope: number
  intercept: number
  r: number
  n: number
}

interface CorrPoint {
  x: number
  y: number
}

interface RegressionLinePoint {
  x: number
  y: number
}

function EventTooltip({ payload }: EventTooltipProps) {
  if (!payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-white border rounded p-2 shadow-sm" style={{ fontSize: 12 }}>
      <div className="fw-semibold">{p.label}</div>
      <div>
        {p.timeStr} — {p.valueStr}
      </div>
    </div>
  )
}

function linearRegression(points: CorrPoint[]): RegressionResult | null {
  const n = points.length
  if (n < 3) return null

  const sumX = points.reduce((acc, p) => acc + p.x, 0)
  const sumY = points.reduce((acc, p) => acc + p.y, 0)
  const meanX = sumX / n
  const meanY = sumY / n

  let ssXX = 0
  let ssXY = 0
  let ssYY = 0
  for (const p of points) {
    const dx = p.x - meanX
    const dy = p.y - meanY
    ssXX += dx * dx
    ssXY += dx * dy
    ssYY += dy * dy
  }

  if (ssXX === 0 || ssYY === 0) return null

  const slope = ssXY / ssXX
  const intercept = meanY - slope * meanX
  const r = ssXY / Math.sqrt(ssXX * ssYY)

  return { slope, intercept, r, n }
}

function interpretCorrelation(r: number): string {
  const abs = Math.abs(r)
  const dir = r >= 0 ? '正' : '負'
  if (abs >= 0.7) return `強い${dir}の相関`
  if (abs >= 0.4) return `中程度の${dir}の相関`
  if (abs >= 0.2) return `弱い${dir}の相関`
  return 'ほぼ相関なし'
}

const EVENT_COLORS = ['#6f42c1', '#fd7e14', '#20c997', '#ffc107', '#0dcaf0', '#d63384', '#6610f2', '#0d6efd']
const STATUS_COLORS = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#dda0dd']

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

const minuteTick = (v: number) =>
  `${Math.floor(v / 60).toString().padStart(2, '0')}:${(v % 60).toString().padStart(2, '0')}`

interface MetricSelectorProps {
  visibleMetrics: Set<MetricKey>
  onChange: (next: Set<MetricKey>) => void
}

function MetricSelector({ visibleMetrics, onChange }: MetricSelectorProps) {
  const toggle = (key: MetricKey) => {
    const next = new Set(visibleMetrics)
    if (next.has(key)) {
      if (next.size === 1) return // 最低1つは残す
      next.delete(key)
    } else {
      next.add(key)
    }
    onChange(next)
  }

  return (
    <div className="d-flex flex-wrap gap-2 mb-3">
      {ALL_METRICS.map((key) => {
        const cfg = METRIC_CONFIG[key]
        const active = visibleMetrics.has(key)
        return (
          <button
            key={key}
            className={`btn btn-sm ${active ? `btn-${cfg.btnVariant}` : 'btn-outline-secondary'}`}
            onClick={() => toggle(key)}
          >
            {cfg.name}
          </button>
        )
      })}
    </div>
  )
}

interface Props {
  onBack: () => void
}

export default function DashboardPage({ onBack }: Props) {
  const { token } = useAuth()
  const [records, setRecords] = useState<LatestRecord[]>([])
  const [envRecords, setEnvRecords] = useState<EnvDataRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('trend')
  const [eventsView, setEventsView] = useState<EventsView>('timeline')
  const [trendDays, setTrendDays] = useState(30)
  const [trendAggMode, setTrendAggMode] = useState<TrendAggMode>('daily')
  const [eventTrendDays, setEventTrendDays] = useState(30)
  const [envDays, setEnvDays] = useState(14)
  const [corrDays, setCorrDays] = useState(90)
  const [corrXAxis, setCorrXAxis] = useState<string>('pressure_hpa')
  const [corrYAxis, setCorrYAxis] = useState<MetricKey>('fatigue')
  const [visibleMetrics, setVisibleMetrics] = useState<Set<MetricKey>>(new Set(ALL_METRICS))
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateStr(new Date()))

  useEffect(() => {
    if (!token) return
    setLoading(true)
    getLatest(token, 500)
      .then((res) => setRecords(res.records))
      .catch((e: unknown) => setFetchError((e as Error).message ?? '取得に失敗しました'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!token) return
    const days = Math.max(envDays, corrDays)
    getEnvData(token, days).then((res) => setEnvRecords(res.records)).catch(() => {})
  }, [token, envDays, corrDays])

  // ── 長期トレンド（日次）─────────────────────────────────────────────
  const trendData = useMemo((): DailyAvg[] => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - trendDays)

    const byDate: Record<string, { fatigue: number[]; mood: number[]; motivation: number[]; concentration: number[] }> = {}
    for (const r of records) {
      if (r.record_type !== 'daily') continue
      const d = parseUtc(r.recorded_at)
      if (d < cutoff) continue
      const key = toLocalDateStr(d)
      if (!byDate[key]) byDate[key] = { fatigue: [], mood: [], motivation: [], concentration: [] }
      const f = parseFloat(r.fatigue_score)
      const m = parseFloat(r.mood_score)
      const mv = parseFloat(r.motivation_score)
      const c = parseFloat(r.concentration_score)
      if (!isNaN(f)) byDate[key].fatigue.push(f)
      if (!isNaN(m)) byDate[key].mood.push(m)
      if (!isNaN(mv)) byDate[key].motivation.push(mv)
      if (!isNaN(c)) byDate[key].concentration.push(c)
    }

    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { fatigue, mood, motivation, concentration }]) => {
        const avg = (arr: number[]) =>
          arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null
        return {
          date: date.slice(5), // MM-DD
          fatigue: avg(fatigue),
          mood: avg(mood),
          motivation: avg(motivation),
          concentration: avg(concentration),
        }
      })
  }, [records, trendDays])

  // ── 曜日別集計 ────────────────────────────────────────────────────────
  const weekdayData = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - trendDays)

    const byWeekday: Record<number, { fatigue: number[]; mood: number[]; motivation: number[]; concentration: number[] }> = {}
    for (let i = 0; i < 7; i++) {
      byWeekday[i] = { fatigue: [], mood: [], motivation: [], concentration: [] }
    }

    for (const r of records) {
      if (r.record_type !== 'daily') continue
      const d = parseUtc(r.recorded_at)
      if (d < cutoff) continue
      // JS: 0=日, 1=月, ..., 6=土 → 月始まりに変換 (月=0, ..., 日=6)
      const jsDay = d.getDay()
      const monFirst = jsDay === 0 ? 6 : jsDay - 1
      const f = parseFloat(r.fatigue_score)
      const m = parseFloat(r.mood_score)
      const mv = parseFloat(r.motivation_score)
      const c = parseFloat(r.concentration_score)
      if (!isNaN(f)) byWeekday[monFirst].fatigue.push(f)
      if (!isNaN(m)) byWeekday[monFirst].mood.push(m)
      if (!isNaN(mv)) byWeekday[monFirst].motivation.push(mv)
      if (!isNaN(c)) byWeekday[monFirst].concentration.push(c)
    }

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    return WEEKDAY_LABELS.map((label, i) => ({
      label,
      fatigue: avg(byWeekday[i].fatigue),
      mood: avg(byWeekday[i].mood),
      motivation: avg(byWeekday[i].motivation),
      concentration: avg(byWeekday[i].concentration),
    }))
  }, [records, trendDays])

  // ── 時間帯別集計 ──────────────────────────────────────────────────────
  const timebandData = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - trendDays)

    const bands: Record<string, { fatigue: number[]; mood: number[]; motivation: number[]; concentration: number[] }> = {
      '朝': { fatigue: [], mood: [], motivation: [], concentration: [] },
      '昼': { fatigue: [], mood: [], motivation: [], concentration: [] },
      '夜': { fatigue: [], mood: [], motivation: [], concentration: [] },
    }

    const getBand = (hour: number): string => {
      if (hour >= 5 && hour < 12) return '朝'
      if (hour >= 12 && hour < 18) return '昼'
      return '夜'
    }

    for (const r of records) {
      if (r.record_type !== 'daily') continue
      const d = parseUtc(r.recorded_at)
      if (d < cutoff) continue
      const hour = d.getHours()
      const band = getBand(hour)
      const f = parseFloat(r.fatigue_score)
      const m = parseFloat(r.mood_score)
      const mv = parseFloat(r.motivation_score)
      const c = parseFloat(r.concentration_score)
      if (!isNaN(f)) bands[band].fatigue.push(f)
      if (!isNaN(m)) bands[band].mood.push(m)
      if (!isNaN(mv)) bands[band].motivation.push(mv)
      if (!isNaN(c)) bands[band].concentration.push(c)
    }

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    return (['朝', '昼', '夜'] as const).map((label) => ({
      label,
      fatigue: avg(bands[label].fatigue),
      mood: avg(bands[label].mood),
      motivation: avg(bands[label].motivation),
      concentration: avg(bands[label].concentration),
    }))
  }, [records, trendDays])

  // ── 日内変動 ─────────────────────────────────────────────────────────
  const intradayData = useMemo((): IntradayPoint[] => {
    return records
      .filter((r) => r.record_type === 'daily' && toLocalDateStr(parseUtc(r.recorded_at)) === selectedDate)
      .map((r) => {
        const d = parseUtc(r.recorded_at)
        const f = parseFloat(r.fatigue_score)
        const m = parseFloat(r.mood_score)
        const mv = parseFloat(r.motivation_score)
        const c = parseFloat(r.concentration_score)
        return {
          time: toLocalTimeStr(d),
          minutes: toLocalMinutes(d),
          fatigue: isNaN(f) ? null : f,
          mood: isNaN(m) ? null : m,
          motivation: isNaN(mv) ? null : mv,
          concentration: isNaN(c) ? null : c,
        }
      })
      .sort((a, b) => a.minutes - b.minutes)
  }, [records, selectedDate])

  // ── ステータス期間（日内変動用）───────────────────────────────────────
  const { intradayStatusPeriods, intradayStatusLabels } = useMemo((): {
    intradayStatusPeriods: StatusPeriod[]
    intradayStatusLabels: string[]
  } => {
    const dayRecords = records
      .filter((r) => r.record_type === 'status' && toLocalDateStr(parseUtc(r.recorded_at)) === selectedDate)
      .sort((a, b) => parseUtc(a.recorded_at).getTime() - parseUtc(b.recorded_at).getTime())

    const statusByLabel: Record<string, { minutes: number; isStart: boolean }[]> = {}
    for (const r of dayRecords) {
      const minutes = toLocalMinutes(parseUtc(r.recorded_at))
      try {
        const fields = JSON.parse(r.custom_fields || '[]') as { label: string; type: string; value: unknown }[]
        for (const f of fields) {
          if (f.type !== 'checkbox' || typeof f.value !== 'boolean') continue
          if (!statusByLabel[f.label]) statusByLabel[f.label] = []
          statusByLabel[f.label].push({ minutes, isStart: f.value as boolean })
        }
      } catch {
        // skip malformed
      }
    }

    const periods: StatusPeriod[] = []
    const labels: string[] = []
    for (const label of Object.keys(statusByLabel)) {
      labels.push(label)
      let start: number | null = null
      for (const ev of statusByLabel[label]) {
        if (ev.isStart && start === null) {
          start = ev.minutes
        } else if (!ev.isStart && start !== null) {
          periods.push({ label, startMinutes: start, endMinutes: ev.minutes })
          start = null
        }
      }
      if (start !== null) {
        periods.push({ label, startMinutes: start, endMinutes: 1440 })
      }
    }

    return { intradayStatusPeriods: periods, intradayStatusLabels: labels }
  }, [records, selectedDate])

  // ── イベントタイムライン ──────────────────────────────────────────────
  const { eventPoints, eventCategories } = useMemo(() => {
    const cats: string[] = []
    const points: EventPoint[] = []

    const eventRecords = records.filter(
      (r) => r.record_type === 'event' && toLocalDateStr(parseUtc(r.recorded_at)) === selectedDate,
    )

    for (const r of eventRecords) {
      const d = parseUtc(r.recorded_at)
      const mins = toLocalMinutes(d)
      const timeStr = toLocalTimeStr(d)

      try {
        const fields = JSON.parse(r.custom_fields || '[]') as { label: string; value: unknown }[]
        for (const f of fields) {
          const lbl = f.label
          if (!cats.includes(lbl)) cats.push(lbl)
          points.push({ x: mins, y: cats.indexOf(lbl), label: lbl, timeStr, valueStr: String(f.value) })
        }
      } catch {
        // skip malformed records
      }
    }

    return { eventPoints: points, eventCategories: cats }
  }, [records, selectedDate])

  // ── イベント長期トレンド ─────────────────────────────────────────────
  const { eventTrendData, eventTrendCategories } = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - eventTrendDays)

    const healthByDate: Record<string, { fatigue: number[]; mood: number[]; motivation: number[]; concentration: number[] }> = {}
    for (const r of records) {
      if (r.record_type !== 'daily') continue
      const d = parseUtc(r.recorded_at)
      if (d < cutoff) continue
      const key = toLocalDateStr(d)
      if (!healthByDate[key]) healthByDate[key] = { fatigue: [], mood: [], motivation: [], concentration: [] }
      const f = parseFloat(r.fatigue_score)
      const m = parseFloat(r.mood_score)
      const mv = parseFloat(r.motivation_score)
      const c = parseFloat(r.concentration_score)
      if (!isNaN(f)) healthByDate[key].fatigue.push(f)
      if (!isNaN(m)) healthByDate[key].mood.push(m)
      if (!isNaN(mv)) healthByDate[key].motivation.push(mv)
      if (!isNaN(c)) healthByDate[key].concentration.push(c)
    }

    const cats = new Set<string>()
    const countByDate: Record<string, Record<string, number>> = {}
    for (const r of records) {
      if (r.record_type !== 'event') continue
      const d = parseUtc(r.recorded_at)
      if (d < cutoff) continue
      const key = toLocalDateStr(d)
      if (!countByDate[key]) countByDate[key] = {}
      try {
        const fields = JSON.parse(r.custom_fields || '[]') as { label: string; value: unknown }[]
        for (const f of fields) {
          cats.add(f.label)
          countByDate[key][f.label] = (countByDate[key][f.label] ?? 0) + 1
        }
      } catch {
        // skip malformed
      }
    }

    const allDates = new Set<string>([...Object.keys(healthByDate), ...Object.keys(countByDate)])
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    const data = Array.from(allDates)
      .sort()
      .map((date) => {
        const h = healthByDate[date]
        const counts = countByDate[date] ?? {}
        return {
          date: date.slice(5),
          fatigue: h ? avg(h.fatigue) : null,
          mood: h ? avg(h.mood) : null,
          motivation: h ? avg(h.motivation) : null,
          concentration: h ? avg(h.concentration) : null,
          ...counts,
        }
      })

    return { eventTrendData: data, eventTrendCategories: Array.from(cats) }
  }, [records, eventTrendDays])

  // ── 環境データ × ヘルスデータ結合 ───────────────────────────────────
  const envChartData = useMemo(() => {
    const healthByDate: Record<string, { fatigue: number[]; mood: number[]; motivation: number[]; concentration: number[] }> = {}
    for (const r of records) {
      if (r.record_type !== 'daily') continue
      const key = toLocalDateStr(parseUtc(r.recorded_at))
      if (!healthByDate[key]) healthByDate[key] = { fatigue: [], mood: [], motivation: [], concentration: [] }
      const f = parseFloat(r.fatigue_score)
      const m = parseFloat(r.mood_score)
      const mv = parseFloat(r.motivation_score)
      const c = parseFloat(r.concentration_score)
      if (!isNaN(f)) healthByDate[key].fatigue.push(f)
      if (!isNaN(m)) healthByDate[key].mood.push(m)
      if (!isNaN(mv)) healthByDate[key].motivation.push(mv)
      if (!isNaN(c)) healthByDate[key].concentration.push(c)
    }
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    return envRecords.map((env) => {
      const h = healthByDate[env.date]
      return {
        date: env.date.slice(5),
        pressure_hpa: env.pressure_hpa,
        pm25: env.pm25,
        fatigue: h ? avg(h.fatigue) : null,
        mood: h ? avg(h.mood) : null,
        motivation: h ? avg(h.motivation) : null,
        concentration: h ? avg(h.concentration) : null,
      }
    })
  }, [envRecords, records])

  // ── イベントラベル一覧（相関分析 X 軸用）─────────────────────────────
  const eventLabels = useMemo((): string[] => {
    const labels = new Set<string>()
    for (const r of records) {
      if (r.record_type !== 'event' && r.record_type !== 'status') continue
      try {
        const fields = JSON.parse(r.custom_fields || '[]') as { label: string; value: unknown }[]
        for (const f of fields) labels.add(f.label)
      } catch {
        // skip malformed
      }
    }
    return Array.from(labels)
  }, [records])

  const xAxisOptions = useMemo(() => {
    const fixed: { value: string; label: string }[] = [
      { value: 'pressure_hpa', label: '気圧 (hPa)' },
      { value: 'pm25', label: 'PM2.5 (μg/m³)' },
    ]
    const events = eventLabels.map((l) => ({ value: `event:${l}`, label: `${l}（イベント）` }))
    return [...fixed, ...events]
  }, [eventLabels])

  // ── 相関分析データ ────────────────────────────────────────────────────
  const { corrPoints, corrRegression } = useMemo((): {
    corrPoints: CorrPoint[]
    corrRegression: RegressionResult | null
  } => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - corrDays)

    // 日次ヘルス平均
    const healthByDate: Record<string, { fatigue: number[]; mood: number[]; motivation: number[]; concentration: number[] }> = {}
    for (const r of records) {
      if (r.record_type !== 'daily') continue
      const d = parseUtc(r.recorded_at)
      if (d < cutoff) continue
      const key = toLocalDateStr(d)
      if (!healthByDate[key]) healthByDate[key] = { fatigue: [], mood: [], motivation: [], concentration: [] }
      const f = parseFloat(r.fatigue_score)
      const m = parseFloat(r.mood_score)
      const mv = parseFloat(r.motivation_score)
      const c = parseFloat(r.concentration_score)
      if (!isNaN(f)) healthByDate[key].fatigue.push(f)
      if (!isNaN(m)) healthByDate[key].mood.push(m)
      if (!isNaN(mv)) healthByDate[key].motivation.push(mv)
      if (!isNaN(c)) healthByDate[key].concentration.push(c)
    }

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

    // X軸の値を取得
    const getXValue = (date: string): number | null => {
      if (corrXAxis === 'pressure_hpa') {
        const env = envRecords.find((e) => e.date === date)
        return env?.pressure_hpa ?? null
      }
      if (corrXAxis === 'pm25') {
        const env = envRecords.find((e) => e.date === date)
        return env?.pm25 ?? null
      }
      if (corrXAxis.startsWith('event:')) {
        const labelName = corrXAxis.slice(6)
        let count = 0
        for (const r of records) {
          if (r.record_type !== 'event' && r.record_type !== 'status') continue
          if (toLocalDateStr(parseUtc(r.recorded_at)) !== date) continue
          try {
            const fields = JSON.parse(r.custom_fields || '[]') as { label: string; value: unknown }[]
            for (const f of fields) {
              if (f.label !== labelName) continue
              if (typeof f.value === 'boolean') {
                if (f.value) count += 1
              } else if (typeof f.value === 'number') {
                count += f.value
              } else {
                count += 1
              }
            }
          } catch {
            // skip malformed
          }
        }
        return count
      }
      return null
    }

    // Y軸の値を取得
    const getYValue = (date: string): number | null => {
      const h = healthByDate[date]
      if (!h) return null
      return avg(h[corrYAxis])
    }

    // 全日付の union
    const allDates = new Set<string>()
    for (const r of records) {
      const d = parseUtc(r.recorded_at)
      if (d >= cutoff) allDates.add(toLocalDateStr(d))
    }
    for (const e of envRecords) {
      allDates.add(e.date)
    }

    const points: CorrPoint[] = []
    for (const date of allDates) {
      const x = getXValue(date)
      const y = getYValue(date)
      if (x !== null && y !== null) {
        points.push({ x, y })
      }
    }

    const regression = linearRegression(points)
    return { corrPoints: points, corrRegression: regression }
  }, [records, envRecords, corrDays, corrXAxis, corrYAxis])

  const corrRegressionLine = useMemo((): RegressionLinePoint[] => {
    if (!corrRegression || corrPoints.length < 3) return []
    const xs = corrPoints.map((p) => p.x)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    return [
      { x: minX, y: corrRegression.slope * minX + corrRegression.intercept },
      { x: maxX, y: corrRegression.slope * maxX + corrRegression.intercept },
    ]
  }, [corrRegression, corrPoints])

  // ── 日付リスト ───────────────────────────────────────────────────────
  const availableDates = useMemo(() => {
    const dates = new Set<string>()
    for (const r of records) dates.add(toLocalDateStr(parseUtc(r.recorded_at)))
    return Array.from(dates).sort().reverse()
  }, [records])

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div>
      <nav className="navbar navbar-expand navbar-light bg-light border-bottom">
        <div className="container">
          <button className="btn btn-sm btn-outline-secondary me-2" onClick={onBack}>
            ← 戻る
          </button>
          <span className="navbar-brand fw-bold text-success mb-0">ダッシュボード</span>
        </div>
      </nav>

      <div className="container py-4" style={{ maxWidth: '720px' }}>
        {/* タブ */}
        <ul className="nav nav-tabs mb-4">
          {(
            [
              { key: 'trend', label: '長期トレンド' },
              { key: 'intraday', label: '日内変動' },
              { key: 'events', label: 'イベント' },
              { key: 'env', label: '環境データ' },
              { key: 'correlation', label: '相関分析' },
            ] as { key: Tab; label: string }[]
          ).map(({ key, label }) => (
            <li className="nav-item" key={key}>
              <button
                className={`nav-link${tab === key ? ' active' : ''}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>

        {loading && <p className="text-muted">読み込み中…</p>}
        {fetchError && <div className="alert alert-danger">{fetchError}</div>}

        {/* ── 長期トレンド ── */}
        {!loading && tab === 'trend' && (
          <div>
            {/* 期間セレクタ */}
            <div className="d-flex gap-2 mb-3">
              {[30, 90].map((d) => (
                <button
                  key={d}
                  className={`btn btn-sm ${trendDays === d ? 'btn-success' : 'btn-outline-secondary'}`}
                  onClick={() => setTrendDays(d)}
                >
                  {d}日
                </button>
              ))}
            </div>

            {/* 集計モード切り替え */}
            <div className="btn-group btn-group-sm mb-3">
              {(
                [
                  { key: 'daily', label: '日次' },
                  { key: 'weekday', label: '曜日別' },
                  { key: 'timeband', label: '時間帯別' },
                ] as { key: TrendAggMode; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  className={`btn ${trendAggMode === key ? 'btn-success' : 'btn-outline-secondary'}`}
                  onClick={() => setTrendAggMode(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 指標フィルタ */}
            <MetricSelector visibleMetrics={visibleMetrics} onChange={setVisibleMetrics} />

            {/* 日次 LineChart */}
            {trendAggMode === 'daily' && (
              trendData.length === 0 ? (
                <p className="text-muted small">この期間の日次記録がありません。</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {ALL_METRICS.filter((k) => visibleMetrics.has(k)).map((key) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={METRIC_CONFIG[key].name}
                        stroke={METRIC_CONFIG[key].stroke}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )
            )}

            {/* 曜日別 BarChart */}
            {trendAggMode === 'weekday' && (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={weekdayData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {ALL_METRICS.filter((k) => visibleMetrics.has(k)).map((key) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      name={METRIC_CONFIG[key].name}
                      fill={METRIC_CONFIG[key].stroke}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}

            {/* 時間帯別 BarChart */}
            {trendAggMode === 'timeband' && (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={timebandData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {ALL_METRICS.filter((k) => visibleMetrics.has(k)).map((key) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      name={METRIC_CONFIG[key].name}
                      fill={METRIC_CONFIG[key].stroke}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* ── 日内変動 ── */}
        {!loading && tab === 'intraday' && (
          <div>
            <select
              className="form-select form-select-sm mb-3"
              style={{ maxWidth: '180px' }}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            >
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            {/* 指標フィルタ */}
            <MetricSelector visibleMetrics={visibleMetrics} onChange={setVisibleMetrics} />

            {intradayData.length === 0 && eventPoints.length === 0 && intradayStatusPeriods.length === 0 ? (
              <p className="text-muted small">この日の記録がありません。</p>
            ) : (
              <>
                {/* 体調スコア + ステータス期間 */}
                {(intradayData.length > 0 || intradayStatusPeriods.length > 0) && (
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={intradayData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="minutes"
                        domain={[0, 1440]}
                        ticks={[0, 360, 720, 1080, 1440]}
                        tickFormatter={minuteTick}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip labelFormatter={(v) => minuteTick(v as number)} />
                      <Legend />

                      {/* ステータス期間バンド */}
                      {intradayStatusPeriods.map((p, i) => {
                        const colorIdx = intradayStatusLabels.indexOf(p.label)
                        return (
                          <ReferenceArea
                            key={`sp-${i}`}
                            x1={p.startMinutes}
                            x2={p.endMinutes}
                            fill={STATUS_COLORS[colorIdx % STATUS_COLORS.length]}
                            fillOpacity={0.22}
                            ifOverflow="hidden"
                          />
                        )
                      })}

                      {/* 体調スコア折れ線 */}
                      {ALL_METRICS.filter((k) => visibleMetrics.has(k)).map((key) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          name={METRIC_CONFIG[key].name}
                          stroke={METRIC_CONFIG[key].stroke}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}

                {/* ステータス凡例 */}
                {intradayStatusPeriods.length > 0 && (
                  <div className="d-flex flex-wrap gap-1 mt-1 mb-3">
                    <span className="text-muted small fw-semibold me-1">期間:</span>
                    {intradayStatusLabels.map((label, i) => (
                      <span
                        key={label}
                        className="badge border"
                        style={{
                          background: STATUS_COLORS[i % STATUS_COLORS.length] + '33',
                          color: '#333',
                          fontSize: 11,
                          borderColor: STATUS_COLORS[i % STATUS_COLORS.length],
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}

                {/* イベント散布図 */}
                {eventPoints.length > 0 && (
                  <>
                    <p className="mb-1 small text-muted fw-semibold">イベント</p>
                    <ResponsiveContainer
                      width="100%"
                      height={Math.max(120, eventCategories.length * 50 + 60)}
                    >
                      <ScatterChart margin={{ top: 4, right: 16, left: 4, bottom: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          dataKey="x"
                          domain={[0, 1440]}
                          ticks={[0, 360, 720, 1080, 1440]}
                          tickFormatter={minuteTick}
                          tick={{ fontSize: 11 }}
                          label={{ value: '時刻', position: 'insideBottomRight', offset: -4, fontSize: 11 }}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          domain={[-0.5, Math.max(eventCategories.length - 0.5, 0.5)]}
                          ticks={eventCategories.map((_, i) => i)}
                          tickFormatter={(v: number) => eventCategories[v] ?? ''}
                          tick={{ fontSize: 11 }}
                          width={80}
                        />
                        <Tooltip content={<EventTooltip />} />
                        {eventCategories.map((cat, i) => (
                          <Scatter
                            key={cat}
                            name={cat}
                            data={eventPoints.filter((p) => p.y === i)}
                            fill={EVENT_COLORS[i % EVENT_COLORS.length]}
                          />
                        ))}
                      </ScatterChart>
                    </ResponsiveContainer>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── イベント ── */}
        {!loading && tab === 'events' && (
          <div>
            {/* サブビュー切り替え */}
            <div className="btn-group btn-group-sm mb-3">
              <button
                className={`btn ${eventsView === 'timeline' ? 'btn-success' : 'btn-outline-secondary'}`}
                onClick={() => setEventsView('timeline')}
              >
                日別タイムライン
              </button>
              <button
                className={`btn ${eventsView === 'trend' ? 'btn-success' : 'btn-outline-secondary'}`}
                onClick={() => setEventsView('trend')}
              >
                長期トレンド
              </button>
            </div>

            {/* 日別タイムライン */}
            {eventsView === 'timeline' && (
              <>
                <select
                  className="form-select form-select-sm mb-3"
                  style={{ maxWidth: '180px' }}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                >
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                {eventPoints.length === 0 ? (
                  <p className="text-muted small">この日のイベント記録がありません。</p>
                ) : (
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(200, eventCategories.length * 60 + 80)}
                  >
                    <ScatterChart margin={{ top: 4, right: 16, left: 4, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        domain={[0, 1440]}
                        ticks={[0, 180, 360, 540, 720, 900, 1080, 1260, 1440]}
                        tickFormatter={minuteTick}
                        tick={{ fontSize: 11 }}
                        label={{ value: '時刻', position: 'insideBottomRight', offset: -4, fontSize: 11 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        domain={[-0.5, Math.max(eventCategories.length - 0.5, 0.5)]}
                        ticks={eventCategories.map((_, i) => i)}
                        tickFormatter={(v: number) => eventCategories[v] ?? ''}
                        tick={{ fontSize: 11 }}
                        width={80}
                      />
                      <Tooltip content={<EventTooltip />} />
                      <Scatter data={eventPoints} fill="#6f42c1" />
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
              </>
            )}

            {/* 長期トレンド */}
            {eventsView === 'trend' && (
              <>
                <div className="d-flex gap-2 mb-3">
                  {[30, 90].map((d) => (
                    <button
                      key={d}
                      className={`btn btn-sm ${eventTrendDays === d ? 'btn-success' : 'btn-outline-secondary'}`}
                      onClick={() => setEventTrendDays(d)}
                    >
                      {d}日
                    </button>
                  ))}
                </div>
                {eventTrendData.length === 0 ? (
                  <p className="text-muted small">この期間のイベント記録がありません。</p>
                ) : (
                  <div className="d-flex flex-column gap-1">
                    {/* パネル1: 体調スコア */}
                    <p className="mb-0 small text-muted fw-semibold">体調スコア</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={eventTrendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="fatigue" name="疲労度" stroke="#dc3545" dot={false} connectNulls />
                        <Line type="monotone" dataKey="mood" name="気分" stroke="#fd7e14" dot={false} connectNulls />
                        <Line type="monotone" dataKey="motivation" name="やる気" stroke="#198754" dot={false} connectNulls />
                        <Line type="monotone" dataKey="concentration" name="集中力" stroke="#0d6efd" dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>

                    {/* パネル2: イベント頻度 */}
                    {eventTrendCategories.length === 0 ? (
                      <p className="text-muted small">この期間のイベント種別がありません。</p>
                    ) : (
                      <>
                        <p className="mb-0 small text-muted fw-semibold">イベント発生回数</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={eventTrendData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            {eventTrendCategories.map((cat, i) => (
                              <Bar
                                key={cat}
                                dataKey={cat}
                                stackId="events"
                                fill={EVENT_COLORS[i % EVENT_COLORS.length]}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 環境データ ── */}
        {!loading && tab === 'env' && (
          <div>
            <div className="d-flex gap-2 mb-3">
              {[14, 30].map((d) => (
                <button
                  key={d}
                  className={`btn btn-sm ${envDays === d ? 'btn-success' : 'btn-outline-secondary'}`}
                  onClick={() => setEnvDays(d)}
                >
                  {d}日
                </button>
              ))}
            </div>

            {envChartData.length === 0 ? (
              <p className="text-muted small">この期間の環境データがありません。</p>
            ) : (
              <div className="d-flex flex-column gap-1">
                {/* パネル1: ヘルスデータ */}
                <p className="mb-0 small text-muted fw-semibold">体調スコア</p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={envChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="fatigue" name="疲労度" stroke="#dc3545" dot={false} connectNulls />
                    <Line type="monotone" dataKey="mood" name="気分" stroke="#fd7e14" dot={false} connectNulls />
                    <Line type="monotone" dataKey="motivation" name="やる気" stroke="#198754" dot={false} connectNulls />
                    <Line type="monotone" dataKey="concentration" name="集中力" stroke="#0d6efd" dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>

                {/* パネル2: 気圧 */}
                <p className="mb-0 small text-muted fw-semibold">気圧 (hPa)</p>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={envChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={false} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => [`${v} hPa`, '気圧']} />
                    <ReferenceLine y={1010} stroke="#dc3545" strokeDasharray="4 2"
                      label={{ value: '低気圧', position: 'insideTopRight', fontSize: 10, fill: '#dc3545' }} />
                    <Line type="monotone" dataKey="pressure_hpa" name="気圧" stroke="#6f42c1" dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>

                {/* パネル3: PM2.5 */}
                <p className="mb-0 small text-muted fw-semibold">PM2.5 (μg/m³)</p>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={envChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => [`${v} μg/m³`, 'PM2.5']} />
                    <ReferenceLine y={15} stroke="#fd7e14" strokeDasharray="4 2"
                      label={{ value: 'WHO基準', position: 'insideTopRight', fontSize: 10, fill: '#fd7e14' }} />
                    <Bar dataKey="pm25" name="PM2.5" fill="#20c997" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ── 相関分析 ── */}
        {!loading && tab === 'correlation' && (
          <div>
            {/* コントロール */}
            <div className="row g-2 mb-3">
              <div className="col-12 col-sm-5">
                <label className="form-label small mb-1 text-muted">X軸（要因）</label>
                <select
                  className="form-select form-select-sm"
                  value={corrXAxis}
                  onChange={(e) => setCorrXAxis(e.target.value)}
                >
                  {xAxisOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-sm-4">
                <label className="form-label small mb-1 text-muted">Y軸（指標）</label>
                <select
                  className="form-select form-select-sm"
                  value={corrYAxis}
                  onChange={(e) => setCorrYAxis(e.target.value as MetricKey)}
                >
                  {ALL_METRICS.map((key) => (
                    <option key={key} value={key}>
                      {METRIC_CONFIG[key].name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-sm-3">
                <label className="form-label small mb-1 text-muted">期間</label>
                <div className="d-flex gap-1 flex-wrap">
                  {[30, 90, 180].map((d) => (
                    <button
                      key={d}
                      className={`btn btn-sm ${corrDays === d ? 'btn-success' : 'btn-outline-secondary'}`}
                      onClick={() => setCorrDays(d)}
                    >
                      {d}日
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 統計バッジ */}
            {corrRegression && (
              <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
                <span className="badge bg-secondary" style={{ fontSize: 13 }}>
                  r = {corrRegression.r.toFixed(2)}
                </span>
                <span className="badge bg-light text-dark border" style={{ fontSize: 13 }}>
                  n = {corrRegression.n}件
                </span>
                <span
                  className={`badge ${Math.abs(corrRegression.r) >= 0.4 ? 'bg-primary' : 'bg-light text-dark border'}`}
                  style={{ fontSize: 13 }}
                >
                  {interpretCorrelation(corrRegression.r)}
                </span>
              </div>
            )}
            {!corrRegression && corrPoints.length > 0 && corrPoints.length < 3 && (
              <p className="text-muted small mb-3">
                散布点が {corrPoints.length} 件のため回帰直線を表示できません（3件以上必要）。
              </p>
            )}

            {/* 散布図 */}
            {corrPoints.length === 0 ? (
              <p className="text-muted small">この期間・組み合わせのデータがありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart margin={{ top: 8, right: 16, left: -10, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 11 }}
                    name={xAxisOptions.find((o) => o.value === corrXAxis)?.label ?? corrXAxis}
                    label={{
                      value: xAxisOptions.find((o) => o.value === corrXAxis)?.label ?? corrXAxis,
                      position: 'insideBottomRight',
                      offset: -4,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    name={METRIC_CONFIG[corrYAxis].name}
                    label={{
                      value: METRIC_CONFIG[corrYAxis].name,
                      angle: -90,
                      position: 'insideLeft',
                      offset: 10,
                      fontSize: 11,
                    }}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      typeof value === 'number' ? Math.round(value * 100) / 100 : value,
                      name,
                    ]}
                  />
                  {/* 散布点 */}
                  <Scatter
                    data={corrPoints}
                    fill={METRIC_CONFIG[corrYAxis].stroke}
                    opacity={0.7}
                  />
                  {/* 回帰直線 */}
                  {corrRegressionLine.length === 2 && (
                    <Line
                      data={corrRegressionLine}
                      dataKey="y"
                      dot={false}
                      activeDot={false}
                      strokeDasharray="6 3"
                      stroke="#dc3545"
                      strokeWidth={2}
                      legendType="none"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
