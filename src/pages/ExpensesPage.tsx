import { useState } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { useIsMobile } from "@/hooks/useBreakpoint";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Receipt, AlertCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { DatePicker } from "@/components/ui/DatePicker";
import { useExpenses, useCreateExpense, useUpdateExpense, useDeleteExpense } from "@/hooks/useExpenses";
import { useUnclaimedBalances, useCreateUnclaimedBalance, useDeleteUnclaimedBalance } from "@/hooks/useUnclaimedBalances";
import type { UnclaimedBalance } from "@/hooks/useUnclaimedBalances";
import { useDefaultedBalances, useCreateDefaultedBalance, useDeleteDefaultedBalance } from "@/hooks/useDefaultedBalances";
import type { DefaultedBalance } from "@/hooks/useDefaultedBalances";
import { unclaimedBalancesApi, defaultedBalancesApi } from "@/services/api";
import { formatCurrency, formatDate } from "@/utils";
import { cn } from "@/utils";
import type { Expense } from "@/types";

type Section = "expenses" | "unclaimed" | "defaulted";

export default function AccountAdjustmentsPage() {
  const [section, setSection] = useSessionState<Section>("expenses.section", "expenses");
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="space-y-4 pb-28">
        {/* Tab bar */}
        <div className="flex rounded-xl border border-border overflow-hidden bg-card">
          {([
            { key: "expenses",  icon: Receipt,     label: "Expenses"  },
            { key: "unclaimed", icon: AlertCircle, label: "Unclaimed" },
            { key: "defaulted", icon: ShieldAlert, label: "Defaulted" },
          ] as { key: Section; icon: React.ElementType; label: string }[]).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
                section === key
                  ? key === "expenses"
                    ? "bg-foreground/10 text-foreground"
                    : key === "unclaimed"
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-red-500/15 text-red-600 dark:text-red-400"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {section === "expenses"  && <ExpensesSection  isMobile />}
        {section === "unclaimed" && <UnclaimedBalancesSection isMobile />}
        {section === "defaulted" && <DefaultedBalancesSection isMobile />}
      </div>
    );
  }

  // ── Desktop layout ──────────────────────────────────────────────────────
  return (
    <div className="flex h-full gap-0 -m-6">
      <aside className="w-52 shrink-0 border-r border-border bg-card flex flex-col py-4 px-2 gap-1">
        <p className="px-3 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Account Adjustments
        </p>
        <NavItem active={section === "expenses"}  onClick={() => setSection("expenses")}>
          <Receipt className="h-4 w-4" /> Add Expense
        </NavItem>
        <NavItem active={section === "unclaimed"} onClick={() => setSection("unclaimed")}>
          <AlertCircle className="h-4 w-4" /> Unclaimed Amount
        </NavItem>
        <NavItem active={section === "defaulted"} onClick={() => setSection("defaulted")}>
          <ShieldAlert className="h-4 w-4" /> Defaulted Amount
        </NavItem>
      </aside>
      <div className="flex-1 overflow-y-auto p-6">
        {section === "expenses"  && <ExpensesSection />}
        {section === "unclaimed" && <UnclaimedBalancesSection />}
        {section === "defaulted" && <DefaultedBalancesSection />}
      </div>
    </div>
  );
}

function NavItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium w-full text-left transition-all",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ─── Expenses Section ─────────────────────────────────────────────────────────

