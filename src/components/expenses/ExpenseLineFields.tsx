// The fields of ONE expense line: Category (search & click, Miscellaneous by default), Sub-category (optional), For whom (required),
// Amount and Notes. Used by the OCR Expense step (several lines per date) and the Expenses page's Add / Edit form.
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { expenseGroupsApi } from "@/services/api";
import { splitCategories, useExpenseCategories, useExpensePersons, useRefreshExpenseGroups } from "@/hooks/useExpenseGroups";
import { PickCombobox } from "@/components/expenses/PickCombobox";
import { cn } from "@/utils";

export interface ExpenseLine {
  key: string;
  category_id: number | null;      // top-level; null = Miscellaneous (the default)
  sub_id: number | null;
  person_id: number | null;        // required
  amount: string;
  notes: string;
}

let seq = 0;
export const newLine = (over: Partial<ExpenseLine> = {}): ExpenseLine => ({
  key: `line-${++seq}`, category_id: null, sub_id: null, person_id: null, amount: "", notes: "", ...over,
});

/** The category to save: the sub-category when one was chosen, else the top-level one; null lets the server use Miscellaneous. */
export const lineCategoryId = (l: Pick<ExpenseLine, "category_id" | "sub_id">): number | null => l.sub_id ?? l.category_id;

/** A line counts when it has an amount. */
export const lineActive = (l: Pick<ExpenseLine, "amount">) => Number(l.amount) > 0;

const detailOf = (err: unknown) => (err as { response?: { status?: number; data?: { detail?: { id?: number; message?: string } | string } } })?.response;

export function ExpenseLineFields({ line, onChange, onRemove, showPersonError, compact = false, noDefaultCategory = false, personRequired = true }: {
  line: ExpenseLine;
  onChange: (patch: Partial<ExpenseLine>) => void;
  onRemove?: () => void;
  showPersonError?: boolean;                 // "For whom" was left empty when saving
  compact?: boolean;
  personRequired?: boolean;                  // Personal Finance: "for whom" is optional
  noDefaultCategory?: boolean;               // an old, ungrouped expense: show an empty category instead of Miscellaneous
}) {
  const { data: categories } = useExpenseCategories();
  const { data: persons } = useExpensePersons();
  const refresh = useRefreshExpenseGroups();
  const { tops, subsOf, misc } = splitCategories(categories);

  const topId = line.category_id ?? (noDefaultCategory ? null : misc?.id ?? null);
  const subs = subsOf(topId);

  // creating from the typed text; a name that already exists is simply picked
  const createWith = async (make: () => Promise<{ data: { id: number } }>): Promise<number | null> => {
    try {
      const { data } = await make();
      await refresh();
      return data.id;
    } catch (err) {
      const res = detailOf(err);
      const d = res?.data?.detail;
      if (res?.status === 409 && typeof d === "object" && d?.id != null) { await refresh(); return d.id; }
      toast.error(typeof d === "object" && d?.message ? d.message : "Could not create it");
      return null;
    }
  };

  return (
    <div data-testid="expense-line" className={cn("space-y-1.5", compact ? "" : "")}>
      <div className="grid grid-cols-2 gap-1.5">
        <PickCombobox
          ariaLabel="Category"
          placeholder={noDefaultCategory ? "Ungrouped — pick a category" : "Category"}
          value={topId}
          options={tops.map((c) => ({ id: c.id, label: c.name }))}
          onChange={(id) => onChange({ category_id: id, sub_id: null })}
          onCreate={(text) => createWith(() => expenseGroupsApi.createCategory(text, null))}
        />
        <PickCombobox
          ariaLabel="Sub-category"
          placeholder={subs.length ? "Sub-category (optional)" : "—"}
          value={line.sub_id}
          options={subs.map((c) => ({ id: c.id, label: c.name }))}
          disabled={topId == null || topId === misc?.id}
          allowClear
          onChange={(id) => onChange({ sub_id: id })}
          onCreate={topId != null ? (text) => createWith(() => expenseGroupsApi.createCategory(text, topId)) : undefined}
        />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <PickCombobox
          ariaLabel="For whom"
          placeholder={personRequired ? "For whom (required)" : "For whom (optional)"}
          value={line.person_id}
          allowClear={!personRequired}
          invalid={personRequired && showPersonError && line.person_id == null}
          options={(persons ?? []).map((p) => ({ id: p.id, label: p.name }))}
          onChange={(id) => onChange({ person_id: id })}
          onCreate={(text) => createWith(() => expenseGroupsApi.createPerson(text))}
        />
        <div className="flex w-28 items-center rounded-lg border border-border bg-card px-2 py-1.5 focus-within:ring-1 focus-within:ring-foreground/20">
          <span className="mr-1 text-xs text-muted-foreground">₹</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            aria-label="Amount"
            value={line.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            placeholder="0"
            className="w-full bg-transparent text-sm font-semibold focus:outline-none"
          />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          aria-label="Notes"
          value={line.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Notes (optional)…"
          className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/15"
        />
        {onRemove && (
          <button
            type="button"
            aria-label="Remove this expense"
            onClick={onRemove}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {personRequired && showPersonError && line.person_id == null && lineActive(line) && (
        <p data-testid="person-error" className="text-[11px] text-red-500">Choose who this expense was for</p>
      )}
    </div>
  );
}
