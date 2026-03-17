import { describe, it, expect } from 'vitest'
import { buildSummaryParts } from '../utils/recordSummary'
import type { LatestRecord } from '../types'

function makeRecord(overrides: Partial<LatestRecord> = {}): LatestRecord {
  return {
    id: 'test-id',
    record_type: 'daily',
    fatigue_score: '',
    mood_score: '',
    motivation_score: '',
    concentration_score: '',
    flags: '0',
    note: '',
    recorded_at: '2024-01-15 13:00:00',
    timezone: 'Asia/Tokyo',
    device_id: '',
    app_version: '1.0.0',
    custom_fields: '[]',
    written_at: '2024-01-15 13:00:00',
    ...overrides,
  }
}

describe('buildSummaryParts (daily)', () => {
  it('全スコアが揃っている場合に全項目を返す', () => {
    const record = makeRecord({
      fatigue_score: '70',
      mood_score: '60',
      motivation_score: '80',
      concentration_score: '75',
    })
    const parts = buildSummaryParts(record)
    expect(parts).toContain('疲労:70')
    expect(parts).toContain('気分:60')
    expect(parts).toContain('やる気:80')
    expect(parts).toContain('集中:75')
    expect(parts).toHaveLength(4)
  })

  it('concentration_score が空文字の場合は集中力を含まない', () => {
    const record = makeRecord({
      fatigue_score: '50',
      mood_score: '50',
      motivation_score: '50',
      concentration_score: '',   // 旧レコード（移行前）
    })
    const parts = buildSummaryParts(record)
    expect(parts.some((p) => p.startsWith('集中:'))).toBe(false)
    expect(parts).toHaveLength(3)
  })

  it('スコアが "0" の場合も表示する（truthy チェックで欠落しない）', () => {
    const record = makeRecord({
      fatigue_score: '0',
      mood_score: '0',
      motivation_score: '0',
      concentration_score: '0',
    })
    const parts = buildSummaryParts(record)
    // "0" は falsy ではないので全て含まれるべき
    // ただし空文字は含まない → 現実の Athena 返り値の "0" は truthy
    expect(parts.some((p) => p.startsWith('疲労:'))).toBe(true)
  })

  it('全スコアが空文字の場合は空配列を返す', () => {
    const record = makeRecord()
    const parts = buildSummaryParts(record)
    expect(parts).toHaveLength(0)
  })
})

describe('buildSummaryParts (event)', () => {
  it('custom_fields の label と value を返す', () => {
    const record = makeRecord({
      record_type: 'event',
      custom_fields: JSON.stringify([
        { label: 'カフェイン', value: true },
        { label: '運動時間', value: 30 },
      ]),
    })
    const parts = buildSummaryParts(record)
    expect(parts).toContain('カフェイン: true')
    expect(parts).toContain('運動時間: 30')
  })

  it('custom_fields が空配列の場合は空配列を返す', () => {
    const record = makeRecord({ record_type: 'event', custom_fields: '[]' })
    expect(buildSummaryParts(record)).toHaveLength(0)
  })

  it('custom_fields が不正な JSON の場合は空配列を返す', () => {
    const record = makeRecord({ record_type: 'event', custom_fields: 'not-json' })
    expect(buildSummaryParts(record)).toHaveLength(0)
  })
})

describe('buildSummaryParts (status)', () => {
  it('status レコードも custom_fields を表示する', () => {
    const record = makeRecord({
      record_type: 'status',
      custom_fields: JSON.stringify([{ label: '勤務中', value: true }]),
    })
    const parts = buildSummaryParts(record)
    expect(parts).toContain('勤務中: true')
  })
})
