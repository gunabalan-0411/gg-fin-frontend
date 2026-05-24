import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDashboardSummary, useDailyActivity } from "@/hooks/useDashboard";
import type { MonthlyProfit, DailyActivity } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Full Indian-locale format: ₹1,58,850
const fmt = (n: number): string => "₹" + Math.round(n).toLocaleString("en-IN");

// Compact labels only for SVG Y-axis where pixels are tight
const fmtAxis = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 100000) return "₹" + (abs / 100000).toFixed(1) + "L";
  if (abs >= 1000) return "₹" + (abs / 1000).toFixed(0) + "k";
  return "₹" + Math.round(abs);
};

const momDelta = (curr: number, prev: number): string => {
  if (prev === 0) return "—";
  const p = ((curr - prev) / Math.abs(prev)) * 100;
  return (p >= 0 ? "+" : "") + p.toFixed(1) + "%";
};

// ── Spark SVG ─────────────────────────────────────────────────────────────────

function Spark({
  points,
  color = "hsl(var(--pos))",
  fill,
}: {
  points: number[];
  color?: string;
  fill?: string;
}) {
  if (points.length < 2) return <div style={{ height: 22 }} />;
  const W = 80, H = 22, P = 2;
  const mn = Math.min(...points), mx = Math.max(...points);
  const r = mx - mn || 1;
  const stepX = (W - P * 2) / (points.length - 1);
  const xy: [number, number][] = points.map((v, i) => [
    P + i * stepX,
    H - P - ((v - mn) / r) * (H - P * 2),
  ]);
  const d = xy.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1)).join(" ");
  const area = d + ` L ${W - P} ${H - P} L ${P} ${H - P} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 22, display: "block" }}>
      {fill && <path d={area} fill={fill} />}
      <path d={d} stroke={color} strokeWidth="1.4" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────

function KpiTile({
  lbl, value, pts, color, delta, deltaLbl, up,
}: {
  lbl: string; value: number; pts: number[]; color: string;
  delta: string; deltaLbl: string; up: boolean;
}) {
  return (
    <div className="h-full rounded-xl border border-border bg-card p-[14px_16px] flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-1.5 font-medium uppercase text-muted-foreground"
          style={{ fontSize: 10.5, letterSpacing: ".1em" }}
        >
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
          <span className="truncate">{lbl}</span>
        </div>
        <span
          className={`flex-shrink-0 font-medium rounded-full px-[7px] py-[2px] ${
            up
              ? "text-[hsl(var(--pos))]"
              : "text-[hsl(var(--neg))]"
          }`}
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono, ui-monospace)",
            background: up
              ? "color-mix(in oklab, hsl(var(--pos)) 14%, transparent)"
              : "color-mix(in oklab, hsl(var(--neg)) 14%, transparent)",
          }}
        >
          {delta}
        </span>
      </div>

      {/* Value — 22px mono matching .kpi-v */}
      <div
        className="text-foreground leading-[1.1]"
        style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 22, fontWeight: 500, letterSpacing: "-.02em" }}
      >
        <span className="text-muted-foreground font-normal mr-0.5" style={{ fontSize: 14 }}>₹</span>
        {Math.round(value).toLocaleString("en-IN")}
      </div>

      {/* Sparkline */}
      <Spark
        points={pts}
        color={up ? "hsl(var(--pos))" : "hsl(var(--neg))"}
        fill={
          up
            ? "color-mix(in oklab, hsl(var(--pos)) 12%, transparent)"
            : "color-mix(in oklab, hsl(var(--neg)) 12%, transparent)"
        }
      />

      {/* Footer */}
      <div
        className="flex items-baseline justify-between text-muted-foreground"
        style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11 }}
      >
        <span>{deltaLbl}</span>
        <span>{pts.length}m</span>
      </div>
    </div>
  );
}

// ── Hero Card ─────────────────────────────────────────────────────────────────

function HeroCard({ trend, prev }: { trend: MonthlyProfit; prev: MonthlyProfit | null }) {
  const revenue = trend.iop_profit + trend.edi_profit;
  const mom = prev && prev.net_profit !== 0
    ? ((trend.net_profit - prev.net_profit) / Math.abs(prev.net_profit)) * 100
    : 0;
  const isUp = mom >= 0;

  const wfCols = [
    { sign: null as string | null, color: "hsl(var(--primary))", label: "IOP profit",
      value: trend.iop_profit, pct: Math.round((trend.iop_profit / revenue) * 100),
      barW: 100, neg: false, eq: false },
    { sign: "+", color: "hsl(var(--accent))", label: "EDI profit",
      value: trend.edi_profit, pct: Math.round((trend.edi_profit / revenue) * 100),
      barW: Math.round((trend.edi_profit / Math.max(trend.iop_profit, 1)) * 100),
      neg: false, eq: false },
    { sign: "=", color: "hsl(var(--muted-foreground))", label: "Revenue",
      value: revenue, pct: null, barW: 100, neg: false, eq: false },
    { sign: "−", color: "hsl(var(--warn))", label: "Expenses",
      value: trend.expense, pct: Math.round((trend.expense / revenue) * 100),
      barW: Math.round((trend.expense / revenue) * 100), neg: true, eq: false },
    { sign: "=", color: "hsl(var(--pos))", label: "Net",
      value: trend.net_profit, pct: null, barW: 100, neg: false, eq: true },
  ];

  return (
    <div
      className="col-span-12 xl:col-span-8 rounded-xl border border-border p-[22px_24px] relative overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 100% 0%, color-mix(in oklab, hsl(var(--primary)) 30%, transparent), transparent 55%), hsl(var(--card))",
      }}
    >
      {/* Eyebrow */}
      <div
        className="flex items-center gap-2 text-muted-foreground font-medium uppercase"
        style={{ fontSize: 10.5, letterSpacing: ".12em" }}
      >
        <span
          className="w-[5px] h-[5px] rounded-full"
          style={{
            background: "hsl(var(--pos))",
            animation: "pulse 1.6s infinite",
          }}
        />
        Net profit · {trend.month}
      </div>

      {/* 44px hero amount */}
      <div className="flex items-baseline gap-4 mt-2 flex-wrap">
        <div
          className="text-foreground leading-none"
          style={{
            fontFamily: "var(--font-mono, ui-monospace)",
            fontSize: 44,
            fontWeight: 500,
            letterSpacing: "-.03em",
          }}
        >
          <span className="text-muted-foreground font-normal mr-1" style={{ fontSize: 26 }}>₹</span>
          {trend.net_profit.toLocaleString("en-IN")}
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-[10px] py-[4px] font-medium"
          style={{
            fontSize: 12,
            fontFamily: "var(--font-mono, ui-monospace)",
            background: isUp
              ? "color-mix(in oklab, hsl(var(--pos)) 14%, transparent)"
              : "color-mix(in oklab, hsl(var(--neg)) 14%, transparent)",
            color: isUp ? "hsl(var(--pos))" : "hsl(var(--neg))",
          }}
        >
          {isUp ? "↑" : "↓"} {Math.abs(mom).toFixed(1)}% MoM
        </span>
      </div>

      {/* Sub stats */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-muted-foreground"
        style={{ fontSize: 12.5 }}
      >
        <span>Revenue <b className="font-medium" style={{ color: "hsl(var(--ink-2, var(--foreground)))", fontFamily: "var(--font-mono, ui-monospace)" }}>{fmt(revenue)}</b></span>
        <span className="w-px h-3 bg-border" />
        <span>Margin <b className="font-medium" style={{ color: "hsl(var(--ink-2, var(--foreground)))", fontFamily: "var(--font-mono, ui-monospace)" }}>{Math.round((trend.net_profit / revenue) * 100)}%</b></span>
        {prev && (
          <>
            <span className="w-px h-3 bg-border" />
            <span style={{ color: isUp ? "hsl(var(--pos))" : "hsl(var(--neg))" }}>
              {isUp ? "↑" : "↓"} {fmt(Math.abs(trend.net_profit - prev.net_profit))} vs prev month
            </span>
          </>
        )}
      </div>

      {/* Waterfall */}
      <div
        className="mt-[22px] pt-[18px] border-t border-border/40 grid grid-cols-5"
        style={{ gap: 0 }}
      >
        {wfCols.map((col, i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5 min-w-0"
            style={{
              padding: "0 12px",
              paddingLeft: i === 0 ? 0 : 12,
              paddingRight: i === wfCols.length - 1 ? 0 : 12,
              borderRight: i < wfCols.length - 1 ? "1px solid hsl(var(--border) / .5)" : "none",
              position: "relative",
            }}
          >
            {/* Label row */}
            <div
              className="flex items-center gap-1 text-muted-foreground font-medium uppercase"
              style={{ fontSize: 10.5, letterSpacing: ".08em", minHeight: 32 }}
            >
              {col.sign ? (
                <span
                  className="absolute text-muted-foreground/40 font-light"
                  style={{
                    fontSize: 18,
                    fontFamily: "var(--font-mono, ui-monospace)",
                    left: -10,
                    top: "50%",
                    transform: "translateY(-50%)",
                  }}
                >
                  {col.sign}
                </span>
              ) : (
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: col.color }} />
              )}
              <span className="truncate">{col.label}</span>
            </div>

            {/* Value — 17px mono matching .wf-col .wfv */}
            <div
              className="leading-tight"
              style={{
                fontFamily: "var(--font-mono, ui-monospace)",
                fontSize: 17,
                fontWeight: 500,
                letterSpacing: "-.02em",
                color: col.neg
                  ? "hsl(var(--neg))"
                  : col.eq
                  ? "hsl(var(--pos))"
                  : "hsl(var(--foreground))",
              }}
            >
              {col.neg ? "−" : ""}{fmt(col.value)}
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted))" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: Math.min(100, col.barW) + "%", background: col.color }}
              />
            </div>

            {/* Pct of revenue */}
            {col.pct !== null && (
              <div
                className="text-muted-foreground"
                style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 10.5 }}
              >
                {col.pct}% of rev
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Composition Card ──────────────────────────────────────────────────────────

function CompositionCard({ trend }: { trend: MonthlyProfit }) {
  const revenue = trend.iop_profit + trend.edi_profit;
  const items = [
    { label: "IOP", value: trend.iop_profit, color: "hsl(var(--primary))", pct: Math.round((trend.iop_profit / revenue) * 100) },
    { label: "EDI", value: trend.edi_profit, color: "hsl(var(--accent))", pct: Math.round((trend.edi_profit / revenue) * 100) },
  ];

  const R = 52, SW = 18;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = items.map((it) => {
    const len = (it.value / revenue) * C;
    const el = { dash: `${Math.max(0, len - 3)} ${C}`, offset: -offset, color: it.color };
    offset += len;
    return el;
  });

  return (
    <div className="col-span-12 xl:col-span-4 rounded-xl border border-border bg-card p-[18px_20px] flex flex-col">
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-foreground/70 font-medium" style={{ fontSize: 13, letterSpacing: "-.005em", margin: 0 }}>
            Revenue composition
          </h3>
          <div className="text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11 }}>
            IOP vs EDI · {trend.month}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-1">
        {/* SVG Donut — 140×140 */}
        <div className="relative flex-shrink-0" style={{ width: 140, height: 140 }}>
          <svg viewBox="0 0 140 140" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
            <circle cx="70" cy="70" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={SW} />
            {arcs.map((a, i) => (
              <circle key={i} cx="70" cy="70" r={R} fill="none"
                stroke={a.color} strokeWidth={SW}
                strokeDasharray={a.dash}
                strokeDashoffset={a.offset}
                strokeLinecap="butt" />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-muted-foreground uppercase" style={{ fontSize: 10, letterSpacing: ".08em" }}>Revenue</div>
            <div
              className="text-foreground mt-0.5"
              style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 18, fontWeight: 500, letterSpacing: "-.02em" }}
            >
              {fmt(revenue)}
            </div>
          </div>
        </div>

        {/* Legend — .comp-row is font-size 13px */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 10, marginTop: 14 }}>
          {items.map((it) => (
            <div key={it.label} className="grid items-center" style={{ gridTemplateColumns: "12px 1fr auto auto", gap: 10, fontSize: 13 }}>
              <span className="rounded-sm" style={{ width: 10, height: 10, background: it.color, borderRadius: 3 }} />
              <span className="text-foreground/70 font-medium">{it.label}</span>
              <span style={{ fontFamily: "var(--font-mono, ui-monospace)", color: "hsl(var(--foreground))", fontWeight: 500 }}>{fmt(it.value)}</span>
              <span className="text-muted-foreground text-right" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11.5, width: 36 }}>{it.pct}%</span>
            </div>
          ))}
          <div className="grid items-center border-t border-border/50 pt-2.5" style={{ gridTemplateColumns: "12px 1fr auto auto", gap: 10, fontSize: 13 }}>
            <span className="rounded-sm" style={{ width: 10, height: 10, background: "hsl(var(--warn))", borderRadius: 3 }} />
            <span className="text-foreground/70 font-medium">Expense</span>
            <span style={{ fontFamily: "var(--font-mono, ui-monospace)", color: "hsl(var(--neg))", fontWeight: 500 }}>−{fmt(trend.expense)}</span>
            <span className="text-muted-foreground text-right" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11.5, width: 36 }}>{Math.round((trend.expense / revenue) * 100)}%</span>
          </div>
          <div className="grid items-center border-t border-border/50 pt-2.5" style={{ gridTemplateColumns: "12px 1fr auto auto", gap: 10, fontSize: 13 }}>
            <span className="rounded-sm" style={{ width: 10, height: 10, background: "hsl(var(--pos))", borderRadius: 3 }} />
            <span className="text-foreground/70 font-medium">Net</span>
            <span style={{ fontFamily: "var(--font-mono, ui-monospace)", color: "hsl(var(--pos))", fontWeight: 500 }}>{fmt(trend.net_profit)}</span>
            <span className="text-muted-foreground text-right" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11.5, width: 36 }}>{Math.round((trend.net_profit / revenue) * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trend Card ────────────────────────────────────────────────────────────────

function TrendCard({ data }: { data: MonthlyProfit[] }) {
  if (data.length < 2) {
    return (
      <div className="col-span-12 xl:col-span-8 rounded-xl border border-border bg-card p-[18px_20px]">
        <h3 className="text-foreground/70 font-medium" style={{ fontSize: 13 }}>6-month trend</h3>
        <p className="text-muted-foreground mt-1" style={{ fontSize: 12 }}>Not enough data yet.</p>
      </div>
    );
  }

  const W = 720, H = 220, PL = 48, PR = 16, PT = 14, PB = 28;
  const w = W - PL - PR, h = H - PT - PB;
  const maxY = Math.max(...data.flatMap((m) => [m.iop_profit, m.edi_profit, m.net_profit]));
  const sy = (v: number) => PT + h - (v / (maxY * 1.08)) * h;
  const sx = (i: number) => PL + (i / (data.length - 1)) * w;
  const ticks = 4;
  const gridY = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxY * i) / ticks));

  const pathOf = (vals: number[]) =>
    "M " + vals.map((v, i) => sx(i).toFixed(1) + " " + sy(v).toFixed(1)).join(" L ");

  const iopVals = data.map((m) => m.iop_profit);
  const ediVals = data.map((m) => m.edi_profit);
  const netVals = data.map((m) => m.net_profit);
  const iopPath = pathOf(iopVals);
  const ediPath = pathOf(ediVals);
  const netPath = pathOf(netVals);
  const bot = (PT + h).toFixed(1);
  const x0 = sx(0).toFixed(1), xN = sx(data.length - 1).toFixed(1);
  const iopArea = iopPath + ` L ${xN} ${bot} L ${x0} ${bot} Z`;
  const ediArea = ediPath + ` L ${xN} ${bot} L ${x0} ${bot} Z`;

  const legend = [
    { key: "net", label: "Net profit", color: "hsl(var(--pos))", isLine: true },
    { key: "iop", label: "IOP", color: "hsl(var(--primary))" },
    { key: "edi", label: "EDI", color: "hsl(var(--accent))" },
  ];

  return (
    <div className="col-span-12 xl:col-span-8 rounded-xl border border-border bg-card p-[18px_20px]">
      {/* Card header */}
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="text-foreground/70 font-medium" style={{ fontSize: 13, letterSpacing: "-.005em", margin: 0 }}>
            6-month trend
          </h3>
          <div className="text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11 }}>
            profit lines — Net vs IOP vs EDI
          </div>
        </div>
        <div className="flex gap-3 items-center">
          {legend.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-muted-foreground" style={{ fontSize: 11.5 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: s.isLine ? 2 : 10,
                  background: s.color,
                  borderRadius: s.isLine ? 0 : 2,
                  flexShrink: 0,
                }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: 240, display: "block" }}
      >
        <defs>
          <linearGradient id="dashIopG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity=".35" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="dashEdiG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity=".4" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines + Y-axis labels */}
        {gridY.map((v, i) => (
          <g key={i}>
            <line
              x1={PL} x2={W - PR} y1={sy(v)} y2={sy(v)}
              stroke="hsl(var(--border))" strokeWidth={i === 0 ? 1 : 0.7}
            />
            <text
              x={PL - 8} y={sy(v) + 3} textAnchor="end"
              fontSize="10"
              fill="hsl(var(--muted-foreground))"
              fontFamily="var(--font-mono, ui-monospace)"
            >
              {fmtAxis(v)}
            </text>
          </g>
        ))}

        {/* Areas */}
        <path d={iopArea} fill="url(#dashIopG)" />
        <path d={ediArea} fill="url(#dashEdiG)" />

        {/* Lines */}
        <path d={iopPath} stroke="hsl(var(--primary))" strokeWidth="1.6" fill="none" />
        <path d={ediPath} stroke="hsl(var(--accent))" strokeWidth="1.6" fill="none" />
        <path d={netPath} stroke="hsl(var(--pos))" strokeWidth="2.5" fill="none" />

        {/* Net profit dots */}
        {netVals.map((v, i) => (
          <circle
            key={i}
            cx={sx(i)} cy={sy(v)} r="3.5"
            fill="hsl(var(--card))" stroke="hsl(var(--pos))" strokeWidth="2"
          />
        ))}

        {/* X-axis labels */}
        {data.map((m, i) => (
          <text
            key={i}
            x={sx(i)} y={H - 6} textAnchor="middle"
            fontSize="10"
            fill="hsl(var(--muted-foreground))"
            fontFamily="var(--font-mono, ui-monospace)"
          >
            {m.month.split(" ")[0].slice(0, 3).toUpperCase()}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Margin Card ───────────────────────────────────────────────────────────────

function MarginCard({ trend, prev }: { trend: MonthlyProfit; prev: MonthlyProfit | null }) {
  const revenue = trend.iop_profit + trend.edi_profit;
  const margin = revenue > 0 ? (trend.net_profit / revenue) * 100 : 0;
  const prevRev = prev ? prev.iop_profit + prev.edi_profit : revenue;
  const prevMargin = prev && prevRev > 0 ? (prev.net_profit / prevRev) * 100 : margin;
  const deltaPp = margin - prevMargin;

  const R = 70, SW = 16;
  const C = Math.PI * R;
  const len = (Math.min(100, Math.max(0, margin)) / 100) * C;

  const expGrowth = prev && prev.expense > 0
    ? Math.round(((trend.expense - prev.expense) / prev.expense) * 100)
    : 0;
  const revGrowth = prev && prevRev > 0
    ? Math.round(((revenue - prevRev) / prevRev) * 100)
    : 0;

  return (
    <div className="col-span-12 xl:col-span-4 rounded-xl border border-border bg-card p-[18px_20px] flex flex-col">
      {/* Card header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-foreground/70 font-medium" style={{ fontSize: 13, letterSpacing: "-.005em", margin: 0 }}>
            Profit margin
          </h3>
          <div className="text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11 }}>
            net / revenue · {trend.month}
          </div>
        </div>
        {prev && (
          <span
            className="rounded-full px-2 py-0.5 font-medium flex-shrink-0"
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono, ui-monospace)",
              background: deltaPp >= 0
                ? "color-mix(in oklab, hsl(var(--pos)) 14%, transparent)"
                : "color-mix(in oklab, hsl(var(--neg)) 14%, transparent)",
              color: deltaPp >= 0 ? "hsl(var(--pos))" : "hsl(var(--neg))",
              padding: "3px 8px",
            }}
          >
            {deltaPp >= 0 ? "↑" : "↓"} {Math.abs(deltaPp).toFixed(1)} pp
          </span>
        )}
      </div>

      <div className="flex flex-col items-center" style={{ gap: 12, padding: "10px 0" }}>
        {/* Half-circle gauge — 160×100 matching .gauge */}
        <div className="relative" style={{ width: 160, height: 100 }}>
          <svg viewBox="0 0 160 90" style={{ width: "100%", height: "100%", display: "block" }}>
            <path
              d={`M 10 80 A ${R} ${R} 0 0 1 150 80`}
              stroke="hsl(var(--muted))" strokeWidth={SW} fill="none" strokeLinecap="round"
            />
            <path
              d={`M 10 80 A ${R} ${R} 0 0 1 150 80`}
              stroke="hsl(var(--pos))" strokeWidth={SW} fill="none" strokeLinecap="round"
              strokeDasharray={`${len.toFixed(2)} ${C}`}
            />
          </svg>
          {/* .gauge-c — positioned at bottom of gauge */}
          <div className="absolute left-0 right-0 bottom-0 text-center">
            <div
              className="text-foreground"
              style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 26, fontWeight: 500, letterSpacing: "-.02em" }}
            >
              {margin.toFixed(1)}%
            </div>
            <div
              className="text-muted-foreground uppercase mt-0.5"
              style={{ fontSize: 10.5, letterSpacing: ".08em" }}
            >
              net margin
            </div>
          </div>
        </div>

        {/* Target progress */}
        <div className="w-full" style={{ padding: "10px 0 4px" }}>
          <div className="flex justify-between text-muted-foreground mb-2" style={{ fontSize: 11.5 }}>
            <span>vs target</span>
            <span
              className="text-foreground font-medium"
              style={{ fontFamily: "var(--font-mono, ui-monospace)" }}
            >
              70%
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted))" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: Math.min(100, (margin / 70) * 100) + "%",
                background: "hsl(var(--primary))",
              }}
            />
          </div>
          <div
            className="flex justify-between text-muted-foreground/60 mt-1.5"
            style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 10.5 }}
          >
            <span>0%</span>
            <span>target line</span>
          </div>
        </div>

        {/* Insight box */}
        {prev && (
          <div
            className="w-full rounded-lg text-muted-foreground leading-relaxed"
            style={{
              fontSize: 11.5,
              padding: "10px 12px",
              background: "color-mix(in oklab, hsl(var(--primary)) 14%, transparent)",
            }}
          >
            ⚡{" "}
            Margin{" "}
            <b className="text-foreground font-medium" style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>
              {margin.toFixed(1)}%
            </b>{" "}
            — expenses grew{" "}
            <b className="text-foreground font-medium" style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>
              {expGrowth > 0 ? "+" : ""}{expGrowth}%
            </b>{" "}
            while revenue jumped{" "}
            <b className="font-medium" style={{ fontFamily: "var(--font-mono, ui-monospace)", color: "hsl(var(--pos))" }}>
              {revGrowth > 0 ? "+" : ""}{revGrowth}%
            </b>.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Daily Card ────────────────────────────────────────────────────────────────

function DailyCard({ daily }: { daily: DailyActivity[] }) {
  if (!daily.length) {
    return (
      <div className="col-span-12 rounded-xl border border-border bg-card p-[18px_20px]">
        <h3 className="text-foreground/70 font-medium" style={{ fontSize: 13 }}>Daily activity · 30 days</h3>
        <p className="text-muted-foreground mt-1" style={{ fontSize: 12 }}>No data available.</p>
      </div>
    );
  }

  const maxV = Math.max(...daily.map((d) => d.edi_amount + d.iop_amount), 1);

  return (
    <div className="col-span-12 rounded-xl border border-border bg-card p-[18px_20px]">
      {/* Card header */}
      <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
        <div>
          <h3 className="text-foreground/70 font-medium" style={{ fontSize: 13, letterSpacing: "-.005em", margin: 0 }}>
            Daily activity · {daily.length} days
          </h3>
          <div className="text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11 }}>
            EDI + IOP collections · weekends muted
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <span className="flex items-center gap-1.5 text-muted-foreground" style={{ fontSize: 11.5 }}>
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(var(--primary))" }} /> IOP
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground" style={{ fontSize: 11.5 }}>
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(var(--accent))" }} /> EDI
          </span>
        </div>
      </div>

      {/* Bars — height 140px matching .daily */}
      <div className="flex items-end mt-1" style={{ height: 140, gap: 4 }}>
        {daily.map((d, i) => {
          const total = d.edi_amount + d.iop_amount;
          const hPct = (total / maxV) * 100;
          const ediPct = total > 0 ? (d.edi_amount / total) * hPct : 0;
          const iopPct = total > 0 ? (d.iop_amount / total) * hPct : 0;
          const dt = new Date(d.date);
          const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col-reverse items-center h-full min-w-0"
              style={{ gap: 2 }}
              title={`${d.date} · ${fmt(total)}`}
            >
              {/* IOP — bottom (column-reverse, first = bottom) */}
              <div
                className="w-full flex-shrink-0"
                style={{
                  height: iopPct + "%",
                  minHeight: iopPct > 0 ? 1 : 0,
                  borderRadius: "2px 2px 0 0",
                  background: isWeekend
                    ? "color-mix(in oklab, hsl(var(--primary)) 55%, hsl(var(--muted)))"
                    : "hsl(var(--primary))",
                }}
              />
              {/* EDI — above IOP */}
              <div
                className="w-full flex-shrink-0"
                style={{
                  height: ediPct + "%",
                  minHeight: ediPct > 0 ? 1 : 0,
                  borderRadius: 2,
                  background: isWeekend
                    ? "color-mix(in oklab, hsl(var(--accent)) 55%, hsl(var(--muted)))"
                    : "hsl(var(--accent))",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels — .daily-axis font-size 9.5px */}
      <div className="flex mt-2" style={{ gap: 4 }}>
        {daily.map((d, i) => {
          const dt = new Date(d.date);
          return (
            <div
              key={i}
              className="flex-1 text-center text-muted-foreground"
              style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 9.5 }}
            >
              {i % 5 === 0 ? dt.getDate() : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Placeholder card ──────────────────────────────────────────────────────────

function PlaceholderCard({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="col-span-12 xl:col-span-4 rounded-xl border border-border bg-card p-[18px_20px]">
      <h3 className="text-foreground/70 font-medium" style={{ fontSize: 13, letterSpacing: "-.005em", margin: 0 }}>
        {title}
      </h3>
      <div className="text-muted-foreground mt-0.5 mb-4" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11 }}>
        {sub}
      </div>
      <div className="flex flex-col items-center justify-center text-muted-foreground/30" style={{ padding: "28px 0" }}>
        <div className="text-3xl leading-none mb-1.5">—</div>
        <div style={{ fontSize: 11 }}>Coming soon</div>
      </div>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: daily, isLoading: dailyLoading } = useDailyActivity(30);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [period, setPeriod] = useState("6M");

  if (summaryLoading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-44 bg-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 xl:col-span-8 h-56 bg-muted rounded-xl animate-pulse" />
          <div className="col-span-12 xl:col-span-4 h-56 bg-muted rounded-xl animate-pulse" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="col-span-6 xl:col-span-3 h-32 bg-muted rounded-xl animate-pulse" />
          ))}
          <div className="col-span-12 xl:col-span-8 h-72 bg-muted rounded-xl animate-pulse" />
          <div className="col-span-12 xl:col-span-4 h-72 bg-muted rounded-xl animate-pulse" />
          <div className="col-span-12 h-52 bg-muted rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const monthlyTrends = summary?.monthly_trends ?? [];
  const months = monthlyTrends.map((t) => t.month);
  const latestMonth = months[months.length - 1] ?? "";
  const activeMonth = selectedMonth || latestMonth;
  const activeIdx = months.indexOf(activeMonth);

  const canPrev = activeIdx > 0;
  const canNext = activeIdx < months.length - 1;
  const trend = monthlyTrends[activeIdx];
  const prev = activeIdx > 0 ? monthlyTrends[activeIdx - 1] : null;

  if (!trend) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p style={{ fontSize: 13 }}>No financial data available yet.</p>
      </div>
    );
  }

  const kpis = [
    {
      lbl: "IOP profit",
      value: trend.iop_profit,
      pts: monthlyTrends.map((m) => m.iop_profit),
      color: "hsl(var(--primary))",
      delta: prev ? momDelta(trend.iop_profit, prev.iop_profit) : "—",
      deltaLbl: "vs prev month",
      up: !prev || trend.iop_profit >= prev.iop_profit,
    },
    {
      lbl: "EDI profit",
      value: trend.edi_profit,
      pts: monthlyTrends.map((m) => m.edi_profit),
      color: "hsl(var(--accent))",
      delta: prev ? momDelta(trend.edi_profit, prev.edi_profit) : "—",
      deltaLbl: "vs prev month",
      up: !prev || trend.edi_profit >= prev.edi_profit,
    },
    {
      lbl: "Expenses",
      value: trend.expense,
      pts: monthlyTrends.map((m) => m.expense),
      color: "hsl(var(--warn))",
      delta: prev ? momDelta(trend.expense, prev.expense) : "—",
      deltaLbl: "vs prev month",
      up: !prev || trend.expense <= prev.expense,
    },
    {
      lbl: "Net profit",
      value: trend.net_profit,
      pts: monthlyTrends.map((m) => m.net_profit),
      color: "hsl(var(--pos))",
      delta: prev ? momDelta(trend.net_profit, prev.net_profit) : "—",
      deltaLbl: "vs prev month",
      up: !prev || trend.net_profit >= prev.net_profit,
    },
  ];

  const periodOptions = ["1M", "3M", "6M", "12M", "YTD"];

  return (
    <div className="space-y-4">
      {/* Sub bar */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-foreground font-medium tracking-tight leading-tight" style={{ fontSize: 20 }}>
            Financial overview
          </h1>
          <div className="text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11.5 }}>
            {activeMonth} · {months.length}-month outlook
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Month navigator */}
          {months.length > 0 && (
            <div
              className="inline-flex items-center gap-1 bg-card border border-border rounded-lg"
              style={{ padding: 3 }}
            >
              <button
                onClick={() => canPrev && setSelectedMonth(months[activeIdx - 1])}
                disabled={!canPrev}
                className="flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                style={{ width: 26, height: 26 }}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <select
                value={activeMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-foreground focus:outline-none cursor-pointer text-center font-medium appearance-none"
                style={{ fontSize: 13, padding: "0 4px", minWidth: 100, border: 0, outline: 0 }}
              >
                {months.map((m) => (
                  <option key={m} value={m} className="bg-card">{m}</option>
                ))}
              </select>
              <button
                onClick={() => canNext && setSelectedMonth(months[activeIdx + 1])}
                disabled={!canNext}
                className="flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                style={{ width: 26, height: 26 }}
                aria-label="Next month"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Period segment */}
          <div
            className="inline-flex items-center bg-muted rounded-lg"
            style={{ padding: 3, gap: 2 }}
          >
            {periodOptions.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md font-medium transition-colors ${
                  period === p
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                style={{ padding: "4px 12px", fontSize: 12 }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 12-column grid */}
      <div className="grid grid-cols-12" style={{ gap: 16 }}>
        {/* Row 1: Hero (8) + Composition (4) */}
        <HeroCard trend={trend} prev={prev} />
        <CompositionCard trend={trend} />

        {/* Row 2: 4 KPI tiles */}
        {kpis.map((kpi, i) => (
          <div key={i} className="col-span-6 xl:col-span-3">
            <KpiTile {...kpi} />
          </div>
        ))}

        {/* Row 3: Trend chart (8) + Margin gauge (4) */}
        <TrendCard data={monthlyTrends} />
        <MarginCard trend={trend} prev={prev} />

        {/* Row 4: Daily activity (full width) */}
        <DailyCard daily={dailyLoading ? [] : (daily ?? [])} />

        {/* Row 5: Placeholder bottom cards */}
        <PlaceholderCard title="Top customers" sub="by collected amount · this month" />
        <PlaceholderCard title="Receivables aging" sub="outstanding by bucket" />
        <PlaceholderCard title="Recent activity" sub="across all products" />
      </div>
    </div>
  );
}
