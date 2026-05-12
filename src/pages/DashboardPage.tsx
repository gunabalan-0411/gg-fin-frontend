import { AreaChart, BarChart } from "@tremor/react";
import { useState } from "react";
import { useDashboardSummary, useDailyActivity } from "@/hooks/useDashboard";
import { formatCurrency } from "@/utils";
import { TrendingUp, TrendingDown, DollarSign, ChevronLeft, ChevronRight } from "lucide-react";

function KPICard({
  title,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  trend,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  trend?: { prev: number };
}) {
  const pct =
    trend && trend.prev !== 0
      ? (((value - trend.prev) / Math.abs(trend.prev)) * 100).toFixed(1)
      : null;
  const up = pct !== null && Number(pct) >= 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex items-start gap-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{title}</p>
        <p className="mt-1 text-2xl font-bold text-foreground leading-tight">{formatCurrency(value)}</p>
        {pct !== null && (
          <p className={`text-xs mt-1 font-medium ${up ? "text-[#02B15A]" : "text-[#EB001B]"}`}>
            {up ? "▲" : "▼"} {Math.abs(Number(pct))}% vs prev
          </p>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return <div className="glass-card animate-pulse h-28" />;
}

const CHART_VALUE_FORMATTER = (v: number) => formatCurrency(v);

export default function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: daily, isLoading: dailyLoading } = useDailyActivity(30);
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  if (summaryLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
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
  const goToPrev = () => { if (canPrev) setSelectedMonth(months[activeIdx - 1]); };
  const goToNext = () => { if (canNext) setSelectedMonth(months[activeIdx + 1]); };

  const selectedTrend = monthlyTrends.find((t) => t.month === activeMonth);
  const prevTrend = activeIdx > 0 ? monthlyTrends[activeIdx - 1] : undefined;

  const kpiValues = selectedTrend
    ? {
        iop_profit: selectedTrend.iop_profit,
        edi_profit: selectedTrend.edi_profit,
        expense: selectedTrend.expense,
        net_profit: selectedTrend.net_profit,
      }
    : {
        iop_profit: summary?.current_month_iop_profit ?? 0,
        edi_profit: summary?.current_month_edi_profit ?? 0,
        expense: summary?.current_month_expense ?? 0,
        net_profit: summary?.current_month_net_profit ?? 0,
      };

  const trends = monthlyTrends.map((t) => ({
    month: t.month,
    "IOP Profit": t.iop_profit,
    "EDI Profit": t.edi_profit,
    "Expense": t.expense,
    "Net Profit": t.net_profit,
  }));

  const dailyData = (daily ?? []).map((d) => ({
    date: d.date,
    "EDI": d.edi_amount,
    "IOP": d.iop_amount,
  }));

  return (
    <div className="space-y-6">
      {/* Header with month navigator */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Financial overview</p>
        </div>

        {months.length > 0 && (
          <div className="flex items-center gap-1 glass-card px-2 py-1">
            <button
              onClick={goToPrev}
              disabled={!canPrev}
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select
              value={activeMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-sm font-medium text-foreground focus:outline-none px-1 cursor-pointer min-w-[100px] text-center"
            >
              {months.map((m) => (
                <option key={m} value={m} className="bg-card">
                  {m}
                </option>
              ))}
            </select>
            <button
              onClick={goToNext}
              disabled={!canNext}
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="IOP Profit"
          value={kpiValues.iop_profit}
          icon={TrendingUp}
          iconBg="bg-[#6359E9]/20"
          iconColor="text-[#6359E9]"
          trend={prevTrend ? { prev: prevTrend.iop_profit } : undefined}
        />
        <KPICard
          title="EDI Profit"
          value={kpiValues.edi_profit}
          icon={TrendingUp}
          iconBg="bg-[#64CFF6]/20"
          iconColor="text-[#64CFF6]"
          trend={prevTrend ? { prev: prevTrend.edi_profit } : undefined}
        />
        <KPICard
          title="Expenses"
          value={kpiValues.expense}
          icon={TrendingDown}
          iconBg="bg-[#EB001B]/15"
          iconColor="text-[#EB001B]"
          trend={prevTrend ? { prev: prevTrend.expense } : undefined}
        />
        <KPICard
          title="Net Profit"
          value={kpiValues.net_profit}
          icon={DollarSign}
          iconBg="bg-[#02B15A]/15"
          iconColor="text-[#02B15A]"
          trend={prevTrend ? { prev: prevTrend.net_profit } : undefined}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Monthly Profit Trend */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Monthly Profit Trend</p>
          <AreaChart
            className="h-56"
            data={trends}
            index="month"
            categories={["IOP Profit", "EDI Profit", "Net Profit"]}
            colors={["violet", "cyan", "emerald"]}
            valueFormatter={CHART_VALUE_FORMATTER}
            showLegend
            showGridLines
            curveType="monotone"
            showAnimation
          />
        </div>

        {/* Monthly Expense Trend — BarChart so tiny values are always visible */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Monthly Expense Trend</p>
          <BarChart
            className="h-56"
            data={trends}
            index="month"
            categories={["Expense"]}
            colors={["red"]}
            valueFormatter={CHART_VALUE_FORMATTER}
            showLegend={false}
            showGridLines
            showAnimation
          />
        </div>

        {/* IOP vs EDI Comparison */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">IOP vs EDI Profit Comparison</p>
          <BarChart
            className="h-56"
            data={trends}
            index="month"
            categories={["IOP Profit", "EDI Profit"]}
            colors={["violet", "cyan"]}
            valueFormatter={CHART_VALUE_FORMATTER}
            showLegend
            showGridLines
            showAnimation
          />
        </div>

        {/* Daily Activity */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Daily Transaction Activity (30d)</p>
          <BarChart
            className="h-56"
            data={dailyLoading ? [] : dailyData}
            index="date"
            categories={["EDI", "IOP"]}
            colors={["cyan", "violet"]}
            valueFormatter={CHART_VALUE_FORMATTER}
            showLegend
            showGridLines
            showAnimation
          />
        </div>
      </div>
    </div>
  );
}
