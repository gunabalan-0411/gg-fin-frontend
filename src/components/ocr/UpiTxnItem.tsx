// One UPI transaction in the OCR page's UPI list (desktop column and mobile list share it).
//  - idle        : plain; an already-mapped transaction offers "Apply" and "Unlink" (the UPI id stops pointing at that customer)
//  - highlighted : a customer was just marked paid online -> rotating dotted outline + a small "matches" text; click to pick it
//  - paired      : used by a customer row -> struck through, shows the customer (and "Auto" when it applied itself), "Undo"
// There is deliberately NO strike-out button: a transaction is struck out only by being paired.
import { CheckCircle, RotateCcw, Unlink } from "lucide-react";
import { cn } from "@/utils";
import type { UpiTxnLike } from "@/utils/upiPairing";

export type UpiItemTxn = UpiTxnLike;

export interface UpiTxnItemProps<T extends UpiItemTxn = UpiItemTxn> {
  txn: T;
  variant: "desktop" | "mobile";
  paired?: { customerName: string; auto?: boolean } | null;     // auto: applied by itself because the UPI id was already mapped
  highlighted?: boolean;
  tag?: string | null;                       // "Name & amount match", "Amount matches", … (only shown while highlighted)
  canApply?: boolean;                        // mapped to a customer that has a row on this page
  onPick: (txn: T) => void;
  onApply: (txn: T) => void;
  onUndo: (txn: T) => void;
  onUnlink?: (txn: T) => void;               // a mapped, unpaired transaction offers "Unlink" (its UPI id stops pointing at the customer)
}

const inr = (n: string | number) => `₹${Number(n).toLocaleString("en-IN")}`;

export function UpiTxnItem<T extends UpiItemTxn>({ txn, variant, paired, highlighted, tag, canApply, onPick, onApply, onUndo, onUnlink }: UpiTxnItemProps<T>) {
  const desktop = variant === "desktop";
  const mapped = txn.mapped_customer_id != null;
  const sender = txn.sender_name || txn.sender_vpa || "—";
  const pickable = Boolean(highlighted) && !paired;
  const state = paired ? "paired" : pickable ? "highlight" : "idle";

  return (
    <div
      data-testid="upi-item"
      data-upi-id={txn.id}
      data-state={state}
      role={pickable ? "button" : undefined}
      tabIndex={pickable ? 0 : undefined}
      aria-label={pickable ? `Use the payment from ${sender}, ${inr(txn.amount)}, for this customer` : undefined}
      onClick={pickable ? () => onPick(txn) : undefined}
      onKeyDown={pickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(txn); } } : undefined}
      className={cn(
        "group relative flex items-center gap-2 transition-colors",
        desktop
          ? "px-4 py-2.5 border-b border-border/30 last:border-0"
          : "px-3 py-2 rounded-xl border",
        pickable && (desktop ? "mx-1.5 my-1 rounded-lg border-b-0 bg-primary/10 cursor-pointer" : "bg-primary/10 cursor-pointer"),
        paired
          ? desktop ? "bg-emerald-50/70 dark:bg-emerald-950/20" : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40"
          : !pickable && !desktop && (mapped ? "bg-primary/8 border-primary/20" : "bg-card border-border/60"),
        !paired && !pickable && desktop && (mapped ? "bg-primary/[0.08] hover:bg-primary/10" : "hover:bg-muted/60"),
      )}
    >
      {pickable && (
        <svg className="upi-ants" aria-hidden="true" data-testid="upi-ants"><rect /></svg>
      )}

      <div className="flex-1 min-w-0">
        <p className={cn("truncate font-medium", desktop ? "text-[12.5px]" : "text-sm", paired && "line-through text-muted-foreground")}>
          {sender}
        </p>
        {paired ? (
          <p className={cn("flex items-center gap-0.5 mt-0.5 truncate text-emerald-700 dark:text-emerald-400", desktop ? "text-[10.5px]" : "text-xs")}>
            <CheckCircle className={cn("flex-shrink-0", desktop ? "h-2.5 w-2.5" : "h-3 w-3")} />
            <span className="truncate">{paired.customerName}</span>
            {paired.auto && (
              <span data-testid="upi-auto" title="Applied automatically: this UPI id is already saved for this customer" className="ml-1 flex-shrink-0 rounded bg-emerald-500/15 px-1 py-px text-[8.5px] font-bold uppercase">Auto</span>
            )}
          </p>
        ) : mapped ? (
          <p className={cn("flex items-center gap-0.5 mt-0.5 truncate text-emerald-700 dark:text-emerald-400", desktop ? "text-[10.5px]" : "text-xs")}>
            <CheckCircle className={cn("flex-shrink-0", desktop ? "h-2.5 w-2.5" : "h-3 w-3")} />
            <span className="truncate">{txn.mapped_customer_name}</span>
            {txn.mapped_customer_type && (
              <span className={cn(
                "ml-1 text-[8.5px] font-bold px-1 py-px rounded uppercase",
                txn.mapped_customer_type === "edi" ? "bg-blue-500/15 text-blue-700 dark:text-blue-400" : "bg-orange-500/15 text-orange-700 dark:text-orange-400",
              )}>{txn.mapped_customer_type}</span>
            )}
          </p>
        ) : (
          desktop && <p className="text-[10.5px] text-muted-foreground/40 mt-0.5">Unmapped</p>
        )}
        {pickable && tag && (
          <p data-testid="upi-match-tag" className="mt-0.5 text-[10px] font-medium text-foreground/70">{tag}</p>
        )}
      </div>

      <span className={cn(
        "flex-shrink-0 font-semibold",
        desktop ? "text-[12.5px] font-mono" : "text-sm font-bold",
        paired ? "line-through text-muted-foreground" : "text-emerald-700 dark:text-emerald-400",
      )}>
        {inr(txn.amount)}
      </span>

      {paired ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onUndo(txn); }}
          className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted-foreground bg-muted/80 hover:bg-muted border border-border/60 transition-colors"
        >
          <RotateCcw className="h-2.5 w-2.5" />Undo
        </button>
      ) : canApply ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onApply(txn); }}
          title={`Apply ${inr(txn.amount)} as ONLINE + Paid`}
          className={cn(
            "flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors",
            "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800/50",
            desktop && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <CheckCircle className="h-2.5 w-2.5" />Apply
        </button>
      ) : null}

      {!paired && mapped && onUnlink && (
        <button
          type="button"
          data-testid="upi-unlink"
          onClick={(e) => { e.stopPropagation(); onUnlink(txn); }}
          title={`Unlink ${txn.mapped_customer_name ?? "the customer"} from this UPI id`}
          aria-label={`Unlink ${txn.mapped_customer_name ?? "the customer"} from ${sender}`}
          className={cn(
            "flex-shrink-0 flex items-center gap-0.5 rounded text-[10px] font-medium border transition-colors",
            "text-muted-foreground bg-muted/60 hover:bg-destructive/10 hover:text-destructive border-border/60 hover:border-destructive/30",
            desktop ? "p-1.5" : "px-1.5 py-0.5",
          )}
        >
          <Unlink className={desktop ? "h-3 w-3" : "h-2.5 w-2.5"} />{!desktop && "Unlink"}
        </button>
      )}
    </div>
  );
}
