export interface ParsedVoiceItem {
  id: string
  type: 'daily' | 'event'
  timeLabel: string
  recordedAt: Date
  // daily のとき
  fatigue?: number
  mood?: number
  motivation?: number
  concentration?: number
  note?: string
  // event のとき
  eventLabel: string
  eventValue: boolean | number
}

export interface VoiceParseResult {
  items: ParsedVoiceItem[]
  originalText: string
  warnings: string[]
}

const BUILTIN_EVENT_KEYWORDS: { patterns: string[]; label: string }[] = [
  { patterns: ['カフェイン', 'コーヒー', '珈琲', 'お茶', '緑茶', '紅茶'], label: 'カフェイン' },
  { patterns: ['アルコール', 'お酒', '飲み会', 'ビール', 'ワイン', '酒'], label: 'アルコール' },
  { patterns: ['運動', 'ランニング', 'ウォーキング', 'ジム', 'トレーニング'], label: '運動' },
  { patterns: ['睡眠不足', '寝不足', '眠れなかった', '寝れなかった'], label: '睡眠不足' },
]

interface TimeMarker {
  index: number
  length: number
  date: Date
  label: string
}

function buildTimeWithHourMinute(now: Date, hour: number, minute: number): Date {
  const d = new Date(now)
  d.setHours(hour, minute, 0, 0)
  return d
}

/**
 * テキスト全体から時刻マーカーを検出して返す（出現順）
 */
function extractTimeMarkers(text: string, now: Date): TimeMarker[] {
  const markers: TimeMarker[] = []

  // 「今」→ 現在時刻
  const nowPattern = /今/g
  let m: RegExpExecArray | null
  while ((m = nowPattern.exec(text)) !== null) {
    markers.push({
      index: m.index,
      length: m[0].length,
      date: new Date(now),
      label: '現在',
    })
  }

  // 時刻キーワード（朝・昼・午後・夕方・夜・深夜/夜中）
  const keywordPatterns: { pattern: RegExp; hour: number; minute: number; label: string }[] = [
    { pattern: /深夜|夜中/g, hour: 0, minute: 0, label: '深夜' },
    { pattern: /朝/g,        hour: 8,  minute: 0, label: '朝' },
    { pattern: /昼/g,        hour: 12, minute: 0, label: '昼' },
    { pattern: /午後/g,      hour: 14, minute: 0, label: '午後' },
    { pattern: /夕方/g,      hour: 17, minute: 0, label: '夕方' },
    { pattern: /夜/g,        hour: 20, minute: 0, label: '夜' },
  ]

  for (const kw of keywordPatterns) {
    kw.pattern.lastIndex = 0
    while ((m = kw.pattern.exec(text)) !== null) {
      markers.push({
        index: m.index,
        length: m[0].length,
        date: buildTimeWithHourMinute(now, kw.hour, kw.minute),
        label: kw.label,
      })
    }
  }

  // "(\d{1,2})時(半)?" → HH:00 or HH:30
  const hourPattern = /(\d{1,2})時(半)?/g
  while ((m = hourPattern.exec(text)) !== null) {
    const hour = parseInt(m[1], 10)
    const minute = m[2] ? 30 : 0
    if (hour >= 0 && hour <= 23) {
      markers.push({
        index: m.index,
        length: m[0].length,
        date: buildTimeWithHourMinute(now, hour, minute),
        label: m[0],
      })
    }
  }

  // 出現位置でソート
  markers.sort((a, b) => a.index - b.index)
  return markers
}

interface Segment {
  text: string
  date: Date
  timeLabel: string
}

/**
 * テキストを時刻マーカーで分割し、セグメント配列を返す
 */