function ExpensesSection({ isMobile = false }: { isMobile?: boolean }) {
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("desc");

  const { data: expenses = [], isLoading } = useExpenses();
  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense();
  const deleteMutation = useDeleteExpense();

  const sorted = [...(expenses as Expense[])].sort((a, b) => {
    const cmp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const total = (expenses as Expense[]).reduce((s, e) => s + Number(e.amount), 0);

  const handleSave = (data: object) => {
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else         createMutation.mutate(data);
    setShowForm(false);
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn("font-bold text-foreground", isMobile ? "text-lg" : "text-xl")}>Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Total: <span className="text-red-400 font-semibold">{formatCurrency(total)}</span>
            {" · "}{(expenses as Expense[]).length} records
          </p>
        </div>
        {!isMobile && (
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Expense
          </Button>
        )}
      </div>

      {/* Mobile: card list */}
      {isMobile ? (
        isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2 animate-pulse">
                <div className="flex justify-between"><div className="h-4 w-24 bg-secondary rounded" /><div className="h-4 w-16 bg-secondary rounded" /></div>
                <div className="h-6 w-32 bg-secondary rounded" />
                <div className="h-3 w-40 bg-secondary rounded" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 flex flex-col items-center gap-2 text-muted-foreground/50">
            <Receipt className="h-8 w-8" />
            <p className="text-sm">No expenses yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Sort toggle */}
            <button
              onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Date {sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {sorted.map((e) => (
              <div key={e.id} className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-card/80">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground font-mono">#{e.id}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(e.date)}</span>
                    </div>
                    <p className="text-xl font-bold text-red-400">{formatCurrency(Number(e.amount))}</p>
                    {e.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{e.notes}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setEditing(e); setShowForm(true); }}
                      className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(e)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Desktop: table */
        <div className="glass-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-20">Exp. ID</th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
                  >
                    <span className="flex items-center gap-1">
                      Date {sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Notes</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[...Array(5)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>)}
                    </tr>
                  ))
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No expenses recorded</td></tr>
                ) : sorted.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{e.id}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(e.date)}</td>
                    <td className="px-4 py-3 font-semibold text-red-400">{formatCurrency(Number(e.amount))}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{e.notes ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditing(e); setShowForm(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="destructive" size="icon" onClick={() => setConfirmDelete(e)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile FAB */}
      {isMobile && (
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="fixed right-4 bottom-[104px] z-50 h-14 w-14 flex items-center justify-center rounded-full bg-foreground text-background shadow-2xl shadow-foreground/20 transition-all active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <ExpenseFormModal
        key={editing?.id ?? "new"}
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        initial={editing}
        onSave={handleSave}
      />

      <DeleteConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Expense"
        description={confirmDelete ? `Remove expense #${confirmDelete.id} — ${formatCurrency(Number(confirmDelete.amount))} on ${formatDate(confirmDelete.date)}?` : ""}
        onConfirm={() => { if (confirmDelete) { deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null); } }}
      />
    </div>
  );
}

// ─── Unclaimed Balances Section ───────────────────────────────────────────────

function UnclaimedBalancesSection({ isMobile = false }: { isMobile?: boolean }) {
  const [showForm, setShowForm]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<UnclaimedBalance | null>(null);

  const { data: records = [], isLoading } = useUnclaimedBalances();
  const createMutation = useCreateUnclaimedBalance();
  const deleteMutation = useDeleteUnclaimedBalance();

  const total = records.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn("font-bold text-foreground", isMobile ? "text-lg" : "text-xl")}>Unclaimed Amount</h1>
          <p className="text-sm text-muted-foreground">
            Total: <span className="text-amber-400 font-semibold">{formatCurrency(total)}</span>
            {" · "}{records.length} records
          </p>
        </div>
        {!isMobile && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Record
          </Button>
        )}
      </div>

      {isMobile ? (
        isLoading ? (
          <BalanceCardSkeleton />
        ) : records.length === 0 ? (
          <EmptyState icon={AlertCircle} label="No unclaimed amounts" />
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <BalanceCard
                key={r.id}
                id={r.id}
                customerName={r.customer_name}
                customerId={r.customer_id}
                product={r.product}
                amount={Number(r.amount)}
                date={r.date}
                notes={r.notes}
                amountColor="text-amber-400"
                onDelete={() => setConfirmDelete(r)}
              />
            ))}
          </div>
        )
      ) : (
        <div className="glass-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["ID","Date","Product","Cust. ID","Customer Name","Amount","Notes",""].map((h, i) => (
                    <th key={i} className={cn("px-4 py-3 text-xs font-medium text-muted-foreground", i === 7 ? "text-right" : "text-left", i === 0 ? "w-16" : "")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[...Array(8)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>)}
                    </tr>
                  ))
                ) : records.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No unclaimed amounts recorded</td></tr>
                ) : records.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.id}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.date)}</td>
                    <td className="px-4 py-3">
                      <ProductBadge product={r.product} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.customer_id ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.customer_name ?? <span className="text-muted-foreground italic">Unknown</span>}</td>
                    <td className="px-4 py-3 font-semibold text-amber-400">{formatCurrency(Number(r.amount))}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{r.notes ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button variant="destructive" size="icon" onClick={() => setConfirmDelete(r)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isMobile && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed right-4 bottom-[104px] z-50 h-14 w-14 flex items-center justify-center rounded-full bg-amber-500 text-white shadow-2xl shadow-amber-500/30 transition-all active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {showForm && (
        <UnclaimedBalanceFormModal
          onClose={() => setShowForm(false)}
          onSave={(data) => createMutation.mutate(data, { onSuccess: () => setShowForm(false) })}
        />
      )}

      <DeleteConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Unclaimed Amount"
        description={confirmDelete ? `Remove unclaimed amount${confirmDelete.customer_name ? ` for ${confirmDelete.customer_name}` : ""} — ${formatCurrency(Number(confirmDelete.amount))}?` : ""}
        onConfirm={() => { if (confirmDelete) { deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null); } }}
      />
    </div>
  );
}

