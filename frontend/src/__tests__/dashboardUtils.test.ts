import { describe, it, expect } from "vitest";
import {
  minuteTick,
  getTimeBand,
  computeDailyAverages,
  computeWeekdayAverages,
  computeTimebandAverages,
  computeIntradayData,
} from "../utils/dashboardUtils";
import { parseUtc, toLocalDateStr } from "../utils/time";
import type { LatestRecord } from "../types";

// テスト用 LatestRecord ファクトリ
function makeRecord(
  overrides: Partial<LatestRecord> & { recorded_at: string },
): LatestRecord {
  return {
    id: "test-id",
    record_type: "daily",
    fatigue_score: "50",
    mood_score: "60",
    motivation_score: "70",
    concentration_score: "80",
    flags: "0",
    note: "",
    timezone: "Asia/Tokyo",
    device_id: "test-device",
    app_version: "1.0.0",
    custom_fields: "[]",
    written_at: overrides.recorded_at,
    ...overrides,
  };
}

// UTC 正午のタイムスタンプ（どのタイムゾーンでも同じ日付になる）
const UTC_NOON_JAN15 = "2024-01-15 12:00:00";
const UTC_NOON_JAN16 = "2024-01-16 12:00:00";
const UTC_NOON_JAN17 = "2024-01-17 12:00:00";

// テスト用の cutoff（Jan 14 正午 UTC より後 = Jan 15 以降が対象）
const CUTOFF_JAN14 = parseUtc("2024-01-14 12:00:00");

// selectedDate は parseUtc + toLocalDateStr から算出（タイムゾーン非依存）
const SELECTED_DATE_JAN15 = toLocalDateStr(parseUtc(UTC_NOON_JAN15));

// ==========================================================================
// minuteTick
// ==========================================================================
describe("minuteTick", () => {
  it("0分は 00:00 を返す", () => {
    expect(minuteTick(0)).toBe("00:00");
  });

  it("60分は 01:00 を返す", () => {
    expect(minuteTick(60)).toBe("01:00");
  });

  it("90分は 01:30 を返す", () => {
    expect(minuteTick(90)).toBe("01:30");
  });

  it("1439分は 23:59 を返す", () => {
    expect(minuteTick(1439)).toBe("23:59");
  });

  it("1分は 00:01 を返す", () => {
    expect(minuteTick(1)).toBe("00:01");
  });
});

// ==========================================================================
// getTimeBand
// ==========================================================================
describe("getTimeBand", () => {
  it("5時は 朝 を返す", () => {
    expect(getTimeBand(5)).toBe("朝");
  });

  it("11時は 朝 を返す", () => {
    expect(getTimeBand(11)).toBe("朝");
  });

  it("12時は 昼 を返す", () => {
    expect(getTimeBand(12)).toBe("昼");
  });

  it("17時は 昼 を返す", () => {
    expect(getTimeBand(17)).toBe("昼");
  });

  it("18時は 夜 を返す", () => {
    expect(getTimeBand(18)).toBe("夜");
  });

  it("4時は 夜 を返す（深夜）", () => {
    expect(getTimeBand(4)).toBe("夜");
  });

  it("0時は 夜 を返す", () => {
    expect(getTimeBand(0)).toBe("夜");
  });

  it("23時は 夜 を返す", () => {
    expect(getTimeBand(23)).toBe("夜");
  });
});

// ==========================================================================
// computeDailyAverages
// ==========================================================================
describe("computeDailyAverages", () => {
  it("空のレコードは空配列を返す", () => {
    expect(computeDailyAverages([], CUTOFF_JAN14)).toEqual([]);
  });

  it("cutoff より前のレコードは除外する", () => {
    const old = makeRecord({ recorded_at: "2024-01-13 12:00:00" });
    expect(computeDailyAverages([old], CUTOFF_JAN14)).toEqual([]);
  });

  it("daily 以外のレコードは除外する", () => {
    const event = makeRecord({
      recorded_at: UTC_NOON_JAN15,
      record_type: "event",
    });
    expect(computeDailyAverages([event], CUTOFF_JAN14)).toEqual([]);
  });

  it("1件のレコードを日次平均として集計する", () => {
    const r = makeRecord({
      recorded_at: UTC_NOON_JAN15,
      fatigue_score: "40",
      mood_score: "60",
      motivation_score: "80",
      concentration_score: "70",
    });
    const result = computeDailyAverages([r], CUTOFF_JAN14);
    expect(result).toHaveLength(1);
    expect(result[0].fatigue).toBe(40);
    expect(result[0].mood).toBe(60);
    expect(result[0].motivation).toBe(80);
    expect(result[0].concentration).toBe(70);
  });

  it("同日の複数レコードは平均される（四捨五入）", () => {
    const records = [
      makeRecord({
        recorded_at: UTC_NOON_JAN15,
        fatigue_score: "30",
        mood_score: "50",
        motivation_score: "60",
        concentration_score: "40",
      }),
      makeRecord({
        recorded_at: UTC_NOON_JAN15,
        fatigue_score: "50",
        mood_score: "70",
        motivation_score: "80",
        concentration_score: "60",
      }),
    ];
    const result = computeDailyAverages(records, CUTOFF_JAN14);
    expect(result).toHaveLength(1);
    expect(result[0].fatigue).toBe(40); // (30+50)/2
    expect(result[0].mood).toBe(60); // (50+70)/2
  });

  it("NaN のスコアは平均計算から除外される", () => {
    const r = makeRecord({
      recorded_at: UTC_NOON_JAN15,
      fatigue_score: "NaN",
      mood_score: "60",
      motivation_score: "70",
      concentration_score: "80",
    });
    const result = computeDailyAverages([r], CUTOFF_JAN14);
    expect(result[0].fatigue).toBeNull();
    expect(result[0].mood).toBe(60);
  });

  it("複数日のレコードは日付順にソートされる", () => {
    const records = [
      makeRecord({ recorded_at: UTC_NOON_JAN17 }),
      makeRecord({ recorded_at: UTC_NOON_JAN15 }),
      makeRecord({ recorded_at: UTC_NOON_JAN16 }),
    ];
    const result = computeDailyAverages(records, CUTOFF_JAN14);
    expect(result).toHaveLength(3);
    // 日付は MM-DD 形式で返ってくる
    expect(result[0].date).toBe("01-15");
    expect(result[1].date).toBe("01-16");
    expect(result[2].date).toBe("01-17");
  });

  it("値が全くない日のスコアは null になる", () => {
    const r = makeRecord({
      recorded_at: UTC_NOON_JAN15,
      fatigue_score: "",
      mood_score: "",
      motivation_score: "",
      concentration_score: "",
    });
    const result = computeDailyAverages([r], CUTOFF_JAN14);
    expect(result[0].fatigue).toBeNull();
    expect(result[0].mood).toBeNull();
  });
});

