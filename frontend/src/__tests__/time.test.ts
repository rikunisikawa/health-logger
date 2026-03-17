import { describe, it, expect } from 'vitest'
import { formatTime, parseUtc, toLocalDateStr, toLocalMinutes } from '../utils/time'

describe('parseUtc', () => {
  it('スペース区切りの Athena タイムスタンプを UTC として解析する', () => {
    const d = parseUtc('2024-01-15 13:30:00')
    expect(d.getUTCFullYear()).toBe(2024)
    expect(d.getUTCMonth()).toBe(0)   // 0-indexed
    expect(d.getUTCDate()).toBe(15)
    expect(d.getUTCHours()).toBe(13)
    expect(d.getUTCMinutes()).toBe(30)
  })

  it('T 区切りのタイムスタンプ（Z なし）を UTC として解析する', () => {
    const d = parseUtc('2024-06-01T09:00:00')
    expect(d.getUTCHours()).toBe(9)
  })

  it('すでに Z 付きの文字列はそのまま解析する', () => {
    const d = parseUtc('2024-06-01T09:00:00Z')
    expect(d.getUTCHours()).toBe(9)
  })

  it('有効な Date オブジェクトを返す', () => {
    const d = parseUtc('2024-03-17 00:00:00')
    expect(d instanceof Date).toBe(true)
    expect(isNaN(d.getTime())).toBe(false)
  })
})

describe('toLocalDateStr', () => {
  it('YYYY-MM-DD 形式の文字列を返す', () => {
    // UTC 2024-01-15T00:00:00 → ローカル日付（JST なら 2024-01-15 以降）
    const d = new Date('2024-01-15T12:00:00Z')
    const result = toLocalDateStr(d)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('toLocalMinutes', () => {
  it('午前 0 時 0 分は 0 を返す', () => {
    // UTC の特定時刻から生成したDateのローカルminutes
    const d = new Date(2024, 0, 15, 0, 0, 0) // ローカル 0:00
    expect(toLocalMinutes(d)).toBe(0)
  })

  it('午後 1 時 30 分は 810 を返す', () => {
    const d = new Date(2024, 0, 15, 13, 30, 0) // ローカル 13:30
    expect(toLocalMinutes(d)).toBe(810)
  })

  it('0 以上 1440 未満の値を返す', () => {
    const d = new Date(2024, 0, 15, 23, 59, 0)
    const minutes = toLocalMinutes(d)
    expect(minutes).toBeGreaterThanOrEqual(0)
    expect(minutes).toBeLessThan(1440)
  })
})

describe('formatTime', () => {
  it('スペース区切りの Athena タイムスタンプを日本語ロケールで表示する', () => {
    const result = formatTime('2024-01-15 03:00:00')
    // "1/15 12:00" (JST +9) など月と日が含まれる
    expect(result).toMatch(/\d+\/\d+/)
  })

  it('T 区切りの ISO 文字列を処理する', () => {
    const result = formatTime('2024-06-01T09:00:00')
    expect(result).toMatch(/\d+\/\d+/)
  })

  it('パースできない文字列はそのまま返す', () => {
    const result = formatTime('invalid-timestamp')
    // Date('invalid-timestamp') → Invalid Date → catch で元の文字列を返す
    expect(typeof result).toBe('string')
  })
})
