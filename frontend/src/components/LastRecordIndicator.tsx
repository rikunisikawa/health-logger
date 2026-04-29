import type { LatestRecord } from '../types'

interface Props {
  latestDailyRecord?: LatestRecord
  records?: LatestRecord[]
}

/**
 * recorded_at (ISO 8601) から日数を計算
 * 例: "2026-03-20T14:30:00Z" → 3 (今日が2026-03-23の場合)
 */
function getDaysSince(recordedAt: string): number {
  const recordDate = new Date(recordedAt)
  const today = new Date()
  const diffTime = today.getTime() - recordDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

/**
 * recorded_at が今日かどうかを判定
 */
function isToday(recordedAt: string): boolean {
  const recordDate = new Date(recordedAt)
  const today = new Date()
  return (
    recordDate.getFullYear() === today.getFullYear() &&
    recordDate.getMonth() === today.getMonth() &&
    recordDate.getDate() === today.getDate()
  )
}

/**
 * recorded_at が昨日かどうかを判定
 */
function isYesterday(recordedAt: string): boolean {
  const recordDate = new Date(recordedAt)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return (
    recordDate.getFullYear() === yesterday.getFullYear() &&
    recordDate.getMonth() === yesterday.getMonth() &&
    recordDate.getDate() === yesterday.getDate()
  )
}

/**
 * 今日のレコード数を計算
 */
function countTodaysRecords(records: LatestRecord[]): number {
  return records.filter((r) => isToday(r.recorded_at)).length
}

export default function LastRecordIndicator({ latestDailyRecord, records }: Props) {
  if (!latestDailyRecord) {
    return null
  }

  const { recorded_at } = latestDailyRecord

  let emoji = ''
  let text = ''
  let bgColor = ''
  let textColor = ''
  let fontSize = '14px'
  let fontWeight = 500

  if (isToday(recorded_at)) {
    // パターン① 本日既に記録済み
    const count = countTodaysRecords(records ?? [])
    emoji = '🎯'
    text = `今日 ${count}回目の記録`
    bgColor = '#e7f5f0'
    textColor = '#0f5132'
    fontSize = '14px'
    fontWeight = 500
  } else if (isYesterday(recorded_at)) {
    // パターン② 昨日から記録
    emoji = '👋'
    text = '昨日ぶりの記録'
    bgColor = '#e7f4f8'
    textColor = '#004085'
    fontSize = '14px'
    fontWeight = 500
  } else {
    // パターン③ 2日以上経過
    const days = getDaysSince(recorded_at)
    emoji = '🎉'
    text = `${days}日ぶりの記録です`
    bgColor = '#fff3e0'
    textColor = '#856404'
    fontSize = '15px'
    fontWeight = 600
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 14px',
        borderRadius: '4px',
        marginBottom: '12px',
        backgroundColor: bgColor,
        color: textColor,
        fontSize,
        fontWeight,
        lineHeight: '1.4',
      }}
    >
      <span>{emoji}</span>
      <span>{text}</span>
    </div>
  )
}