// ─── Defaulted Balances Section ───────────────────────────────────────────────

function DefaultedBalancesSection({ isMobile = false }: { isMobile?: boolean }) {
  const [showForm, setShowForm]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DefaultedBalance | null>(null);

  const { data: records = [], isLoading } = useDefaultedBalances();
  const createMutation = useCreateDefaultedBalance();
  const deleteMutation = useDeleteDefaultedBalance();

  const total = records.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn("font-bold text-foreground", isMobile ? "text-lg" : "text-xl")}>Defaulted Amount</h1>
          <p className="text-sm text-muted-foreground">
            Total: <span className="text-red-400 font-semibold">{formatCurrency(total)}</span>
            {" · "}{records.length} records
          </p>
        </div>
        {!isMobile && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Record
          </Button>
        )}
      </div>

      {isMobile ? (
        isLoading ? (
          <BalanceCardSkeleton />
        ) : records.length === 0 ? (
          <EmptyState icon={ShieldAlert} label="No defaulted amounts" />
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <BalanceCard
                key={r.id}
                id={r.id}
                customerName={r.customer_name}
                customerId={r.customer_id}
                product={r.product}
                amount={Number(r.amount)}
                date={r.date}
                notes={r.notes}
                amountColor="text-red-400"
                onDelete={() => setConfirmDelete(r)}
              />
            ))}
          </div>
        )
      ) : (
        <div className="glass-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["ID","Date","Product","Cust. ID","Customer Name","Amount","Notes",""].map((h, i) => (
                    <th key={i} className={cn("px-4 py-3 text-xs font-medium text-muted-foreground", i === 7 ? "text-right" : "text-left", i === 0 ? "w-16" : "")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[...Array(8)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>)}
                    </tr>
                  ))
                ) : records.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No defaulted amounts recorded</td></tr>
                ) : records.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.id}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.date)}</td>
                    <td className="px-4 py-3"><ProductBadge product={r.product} /></td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.customer_id ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.customer_name ?? <span className="text-muted-foreground italic">Unknown</span>}</td>
                    <td className="px-4 py-3 font-semibold text-red-400">{formatCurrency(Number(r.amount))}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{r.notes ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button variant="destructive" size="icon" onClick={() => setConfirmDelete(r)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isMobile && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed right-4 bottom-[104px] z-50 h-14 w-14 flex items-center justify-center rounded-full bg-red-500 text-white shadow-2xl shadow-red-500/30 transition-all active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {showForm && (
        <DefaultedBalanceFormModal
          onClose={() => setShowForm(false)}
          onSave={(data) => createMutation.mutate(data, { onSuccess: () => setShowForm(false) })}
        />
      )}

      <DeleteConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Defaulted Amount"
        description={confirmDelete ? `Remove defaulted amount${confirmDelete.customer_name ? ` for ${confirmDelete.customer_name}` : ""} — ${formatCurrency(Number(confirmDelete.amount))}?` : ""}
        onConfirm={() => { if (confirmDelete) { deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null); } }}
      />
    </div>
  );
}

