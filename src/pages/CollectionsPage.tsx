import { useState, useEffect } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { useIsMobile } from "@/hooks/useBreakpoint";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { DatePicker } from "@/components/ui/DatePicker";
import { useTransactions, useCreateTransaction, useUpdateTransaction, useDeleteTransaction } from "@/hooks/useTransactions";
import { formatCurrency, toISODate } from "@/utils";
import type { ProductType, EdiTransaction, IopTransaction } from "@/types";

type AnyTxn = EdiTransaction | IopTransaction;

export default function CollectionsPage() {
  const [product, setProduct] = useSessionState<ProductType>("transactions.product", "edi");
  const [date, setDate] = useSessionState("transactions.date", toISODate(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AnyTxn | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnyTxn | null>(null);

  const { data: txns = [], isLoading } = useTransactions(product, date);
  const createMutation = useCreateTransaction(product);
  const updateMutation = useUpdateTransaction(product);
  const deleteMutation = useDeleteTransaction(product);

  const prevDay = () => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() - 1);
    setDate(toISODate(d));
  };

  const nextDay = () => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + 1);
    setDate(toISODate(d));
  };

  const totalAmount = (txns as AnyTxn[]).reduce((s, t) => s + Number(t.amount), 0);
  const isMobile = useIsMobile();

  const handleSave = (data: object) => {
    if (editing) {
      updateMutation.mutate({ id: editing.transaction_id, data });
      // Navigate to the new date if it changed so the record stays visible
      const newDate = (data as any).collection_date as string | undefined;
      if (newDate && newDate !== date) setDate(newDate);
    } else {
      createMutation.mutate(data);
      // Navigate to the date the new record was created on
      const newDate = (data as any).collection_date as string | undefined;
      if (newDate && newDate !== date) setDate(newDate);
    }
    setShowForm(false);
    setEditing(null);
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.transaction_id);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-foreground">Collections</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {(txns as AnyTxn[]).length} records · {formatCurrency(totalAmount)}
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} size={isMobile ? "sm" : "default"}>
          <Plus className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Add</span>
        </Button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["edi", "iop"] as ProductType[]).map((p) => (
            <button
              key={p}
              onClick={() => setProduct(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                product === p ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-1 flex-1 sm:flex-none justify-center sm:justify-start">
          <button
            onClick={prevDay}
            className="flex items-center justify-center h-9 w-9 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <DatePicker value={date} onChange={setDate} className="w-40 sm:w-44" />
          <button
            onClick={nextDay}
            disabled={date >= toISODate(new Date())}
            className="flex items-center justify-center h-9 w-9 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content: cards on mobile, table on desktop */}
      <div className="glass-card overflow-hidden p-0">
        {isMobile ? (
          /* ── Mobile card list ── */
          <div>
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="px-4 py-3 border-b border-border/50 space-y-2">
                  <div className="h-4 bg-secondary rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-secondary rounded animate-pulse w-1/3" />
                </div>
              ))
            ) : (txns as AnyTxn[]).length === 0 ? (
              <div className="px-4 py-12 text-center text-muted-foreground text-sm">
                No transactions for {date}
              </div>
            ) : (
              (txns as AnyTxn[]).map((t) => (
                <TransactionCardMobile
                  key={t.transaction_id}
                  txn={t}
                  onEdit={() => { setEditing(t); setShowForm(true); }}
                  onDelete={() => setDeleteTarget(t)}
                />
              ))
            )}
          </div>
        ) : (
          /* ── Desktop table ── */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Mode</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-secondary rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (txns as AnyTxn[]).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      No transactions for {date}
                    </td>
                  </tr>
                ) : (
                  (txns as AnyTxn[]).map((t) => (
                    <tr key={t.transaction_id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">{t.transaction_id}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground leading-tight">
                            {(t as any).customer_name || `#${t.customer_id}`}
                          </span>
                          {(t as any).customer_name_ta && (
                            <span className="text-xs text-muted-foreground leading-tight">{(t as any).customer_name_ta}</span>
                          )}
                          <span className="text-xs text-muted-foreground/60">ID: {t.customer_id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-400">{formatCurrency(Number(t.amount))}</td>
                      <td className="px-4 py-3">
                        <Badge variant={t.payment_mode === "CASH" ? "success" : "default"}>{t.payment_mode}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={t.payment_status === "PAID" ? "success" : "warning"}>{t.payment_status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setEditing(t); setShowForm(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="destructive" size="icon" onClick={() => setDeleteTarget(t)}>
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
        )}
      </div>

      {/* Form Modal */}
      <TransactionFormModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        initial={editing}
        onSave={handleSave}
        date={date}
      />

      {/* Custom Delete Confirmation Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Transaction">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-foreground">
                Delete transaction <span className="font-semibold">#{deleteTarget?.transaction_id}</span> for customer{" "}
                <span className="font-semibold">#{deleteTarget?.customer_id}</span>?
              </p>
              <p className="text-xs text-muted-foreground mt-1">This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Mobile transaction card ───────────────────────────────────────────────────
function TransactionCardMobile({
  txn: t,
  onEdit,
  onDelete,
}: {
  txn: AnyTxn;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="px-4 py-3 border-b border-border/50 active:bg-secondary/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground leading-tight">
            {(t as any).customer_name || `Customer #${t.customer_id}`}
          </p>
          {(t as any).customer_name_ta && (
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">
              {(t as any).customer_name_ta}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">ID: {t.customer_id}</p>
        </div>
        <p className="text-base font-bold text-emerald-400 flex-shrink-0">
          {formatCurrency(Number(t.amount))}
        </p>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          <Badge variant={t.payment_mode === "CASH" ? "success" : "default"}>
            {t.payment_mode}
          </Badge>
          <Badge variant={t.payment_status === "PAID" ? "success" : "warning"}>
            {t.payment_status}
          </Badge>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="destructive" size="icon" onClick={onDelete} className="h-8 w-8">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TransactionFormModal({
  open, onClose, initial, onSave, date,
}: {
  open: boolean;
  onClose: () => void;
  initial: AnyTxn | null;
  onSave: (data: object) => void;
  date: string;
}) {
  const [customerId, setCustomerId] = useState(String(initial?.customer_id ?? ""));
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [mode, setMode] = useState(initial?.payment_mode ?? "CASH");
  const [status, setStatus] = useState(initial?.payment_status ?? "PAID");
  const [editDate, setEditDate] = useState(initial?.collection_date ?? date);

  // Re-sync form fields when `initial` changes (e.g. switching between edit targets)
  useEffect(() => {
    setCustomerId(String(initial?.customer_id ?? ""));
    setAmount(String(initial?.amount ?? ""));
    setMode(initial?.payment_mode ?? "CASH");
    setStatus(initial?.payment_status ?? "PAID");
    setEditDate(initial?.collection_date ?? date);
  }, [initial, date]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      customer_id: Number(customerId),
      amount: Number(amount),
      payment_mode: mode,
      payment_status: status,
      collection_date: editDate,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit Transaction" : "Add Transaction"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Customer ID</label>
          {initial ? (
            <div className="flex h-9 w-full items-center rounded-lg border border-border bg-secondary/50 px-3 text-sm text-muted-foreground cursor-not-allowed select-none">
              {customerId}
            </div>
          ) : (
            <Input type="number" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required />
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Amount</label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Payment Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-border bg-secondary px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="CASH">CASH</option>
              <option value="ONLINE">ONLINE</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-border bg-secondary px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="PAID">PAID</option>
              <option value="PENDING">PENDING</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
          <DatePicker value={editDate} onChange={setEditDate} className="w-full" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
