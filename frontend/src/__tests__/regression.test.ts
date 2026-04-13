import { describe, it, expect } from "vitest";
import { linearRegression, interpretCorrelation } from "../utils/regression";

describe("linearRegression", () => {
  it("3点未満の場合は null を返す", () => {
    expect(linearRegression([])).toBeNull();
    expect(linearRegression([{ x: 1, y: 2 }])).toBeNull();
    expect(
      linearRegression([
        { x: 1, y: 2 },
        { x: 2, y: 4 },
      ]),
    ).toBeNull();
  });

  it("完全な正の線形関係を正しく計算する", () => {
    const points = [
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
    ];
    const result = linearRegression(points);
    expect(result).not.toBeNull();
    expect(result!.slope).toBeCloseTo(2, 5);
    expect(result!.intercept).toBeCloseTo(0, 5);
    expect(result!.r).toBeCloseTo(1, 5);
    expect(result!.n).toBe(3);
  });

  it("完全な負の線形関係を正しく計算する", () => {
    const points = [
      { x: 1, y: 6 },
      { x: 2, y: 4 },
      { x: 3, y: 2 },
    ];
    const result = linearRegression(points);
    expect(result).not.toBeNull();
    expect(result!.slope).toBeCloseTo(-2, 5);
    expect(result!.r).toBeCloseTo(-1, 5);
  });

  it("x が全て同じ場合（ssXX === 0）は null を返す", () => {
    const points = [
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ];
    expect(linearRegression(points)).toBeNull();
  });

  it("y が全て同じ場合（ssYY === 0）は null を返す", () => {
    const points = [
      { x: 1, y: 5 },
      { x: 2, y: 5 },
      { x: 3, y: 5 },
    ];
    expect(linearRegression(points)).toBeNull();
  });
});

describe("interpretCorrelation", () => {
  it("r >= 0.7 は強い正の相関", () => {
    expect(interpretCorrelation(0.7)).toBe("強い正の相関");
    expect(interpretCorrelation(0.9)).toBe("強い正の相関");
    expect(interpretCorrelation(1.0)).toBe("強い正の相関");
  });

  it("r <= -0.7 は強い負の相関", () => {
    expect(interpretCorrelation(-0.7)).toBe("強い負の相関");
    expect(interpretCorrelation(-1.0)).toBe("強い負の相関");
  });

  it("0.4 <= r < 0.7 は中程度の正の相関", () => {
    expect(interpretCorrelation(0.4)).toBe("中程度の正の相関");
    expect(interpretCorrelation(0.6)).toBe("中程度の正の相関");
  });

  it("0.2 <= r < 0.4 は弱い正の相関", () => {
    expect(interpretCorrelation(0.2)).toBe("弱い正の相関");
    expect(interpretCorrelation(0.39)).toBe("弱い正の相関");
  });

  it("|r| < 0.2 はほぼ相関なし", () => {
    expect(interpretCorrelation(0.0)).toBe("ほぼ相関なし");
    expect(interpretCorrelation(0.1)).toBe("ほぼ相関なし");
    expect(interpretCorrelation(-0.1)).toBe("ほぼ相関なし");
  });
});
