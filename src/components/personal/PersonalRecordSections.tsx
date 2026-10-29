// Personal Finance sections: Savings accounts, Friendly lends (money lent to friends), Friendly borrows (money the person owes),
// Gifts received and Investments.
// Everything here belongs to the logged-in person only (the server never shows it to another login).
import { useState, type ReactNode } from "react";
import { Check, Gift, HandCoins, Landmark, Pencil, Plus, Trash2, TrendingUp, Undo2, Wallet, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { DatePicker } from "@/components/ui/DatePicker";
import { cn, formatCurrency, formatDate, toISODate } from "@/utils";
import { useDeletePersonalRecord, usePersonalRecords, useSavePersonalRecord } from "@/hooks/usePersonalRecords";
import type { GiftType, InvestmentType, PersonalBorrow, PersonalGift, PersonalInvestment, PersonalLend, PersonalSaving } from "@/types";

const MONO = "var(--font-mono, ui-monospace)";
const num = (v: unknown) => Number(v) || 0;
const grams = (v: unknown) => `${parseFloat(num(v).toFixed(3))} g`;

// ── shared pieces ─────────────────────────────────────────────────────────────────────────────────────────
interface Column<T> { label: string; cell: (r: T) => ReactNode; right?: boolean }

function Shell({ testId, title, summary, addLabel, onAdd, children }: {
  testId: string; title: string; summary: ReactNode; addLabel: string; onAdd: () => void; children: ReactNode;
}) {
  return (
    <div data-testid={testId} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <div className="mt-0.5 text-sm text-muted-foreground" data-testid={`${testId}-summary`}>{summary}</div>
        </div>
        <Button onClick={onAdd}><Plus className="mr-1.5 h-4 w-4" />{addLabel}</Button>
      </div>
      {children}
    </div>
  );
}

function RecordList<T extends { id: number }>({ rows, loading, columns, empty, emptyIcon: Icon, isMobile, onEdit, onDelete, extraAction, dim, compact }: {
  rows: T[]; loading: boolean; columns: Column<T>[]; empty: string; emptyIcon: React.ElementType; isMobile: boolean;
  onEdit: (r: T) => void; onDelete: (r: T) => void; extraAction?: (r: T) => ReactNode; dim?: (r: T) => boolean;
  compact?: boolean;          // two tables share one row: tighter cells so each half stays readable
}) {
  const pad = compact ? "px-2.5" : "px-4";
  if (loading) return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-secondary" />)}</div>;
  if (rows.length === 0) {
    return (
      <div data-testid="records-empty" className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card py-14 text-center text-muted-foreground">
        <Icon className="h-9 w-9 opacity-25" />
        <p className="text-sm">{empty}</p>
      </div>
    );
  }
  const actions = (r: T) => (
    <div className="flex items-center justify-end gap-1">
      {extraAction?.(r)}
      <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => onEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
      <Button variant="destructive" size="icon" aria-label="Delete" onClick={() => onDelete(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );
  if (isMobile) {
    return (
      <div className="space-y-2" data-testid="records-cards">
        {rows.map((r) => (
          <div key={r.id} data-testid="record" className={cn("rounded-xl border border-border bg-card p-3.5", dim?.(r) && "opacity-60")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm font-semibold text-foreground">{columns[0].cell(r)}</div>
              {actions(r)}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
              {columns.slice(1).map((c) => (
                <div key={c.label} className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">{c.label}</dt>
                  <dd className="truncate text-foreground">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => <th key={c.label} className={cn(pad, "py-3 text-xs font-medium text-muted-foreground", c.right ? "text-right" : "text-left")}>{c.label}</th>)}
              <th className={cn(compact ? "w-24" : "w-28", pad, "py-3")} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="record" className={cn("border-b border-border/50 transition-colors last:border-0 hover:bg-secondary/30", dim?.(r) && "opacity-60")}>
                {columns.map((c) => <td key={c.label} className={cn(pad, "py-3 text-foreground", c.right && "text-right")}>{c.cell(r)}</td>)}
                <td className={cn(pad, "py-2.5")}>{actions(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}{optional && <span className="ml-1 text-muted-foreground/60">(optional)</span>}</span>
      {children}
    </label>
  );
}

function ConfirmDelete({ what, onConfirm, onClose }: { what: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`Delete ${what}?`}>
      <p className="mb-4 text-sm text-muted-foreground">This cannot be undone.</p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="destructive" className="flex-1" data-testid="confirm-delete" onClick={onConfirm}>Delete</Button>
      </div>
    </Modal>
  );
}

function FormButtons({ onClose, busy }: { onClose: () => void; busy: boolean }) {
  return (
    <div className="flex gap-2 pt-1">
      <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
      <Button type="submit" className="flex-1" disabled={busy}>Save</Button>
    </div>
  );
}

const today = () => toISODate(new Date());

// ── Savings ───────────────────────────────────────────────────────────────────────────────────────────────
export function SavingsSection({ isMobile }: { isMobile: boolean }) {
  const { data, isLoading } = usePersonalRecords<PersonalSaving>("savings");
  const save = useSavePersonalRecord("savings", "Savings account");
  const del = useDeletePersonalRecord("savings", "Savings account");
  const [form, setForm] = useState<{ initial: PersonalSaving | null } | null>(null);
  const [toDelete, setToDelete] = useState<PersonalSaving | null>(null);
  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + num(r.amount), 0);

  return (
    <Shell testId="savings-section" title="Savings" addLabel="Add savings" onAdd={() => setForm({ initial: null })}
      summary={rows.length ? <>Total <b className="text-foreground" style={{ fontFamily: MONO }}>{formatCurrency(total)}</b> in {rows.length} account{rows.length === 1 ? "" : "s"}</> : "Where your savings are kept"}>
      <RecordList rows={rows} loading={isLoading} isMobile={isMobile} empty="No savings added yet" emptyIcon={Wallet}
        onEdit={(r) => setForm({ initial: r })} onDelete={setToDelete}
        columns={[
          { label: "Bank", cell: (r) => r.bank },
          { label: "Account name", cell: (r) => r.account_name },
          { label: "Amount", right: true, cell: (r) => <span style={{ fontFamily: MONO }} className="font-medium">{formatCurrency(num(r.amount))}</span> },
          { label: "Balance recorded on", cell: (r) => formatDate(r.balance_date) },
          { label: "Notes", cell: (r) => r.notes || "—" },
        ]} />
      {form && (
        <SavingForm key={form.initial?.id ?? "new"} initial={form.initial} busy={save.isPending} onClose={() => setForm(null)}
          onSave={(data) => save.mutate({ id: form.initial?.id, data }, { onSuccess: () => setForm(null) })} />
      )}
      {toDelete && <ConfirmDelete what={`${toDelete.bank} · ${toDelete.account_name}`} onClose={() => setToDelete(null)}
        onConfirm={() => del.mutate(toDelete.id, { onSettled: () => setToDelete(null) })} />}
    </Shell>
  );
}

function SavingForm({ initial, busy, onSave, onClose }: { initial: PersonalSaving | null; busy: boolean; onSave: (d: object) => void; onClose: () => void }) {
  const [bank, setBank] = useState(initial?.bank ?? "");
  const [accountName, setAccountName] = useState(initial?.account_name ?? "");
  const [amount, setAmount] = useState(initial ? String(num(initial.amount)) : "");
  const [date, setDate] = useState(initial?.balance_date ?? today());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return (
    <Modal open onClose={onClose} title={initial ? "Edit savings" : "Add savings"}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        if (!bank.trim()) return void toast.error("Enter the bank");
        if (!accountName.trim()) return void toast.error("Enter the account name");
        if (amount.trim() === "" || num(amount) < 0) return void toast.error("Enter the amount");
        onSave({ bank: bank.trim(), account_name: accountName.trim(), amount: num(amount), balance_date: date, notes: notes.trim() || null });
      }}>
        <Field label="Bank"><Input autoFocus value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. HDFC" /></Field>
        <Field label="Account name"><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. Salary account" /></Field>
        <Field label="Amount (₹)"><Input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
        <Field label="Last recorded balance date"><DatePicker value={date} onChange={setDate} /></Field>
        <Field label="Notes" optional><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <FormButtons onClose={onClose} busy={busy} />
      </form>
    </Modal>
  );
}

// ── Friendly lends ────────────────────────────────────────────────────────────────────────────────────────
/** The date a lend is to be chased (or a borrow paid back): the day, flagged Overdue / Today; a settled one just says so. */
function dueBadge(settled: boolean, date: string | null | undefined, settledLabel: string, flagTestId: string) {
  if (settled) return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">{settledLabel}</span>;
  if (!date) return <span className="text-muted-foreground">—</span>;
  const t = today();
  const tone = date < t ? "bg-red-500/10 text-red-600 dark:text-red-400" : date === t ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "";
  const note = date < t ? "Overdue" : date === t ? "Today" : "";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {formatDate(date)}
      {note && <span data-testid={flagTestId} className={cn("rounded-full px-2 py-0.5 text-[11px]", tone)}>{note}</span>}
    </span>
  );
}
const followUpBadge = (r: PersonalLend) => dueBadge(r.is_settled, r.follow_up_date, "Repaid", "follow-up-flag");
const payBackBadge = (r: PersonalBorrow) => dueBadge(r.is_settled, r.pay_back_date, "Paid", "pay-back-flag");

export function LendsSection({ isMobile }: { isMobile: boolean }) {
  const { data, isLoading } = usePersonalRecords<PersonalLend>("lends");
  const save = useSavePersonalRecord("lends", "Lend");
  const del = useDeletePersonalRecord("lends", "Lend");
  const [form, setForm] = useState<{ initial: PersonalLend | null } | null>(null);
  const [toDelete, setToDelete] = useState<PersonalLend | null>(null);
  const rows = data ?? [];
  const open = rows.filter((r) => !r.is_settled);
  const outstanding = open.reduce((s, r) => s + num(r.amount), 0);

  return (
    <Shell testId="lends-section" title="Friendly lends" addLabel="Add lend" onAdd={() => setForm({ initial: null })}
      summary={open.length ? <><b className="text-foreground" style={{ fontFamily: MONO }}>{formatCurrency(outstanding)}</b> to come back from {open.length} {open.length === 1 ? "person" : "people"}</> : "Money you lent to friends"}>
      <RecordList rows={rows} loading={isLoading} isMobile={isMobile} compact empty="No friendly lends yet" emptyIcon={HandCoins} dim={(r) => r.is_settled}
        onEdit={(r) => setForm({ initial: r })} onDelete={setToDelete}
        extraAction={(r) => (
          <Button variant="ghost" size="icon" aria-label={r.is_settled ? "Mark as not repaid" : "Mark as repaid"} title={r.is_settled ? "Mark as not repaid" : "Mark as repaid"}
            onClick={() => save.mutate({ id: r.id, data: { is_settled: !r.is_settled } })}>
            {r.is_settled ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
        )}
        columns={[
          { label: "To whom", cell: (r) => r.to_whom },
          { label: "Amount", right: true, cell: (r) => <span style={{ fontFamily: MONO }} className="font-medium">{formatCurrency(num(r.amount))}</span> },
          { label: "Next follow-up", cell: followUpBadge },
          { label: "Notes", cell: (r) => r.notes || "—" },
        ]} />
      {form && (
        <LendForm key={form.initial?.id ?? "new"} initial={form.initial} busy={save.isPending} onClose={() => setForm(null)}
          onSave={(data) => save.mutate({ id: form.initial?.id, data }, { onSuccess: () => setForm(null) })} />
      )}
      {toDelete && <ConfirmDelete what={`the lend to ${toDelete.to_whom}`} onClose={() => setToDelete(null)}
        onConfirm={() => del.mutate(toDelete.id, { onSettled: () => setToDelete(null) })} />}
    </Shell>
  );
}

function LendForm({ initial, busy, onSave, onClose }: { initial: PersonalLend | null; busy: boolean; onSave: (d: object) => void; onClose: () => void }) {
  const [toWhom, setToWhom] = useState(initial?.to_whom ?? "");
  const [amount, setAmount] = useState(initial ? String(num(initial.amount)) : "");
  const [follow, setFollow] = useState<string | null>(initial ? initial.follow_up_date ?? null : null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return (
    <Modal open onClose={onClose} title={initial ? "Edit lend" : "Add lend"}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        if (!toWhom.trim()) return void toast.error("Enter who it was lent to");
        if (!(num(amount) > 0)) return void toast.error("Enter the amount");
        onSave({ to_whom: toWhom.trim(), amount: num(amount), follow_up_date: follow, notes: notes.trim() || null });
      }}>
        <Field label="To whom"><Input autoFocus value={toWhom} onChange={(e) => setToWhom(e.target.value)} /></Field>
        <Field label="Amount (₹)"><Input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
        <Field label="Next date to follow up" optional>
          <div className="flex items-center gap-2">
            <DatePicker className="flex-1" value={follow ?? undefined} onChange={setFollow} />
            {follow && <Button type="button" variant="ghost" size="icon" aria-label="Clear the follow-up date" onClick={() => setFollow(null)}><X className="h-4 w-4" /></Button>}
          </div>
        </Field>
        <Field label="Notes" optional><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <FormButtons onClose={onClose} busy={busy} />
      </form>
    </Modal>
  );
}

// ── Friendly borrows (what I owe) ─────────────────────────────────────────────────────────────────────────
export function BorrowsSection({ isMobile }: { isMobile: boolean }) {
  const { data, isLoading } = usePersonalRecords<PersonalBorrow>("borrows");
  const save = useSavePersonalRecord("borrows", "Borrow");
  const del = useDeletePersonalRecord("borrows", "Borrow");
  const [form, setForm] = useState<{ initial: PersonalBorrow | null } | null>(null);
  const [toDelete, setToDelete] = useState<PersonalBorrow | null>(null);
  const rows = data ?? [];
  const open = rows.filter((r) => !r.is_settled);
  const owed = open.reduce((s, r) => s + num(r.amount), 0);

  return (
    <Shell testId="borrows-section" title="Friendly borrows" addLabel="Add borrow" onAdd={() => setForm({ initial: null })}
      summary={open.length ? <>You owe <b className="text-foreground" style={{ fontFamily: MONO }}>{formatCurrency(owed)}</b> to {open.length} {open.length === 1 ? "person" : "people"}</> : "Money you owe to others"}>
      <RecordList rows={rows} loading={isLoading} isMobile={isMobile} compact empty="You owe nobody" emptyIcon={Landmark} dim={(r) => r.is_settled}
        onEdit={(r) => setForm({ initial: r })} onDelete={setToDelete}
        extraAction={(r) => (
          <Button variant="ghost" size="icon" aria-label={r.is_settled ? "Mark as not paid" : "Mark as paid"} title={r.is_settled ? "Mark as not paid" : "Mark as paid"}
            onClick={() => save.mutate({ id: r.id, data: { is_settled: !r.is_settled } })}>
            {r.is_settled ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
        )}
        columns={[
          { label: "Owed to", cell: (r) => r.from_whom },
          { label: "Amount", right: true, cell: (r) => <span style={{ fontFamily: MONO }} className="font-medium">{formatCurrency(num(r.amount))}</span> },
          { label: "Pay back by", cell: payBackBadge },
          { label: "Notes", cell: (r) => r.notes || "—" },
        ]} />
      {form && (
        <BorrowForm key={form.initial?.id ?? "new"} initial={form.initial} busy={save.isPending} onClose={() => setForm(null)}
          onSave={(data) => save.mutate({ id: form.initial?.id, data }, { onSuccess: () => setForm(null) })} />
      )}
      {toDelete && <ConfirmDelete what={`the borrow from ${toDelete.from_whom}`} onClose={() => setToDelete(null)}
        onConfirm={() => del.mutate(toDelete.id, { onSettled: () => setToDelete(null) })} />}
    </Shell>
  );
}

function BorrowForm({ initial, busy, onSave, onClose }: { initial: PersonalBorrow | null; busy: boolean; onSave: (d: object) => void; onClose: () => void }) {
  const [fromWhom, setFromWhom] = useState(initial?.from_whom ?? "");
  const [amount, setAmount] = useState(initial ? String(num(initial.amount)) : "");
  const [payBack, setPayBack] = useState<string | null>(initial ? initial.pay_back_date ?? null : null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return (
    <Modal open onClose={onClose} title={initial ? "Edit borrow" : "Add borrow"}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        if (!fromWhom.trim()) return void toast.error("Enter who you owe");
        if (!(num(amount) > 0)) return void toast.error("Enter the amount");
        onSave({ from_whom: fromWhom.trim(), amount: num(amount), pay_back_date: payBack, notes: notes.trim() || null });
      }}>
        <Field label="Owed to"><Input autoFocus value={fromWhom} onChange={(e) => setFromWhom(e.target.value)} /></Field>
        <Field label="Amount (₹)"><Input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
        <Field label="Pay back by" optional>
          <div className="flex items-center gap-2">
            <DatePicker className="flex-1" value={payBack ?? undefined} onChange={setPayBack} />
            {payBack && <Button type="button" variant="ghost" size="icon" aria-label="Clear the pay-back date" onClick={() => setPayBack(null)}><X className="h-4 w-4" /></Button>}
          </div>
        </Field>
        <Field label="Notes" optional><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <FormButtons onClose={onClose} busy={busy} />
      </form>
    </Modal>
  );
}

// ── Investments ───────────────────────────────────────────────────────────────────────────────────────────
const INVESTMENT_TYPES: { id: InvestmentType; label: string }[] = [
  { id: "stocks", label: "Stocks" }, { id: "mutual_fund", label: "Mutual fund" }, { id: "fixed_deposit", label: "Fixed deposit" },
  { id: "gold", label: "Gold" }, { id: "chit", label: "Chit" }, { id: "other", label: "Other" },
];
const typeLabel = (t: InvestmentType) => INVESTMENT_TYPES.find((x) => x.id === t)?.label ?? t;
const hasValue = (r: PersonalInvestment) => r.current_value != null && String(r.current_value) !== "";
const pct = (n: number) => `${n > 0 ? "+" : ""}${parseFloat(n.toFixed(1))}%`;

/** Gain (or loss) of one holding: its current value less what was put in. Only when the current value is known. */
function GainCell({ r }: { r: PersonalInvestment }) {
  if (!hasValue(r)) return <span className="text-muted-foreground">—</span>;
  const gain = num(r.current_value) - num(r.amount);
  const tone = gain > 0 ? "text-emerald-600 dark:text-emerald-400" : gain < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground";
  return (
    <span data-testid="gain" className={cn("font-medium", tone)} style={{ fontFamily: MONO }}>
      {gain > 0 ? "+" : gain < 0 ? "−" : ""}{formatCurrency(Math.abs(gain))} <span className="text-[11px] font-normal">({pct((gain / num(r.amount)) * 100)})</span>
    </span>
  );
}

export function InvestmentsSection({ isMobile }: { isMobile: boolean }) {
  const { data, isLoading } = usePersonalRecords<PersonalInvestment>("investments");
  const save = useSavePersonalRecord("investments", "Investment");
  const del = useDeletePersonalRecord("investments", "Investment");
  const [form, setForm] = useState<{ initial: PersonalInvestment | null } | null>(null);
  const [toDelete, setToDelete] = useState<PersonalInvestment | null>(null);
  const rows = data ?? [];
  const invested = rows.reduce((s, r) => s + num(r.amount), 0);
  // gain / loss only over the holdings whose current value is known: an unknown value is not "zero"
  const valued = rows.filter(hasValue);
  const valuedCost = valued.reduce((s, r) => s + num(r.amount), 0);
  const worth = valued.reduce((s, r) => s + num(r.current_value), 0);
  const gain = worth - valuedCost;
  const unvalued = rows.length - valued.length;

  return (
    <Shell testId="investments-section" title="Investments" addLabel="Add investment" onAdd={() => setForm({ initial: null })}
      summary={rows.length ? (
        <>
          Invested <b className="text-foreground" style={{ fontFamily: MONO }}>{formatCurrency(invested)}</b> in {rows.length} {rows.length === 1 ? "holding" : "holdings"}
          {valued.length > 0 && (
            <>
              {" · "}worth now <b className="text-foreground" style={{ fontFamily: MONO }}>{formatCurrency(worth)}</b>
              {" · "}<b data-testid="investments-gain" className={gain > 0 ? "text-emerald-600 dark:text-emerald-400" : gain < 0 ? "text-red-600 dark:text-red-400" : "text-foreground"} style={{ fontFamily: MONO }}>
                {gain > 0 ? "gain +" : gain < 0 ? "loss −" : "no change "}{gain === 0 ? "" : formatCurrency(Math.abs(gain))}{valuedCost > 0 && gain !== 0 ? ` (${pct((gain / valuedCost) * 100)})` : ""}
              </b>
            </>
          )}
          {valued.length > 0 && unvalued > 0 && <span data-testid="investments-unvalued"> · {unvalued} without a current value not counted in the gain</span>}
        </>
      ) : "Stocks, funds, deposits, gold and chits"}>
      <RecordList rows={rows} loading={isLoading} isMobile={isMobile} empty="No investments added yet" emptyIcon={TrendingUp}
        onEdit={(r) => setForm({ initial: r })} onDelete={setToDelete}
        columns={[
          { label: "Name", cell: (r) => r.name },
          { label: "Type", cell: (r) => typeLabel(r.inv_type) },
          { label: "Invested", right: true, cell: (r) => <span style={{ fontFamily: MONO }} className="font-medium">{formatCurrency(num(r.amount))}</span> },
          { label: "Current value", right: true, cell: (r) => (hasValue(r) ? <span style={{ fontFamily: MONO }} className="font-medium">{formatCurrency(num(r.current_value))}</span> : <span className="text-muted-foreground">—</span>) },
          { label: "Gain / loss", right: true, cell: (r) => <GainCell r={r} /> },
          { label: "Invested on", cell: (r) => (r.invested_date ? formatDate(r.invested_date) : "—") },
          { label: "Notes", cell: (r) => r.notes || "—" },
        ]} />
      {form && (
        <InvestmentForm key={form.initial?.id ?? "new"} initial={form.initial} busy={save.isPending} onClose={() => setForm(null)}
          onSave={(data) => save.mutate({ id: form.initial?.id, data }, { onSuccess: () => setForm(null) })} />
      )}
      {toDelete && <ConfirmDelete what={toDelete.name} onClose={() => setToDelete(null)}
        onConfirm={() => del.mutate(toDelete.id, { onSettled: () => setToDelete(null) })} />}
    </Shell>
  );
}

function InvestmentForm({ initial, busy, onSave, onClose }: { initial: PersonalInvestment | null; busy: boolean; onSave: (d: object) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<InvestmentType>(initial?.inv_type ?? "mutual_fund");
  const [amount, setAmount] = useState(initial ? String(num(initial.amount)) : "");
  const [value, setValue] = useState(initial && hasValue(initial) ? String(num(initial.current_value)) : "");
  const [date, setDate] = useState<string | null>(initial ? initial.invested_date ?? null : today());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return (
    <Modal open onClose={onClose} title={initial ? "Edit investment" : "Add investment"}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return void toast.error("Enter the name of the investment");
        if (!(num(amount) > 0)) return void toast.error("Enter the amount invested");
        if (value.trim() !== "" && num(value) < 0) return void toast.error("The current value cannot be negative");
        onSave({
          name: name.trim(), inv_type: type, amount: num(amount),
          current_value: value.trim() === "" ? null : num(value),         // left empty = not known (cleared)
          invested_date: date, notes: notes.trim() || null,
        });
      }}>
        <Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nifty 50 index fund" /></Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as InvestmentType)} aria-label="Type"
            className="flex h-9 w-full rounded-lg border border-border bg-card px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
            {INVESTMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Amount invested (₹)"><Input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
        <Field label="Current value (₹)" optional><Input type="number" inputMode="decimal" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder="what it is worth now" /></Field>
        <Field label="Invested on" optional>
          <div className="flex items-center gap-2">
            <DatePicker className="flex-1" value={date ?? undefined} onChange={setDate} />
            {date && <Button type="button" variant="ghost" size="icon" aria-label="Clear the date" onClick={() => setDate(null)}><X className="h-4 w-4" /></Button>}
          </div>
        </Field>
        <Field label="Notes" optional><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <FormButtons onClose={onClose} busy={busy} />
      </form>
    </Modal>
  );
}

// ── Gifts received ────────────────────────────────────────────────────────────────────────────────────────
const GIFT_TYPES: { id: GiftType; label: string }[] = [{ id: "money", label: "Money" }, { id: "gold", label: "Gold" }, { id: "other", label: "Other" }];
const giftWhat = (g: PersonalGift) => g.gift_type === "money" ? formatCurrency(num(g.amount)) : g.gift_type === "gold" ? `Gold · ${grams(g.gold_grams)}` : g.item_name || "—";

export function GiftsSection({ isMobile }: { isMobile: boolean }) {
  const { data, isLoading } = usePersonalRecords<PersonalGift>("gifts");
  const save = useSavePersonalRecord("gifts", "Gift");
  const del = useDeletePersonalRecord("gifts", "Gift");
  const [form, setForm] = useState<{ initial: PersonalGift | null } | null>(null);
  const [toDelete, setToDelete] = useState<PersonalGift | null>(null);
  const rows = data ?? [];
  const money = rows.filter((g) => g.gift_type === "money").reduce((s, g) => s + num(g.amount), 0);
  const gold = rows.filter((g) => g.gift_type === "gold").reduce((s, g) => s + num(g.gold_grams), 0);
  const others = rows.filter((g) => g.gift_type === "other").length;

  return (
    <Shell testId="gifts-section" title="Gifts received" addLabel="Add gift" onAdd={() => setForm({ initial: null })}
      summary={rows.length ? (
        <>
          <b className="text-foreground" style={{ fontFamily: MONO }}>{formatCurrency(money)}</b> money · <b className="text-foreground" style={{ fontFamily: MONO }}>{grams(gold)}</b> gold · {others} other gift{others === 1 ? "" : "s"}
        </>
      ) : "Money, gold and other gifts you received"}>
      <RecordList rows={rows} loading={isLoading} isMobile={isMobile} empty="No gifts recorded yet" emptyIcon={Gift}
        onEdit={(r) => setForm({ initial: r })} onDelete={setToDelete}
        columns={[
          { label: "Gift", cell: (g) => <span className={g.gift_type === "money" ? "font-medium" : ""} style={g.gift_type === "money" ? { fontFamily: MONO } : undefined}>{giftWhat(g)}</span> },
          { label: "Occasion", cell: (g) => g.occasion || "—" },
          { label: "From", cell: (g) => g.gift_from || "—" },
          { label: "Received on", cell: (g) => (g.received_date ? formatDate(g.received_date) : "—") },
          { label: "Notes", cell: (g) => g.notes || "—" },
        ]} />
      {form && (
        <GiftForm key={form.initial?.id ?? "new"} initial={form.initial} busy={save.isPending} onClose={() => setForm(null)}
          onSave={(data) => save.mutate({ id: form.initial?.id, data }, { onSuccess: () => setForm(null) })} />
      )}
      {toDelete && <ConfirmDelete what="this gift" onClose={() => setToDelete(null)}
        onConfirm={() => del.mutate(toDelete.id, { onSettled: () => setToDelete(null) })} />}
    </Shell>
  );
}

function GiftForm({ initial, busy, onSave, onClose }: { initial: PersonalGift | null; busy: boolean; onSave: (d: object) => void; onClose: () => void }) {
  const [type, setType] = useState<GiftType>(initial?.gift_type ?? "money");
  const [amount, setAmount] = useState(initial?.amount != null ? String(num(initial.amount)) : "");
  const [gramsText, setGramsText] = useState(initial?.gold_grams != null ? String(parseFloat(num(initial.gold_grams).toFixed(3))) : "");
  const [item, setItem] = useState(initial?.item_name ?? "");
  const [occasion, setOccasion] = useState(initial?.occasion ?? "");
  const [from, setFrom] = useState(initial?.gift_from ?? "");
  const [received, setReceived] = useState<string | null>(initial ? initial.received_date ?? null : today());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return (
    <Modal open onClose={onClose} title={initial ? "Edit gift" : "Add gift"}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        if (type === "money" && !(num(amount) > 0)) return void toast.error("Enter how much money");
        if (type === "gold" && !(num(gramsText) > 0)) return void toast.error("Enter how many grams of gold");
        if (type === "other" && !item.trim()) return void toast.error("Enter the name of the gift");
        onSave({
          gift_type: type,
          amount: type === "money" ? num(amount) : null,
          gold_grams: type === "gold" ? num(gramsText) : null,
          item_name: type === "other" ? item.trim() : null,
          occasion: occasion.trim() || null, gift_from: from.trim() || null, received_date: received, notes: notes.trim() || null,
        });
      }}>
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Type of gift</span>
          <div role="group" aria-label="Type of gift" className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            {GIFT_TYPES.map((t) => (
              <button key={t.id} type="button" aria-pressed={type === t.id} onClick={() => setType(t.id)}
                className={cn("flex-1 rounded-md py-1.5 text-sm font-medium transition-colors", type === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {type === "money" && <Field label="How much (₹)"><Input autoFocus type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>}
        {type === "gold" && <Field label="How much gold (grams)"><Input autoFocus type="number" inputMode="decimal" min="0" step="0.001" value={gramsText} onChange={(e) => setGramsText(e.target.value)} placeholder="0" /></Field>}
        {type === "other" && <Field label="Name of the gift"><Input autoFocus value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. Wall clock" /></Field>}
        <Field label="Occasion" optional><Input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="e.g. Birthday, Wedding" /></Field>
        <Field label="Gift from" optional><Input value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Received on" optional>
          <div className="flex items-center gap-2">
            <DatePicker className="flex-1" value={received ?? undefined} onChange={setReceived} />
            {received && <Button type="button" variant="ghost" size="icon" aria-label="Clear the date" onClick={() => setReceived(null)}><X className="h-4 w-4" /></Button>}
          </div>
        </Field>
        <Field label="Notes" optional><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <FormButtons onClose={onClose} busy={busy} />
      </form>
    </Modal>
  );
}
