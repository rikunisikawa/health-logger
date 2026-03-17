import type { LatestRecord } from '../types'

/**
 * RecordHistory の一覧表示用サマリー文字列を生成する。
 * コンポーネントから分離することでユニットテストを可能にする。
 */
export function buildSummaryParts(record: LatestRecord): string[] {
  if (record.record_type === 'event' || record.record_type === 'status') {
    try {
      const fields = JSON.parse(record.custom_fields || '[]') as { label: string; value: unknown }[]
      return fields.map((f) => `${f.label}: ${f.value}`)
    } catch {
      return []
    }
  }

  const parts: string[] = []
  if (record.fatigue_score)       parts.push(`疲労:${record.fatigue_score}`)
  if (record.mood_score)          parts.push(`気分:${record.mood_score}`)
  if (record.motivation_score)    parts.push(`やる気:${record.motivation_score}`)
  if (record.concentration_score) parts.push(`集中:${record.concentration_score}`)
  return parts
}
