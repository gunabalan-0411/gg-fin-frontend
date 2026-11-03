import { ChevronLeft, ChevronRight } from "lucide-react";
import { keyOf, monthLabel, shiftMonth } from "./format";

/** The month the whole page is showing. Going forward stops at the current month: nothing has happened after it. */
export function MonthSwitch({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const current = keyOf(new Date());
  const arrow = "grid h-9 w-9 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 disabled:hover:text-muted-foreground";
  return (
    <div className="flex items-center gap-3">
      {month !== current && (
        <button type="button" onClick={() => onChange(current)}
          className="rounded text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Back to this month
        </button>
      )}
      <div role="group" aria-label="Month" className="inline-flex items-center rounded-lg border border-border bg-card">
        <button type="button" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))} className={`${arrow} rounded-l-lg`}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span data-testid="budget-month" aria-live="polite" className="min-w-28 px-1 text-center text-sm font-semibold tabular-nums">{monthLabel(month)}</span>
        <button type="button" aria-label="Next month" disabled={month >= current} onClick={() => onChange(shiftMonth(month, 1))} className={`${arrow} rounded-r-lg`}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
