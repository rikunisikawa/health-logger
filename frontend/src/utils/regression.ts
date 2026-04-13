export interface CorrPoint {
  x: number;
  y: number;
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  r: number;
  n: number;
}

export function linearRegression(points: CorrPoint[]): RegressionResult | null {
  const n = points.length;
  if (n < 3) return null;

  const sumX = points.reduce((acc, p) => acc + p.x, 0);
  const sumY = points.reduce((acc, p) => acc + p.y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  let ssXX = 0;
  let ssXY = 0;
  let ssYY = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    ssXX += dx * dx;
    ssXY += dx * dy;
    ssYY += dy * dy;
  }

  if (ssXX === 0 || ssYY === 0) return null;

  const slope = ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const r = ssXY / Math.sqrt(ssXX * ssYY);

  return { slope, intercept, r, n };
}

export function interpretCorrelation(r: number): string {
  const abs = Math.abs(r);
  const dir = r >= 0 ? "正" : "負";
  if (abs >= 0.7) return `強い${dir}の相関`;
  if (abs >= 0.4) return `中程度の${dir}の相関`;
  if (abs >= 0.2) return `弱い${dir}の相関`;
  return "ほぼ相関なし";
}
