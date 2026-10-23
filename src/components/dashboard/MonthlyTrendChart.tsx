// The dashboard's Monthly trend: net profit (the story) with IOP and EDI profit beneath it.
// Design: one strong line + two quiet ones, no dot on every month, clean round axis ticks, readable month / year labels,
// a hover crosshair with a tooltip (keyboard too), range buttons, series you can switch off, and the headline numbers above the plot.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/utils";
import type { MonthlyProfit } from "@/types";
import { axisLabel, monotonePath, monthLong, nearestIndex, niceTicks, rupees, xLabels } from "@/utils/trendChart";

type SeriesKey = "net" | "iop" | "edi";
type Range = "12M" | "24M" | "All";

const SERIES: { key: SeriesKey; label: string; color: string; field: keyof MonthlyProfit; width: number }[] = [
  { key: "net", label: "Net profit", color: "var(--trend-net)", field: "net_profit", width: 2.25 },
  { key: "iop", label: "IOP", color: "var(--trend-iop)", field: "iop_profit", width: 1.75 },
  { key: "edi", label: "EDI", color: "var(--trend-edi)", field: "edi_profit", width: 1.75 },
];
const RANGES: { id: Range; months: number | null }[] = [{ id: "12M", months: 12 }, { id: "24M", months: 24 }, { id: "All", months: null }];
const MONO = "var(--font-mono, ui-monospace)";

const pct = (curr: number, prev: number) => (prev === 0 ? null : ((curr - prev) / Math.abs(prev)) * 100);

