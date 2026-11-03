// Expense accounts: accounts used ONLY for expenses (a bank account, a wallet). Money goes in as funds, expenses are paid from an
// account, and at the end of the month the balance shown here should be what the bank shows - "Match bank" says whether it is.
// Every action opens inline under its account: there is no pop-up to dismiss.
import { useState } from "react";
import { CheckCircle2, Clock, Landmark, Pencil, Plus, Trash2, TriangleAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { cn } from "@/utils";
import toast from "react-hot-toast";
import { useAccountActions, useAccountEntries, usePersonalAccounts } from "@/hooks/usePersonalAccounts";
import type { PersonalAccount, ReconcileResult } from "@/types";
import { AMOUNT_BOX, dmy, firstOfMonthIso, keyOf, lastOfMonthIso, num, rupees, signed, todayIso } from "./format";

type Tab = "fund" | "bank" | "history" | "edit";
const GRID = "grid grid-cols-2 items-center gap-x-4 gap-y-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_21rem]";
const OK = "text-emerald-700 dark:text-emerald-400";
const OVER = "text-red-700 dark:text-red-400";
const FIELD = "block text-xs font-medium text-muted-foreground mb-1";

export function AccountsPanel({ month }: { month: string }) {
  const { data, isLoading, isError } = usePersonalAccounts(month);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<{ id: number; tab: Tab } | null>(null);
  const current = month >= keyOf(new Date());

  const accounts = data?.accounts ?? [];
  const live = accounts.filter((a) => a.active);

  return (
    <section data-testid="accounts-panel" aria-labelledby="ac-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="ac-title" className="text-base font-semibold text-foreground">Expense accounts</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Accounts you use only for expenses. Pick one as <span className="font-medium text-foreground">Paid from</span> on an expense; at month end its balance here should match the bank.
          </p>
        </div>
        {!adding && accounts.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Add account</Button>
        )}
      </div>

      {adding && <AddAccountForm month={month} onDone={() => setAdding(false)} />}

      {isLoading && <div data-testid="accounts-loading" className="h-28 animate-pulse rounded-xl border border-border bg-card/60" />}
      {isError && <div className="rounded-xl border border-border bg-card p-6 text-sm text-red-700 dark:text-red-400">Could not load your expense accounts</div>}

      {data && accounts.length === 0 && !adding && (
        <div data-testid="accounts-empty" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-border bg-card/50 px-5 py-6">
          <div className="flex items-start gap-3">
            <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <p className="max-w-xl text-sm text-muted-foreground">
              No expense accounts yet. Add the bank account or wallet you pay expenses from. TickBook then keeps its balance as you add funds and spend, so you can match it with the bank each month.
            </p>
          </div>
          <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Add account</Button>
        </div>
      )}

      {data && accounts.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className={cn(GRID, "hidden border-b border-border bg-secondary/50 px-5 py-2.5 text-xs font-medium text-muted-foreground lg:grid")} aria-hidden>
            <span>Account</span>
            <span className="text-right">Start of month</span>
            <span className="text-right">Funds added</span>
            <span className="text-right">Spent</span>
            <span className="text-right">{current ? "Balance" : "Closing balance"}</span>
            <span />
          </div>
          <ul className="divide-y divide-border/70">
            {accounts.map((a) => (
              <AccountRow key={a.id} account={a} month={month} tab={open?.id === a.id ? open.tab : null}
                onTab={(tab) => setOpen(tab ? { id: a.id, tab } : null)} />
            ))}
          </ul>
          {live.length > 1 && (
            <div data-testid="accounts-total" className={cn(GRID, "border-t border-border bg-secondary/40 px-5 py-3 text-sm")}>
              <span className="col-span-2 font-medium lg:col-span-1">All accounts</span>
              <Money label="Start of month" value={rupees(num(data.totals.month_opening))} />
              <Money label="Funds added" value={rupees(num(data.totals.funds))} />
              <Money label="Spent" value={rupees(num(data.totals.spent))} />
              <Money label="Balance" value={rupees(num(data.totals.closing))} strong testId="accounts-total-balance" />
              <span className="hidden lg:block" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Money({ label, value, strong, tone, testId, note }: { label: string; value: string; strong?: boolean; tone?: string; testId?: string; note?: string }) {
  return (
    <div className="lg:text-right">
      <span className="text-[11px] text-muted-foreground lg:sr-only">{label}</span>
      <div data-testid={testId} className={cn("font-mono tabular-nums", strong ? "text-[15px] font-semibold" : "text-[13px]", tone ?? "text-foreground")}>{value}</div>
      {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}

function AccountRow({ account: a, month, tab, onTab }: { account: PersonalAccount; month: string; tab: Tab | null; onTab: (t: Tab | null) => void }) {
  const toggle = (t: Tab) => onTab(tab === t ? null : t);
  const adj = num(a.adjustments);

  return (
    <li data-testid="account-row" className="px-5 py-3.5">
      <div className={GRID}>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <p className="truncate font-medium text-foreground">{a.name}</p>
          {!a.active && <p className="text-xs text-muted-foreground">Opens {dmy(a.opening_date)}</p>}
        </div>
        {a.active ? (
          <>
            <Money label="Start of month" value={rupees(num(a.month_opening))} />
            <Money label="Funds added" value={rupees(num(a.funds))} note={adj !== 0 ? `adjusted ${signed(adj)}` : undefined} />
            <Money label="Spent" value={rupees(num(a.spent))} />
            <Money label="Balance" value={rupees(num(a.closing))} strong testId="account-balance" tone={num(a.closing) < 0 ? OVER : undefined} />
          </>
        ) : <div className="col-span-2 lg:col-span-4" />}
        {a.active && (
          <div className="col-span-2 flex flex-wrap items-center gap-1.5 lg:col-span-1 lg:flex-nowrap lg:justify-end">
            <Button variant="outline" size="sm" aria-expanded={tab === "fund"} onClick={() => toggle("fund")}><Plus className="mr-1 h-3.5 w-3.5" /> Add fund</Button>
            <Button variant="outline" size="sm" aria-expanded={tab === "bank"} onClick={() => toggle("bank")}><Landmark className="mr-1 h-3.5 w-3.5" /> Match bank</Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 lg:h-7 lg:w-7" aria-label={`History of ${a.name}`} title="Funds and adjustments" aria-expanded={tab === "history"} onClick={() => toggle("history")}><Clock className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 lg:h-7 lg:w-7" aria-label={`Edit ${a.name}`} title="Rename, opening balance, delete" aria-expanded={tab === "edit"} onClick={() => toggle("edit")}><Pencil className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      </div>
      {tab && a.active && (
        <div data-testid="account-panel" data-tab={tab} className="mt-3 rounded-lg bg-secondary/60 p-4">
          {tab === "fund" && <AddFundForm account={a} onDone={() => onTab(null)} />}
          {tab === "bank" && <MatchBankForm account={a} month={month} onDone={() => onTab(null)} />}
          {tab === "history" && <History account={a} />}
          {tab === "edit" && <EditForm account={a} onDone={() => onTab(null)} />}
        </div>
      )}
    </li>
  );
}

function AddAccountForm({ month, onDone }: { month: string; onDone: () => void }) {
  const { create } = useAccountActions();
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("");
  const [date, setDate] = useState(month >= keyOf(new Date()) ? firstOfMonthIso(keyOf(new Date())) : firstOfMonthIso(month));
  const [tried, setTried] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setTried(true); return; }
    create.mutate({ name: name.trim(), opening_balance: Number(opening) || 0, opening_date: date }, {
      onSuccess: () => { toast.success(`${name.trim()} added`); onDone(); },
    });
  };

  return (
    <form data-testid="add-account-form" onSubmit={submit} className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Add an expense account</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <label htmlFor="new-account-name" className={FIELD}>Name</label>
          <Input id="new-account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC expenses" autoFocus aria-invalid={tried && !name.trim()} maxLength={60} />
          {tried && !name.trim() && <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-400">Give the account a name.</p>}
        </div>
        <div>
          <span className={FIELD}>Balance at the start of</span>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div>
          <label htmlFor="new-account-balance" className={FIELD}>It held</label>
          <Input id="new-account-balance" type="number" inputMode="decimal" className={AMOUNT_BOX} value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Funds and expenses from that day on count towards the balance. Use the bank balance at the start of the month you begin in TickBook.</p>
      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>Add account</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function AddFundForm({ account, onDone }: { account: PersonalAccount; onDone: () => void }) {
  const { addFund } = useAccountActions();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);
  const bad = !(Number(amount) > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (bad) { setTried(true); return; }
    addFund.mutate({ id: account.id, amount: Number(amount), date, notes: notes.trim() || null }, {
      onSuccess: () => { toast.success(`${rupees(Number(amount))} added to ${account.name}`); onDone(); },
    });
  };

  return (
    <form data-testid="fund-form" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-[10rem_auto_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label htmlFor={`fund-amount-${account.id}`} className={FIELD}>Amount added</label>
          <Input id={`fund-amount-${account.id}`} type="number" inputMode="decimal" min={0} className={AMOUNT_BOX} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus aria-invalid={tried && bad} />
        </div>
        <div>
          <span className={FIELD}>On</span>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div>
          <label htmlFor={`fund-note-${account.id}`} className={FIELD}>Note <span className="font-normal text-muted-foreground/70">(optional)</span></label>
          <Input id={`fund-note-${account.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Salary transfer" maxLength={120} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={addFund.isPending}>Add fund</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        </div>
      </div>
      {tried && bad && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-400">Enter an amount more than zero.</p>}
    </form>
  );
}

/** Type what the bank shows for a day; TickBook says whether it matches, and can record the difference so it does. */
function MatchBankForm({ account, month, onDone }: { account: PersonalAccount; month: string; onDone: () => void }) {
  const { reconcile } = useAccountActions();
  const current = month >= keyOf(new Date());
  const [bank, setBank] = useState("");
  const [asOf, setAsOf] = useState(current ? todayIso() : lastOfMonthIso(month));
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [tried, setTried] = useState(false);
  const missing = bank.trim() === "" || !Number.isFinite(Number(bank));

  const compare = (record: boolean) => {
    if (missing) { setTried(true); return; }
    reconcile.mutate({ id: account.id, bank_balance: Number(bank), as_of: asOf, record }, {
      onSuccess: (r) => setResult(r.data),
    });
  };
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setResult(null); };
  const diff = result ? num(result.difference) : 0;

  return (
    <div data-testid="bank-form">
      <form onSubmit={(e) => { e.preventDefault(); compare(false); }} className="grid gap-4 sm:grid-cols-[11rem_auto_auto] sm:items-end sm:justify-start">
        <div>
          <label htmlFor={`bank-balance-${account.id}`} className={FIELD}>Bank balance</label>
          <Input id={`bank-balance-${account.id}`} type="number" inputMode="decimal" className={AMOUNT_BOX} value={bank} onChange={(e) => edit(setBank)(e.target.value)} placeholder="As the bank shows" autoFocus aria-invalid={tried && missing} />
        </div>
        <div>
          <span className={FIELD}>On</span>
          <DatePicker value={asOf} onChange={edit(setAsOf)} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={reconcile.isPending}>Compare</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>Close</Button>
        </div>
      </form>
      {tried && missing && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-400">Type the balance the bank shows.</p>}

      {result && (
        <div data-testid="bank-result" role="status" className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-card p-4">
          {result.matched || result.recorded
            ? <CheckCircle2 className={cn("mt-0.5 h-5 w-5 shrink-0", OK)} aria-hidden />
            : <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />}
          <div className="min-w-0 text-sm">
            {result.recorded ? (
              <p data-testid="bank-recorded"><span className="font-medium">Recorded.</span> {account.name} now shows {rupees(num(result.bank_balance))} on {dmy(result.as_of)}, the same as the bank.</p>
            ) : result.matched ? (
              <p data-testid="bank-matched"><span className="font-medium">It matches.</span> TickBook and the bank both show {rupees(num(result.bank_balance))} on {dmy(result.as_of)}.</p>
            ) : (
              <>
                <p data-testid="bank-differs">
                  <span className="font-medium">It does not match.</span> On {dmy(result.as_of)} TickBook shows <span className="font-mono tabular-nums">{rupees(num(result.tickbook_balance))}</span> and
                  the bank shows <span className="font-mono tabular-nums">{rupees(num(result.bank_balance))}</span>: the bank has <span className={cn("font-semibold", diff < 0 ? OVER : OK)}><span className="font-mono tabular-nums">{rupees(Math.abs(diff))}</span> {diff > 0 ? "more" : "less"}</span>.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {diff < 0 ? "Usually an expense that is not in TickBook yet: add it under Expenses with this account as Paid from. For a bank charge, record the difference." : "Usually money that came in and is not recorded as a fund, or a refund or interest."}
                </p>
                <Button size="sm" className="mt-3" disabled={reconcile.isPending} onClick={() => compare(true)}>Record {signed(diff)} so TickBook matches</Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function History({ account }: { account: PersonalAccount }) {
  const { data, isLoading } = useAccountEntries(account.id, true);
  const { deleteEntry } = useAccountActions();
  if (isLoading) return <div className="h-12 animate-pulse rounded bg-card/60" />;
  if (!data || data.length === 0) return <p data-testid="history-empty" className="text-sm text-muted-foreground">No funds yet. Use Add fund when you top {account.name} up.</p>;
  return (
    <ul data-testid="history" className="divide-y divide-border/70">
      {data.map((e) => (
        <li key={e.id} data-testid="history-row" className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0">
          <span className="w-24 shrink-0 text-muted-foreground">{dmy(e.date)}</span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{e.kind === "fund" ? "Fund" : "Bank adjustment"}</span>
            {e.notes && <span className="text-muted-foreground"> · {e.notes}</span>}
          </span>
          <span className={cn("font-mono tabular-nums", num(e.amount) < 0 ? OVER : "text-foreground")}>{signed(num(e.amount))}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove the ${e.kind === "fund" ? "fund" : "adjustment"} of ${rupees(num(e.amount))} on ${dmy(e.date)}`}
            disabled={deleteEntry.isPending} onClick={() => deleteEntry.mutate({ id: account.id, entryId: e.id })}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function EditForm({ account, onDone }: { account: PersonalAccount; onDone: () => void }) {
  const { update, remove } = useAccountActions();
  const [name, setName] = useState(account.name);
  const [opening, setOpening] = useState(String(num(account.opening_balance)));
  const [date, setDate] = useState(account.opening_date);
  const [confirming, setConfirming] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    update.mutate({ id: account.id, data: { name: name.trim(), opening_balance: Number(opening) || 0, opening_date: date } }, { onSuccess: onDone });
  };

  return (
    <div data-testid="edit-form">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label htmlFor={`edit-name-${account.id}`} className={FIELD}>Name</label>
          <Input id={`edit-name-${account.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>
        <div>
          <label htmlFor={`edit-opening-${account.id}`} className={FIELD}>Opening balance</label>
          <Input id={`edit-opening-${account.id}`} type="number" inputMode="decimal" className={AMOUNT_BOX} value={opening} onChange={(e) => setOpening(e.target.value)} />
        </div>
        <div>
          <span className={FIELD}>As of the start of</span>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={update.isPending || !name.trim()}>Save</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        </div>
      </form>
      <div className="mt-4 border-t border-border/70 pt-3">
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="rounded text-sm font-medium text-red-700 underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-red-400">
            Delete this account
          </button>
        ) : (
          <div data-testid="delete-confirm" role="alert" className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Delete {account.name}? Its funds are removed. Expenses paid from it stay, but no longer name an account.</span>
            <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(account.id, { onSuccess: () => toast.success(`${account.name} deleted`) })}>Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep it</Button>
          </div>
        )}
      </div>
    </div>
  );
}
