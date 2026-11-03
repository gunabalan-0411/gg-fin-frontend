// Category budgets of one month: a monthly amount per main expense category. What is not spent in a month is added to the next
// month's available amount, and overspending is taken off it - so every row reads Budget + Carried in = Available, then Spent, then Left.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/utils";
import { usePersonalBudget, useSetBudget } from "@/hooks/usePersonalBudget";
import type { PersonalBudgetView } from "@/types";
import { keyOf, monthLabel, num, rupees, shiftMonth, signed } from "./format";

type Row = PersonalBudgetView["categories"][number];

const GRID = "grid grid-cols-2 items-center gap-x-4 gap-y-2 lg:grid-cols-[minmax(0,1.7fr)_7.5rem_5.5rem_6rem_5.5rem_6.5rem]";
const OK = "text-emerald-700 dark:text-emerald-400";
const OVER = "text-red-700 dark:text-red-400";

export function CategoryBudgets({ month }: { month: string }) {
  const { data, isLoading, isError } = usePersonalBudget(month);
  const [showOthers, setShowOthers] = useState(false);

  if (isLoading) return <div data-testid="budget-loading" className="h-64 animate-pulse rounded-xl border border-border bg-card/60" />;
  if (isError || !data) return <div className="rounded-xl border border-border bg-card p-6 text-sm text-red-700 dark:text-red-400">Could not load your budget</div>;

  const inUse = data.categories.filter((c) => c.budget !== null || num(c.spent) > 0);
  const others = data.categories.filter((c) => c.budget === null && num(c.spent) <= 0);
  const notBudgeted = Math.max(num(data.total_spent) - num(data.spent_on_budgeted), 0);

  return (
    <section data-testid="category-budgets" aria-labelledby="cb-title" className="space-y-4">
      <div className="max-w-2xl">
        <h2 id="cb-title" className="text-base font-semibold text-foreground">Category budgets</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          A monthly amount for each category. Unspent money carries into next month; overspending is taken off it.
        </p>
      </div>

      <Statement data={data} month={month} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className={cn(GRID, "hidden border-b border-border bg-secondary/50 px-5 py-2.5 text-xs font-medium text-muted-foreground lg:grid")} aria-hidden>
          <span>Category</span>
          <span className="text-right">Budget</span>
          <span className="text-right">Carried in</span>
          <span className="text-right">Available</span>
          <span className="text-right">Spent</span>
          <span className="text-right">Left</span>
        </div>

        {inUse.length === 0 ? (
          <p data-testid="budget-none-yet" className="px-5 py-10 text-center text-sm text-muted-foreground">
            No budget set yet. Open <button type="button" onClick={() => setShowOthers(true)} className="font-medium text-foreground underline underline-offset-2">the category list</button> below and type an amount against a category.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {inUse.map((c) => <CategoryRow key={c.category_id} row={c} />)}
          </ul>
        )}

        {others.length > 0 && (
          <div className="border-t border-border">
            <button type="button" aria-expanded={showOthers} onClick={() => setShowOthers((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span data-testid="budget-others-toggle">{showOthers ? "Hide" : "Show"} {others.length} {others.length === 1 ? "category" : "categories"} without a budget or spending</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", showOthers && "rotate-180")} />
            </button>
            {showOthers && (
              <ul data-testid="budget-others" className="grid gap-x-8 gap-y-1 border-t border-border/70 px-5 py-3 sm:grid-cols-2 lg:grid-cols-3">
                {others.map((c) => <OtherRow key={c.category_id} row={c} />)}
              </ul>
            )}
          </div>
        )}
      </div>

      {(notBudgeted > 0 || data.ungrouped) && (
        <p data-testid="budget-unbudgeted" className="text-xs text-muted-foreground">
          {rupees(notBudgeted)} was spent on categories without a budget{data.ungrouped ? `, including ${rupees(num(data.ungrouped.spent))} in no category at all` : ""}. It is not counted against the budget above.
        </p>
      )}
    </section>
  );
}

/** The month as a sum: Budget + Carried in = Available, less Spent, leaves Left - which is what carries into next month. */
function Statement({ data, month }: { data: PersonalBudgetView; month: string }) {
  const budget = num(data.total_budget);
  const carried = num(data.total_carried_in);
  const available = num(data.total_available);
  const spent = num(data.spent_on_budgeted);
  const left = num(data.left);
  const pct = available > 0 ? Math.min((spent / available) * 100, 100) : spent > 0 ? 100 : 0;
  const over = data.budgeted_count > 0 && spent > available;
  const isCurrent = month >= keyOf(new Date());
  const next = monthLabel(shiftMonth(month, 1));

  if (data.budgeted_count === 0) return null;
  return (
    <div data-testid="budget-statement" className="rounded-xl border border-border bg-card px-5 py-4">
      <dl className="flex flex-wrap items-end gap-x-3 gap-y-3 [&>div]:flex [&>div]:flex-col">
        <Figure label="Budget" testId="st-budget" value={rupees(budget)} />
        <Op>+</Op>
        <Figure label="Carried in" testId="st-carried" value={rupees(carried)} muted={carried === 0} />
        <Op>=</Op>
        <Figure label="Available" testId="st-available" value={rupees(available)} strong />
        <span className="mx-2 hidden h-8 w-px bg-border sm:block" aria-hidden />
        <Figure label="Spent" testId="st-spent" value={rupees(spent)} />
        <Op>→</Op>
        <Figure label={left < 0 ? "Over by" : "Left"} testId="st-left" value={rupees(Math.abs(left))} tone={left < 0 ? OVER : OK} strong />
      </dl>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(pct)}% of what is available has been spent`}>
        <div data-testid="st-bar" className={cn("h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none", over ? "bg-[hsl(var(--neg))]" : pct >= 80 ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <p data-testid="st-note" className="mt-2 text-xs text-muted-foreground">
        {left < 0 ? `${rupees(Math.abs(left))} over what was available` : `${rupees(left)} left`}
        {isCurrent ? ` so far. It carries into ${next} when the month ends.` : `. It carried into ${next}.`}
        {data.over_count > 0 && <span data-testid="budget-over-count" className={cn("ml-1.5 font-semibold", OVER)}>{data.over_count} {data.over_count === 1 ? "category is" : "categories are"} over.</span>}
      </p>
    </div>
  );
}

const Op = ({ children }: { children: string }) => <span aria-hidden className="pb-0.5 text-lg text-muted-foreground/70">{children}</span>;

function Figure({ label, value, testId, strong, muted, tone }: { label: string; value: string; testId: string; strong?: boolean; muted?: boolean; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd data-testid={testId} className={cn("font-mono text-lg tabular-nums", strong ? "font-semibold" : "font-medium", muted && "text-muted-foreground", tone)}>{value}</dd>
    </div>
  );
}

/** One category that has a budget or spending: name and a bar, the budget box, then the month's arithmetic. */
function CategoryRow({ row: c }: { row: Row }) {
  const budget = c.budget === null ? null : num(c.budget);
  const available = c.available === null ? null : num(c.available);
  const spent = num(c.spent);
  const left = c.left === null ? null : num(c.left);
  const carried = c.carried_in === null ? null : num(c.carried_in);
  const gone = left !== null && left < 0;                                          // spent more than was available (or nothing was)
  const pct = available === null ? 0 : gone ? 100 : available > 0 ? Math.min((spent / available) * 100, 100) : 0;
  const lbl = "text-[11px] text-muted-foreground lg:sr-only";

  return (
    <li data-testid="budget-row" data-over={c.over} className="px-5 py-3.5">
      <div className={GRID}>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium text-foreground">{c.name}</span>
            <span className="lg:hidden">{left !== null && <LeftText left={left} over={c.over} />}</span>
          </div>
          {available !== null && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.name}: ${Math.round(pct)}% of what is available spent`}>
              <div data-testid="budget-bar" className={cn("h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none", gone ? "bg-[hsl(var(--neg))]" : pct >= 80 ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
            </div>
          )}
          {c.subs.length > 0 && (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{c.subs.map((s) => `${s.name} ${rupees(num(s.total))}`).join(" · ")}</p>
          )}
        </div>

        <div className="lg:text-right">
          <span className={lbl}>Budget</span>
          <BudgetBox row={c} budget={budget} />
        </div>
        <Cell label="Carried in" testId="budget-carried" lbl={lbl} muted={carried === null || carried === 0}>
          {carried === null ? "—" : carried === 0 ? "—" : signed(carried)}
        </Cell>
        <Cell label="Available" testId="budget-available" lbl={lbl} muted={available === null}>{available === null ? "—" : rupees(available)}</Cell>
        <Cell label="Spent" testId="budget-spent" lbl={lbl}>{rupees(spent)}</Cell>
        <div className="hidden text-right lg:block">{left === null ? <span className="text-muted-foreground">—</span> : <LeftText left={left} over={c.over} desktop />}</div>
      </div>
    </li>
  );
}

function Cell({ label, lbl, children, testId, muted }: { label: string; lbl: string; children: React.ReactNode; testId: string; muted?: boolean }) {
  return (
    <div className="lg:text-right">
      <span className={lbl}>{label}</span>
      <div data-testid={testId} className={cn("font-mono text-[13px] tabular-nums", muted ? "text-muted-foreground" : "text-foreground")}>{children}</div>
    </div>
  );
}

function LeftText({ left, over, desktop }: { left: number; over: boolean; desktop?: boolean }) {
  return (
    <span data-testid={desktop ? "budget-left" : "budget-left-sm"} className={cn("font-mono text-sm font-semibold tabular-nums", over ? OVER : OK)}>
      {over ? `Over ${rupees(Math.abs(left))}` : `${rupees(left)} left`}
    </span>
  );
}

/** The budget box: type an amount, press Enter or leave the box to save; empty (or 0) removes the budget. */
function BudgetBox({ row, budget }: { row: Row; budget: number | null }) {
  const save = useSetBudget();
  const [text, setText] = useState<string | null>(null);          // null = not being edited: the box shows the formatted amount

  const commit = () => {
    if (text === null) return;
    const clear = () => setText(null);
    const amount = text.trim() === "" ? null : Number(text);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) { toast.error("A budget must be a number, 0 or more"); clear(); return; }
    if ((amount ?? 0) === (budget ?? 0)) { clear(); return; }
    save.mutate({ categoryId: row.category_id, amount }, { onSettled: clear });
  };

  return (
    <input
      type="text" inputMode="decimal" autoComplete="off" placeholder="Set budget" aria-label={`Monthly budget for ${row.name}`}
      value={text ?? (budget !== null ? rupees(budget) : "")}
      onFocus={(e) => { setText(budget !== null ? String(budget) : ""); if (budget !== null) { const box = e.target; requestAnimationFrame(() => box.select()); } }}
      onChange={(e) => setText(e.target.value.replace(/[^0-9.\-]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={cn("h-8 w-full max-lg:-ml-2 rounded-md border border-transparent bg-transparent px-2 font-mono text-[13px] tabular-nums text-foreground transition-colors placeholder:text-muted-foreground/70 hover:border-border focus-visible:border-muted-foreground/40 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 lg:text-right",
        budget === null ? "border-border bg-card" : "")}
    />
  );
}

/** A category with no budget and nothing spent: just its name and a box to start one. */
function OtherRow({ row }: { row: Row }) {
  return (
    <li data-testid="budget-other-row" className="flex items-center justify-between gap-3 py-1">
      <span className="truncate text-sm text-muted-foreground">{row.name}</span>
      <div className="w-32 shrink-0"><BudgetBox row={row} budget={null} /></div>
    </li>
  );
}
