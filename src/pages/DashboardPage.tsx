import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDashboardSummary, useDailyActivity } from "@/hooks/useDashboard";
import type { MonthlyProfit, DailyActivity } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtShort = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 100000) return sign + "₹" + (abs / 100000).toFixed(2) + "L";
  if (abs >= 1000) return sign + "₹" + (abs / 1000).toFixed(1) + "k";
  return sign + "₹" + Math.round(abs);
};

const fmt = (n: number): string => "₹" + Math.round(n).toLocaleString("en-IN");

const deltaPct = (curr: number, prev: number): string => {
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
  if (points.length < 2) return <div className="h-[22px]" />;
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
  lbl, val, pts, color, delta, deltaLbl, up,
}: {
  lbl: string; val: string; pts: number[]; color: string;
  delta: string; deltaLbl: string; up: boolean;
}) {
  return (
    <div className="h-full rounded-xl border border-border bg-card p-3.5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground font-medium uppercase tracking-wide leading-tight truncate">
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
          <span className="truncate">{lbl}</span>
        </div>
        <span
          className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
            up
              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
          }`}
        >
          {delta}
        </span>
      </div>
      <div className="text-xl font-semibold tracking-tight font-mono text-foreground leading-none">{val}</div>
      <Spark
        points={pts}
        color={up ? "hsl(var(--pos))" : "hsl(var(--neg))"}
        fill={
          up
            ? "color-mix(in oklab, hsl(var(--pos)) 12%, transparent)"
            : "color-mix(in oklab, hsl(var(--neg)) 12%, transparent)"
        }
      />
      <div className="flex items-center justify-between text-[9.5px] text-muted-foreground/60 font-mono">
        <span>{deltaLbl}</span>
        <span>{pts.length}m</span>
      </div>
    </div>
  );
}

// ── Hero Card ─────────────────────────────────────────────────────────────────

function HeroCard({ trend, prev }: { trend: MonthlyProfit; prev: MonthlyProfit | null }) {
  const revenue = trend.iop_profit + trend.edi_profit;
  const mom = prev ? ((trend.net_profit - prev.net_profit) / Math.abs(prev.net_profit)) * 100 : 0;
  const isUp = mom >= 0;

  const wfCols = [
    {
      sign: null as string | null,
      color: "hsl(var(--primary))",
      label: "IOP profit",
      value: trend.iop_profit,
      pct: Math.round((trend.iop_profit / revenue) * 100),
      barW: 100,
      neg: false, eq: false,
    },
    {
      sign: "+",
      color: "hsl(var(--accent))",
      label: "EDI profit",
      value: trend.edi_profit,
      pct: Math.round((trend.edi_profit / revenue) * 100),
      barW: Math.round((trend.edi_profit / trend.iop_profit) * 100),
      neg: false, eq: false,
    },
    {
      sign: "=",
      color: "hsl(var(--muted-foreground))",
      label: "Revenue",
      value: revenue,
      pct: null,
      barW: 100,
      neg: false, eq: false,
    },
    {
      sign: "−",
      color: "hsl(var(--warn))",
      label: "Expenses",
      value: trend.expense,
      pct: Math.round((trend.expense / revenue) * 100),
      barW: Math.round((trend.expense / revenue) * 100),
      neg: true, eq: false,
    },
    {
      sign: "=",
      color: "hsl(var(--pos))",
      label: "Net",
      value: trend.net_profit,
      pct: null,
      barW: 100,
      neg: false, eq: true,
    },
  ];

  return (
    <div className="col-span-12 xl:col-span-8 rounded-xl border border-border p-4 sm:p-5"
      style={{ background: "linear-gradient(135deg, hsl(var(--card)) 60%, color-mix(in oklab, hsl(var(--primary)) 8%, hsl(var(--card))))" }}>
      {/* Eyebrow */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "hsl(var(--pos))" }} />
        Net profit · {trend.month}
      </div>

      {/* Hero amount + MoM delta */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <div className="text-[40px] sm:text-[48px] font-mono font-semibold tracking-tight text-foreground leading-none">
          <span className="text-2xl text-muted-foreground/50 mr-0.5">₹</span>
          {trend.net_profit.toLocaleString("en-IN")}
        </div>
        <span
          className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium ${
            isUp
              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
          }`}
        >
          {isUp ? "↑" : "↓"} {Math.abs(mom).toFixed(1)}% MoM
        </span>
      </div>

      {/* Sub stats row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11.5px] text-muted-foreground">
        <span>Revenue <b className="text-foreground/80 font-mono font-medium">{fmt(revenue)}</b></span>
        <span className="w-px h-3 bg-border" />
        <span>Margin <b className="text-foreground/80 font-mono font-medium">{Math.round((trend.net_profit / revenue) * 100)}%</b></span>
        {prev && (
          <>
            <span className="w-px h-3 bg-border" />
            <span className={isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"}>
              {isUp ? "↑" : "↓"} {fmt(Math.abs(trend.net_profit - prev.net_profit))} vs prev month
            </span>
          </>
        )}
      </div>

      {/* Waterfall breakdown */}
      <div className="mt-4 pt-4 border-t border-border/40 grid grid-cols-5 gap-2">
        {wfCols.map((col, i) => (
          <div key={i} className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-start gap-0.5 text-[10px] text-muted-foreground leading-tight min-h-[32px]">
              {col.sign ? (
                <span className="text-[11px] font-medium text-muted-foreground/40 flex-shrink-0 mt-px">{col.sign}</span>
              ) : (
                <span className="w-2 h-2 rounded-sm flex-shrink-0 mt-0.5" style={{ background: col.color }} />
              )}
              <span className="truncate">{col.label}</span>
            </div>
            <div
              className={`text-xs sm:text-sm font-mono font-semibold leading-tight truncate ${
                col.neg
                  ? "text-rose-500 dark:text-rose-400"
                  : col.eq
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground"
              }`}
            >
              {col.neg ? "−" : ""}{fmtShort(col.value)}
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: col.barW + "%", background: col.color }} />
            </div>
            {col.pct !== null && (
              <div className="text-[9px] text-muted-foreground/50 font-mono">{col.pct}% of rev</div>
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
    <div className="col-span-12 xl:col-span-4 rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground leading-tight">Revenue composition</h3>
        <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">IOP vs EDI · {trend.month}</div>
      </div>

      <div className="flex items-center gap-5 flex-1">
        {/* Donut */}
        <div className="relative flex-shrink-0" style={{ width: 120, height: 120 }}>
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
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Revenue</div>
            <div className="font-mono font-semibold text-foreground text-base leading-tight mt-0.5">{fmtShort(revenue)}</div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {items.map((it) => (
            <div key={it.label} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: it.color }} />
              <span className="text-muted-foreground flex-1">{it.label}</span>
              <span className="font-mono font-medium text-foreground">{fmtShort(it.value)}</span>
              <span className="text-muted-foreground/60 font-mono w-7 text-right">{it.pct}%</span>
            </div>
          ))}
          <div className="border-t border-border/50 pt-2 flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: "hsl(var(--warn))" }} />
            <span className="text-muted-foreground flex-1">Expense</span>
            <span className="font-mono font-medium text-rose-500 dark:text-rose-400">−{fmtShort(trend.expense)}</span>
            <span className="text-muted-foreground/60 font-mono w-7 text-right">{Math.round((trend.expense / revenue) * 100)}%</span>
          </div>
          <div className="border-t border-border/50 pt-2 flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: "hsl(var(--pos))" }} />
            <span className="text-muted-foreground flex-1">Net</span>
            <span className="font-mono font-semibold" style={{ color: "hsl(var(--pos))" }}>{fmtShort(trend.net_profit)}</span>
            <span className="text-muted-foreground/60 font-mono w-7 text-right">{Math.round((trend.net_profit / revenue) * 100)}%</span>
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
      <div className="col-span-12 xl:col-span-8 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-foreground">6-month trend</h3>
        <p className="text-xs text-muted-foreground mt-1">Not enough data yet.</p>
      </div>
    );
  }

  const W = 720, H = 220, PL = 48, PR = 16, PT = 14, PB = 28;
  const w = W - PL - PR, h = H - PT - PB;
  const maxY = Math.max(...data.flatMap((m) => [m.iop_profit, m.edi_profit, m.net_profit]));
  const scaleY = (v: number) => PT + h - (v / (maxY * 1.08)) * h;
  const scaleX = (i: number) => PL + (i / (data.length - 1)) * w;
  const ticks = 4;
  const gridY = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxY * i) / ticks));

  const pathOf = (key: keyof MonthlyProfit) =>
    "M " + data.map((m, i) => scaleX(i).toFixed(1) + " " + scaleY(m[key] as number).toFixed(1)).join(" L ");

  const iopPath = pathOf("iop_profit");
  const ediPath = pathOf("edi_profit");
  const netPath = pathOf("net_profit");
  const bottom = (PT + h).toFixed(1);
  const iopArea = iopPath + ` L ${scaleX(data.length - 1).toFixed(1)} ${bottom} L ${scaleX(0).toFixed(1)} ${bottom} Z`;
  const ediArea = ediPath + ` L ${scaleX(data.length - 1).toFixed(1)} ${bottom} L ${scaleX(0).toFixed(1)} ${bottom} Z`;

  const legend = [
    { key: "net", label: "Net profit", color: "hsl(var(--pos))", isLine: true },
    { key: "iop", label: "IOP", color: "hsl(var(--primary))" },
    { key: "edi", label: "EDI", color: "hsl(var(--accent))" },
  ];

  return (
    <div className="col-span-12 xl:col-span-8 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground leading-tight">6-month trend</h3>
          <div className="text-[11px] text-muted-foreground mt-0.5">Net profit vs IOP vs EDI</div>
        </div>
        <div className="flex gap-3 items-center">
          {legend.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                style={{
                  width: 10,
                  height: s.isLine ? 2 : 10,
                  background: s.color,
                  borderRadius: s.isLine ? 0 : 2,
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 200, display: "block" }}>
        <defs>
          <linearGradient id="dashIopG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity=".32" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="dashEdiG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity=".38" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines + Y labels */}
        {gridY.map((v, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={scaleY(v)} y2={scaleY(v)}
              stroke="hsl(var(--border))" strokeWidth="0.6" />
            <text x={PL - 6} y={scaleY(v) + 3.5} textAnchor="end"
              fontSize="9" fill="hsl(var(--muted-foreground))" fontFamily="monospace">
              {fmtShort(v)}
            </text>
          </g>
        ))}

        {/* Areas */}
        <path d={iopArea} fill="url(#dashIopG)" />
        <path d={ediArea} fill="url(#dashEdiG)" />

        {/* Lines */}
        <path d={iopPath} stroke="hsl(var(--primary))" strokeWidth="1.5" fill="none" />
        <path d={ediPath} stroke="hsl(var(--accent))" strokeWidth="1.5" fill="none" />
        <path d={netPath} stroke="hsl(var(--pos))" strokeWidth="2.4" fill="none" />

        {/* Net profit dots */}
        {data.map((m, i) => (
          <circle key={i} cx={scaleX(i)} cy={scaleY(m.net_profit)} r="3.5"
            fill="hsl(var(--card))" stroke="hsl(var(--pos))" strokeWidth="2" />
        ))}

        {/* X axis labels */}
        {data.map((m, i) => (
          <text key={i} x={scaleX(i)} y={H - 6} textAnchor="middle"
            fontSize="9" fill="hsl(var(--muted-foreground))" fontFamily="monospace">
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
  const pct = Math.min(100, Math.max(0, margin));
  const len = (pct / 100) * C;

  const expGrowth = prev && prev.expense > 0
    ? Math.round(((trend.expense - prev.expense) / prev.expense) * 100)
    : 0;
  const revGrowth = prev && prevRev > 0
    ? Math.round(((revenue - prevRev) / prevRev) * 100)
    : 0;

  return (
    <div className="col-span-12 xl:col-span-4 rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground leading-tight">Profit margin</h3>
          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">net / revenue · {trend.month}</div>
        </div>
        {prev && (
          <span
            className={`text-[10.5px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
              deltaPp >= 0
                ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                : "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
            }`}
          >
            {deltaPp >= 0 ? "↑" : "↓"} {Math.abs(deltaPp).toFixed(1)} pp
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        {/* Half-circle gauge */}
        <div className="relative w-full max-w-[200px]">
          <svg viewBox="0 0 160 90" style={{ width: "100%", height: "auto", display: "block" }}>
            <path d={`M 10 80 A ${R} ${R} 0 0 1 150 80`}
              stroke="hsl(var(--muted))" strokeWidth={SW} fill="none" strokeLinecap="round" />
            <path d={`M 10 80 A ${R} ${R} 0 0 1 150 80`}
              stroke="hsl(var(--pos))" strokeWidth={SW} fill="none" strokeLinecap="round"
              strokeDasharray={`${len.toFixed(2)} ${C}`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-3 text-center">
            <div className="text-2xl font-mono font-semibold text-foreground leading-none">{margin.toFixed(1)}%</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">net margin</div>
          </div>
        </div>

        {/* Target progress bar */}
        <div className="w-full space-y-1.5">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>vs target</span>
            <span className="font-mono font-medium text-foreground">70%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all"
              style={{ width: Math.min(100, (margin / 70) * 100) + "%" }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground/60 font-mono">
            <span>0%</span>
            <span>target 70%</span>
          </div>
        </div>

        {/* Insight box */}
        {prev && (
          <div
            className="w-full rounded-lg p-3 text-[11.5px] text-muted-foreground leading-relaxed"
            style={{ background: "color-mix(in oklab, hsl(var(--primary)) 14%, transparent)" }}
          >
            ⚡{" "}
            Margin{" "}
            <span className="text-foreground font-medium font-mono">{margin.toFixed(1)}%</span>
            {" "}— expenses grew{" "}
            <span className="font-mono font-medium text-foreground">{expGrowth > 0 ? "+" : ""}{expGrowth}%</span>{" "}
            while revenue jumped{" "}
            <span className="font-mono font-medium" style={{ color: "hsl(var(--pos))" }}>
              {revGrowth > 0 ? "+" : ""}{revGrowth}%
            </span>.
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
      <div className="col-span-12 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-foreground">Daily activity · 30 days</h3>
        <p className="text-xs text-muted-foreground mt-1">No data available.</p>
      </div>
    );
  }

  const maxV = Math.max(...daily.map((d) => d.edi_amount + d.iop_amount), 1);

  return (
    <div className="col-span-12 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground leading-tight">Daily activity · {daily.length} days</h3>
          <div className="text-[11px] text-muted-foreground mt-0.5">EDI + IOP collections · weekends muted</div>
        </div>
        <div className="flex gap-3 items-center">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(var(--primary))" }} /> IOP
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(var(--accent))" }} /> EDI
          </span>
        </div>
      </div>

      {/* Bars */}
      <div className="flex items-end gap-px" style={{ height: 120 }}>
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
              className="flex-1 flex flex-col justify-end h-full"
              style={{ opacity: isWeekend ? 0.35 : 1 }}
              title={`${d.date} · ${fmt(total)}`}
            >
              <div className="flex-shrink-0" style={{ height: ediPct + "%", background: "hsl(var(--accent))" }} />
              <div className="flex-shrink-0" style={{ height: iopPct + "%", background: "hsl(var(--primary))" }} />
            </div>
          );
        })}
      </div>

      {/* X axis day labels */}
      <div className="flex mt-1.5">
        {daily.map((d, i) => {
          const dt = new Date(d.date);
          return (
            <div key={i} className="flex-1 text-center text-[8.5px] text-muted-foreground/50 font-mono">
              {i % 5 === 0 ? dt.getDate() : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Empty / placeholder card ──────────────────────────────────────────────────

function PlaceholderCard({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="col-span-12 xl:col-span-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-foreground leading-tight">{title}</h3>
      <div className="text-[11px] text-muted-foreground mt-0.5 mb-4">{sub}</div>
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/30">
        <div className="text-3xl mb-1.5 leading-none">—</div>
        <div className="text-[11px]">Coming soon</div>
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
          <div className="col-span-12 xl:col-span-8 h-52 bg-muted rounded-xl animate-pulse" />
          <div className="col-span-12 xl:col-span-4 h-52 bg-muted rounded-xl animate-pulse" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="col-span-6 xl:col-span-3 h-28 bg-muted rounded-xl animate-pulse" />
          ))}
          <div className="col-span-12 xl:col-span-8 h-64 bg-muted rounded-xl animate-pulse" />
          <div className="col-span-12 xl:col-span-4 h-64 bg-muted rounded-xl animate-pulse" />
          <div className="col-span-12 h-48 bg-muted rounded-xl animate-pulse" />
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
        <p className="text-sm">No financial data available yet.</p>
      </div>
    );
  }

  // KPI tiles — using monthly_trends as 6-month sparklines
  const kpis = [
    {
      lbl: "IOP profit",
      val: fmtShort(trend.iop_profit),
      pts: monthlyTrends.map((m) => m.iop_profit),
      color: "hsl(var(--primary))",
      delta: deltaPct(trend.iop_profit, prev?.iop_profit ?? trend.iop_profit),
      deltaLbl: "vs prev month",
      up: !prev || trend.iop_profit >= prev.iop_profit,
    },
    {
      lbl: "EDI profit",
      val: fmtShort(trend.edi_profit),
      pts: monthlyTrends.map((m) => m.edi_profit),
      color: "hsl(var(--accent))",
      delta: deltaPct(trend.edi_profit, prev?.edi_profit ?? trend.edi_profit),
      deltaLbl: "vs prev month",
      up: !prev || trend.edi_profit >= prev.edi_profit,
    },
    {
      lbl: "Expenses",
      val: fmtShort(trend.expense),
      pts: monthlyTrends.map((m) => m.expense),
      color: "hsl(var(--warn))",
      delta: deltaPct(trend.expense, prev?.expense ?? trend.expense),
      deltaLbl: "vs prev month",
      up: !prev || trend.expense <= prev.expense, // lower expenses = good
    },
    {
      lbl: "Net profit",
      val: fmtShort(trend.net_profit),
      pts: monthlyTrends.map((m) => m.net_profit),
      color: "hsl(var(--pos))",
      delta: deltaPct(trend.net_profit, prev?.net_profit ?? trend.net_profit),
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
          <h1 className="text-lg sm:text-xl font-medium text-foreground tracking-tight leading-tight">
            Financial overview
          </h1>
          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            {activeMonth} · {months.length}-month outlook
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Month navigator */}
          {months.length > 0 && (
            <div className="flex items-center gap-0.5 border border-border rounded-lg px-1 py-0.5 bg-card">
              <button
                onClick={() => canPrev && setSelectedMonth(months[activeIdx - 1])}
                disabled={!canPrev}
                className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <select
                value={activeMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-medium text-foreground focus:outline-none px-1 cursor-pointer min-w-[88px] text-center"
              >
                {months.map((m) => (
                  <option key={m} value={m} className="bg-card">{m}</option>
                ))}
              </select>
              <button
                onClick={() => canNext && setSelectedMonth(months[activeIdx + 1])}
                disabled={!canNext}
                className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Period tabs */}
          <div className="flex items-center border border-border rounded-lg bg-card overflow-hidden">
            {periodOptions.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`h-8 px-2.5 text-xs font-medium transition-colors ${
                  period === p
                    ? "bg-primary/30 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 12-column grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Row 1: Hero (8) + Composition (4) */}
        <HeroCard trend={trend} prev={prev} />
        <CompositionCard trend={trend} />

        {/* Row 2: 4 KPI tiles */}
        {kpis.map((kpi, i) => (
          <div key={i} className="col-span-6 xl:col-span-3">
            <KpiTile {...kpi} />
          </div>
        ))}

        {/* Row 3: Trend (8) + Margin gauge (4) */}
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
