// Personal Finance > Monthly budget: one amount per main expense category, the same every month, set against what the person spent
// in the month shown. Sub-categories count towards their main category. Their own spending only.
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { personalApi } from "@/services/api";
import { cn } from "@/utils";

const num = (v: number | string | null | undefined) => Number(v) || 0;
const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const shift = (key: string, by: number) => keyOf(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + by, 1));
const label = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1] ?? key} ${key.slice(0, 4)}`;

export function usePersonalBudget(month: string) {
  return useQuery({
    queryKey: ["personal-budget", month],
    queryFn: async () => (await personalApi.budgets(month)).data,
  });
}

function useSetBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, amount }: { categoryId: number; amount: number | null }) => personalApi.setBudget(categoryId, amount),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ["personal-budget"] }),
      qc.invalidateQueries({ queryKey: ["personal-dashboard"] }),
    ]),
    onError: (e: unknown) => {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Could not save the budget");
    },
  });
}

export function BudgetSection() {
  const thisMonth = keyOf(new Date());
  const [month, setMonth] = useState(thisMonth);
  const { data, isLoading, isError } = usePersonalBudget(month);
  const save = useSetBudget();
  const [draft, setDraft] = useState<Record<number, string>>({});

  const commit = (categoryId: number, current: number | null) => {
    const text = draft[categoryId];
    if (text === undefined) return;
    const amount = text.trim() === "" ? null : Number(text);
    const clear = () => setDraft(({ [categoryId]: _gone, ...rest }) => rest);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) { toast.error("A budget must be a number, 0 or more"); clear(); return; }
    if ((amount ?? 0) === (current ?? 0)) { clear(); return; }
    save.mutate({ categoryId, amount }, { onSettled: clear });
  };

  const totalBudget = num(data?.total_budget);
  const spentOnBudgeted = num(data?.spent_on_budgeted);
  const notBudgeted = Math.max(num(data?.total_spent) - spentOnBudgeted, 0);

  return (
    <section data-testid="budget-section" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Monthly budget</h2>
          <p className="text-sm text-muted-foreground">What you plan to spend each month on a main category. The same amount applies to every month.</p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(shift(month, -1))} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span data-testid="budget-month" className="min-w-24 text-center text-sm font-semibold">{label(month)}</span>
          <button type="button" aria-label="Next month" disabled={month >= thisMonth} onClick={() => setMonth(shift(month, 1))}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading && <div data-testid="budget-loading" className="glass-card p-8 text-sm text-muted-foreground">Loading your budget…</div>}
      {isError && <div className="glass-card p-8 text-sm text-red-400">Could not load your budget</div>}

      {data && (
        <>
          <p data-testid="budget-summary" className="text-sm text-muted-foreground">
            {data.budgeted_count === 0
              ? "No budget set yet. Type an amount against a category below."
              : <>Budget <span className="font-semibold text-foreground">{fmt(totalBudget)}</span> · spent on those categories <span className="font-semibold text-foreground">{fmt(spentOnBudgeted)}</span> · {totalBudget - spentOnBudgeted >= 0 ? `${fmt(totalBudget - spentOnBudgeted)} left` : `${fmt(spentOnBudgeted - totalBudget)} over`}
                {data.over_count > 0 && <span data-testid="budget-over-count" className="ml-1.5 font-semibold text-red-600 dark:text-red-400">· {data.over_count} over budget</span>}</>}
          </p>

          <ul className="glass-card divide-y divide-border/60 overflow-hidden p-0">
            {data.categories.map((c) => {
              const budget = c.budget === null ? null : num(c.budget);
              const spent = num(c.spent);
              const pct = budget ? (spent / budget) * 100 : 0;
              return (
                <li key={c.category_id} data-testid="budget-row" data-over={c.over} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{c.name}</span>
                    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <span className="sr-only">Budget for {c.name}</span>
                      <span aria-hidden>₹</span>
                      <input
                        type="number" min={0} inputMode="decimal" placeholder="Not set" aria-label={`Budget for ${c.name}`}
                        value={draft[c.category_id] ?? (budget !== null ? String(budget) : "")}
                        onChange={(e) => setDraft((d) => ({ ...d, [c.category_id]: e.target.value }))}
                        onBlur={() => commit(c.category_id, budget)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="h-8 w-28 rounded-md border border-border bg-background px-2 text-right font-mono text-sm text-foreground placeholder:text-muted-foreground/60"
                      />
                    </label>
                  </div>
                  {budget !== null && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.name}: ${Math.round(pct)}% of the budget spent`}>
                      <div data-testid="budget-bar" className={cn("h-full rounded-full", pct > 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
                    <span data-testid="budget-spent">Spent {fmt(spent)}</span>
                    {budget !== null && (
                      <span data-testid="budget-left" className={cn("font-semibold", c.over ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                        {c.over ? `Over by ${fmt(spent - budget)}` : `${fmt(budget - spent)} left`}
                      </span>
                    )}
                  </div>
                  {c.subs.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{c.subs.map((s) => `${s.name} ${fmt(num(s.total))}`).join(" · ")}</p>
                  )}
                </li>
              );
            })}
          </ul>

          {(notBudgeted > 0 || data.ungrouped) && (
            <p data-testid="budget-unbudgeted" className="text-xs text-muted-foreground">
              {fmt(notBudgeted)} was spent on categories without a budget{data.ungrouped ? ` (including ${fmt(num(data.ungrouped.spent))} not in any category)` : ""}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