export function MonthlyTrendChart({ data: input }: { data: MonthlyProfit[] }) {
  const data = useMemo(() => [...input].sort((a, b) => a.month.localeCompare(b.month)), [input]);
  const [range, setRange] = useState<Range>("All");
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => { const w = el.getBoundingClientRect().width; if (w > 0) setWidth(Math.round(w)); };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = RANGES.find((r) => r.id === range)!.months;
  const offset = count ? Math.max(0, data.length - count) : 0;       // index of the first visible month in the full list
  const rows = data.slice(offset);
  const visible = SERIES.filter((s) => !hidden.has(s.key));

  if (data.length < 2) {
    return (
      <div className="col-span-12 rounded-xl border border-border bg-card p-[18px_20px]">
        <h3 className="text-foreground/70 font-medium" style={{ fontSize: 13 }}>Monthly trend</h3>
        <p className="text-muted-foreground mt-1" style={{ fontSize: 12 }}>Not enough data yet.</p>
      </div>
    );
  }

  // ── geometry ────────────────────────────────────────────────────────────
  const compact = width < 520;
  const H = compact ? 230 : 300;
  const PL = compact ? 44 : 52, PR = 14, PT = 16, PB = 38;
  const w = Math.max(width - PL - PR, 10), h = H - PT - PB;
  const values = rows.flatMap((m) => visible.map((s) => Number(m[s.field]) || 0));
  const ticks = niceTicks(Math.min(...values, 0), Math.max(...values, 1), compact ? 3 : 4);
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const sy = (v: number) => PT + h - ((v - yMin) / Math.max(yMax - yMin, 1)) * h;
  const sx = (i: number) => PL + (i / Math.max(rows.length - 1, 1)) * w;
  const zeroY = sy(0);
  const pts = (field: keyof MonthlyProfit) => rows.map((m, i) => [sx(i), sy(Number(m[field]) || 0)] as [number, number]);
  const labels = xLabels(rows.map((m) => m.month), w, compact ? 40 : 48);

  // ── the headline numbers (always about the chosen range) ───────────────
  const last = rows[rows.length - 1];
  const before = data[offset + rows.length - 2];
  const delta = before ? pct(last.net_profit, before.net_profit) : null;
  const avg = rows.reduce((s, m) => s + m.net_profit, 0) / rows.length;
  const best = rows.reduce((b, m) => (m.net_profit > b.net_profit ? m : b), rows[0]);
  const bestIdx = rows.indexOf(best);
  const netOn = !hidden.has("net");

  const toggle = (key: SeriesKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < SERIES.length - 1) next.add(key);            // at least one line stays on
      return next;
    });

  const hi = hover != null && hover < rows.length ? hover : null;
  const hm = hi != null ? rows[hi] : null;
  const hPrev = hi != null ? data[offset + hi - 1] : null;
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left + PL;
    if (Number.isFinite(x)) setHover(nearestIndex(x, PL, w, rows.length));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover((i) => Math.max(0, (i ?? rows.length) - 1)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setHover((i) => Math.min(rows.length - 1, (i ?? -1) + 1)); }
    else if (e.key === "Escape") setHover(null);
  };

  const tipLeft = hi != null && sx(hi) > width * 0.58;
  const hasNeg = yMin < 0;

  return (
    <div className="col-span-12 rounded-xl border border-border bg-card p-[18px_20px]" data-testid="trend-card">
      {/* title + range */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <h3 className="text-foreground/80 font-medium" style={{ fontSize: 14, margin: 0, letterSpacing: "-.005em" }}>Monthly trend</h3>
          <div className="text-muted-foreground mt-0.5" style={{ fontSize: 12 }}>
            Net profit, with IOP and EDI profit · {rows.length} {rows.length === 1 ? "month" : "months"}
          </div>
        </div>
        <div role="group" aria-label="Time range" className="flex rounded-lg border border-border bg-muted/40 p-0.5" data-testid="trend-range">
          {RANGES.map((r) => {
            const on = r.id === range, disabled = r.months != null && data.length <= r.months;       // the range would just be "All"
            return (
              <button key={r.id} type="button" aria-pressed={on} disabled={disabled}
                onClick={() => { setRange(r.id); setHover(null); }}
                className={cn("rounded-md px-3 py-1 text-[12px] font-medium transition-colors disabled:opacity-40",
                  on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {r.id}
              </button>
            );
          })}
        </div>
      </div>

      {/* headline numbers */}
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:items-end sm:gap-x-10" data-testid="trend-stats">
        <div className="col-span-2 sm:col-span-1">
          <div className="text-muted-foreground" style={{ fontSize: 11.5 }}>Net profit · {monthLong(last.month)}</div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-foreground" style={{ fontFamily: MONO, fontSize: 26, fontWeight: 500, letterSpacing: "-.03em", lineHeight: 1.15 }}>{rupees(last.net_profit)}</span>
            {delta != null && (
              <span data-testid="trend-delta" className="whitespace-nowrap rounded-full px-2 py-0.5"
                style={{ fontSize: 11.5, fontFamily: MONO, color: delta >= 0 ? "hsl(var(--pos))" : "hsl(var(--neg))", background: delta >= 0 ? "hsl(var(--pos) / .12)" : "hsl(var(--neg) / .14)" }}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground" style={{ fontSize: 11.5 }}>Average per month</div>
          <div className="text-foreground/90" style={{ fontFamily: MONO, fontSize: 17, fontWeight: 500, letterSpacing: "-.02em" }} data-testid="trend-avg">{rupees(avg)}</div>
        </div>
        <div>
          <div className="text-muted-foreground" style={{ fontSize: 11.5 }}>Best month</div>
          <div className="text-foreground/90" style={{ fontFamily: MONO, fontSize: 17, fontWeight: 500, letterSpacing: "-.02em" }} data-testid="trend-best">
            {rupees(best.net_profit)}
            <span className="block text-muted-foreground" style={{ fontSize: 11.5, fontFamily: "inherit", letterSpacing: 0, fontWeight: 400 }}>{monthLong(best.month)}</span>
          </div>
        </div>
        {/* legend = switches */}
        <div className="col-span-2 flex items-center gap-1.5 sm:ml-auto" role="group" aria-label="Lines shown" data-testid="trend-legend">
          {SERIES.map((s) => {
            const on = !hidden.has(s.key);
            return (
              <button key={s.key} type="button" aria-pressed={on} onClick={() => toggle(s.key)}
                className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  on ? "border-border text-foreground/85 hover:bg-muted/60" : "border-transparent text-muted-foreground/60 hover:text-muted-foreground")}>
                <span aria-hidden className="inline-block rounded-full" style={{ width: 14, height: 3, background: on ? s.color : "hsl(var(--border))" }} />
                <span className={on ? "" : "line-through"}>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* the plot */}
      <div ref={wrapRef} className="relative mt-3 outline-none" tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)}
        aria-label="Monthly profit chart. Use the left and right arrow keys to read each month." data-testid="trend-plot">
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
          <defs>
            <linearGradient id={`${uid}-net`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--trend-net)" stopOpacity=".16" />
              <stop offset="100%" stopColor="var(--trend-net)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* hairline grid + axis labels */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PL} x2={width - PR} y1={sy(v)} y2={sy(v)} stroke="hsl(var(--border))" strokeWidth={1} opacity={v === 0 ? 1 : 0.7} />
              <text x={PL - 10} y={sy(v) + 4} textAnchor="end" fontSize="11" fill="hsl(var(--muted-foreground))" fontFamily={MONO}>{axisLabel(v)}</text>
            </g>
          ))}
          {hasNeg && <line x1={PL} x2={width - PR} y1={zeroY} y2={zeroY} stroke="hsl(var(--muted-foreground))" strokeWidth={1} opacity={0.5} />}

          {/* net profit wash */}
          {netOn && (() => {
            const p = pts("net_profit");
            return <path d={`${monotonePath(p)} L ${p[p.length - 1][0].toFixed(1)} ${zeroY.toFixed(1)} L ${p[0][0].toFixed(1)} ${zeroY.toFixed(1)} Z`} fill={`url(#${uid}-net)`} />;
          })()}

          {/* lines: the quiet ones first, net on top */}
          {[...visible].reverse().map((s) => (
            <path key={s.key} data-testid={`line-${s.key}`} d={monotonePath(pts(s.field))} fill="none" stroke={s.color} strokeWidth={s.width}
              strokeLinejoin="round" strokeLinecap="round" opacity={hi != null && s.key !== "net" ? 0.85 : 1} />
          ))}

          {/* the best month, named */}
          {netOn && (() => {
            const x = sx(bestIdx), y = sy(best.net_profit);
            const anchor = x < PL + 60 ? "start" : x > width - PR - 60 ? "end" : "middle";
            const below = y < PT + 28;                                      // no room above (the top gridline): write it under the point
            return (
              <g data-testid="trend-peak" pointerEvents="none">
                <circle cx={x} cy={y} r={4} fill="var(--trend-net)" stroke="hsl(var(--card))" strokeWidth={2} />
                <text x={x} y={below ? y + 19 : y - 11} textAnchor={anchor} fontSize="11" fontWeight={500} fill="hsl(var(--foreground))" fontFamily={MONO}>{axisLabel(best.net_profit)}</text>
              </g>
            );
          })()}

          {/* where each line ends today */}
          {hi == null && visible.map((s) => (
            <circle key={s.key} cx={sx(rows.length - 1)} cy={sy(Number(last[s.field]) || 0)} r={4} fill={s.color} stroke="hsl(var(--card))" strokeWidth={2} pointerEvents="none" />
          ))}

          {/* x axis */}
          {labels.map((l) => (
            <g key={l.index} pointerEvents="none">
              <line x1={sx(l.index)} x2={sx(l.index)} y1={PT + h} y2={PT + h + 4} stroke="hsl(var(--border))" />
              <text x={sx(l.index)} y={PT + h + 17} textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))" fontFamily={MONO}>{l.top}</text>
              {l.year && <text x={sx(l.index)} y={PT + h + 30} textAnchor="middle" fontSize="10.5" fontWeight={600} fill="hsl(var(--foreground) / .7)" fontFamily={MONO}>{l.year}</text>}
            </g>
          ))}

          {/* hover: crosshair + a dot on every visible line */}
          {hi != null && (
            <g pointerEvents="none">
              <line x1={sx(hi)} x2={sx(hi)} y1={PT} y2={PT + h} stroke="hsl(var(--foreground))" strokeWidth={1} opacity={0.25} />
              {visible.map((s) => (
                <circle key={s.key} cx={sx(hi)} cy={sy(Number(rows[hi][s.field]) || 0)} r={4.5} fill={s.color} stroke="hsl(var(--card))" strokeWidth={2} />
              ))}
            </g>
          )}

          {/* the pointer surface (bigger than any mark) */}
          <rect x={PL} y={PT} width={w} height={h + 1} fill="transparent" style={{ touchAction: "pan-y" }}
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }} data-testid="trend-hit" />
        </svg>

        {/* tooltip */}
        {hm && hi != null && (
          <div role="status" data-testid="trend-tooltip" className="pointer-events-none absolute z-10 rounded-lg border border-border bg-card px-3 py-2.5 shadow-lg"
            style={{ top: PT, minWidth: 176, ...(tipLeft ? { right: width - sx(hi) + 12 } : { left: sx(hi) + 12 }) }}>
            <div className="text-foreground font-medium" style={{ fontSize: 12.5 }}>{monthLong(hm.month)}</div>
            <div className="mt-1.5 space-y-1">
              {visible.map((s) => (
                <div key={s.key} className="flex items-center gap-2" style={{ fontSize: 12 }}>
                  <span aria-hidden className="inline-block rounded-full" style={{ width: 10, height: 3, background: s.color }} />
                  <span className={cn("flex-1", s.key === "net" ? "text-foreground font-medium" : "text-muted-foreground")}>{s.label}</span>
                  <span className="text-foreground" style={{ fontFamily: MONO, fontWeight: s.key === "net" ? 600 : 400 }}>{rupees(Number(hm[s.field]) || 0)}</span>
                </div>
              ))}
            </div>
            {netOn && hPrev && pct(hm.net_profit, hPrev.net_profit) != null && (
              <div className="mt-1.5 border-t border-border/60 pt-1.5 text-muted-foreground" style={{ fontSize: 11.5 }}>
                {pct(hm.net_profit, hPrev.net_profit)! >= 0 ? "▲" : "▼"} {Math.abs(pct(hm.net_profit, hPrev.net_profit)!).toFixed(1)}% vs {monthLong(hPrev.month)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* the same numbers as a table, for screen readers */}
      <table className="sr-only" data-testid="trend-table">
        <caption>Monthly profit</caption>
        <thead><tr><th>Month</th><th>Net profit</th><th>IOP profit</th><th>EDI profit</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.month}><td>{monthLong(m.month)}</td><td>{rupees(m.net_profit)}</td><td>{rupees(m.iop_profit)}</td><td>{rupees(m.edi_profit)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

