import { useState, useRef, useEffect, useCallback } from "react";
import { useSessionState } from "@/hooks/useSessionState";
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

const PAGE_SIZE = 20;
type SortDir = "asc" | "desc";

type HistoryEntry =
  | { type: "create"; formData: object; customerId: number; product: ProductType }
  | { type: "update"; id: number; before: object; after: object; product: ProductType }
  | { type: "delete"; customer: EdiCustomer | IopCustomer; resequence: boolean; product: ProductType };

function deriveMonth(dateStr: string): string {
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground">{total} total customers</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo last action"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
            {undoStack.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-bold">
                {undoStack.length}
              </span>
            )}
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo last action"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Redo2 className="h-3.5 w-3.5" />
            Redo
            {redoStack.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-bold">
                {redoStack.length}
              </span>
            )}
          </button>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Customer
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["edi", "iop"] as ProductType[]).map((p) => (
            <button
              key={p}
              onClick={() => { setProduct(p); setPage(0); setBalanceFilter(false); }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                product === p ? "bg-primary text-white" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <button
          onClick={() => { setBalanceFilter((f) => !f); setPage(0); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
            balanceFilter
              ? "bg-primary text-white border-primary"
              : "bg-card text-muted-foreground border-border hover:text-foreground"
          }`}
          title={product === "edi" ? "Outstanding balance > 0" : "Loan closure > 0"}
        >
          <Filter className="h-4 w-4" />
          Balance &gt; 0
        </button>
      </div>

      <div className="glass-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("customer_id")}>
                  <span className="flex items-center gap-1">ID <SortIcon col="customer_id" /></span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tamil Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Loan Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  {product === "edi" ? "Outstanding" : "Loan Closure"}
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
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages} ({total} records)</span>
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

// ── Row ───────────────────────────────────────────────────────────────────────
function CustomerRow({ customer: c, product, onNameClick, onEdit, onDuplicate, onDelete }: {
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
        <button onClick={onNameClick} className="font-medium text-foreground hover:text-primary transition-colors text-left">
          {c.customer_name ?? "—"}
        </button>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{c.tamil_name || "—"}</td>
      <td className="px-4 py-3 text-muted-foreground">{c.contact_number ?? "—"}</td>
      <td className="px-4 py-3">{c.loan_amount ? formatCurrency(Number(c.loan_amount)) : "—"}</td>
      <td className="px-4 py-3">
        {product === "edi"
          ? (ediC.outstanding_balance ? formatCurrency(Number(ediC.outstanding_balance)) : "—")
          : (iopC.loan_closure != null ? iopC.loan_closure : "—")}
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
function CustomerDetailModal({ customer, product, onClose }: {
  customer: EdiCustomer | IopCustomer;
  product: ProductType;
  onClose: () => void;
}) {
  const [txnFilter, setTxnFilter] = useState<"all" | "paid">("all");
  const [sharing, setSharing] = useState(false);

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
  const balance = product === "edi"
    ? Number((customer as EdiCustomer).outstanding_balance || 0)
    : Number((customer as IopCustomer).loan_closure || 0);

  const fmtDate = (d?: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}-${m}-${y}`;
  };
  const fmtAmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  const tamilName = customer.tamil_name;
  const modalTitle = tamilName
    ? `#${customer.customer_id} — ${tamilName}`
    : `#${customer.customer_id} — ${customer.customer_name ?? "Customer"}`;
  const subTitle = tamilName ? customer.customer_name : undefined;

  const handleShare = async () => {
    setSharing(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      // Build a light-themed off-screen div so html2canvas renders with the
      // browser's own font stack — Tamil script and ₹ render correctly this way.
      const container = document.createElement("div");
      container.style.cssText = [
        "position:fixed", "top:-9999px", "left:-9999px",
        "width:760px", "background:#ffffff", "padding:28px 32px",
        "font-family:system-ui,-apple-system,sans-serif",
        "color:#111827", "line-height:1.5",
      ].join(";");

      const balLabel = product === "edi" ? "Outstanding" : "Loan Closure";
      const rowsHtml = filteredTxns.map((t, i) => `
        <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"}">
          <td style="padding:7px 14px;border-bottom:1px solid #e5e7eb">${fmtDate(t.collection_date)}</td>
          <td style="padding:7px 14px;border-bottom:1px solid #e5e7eb">${fmtAmt(Number(t.amount))}</td>
          <td style="padding:7px 14px;border-bottom:1px solid #e5e7eb;text-transform:capitalize">${(t.payment_mode ?? "").toLowerCase()}</td>
        </tr>`).join("");

      container.innerHTML = `
        <h2 style="margin:0 0 2px;font-size:20px;font-weight:700">${modalTitle}</h2>
        ${subTitle ? `<p style="margin:0 0 18px;font-size:13px;color:#6b7280">${subTitle}</p>` : `<div style="margin-bottom:18px"></div>`}
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px">
          ${[
            ["Loan Start", fmtDate(customer.loan_start_date)],
            ["Loan Amount", fmtAmt(loanAmount)],
            ["Total Paid", fmtAmt(totalPaid)],
            [balLabel, fmtAmt(balance)],
          ].map(([label, val]) => `
            <div style="background:#f3f4f6;border-radius:8px;padding:12px">
              <p style="margin:0 0 3px;font-size:11px;color:#6b7280">${label}</p>
              <p style="margin:0;font-size:14px;font-weight:600">${val}</p>
            </div>`).join("")}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#02B15A;color:#fff">
              <th style="padding:9px 14px;text-align:left;font-weight:600">Date</th>
              <th style="padding:9px 14px;text-align:left;font-weight:600">Amount</th>
              <th style="padding:9px 14px;text-align:left;font-weight:600">Mode</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="margin:12px 0 0;font-size:11px;color:#9ca3af">
          ${filteredTxns.length} transaction${filteredTxns.length !== 1 ? "s" : ""}${txnFilter === "paid" ? " (paid only)" : ""}
        </p>`;

      document.body.appendChild(container);

      // Render HTML → canvas (browser handles Tamil + ₹ natively)
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      document.body.removeChild(container);

      const imgData = canvas.toDataURL("image/png");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 10;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;

      // Slice across pages if content is long
      let yOffset = 0;
      let firstPage = true;
      while (yOffset < imgH) {
        if (!firstPage) doc.addPage();
        firstPage = false;
        doc.addImage(imgData, "PNG", margin, margin - yOffset, imgW, imgH);
        yOffset += pageH - margin * 2;
      }

      const fname = `${customer.customer_name ?? "customer"}_transactions.pdf`;
      doc.save(fname);
      window.open("https://web.whatsapp.com/", "_blank");
    } catch (e) {
      console.error("Share failed:", e);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={modalTitle} className="max-w-2xl">
      <div className="space-y-4">
        {subTitle && (
          <p className="text-sm text-muted-foreground -mt-1">{subTitle}</p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Loan Start", value: fmtDate(customer.loan_start_date) },
            { label: "Loan Amount", value: fmtAmt(loanAmount) },
            { label: "Total Paid", value: fmtAmt(totalPaid) },
            { label: product === "edi" ? "Outstanding" : "Loan Closure", value: fmtAmt(balance) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-secondary p-3">
              <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
              <p className="text-sm font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        {/* Filter + Share */}
        <div className="flex items-center justify-between">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["all", "paid"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTxnFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  txnFilter === f ? "bg-primary text-white" : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : "Paid Only"}
              </button>
            ))}
          </div>
          <button
            onClick={handleShare}
            disabled={sharing || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 text-xs font-medium hover:bg-green-500/25 disabled:opacity-50 transition-colors"
          >
            <Share2 className="h-3.5 w-3.5" />
            {sharing ? "Preparing…" : "Share PDF"}
          </button>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Mode</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {[...Array(3)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredTxns.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground text-xs">No transactions found</td></tr>
              ) : (
                filteredTxns.map((t) => (
                  <tr key={t.transaction_id} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(t.collection_date)}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{fmtAmt(Number(t.amount))}</td>
                    <td className="px-4 py-2.5 text-muted-foreground capitalize">{(t.payment_mode ?? "").toLowerCase()}</td>
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
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteConfirmModal({ name, onSimpleDelete, onResequenceDelete, onCancel }: {
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
            className="w-full text-left px-4 py-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
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
function CustomerFormModal({ open, onClose, product, initial, duplicateFrom, onSave }: {
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
    const data: Record<string, unknown> = { ...initial, ...form };
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

  const field = (key: string, label: string) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <Input
        key={`${key}-${initial?.customer_id ?? "new"}-${nextId}-${(duplicateFrom as EdiCustomer | null)?.customer_id ?? ""}`}
        defaultValue={key === "customer_id" && !initial && nextId !== null ? String(nextId) : getVal(key)}
        onChange={(e) => key === "customer_name" && !initial ? handleNameChange(e.target.value) : set(key, e.target.value)}
      />
    </div>
  );

  const numField = (key: string, label: string) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
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
              Name (Tamil) {tamilLoading && <span className="text-primary animate-pulse">transliterating…</span>}
            </label>
            <Input
              key={`customer_name_ta-${initial?.customer_id ?? "new"}-${(duplicateFrom as EdiCustomer | null)?.customer_id ?? ""}`}
              value={form.customer_name_ta ?? getVal("customer_name_ta")}
              onChange={(e) => set("customer_name_ta", e.target.value)}
              placeholder="Auto-filled from English name"
            />
          </div>
          {field("contact_number", "Contact")}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Segment</label>
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
            <label className="block text-xs font-medium text-muted-foreground mb-1">Start Date</label>
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
        {field("customer_address", "Address")}
        {field("proof_aadhaar", "Aadhaar")}
        {field("remarks", "Remarks")}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
