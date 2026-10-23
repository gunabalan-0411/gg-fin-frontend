// IOP rows only: expand a row to say how much of the amount collected was PRINCIPAL and how much INTEREST
// (e.g. ₹10,000 = ₹9,500 principal + ₹500 interest). The two always add up to the amount: type one and the other follows.
// On Submit the interest is saved as the usual transaction and the principal is added to the customer's principal paid.
import { useRef } from "react";
import { Split } from "lucide-react";
import { cn } from "@/utils";
import { interestOf, isSplit, localSplitIssue, patchForInterest, patchForPrincipal, principalOf, type SplitRow } from "@/utils/iopSplit";
import type { IopSplitCheck } from "@/types";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** The small button on an IOP row that opens / closes the split. A dot shows that a split is entered. */
export function SplitToggle({ row, open, onToggle, compact = false }: { row: SplitRow; open: boolean; onToggle: () => void; compact?: boolean }) {
  const split = isSplit(row);
  return (
    <button
      type="button"
      data-testid="split-toggle"
      aria-expanded={open}
      aria-label={open ? "Hide principal and interest" : "Split into principal and interest"}
      title={split ? `Principal ${inr(principalOf(row))} + interest ${inr(interestOf(row))}` : "Split into principal and interest"}
      onClick={onToggle}
      className={cn(
        "relative flex flex-shrink-0 items-center justify-center rounded transition-colors",
        compact ? "h-5 w-5" : "h-7 w-7 rounded-lg border",
        open || split ? "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30" : "text-muted-foreground/70 hover:bg-muted hover:text-foreground border-border",
      )}
    >
      <Split className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {split && <span data-testid="split-dot" className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" />}
    </button>
  );
}

export function IopSplitPanel({ row, check, onChange }: {
  row: SplitRow;
  check?: IopSplitCheck | null;                 // the server's check (balance before / after, why it would be refused)
  onChange: (patch: { principal: number; amount: number }) => void;       // the amount may grow: a principal paid on top of the interest
}) {
  const amount = Number(row.amount) || 0;
  const principal = principalOf(row);
  const interest = interestOf(row);
  const issue = localSplitIssue(row) ?? check?.error ?? null;
  const unpaid = !row.is_paid;
  const noAmount = amount <= 0;
  // what the row was when the user started typing in a box: each keystroke is worked out from THAT, so typing 8000 gives the same
  // answer however the digits arrive (8, 80, 800, 8000)
  const start = useRef<{ amount: number; principal: number } | null>(null);
  const begin = () => { start.current = { amount, principal }; };
  const base = () => start.current ?? { amount, principal };

  return (
    <div data-testid="split-panel" className={cn("rounded-lg border px-3 py-2.5 text-xs space-y-2", issue ? "border-red-500/40 bg-red-500/5" : "border-orange-500/25 bg-orange-500/5")}>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10.5px] font-medium text-muted-foreground">Principal</span>
          <span className="flex items-center rounded-lg border border-border bg-background px-2 py-1 focus-within:ring-1 focus-within:ring-foreground/20">
            <span className="mr-1 text-muted-foreground">₹</span>
            <input
              type="number" inputMode="decimal" aria-label="Principal"
              disabled={unpaid || noAmount}
              value={principal ? principal : ""}
              placeholder="0"
              onFocus={begin} onBlur={() => { start.current = null; }}
              onChange={(e) => onChange(patchForPrincipal(e.target.value, base()))}
              className="w-24 bg-transparent text-sm font-semibold focus:outline-none disabled:opacity-50"
            />
          </span>
        </label>
        <span className="pb-1.5 text-muted-foreground">+</span>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10.5px] font-medium text-muted-foreground">Interest</span>
          <span className="flex items-center rounded-lg border border-border bg-background px-2 py-1 focus-within:ring-1 focus-within:ring-foreground/20">
            <span className="mr-1 text-muted-foreground">₹</span>
            <input
              type="number" inputMode="decimal" aria-label="Interest"
              disabled={unpaid || noAmount}
              value={noAmount ? "" : interest}
              placeholder="0"
              onFocus={begin} onBlur={() => { start.current = null; }}
              onChange={(e) => onChange(patchForInterest(e.target.value, base()))}
              className="w-24 bg-transparent text-sm font-semibold focus:outline-none disabled:opacity-50"
            />
          </span>
        </label>
        <span className="pb-1.5 text-muted-foreground">=</span>
        <span className="pb-1.5 font-mono text-sm font-semibold" data-testid="split-total">{inr(amount)}</span>
      </div>

      {noAmount ? (
        <p className="text-muted-foreground">Enter the amount collected first.</p>
      ) : unpaid ? (
        <p className="text-muted-foreground">An unpaid row has no principal.</p>
      ) : (
        <p data-testid="split-hint" className="text-muted-foreground">
          {inr(interest)} interest is saved as the transaction · {inr(principal)} principal is added to the customer's principal paid.
        </p>
      )}

      {check && check.balance_before != null && check.balance_after != null && principal !== 0 && !unpaid && (
        <p data-testid="split-balance" className="font-mono text-[11.5px] text-foreground/80">
          Balance {inr(check.balance_before)} → <span className={cn("font-semibold", check.balance_after < 0 && "text-red-500")}>{inr(check.balance_after)}</span>
        </p>
      )}
      {issue && <p data-testid="split-error" role="alert" className="font-medium text-red-500">{issue}</p>}
    </div>
  );
}