// ==========================================================================
// computeWeekdayAverages
// ==========================================================================
describe("computeWeekdayAverages", () => {
  it("常に月〜日の 7 件を返す", () => {
    const result = computeWeekdayAverages([], CUTOFF_JAN14);
    expect(result).toHaveLength(7);
    expect(result[0].label).toBe("月");
    expect(result[6].label).toBe("日");
  });

  it("空レコードの場合は全スコアが null", () => {
    const result = computeWeekdayAverages([], CUTOFF_JAN14);
    for (const row of result) {
      expect(row.fatigue).toBeNull();
      expect(row.mood).toBeNull();
    }
  });

  it("cutoff より前のレコードは除外する", () => {
    const old = makeRecord({ recorded_at: "2024-01-13 12:00:00" });
    const result = computeWeekdayAverages([old], CUTOFF_JAN14);
    // 全て null
    for (const row of result) {
      expect(row.fatigue).toBeNull();
    }
  });
});

// ==========================================================================
// computeTimebandAverages
// ==========================================================================
describe("computeTimebandAverages", () => {
  it("常に朝・昼・夜の 3 件を返す", () => {
    const result = computeTimebandAverages([], CUTOFF_JAN14);
    expect(result).toHaveLength(3);
    expect(result[0].label).toBe("朝");
    expect(result[1].label).toBe("昼");
    expect(result[2].label).toBe("夜");
  });

  it("空レコードの場合は全スコアが null", () => {
    const result = computeTimebandAverages([], CUTOFF_JAN14);
    for (const row of result) {
      expect(row.fatigue).toBeNull();
      expect(row.mood).toBeNull();
      expect(row.motivation).toBeNull();
      expect(row.concentration).toBeNull();
    }
  });
});

// ==========================================================================
// computeIntradayData
// ==========================================================================
describe("computeIntradayData", () => {
  it("対象日のレコードがない場合は空配列を返す", () => {
    const r = makeRecord({ recorded_at: UTC_NOON_JAN16 });
    expect(computeIntradayData([r], SELECTED_DATE_JAN15)).toEqual([]);
  });

  it("event・status タイプのレコードは除外する", () => {
    const event = makeRecord({
      recorded_at: UTC_NOON_JAN15,
      record_type: "event",
    });
    const status = makeRecord({
      recorded_at: UTC_NOON_JAN15,
      record_type: "status",
    });
    expect(computeIntradayData([event, status], SELECTED_DATE_JAN15)).toEqual(
      [],
    );
  });

  it("対象日の daily レコードを返す", () => {
    const r = makeRecord({
      recorded_at: UTC_NOON_JAN15,
      fatigue_score: "40",
      mood_score: "55",
      motivation_score: "65",
      concentration_score: "75",
    });
    const result = computeIntradayData([r], SELECTED_DATE_JAN15);
    expect(result).toHaveLength(1);
    expect(result[0].fatigue).toBe(40);
    expect(result[0].mood).toBe(55);
    expect(result[0].motivation).toBe(65);
    expect(result[0].concentration).toBe(75);
  });

  it("NaN スコアは null になる", () => {
    const r = makeRecord({
      recorded_at: UTC_NOON_JAN15,
      fatigue_score: "NaN",
      mood_score: "50",
      motivation_score: "NaN",
      concentration_score: "80",
    });
    const result = computeIntradayData([r], SELECTED_DATE_JAN15);
    expect(result[0].fatigue).toBeNull();
    expect(result[0].mood).toBe(50);
    expect(result[0].motivation).toBeNull();
    expect(result[0].concentration).toBe(80);
  });

  it("複数レコードは minutes 順にソートされる", () => {
    // UTC noon = local mid-day; UTC early = local early
    // UTC 12:00 → ローカル分 = getHours()*60 + getMinutes() (local)
    // 2つの異なる UTC 時刻 (ローカル時で順序が決まる)
    const r1 = makeRecord({ recorded_at: "2024-01-15 14:00:00" }); // 遅い
    const r2 = makeRecord({ recorded_at: "2024-01-15 10:00:00" }); // 早い
    // selectedDate を r2 と同じ日 = UTC 10:00 の local date
    const date = toLocalDateStr(parseUtc("2024-01-15 12:00:00"));
    const result = computeIntradayData([r1, r2], date);
    // r2(早い) が r1(遅い) より前に来る
    if (result.length === 2) {
      expect(result[0].minutes).toBeLessThanOrEqual(result[1].minutes);
    }
  });
});
