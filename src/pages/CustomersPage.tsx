import { useState, useRef, useEffect, useCallback } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { useIsMobile } from "@/hooks/useBreakpoint";
import {
  Search, Plus, Pencil, Trash2, ChevronLeft, ChevronRight,
  ChevronUp, ChevronDown, Info, Filter, AlertTriangle, Share2, Copy,
  Undo2, Redo2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer,
} from "@/hooks/useCustomers";
import { customersApi } from "@/services/api";
import toast from "react-hot-toast";
import { formatCurrency } from "@/utils";
import type { ProductType, EdiCustomer, IopCustomer, EdiTransaction, IopTransaction } from "@/types";

export const PAGE_SIZE = 20;
export type SortDir = "asc" | "desc";

type HistoryEntry =
  | { type: "create"; formData: object; customerId: number; product: ProductType }
  | { type: "update"; id: number; before: object; after: object; product: ProductType }
  | { type: "delete"; customer: EdiCustomer | IopCustomer; resequence: boolean; product: ProductType };

export function deriveMonth(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function CustomersPage() {
  const [product, setProduct] = useSessionState<ProductType>("customers.product", "edi");
  const [search, setSearch] = useSessionState("customers.search", "");
  const [page, setPage] = useSessionState("customers.page", 0);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EdiCustomer | IopCustomer | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<EdiCustomer | IopCustomer | null>(null);
  const [sortBy, setSortBy] = useSessionState("customers.sortBy", "customer_id");
  const [sortDir, setSortDir] = useSessionState<SortDir>("customers.sortDir", "asc");
  const [balanceFilter, setBalanceFilter] = useSessionState("customers.balanceFilter", false);
  const [detailCustomer, setDetailCustomer] = useState<EdiCustomer | IopCustomer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string; customer: EdiCustomer | IopCustomer } | null>(null);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const qc = useQueryClient();

  const { data, isLoading } = useCustomers(product, {
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    search,
    sort_by: sortBy,
    sort_dir: sortDir,
    balance_gt_zero: balanceFilter,
  });

  const createMutation = useCreateCustomer(product);
  const updateMutation = useUpdateCustomer(product);
  const deleteMutation = useDeleteCustomer(product);

  const customers = (data?.data ?? []) as (EdiCustomer | IopCustomer)[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const isMobile = useIsMobile();

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
    setPage(0);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ChevronDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const handleEdit = (c: EdiCustomer | IopCustomer) => { setEditing(c); setDuplicateSource(null); setShowForm(true); };
  const handleDuplicate = (c: EdiCustomer | IopCustomer) => { setEditing(null); setDuplicateSource(c); setShowForm(true); };
  const handleDeleteClick = (id: number, name: string) => {
    const customer = customers.find((c) => c.customer_id === id);
    if (!customer) return;
    setConfirmDelete({ id, name, customer });
  };
  const handleDeleteConfirm = (resequence: boolean) => {
    if (!confirmDelete) return;
    setUndoStack((prev) => [...prev.slice(-2), { type: "delete", customer: confirmDelete.customer, resequence, product }]);
    setRedoStack([]);
    deleteMutation.mutate({ id: confirmDelete.id, resequence });
    setConfirmDelete(null);
  };
  const handleSave = (formData: object) => {
    if (editing) {
      const id = (editing as EdiCustomer).customer_id;
      setUndoStack((prev) => [...prev.slice(-2), { type: "update", id, before: { ...editing }, after: formData, product }]);
    } else {
      const customerId = Number((formData as Record<string, string>).customer_id);
      setUndoStack((prev) => [...prev.slice(-2), { type: "create", formData, customerId, product }]);
    }
    setRedoStack([]);
    if (editing) updateMutation.mutate({ id: (editing as EdiCustomer).customer_id, data: formData });
    else createMutation.mutate(formData);
    setShowForm(false);
    setEditing(null);
    setDuplicateSource(null);
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev.slice(-2), entry]);
    try {
      if (entry.type === "create") {
        const fn = entry.product === "edi" ? customersApi.deleteEdi : customersApi.deleteIop;
        await fn(entry.customerId, false);
      } else if (entry.type === "update") {
        const fn = entry.product === "edi" ? customersApi.updateEdi : customersApi.updateIop;
        await fn(entry.id, entry.before);
      } else if (entry.type === "delete") {
        if (entry.resequence) { toast.error("Cannot undo a re-sequenced delete"); setRedoStack((prev) => prev.slice(0, -1)); return; }
        const fn = entry.product === "edi" ? customersApi.createEdi : customersApi.createIop;
        await fn(entry.customer);
      }
      qc.invalidateQueries({ queryKey: ["customers", entry.product] });
      toast.success("Undone");
    } catch { toast.error("Undo failed"); }
  };

  const handleRedo = async () => {
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev.slice(-2), entry]);
    try {
      if (entry.type === "create") {
        const fn = entry.product === "edi" ? customersApi.createEdi : customersApi.createIop;
        await fn(entry.formData);
      } else if (entry.type === "update") {
        const fn = entry.product === "edi" ? customersApi.updateEdi : customersApi.updateIop;
        await fn(entry.id, entry.after);
      } else if (entry.type === "delete") {
        const fn = entry.product === "edi" ? customersApi.deleteEdi : customersApi.deleteIop;
        await fn(entry.customer.customer_id, false);
      }
      qc.invalidateQueries({ queryKey: ["customers", entry.product] });
      toast.success("Redone");
    } catch { toast.error("Redo failed"); }
  };

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-foreground">Customers</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{total} total</p>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Undo/Redo — icon-only on mobile */}
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo"
            className="relative flex items-center justify-center h-9 w-9 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Undo2 className="h-4 w-4" />
            {undoStack.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-foreground text-[9px] text-background flex items-center justify-center font-bold">
                {undoStack.length}
              </span>
            )}
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo"
            className="relative flex items-center justify-center h-9 w-9 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Redo2 className="h-4 w-4" />
            {redoStack.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-foreground text-[9px] text-background flex items-center justify-center font-bold">
                {redoStack.length}
              </span>
            )}
          </button>
          <Button onClick={() => { setEditing(null); setShowForm(true); }} size={isMobile ? "sm" : "default"}>
            <Plus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Add Customer</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["edi", "iop"] as ProductType[]).map((p) => (
              <button
                key={p}
                onClick={() => { setProduct(p); setPage(0); setBalanceFilter(false); }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  product === p ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setBalanceFilter((f) => !f); setPage(0); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              balanceFilter
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Balance &gt; 0</span>
          </button>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 w-full"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
      </div>

      {/* Content: cards on mobile, table on desktop */}
      <div className="glass-card overflow-hidden p-0">
        {isMobile ? (
          /* ── Mobile card list ── */
          <div>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="px-4 py-3 border-b border-border/50">
                  <div className="space-y-2">
                    <div className="h-4 bg-secondary rounded animate-pulse w-2/3" />
                    <div className="h-3 bg-secondary rounded animate-pulse w-1/2" />
                    <div className="h-3 bg-secondary rounded animate-pulse w-3/4" />
                  </div>
                </div>
              ))
            ) : customers.length === 0 ? (
              <div className="px-4 py-12 text-center text-muted-foreground text-sm">
                No customers found
              </div>
            ) : (
              customers.map((c) => (
                <CustomerCardMobile
                  key={c.customer_id}
                  customer={c}
                  product={product}
                  onNameClick={() => setDetailCustomer(c)}
                  onEdit={() => handleEdit(c)}
                  onDuplicate={() => handleDuplicate(c)}
                  onDelete={() => handleDeleteClick(c.customer_id, c.customer_name ?? `#${c.customer_id}`)}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("customer_id")}>
                    <span className="flex items-center gap-1">ID <SortIcon col="customer_id" /></span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("customer_name")}>
                    <span className="flex items-center gap-1">Name <SortIcon col="customer_name" /></span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tamil Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Loan Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {product === "edi" ? "Outstanding" : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("loan_start_date")}>
                    <span className="flex items-center gap-1">Start Date <SortIcon col="loan_start_date" /></span>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : customers.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No customers found</td></tr>
                ) : (
                  customers.map((c) => (
                    <CustomerRow
                      key={c.customer_id}
                      customer={c}
                      product={product}
                      onNameClick={() => setDetailCustomer(c)}
                      onEdit={() => handleEdit(c)}
                      onDuplicate={() => handleDuplicate(c)}
                      onDelete={() => handleDeleteClick(c.customer_id, c.customer_name ?? `#${c.customer_id}`)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} ({total} records)
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <CustomerFormModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); setDuplicateSource(null); }}
        product={product}
        initial={editing}
        duplicateFrom={duplicateSource}
        onSave={handleSave}
      />

      {detailCustomer && (
        <CustomerDetailModal
          customer={detailCustomer}
          product={product}
          onClose={() => setDetailCustomer(null)}
        />
      )}

      {confirmDelete && (
        <DeleteConfirmModal
          name={confirmDelete.name}
          onSimpleDelete={() => handleDeleteConfirm(false)}
          onResequenceDelete={() => handleDeleteConfirm(true)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ── Mobile Card ───────────────────────────────────────────────────────────────
export function CustomerCardMobile({ customer: c, product, onNameClick, onEdit, onDuplicate, onDelete }: {
  customer: EdiCustomer | IopCustomer;
  product: ProductType;
  onNameClick: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const ediC = c as EdiCustomer;
  const balanceValue = product === "edi"
    ? (ediC.outstanding_balance ? formatCurrency(Number(ediC.outstanding_balance)) : "—")
    : null;

  return (
    <div className="px-4 py-3 border-b border-border/50 active:bg-secondary/30 transition-colors">
      {/* Name + ID row */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <button
            onClick={onNameClick}
            className="font-semibold text-sm text-foreground hover:text-muted-foreground transition-colors text-left leading-tight"
          >
            {c.customer_name ?? "—"}
          </button>
          {c.tamil_name && (
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">{c.tamil_name}</p>
          )}
        </div>
        <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full flex-shrink-0">
          #{c.customer_id}
        </span>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground mb-2.5">
        {c.contact_number && <span>📞 {c.contact_number}</span>}
        <span>{c.loan_start_date ?? "—"}</span>
        <span>Loan: {c.loan_amount ? formatCurrency(Number(c.loan_amount)) : "—"}</span>
        {balanceValue !== null && <span>Bal: {balanceValue}</span>}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onDuplicate} className="h-8 px-2.5 text-xs">
          <Copy className="h-3.5 w-3.5 mr-1" /> Copy
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit} className="h-8 px-2.5 text-xs">
          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
        </Button>
        <Button variant="destructive" size="icon" onClick={onDelete} className="h-8 w-8">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────
export function CustomerRow({ customer: c, product, onNameClick, onEdit, onDuplicate, onDelete }: {
  customer: EdiCustomer | IopCustomer;
  product: ProductType;
  onNameClick: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopoverOpen(false);
    };
    if (popoverOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [popoverOpen]);

  const ediC = c as EdiCustomer;
  const iopC = c as IopCustomer;

  return (
    <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
      <td className="px-4 py-3 text-muted-foreground">{c.customer_id}</td>
      <td className="px-4 py-3">
        <button onClick={onNameClick} className="font-medium text-foreground hover:text-muted-foreground transition-colors text-left">
          {c.customer_name ?? "—"}
        </button>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{c.tamil_name || "—"}</td>
      <td className="px-4 py-3 text-muted-foreground">{c.contact_number ?? "—"}</td>
      <td className="px-4 py-3">{c.loan_amount ? formatCurrency(Number(c.loan_amount)) : "—"}</td>
      <td className="px-4 py-3">
        {product === "edi"
          ? (ediC.outstanding_balance ? formatCurrency(Number(ediC.outstanding_balance)) : "—")
          : ""}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{c.loan_start_date ?? "—"}</td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1 items-center">
          <div className="relative" ref={popoverRef}>
            <button
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              onClick={() => setPopoverOpen((v) => !v)}
              title="Address & Aadhaar"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            {popoverOpen && (
              <div className="absolute right-0 top-8 z-50 w-64 rounded-xl border border-border bg-card shadow-xl p-4 text-xs space-y-2">
                <div>
                  <span className="text-muted-foreground font-medium block mb-0.5">Address</span>
                  <span className="text-foreground">{c.customer_address || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium block mb-0.5">Aadhaar</span>
                  <span className="text-foreground">{c.proof_aadhaar || "—"}</span>
                </div>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onDuplicate} title="Duplicate customer"><Copy className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="destructive" size="icon" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </td>
    </tr>
  );
}

// ── Customer Detail Modal ─────────────────────────────────────────────────────
export function CustomerDetailModal({ customer, product, onClose }: {
  customer: EdiCustomer | IopCustomer;
  product: ProductType;
  onClose: () => void;
}) {
  const [txnFilter, setTxnFilter] = useState<"all" | "paid">("all");
  const [sharing, setSharing] = useState(false);
  const [pdfLang, setPdfLang] = useState<"ta" | "en">("ta");

  const { data: _txnsRaw, isLoading } = useQuery({
    queryKey: ["customer-txns", product, customer.customer_id],
    queryFn: async () => {
      const fn = product === "edi" ? customersApi.ediTransactions : customersApi.iopTransactions;
      const res = await fn(customer.customer_id);
      return res.data as (EdiTransaction | IopTransaction)[];
    },
  });
  const txns = Array.isArray(_txnsRaw) ? _txnsRaw : [];
  const filteredTxns = txnFilter === "paid" ? txns.filter((t) => t.payment_status === "PAID") : txns;

  const totalPaid = txns.filter((t) => t.payment_status === "PAID").reduce((s, t) => s + Number(t.amount), 0);
  const loanAmount = Number(customer.loan_amount || 0);
  // EDI outstanding = loan_amount minus total paid (computed from actual txns)
  const ediOutstanding = loanAmount - totalPaid;

  const fmtDate = (d?: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}-${m}-${y}`;
  };
  const fmtAmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  const englishName = customer.customer_name ?? "Customer";
  const tamilName = customer.tamil_name;
  const hasTamil = Boolean(tamilName);

  const modalTitle = hasTamil
    ? `#${customer.customer_id} — ${tamilName}`
    : `#${customer.customer_id} — ${englishName}`;
  const subTitle = hasTamil ? englishName : undefined;

  // EDI: 4 cards (Loan Start, Loan Amount, Total Paid, Outstanding)
  // IOP: 3 cards (no loan_closure)
  const statsCards = [
    { label: "Loan Start",   value: fmtDate(customer.loan_start_date) },
    { label: "Loan Amount",  value: fmtAmt(loanAmount) },
    { label: "Total Paid",   value: fmtAmt(totalPaid) },
    ...(product === "edi" ? [{ label: "Outstanding", value: fmtAmt(ediOutstanding) }] : []),
  ];

  const handleShare = async () => {
    setSharing(true);
    try {
      const res = await fetch(
        `/api/customers/${product}/${customer.customer_id}/export.pdf?lang=${pdfLang}&filter=${txnFilter}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          detail = body.detail ?? JSON.stringify(body);
        } catch {
          detail = await res.text().catch(() => `HTTP ${res.status}`);
        }
        alert(`PDF export failed:\n\n${detail}`);
        throw new Error(detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (englishName || "customer").replace(/\s+/g, "_");
      a.download = `${safeName}_transactions.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <Modal open onClose={onClose} title={modalTitle} className="max-w-2xl">
        <div className="space-y-4">
          {subTitle && <p className="text-sm text-muted-foreground -mt-1">{subTitle}</p>}

          {/* Stats */}
          <div className={`grid gap-3 ${statsCards.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            {statsCards.map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["all", "paid"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTxnFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    txnFilter === f ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f === "all" ? "All" : "Paid Only"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {/* Language selector — only shown when customer has a Tamil name */}
              {hasTamil && (
                <div className="flex rounded-lg border border-border overflow-hidden" title="PDF language">
                  {(["ta", "en"] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setPdfLang(lang)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        pdfLang === lang ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {lang === "ta" ? "தமிழ்" : "EN"}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={handleShare}
                disabled={sharing || isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 text-xs font-medium hover:bg-green-500/25 disabled:opacity-50 transition-colors"
              >
                <Share2 className="h-3.5 w-3.5" />
                {sharing ? "Exporting…" : "Export PDF"}
              </button>
            </div>
          </div>

          {/* Transaction table */}
          <div className="rounded-lg border border-border overflow-hidden max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Mode</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[...Array(4)].map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredTxns.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-xs">No transactions found</td></tr>
                ) : (
                  filteredTxns.map((t) => (
                    <tr key={t.transaction_id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(t.collection_date)}</td>
                      <td className="px-4 py-2.5 font-medium text-foreground">{fmtAmt(Number(t.amount))}</td>
                      <td className="px-4 py-2.5 text-muted-foreground capitalize">{(t.payment_mode ?? "").toLowerCase()}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold ${t.payment_status === "PAID" ? "text-green-500" : "text-amber-500"}`}>
                          {t.payment_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredTxns.length > 0 && (
            <p className="text-xs text-muted-foreground text-right">
              {filteredTxns.length} transaction{filteredTxns.length !== 1 ? "s" : ""}
              {txnFilter === "paid" ? " (paid only)" : ""}
            </p>
          )}
        </div>
      </Modal>

    </>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
export function DeleteConfirmModal({ name, onSimpleDelete, onResequenceDelete, onCancel }: {
  name: string;
  onSimpleDelete: () => void;
  onResequenceDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">Delete Customer</h3>
            <p className="text-sm text-muted-foreground">
              Delete <span className="font-medium text-foreground">{name}</span>? Choose how to handle IDs:
            </p>
          </div>
        </div>
        <div className="space-y-2 mb-4">
          <button
            onClick={onResequenceDelete}
            className="w-full text-left px-4 py-3 rounded-lg border border-border hover:border-border hover:bg-muted/50 transition-colors"
          >
            <p className="text-sm font-medium text-foreground">Delete &amp; Re-sequence IDs</p>
            <p className="text-xs text-muted-foreground mt-0.5">Renumbers all subsequent IDs in customers, transactions &amp; name map</p>
          </button>
          <button
            onClick={onSimpleDelete}
            className="w-full text-left px-4 py-3 rounded-lg border border-border hover:border-destructive/50 hover:bg-destructive/5 transition-colors"
          >
            <p className="text-sm font-medium text-foreground">Delete Only</p>
            <p className="text-xs text-muted-foreground mt-0.5">Removes the customer without changing any other IDs</p>
          </button>
        </div>
        <Button variant="ghost" className="w-full" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Add/Edit Modal ────────────────────────────────────────────────────────────
export function CustomerFormModal({ open, onClose, product, initial, duplicateFrom, onSave }: {
  open: boolean;
  onClose: () => void;
  product: ProductType;
  initial: EdiCustomer | IopCustomer | null;
  duplicateFrom?: EdiCustomer | IopCustomer | null;
  onSave: (data: object) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [nextId, setNextId] = useState<number | null>(null);
  const [tamilLoading, setTamilLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: _segmentsRaw } = useQuery<{ segment_id: number; name: string }[]>({
    queryKey: ["segments", product],
    queryFn: async () => {
      const fn = product === "edi" ? customersApi.ediSegments : customersApi.iopSegments;
      const res = await fn();
      return res.data as { segment_id: number; name: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const segments = Array.isArray(_segmentsRaw) ? _segmentsRaw : [];

  useEffect(() => {
    if (open && !initial) {
      const fetchId = product === "edi" ? customersApi.nextEdiId : customersApi.nextIopId;
      fetchId().then((res) => {
        const id = (res.data as { next_id: number }).next_id;
        setNextId(id);
        if (duplicateFrom) {
          // Pre-fill all fields from source, but override customer_id with new one
          const src = duplicateFrom as unknown as Record<string, unknown>;
          const prefilled: Record<string, string> = { customer_id: String(id) };
          for (const k of Object.keys(src)) {
            if (k !== "customer_id" && src[k] != null) prefilled[k] = String(src[k]);
          }
          setForm(prefilled);
        } else {
          setForm({ customer_id: String(id) });
        }
      });
    } else if (open && initial) {
      setForm({});
    } else if (!open) {
      setForm({});
      setNextId(null);
    }
  }, [open, initial, duplicateFrom, product]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleNameChange = useCallback((value: string) => {
    set("customer_name", value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) return;
    debounceRef.current = setTimeout(async () => {
      setTamilLoading(true);
      try {
        const res = await customersApi.transliterate(value);
        const tamil = (res.data as { tamil: string }).tamil;
        if (tamil) set("customer_name_ta", tamil);
      } catch (err) {
        console.error("Transliteration failed:", err);
      } finally {
        setTamilLoading(false);
      }
    }, 500);
  }, []);

  const handleDateChange = (dateStr: string) => {
    set("loan_start_date", dateStr);
    set("month", deriveMonth(dateStr));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const merged: Record<string, unknown> = { ...initial, ...form };

    const REQUIRED: [string, string][] = [
      ["customer_name", "Name (English)"],
      ["customer_name_ta", "Name (Tamil)"],
      ["customer_segment_id", "Segment"],
      ["loan_amount", "Loan Amount"],
      ["disbursed_amount", "Disbursed Amount"],
      ["interest", "Interest"],
      ["loan_start_date", "Start Date"],
    ];
    if (product === "edi") REQUIRED.push(["outstanding_balance", "Outstanding Balance"]);
    else {
      REQUIRED.push(["interest_payment_frequency", "Interest Freq."]);
      REQUIRED.push(["loan_closure", "Loan Closure"]);
    }

    const missing = REQUIRED.filter(([k]) => {
      const v = merged[k];
      return v === null || v === undefined || String(v).trim() === "";
    });
    if (missing.length > 0) {
      toast.error(`Fill required: ${missing.map(([, l]) => l).join(", ")}`);
      return;
    }

    const data: Record<string, unknown> = { ...merged };
    ["customer_id", "customer_segment_id", "loan_amount", "disbursed_amount",
     "interest", "outstanding_balance", "interest_payment_frequency", "loan_closure"].forEach((k) => {
      if (data[k]) data[k] = Number(data[k]);
    });
    onSave(data);
  };

  const getVal = (key: string) => {
    if (initial) return String((initial as unknown as Record<string, unknown>)[key] ?? "");
    if (duplicateFrom && key !== "customer_id") return String((duplicateFrom as unknown as Record<string, unknown>)[key] ?? "");
    return "";
  };

  const field = (key: string, label: string, opt?: boolean) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label}{!opt && <span className="text-red-500 ml-0.5">*</span>}
        {opt && <span className="text-muted-foreground/50 ml-1 text-[10px] font-normal">(optional)</span>}
      </label>
      <Input
        key={`${key}-${initial?.customer_id ?? "new"}-${nextId}-${(duplicateFrom as EdiCustomer | null)?.customer_id ?? ""}`}
        defaultValue={key === "customer_id" && !initial && nextId !== null ? String(nextId) : getVal(key)}
        onChange={(e) => key === "customer_name" && !initial ? handleNameChange(e.target.value) : set(key, e.target.value)}
      />
    </div>
  );

  const numField = (key: string, label: string) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label}<span className="text-red-500 ml-0.5">*</span>
      </label>
      <Input
        type="number"
        key={`${key}-${initial?.customer_id ?? "new"}-${(duplicateFrom as EdiCustomer | null)?.customer_id ?? ""}`}
        defaultValue={getVal(key)}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  );

  const currentDate = form.loan_start_date ?? getVal("loan_start_date");
  const currentMonth = form.month ?? getVal("month");

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit Customer" : duplicateFrom ? `Duplicate — Copy of #${(duplicateFrom as EdiCustomer).customer_id}` : "Add Customer"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          {field("customer_id", "Customer ID")}
          {field("customer_name", "Name (English)")}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Name (Tamil)<span className="text-red-500 ml-0.5">*</span>
              {tamilLoading && <span className="text-muted-foreground animate-pulse ml-1">transliterating…</span>}
            </label>
            <Input
              key={`customer_name_ta-${initial?.customer_id ?? "new"}-${(duplicateFrom as EdiCustomer | null)?.customer_id ?? ""}`}
              value={form.customer_name_ta ?? getVal("customer_name_ta")}
              onChange={(e) => set("customer_name_ta", e.target.value)}
              placeholder="Auto-filled from English name"
            />
          </div>
          {field("contact_number", "Contact", true)}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Segment<span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="relative">
              <select
                key={`customer_segment_id-${initial?.customer_id ?? "new"}-${(duplicateFrom as EdiCustomer | null)?.customer_id ?? ""}`}
                value={form.customer_segment_id ?? getVal("customer_segment_id")}
                onChange={(e) => set("customer_segment_id", e.target.value)}
                className="w-full appearance-none rounded-md border border-border bg-background px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="" className="bg-background text-muted-foreground">— Select segment —</option>
                {segments.map((s) => (
                  <option key={s.segment_id} value={String(s.segment_id)} className="bg-background text-foreground">
                    {s.name || `Segment ${s.segment_id}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            {segments.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No segments configured in Name Map.</p>
            )}
          </div>

          {numField("loan_amount", "Loan Amount")}
          {numField("disbursed_amount", "Disbursed Amount")}
          {numField("interest", "Interest")}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Start Date<span className="text-red-500 ml-0.5">*</span>
            </label>
            <DatePicker value={currentDate || undefined} onChange={handleDateChange} />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Month (auto)</label>
            <Input value={currentMonth} readOnly className="bg-secondary/50 cursor-default text-muted-foreground" />
          </div>

          {product === "edi" && numField("outstanding_balance", "Outstanding Balance")}
          {product === "iop" && numField("interest_payment_frequency", "Interest Freq.")}
          {product === "iop" && numField("loan_closure", "Loan Closure")}
        </div>
        {field("customer_address", "Address", true)}
        {field("proof_aadhaar", "Aadhaar", true)}
        {field("remarks", "Remarks", true)}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
