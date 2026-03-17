import { describe, it, expect } from 'vitest'
import { parseVoiceInput } from '../utils/voiceParser'

describe('parseVoiceInput', () => {
  it('シンプルな体調スコア: daily item × 1', () => {
    const result = parseVoiceInput('疲労70気分60やる気80', [])
    expect(result.items).toHaveLength(1)
    expect(result.items[0].type).toBe('daily')
    expect(result.items[0].fatigue).toBe(70)
    expect(result.items[0].mood).toBe(60)
    expect(result.items[0].motivation).toBe(80)
  })

  it('時刻付きイベント: "朝8時にカフェイン" → event item, recordedAt.getHours() === 8', () => {
    const result = parseVoiceInput('朝8時にカフェイン', [])
    // カフェインは event
    const eventItems = result.items.filter((item) => item.type === 'event')
    expect(eventItems.length).toBeGreaterThanOrEqual(1)
    const caffeineItem = eventItems.find((item) => item.eventLabel === 'カフェイン')
    expect(caffeineItem).toBeDefined()
    expect(caffeineItem!.recordedAt.getHours()).toBe(8)
    expect(caffeineItem!.eventValue).toBe(true)
  })

  it('複合発話: "朝8時にカフェイン、10時に運動、今疲労70気分60" → 3 items', () => {
    const result = parseVoiceInput('朝8時にカフェイン、10時に運動、今疲労70気分60', [])
    expect(result.items).toHaveLength(3)

    const caffeineItem = result.items.find(
      (item) => item.type === 'event' && item.eventLabel === 'カフェイン'
    )
    expect(caffeineItem).toBeDefined()
    expect(caffeineItem!.recordedAt.getHours()).toBe(8)

    const exerciseItem = result.items.find(
      (item) => item.type === 'event' && item.eventLabel === '運動'
    )
    expect(exerciseItem).toBeDefined()
    expect(exerciseItem!.recordedAt.getHours()).toBe(10)

    const dailyItem = result.items.find((item) => item.type === 'daily')
    expect(dailyItem).toBeDefined()
    expect(dailyItem!.fatigue).toBe(70)
    expect(dailyItem!.mood).toBe(60)
  })

  it('カスタムイベントラベル: "頭痛あり" を customLabels=["頭痛"] で渡す → event item', () => {
    const result = parseVoiceInput('頭痛あり', ['頭痛'])
    const eventItem = result.items.find(
      (item) => item.type === 'event' && item.eventLabel === '頭痛'
    )
    expect(eventItem).toBeDefined()
    expect(eventItem!.eventValue).toBe(true)
  })

  it('数値範囲外は除外: "疲労150" → item に fatigue は含めない', () => {
    const result = parseVoiceInput('疲労150', [])
    if (result.items.length > 0) {
      const dailyItem = result.items.find((item) => item.type === 'daily')
      expect(dailyItem?.fatigue).toBeUndefined()
    } else {
      expect(result.items).toHaveLength(0)
    }
  })

  it('空文字 → items: []', () => {
    const result = parseVoiceInput('', [])
    expect(result.items).toHaveLength(0)
  })
})
