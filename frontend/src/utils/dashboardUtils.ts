import type { LatestRecord } from "../types";
import {
  parseUtc,
  toLocalDateStr,
  toLocalMinutes,
  toLocalTimeStr,
} from "./time";

export type MetricKey = "fatigue" | "mood" | "motivation" | "concentration";

export interface DailyAvg {
  date: string; // MM-DD
  fatigue: number | null;
  mood: number | null;
  motivation: number | null;
  concentration: number | null;
}

export interface WeekdayAvg {
  label: string;
  fatigue: number | null;
  mood: number | null;
  motivation: number | null;
  concentration: number | null;
}

export interface TimebandAvg {
  label: "朝" | "昼" | "夜";
  fatigue: number | null;
  mood: number | null;
  motivation: number | null;
  concentration: number | null;
}

export interface IntradayPoint {
  time: string;
  minutes: number;
  fatigue: number | null;
  mood: number | null;
  motivation: number | null;
  concentration: number | null;
}

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;

/** 分数 → HH:MM 文字列 */
export function minuteTick(v: number): string {
  return `${Math.floor(v / 60)
    .toString()
    .padStart(2, "0")}:${(v % 60).toString().padStart(2, "0")}`;
}

/** 時(0-23) → 時間帯 */
export function getTimeBand(hour: number): "朝" | "昼" | "夜" {
  if (hour >= 5 && hour < 12) return "朝";
  if (hour >= 12 && hour < 18) return "昼";
  return "夜";
}

type ScoreBucket = {
  fatigue: number[];
  mood: number[];
  motivation: number[];
  concentration: number[];
};

function emptyBucket(): ScoreBucket {
  return { fatigue: [], mood: [], motivation: [], concentration: [] };
}

function avg(arr: number[]): number | null {
  return arr.length
    ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
    : null;
}

function pushScores(bucket: ScoreBucket, r: LatestRecord): void {
  const f = parseFloat(r.fatigue_score);
  const m = parseFloat(r.mood_score);
  const mv = parseFloat(r.motivation_score);
  const c = parseFloat(r.concentration_score);
  if (!isNaN(f)) bucket.fatigue.push(f);
  if (!isNaN(m)) bucket.mood.push(m);
  if (!isNaN(mv)) bucket.motivation.push(mv);
  if (!isNaN(c)) bucket.concentration.push(c);
}

/** 日次平均を計算する（長期トレンド用） */
export function computeDailyAverages(
  records: LatestRecord[],
  cutoff: Date,
): DailyAvg[] {
  const byDate: Record<string, ScoreBucket> = {};
  for (const r of records) {
    if (r.record_type !== "daily") continue;
    const d = parseUtc(r.recorded_at);
    if (d < cutoff) continue;
    const key = toLocalDateStr(d);
    if (!byDate[key]) byDate[key] = emptyBucket();
    pushScores(byDate[key], r);
  }

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date: date.slice(5), // YYYY-MM-DD → MM-DD
      fatigue: avg(bucket.fatigue),
      mood: avg(bucket.mood),
      motivation: avg(bucket.motivation),
      concentration: avg(bucket.concentration),
    }));
}

/** 曜日別平均を計算する */
export function computeWeekdayAverages(
  records: LatestRecord[],
  cutoff: Date,
): WeekdayAvg[] {
  const byWeekday: Record<number, ScoreBucket> = {};
  for (let i = 0; i < 7; i++) byWeekday[i] = emptyBucket();

  for (const r of records) {
    if (r.record_type !== "daily") continue;
    const d = parseUtc(r.recorded_at);
    if (d < cutoff) continue;
    const jsDay = d.getDay();
    const monFirst = jsDay === 0 ? 6 : jsDay - 1; // 月=0 … 日=6
    pushScores(byWeekday[monFirst], r);
  }

  return WEEKDAY_LABELS.map((label, i) => ({
    label,
    fatigue: avg(byWeekday[i].fatigue),
    mood: avg(byWeekday[i].mood),
    motivation: avg(byWeekday[i].motivation),
    concentration: avg(byWeekday[i].concentration),
  }));
}

/** 時間帯別平均を計算する */
export function computeTimebandAverages(
  records: LatestRecord[],
  cutoff: Date,
): TimebandAvg[] {
  const bands: Record<"朝" | "昼" | "夜", ScoreBucket> = {
    朝: emptyBucket(),
    昼: emptyBucket(),
    夜: emptyBucket(),
  };

  for (const r of records) {
    if (r.record_type !== "daily") continue;
    const d = parseUtc(r.recorded_at);
    if (d < cutoff) continue;
    const band = getTimeBand(d.getHours());
    pushScores(bands[band], r);
  }

  return (["朝", "昼", "夜"] as const).map((label) => ({
    label,
    fatigue: avg(bands[label].fatigue),
    mood: avg(bands[label].mood),
    motivation: avg(bands[label].motivation),
    concentration: avg(bands[label].concentration),
  }));
}

/** 日内変動データを計算する */
export function computeIntradayData(
  records: LatestRecord[],
  selectedDate: string,
): IntradayPoint[] {
  return records
    .filter(
      (r) =>
        r.record_type === "daily" &&
        toLocalDateStr(parseUtc(r.recorded_at)) === selectedDate,
    )
    .map((r) => {
      const d = parseUtc(r.recorded_at);
      const f = parseFloat(r.fatigue_score);
      const m = parseFloat(r.mood_score);
      const mv = parseFloat(r.motivation_score);
      const c = parseFloat(r.concentration_score);
      return {
        time: toLocalTimeStr(d),
        minutes: toLocalMinutes(d),
        fatigue: isNaN(f) ? null : f,
        mood: isNaN(m) ? null : m,
        motivation: isNaN(mv) ? null : mv,
        concentration: isNaN(c) ? null : c,
      };
    })
    .sort((a, b) => a.minutes - b.minutes);
}
