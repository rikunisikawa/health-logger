import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getWeeklySummary } from "../api";
import type { SummaryDay } from "../types";

interface Props {
  token: string;
  days?: number;
}

interface ChartPoint {
  date: string;
  fatigue: number | null;
  mood: number | null;
  motivation: number | null;
}

interface StatRow {
  label: string;
  avg: string;
  max: string;
  min: string;
  color: string;
}

function toNum(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : Math.round(n * 10) / 10;
}

function fmt(v: number | null): string {
  return v == null ? "—" : String(v);
}

export default function WeeklySummaryCard({ token, days = 7 }: Props) {
  const [summaries, setSummaries] = useState<SummaryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getWeeklySummary(token, days)
      .then((res) => setSummaries(res.summaries))
      .catch((e: unknown) =>
        setError((e as Error).message ?? "取得に失敗しました"),
      )
      .finally(() => setLoading(false));
  }, [token, days]);

  if (loading) return <p className="text-muted small">読み込み中…</p>;
  if (error) return <div className="alert alert-warning small">{error}</div>;
  if (summaries.length === 0) {
    return (
      <p className="text-muted small">
        集計データがありません（毎日 AM 2:00 に前日分を集計）。
      </p>
    );
  }

  const sorted = [...summaries].sort((a, b) => a.date.localeCompare(b.date));

  const chartData: ChartPoint[] = sorted.map((s) => ({
    date: s.date.slice(5),
    fatigue: toNum(s.avg_fatigue),
    mood: toNum(s.avg_mood),
    motivation: toNum(s.avg_motivation),
  }));

  // 期間全体の統計（最新 days 日のサマリーから計算）
  const statsRows: StatRow[] = [
    {
      label: "疲労度",
      avg: fmt(
        toNum(
          (
            sorted.reduce((s, d) => s + (toNum(d.avg_fatigue) ?? 0), 0) /
            sorted.filter((d) => d.avg_fatigue != null).length
          ).toFixed(1),
        ),
      ),
      max: fmt(
        sorted.reduce<number | null>((best, d) => {
          const v = toNum(d.max_fatigue);
          return v == null ? best : best == null ? v : Math.max(best, v);
        }, null),
      ),
      min: fmt(
        sorted.reduce<number | null>((best, d) => {
          const v = toNum(d.min_fatigue);
          return v == null ? best : best == null ? v : Math.min(best, v);
        }, null),
      ),
      color: "#dc3545",
    },
    {
      label: "気分",
      avg: fmt(
        toNum(
          (
            sorted.reduce((s, d) => s + (toNum(d.avg_mood) ?? 0), 0) /
            sorted.filter((d) => d.avg_mood != null).length
          ).toFixed(1),
        ),
      ),
      max: fmt(
        sorted.reduce<number | null>((best, d) => {
          const v = toNum(d.max_mood);
          return v == null ? best : best == null ? v : Math.max(best, v);
        }, null),
      ),
      min: fmt(
        sorted.reduce<number | null>((best, d) => {
          const v = toNum(d.min_mood);
          return v == null ? best : best == null ? v : Math.min(best, v);
        }, null),
      ),
      color: "#fd7e14",
    },
    {
      label: "やる気",
      avg: fmt(
        toNum(
          (
            sorted.reduce((s, d) => s + (toNum(d.avg_motivation) ?? 0), 0) /
            sorted.filter((d) => d.avg_motivation != null).length
          ).toFixed(1),
        ),
      ),
      max: fmt(
        sorted.reduce<number | null>((best, d) => {
          const v = toNum(d.max_motivation);
          return v == null ? best : best == null ? v : Math.max(best, v);
        }, null),
      ),
      min: fmt(
        sorted.reduce<number | null>((best, d) => {
          const v = toNum(d.min_motivation);
          return v == null ? best : best == null ? v : Math.min(best, v);
        }, null),
      ),
      color: "#198754",
    },
  ];

  return (
    <div>
      {/* 折れ線グラフ */}
      <ResponsiveContainer width="100%" height={240}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 8, left: -20, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="fatigue"
            name="疲労度"
            stroke="#dc3545"
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="mood"
            name="気分"
            stroke="#fd7e14"
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="motivation"
            name="やる気"
            stroke="#198754"
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>

      {/* 平均・最大・最小 テーブル */}
      <div className="table-responsive mt-3">
        <table
          className="table table-sm table-bordered mb-0"
          style={{ fontSize: 13 }}
        >
          <thead className="table-light">
            <tr>
              <th>指標</th>
              <th className="text-center">平均</th>
              <th className="text-center">最大</th>
              <th className="text-center">最小</th>
            </tr>
          </thead>
          <tbody>
            {statsRows.map((row) => (
              <tr key={row.label}>
                <td>
                  <span
                    className="badge me-1"
                    style={{ background: row.color, fontSize: 10 }}
                  >
                    &nbsp;
                  </span>
                  {row.label}
                </td>
                <td className="text-center fw-semibold">{row.avg}</td>
                <td className="text-center text-danger">{row.max}</td>
                <td className="text-center text-primary">{row.min}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted small mt-1 mb-0">
        ※ DynamoDB キャッシュから取得（毎日 AM 2:00 更新）
      </p>
    </div>
  );
}
