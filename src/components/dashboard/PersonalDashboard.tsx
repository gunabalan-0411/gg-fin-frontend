// The Personal view of the main dashboard: how much the logged-in person spent - this month against last month, this month by category,
// and the last 12 months. Their own expenses only (Personal Finance), never the office books.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { personalApi } from "@/services/api";
import { cn } from "@/utils";
import type { PersonalDashboard as PersonalDashboardData } from "@/types";

const num = (v: number | string) => Number(v) || 0;
const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dmy = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d} ${MONTHS[Number(m) - 1] ?? ""} ${y}`; };
const monthLabel = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
const longMonth = (key: string) => `${monthLabel(key)} ${key.slice(0, 4)}`;

export function usePersonalDashboard() {
  return useQuery({
    queryKey: ["personal-dashboard"],
    queryFn: async () => (await personalApi.dashboard()).data,
  });
}

/** Spending going DOWN is good news here, so the change is green when it fell and amber when it rose. */
function Change({ now, before }: { now: number; before: number }) {
  if (before <= 0) return <span data-testid="personal-change" className="text-xs text-muted-foreground">no spending last month</span>;
  const pct = ((now - before) / before) * 100;
  const up = pct > 0;
  return (
    <span data-testid="personal-change" className={cn("text-xs font-semibold", up ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% {up ? "more" : "less"} than last month
    </span>
  );
}

export function PersonalDashboard() {
  const { data, isLoading, isError } = usePersonalDashboard();

  if (isLoading) return <div data-testid="personal-loading" className="glass-card p-8 text-sm text-muted-foreground">Loading your spending…</div>;
  if (isError || !data) return <div className="glass-card p-8 text-sm text-red-400">Could not load your personal spending</div>;

  const thisTotal = num(data.this_month.total);
  const lastTotal = num(data.last_month.total);
  const max = Math.max(...data.monthly.map((m) => num(m.total)), 1);
  const yearTotal = data.monthly.reduce((s, m) => s + num(m.total), 0);

  return (
    <div data-testid="personal-dashboard" className="space-y-4">
      <Holdings data={data.holdings} />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="glass-card p-4">
          <p className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">Spent in {longMonth(data.month)}</p>
          <p data-testid="personal-this-month" className="mt-1 text-3xl font-bold tracking-tight">{fmt(thisTotal)}</p>
          <div className="mt-1"><Change now={thisTotal} before={lastTotal} /></div>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">Last month</p>
          <p data-testid="personal-last-month" className="mt-1 text-3xl font-bold tracking-tight text-foreground/80">{fmt(lastTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.last_month.count} {data.last_month.count === 1 ? "expense" : "expenses"}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">Last 12 months</p>
          <p data-testid="personal-year" className="mt-1 text-3xl font-bold tracking-tight text-foreground/80">{fmt(yearTotal)}</p>
          <p data-testid="personal-average" className="mt-1 text-xs text-muted-foreground">About {fmt(yearTotal / data.monthly.length)} a month</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">This month by category</h2>
            <Link to="/personal" className="text-xs font-medium text-muted-foreground underline hover:text-foreground">Open Personal Finance →</Link>
          </div>
          {data.categories.length === 0 ? (
            <p data-testid="personal-empty" className="py-8 text-center text-sm text-muted-foreground">
              No personal expenses this month yet. <Link to="/personal" className="font-medium underline">Add one</Link>
            </p>
          ) : (
            <ul className="space-y-3">
              {data.categories.map((c) => {
                const total = num(c.total);
                return (
                  <li key={`${c.id ?? "none"}`} data-testid="personal-category">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{c.name}</span>
                      <span className="font-mono text-[12.5px] font-semibold">{fmt(total)} <span className="text-xs font-normal text-muted-foreground">· {thisTotal > 0 ? Math.round((total / thisTotal) * 100) : 0}%</span></span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${thisTotal > 0 ? Math.max((total / thisTotal) * 100, 2) : 0}%` }} />
                    </div>
                    {c.subs.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-3">
                        {c.subs.map((s) => (
                          <li key={s.id} data-testid="personal-sub" className="flex justify-between text-xs text-muted-foreground">
                            <span>{s.name}</span><span className="font-mono">{fmt(num(s.total))}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="glass-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Last 12 months</h2>
          <div data-testid="personal-trend" className="flex h-44 items-end gap-1.5" role="img" aria-label="Personal spending per month, last 12 months">
            {data.monthly.map((m, i) => {
              const total = num(m.total);
              const current = i === data.monthly.length - 1;
              return (
                <div key={m.month} data-testid="personal-bar" data-month={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${longMonth(m.month)}: ${fmt(total)}`}>
                  <div className={cn("w-full rounded-t", current ? "bg-primary" : "bg-primary/35")} style={{ height: `${total > 0 ? Math.max((total / max) * 100, 3) : 0}%` }} />
                  <span className={cn("text-[9.5px]", current ? "font-semibold text-foreground" : "text-muted-foreground")}>{monthLabel(m.month)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The numbers a person wants first: what is in savings, what friends still owe them, and what they still owe. All from Personal Finance. */
function Holdings({ data }: { data: PersonalDashboardData["holdings"] }) {
  const savings = data?.savings ?? { total: 0, accounts: 0 };
  const lends = data?.lends ?? { to_collect: 0, people: 0, overdue: 0, overdue_amount: 0, next_follow_up: null, next_follow_up_to: null };
  const borrows = data?.borrows ?? { to_pay: 0, people: 0, overdue: 0, overdue_amount: 0, next_pay_back: null, next_pay_back_to: null };
  return (
    <div data-testid="personal-holdings" className="grid gap-3 md:grid-cols-3">
      <Link to="/personal?section=savings" className="glass-card block p-4 transition-colors hover:bg-secondary/40">
        <p className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">Total in savings</p>
        <p data-testid="personal-savings-total" className="mt-1 text-3xl font-bold tracking-tight">{fmt(num(savings.total))}</p>
        <p data-testid="personal-savings-note" className="mt-1 text-xs text-muted-foreground">
          {savings.accounts === 0 ? "No savings added yet" : `${savings.accounts} ${savings.accounts === 1 ? "account" : "accounts"}`}
        </p>
      </Link>
      <Link to="/personal?section=lends" className="glass-card block p-4 transition-colors hover:bg-secondary/40">
        <p className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">To collect from friends</p>
        <p data-testid="personal-lends-total" className="mt-1 text-3xl font-bold tracking-tight">{fmt(num(lends.to_collect))}</p>
        <p data-testid="personal-lends-note" className="mt-1 text-xs text-muted-foreground">
          {lends.people === 0 ? "Nothing to collect" : `from ${lends.people} ${lends.people === 1 ? "person" : "people"}`}
          {lends.overdue > 0 && <span data-testid="personal-lends-overdue" className="ml-1.5 font-semibold text-red-600 dark:text-red-400">· {lends.overdue} overdue ({fmt(num(lends.overdue_amount))})</span>}
          {lends.next_follow_up && <span data-testid="personal-lends-next" className="ml-1.5">· next follow-up {dmy(lends.next_follow_up)}{lends.next_follow_up_to ? ` (${lends.next_follow_up_to})` : ""}</span>}
        </p>
      </Link>
      <Link to="/personal?section=lends" className="glass-card block p-4 transition-colors hover:bg-secondary/40">
        <p className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">You owe</p>
        <p data-testid="personal-borrows-total" className="mt-1 text-3xl font-bold tracking-tight">{fmt(num(borrows.to_pay))}</p>
        <p data-testid="personal-borrows-note" className="mt-1 text-xs text-muted-foreground">
          {borrows.people === 0 ? "You owe nobody" : `to ${borrows.people} ${borrows.people === 1 ? "person" : "people"}`}
          {borrows.overdue > 0 && <span data-testid="personal-borrows-overdue" className="ml-1.5 font-semibold text-red-600 dark:text-red-400">· {borrows.overdue} overdue ({fmt(num(borrows.overdue_amount))})</span>}
          {borrows.next_pay_back && <span data-testid="personal-borrows-next" className="ml-1.5">· next pay-back {dmy(borrows.next_pay_back)}{borrows.next_pay_back_to ? ` (${borrows.next_pay_back_to})` : ""}</span>}
        </p>
      </Link>
    </div>
  );
}

/** The switch at the top of the dashboard: the office books, or the person's own spending. Starts on Office. */
export function FinanceModeToggle({ mode, onChange }: { mode: "office" | "personal"; onChange: (m: "office" | "personal") => void }) {
  return (
    <div data-testid="finance-mode" role="group" aria-label="Dashboard view" className="inline-flex items-center rounded-xl border border-border bg-card p-1">
      {(["office", "personal"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          className={cn(
            "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors",
            mode === m ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m === "office" ? "Office" : "Personal"}
        </button>
      ))}
    </div>
  );
}
