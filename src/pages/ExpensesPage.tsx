import { useState } from "react";
import { useSessionState } from "@/hooks/useSessionState";
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

  return (
    <div className="flex h-full gap-0 -m-6">
      {/* Left nav */}
      <aside className="w-52 shrink-0 border-r border-border bg-card flex flex-col py-4 px-2 gap-1">
        <p className="px-3 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Account Adjustments
        </p>
        <NavItem active={section === "expenses"} onClick={() => setSection("expenses")}>
          <Receipt className="h-4 w-4" /> Add Expense
        </NavItem>
        <NavItem active={section === "unclaimed"} onClick={() => setSection("unclaimed")}>
          <AlertCircle className="h-4 w-4" /> Unclaimed Balances
        </NavItem>
        <NavItem active={section === "defaulted"} onClick={() => setSection("defaulted")}>
          <ShieldAlert className="h-4 w-4" /> Defaulted Balances
        </NavItem>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        {section === "expenses" && <ExpensesSection />}
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
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ─── Expenses Section ─────────────────────────────────────────────────────

function ExpensesSection() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: expenses = [], isLoading } = useExpenses();
  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense();
  const deleteMutation = useDeleteExpense();

  const sortedExpenses = [...(expenses as Expense[])].sort((a, b) => {
    const cmp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalExpense = (expenses as Expense[]).reduce((s, e) => s + Number(e.amount), 0);

  const handleSave = (data: object) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
    setShowForm(false);
    setEditing(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Total: {formatCurrency(totalExpense)} · {(expenses as Expense[]).length} records
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Expense
        </Button>
      </div>

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
                    Date
                    {sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
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
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-secondary rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sortedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    No expenses recorded
                  </td>
                </tr>
              ) : (
                sortedExpenses.map((e) => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ExpenseFormModal
        key={editing?.id ?? "new"}
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        initial={editing}
        onSave={handleSave}
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="font-semibold text-foreground mb-2">Delete Expense</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Remove expense{" "}
              <span className="font-medium text-foreground">
                #{confirmDelete.id} — {formatCurrency(Number(confirmDelete.amount))} on {formatDate(confirmDelete.date)}
              </span>?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null); }}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpenseFormModal({
  open, onClose, initial, onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: Expense | null;
  onSave: (data: object) => void;
}) {
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ amount: Number(amount), date, notes: notes || null });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit Expense" : "Add Expense"}>
      <form onSubmit={handleSubmit} className="space-y-4">
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
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Unclaimed Balances Section ───────────────────────────────────────────

function UnclaimedBalancesSection() {
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<UnclaimedBalance | null>(null);

  const { data: records = [], isLoading } = useUnclaimedBalances();
  const createMutation = useCreateUnclaimedBalance();
  const deleteMutation = useDeleteUnclaimedBalance();

  const total = records.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Unclaimed Balances</h1>
          <p className="text-sm text-muted-foreground">
            Total: {formatCurrency(total)} · {records.length} records
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Record
        </Button>
      </div>

      <div className="glass-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-16">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Cust. ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Customer Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Notes</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-secondary rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    No unclaimed balances recorded
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.id}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.date)}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        r.product === "edi"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-purple-500/15 text-purple-400"
                      )}>
                        {r.product.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.customer_id}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.customer_name}</td>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <UnclaimedBalanceFormModal
          onClose={() => setShowForm(false)}
          onSave={(data) => {
            createMutation.mutate(data, { onSuccess: () => setShowForm(false) });
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="font-semibold text-foreground mb-2">Delete Record</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Remove unclaimed balance for{" "}
              <span className="font-medium text-foreground">
                {confirmDelete.customer_name} — {formatCurrency(Number(confirmDelete.amount))}
              </span>?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null); }}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UnclaimedBalanceFormModal({
  onClose, onSave,
}: {
  onClose: () => void;
  onSave: (data: object) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [product, setProduct] = useState<"edi" | "iop">("edi");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const handleCustomerIdBlur = async () => {
    const id = parseInt(customerId, 10);
    if (!id) return;
    setLookingUp(true);
    setLookupError("");
    setCustomerName("");
    try {
      const res = await unclaimedBalancesApi.lookupName(id, product);
      setCustomerName(res.data.customer_name || "");
      if (!res.data.customer_name) setLookupError("Name not found");
    } catch {
      setLookupError("Customer not found");
    } finally {
      setLookingUp(false);
    }
  };

  const handleProductChange = (p: "edi" | "iop") => {
    setProduct(p);
    setCustomerName("");
    setLookupError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName) return;
    onSave({
      date,
      product,
      customer_id: parseInt(customerId, 10),
      amount: Number(amount),
      notes: notes || null,
    });
  };

  return (
    <Modal open onClose={onClose} title="Add Unclaimed Balance">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Product</label>
          <div className="flex gap-2">
            {(["edi", "iop"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleProductChange(p)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
                  product === p
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                )}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Customer ID</label>
          <Input
            type="number"
            value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setCustomerName(""); setLookupError(""); }}
            onBlur={handleCustomerIdBlur}
            placeholder="Enter ID then tab out to fetch name"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Customer Name</label>
          <Input
            value={lookingUp ? "Looking up…" : customerName}
            readOnly
            placeholder="Auto-fetched from customer ID"
            className={cn(lookupError ? "border-red-500" : "", "bg-secondary/50 cursor-not-allowed")}
          />
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

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!customerName || lookingUp}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Defaulted Balances Section ───────────────────────────────────────────

