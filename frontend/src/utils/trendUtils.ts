import type { LatestRecord } from "../types";

export interface DailyAvg {
  date: string; // MM-DD
  fatigue: number | null;
  mood: number | null;
  motivation: number | null;
  concentration: number | null;
}

export interface WeekdayAvg {
  label: string; // 月〜日
  fatigue: number | null;
  mood: number | null;
  motivation: number | null;
  concentration: number | null;
}

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

function parseRecordDate(recorded_at: string): Date {
  // Athena returns "YYYY-MM-DD HH:MM:SS" (UTC) or ISO 8601
  if (recorded_at.includes("T")) {
    return new Date(recorded_at);
  }
  return new Date(recorded_at.replace(" ", "T") + "Z");
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

export function computeDailyAvg(
  records: LatestRecord[],
  days: number,
): DailyAvg[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  type Bucket = {
    fatigue: number[];
    mood: number[];
    motivation: number[];
    concentration: number[];
  };
  const byDate: Record<string, Bucket> = {};

  for (const r of records) {
    if (r.record_type !== "daily") continue;
    const d = parseRecordDate(r.recorded_at);
    if (d < cutoff) continue;

    // Local date string YYYY-MM-DD using local timezone
    const key = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");

    if (!byDate[key])
      byDate[key] = {
        fatigue: [],
        mood: [],
        motivation: [],
        concentration: [],
      };
    const f = parseFloat(r.fatigue_score);
    const m = parseFloat(r.mood_score);
    const mv = parseFloat(r.motivation_score);
    const c = parseFloat(r.concentration_score);
    if (!isNaN(f)) byDate[key].fatigue.push(f);
    if (!isNaN(m)) byDate[key].mood.push(m);
    if (!isNaN(mv)) byDate[key].motivation.push(mv);
    if (!isNaN(c)) byDate[key].concentration.push(c);
  }

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date: date.slice(5), // MM-DD
      fatigue: avg(bucket.fatigue),
      mood: avg(bucket.mood),
      motivation: avg(bucket.motivation),
      concentration: avg(bucket.concentration),
    }));
}

export function computeWeekdayAvg(
  records: LatestRecord[],
  days: number,
): WeekdayAvg[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  type Bucket = {
    fatigue: number[];
    mood: number[];
    motivation: number[];
    concentration: number[];
  };
  const byWeekday: Bucket[] = Array.from({ length: 7 }, () => ({
    fatigue: [],
    mood: [],
    motivation: [],
    concentration: [],
  }));

  for (const r of records) {
    if (r.record_type !== "daily") continue;
    const d = parseRecordDate(r.recorded_at);
    if (d < cutoff) continue;

    // JS: 0=日, 1=月, ..., 6=土 → 月始まりに変換 (月=0, ..., 日=6)
    const jsDay = d.getDay();
    const monFirst = jsDay === 0 ? 6 : jsDay - 1;

    const f = parseFloat(r.fatigue_score);
    const m = parseFloat(r.mood_score);
    const mv = parseFloat(r.motivation_score);
    const c = parseFloat(r.concentration_score);
    if (!isNaN(f)) byWeekday[monFirst].fatigue.push(f);
    if (!isNaN(m)) byWeekday[monFirst].mood.push(m);
    if (!isNaN(mv)) byWeekday[monFirst].motivation.push(mv);
    if (!isNaN(c)) byWeekday[monFirst].concentration.push(c);
  }

  return WEEKDAY_LABELS.map((label, i) => ({
    label,
    fatigue: avg(byWeekday[i].fatigue),
    mood: avg(byWeekday[i].mood),
    motivation: avg(byWeekday[i].motivation),
    concentration: avg(byWeekday[i].concentration),
  }));
}
