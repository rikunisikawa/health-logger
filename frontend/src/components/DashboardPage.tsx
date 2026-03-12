import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

/** Athena returns timestamps without timezone (UTC); append 'Z' to parse correctly */
function parseUtc(isoStr: string): Date {
  const s = isoStr.includes('T') ? isoStr : isoStr.replace(' ', 'T')
  return new Date(s.endsWith('Z') ? s : `${s}Z`)
}

/** Returns YYYY-MM-DD in local timezone */
function toLocalDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE')
}

/** Returns HH:MM in local timezone */
function toLocalTimeStr(d: Date): string {
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

/** Minutes since midnight in local timezone */
function toLocalMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

type Tab = 'trend' | 'intraday' | 'events' | 'env'

interface DailyAvg {
  date: string
  fatigue: number | null
  mood: number | null
  motivation: number | null
}

interface IntradayPoint {
  time: string
  minutes: number
  fatigue: number | null
  mood: number | null
  motivation: number | null
}

interface EventPoint {
  x: number
  y: number
  label: string
  timeStr: string
  valueStr: string
}

interface EventTooltipProps {
  payload?: { payload: EventPoint }[]
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
  const [trendDays, setTrendDays] = useState(30)
  const [envDays, setEnvDays] = useState(14)
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
    getEnvData(token, envDays).then((res) => setEnvRecords(res.records)).catch(() => {})
  }, [token, envDays])

  // ── 長期トレンド ─────────────────────────────────────────────────────
  const trendData = useMemo((): DailyAvg[] => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - trendDays)

    const byDate: Record<string, { fatigue: number[]; mood: number[]; motivation: number[] }> = {}
    for (const r of records) {
      if (r.record_type !== 'daily') continue
      const d = parseUtc(r.recorded_at)
      if (d < cutoff) continue
      const key = toLocalDateStr(d)
      if (!byDate[key]) byDate[key] = { fatigue: [], mood: [], motivation: [] }
      const f = parseFloat(r.fatigue_score)
      const m = parseFloat(r.mood_score)
      const mv = parseFloat(r.motivation_score)
      if (!isNaN(f)) byDate[key].fatigue.push(f)
      if (!isNaN(m)) byDate[key].mood.push(m)
      if (!isNaN(mv)) byDate[key].motivation.push(mv)
    }

    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { fatigue, mood, motivation }]) => {
        const avg = (arr: number[]) =>
          arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null
        return {
          date: date.slice(5), // MM-DD
          fatigue: avg(fatigue),
          mood: avg(mood),
          motivation: avg(motivation),
        }
      })
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
        return {
          time: toLocalTimeStr(d),
          minutes: toLocalMinutes(d),
          fatigue: isNaN(f) ? null : f,
          mood: isNaN(m) ? null : m,
          motivation: isNaN(mv) ? null : mv,
        }
      })
      .sort((a, b) => a.minutes - b.minutes)
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

  // ── 環境データ × ヘルスデータ結合 ───────────────────────────────────
  const envChartData = useMemo(() => {
    const healthByDate: Record<string, { fatigue: number[]; mood: number[]; motivation: number[] }> = {}
    for (const r of records) {
      if (r.record_type !== 'daily') continue
      const key = toLocalDateStr(parseUtc(r.recorded_at))
      if (!healthByDate[key]) healthByDate[key] = { fatigue: [], mood: [], motivation: [] }
      const f = parseFloat(r.fatigue_score)
      const m = parseFloat(r.mood_score)
      const mv = parseFloat(r.motivation_score)
      if (!isNaN(f)) healthByDate[key].fatigue.push(f)
      if (!isNaN(m)) healthByDate[key].mood.push(m)
      if (!isNaN(mv)) healthByDate[key].motivation.push(mv)
    }
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    return envRecords.map((env) => {
      const h = healthByDate[env.date]
      return {
        date: env.date.slice(5), // MM-DD
        pressure_hpa: env.pressure_hpa,
        pm25: env.pm25,
        fatigue: h ? avg(h.fatigue) : null,
        mood: h ? avg(h.mood) : null,
        motivation: h ? avg(h.motivation) : null,
      }
    })
  }, [envRecords, records])

  // ── 日付リスト ───────────────────────────────────────────────────────
  const availableDates = useMemo(() => {
    const dates = new Set<string>()
    for (const r of records) dates.add(toLocalDateStr(parseUtc(r.recorded_at)))
    return Array.from(dates).sort().reverse()
  }, [records])

  const minuteTick = (v: number) =>
    `${Math.floor(v / 60).toString().padStart(2, '0')}:${(v % 60).toString().padStart(2, '0')}`

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
            {trendData.length === 0 ? (
              <p className="text-muted small">この期間の日次記録がありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="fatigue"
                    name="疲労度"
                    stroke="#dc3545"
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="mood"
                    name="気分"
                    stroke="#0d6efd"
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="motivation"
                    name="やる気"
                    stroke="#198754"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
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
            {intradayData.length === 0 ? (
              <p className="text-muted small">この日の日次記録がありません。</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={intradayData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="fatigue" name="疲労度" stroke="#dc3545" dot />
                  <Line type="monotone" dataKey="mood" name="気分" stroke="#0d6efd" dot />
                  <Line type="monotone" dataKey="motivation" name="やる気" stroke="#198754" dot />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* ── イベントタイムライン ── */}
        {!loading && tab === 'events' && (
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
                    <Line type="monotone" dataKey="mood" name="気分" stroke="#0d6efd" dot={false} connectNulls />
                    <Line type="monotone" dataKey="motivation" name="やる気" stroke="#198754" dot={false} connectNulls />
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
      </div>
    </div>
  )
}
