import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useDashboardSummary, useLoanSummary,
  useIopReminders, useIopCalendar,
  useEdiInactive, useEdiDefaulters, useIopMonthlyDues,
} from "@/hooks/useDashboard";
import type {
  MonthlyProfit, LoanSummary,
  CustomerBrief, IopCalendarDay,
  EdiInactiveCustomer, EdiDefaulter, IopMonthlyDue,
} from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number): string => "₹" + Math.round(n).toLocaleString("en-IN");

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

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
};

// ── Spark SVG ─────────────────────────────────────────────────────────────────

function Spark({ points, color = "hsl(var(--pos))", fill }: { points: number[]; color?: string; fill?: string }) {
  if (points.length < 2) return <div style={{ height: 22 }} />;
  const W = 80, H = 22, P = 2;
  const mn = Math.min(...points), mx = Math.max(...points);
  const r = mx - mn || 1;
  const stepX = (W - P * 2) / (points.length - 1);
  const xy: [number, number][] = points.map((v, i) => [P + i * stepX, H - P - ((v - mn) / r) * (H - P * 2)]);
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

function KpiTile({ lbl, value, pts, color, delta, deltaLbl, up }: {
  lbl: string; value: number; pts: number[]; color: string;
  delta: string; deltaLbl: string; up: boolean;
}) {
  return (
    <div className="h-full rounded-xl border border-border bg-card p-[14px_16px] flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium uppercase text-muted-foreground" style={{ fontSize: 10.5, letterSpacing: ".1em" }}>
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
          <span className="truncate">{lbl}</span>
        </div>
        <span className={`flex-shrink-0 font-medium rounded-full px-[7px] py-[2px] ${up ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]"}`}
          style={{ fontSize: 11, fontFamily: "var(--font-mono, ui-monospace)",
            background: up ? "color-mix(in oklab, hsl(var(--pos)) 14%, transparent)" : "color-mix(in oklab, hsl(var(--neg)) 14%, transparent)" }}>
          {delta}
        </span>
      </div>
      <div className="text-foreground leading-[1.1]"
        style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 22, fontWeight: 500, letterSpacing: "-.02em" }}>
        <span className="text-muted-foreground font-normal mr-0.5" style={{ fontSize: 14 }}>₹</span>
        {Math.round(value).toLocaleString("en-IN")}
      </div>
      <Spark points={pts}
        color={up ? "hsl(var(--pos))" : "hsl(var(--neg))"}
        fill={up ? "color-mix(in oklab, hsl(var(--pos)) 12%, transparent)" : "color-mix(in oklab, hsl(var(--neg)) 12%, transparent)"} />
      <div className="flex items-baseline justify-between text-muted-foreground" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11 }}>
        <span>{deltaLbl}</span>
        <span>{pts.length}m</span>
      </div>
    </div>
  );
}

// ── Hero Card ─────────────────────────────────────────────────────────────────

