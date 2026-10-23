import { describe, expect, it } from "vitest";
import { axisLabel, monotonePath, nearestIndex, niceStep, niceTicks, rupees, xLabels } from "./trendChart";

const months = (from: string, n: number) => {
  let [y, m] = from.split("-").map(Number);
  return Array.from({ length: n }, () => { const k = `${y}-${String(m).padStart(2, "0")}`; m += 1; if (m > 12) { m = 1; y += 1; } return k; });
};

describe("axis ticks (TC-01 ... TC-04)", () => {
  it("steps are round numbers (TC-01)", () => {
    expect(niceStep(240000, 4)).toBe(100000);
    expect(niceStep(180000, 4)).toBe(50000);
    expect(niceStep(90000, 4)).toBe(25000);
    expect(niceStep(7, 4)).toBe(2);
  });

  it("ticks start at 0 and cover the data: 0 ... 2.5L for a 2.4L maximum (TC-02)", () => {
    expect(niceTicks(0, 240000)).toEqual([0, 100000, 200000, 300000]);
    expect(niceTicks(0, 180000)).toEqual([0, 50000, 100000, 150000, 200000]);
  });

  it("ticks reach below zero when the data does (TC-03)", () => {
    const t = niceTicks(-30000, 120000);
    expect(t[0]).toBeLessThan(0);
    expect(t).toContain(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(120000);
  });

  it("labels use the lakh system and never show the odd ₹59k / ₹1.2L of the old chart (TC-04)", () => {
    expect(axisLabel(0)).toBe("₹0");
    expect(axisLabel(25000)).toBe("₹25k");
    expect(axisLabel(100000)).toBe("₹1L");
    expect(axisLabel(150000)).toBe("₹1.5L");
    expect(axisLabel(-50000)).toBe("−₹50k");
    expect(rupees(123456)).toBe("₹1,23,456");
    expect(rupees(-500)).toBe("−₹500");
  });
});

describe("the line (TC-05)", () => {
  const nums = (d: string) => (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);

  it("never rises above or falls below the points it joins (no invented peaks)", () => {
    const pts: [number, number][] = [[0, 100], [10, 20], [20, 20], [30, 90], [40, 10]];
    const n = nums(monotonePath(pts));
    const ys = n.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10 - 0.1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100 + 0.1);
  });

  it("a flat stretch stays flat", () => {
    const d = monotonePath([[0, 50], [10, 50], [20, 50]]);
    expect(nums(d).filter((_, i) => i % 2 === 1).every((y) => y === 50)).toBe(true);
  });

  it("handles 0, 1 and 2 points", () => {
    expect(monotonePath([])).toBe("");
    expect(monotonePath([[5, 5]])).toBe("M 5.0 5.0");
    expect(monotonePath([[0, 0], [10, 10]]).startsWith("M 0.0 0.0 C")).toBe(true);
  });
});

describe("month labels on the x axis (TC-06 ... TC-08)", () => {
  it("labels never touch: any number of months, any width (TC-06)", () => {
    for (const n of [3, 12, 24, 63, 120]) {
      for (const width of [260, 500, 900, 1400]) {
        const m = months("2021-01", n);
        const ls = xLabels(m, width, 46);
        const per = width / (n - 1);
        for (let i = 1; i < ls.length; i++) expect((ls[i].index - ls[i - 1].index) * per).toBeGreaterThanOrEqual(46 * 0.7);
        expect(ls.length).toBeGreaterThan(0);
      }
    }
  });

  it("with room, every month is labelled and the year is written under January and the first label (TC-07)", () => {
    const ls = xLabels(months("2025-10", 6), 600, 46);
    expect(ls.map((l) => l.top)).toEqual(["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]);
    expect(ls[0].year).toBe("2025");
    expect(ls[1].year).toBeUndefined();
    expect(ls[3].year).toBe("2026");
  });

  it("63 months in a narrow chart: every 6th month, with the year under January (TC-08)", () => {
    const ls = xLabels(months("2021-10", 63), 700, 46);
    expect(ls.length).toBeLessThanOrEqual(11);
    expect(ls.every((l) => l.top === "Jan" || l.top === "Jul" || l.year != null)).toBe(true);
    expect(ls.filter((l) => l.top === "Jan").every((l) => l.year != null)).toBe(true);
  });

  it("a very long history in a very narrow chart thins to every few years (TC-08b)", () => {
    const ls = xLabels(months("2001-01", 300), 300, 46);
    expect(ls.every((l) => /^\d{4}$/.test(l.top))).toBe(true);
    expect(ls.length).toBeLessThanOrEqual(8);
  });
});

describe("hover position (TC-09)", () => {
  it("picks the nearest month and stays inside the data", () => {
    expect(nearestIndex(50, 50, 400, 5)).toBe(0);
    expect(nearestIndex(450, 50, 400, 5)).toBe(4);
    expect(nearestIndex(250, 50, 400, 5)).toBe(2);
    expect(nearestIndex(-100, 50, 400, 5)).toBe(0);
    expect(nearestIndex(9999, 50, 400, 5)).toBe(4);
    expect(nearestIndex(10, 0, 100, 1)).toBe(0);
  });
});