// ─── Shared mobile components ─────────────────────────────────────────────────

function ProductBadge({ product }: { product: string }) {
  return (
    <span className={cn(
      "text-xs font-semibold px-2 py-0.5 rounded-full",
      product === "edi" ? "bg-primary/25 text-foreground/65" : "bg-accent/60 text-foreground/65"
    )}>
      {product.toUpperCase()}
    </span>
  );
}

function BalanceCard({
  id, customerName, customerId, product, amount, date, notes, amountColor, onDelete,
}: {
  id: number;
  customerName: string | null;
  customerId: number | null;
  product: string;
  amount: number;
  date: string;
  notes?: string | null;
  amountColor: string;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-semibold text-foreground truncate">{customerName ?? <span className="italic text-muted-foreground font-normal">Unknown</span>}</p>
            <ProductBadge product={product} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            {customerId != null && <><span>#{customerId}</span><span>·</span></>}
            <span>{formatDate(date)}</span>
          </div>
          <p className={cn("text-xl font-bold", amountColor)}>{formatCurrency(amount)}</p>
          {notes && <p className="text-xs text-muted-foreground mt-1 truncate">{notes}</p>}
        </div>
        <button
          onClick={onDelete}
          className="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function BalanceCardSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2 animate-pulse">
          <div className="flex justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-36 bg-secondary rounded" />
              <div className="h-3 w-24 bg-secondary rounded" />
              <div className="h-6 w-28 bg-secondary rounded" />
            </div>
            <div className="h-9 w-9 bg-secondary rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border py-16 flex flex-col items-center gap-2 text-muted-foreground/50">
      <Icon className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function DeleteConfirmDialog({
  open, onClose, title, description, onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h3 className="font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-5">{description}</p>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Expense form modal ───────────────────────────────────────────────────────

function ExpenseFormModal({
  open, onClose, initial, onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: Expense | null;
  onSave: (data: object) => void;
}) {
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [date,   setDate]   = useState(initial?.date ?? new Date().toISOString().split("T")[0]);
  const [notes,  setNotes]  = useState(initial?.notes ?? "");

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit Expense" : "Add Expense"}>
      <form onSubmit={(e) => { e.preventDefault(); onSave({ amount: Number(amount), date, notes: notes || null }); }} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Amount</label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." />
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Unclaimed balance form modal ─────────────────────────────────────────────

function UnclaimedBalanceFormModal({ onClose, onSave }: { onClose: () => void; onSave: (data: object) => void }) {
  const [date,         setDate]         = useState(new Date().toISOString().split("T")[0]);
  const [product,      setProduct]      = useState<"edi" | "iop">("edi");
  const [customerId,   setCustomerId]   = useState("");
  const [customerName, setCustomerName] = useState("");
  const [lookingUp,    setLookingUp]    = useState(false);
  const [lookupError,  setLookupError]  = useState("");
  const [amount,       setAmount]       = useState("");
  const [notes,        setNotes]        = useState("");

  const lookup = async () => {
    const id = parseInt(customerId, 10);
    if (!id) return;
    setLookingUp(true); setLookupError(""); setCustomerName("");
    try {
      const res = await unclaimedBalancesApi.lookupName(id, product);
      setCustomerName(res.data.customer_name || "");
      if (!res.data.customer_name) setLookupError("Name not found");
    } catch { setLookupError("Customer not found"); }
    finally  { setLookingUp(false); }
  };

  return (
    <Modal open onClose={onClose} title="Add Unclaimed Amount">
      <form onSubmit={(e) => {
        e.preventDefault();
        onSave({
          date, product,
          customer_id: customerId ? parseInt(customerId, 10) : null,
          customer_name: customerName || null,
          amount: Number(amount),
          notes: notes || null,
        });
      }} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Product</label>
          <div className="flex gap-2">
            {(["edi", "iop"] as const).map((p) => (
              <button key={p} type="button" onClick={() => { setProduct(p); setCustomerName(""); setLookupError(""); }}
                className={cn("flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
                  product === p ? "border-foreground/20 bg-foreground/10 text-foreground font-semibold" : "border-border text-muted-foreground hover:bg-muted")}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Customer ID <span className="text-muted-foreground/50">(optional)</span></label>
          <Input type="number" value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setCustomerName(""); setLookupError(""); }}
            onBlur={lookup} placeholder="Enter ID to auto-fetch name" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Customer Name <span className="text-muted-foreground/50">(optional)</span></label>
          <Input value={lookingUp ? "Looking up…" : customerName}
            onChange={(e) => !lookingUp && setCustomerName(e.target.value)}
            placeholder="Auto-fetched or type manually"
            className={cn(lookupError ? "border-red-500" : "")} />
          {lookupError && <p className="text-xs text-red-400 mt-1">{lookupError}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Amount</label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." />
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={lookingUp}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Defaulted balance form modal ─────────────────────────────────────────────

function DefaultedBalanceFormModal({ onClose, onSave }: { onClose: () => void; onSave: (data: object) => void }) {
  const [date,         setDate]         = useState(new Date().toISOString().split("T")[0]);
  const [product,      setProduct]      = useState<"edi" | "iop">("edi");
  const [customerId,   setCustomerId]   = useState("");
  const [customerName, setCustomerName] = useState("");
  const [lookingUp,    setLookingUp]    = useState(false);
  const [lookupError,  setLookupError]  = useState("");
  const [amount,       setAmount]       = useState("");
  const [notes,        setNotes]        = useState("");

  const lookup = async () => {
    const id = parseInt(customerId, 10);
    if (!id) return;
    setLookingUp(true); setLookupError(""); setCustomerName("");
    try {
      const res = await defaultedBalancesApi.lookupName(id, product);
      setCustomerName(res.data.customer_name || "");
      if (!res.data.customer_name) setLookupError("Name not found");
    } catch { setLookupError("Customer not found"); }
    finally  { setLookingUp(false); }
  };

  return (
    <Modal open onClose={onClose} title="Add Defaulted Amount">
      <form onSubmit={(e) => {
        e.preventDefault();
        onSave({
          date, product,
          customer_id: customerId ? parseInt(customerId, 10) : null,
          customer_name: customerName || null,
          amount: Number(amount),
          notes: notes || null,
        });
      }} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Product</label>
          <div className="flex gap-2">
            {(["edi", "iop"] as const).map((p) => (
              <button key={p} type="button" onClick={() => { setProduct(p); setCustomerName(""); setLookupError(""); }}
                className={cn("flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
                  product === p ? "border-foreground/20 bg-foreground/10 text-foreground font-semibold" : "border-border text-muted-foreground hover:bg-muted")}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Customer ID <span className="text-muted-foreground/50">(optional)</span></label>
          <Input type="number" value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setCustomerName(""); setLookupError(""); }}
            onBlur={lookup} placeholder="Enter ID to auto-fetch name" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Customer Name <span className="text-muted-foreground/50">(optional)</span></label>
          <Input value={lookingUp ? "Looking up…" : customerName}
            onChange={(e) => !lookingUp && setCustomerName(e.target.value)}
            placeholder="Auto-fetched or type manually"
            className={cn(lookupError ? "border-red-500" : "")} />
          {lookupError && <p className="text-xs text-red-400 mt-1">{lookupError}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Amount</label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." />
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={lookingUp}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
