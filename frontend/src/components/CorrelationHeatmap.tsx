import { useCallback, useEffect, useState } from "react";
import { getCorrelation } from "../api";
import type { CorrelationItem, CorrelationResponse } from "../types";

const MIN_SAMPLES = 7;

const ITEM_LABELS: Record<CorrelationItem, string> = {
  fatigue: "疲労感",
  mood: "気分",
  motivation: "やる気",
  poor_sleep: "睡眠不足",
  headache: "頭痛",
  stomachache: "腹痛",
  exercise: "運動",
  alcohol: "飲酒",
  caffeine: "カフェイン",
};

interface TooltipState {
  rowItem: string;
  colItem: string;
  r: number | null;
  n: number;
  x: number;
  y: number;
}

function corrToColor(r: number): string {
  // -1 → #2166ac (blue), 0 → #f7f7f7 (white), +1 → #d6604d (red)
  if (r >= 0) {
    const t = r; // 0..1
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
    const r_ = lerp(0xf7, 0xd6);
    const g_ = lerp(0xf7, 0x60);
    const b_ = lerp(0xf7, 0x4d);
    return `rgb(${r_},${g_},${b_})`;
  } else {
    const t = -r; // 0..1
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
    const r_ = lerp(0xf7, 0x21);
    const g_ = lerp(0xf7, 0x66);
    const b_ = lerp(0xf7, 0xac);
    return `rgb(${r_},${g_},${b_})`;
  }
}

interface Props {
  token: string;
}

export function CorrelationHeatmap({ token }: Props) {
  const [days, setDays] = useState<30 | 90>(90);
  const [data, setData] = useState<CorrelationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const fetchData = useCallback(
    async (d: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getCorrelation(token, d);
        setData(res);
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

  const handleDaysChange = (d: 30 | 90) => {
    setDays(d);
  };

  if (loading) {
    return <p className="text-muted small">読み込み中...</p>;
  }
  if (error) {
    return <p className="text-danger small">{error}</p>;
  }
  if (!data) {
    return null;
  }

  const items = data.items as CorrelationItem[];
  const n = items.length;

  return (
    <div>
      {/* Period toggle */}
      <div className="d-flex gap-2 mb-3 align-items-center">
        <span className="small text-muted">集計期間:</span>
        {([30, 90] as const).map((d) => (
          <button
            key={d}
            className={`btn btn-sm ${days === d ? "btn-success" : "btn-outline-secondary"}`}
            onClick={() => handleDaysChange(d)}
          >
            {d}日
          </button>
        ))}
      </div>

      {/* Heatmap grid */}
      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `80px repeat(${n}, 48px)`,
            gridTemplateRows: `48px repeat(${n}, 48px)`,
            gap: 2,
            fontSize: 11,
          }}
        >
          {/* Top-left empty cell */}
          <div />

          {/* Column headers */}
          {items.map((col) => (
            <div
              key={col}
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 4,
                fontWeight: 600,
                writingMode: "vertical-rl",
                textOrientation: "mixed",
                transform: "rotate(180deg)",
                lineHeight: 1,
                color: "#555",
              }}
            >
              {ITEM_LABELS[col]}
            </div>
          ))}

          {/* Rows */}
          {items.map((row) => (
            <>
              {/* Row header */}
              <div
                key={`row-${row}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingRight: 6,
                  fontWeight: 600,
                  color: "#555",
                  whiteSpace: "nowrap",
                }}
              >
                {ITEM_LABELS[row]}
              </div>

              {/* Cells */}
              {items.map((col) => {
                const r = data.matrix[row]?.[col] ?? null;
                const countKey = `${row}-${col}`;
                const revKey = `${col}-${row}`;
                const n_ =
                  data.sample_counts[countKey] ??
                  data.sample_counts[revKey] ??
                  0;
                const isSelf = row === col;
                const insufficient =
                  !isSelf && (r === null || n_ < MIN_SAMPLES);

                let bg: string;
                let textColor: string;
                let cellText: string;

                if (isSelf) {
                  bg = "#ccc";
                  textColor = "#555";
                  cellText = "—";
                } else if (insufficient) {
                  bg = "#e9ecef";
                  textColor = "#aaa";
                  cellText = "n/a";
                } else {
                  bg = corrToColor(r as number);
                  const brightness = parseInt(bg.slice(4), 10);
                  textColor = brightness < 100 ? "#fff" : "#333";
                  cellText = (r as number).toFixed(2);
                }

                return (
                  <div
                    key={`${row}-${col}`}
                    style={{
                      background: bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 3,
                      cursor: isSelf || insufficient ? "default" : "pointer",
                      color: textColor,
                      fontWeight: 500,
                      fontSize: 10,
                      position: "relative",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelf) {
                        setTooltip({
                          rowItem: row,
                          colItem: col,
                          r,
                          n: n_,
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }
                    }}
                    onMouseMove={(e) => {
                      if (tooltip) {
                        setTooltip((prev) =>
                          prev ? { ...prev, x: e.clientX, y: e.clientY } : null,
                        );
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {cellText}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Color scale legend */}
      <div
        className="d-flex align-items-center gap-2 mt-3"
        style={{ fontSize: 11 }}
      >
        <span style={{ color: "#2166ac", fontWeight: 600 }}>-1.0 負の相関</span>
        <div
          style={{
            flex: 1,
            height: 10,
            background: "linear-gradient(to right, #2166ac, #f7f7f7, #d6604d)",
            borderRadius: 4,
            maxWidth: 160,
          }}
        />
        <span style={{ color: "#d6604d", fontWeight: 600 }}>+1.0 正の相関</span>
        <span className="ms-3" style={{ color: "#aaa" }}>
          ■ n/a: データ不足 ({"<"}
          {MIN_SAMPLES}件)
        </span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 12,
            top: tooltip.y + 12,
            background: "rgba(0,0,0,0.8)",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            pointerEvents: "none",
            zIndex: 9999,
            whiteSpace: "nowrap",
          }}
        >
          <div>
            {ITEM_LABELS[tooltip.rowItem as CorrelationItem]} ×{" "}
            {ITEM_LABELS[tooltip.colItem as CorrelationItem]}
          </div>
          <div>
            r ={" "}
            {tooltip.r !== null && tooltip.n >= MIN_SAMPLES
              ? tooltip.r.toFixed(4)
              : "データ不足"}
          </div>
          <div>n = {tooltip.n} 件</div>
        </div>
      )}
    </div>
  );
}
