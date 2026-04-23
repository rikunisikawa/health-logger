import { useState, useCallback } from "react";
import { getRecords } from "../api";
import { useAuth } from "../hooks/useAuth";
import type { LatestRecord } from "../types";
import { formatTime, toLocalDateStr } from "../utils/time";
import { buildSummaryParts } from "../utils/recordSummary";

const FLAG_LABELS: [number, string][] = [
  [1, "睡眠不足"],
  [2, "頭痛"],
  [4, "腹痛"],
  [8, "運動"],
  [16, "飲酒"],
  [32, "カフェイン"],
];

function decodeFlags(flags: string | number): string[] {
  const n = typeof flags === "string" ? parseInt(flags, 10) : flags;
  if (isNaN(n) || n === 0) return [];
  return FLAG_LABELS.filter(([bit]) => (n & bit) !== 0).map(
    ([, label]) => label,
  );
}

function subDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - days);
  return toLocalDateStr(d);
}

function RecordCard({ record }: { record: LatestRecord }) {
  const parts = buildSummaryParts(record);
  const flagLabels = decodeFlags(record.flags);
  return (
    <div className="card mb-2 border-0 shadow-sm">
      <div className="card-body py-2 px-3">
        <div className="d-flex align-items-center">
          <small className="fw-semibold text-secondary">
            {formatTime(record.recorded_at)}
          </small>
          <span
            className={`badge ms-2 ${
              record.record_type === "event"
                ? "bg-info"
                : record.record_type === "status"
                  ? "bg-secondary"
                  : "bg-success"
            } bg-opacity-75`}
          >
            {record.record_type === "event"
              ? "イベント"
              : record.record_type === "status"
                ? "ステータス"
                : "日次"}
          </span>
        </div>
        {parts.length > 0 && (
          <div className="small text-muted mt-1">{parts.join(" / ")}</div>
        )}
        {flagLabels.length > 0 && (
          <div className="mt-1">
            {flagLabels.map((f) => (
              <span
                key={f}
                className="badge bg-light text-dark border me-1"
                style={{ fontSize: "0.7rem" }}
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface DaySummaryProps {
  label: string;
  records: LatestRecord[];
  loading: boolean;
}

function DaySummary({ label, records, loading }: DaySummaryProps) {
  const daily = records.filter((r) => r.record_type === "daily");

  const avgOf = (vals: string[]): string | null => {
    const nums = vals.map((v) => parseFloat(v)).filter((n) => !isNaN(n));
    if (nums.length === 0) return null;
    return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1);
  };

  const avgFatigue = avgOf(daily.map((r) => r.fatigue_score));
  const avgMood = avgOf(daily.map((r) => r.mood_score));
  const avgMotivation = avgOf(daily.map((r) => r.motivation_score));

  return (
    <div className="p-2 rounded bg-light h-100">
      <small
        className="fw-bold text-muted d-block mb-1"
        style={{ fontSize: "0.7rem" }}
      >
        {label}
      </small>
      {loading ? (
        <small className="text-muted">読込中…</small>
      ) : records.length === 0 ? (
        <small className="text-muted">記録なし</small>
      ) : (
        <>
          <div className="small">
            {avgFatigue !== null && (
              <span className="me-2">
                疲労: <b>{avgFatigue}</b>
              </span>
            )}
            {avgMood !== null && (
              <span className="me-2">
                気分: <b>{avgMood}</b>
              </span>
            )}
            {avgMotivation !== null && (
              <span>
                やる気: <b>{avgMotivation}</b>
              </span>
            )}
          </div>
          <small className="text-muted">{records.length} 件</small>
        </>
      )}
    </div>
  );
}

export default function HistoryBrowser() {
  const { token } = useAuth();
  const today = toLocalDateStr(new Date());

  const [tab, setTab] = useState<"single" | "range">("single");

  // Single-date state
  const [selectedDate, setSelectedDate] = useState(today);
  const [dayRecords, setDayRecords] = useState<LatestRecord[]>([]);
  const [lastWeekRecords, setLastWeekRecords] = useState<LatestRecord[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [hasFetchedDay, setHasFetchedDay] = useState(false);

  // Range state
  const [dateFrom, setDateFrom] = useState(subDays(today, 7));
  const [dateTo, setDateTo] = useState(today);
  const [rangeRecords, setRangeRecords] = useState<LatestRecord[]>([]);
  const [loadingRange, setLoadingRange] = useState(false);
  const [hasFetchedRange, setHasFetchedRange] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const fetchDay = useCallback(
    async (date: string) => {
      if (!token) return;
      setLoadingDay(true);
      setError(null);
      const lastWeekDate = subDays(date, 7);
      try {
        const [dayRes, lastWeekRes] = await Promise.all([
          getRecords(token, { dateFrom: date, dateTo: date, limit: 100 }),
          getRecords(token, {
            dateFrom: lastWeekDate,
            dateTo: lastWeekDate,
            limit: 100,
          }),
        ]);
        setDayRecords(dayRes.records);
        setLastWeekRecords(lastWeekRes.records);
        setHasFetchedDay(true);
      } catch (e) {
        setError((e as Error).message ?? "取得に失敗しました");
      } finally {
        setLoadingDay(false);
      }
    },
    [token],
  );

  const fetchRange = useCallback(async () => {
    if (!token) return;
    setLoadingRange(true);
    setError(null);
    try {
      const res = await getRecords(token, { dateFrom, dateTo, limit: 200 });
      setRangeRecords(res.records);
      setHasFetchedRange(true);
    } catch (e) {
      setError((e as Error).message ?? "取得に失敗しました");
    } finally {
      setLoadingRange(false);
    }
  }, [token, dateFrom, dateTo]);

  return (
    <div>
      <div className="btn-group w-100 mb-3" role="group">
        <button
          className={`btn btn-sm ${tab === "single" ? "btn-success" : "btn-outline-secondary"}`}
          onClick={() => setTab("single")}
        >
          日付指定
        </button>
        <button
          className={`btn btn-sm ${tab === "range" ? "btn-success" : "btn-outline-secondary"}`}
          onClick={() => setTab("range")}
        >
          期間指定
        </button>
      </div>

      {error && (
        <div className="alert alert-danger py-1 small mb-3">{error}</div>
      )}

      {tab === "single" && (
        <div>
          <div className="d-flex gap-2 align-items-center mb-3">
            <input
              type="date"
              className="form-control form-control-sm"
              value={selectedDate}
              max={today}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button
              className="btn btn-sm btn-success"
              style={{ whiteSpace: "nowrap" }}
              onClick={() => fetchDay(selectedDate)}
              disabled={loadingDay}
            >
              {loadingDay ? "…" : "検索"}
            </button>
          </div>

          {hasFetchedDay && (
            <>
              <div className="d-flex gap-2 mb-3">
                <div className="flex-fill">
                  <DaySummary
                    label={selectedDate}
                    records={dayRecords}
                    loading={loadingDay}
                  />
                </div>
                <div className="flex-fill">
                  <DaySummary
                    label={`先週同曜日 (${subDays(selectedDate, 7)})`}
                    records={lastWeekRecords}
                    loading={loadingDay}
                  />
                </div>
              </div>

              {dayRecords.length > 0 ? (
                <>
                  <small className="text-muted d-block mb-2">
                    {dayRecords.length} 件の記録
                  </small>
                  {dayRecords.map((r) => (
                    <RecordCard key={r.id} record={r} />
                  ))}
                </>
              ) : (
                !loadingDay && (
                  <p className="text-muted small">この日の記録はありません。</p>
                )
              )}
            </>
          )}
        </div>
      )}

      {tab === "range" && (
        <div>
          <div className="row g-2 mb-3">
            <div className="col">
              <label
                className="form-label form-label-sm mb-1 text-muted"
                style={{ fontSize: "0.75rem" }}
              >
                開始日
              </label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="col">
              <label
                className="form-label form-label-sm mb-1 text-muted"
                style={{ fontSize: "0.75rem" }}
              >
                終了日
              </label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={dateTo}
                max={today}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
          <button
            className="btn btn-sm btn-success w-100 mb-3"
            onClick={fetchRange}
            disabled={loadingRange}
          >
            {loadingRange ? "読み込み中…" : "期間で検索"}
          </button>

          {hasFetchedRange &&
            (rangeRecords.length > 0 ? (
              <>
                <small className="text-muted d-block mb-2">
                  {rangeRecords.length} 件の記録
                </small>
                {rangeRecords.map((r) => (
                  <RecordCard key={r.id} record={r} />
                ))}
              </>
            ) : (
              !loadingRange && (
                <p className="text-muted small">この期間に記録はありません。</p>
              )
            ))}

          {!hasFetchedRange && (
            <p className="text-muted small">
              期間を選択して「期間で検索」を押してください。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
