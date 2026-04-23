import { useCallback, useEffect, useState } from "react";
import { getNextDayEffects } from "../api";
import type { NextDayInsight, NextDayEventType } from "../types";

const EVENT_LABELS: Record<NextDayEventType, string> = {
  exercise: "運動",
  alcohol: "飲酒",
  caffeine: "カフェイン",
};

const SCORE_LABELS = [
  { key: "avg_fatigue" as const, label: "疲労感", inverse: true },
  { key: "avg_mood" as const, label: "気分" },
  { key: "avg_motivation" as const, label: "やる気" },
];

function DiffBadge({ diff, inverse }: { diff: number; inverse?: boolean }) {
  const positive = inverse ? diff < 0 : diff > 0;
  const negative = inverse ? diff > 0 : diff < 0;
  const color = positive ? "#198754" : negative ? "#dc3545" : "#6c757d";
  const sign = diff > 0 ? "+" : "";
  return (
    <span style={{ color, fontWeight: 600, fontSize: 12 }}>
      {sign}
      {diff.toFixed(1)}
    </span>
  );
}

function InsightCard({ insight }: { insight: NextDayInsight }) {
  const label = EVENT_LABELS[insight.event];
  const { with_event, without_event } = insight;

  return (
    <div className="card mb-3" style={{ borderLeft: "4px solid #0d6efd" }}>
      <div className="card-body py-3">
        <h6 className="card-title mb-2" style={{ fontSize: 14 }}>
          <span className="badge bg-primary me-2">{label}</span>
          翌日スコアの比較
        </h6>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
          }}
        >
          {SCORE_LABELS.map(({ key, label: scoreLabel, inverse }) => {
            const withVal = with_event[key];
            const withoutVal = without_event[key];
            const diff = withVal - withoutVal;
            return (
              <div
                key={key}
                className="text-center p-2 rounded"
                style={{ background: "#f8f9fa" }}
              >
                <div
                  style={{ fontSize: 11, color: "#6c757d", marginBottom: 2 }}
                >
                  {scoreLabel}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {withVal.toFixed(1)}
                  <span
                    style={{ fontSize: 11, color: "#aaa", fontWeight: 400 }}
                  >
                    {" "}
                    vs {withoutVal.toFixed(1)}
                  </span>
                </div>
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  <DiffBadge diff={diff} inverse={inverse} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2" style={{ fontSize: 11, color: "#6c757d" }}>
          {label}あり: {with_event.n}件 / なし: {without_event.n}件
        </div>
      </div>
    </div>
  );
}

interface Props {
  token: string;
}

export function InsightCards({ token }: Props) {
  const [days, setDays] = useState<30 | 90>(90);
  const [insights, setInsights] = useState<NextDayInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (d: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getNextDayEffects(token, d);
        setInsights(res.insights);
      } catch (e) {
        setError(e instanceof Error ? e.message : "取得失敗");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void fetchData(days);
  }, [days, fetchData]);

  return (
    <div>
      <div className="d-flex gap-2 mb-3 align-items-center">
        <span className="small text-muted">集計期間:</span>
        {([30, 90] as const).map((d) => (
          <button
            key={d}
            className={`btn btn-sm ${days === d ? "btn-success" : "btn-outline-secondary"}`}
            onClick={() => setDays(d)}
          >
            {d}日
          </button>
        ))}
      </div>

      {loading && <p className="text-muted small">読み込み中...</p>}
      {error && <p className="text-danger small">{error}</p>}

      {!loading && !error && insights.length === 0 && (
        <p className="text-muted small">
          表示できるデータがありません（各グループ10件以上必要）
        </p>
      )}

      {!loading &&
        insights.map((insight) => (
          <InsightCard key={insight.event} insight={insight} />
        ))}
    </div>
  );
}
