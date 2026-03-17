/**
 * Athena タイムスタンプのパース・表示ユーティリティ
 *
 * Athena はタイムゾーン情報なしのタイムスタンプ文字列を返す。
 * フォーマットは "YYYY-MM-DD HH:MM:SS" または "YYYY-MM-DDTHH:MM:SS"。
 * どちらも UTC として扱い、'Z' を補完してパースする。
 */

/** Athena UTC タイムスタンプ → Date オブジェクト */
export function parseUtc(isoStr: string): Date {
  const s = isoStr.includes('T') ? isoStr : isoStr.replace(' ', 'T')
  return new Date(s.endsWith('Z') ? s : `${s}Z`)
}

/** Date → YYYY-MM-DD（ローカルタイムゾーン） */
export function toLocalDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE')
}

/** Date → HH:MM（ローカルタイムゾーン） */
export function toLocalTimeStr(d: Date): string {
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

/** ローカルタイムゾーンで午前0時からの経過分数 */
export function toLocalMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * 履歴一覧の日時表示用
 * Athena タイムスタンプを "M/D HH:MM" 形式（ローカル時刻）に変換する。
 */
export function formatTime(isoStr: string): string {
  try {
    const utcStr = isoStr.includes('T') ? isoStr : isoStr.replace(' ', 'T') + 'Z'
    return new Date(utcStr).toLocaleString('ja-JP', {
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return isoStr
  }
}
