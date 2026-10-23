// "By category" view of the Expenses page: totals per category with its sub-categories indented, totals per person, and the grand total
// at the end. Follows the page's filters (dates, category, person, search is not used for totals).
import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { expensesApi, personalApi } from "@/services/api";
import { formatCurrency } from "@/utils";
import { cn } from "@/utils";
import type { ExpenseFilters } from "@/types";

const num = (v: number | string) => Number(v) || 0;

export function ExpenseSummaryView({ filters, scope = "office" }: { filters: ExpenseFilters; scope?: "office" | "personal" }) {
  const { date_from, date_to, category_id, person_id } = filters;
  const { data, isLoading, isError } = useQuery({
    queryKey: [scope === "personal" ? "personal-expense-summary" : "expense-summary", { date_from, date_to, category_id, person_id }],
    queryFn: async () => (await (scope === "personal" ? personalApi : expensesApi).summary({ date_from, date_to, category_id, person_id })).data,
  });

  if (isLoading) return <div className="glass-card p-6 text-sm text-muted-foreground">Loading totals…</div>;
  if (isError || !data) return <div className="glass-card p-6 text-sm text-red-400">Could not load the totals</div>;
  if (data.count === 0) return <div data-testid="summary-empty" className="glass-card p-10 text-center text-sm text-muted-foreground">No expenses for these filters</div>;

  const total = num(data.total);
  const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(n / total < 0.1 ? 1 : 0)}%` : "");

  return (
    <div className="space-y-4" data-testid="expense-summary">
      <div className="glass-card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Category</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Entries</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Share</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((c) => (
              <Fragment key={`c-${c.id ?? "none"}`}>
                <tr data-testid="summary-category" className="border-b border-border/50 bg-secondary/30">
                  <td className={cn("px-4 py-2.5 font-semibold", c.ungrouped && "italic text-muted-foreground")}>
                    {c.ungrouped ? "Ungrouped (old expenses)" : c.name}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{c.count}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{pct(num(c.total))}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-red-400">{formatCurrency(num(c.total))}</td>
                </tr>
                {c.subs.map((s) => (
                  <tr key={`s-${s.id}`} data-testid="summary-sub" className="border-b border-border/30">
                    <td className="py-2 pl-9 pr-4 text-muted-foreground">{s.name}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{s.count}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{pct(num(s.total))}</td>
                    <td className="px-4 py-2 text-right text-red-400/90">{formatCurrency(num(s.total))}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr data-testid="summary-total" className="border-t-2 border-border bg-secondary/50">
              <td className="px-4 py-3 font-bold">Total expense</td>
              <td className="px-4 py-3 text-right font-semibold">{data.count}</td>
              <td />
              <td className="px-4 py-3 text-right font-bold text-red-400">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="glass-card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">For whom</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Entries</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Share</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.people.map((p) => (
              <tr key={`p-${p.id ?? "none"}`} data-testid="summary-person" className="border-b border-border/50">
                <td className={cn("px-4 py-2.5", p.id == null && "italic text-muted-foreground")}>{p.name}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{p.count}</td>
                <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{pct(num(p.total))}</td>
                <td className="px-4 py-2.5 text-right text-red-400">{formatCurrency(num(p.total))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-secondary/50">
              <td className="px-4 py-3 font-bold">Total expense</td>
              <td className="px-4 py-3 text-right font-semibold">{data.count}</td>
              <td />
              <td className="px-4 py-3 text-right font-bold text-red-400">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