function DefaultedBalancesSection() {
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DefaultedBalance | null>(null);

  const { data: records = [], isLoading } = useDefaultedBalances();
  const createMutation = useCreateDefaultedBalance();
  const deleteMutation = useDeleteDefaultedBalance();

  const total = records.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Defaulted Balances</h1>
          <p className="text-sm text-muted-foreground">
            Total: {formatCurrency(total)} · {records.length} records
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Record
        </Button>
      </div>

      <div className="glass-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-16">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Cust. ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Customer Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Notes</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-secondary rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    No defaulted balances recorded
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.id}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.date)}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        r.product === "edi"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-purple-500/15 text-purple-400"
                      )}>
                        {r.product.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.customer_id}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.customer_name}</td>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <DefaultedBalanceFormModal
          onClose={() => setShowForm(false)}
          onSave={(data) => {
            createMutation.mutate(data, { onSuccess: () => setShowForm(false) });
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="font-semibold text-foreground mb-2">Delete Record</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Remove defaulted balance for{" "}
              <span className="font-medium text-foreground">
                {confirmDelete.customer_name} — {formatCurrency(Number(confirmDelete.amount))}
              </span>?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null); }}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DefaultedBalanceFormModal({
  onClose, onSave,
}: {
  onClose: () => void;
  onSave: (data: object) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [product, setProduct] = useState<"edi" | "iop">("edi");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const handleCustomerIdBlur = async () => {
    const id = parseInt(customerId, 10);
    if (!id) return;
    setLookingUp(true);
    setLookupError("");
    setCustomerName("");
    try {
      const res = await defaultedBalancesApi.lookupName(id, product);
      setCustomerName(res.data.customer_name || "");
      if (!res.data.customer_name) setLookupError("Name not found");
    } catch {
      setLookupError("Customer not found");
    } finally {
      setLookingUp(false);
    }
  };

  const handleProductChange = (p: "edi" | "iop") => {
    setProduct(p);
    setCustomerName("");
    setLookupError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName) return;
    onSave({
      date,
      product,
      customer_id: parseInt(customerId, 10),
      amount: Number(amount),
      notes: notes || null,
    });
  };

  return (
    <Modal open onClose={onClose} title="Add Defaulted Balance">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Product</label>
          <div className="flex gap-2">
            {(["edi", "iop"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleProductChange(p)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
                  product === p
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                )}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Customer ID</label>
          <Input
            type="number"
            value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setCustomerName(""); setLookupError(""); }}
            onBlur={handleCustomerIdBlur}
            placeholder="Enter ID then tab out to fetch name"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Customer Name</label>
          <Input
            value={lookingUp ? "Looking up…" : customerName}
            readOnly
            placeholder="Auto-fetched from customer ID"
            className={cn(lookupError ? "border-red-500" : "", "bg-secondary/50 cursor-not-allowed")}
          />
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

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!customerName || lookingUp}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
