import { useState } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  useDebts, useCreateDebt, useUpdateDebt, useDeleteDebt,
  useRepayments, useCreateRepayment, useUpdateRepayment, useDeleteRepayment,
} from "@/hooks/useDebts";
import type { Debt, DebtRepayment } from "@/hooks/useDebts";
import { formatCurrency, formatDate } from "@/utils";

export default function DebtsPage() {
  const [selectedDebtId, setSelectedDebtId] = useSessionState<number | null>("debts.selectedDebtId", null);
  const [debtForm, setDebtForm] = useState<{ open: boolean; editing: Debt | null }>({ open: false, editing: null });
  const [confirmDeleteDebt, setConfirmDeleteDebt] = useState<Debt | null>(null);
  const [repaymentForm, setRepaymentForm] = useState<{ open: boolean; editing: DebtRepayment | null }>({ open: false, editing: null });
  const [confirmDeleteRepayment, setConfirmDeleteRepayment] = useState<DebtRepayment | null>(null);

  const { data: debts = [], isLoading: debtsLoading } = useDebts();
  const createDebt = useCreateDebt();
  const updateDebt = useUpdateDebt();
  const deleteDebt = useDeleteDebt();

  const { data: repayments = [], isLoading: repaymentsLoading } = useRepayments(selectedDebtId);
  const createRepayment = useCreateRepayment();
  const updateRepayment = useUpdateRepayment();
  const deleteRepayment = useDeleteRepayment();

  const selectedDebt = debts.find((d) => d.id === selectedDebtId) ?? null;
  const totalBorrowed = debts.reduce((s, d) => s + d.amount, 0);
  const totalOutstanding = debts.reduce((s, d) => s + d.balance, 0);

  const handleToggle = (id: number) => {
    setSelectedDebtId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Debts</h1>
          <p className="text-sm text-muted-foreground">
            Borrowed: {formatCurrency(totalBorrowed)} · Outstanding: {formatCurrency(totalOutstanding)} · {debts.length} lenders
          </p>
        </div>
        <Button onClick={() => setDebtForm({ open: true, editing: null })}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Lender
        </Button>
      </div>

      {/* Lenders Table */}
      <div className="glass-card overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Lender Details</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-8" />
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-20">Debt ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Lender Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Repaid</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Balance</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Notes</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {debtsLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-secondary rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : debts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    No debts recorded
                  </td>
                </tr>
              ) : (
                debts.map((d) => (
                  <tr
                    key={d.id}
                    className={`border-b border-border/50 transition-colors ${selectedDebtId === d.id ? "bg-primary/5" : "hover:bg-secondary/30"}`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(d.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {selectedDebtId === d.id
                          ? <ChevronDown className="h-4 w-4" />
                          : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{d.id}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(d.date)}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{d.lender_name}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{formatCurrency(d.amount)}</td>
                    <td className="px-4 py-3 text-green-400">{formatCurrency(d.total_repaid)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${d.balance > 0 ? "text-red-400" : "text-green-400"}`}>
                        {formatCurrency(d.balance)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{d.notes ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setDebtForm({ open: true, editing: d })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="destructive" size="icon" onClick={() => setConfirmDeleteDebt(d)}>
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

      {/* Repayments Panel */}
      {selectedDebt && (
        <div className="glass-card overflow-hidden p-0">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Repayments — {selectedDebt.lender_name}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total: {formatCurrency(selectedDebt.amount)} · Repaid: {formatCurrency(selectedDebt.total_repaid)} · Balance: {formatCurrency(selectedDebt.balance)}
              </p>
            </div>
            <Button size="sm" onClick={() => setRepaymentForm({ open: true, editing: null })}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Repayment
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-20">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Paid on that Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Notes</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {repaymentsLoading ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-secondary rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : repayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No repayments recorded yet
                    </td>
                  </tr>
                ) : (
                  repayments.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.id}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(r.date)}</td>
                      <td className="px-4 py-3 font-semibold text-green-400">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${r.balance > 0 ? "text-red-400" : "text-green-400"}`}>
                          {formatCurrency(r.balance)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{r.notes ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setRepaymentForm({ open: true, editing: r })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="destructive" size="icon" onClick={() => setConfirmDeleteRepayment(r)}>
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
      )}

      {/* Debt Form Modal */}
      {debtForm.open && (
        <DebtFormModal
          key={debtForm.editing?.id ?? "new-debt"}
          initial={debtForm.editing}
          onClose={() => setDebtForm({ open: false, editing: null })}
          onSave={(data) => {
            if (debtForm.editing) {
              updateDebt.mutate(
                { id: debtForm.editing.id, data },
                { onSuccess: () => setDebtForm({ open: false, editing: null }) }
              );
            } else {
              createDebt.mutate(data, { onSuccess: () => setDebtForm({ open: false, editing: null }) });
            }
          }}
        />
      )}

      {/* Repayment Form Modal */}
      {repaymentForm.open && selectedDebtId !== null && (
        <RepaymentFormModal
          key={repaymentForm.editing?.id ?? "new-repayment"}
          initial={repaymentForm.editing}
          onClose={() => setRepaymentForm({ open: false, editing: null })}
          onSave={(data) => {
            if (repaymentForm.editing) {
              updateRepayment.mutate(
                { debtId: selectedDebtId, repaymentId: repaymentForm.editing.id, data },
                { onSuccess: () => setRepaymentForm({ open: false, editing: null }) }
              );
            } else {
              createRepayment.mutate(
                { debtId: selectedDebtId, data },
                { onSuccess: () => setRepaymentForm({ open: false, editing: null }) }
              );
            }
          }}
        />
      )}

      {/* Delete Debt Confirm */}
      {confirmDeleteDebt && (
        <ConfirmDialog
          title="Delete Debt"
          message={`Delete debt from "${confirmDeleteDebt.lender_name}" (${formatCurrency(confirmDeleteDebt.amount)})? All repayments will also be deleted.`}
          onCancel={() => setConfirmDeleteDebt(null)}
          onConfirm={() => {
            deleteDebt.mutate(confirmDeleteDebt.id, {
              onSuccess: () => {
                if (selectedDebtId === confirmDeleteDebt.id) setSelectedDebtId(null);
                setConfirmDeleteDebt(null);
              },
            });
          }}
        />
      )}

      {/* Delete Repayment Confirm */}
      {confirmDeleteRepayment && selectedDebtId !== null && (
        <ConfirmDialog
          title="Delete Repayment"
          message={`Delete repayment of ${formatCurrency(confirmDeleteRepayment.amount)} on ${formatDate(confirmDeleteRepayment.date)}?`}
          onCancel={() => setConfirmDeleteRepayment(null)}
          onConfirm={() => {
            deleteRepayment.mutate(
              { debtId: selectedDebtId, repaymentId: confirmDeleteRepayment.id },
              { onSuccess: () => setConfirmDeleteRepayment(null) }
            );
          }}
        />
      )}
    </div>
  );
}

// ── Debt Form Modal ────────────────────────────────────────────────────────

function DebtFormModal({
  initial, onClose, onSave,
}: {
  initial: Debt | null;
  onClose: () => void;
  onSave: (data: object) => void;
}) {
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split("T")[0]);
  const [lenderName, setLenderName] = useState(initial?.lender_name ?? "");
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <Modal open onClose={onClose} title={initial ? "Edit Debt" : "Add Lender"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ date, lender_name: lenderName, amount: Number(amount), notes: notes || null });
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Lender Name</label>
          <Input value={lenderName} onChange={(e) => setLenderName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Amount</label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional..." />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Repayment Form Modal ───────────────────────────────────────────────────

function RepaymentFormModal({
  initial, onClose, onSave,
}: {
  initial: DebtRepayment | null;
  onClose: () => void;
  onSave: (data: object) => void;
}) {
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <Modal open onClose={onClose} title={initial ? "Edit Repayment" : "Add Repayment"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ date, amount: Number(amount), notes: notes || null });
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Paid on this Date</label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional..." />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Confirm Dialog ─────────────────────────────────────────────────────────

function ConfirmDialog({
  title, message, onCancel, onConfirm,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h3 className="font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  );
}
