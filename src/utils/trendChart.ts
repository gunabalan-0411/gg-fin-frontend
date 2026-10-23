// Pure helpers for the dashboard's Monthly trend chart (no React): clean axis ticks, a smooth line that never overshoots the data,
// readable month labels however many months there are.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03" -> { year: 2026, month: 2 (0-based) } */
export const parseMonth = (key: string) => {
  const [y, m] = key.split("-");
  return { year: parseInt(y, 10), month: (parseInt(m, 10) - 1 + 12) % 12 };
};

export const monthName = (key: string) => MONTHS[parseMonth(key).month];
export const monthLong = (key: string) => `${monthName(key)} ${parseMonth(key).year}`;

/** A round step (1, 2, 2.5, 5 x 10^n) so that about `count` intervals cover `span`. */
export function niceStep(span: number, count: number): number {
  const raw = Math.max(span, 1) / Math.max(count, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * pow;
}

/** Clean axis ticks that include 0 and cover [min, max]: e.g. 0, 50k, 1L, 1.5L, 2L. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(min, 0), hi = Math.max(max, 0);
  const step = niceStep(hi - lo, count);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 1e6; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

const trim = (n: number) => String(parseFloat(n.toFixed(2)));

/** Compact rupees for an axis: ₹0, ₹25k, ₹1L, ₹1.5L, −₹50k (lakh system). */
export function axisLabel(n: number): string {
  const abs = Math.abs(n), sign = n < 0 ? "−" : "";
  if (abs >= 100000) return `${sign}₹${trim(abs / 100000)}L`;
  if (abs >= 1000) return `${sign}₹${trim(abs / 1000)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

/** Full rupees: ₹1,23,456 */
export const rupees = (n: number) => (n < 0 ? "−" : "") + "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");

/**
 * Smooth line through the points that never dips below or above them (monotone cubic, Fritsch-Carlson) - a profit line must not
 * show a dip that is not in the data.
 */
export function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  const f = (v: number) => v.toFixed(1);
  if (n === 1) return `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C ${f(pts[i][0] + h)} ${f(pts[i][1] + t[i] * h)} ${f(pts[i + 1][0] - h)} ${f(pts[i + 1][1] - t[i + 1] * h)} ${f(pts[i + 1][0])} ${f(pts[i + 1][1])}`;
  }
  return d;
}

export interface XLabel { index: number; top: string; year?: string }

/**
 * Which months get a label on the x axis, so that labels never touch: every month when there is room, else every 2nd / 3rd / 6th,
 * else one per year. A year is written under January (and under the first label).
 */
export function xLabels(months: string[], plotWidth: number, minGap = 46): XLabel[] {
  const n = months.length;
  if (n === 0) return [];
  const per = n > 1 ? plotWidth / (n - 1) : plotWidth;
  const step = [1, 2, 3, 6, 12].find((s) => s * per >= minGap) ?? 12;
  const yearStep = step === 12 ? Math.max(1, Math.ceil(minGap / (12 * per))) : 1;     // a very long history: every 2nd / 5th year
  const out: XLabel[] = [];
  months.forEach((key, i) => {
    const { year, month } = parseMonth(key);
    if (month % step !== 0) return;
    if (step === 12) { if (year % yearStep === 0) out.push({ index: i, top: String(year) }); return; }
    const first = out.length === 0;
    out.push({ index: i, top: MONTHS[month], year: month === 0 || first ? String(year) : undefined });
  });
  if (out.length === 0) out.push({ index: 0, top: String(parseMonth(months[0]).year) });
  // keep the labels from colliding at the very ends: drop a first label that sits too close to the next one
  if (out.length > 1 && (out[1].index - out[0].index) * per < minGap * 0.7) out.shift();
  return out;
}

/** The index of the point nearest to x (points evenly spaced between left and left + width). */
export const nearestIndex = (x: number, left: number, width: number, n: number): number =>
  n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((x - left) / Math.max(width, 1)) * (n - 1))));
