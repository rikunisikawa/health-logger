import { describe, it, expect } from "vitest";
import { computeDailyAvg, computeWeekdayAvg } from "../utils/trendUtils";
import type { LatestRecord } from "../types";

function makeRecord(overrides: Partial<LatestRecord> = {}): LatestRecord {
  return {
    id: "test-id",
    record_type: "daily",
    fatigue_score: "",
    mood_score: "",
    motivation_score: "",
    concentration_score: "",
    flags: "0",
    note: "",
    recorded_at: "2026-04-10 10:00:00",
    timezone: "Asia/Tokyo",
    device_id: "",
    app_version: "1.0.0",
    custom_fields: "[]",
    written_at: "2026-04-10 10:00:00",
    ...overrides,
  };
}

describe("computeDailyAvg", () => {
  it("returns empty array when no records", () => {
    const result = computeDailyAvg([], 30);
    expect(result).toHaveLength(0);
  });

  it("computes daily averages for records within the period", () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yStr = yesterday.toISOString().replace("T", " ").slice(0, 19);

    const records = [
      makeRecord({
        fatigue_score: "60",
        mood_score: "70",
        motivation_score: "80",
        recorded_at: yStr,
      }),
      makeRecord({
        fatigue_score: "80",
        mood_score: "50",
        motivation_score: "60",
        recorded_at: yStr,
      }),
    ];
    const result = computeDailyAvg(records, 30);
    expect(result).toHaveLength(1);
    expect(result[0].fatigue).toBe(70); // avg(60,80)
    expect(result[0].mood).toBe(60); // avg(70,50)
    expect(result[0].motivation).toBe(70); // avg(80,60)
  });

  it("excludes records older than the specified days", () => {
    const now = new Date();
    const old = new Date(now);
    old.setDate(now.getDate() - 10);
    const oldStr = old.toISOString().replace("T", " ").slice(0, 19);

    const records = [makeRecord({ fatigue_score: "50", recorded_at: oldStr })];
    // 7-day window should exclude a 10-day-old record
    const result = computeDailyAvg(records, 7);
    expect(result).toHaveLength(0);
  });

  it("includes records within 7-day window", () => {
    const now = new Date();
    const fiveDaysAgo = new Date(now);
    fiveDaysAgo.setDate(now.getDate() - 5);
    const str = fiveDaysAgo.toISOString().replace("T", " ").slice(0, 19);

    const records = [makeRecord({ fatigue_score: "50", recorded_at: str })];
    const result = computeDailyAvg(records, 7);
    expect(result).toHaveLength(1);
    expect(result[0].fatigue).toBe(50);
  });

  it("excludes non-daily record_types", () => {
    const now = new Date();
    const str = now.toISOString().replace("T", " ").slice(0, 19);

    const records = [
      makeRecord({
        record_type: "event",
        fatigue_score: "50",
        recorded_at: str,
      }),
      makeRecord({
        record_type: "status",
        fatigue_score: "70",
        recorded_at: str,
      }),
    ];
    const result = computeDailyAvg(records, 30);
    expect(result).toHaveLength(0);
  });

  it("returns null for metrics with no valid data", () => {
    const now = new Date();
    const str = now.toISOString().replace("T", " ").slice(0, 19);

    const records = [
      makeRecord({
        fatigue_score: "60",
        mood_score: "",
        motivation_score: "",
        recorded_at: str,
      }),
    ];
    const result = computeDailyAvg(records, 30);
    expect(result).toHaveLength(1);
    expect(result[0].fatigue).toBe(60);
    expect(result[0].mood).toBeNull();
    expect(result[0].motivation).toBeNull();
  });

  it("returns rows sorted by date ascending", () => {
    const now = new Date();
    const d1 = new Date(now);
    d1.setDate(now.getDate() - 5);
    const d2 = new Date(now);
    d2.setDate(now.getDate() - 2);
    const str1 = d1.toISOString().replace("T", " ").slice(0, 19);
    const str2 = d2.toISOString().replace("T", " ").slice(0, 19);

    const records = [
      makeRecord({ fatigue_score: "40", recorded_at: str2 }),
      makeRecord({ fatigue_score: "80", recorded_at: str1 }),
    ];
    const result = computeDailyAvg(records, 30);
    expect(result[0].fatigue).toBe(80); // older date first
    expect(result[1].fatigue).toBe(40);
  });
});

describe("computeWeekdayAvg", () => {
  it("returns 7 entries (Mon–Sun) always", () => {
    const result = computeWeekdayAvg([], 30);
    expect(result).toHaveLength(7);
    expect(result[0].label).toBe("月");
    expect(result[6].label).toBe("日");
  });

  it("groups records by day of week correctly", () => {
    // 2026-04-13 is a Monday (月).
    // Use 10:00 and 12:00 UTC so both are still Monday in JST (UTC+9: 19:00 and 21:00).
    const records = [
      makeRecord({ fatigue_score: "60", recorded_at: "2026-04-13 10:00:00" }),
      makeRecord({ fatigue_score: "80", recorded_at: "2026-04-13 12:00:00" }),
    ];
    const result = computeWeekdayAvg(records, 30);
    expect(result[0].label).toBe("月");
    expect(result[0].fatigue).toBe(70); // avg(60,80)
  });

  it("returns null for weekdays with no data", () => {
    // Only Monday records
    const records = [
      makeRecord({ fatigue_score: "50", recorded_at: "2026-04-13 10:00:00" }),
    ];
    const result = computeWeekdayAvg(records, 30);
    expect(result[0].fatigue).toBe(50); // 月
    expect(result[1].fatigue).toBeNull(); // 火
  });

  it("respects the days cutoff", () => {
    // Record 60 days ago — excluded from 30-day window
    const now = new Date();
    const old = new Date(now);
    old.setDate(now.getDate() - 60);
    const oldStr = old.toISOString().replace("T", " ").slice(0, 19);

    const records = [makeRecord({ fatigue_score: "99", recorded_at: oldStr })];
    const result = computeWeekdayAvg(records, 30);
    const allNull = result.every((r) => r.fatigue === null);
    expect(allNull).toBe(true);
  });
});