function HeroCard({ trend, prev }: { trend: MonthlyProfit; prev: MonthlyProfit | null }) {
  const revenue = trend.iop_profit + trend.edi_profit;
  const mom = prev && prev.net_profit !== 0 ? ((trend.net_profit - prev.net_profit) / Math.abs(prev.net_profit)) * 100 : 0;
  const isUp = mom >= 0;

  const wfCols = [
    { sign: null as string | null, color: "hsl(var(--primary))", label: "IOP profit",
      value: trend.iop_profit, pct: Math.round((trend.iop_profit / Math.max(revenue, 1)) * 100), barW: 100, neg: false, eq: false },
    { sign: "+", color: "hsl(var(--accent))", label: "EDI profit",
      value: trend.edi_profit, pct: Math.round((trend.edi_profit / Math.max(revenue, 1)) * 100),
      barW: Math.round((trend.edi_profit / Math.max(trend.iop_profit, 1)) * 100), neg: false, eq: false },
    { sign: "=", color: "hsl(var(--muted-foreground))", label: "Revenue",
      value: revenue, pct: null, barW: 100, neg: false, eq: false },
    { sign: "+", color: "#10b981", label: "Unclaimed",
      value: trend.unclaimed, pct: null, barW: Math.round((trend.unclaimed / Math.max(revenue, 1)) * 100), neg: false, eq: false },
    { sign: "−", color: "#f59e0b", label: "Defaulted",
      value: trend.defaulted, pct: null, barW: Math.round((trend.defaulted / Math.max(revenue, 1)) * 100), neg: true, eq: false },
    { sign: "−", color: "hsl(var(--warn))", label: "Expenses",
      value: trend.expense, pct: Math.round((trend.expense / Math.max(revenue, 1)) * 100),
      barW: Math.round((trend.expense / Math.max(revenue, 1)) * 100), neg: true, eq: false },
    { sign: "=", color: "hsl(var(--pos))", label: "Net", value: trend.net_profit, pct: null, barW: 100, neg: false, eq: true },
  ];

  return (
    <div className="col-span-12 xl:col-span-8 rounded-xl border border-border p-[22px_24px] relative overflow-hidden"
      style={{ background: "radial-gradient(120% 80% at 100% 0%, color-mix(in oklab, hsl(var(--primary)) 30%, transparent), transparent 55%), hsl(var(--card))" }}>
      <div className="flex items-center gap-2 text-muted-foreground font-medium uppercase" style={{ fontSize: 10.5, letterSpacing: ".12em" }}>
        <span className="w-[5px] h-[5px] rounded-full" style={{ background: "hsl(var(--pos))", animation: "pulse 1.6s infinite" }} />
        Net profit · {trend.month}
      </div>
      <div className="flex items-baseline gap-4 mt-2 flex-wrap">
        <div className="text-foreground leading-none"
          style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 44, fontWeight: 500, letterSpacing: "-.03em" }}>
          <span className="text-muted-foreground font-normal mr-1" style={{ fontSize: 26 }}>₹</span>
          {trend.net_profit.toLocaleString("en-IN")}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full px-[10px] py-[4px] font-medium"
          style={{ fontSize: 12, fontFamily: "var(--font-mono, ui-monospace)",
            background: isUp ? "color-mix(in oklab, hsl(var(--pos)) 14%, transparent)" : "color-mix(in oklab, hsl(var(--neg)) 14%, transparent)",
            color: isUp ? "hsl(var(--pos))" : "hsl(var(--neg))" }}>
          {isUp ? "↑" : "↓"} {Math.abs(mom).toFixed(1)}% MoM
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-muted-foreground" style={{ fontSize: 12.5 }}>
        <span>Revenue <b className="font-medium" style={{ color: "hsl(var(--foreground))", fontFamily: "var(--font-mono, ui-monospace)" }}>{fmt(revenue)}</b></span>
        <span className="w-px h-3 bg-border" />
        <span>Margin <b className="font-medium" style={{ color: "hsl(var(--foreground))", fontFamily: "var(--font-mono, ui-monospace)" }}>{Math.round((trend.net_profit / Math.max(revenue, 1)) * 100)}%</b></span>
        {trend.unclaimed > 0 && (<><span className="w-px h-3 bg-border" /><span>Unclaimed <b className="font-medium" style={{ color: "#10b981", fontFamily: "var(--font-mono, ui-monospace)" }}>+{fmt(trend.unclaimed)}</b></span></>)}
        {trend.defaulted > 0 && (<><span className="w-px h-3 bg-border" /><span>Defaulted <b className="font-medium" style={{ color: "hsl(var(--neg))", fontFamily: "var(--font-mono, ui-monospace)" }}>−{fmt(trend.defaulted)}</b></span></>)}
        {prev && (<><span className="w-px h-3 bg-border" /><span style={{ color: isUp ? "hsl(var(--pos))" : "hsl(var(--neg))" }}>{isUp ? "↑" : "↓"} {fmt(Math.abs(trend.net_profit - prev.net_profit))} vs prev month</span></>)}
      </div>
      <div className="mt-[22px] pt-[18px] border-t border-border/40 grid grid-cols-7" style={{ gap: 0 }}>
        {wfCols.map((col, i) => (
          <div key={i} className="flex flex-col gap-1.5 min-w-0"
            style={{ padding: "0 12px", paddingLeft: i === 0 ? 0 : 12, paddingRight: i === wfCols.length - 1 ? 0 : 12,
              borderRight: i < wfCols.length - 1 ? "1px solid hsl(var(--border) / .5)" : "none", position: "relative" }}>
            <div className="flex items-center gap-1 text-muted-foreground font-medium uppercase" style={{ fontSize: 10.5, letterSpacing: ".08em", minHeight: 32 }}>
              {col.sign ? (
                <span className="absolute text-muted-foreground/40 font-light" style={{ fontSize: 18, fontFamily: "var(--font-mono, ui-monospace)", left: -10, top: "50%", transform: "translateY(-50%)" }}>{col.sign}</span>
              ) : (
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: col.color }} />
              )}
              <span className="truncate">{col.label}</span>
            </div>
            <div className="leading-tight"
              style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 17, fontWeight: 500, letterSpacing: "-.02em",
                color: col.neg ? "hsl(var(--neg))" : col.eq ? "hsl(var(--pos))" : "hsl(var(--foreground))" }}>
              {col.neg ? "−" : ""}{fmt(col.value)}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted))" }}>
              <div className="h-full rounded-full transition-all" style={{ width: Math.min(100, col.barW) + "%", background: col.color }} />
            </div>
            {col.pct !== null && (
              <div className="text-muted-foreground" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 10.5 }}>{col.pct}% of rev</div>
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
    { label: "IOP", value: trend.iop_profit, color: "hsl(var(--primary))", pct: Math.round((trend.iop_profit / Math.max(revenue, 1)) * 100) },
    { label: "EDI", value: trend.edi_profit, color: "hsl(var(--accent))", pct: Math.round((trend.edi_profit / Math.max(revenue, 1)) * 100) },
  ];
  const R = 52, SW = 18, C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = items.map((it) => {
    const len = (it.value / Math.max(revenue, 1)) * C;
    const el = { dash: `${Math.max(0, len - 3)} ${C}`, offset: -offset, color: it.color };
    offset += len;
    return el;
  });
  return (
    <div className="col-span-12 xl:col-span-4 rounded-xl border border-border bg-card p-[18px_20px] flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-foreground/70 font-medium" style={{ fontSize: 13, letterSpacing: "-.005em", margin: 0 }}>Revenue composition</h3>
          <div className="text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11 }}>IOP vs EDI · {trend.month}</div>
        </div>
      </div>
      <div className="flex items-center gap-4 flex-1">
        <div className="relative flex-shrink-0" style={{ width: 140, height: 140 }}>
          <svg viewBox="0 0 140 140" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
            <circle cx="70" cy="70" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={SW} />
            {arcs.map((a, i) => (
              <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={a.color} strokeWidth={SW}
                strokeDasharray={a.dash} strokeDashoffset={a.offset} strokeLinecap="butt" />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-muted-foreground uppercase" style={{ fontSize: 10, letterSpacing: ".08em" }}>Revenue</div>
            <div className="text-foreground mt-0.5" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 18, fontWeight: 500, letterSpacing: "-.02em" }}>{fmt(revenue)}</div>
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 10, marginTop: 14 }}>
          {items.map((it) => (
            <div key={it.label} className="grid items-center" style={{ gridTemplateColumns: "12px 1fr auto auto", gap: 10, fontSize: 13 }}>
              <span className="rounded-sm" style={{ width: 10, height: 10, background: it.color, borderRadius: 3 }} />
              <span className="text-foreground/70 font-medium">{it.label}</span>
              <span style={{ fontFamily: "var(--font-mono, ui-monospace)", fontWeight: 500 }}>{fmt(it.value)}</span>
              <span className="text-muted-foreground text-right" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11.5, width: 36 }}>{it.pct}%</span>
            </div>
          ))}
          {trend.unclaimed > 0 && (
            <div className="grid items-center border-t border-border/50 pt-2.5" style={{ gridTemplateColumns: "12px 1fr auto auto", gap: 10, fontSize: 13 }}>
              <span className="rounded-sm" style={{ width: 10, height: 10, background: "#10b981", borderRadius: 3 }} />
              <span className="text-foreground/70 font-medium">Unclaimed</span>
              <span style={{ fontFamily: "var(--font-mono, ui-monospace)", color: "#10b981", fontWeight: 500 }}>+{fmt(trend.unclaimed)}</span>
              <span className="text-muted-foreground text-right" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11.5, width: 36 }}></span>
            </div>
          )}
          {trend.defaulted > 0 && (
            <div className="grid items-center border-t border-border/50 pt-2.5" style={{ gridTemplateColumns: "12px 1fr auto auto", gap: 10, fontSize: 13 }}>
              <span className="rounded-sm" style={{ width: 10, height: 10, background: "#f59e0b", borderRadius: 3 }} />
              <span className="text-foreground/70 font-medium">Defaulted</span>
              <span style={{ fontFamily: "var(--font-mono, ui-monospace)", color: "hsl(var(--neg))", fontWeight: 500 }}>−{fmt(trend.defaulted)}</span>
              <span className="text-muted-foreground text-right" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11.5, width: 36 }}></span>
            </div>
          )}
          <div className="grid items-center border-t border-border/50 pt-2.5" style={{ gridTemplateColumns: "12px 1fr auto auto", gap: 10, fontSize: 13 }}>
            <span className="rounded-sm" style={{ width: 10, height: 10, background: "hsl(var(--warn))", borderRadius: 3 }} />
            <span className="text-foreground/70 font-medium">Expense</span>
            <span style={{ fontFamily: "var(--font-mono, ui-monospace)", color: "hsl(var(--neg))", fontWeight: 500 }}>−{fmt(trend.expense)}</span>
            <span className="text-muted-foreground text-right" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11.5, width: 36 }}>{Math.round((trend.expense / Math.max(revenue, 1)) * 100)}%</span>
          </div>
          <div className="grid items-center border-t border-border/50 pt-2.5" style={{ gridTemplateColumns: "12px 1fr auto auto", gap: 10, fontSize: 13 }}>
            <span className="rounded-sm" style={{ width: 10, height: 10, background: "hsl(var(--pos))", borderRadius: 3 }} />
            <span className="text-foreground/70 font-medium">Net</span>
            <span style={{ fontFamily: "var(--font-mono, ui-monospace)", color: "hsl(var(--pos))", fontWeight: 500 }}>{fmt(trend.net_profit)}</span>
            <span className="text-muted-foreground text-right" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11.5, width: 36 }}>{Math.round((trend.net_profit / Math.max(revenue, 1)) * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trend Card ────────────────────────────────────────────────────────────────

function TrendCard({ data }: { data: MonthlyProfit[] }) {
  if (data.length < 2) return (
    <div className="col-span-12 rounded-xl border border-border bg-card p-[18px_20px]">
      <h3 className="text-foreground/70 font-medium" style={{ fontSize: 13 }}>6-month trend</h3>
      <p className="text-muted-foreground mt-1" style={{ fontSize: 12 }}>Not enough data yet.</p>
    </div>
  );
  const W = 720, H = 220, PL = 48, PR = 16, PT = 14, PB = 28;
  const w = W - PL - PR, h = H - PT - PB;
  const maxY = Math.max(...data.flatMap((m) => [m.iop_profit, m.edi_profit, m.net_profit]));
  const sy = (v: number) => PT + h - (v / (maxY * 1.08)) * h;
  const sx = (i: number) => PL + (i / (data.length - 1)) * w;
  const ticks = 4;
  const gridY = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxY * i) / ticks));
  const pathOf = (vals: number[]) => "M " + vals.map((v, i) => sx(i).toFixed(1) + " " + sy(v).toFixed(1)).join(" L ");
  const iopVals = data.map((m) => m.iop_profit);
  const ediVals = data.map((m) => m.edi_profit);
  const netVals = data.map((m) => m.net_profit);
  const bot = (PT + h).toFixed(1), x0 = sx(0).toFixed(1), xN = sx(data.length - 1).toFixed(1);
  const iopPath = pathOf(iopVals), ediPath = pathOf(ediVals), netPath = pathOf(netVals);
  const legend = [
    { key: "net", label: "Net profit", color: "hsl(var(--pos))", isLine: true },
    { key: "iop", label: "IOP", color: "hsl(var(--primary))" },
    { key: "edi", label: "EDI", color: "hsl(var(--accent))" },
  ];
  return (
    <div className="col-span-12 rounded-xl border border-border bg-card p-[18px_20px]">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="text-foreground/70 font-medium" style={{ fontSize: 13, margin: 0 }}>6-month trend</h3>
          <div className="text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11 }}>profit lines — Net vs IOP vs EDI</div>
        </div>
        <div className="flex gap-3 items-center">
          {legend.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-muted-foreground" style={{ fontSize: 11.5 }}>
              <span style={{ display: "inline-block", width: 10, height: s.isLine ? 2 : 10, background: s.color, borderRadius: s.isLine ? 0 : 2, flexShrink: 0 }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 240, display: "block" }}>
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
        {gridY.map((v, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={sy(v)} y2={sy(v)} stroke="hsl(var(--border))" strokeWidth={i === 0 ? 1 : 0.7} />
            <text x={PL - 8} y={sy(v) + 3} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))" fontFamily="var(--font-mono, ui-monospace)">{fmtAxis(v)}</text>
          </g>
        ))}
        <path d={iopPath + ` L ${xN} ${bot} L ${x0} ${bot} Z`} fill="url(#dashIopG)" />
        <path d={ediPath + ` L ${xN} ${bot} L ${x0} ${bot} Z`} fill="url(#dashEdiG)" />
        <path d={iopPath} stroke="hsl(var(--primary))" strokeWidth="1.6" fill="none" />
        <path d={ediPath} stroke="hsl(var(--accent))" strokeWidth="1.6" fill="none" />
        <path d={netPath} stroke="hsl(var(--pos))" strokeWidth="2.5" fill="none" />
        {netVals.map((v, i) => <circle key={i} cx={sx(i)} cy={sy(v)} r="3.5" fill="hsl(var(--card))" stroke="hsl(var(--pos))" strokeWidth="2" />)}
        {data.map((m, i) => (
          <text key={i} x={sx(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))" fontFamily="var(--font-mono, ui-monospace)">
            {m.month.split(" ")[0].slice(0, 3).toUpperCase()}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Loan Summary Cards ─────────────────────────────────────────────────────────

function LoanSummaryCards({ data }: { data: LoanSummary }) {
  const overallReceivable = data.edi_total_receivable + data.iop_total_loan;
  const cards = [
    { label: "EDI — Overall Portfolio",            value: data.edi_total_loan,        color: "hsl(var(--primary))", tag: "EDI" },
    { label: "IOP — Overall Portfolio",            value: data.iop_total_loan,        color: "hsl(var(--primary))", tag: "IOP" },
    { label: "EDI — Outstanding Receivable",       value: data.edi_total_receivable,  color: "hsl(var(--accent))",  tag: "EDI" },
    { label: "Overall Outstanding Receivable",     value: overallReceivable,          color: "hsl(var(--accent))",  tag: "EDI + IOP" },
  ];
  return (
    <>
      {cards.map((c) => (
        <div key={c.label} className="col-span-12 xl:col-span-3 rounded-xl border border-border bg-card p-[16px_18px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-muted-foreground font-medium uppercase" style={{ fontSize: 10.5, letterSpacing: ".08em" }}>{c.label}</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>{c.tag}</span>
          </div>
          <div className="text-foreground leading-none" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 26, fontWeight: 500, letterSpacing: "-.02em" }}>
            <span className="text-muted-foreground font-normal mr-0.5" style={{ fontSize: 16 }}>₹</span>
            {Math.round(c.value).toLocaleString("en-IN")}
          </div>
          <div className="mt-2 h-1 rounded-full" style={{ background: c.color, opacity: 0.35 }} />
        </div>
      ))}
    </>
  );
}

// ── IOP Calendar ──────────────────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function IopCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: calDays, isLoading } = useIopCalendar(year, month);

  const calMap = Object.fromEntries((calDays ?? []).map((d) => [d.date, d.customers]));

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun

  const goNext = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); setSelectedDate(null); };
  const goPrev = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); setSelectedDate(null); };

  const todayStr = today.toISOString().split("T")[0];
  const selCustomers: CustomerBrief[] = selectedDate ? (calMap[selectedDate] ?? []) : [];

  return (
    <div className="rounded-xl border border-border bg-card p-[18px_20px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-foreground/70 font-medium" style={{ fontSize: 13, margin: 0 }}>IOP Payment Calendar</h3>
          <div className="text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11 }}>click a date to see customers due</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="flex items-center justify-center rounded-md w-7 h-7 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-medium text-foreground" style={{ fontSize: 13, minWidth: 120, textAlign: "center" }}>{MONTH_NAMES[month - 1]} {year}</span>
          <button onClick={goNext} className="flex items-center justify-center rounded-md w-7 h-7 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-muted-foreground font-medium uppercase" style={{ fontSize: 10.5, padding: "4px 0" }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {isLoading ? (
        <div className="grid grid-cols-7 gap-1">
          {[...Array(35)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells before month start */}
          {[...Array(firstDow)].map((_, i) => <div key={`e${i}`} />)}
          {/* Day cells */}
          {[...Array(daysInMonth)].map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const hasCust = (calMap[dateStr]?.length ?? 0) > 0;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            return (
              <button key={day} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`relative flex flex-col items-center justify-center rounded-lg transition-colors ${
                  isSelected ? "bg-foreground text-background" :
                  isToday ? "bg-primary/15 text-primary" :
                  hasCust ? "hover:bg-green-500/10" : "hover:bg-muted"
                }`}
                style={{ height: 40, fontSize: 12.5, fontFamily: "var(--font-mono, ui-monospace)" }}>
                {day}
                {hasCust && !isSelected && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-500" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected date panel */}
      {selectedDate && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">{fmtDate(selectedDate)}</span>
            <span className="text-xs text-muted-foreground">{selCustomers.length} customer{selCustomers.length !== 1 ? "s" : ""} due</span>
          </div>
          {selCustomers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No IOP payments due on this date.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {selCustomers.map((c) => (
                <div key={c.customer_id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <div>
                    <span className="text-sm font-medium text-foreground">{c.customer_name}</span>
                    {c.tamil_name && <span className="ml-2 text-xs text-muted-foreground">{c.tamil_name}</span>}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">#{c.customer_id}</span>
                    <span className="ml-2 text-xs font-medium text-foreground">{fmt(c.loan_amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reminder Report ───────────────────────────────────────────────────────────

function CustomerChip({ c }: { c: CustomerBrief }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{c.customer_name}</p>
        {c.tamil_name && <p className="text-xs text-muted-foreground truncate">{c.tamil_name}</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-muted-foreground">#{c.customer_id}</p>
        <p className="text-xs font-semibold text-foreground">{fmt(c.loan_amount)}</p>
      </div>
    </div>
  );
}

function ReminderReport() {
  const { data: reminders, isLoading: rLoading } = useIopReminders();
  const { data: inactive, isLoading: iLoading } = useEdiInactive();

  const sections = [
    { key: "yesterday" as const, label: "Yesterday", color: "text-muted-foreground" },
    { key: "today" as const, label: "Today", color: "text-green-500" },
    { key: "tomorrow" as const, label: "Tomorrow", color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      {/* IOP Due section */}
      <div>
        <h2 className="text-foreground font-medium mb-1" style={{ fontSize: 15 }}>IOP Interest Due</h2>
        <p className="text-muted-foreground mb-4" style={{ fontSize: 12 }}>Customers whose interest payment falls on yesterday, today, or tomorrow</p>
        {rLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sections.map(({ key, label, color }) => {
              const list = reminders?.[key] ?? [];
              return (
                <div key={key} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`font-semibold ${color}`} style={{ fontSize: 13 }}>{label}</span>
                    <span className="text-xs text-muted-foreground">{list.length} due</span>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No payments due</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {list.map((c) => <CustomerChip key={c.customer_id} c={c} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Calendar */}
      <div>
        <h2 className="text-foreground font-medium mb-1" style={{ fontSize: 15 }}>IOP Payment Calendar</h2>
        <p className="text-muted-foreground mb-4" style={{ fontSize: 12 }}>Full monthly view of all scheduled IOP interest collection dates</p>
        <IopCalendar />
      </div>

      {/* EDI Inactive (7 days) */}
      <div>
        <h2 className="text-foreground font-medium mb-1" style={{ fontSize: 15 }}>EDI — No Payment in 7+ Days</h2>
        <p className="text-muted-foreground mb-4" style={{ fontSize: 12 }}>Active EDI customers who haven't paid anything in the last week</p>
        {iLoading ? (
          <div className="h-40 bg-muted rounded-xl animate-pulse" />
        ) : !inactive || inactive.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground" style={{ fontSize: 13 }}>All EDI customers are up to date</div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-card border-b border-border">
                <tr>
                  {["#", "Customer", "Loan Amount", "Outstanding", "Last Payment", "Days"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inactive.map((c: EdiInactiveCustomer) => (
                  <tr key={c.customer_id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{c.customer_id}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{c.customer_name}</p>
                      {c.tamil_name && <p className="text-xs text-muted-foreground">{c.tamil_name}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-foreground tabular-nums">{fmt(c.loan_amount)}</td>
                    <td className="px-4 py-2.5 text-foreground tabular-nums">{fmt(c.outstanding_balance)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(c.last_payment_date)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold text-amber-500">{c.days_since_payment}d</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Defaulters Report ─────────────────────────────────────────────────────────

function DefaultersReport() {
  const { data: defaulters, isLoading: dLoading } = useEdiDefaulters();
  const { data: dues, isLoading: duLoading } = useIopMonthlyDues();

  return (
    <div className="space-y-6">
      {/* EDI Defaulters (95+ days) */}
      <div>
        <h2 className="text-foreground font-medium mb-1" style={{ fontSize: 15 }}>EDI Defaulters — 95+ Days Overdue</h2>
        <p className="text-muted-foreground mb-4" style={{ fontSize: 12 }}>Active EDI customers with outstanding balance and no payment for over 95 days</p>
        {dLoading ? (
          <div className="h-40 bg-muted rounded-xl animate-pulse" />
        ) : !defaulters || defaulters.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground" style={{ fontSize: 13 }}>No EDI defaulters found</div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-card border-b border-border">
                <tr>
                  {["#", "Customer", "Loan Amount", "Outstanding", "Last Payment", "Days Overdue"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {defaulters.map((c: EdiDefaulter) => (
                  <tr key={c.customer_id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{c.customer_id}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{c.customer_name}</p>
                      {c.tamil_name && <p className="text-xs text-muted-foreground">{c.tamil_name}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-foreground tabular-nums">{fmt(c.loan_amount)}</td>
                    <td className="px-4 py-2.5 text-foreground tabular-nums">{fmt(c.outstanding_balance)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(c.last_payment_date)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-bold ${c.days_overdue > 180 ? "text-red-500" : "text-amber-500"}`}>{c.days_overdue}d</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* IOP Monthly Dues */}
      <div>
        <h2 className="text-foreground font-medium mb-1" style={{ fontSize: 15 }}>IOP Monthly Dues — This Month</h2>
        <p className="text-muted-foreground mb-4" style={{ fontSize: 12 }}>Customers who have pending interest payments based on scheduled dates so far this month</p>
        {duLoading ? (
          <div className="h-40 bg-muted rounded-xl animate-pulse" />
        ) : !dues || dues.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground" style={{ fontSize: 13 }}>All IOP customers are paid up</div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-card border-b border-border">
                <tr>
                  {["#", "Customer", "Freq/mo", "Expected So Far", "Paid", "Pending"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dues.map((c: IopMonthlyDue) => (
                  <tr key={c.customer_id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{c.customer_id}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{c.customer_name}</p>
                      {c.tamil_name && <p className="text-xs text-muted-foreground">{c.tamil_name}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{c.frequency}×</td>
                    <td className="px-4 py-2.5 text-foreground tabular-nums">{fmt(c.monthly_interest * (c.payments_due_so_far / Math.max(1, c.frequency)))}</td>
                    <td className="px-4 py-2.5 text-green-500 tabular-nums">{fmt(c.paid_this_month)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-bold ${c.due_this_month > 0 ? "text-red-500" : "text-green-500"}`}>
                        {c.due_this_month > 0 ? fmt(c.due_this_month) : "✓ Paid"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

type DashTab = "main" | "reminders" | "defaulters";
const TAB_LABELS: Record<DashTab, string> = {
  main: "Main Dashboard",
  reminders: "Reminder Report",
  defaulters: "Defaulters Report",
};

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<DashTab>("main");
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: loanSummary, isLoading: loanLoading } = useLoanSummary();
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [period, setPeriod] = useState("6M");

  const monthlyTrends = summary?.monthly_trends ?? [];
  const months = monthlyTrends.map((t) => t.month);
  const latestMonth = months[months.length - 1] ?? "";
  const activeMonth = selectedMonth || latestMonth;
  const activeIdx = months.indexOf(activeMonth);
  const canPrev = activeIdx > 0, canNext = activeIdx < months.length - 1;
  const trend = monthlyTrends[activeIdx];
  const prev = activeIdx > 0 ? monthlyTrends[activeIdx - 1] : null;

  const periodOptions = ["1M", "3M", "6M", "12M", "YTD"];

  const kpis = trend ? [
    { lbl: "IOP profit", value: trend.iop_profit, pts: monthlyTrends.map((m) => m.iop_profit), color: "hsl(var(--primary))",
      delta: prev ? momDelta(trend.iop_profit, prev.iop_profit) : "—", deltaLbl: "vs prev month", up: !prev || trend.iop_profit >= prev.iop_profit },
    { lbl: "EDI profit", value: trend.edi_profit, pts: monthlyTrends.map((m) => m.edi_profit), color: "hsl(var(--accent))",
      delta: prev ? momDelta(trend.edi_profit, prev.edi_profit) : "—", deltaLbl: "vs prev month", up: !prev || trend.edi_profit >= prev.edi_profit },
    { lbl: "Expenses", value: trend.expense, pts: monthlyTrends.map((m) => m.expense), color: "hsl(var(--warn))",
      delta: prev ? momDelta(trend.expense, prev.expense) : "—", deltaLbl: "vs prev month", up: !prev || trend.expense <= prev.expense },
    { lbl: "Net profit", value: trend.net_profit, pts: monthlyTrends.map((m) => m.net_profit), color: "hsl(var(--pos))",
      delta: prev ? momDelta(trend.net_profit, prev.net_profit) : "—", deltaLbl: "vs prev month", up: !prev || trend.net_profit >= prev.net_profit },
    { lbl: "Unclaimed", value: trend.unclaimed, pts: monthlyTrends.map((m) => m.unclaimed), color: "#10b981",
      delta: prev ? momDelta(trend.unclaimed, prev.unclaimed) : "—", deltaLbl: "vs prev month", up: !prev || trend.unclaimed >= prev.unclaimed },
    { lbl: "Defaulted", value: trend.defaulted, pts: monthlyTrends.map((m) => m.defaulted), color: "#f59e0b",
      delta: prev ? momDelta(trend.defaulted, prev.defaulted) : "—", deltaLbl: "vs prev month", up: !prev || trend.defaulted <= prev.defaulted },
  ] : [];

  return (
    <div className="space-y-4">
      {/* Page header + sub-nav */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-foreground font-medium tracking-tight leading-tight" style={{ fontSize: 20 }}>Financial overview</h1>
          <div className="text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-mono, ui-monospace)", fontSize: 11.5 }}>
            {activeTab === "main" ? `${activeMonth} · ${months.length}-month outlook` :
             activeTab === "reminders" ? "IOP interest schedule & EDI activity" :
             "EDI defaulters & IOP monthly dues"}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sub-nav tabs */}
          <div className="inline-flex items-center bg-muted rounded-lg" style={{ padding: 3, gap: 2 }}>
            {(["main", "reminders", "defaulters"] as DashTab[]).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`rounded-md font-medium transition-colors ${activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                style={{ padding: "4px 12px", fontSize: 12 }}>
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          {/* Month navigator — main tab only */}
          {activeTab === "main" && months.length > 0 && (
            <div className="inline-flex items-center gap-1 bg-card border border-border rounded-lg" style={{ padding: 3 }}>
              <button onClick={() => canPrev && setSelectedMonth(months[activeIdx - 1])} disabled={!canPrev}
                className="flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                style={{ width: 26, height: 26 }}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <select value={activeMonth} onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-foreground focus:outline-none cursor-pointer text-center font-medium appearance-none"
                style={{ fontSize: 13, padding: "0 4px", minWidth: 100, border: 0, outline: 0 }}>
                {months.map((m) => <option key={m} value={m} className="bg-card">{m}</option>)}
              </select>
              <button onClick={() => canNext && setSelectedMonth(months[activeIdx + 1])} disabled={!canNext}
                className="flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                style={{ width: 26, height: 26 }}>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Period segment — main tab only */}
          {activeTab === "main" && (
            <div className="inline-flex items-center bg-muted rounded-lg" style={{ padding: 3, gap: 2 }}>
              {periodOptions.map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`rounded-md font-medium transition-colors ${period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  style={{ padding: "4px 12px", fontSize: 12 }}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main Dashboard tab ── */}
      {activeTab === "main" && (
        <>
          {summaryLoading || !trend ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 xl:col-span-8 h-56 bg-muted rounded-xl animate-pulse" />
              <div className="col-span-12 xl:col-span-4 h-56 bg-muted rounded-xl animate-pulse" />
              {[...Array(6)].map((_, i) => <div key={i} className="col-span-6 xl:col-span-2 h-32 bg-muted rounded-xl animate-pulse" />)}
              <div className="col-span-12 h-72 bg-muted rounded-xl animate-pulse" />
              {[...Array(4)].map((_, i) => <div key={i} className="col-span-6 xl:col-span-3 h-28 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-12" style={{ gap: 16 }}>
              <HeroCard trend={trend} prev={prev} />
              <CompositionCard trend={trend} />
              {kpis.map((kpi, i) => (
                <div key={i} className="col-span-6 xl:col-span-2"><KpiTile {...kpi} /></div>
              ))}
              <TrendCard data={monthlyTrends} />
              {/* Loan Summary */}
              {loanLoading || !loanSummary ? (
                [...Array(4)].map((_, i) => <div key={i} className="col-span-12 xl:col-span-3 h-28 bg-muted rounded-xl animate-pulse" />)
              ) : (
                <LoanSummaryCards data={loanSummary} />
              )}
            </div>
          )}
        </>
      )}

      {/* ── Reminder Report tab ── */}
      {activeTab === "reminders" && <ReminderReport />}

      {/* ── Defaulters Report tab ── */}
      {activeTab === "defaulters" && <DefaultersReport />}
    </div>
  );
}