function splitIntoSegments(text: string, now: Date): Segment[] {
  const markers = extractTimeMarkers(text, now)

  if (markers.length === 0) {
    return [{ text, date: new Date(now), timeLabel: '現在' }]
  }

  const segments: Segment[] = []

  // 最初のマーカーより前にテキストがあれば、現在時刻のセグメントとして追加
  const firstMarker = markers[0]
  const textBeforeFirst = text.slice(0, firstMarker.index).trim()
  if (textBeforeFirst) {
    segments.push({ text: textBeforeFirst, date: new Date(now), timeLabel: '現在' })
  }

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    const nextMarker = markers[i + 1]
    const segStart = marker.index + marker.length
    const segEnd = nextMarker ? nextMarker.index : text.length
    const segText = text.slice(segStart, segEnd).trim()

    // マーカー直後のテキストをこのマーカーのセグメントに入れる
    // セグメントが空であっても次のマーカーの直前まで含む
    if (segText || !nextMarker) {
      segments.push({ text: segText, date: marker.date, timeLabel: marker.label })
    } else {
      // テキストがなく次のマーカーがある場合はスキップ（次のマーカーに吸収）
      // ただし次のマーカーが同じ位置でなければ空セグメントとして残す
      segments.push({ text: segText, date: marker.date, timeLabel: marker.label })
    }
  }

  return segments
}

function parseScore(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    const m = pattern.exec(text)
    if (m) {
      const v = parseInt(m[m.length - 1], 10)
      if (v >= 0 && v <= 100) return v
    }
  }
  return undefined
}

function matchEventKeywords(
  text: string,
  customEventLabels: string[],
): { label: string }[] {
  const found: { label: string }[] = []

  // 組み込みキーワード
  for (const kw of BUILTIN_EVENT_KEYWORDS) {
    for (const pattern of kw.patterns) {
      if (text.includes(pattern)) {
        found.push({ label: kw.label })
        break
      }
    }
  }

  // カスタムラベル
  for (const label of customEventLabels) {
    if (text.includes(label)) {
      found.push({ label })
    }
  }

  return found
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // フォールバック
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function parseVoiceInput(
  text: string,
  customEventLabels: string[],
): VoiceParseResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { items: [], originalText: text, warnings: [] }
  }

  const now = new Date()
  const segments = splitIntoSegments(trimmed, now)
  const items: ParsedVoiceItem[] = []
  const warnings: string[] = []

  for (const seg of segments) {
    const segText = seg.text

    // 体調スコア抽出
    const fatigue = parseScore(segText, [
      /疲労\s*(\d+)/,
      /疲れ\s*(\d+)/,
    ])
    const mood = parseScore(segText, [/気分\s*(\d+)/])
    const motivation = parseScore(segText, [
      /やる気\s*(\d+)/,
      /モチベーション\s*(\d+)/,
    ])
    const concentration = parseScore(segText, [/集中(力)?\s*(\d+)/])

    // スコアが1つでもあれば daily item 生成
    if (
      fatigue !== undefined ||
      mood !== undefined ||
      motivation !== undefined ||
      concentration !== undefined
    ) {
      const item: ParsedVoiceItem = {
        id: generateId(),
        type: 'daily',
        timeLabel: seg.timeLabel,
        recordedAt: seg.date,
        eventLabel: '',
        eventValue: false,
      }
      if (fatigue !== undefined) item.fatigue = fatigue
      if (mood !== undefined) item.mood = mood
      if (motivation !== undefined) item.motivation = motivation
      if (concentration !== undefined) item.concentration = concentration
      items.push(item)
    }

    // イベントキーワード抽出（各々独立した event item）
    const events = matchEventKeywords(segText, customEventLabels)
    for (const ev of events) {
      items.push({
        id: generateId(),
        type: 'event',
        timeLabel: seg.timeLabel,
        recordedAt: seg.date,
        eventLabel: ev.label,
        eventValue: true,
      })
    }

    // セグメントが空でスコアもイベントもない場合は警告
    if (
      segText &&
      fatigue === undefined &&
      mood === undefined &&
      motivation === undefined &&
      concentration === undefined &&
      events.length === 0
    ) {
      warnings.push(`認識できなかった部分: "${segText}"`)
    }
  }

  return { items, originalText: text, warnings }
}
