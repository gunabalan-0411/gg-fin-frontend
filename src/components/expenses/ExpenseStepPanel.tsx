// The OCR page's "Daily Expenses" step (step 5): a right-side panel so the page image stays visible while expenses are entered.
// For every date of the sheet there can be SEVERAL expense lines - Category (search & click, Miscellaneous by default), optional
// Sub-category, For whom (required), Amount, Notes - and the total of everything entered is shown at the end.
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { expensesApi, type ExpenseNew } from "@/services/api";
import { ExpenseLineFields, lineActive, lineCategoryId, newLine, type ExpenseLine } from "@/components/expenses/ExpenseLineFields";

const ddmmToIso = (dmy: string): string => {
  const parts = dmy.split("-");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso: string): string => {
  const p = iso.split("-");
  return p.length !== 3 ? iso : `${p[2]} ${MONTHS[parseInt(p[1], 10) - 1] ?? ""} ${p[0]}`;
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function ExpenseStepPanel({ dates, isMobile, onDone, onSkip, onSkipAll }: {
  dates: string[];                       // dd-mm-yyyy
  isMobile: boolean;
  onDone: () => void;
  onSkip: () => void;
  onSkipAll: () => void;
}) {
  const [lines, setLines] = useState<Record<string, ExpenseLine[]>>(() => Object.fromEntries(dates.map((d) => [d, [newLine()]])));
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);                 // Save & Continue was pressed: show what is missing

  const patchLine = (date: string, key: string, patch: Partial<ExpenseLine>) =>
    setLines((prev) => ({ ...prev, [date]: prev[date].map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const addLine = (date: string) => setLines((prev) => ({ ...prev, [date]: [...prev[date], newLine()] }));
  const removeLine = (date: string, key: string) =>
    setLines((prev) => ({ ...prev, [date]: prev[date].length > 1 ? prev[date].filter((l) => l.key !== key) : [newLine()] }));

  const active = (date: string) => (lines[date] ?? []).filter(lineActive);
  const dateTotal = (date: string) => active(date).reduce((s, l) => s + Number(l.amount), 0);
  const grandTotal = dates.reduce((s, d) => s + dateTotal(d), 0);
  const count = dates.reduce((s, d) => s + active(d).length, 0);

  const handleSave = async () => {
    const entered = dates.flatMap((d) => active(d).map((l) => ({ date: d, line: l })));
    if (entered.length === 0) { onDone(); return; }
    const missing = entered.filter((e) => e.line.person_id == null).length;
    if (missing > 0) {
      setTried(true);
      toast.error(`Choose for whom ${missing === 1 ? "the expense" : `the ${missing} expenses`} ${missing === 1 ? "was" : "were"} (required)`);
      return;
    }
    setSaving(true);
    try {
      const items: ExpenseNew[] = entered.map(({ date, line }) => ({
        date: ddmmToIso(date),
        amount: Number(line.amount),
        notes: line.notes.trim() || null,
        category_id: lineCategoryId(line),
        person_id: line.person_id as number,
      }));
      await expensesApi.createBulk(items);
      toast.success(`${items.length} expense${items.length > 1 ? "s" : ""} saved · ${inr(grandTotal)}`);
      onDone();
    } catch {
      toast.error("Failed to save expenses — nothing was saved");
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <>
      <div className="flex items-center gap-2.5 px-4 py-3 bg-secondary border-b border-border flex-shrink-0">
        <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-background">5</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Daily Expenses</p>
          <p className="text-[11px] text-muted-foreground">Scroll the PDF and log expenses per date</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {dates.map((date) => (
          <div key={date} data-testid="expense-date" data-date={date} className="rounded-xl border border-border bg-background p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide">{fmtDate(ddmmToIso(date))}</p>
              {dateTotal(date) > 0 && (
                <p data-testid="date-total" className="font-mono text-[11px] font-semibold text-foreground/80">{inr(dateTotal(date))}</p>
              )}
            </div>
            {lines[date].map((line, i) => (
              <div key={line.key} className={i > 0 ? "border-t border-border/60 pt-3" : ""}>
                <ExpenseLineFields
                  line={line}
                  showPersonError={tried}
                  onChange={(patch) => patchLine(date, line.key, patch)}
                  onRemove={lines[date].length > 1 || lineActive(line) || line.notes ? () => removeLine(date, line.key) : undefined}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => addLine(date)}
              className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Add another expense
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 p-4 border-t border-border bg-secondary flex-shrink-0">
        <div data-testid="expense-total" className="flex items-baseline justify-between px-1">
          <span className="text-xs font-medium text-muted-foreground">Total expense{count > 0 ? ` · ${count} ${count === 1 ? "entry" : "entries"}` : ""}</span>
          <span className="font-mono text-base font-bold">{inr(grandTotal)}</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/85 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save & Continue"}
        </button>
        <div className="flex gap-2">
          <button onClick={onSkip} className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
            Skip
          </button>
          <button onClick={onSkipAll} className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
            Skip All
          </button>
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return <div className="fixed inset-0 z-50 flex flex-col bg-card">{body}</div>;
  }
  return (
    <div className="fixed right-0 top-0 bottom-0 z-40 flex flex-col bg-card border-l border-border shadow-2xl" style={{ width: 400 }}>
      {body}
    </div>
  );
}
