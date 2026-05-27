import { useState } from "react";
import {
  Search, Plus, Filter, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/useBreakpoint";
import {
  useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer,
} from "@/hooks/useCustomers";
import {
  CustomerFormModal, CustomerDetailModal, DeleteConfirmModal,
  CustomerCardMobile, CustomerRow, PAGE_SIZE, SortDir,
} from "@/pages/CustomersPage";
import type { EdiCustomer, IopCustomer, ProductType } from "@/types";

export function CustomerStepOverlay({
  onDone,
  onSkip,
  onSkipAll,
}: {
  onDone: () => void;
  onSkip: () => void;
  onSkipAll: () => void;
}) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();

  const [product, setProduct] = useState<ProductType>("edi");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [balanceFilter, setBalanceFilter] = useState(false);
  const [sortBy, setSortBy] = useState("customer_id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EdiCustomer | IopCustomer | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<EdiCustomer | IopCustomer | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<EdiCustomer | IopCustomer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: number; name: string; customer: EdiCustomer | IopCustomer;
  } | null>(null);

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

  const handleSave = (formData: object) => {
    if (editing) updateMutation.mutate({ id: (editing as EdiCustomer).customer_id, data: formData });
    else createMutation.mutate(formData);
    setShowForm(false);
    setEditing(null);
    setDuplicateSource(null);
    qc.invalidateQueries({ queryKey: ["customers", product] });
  };

  const handleDeleteConfirm = (resequence: boolean) => {
    if (!confirmDelete) return;
    deleteMutation.mutate({ id: confirmDelete.id, resequence });
    setConfirmDelete(null);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ChevronDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ── Step header ── */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-secondary/60 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-bold text-background">6</span>
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Customer Management</p>
            <p className="text-[11px] text-muted-foreground hidden sm:block">Add or edit customers from extracted records</p>
          </div>
        </div>

        {/* Product toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden ml-3">
          {(["edi", "iop"] as const).map((p) => (
            <button
              key={p}
              onClick={() => { setProduct(p); setPage(0); setBalanceFilter(false); }}
              className={`px-3 py-1.5 text-xs font-bold uppercase transition-colors ${
                product === p
                  ? p === "iop"
                    ? "bg-orange-500/15 text-orange-700 dark:text-orange-400"
                    : "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Workflow actions */}
        <button
          onClick={onSkipAll}
          className="text-[12px] text-muted-foreground hover:text-foreground px-2 transition-colors"
        >
          Skip all
        </button>
        <button
          onClick={onSkip}
          className="px-3 py-1.5 rounded-lg border border-border text-[12.5px] text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          Skip this step
        </button>
        <button
          onClick={onDone}
          className="px-4 py-1.5 rounded-lg bg-foreground text-background text-[12.5px] font-semibold hover:bg-foreground/85 transition-colors"
        >
          Done
        </button>
      </div>

      {/* ── Filters + Add toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by name…"
            className="w-full text-sm rounded-lg border border-border pl-8 pr-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />
        </div>
        <button
          onClick={() => { setBalanceFilter((f) => !f); setPage(0); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors ${
            balanceFilter
              ? "bg-foreground text-background border-foreground"
              : "bg-card text-muted-foreground border-border hover:text-foreground"
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Balance &gt; 0</span>
        </button>
        {!isLoading && (
          <span className="text-[12px] text-muted-foreground hidden sm:block">{total} customer{total !== 1 ? "s" : ""}</span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => { setEditing(null); setDuplicateSource(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-[12.5px] font-semibold hover:bg-foreground/85 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Customer
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isMobile ? (
          /* Mobile card list */
          <div className="h-full overflow-y-auto">
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="px-4 py-3 border-b border-border/50 space-y-2">
                  <div className="h-4 bg-secondary rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-secondary rounded animate-pulse w-1/2" />
                  <div className="h-3 bg-secondary rounded animate-pulse w-3/4" />
                </div>
              ))
            ) : customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-16">
                <p className="text-sm">{search ? "No customers match your search" : "No customers found"}</p>
              </div>
            ) : (
              customers.map((c) => (
                <CustomerCardMobile
                  key={c.customer_id}
                  customer={c}
                  product={product}
                  onNameClick={() => setDetailCustomer(c)}
                  onEdit={() => { setEditing(c); setDuplicateSource(null); setShowForm(true); }}
                  onDuplicate={() => { setEditing(null); setDuplicateSource(c); setShowForm(true); }}
                  onDelete={() => setConfirmDelete({ id: c.customer_id, name: c.customer_name ?? `#${c.customer_id}`, customer: c })}
                />
              ))
            )}
          </div>
        ) : (
          /* Desktop table */
          <div className="h-full overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-secondary border-b border-border">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort("customer_id")}
                  >
                    <span className="flex items-center gap-1">ID <SortIcon col="customer_id" /></span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tamil Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Loan Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {product === "edi" ? "Outstanding" : "Loan Closure"}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort("loan_start_date")}
                  >
                    <span className="flex items-center gap-1">Start Date <SortIcon col="loan_start_date" /></span>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-secondary rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground text-sm">
                      {search ? "No customers match your search" : "No customers found"}
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <CustomerRow
                      key={c.customer_id}
                      customer={c}
                      product={product}
                      onNameClick={() => setDetailCustomer(c)}
                      onEdit={() => { setEditing(c); setDuplicateSource(null); setShowForm(true); }}
                      onDuplicate={() => { setEditing(null); setDuplicateSource(c); setShowForm(true); }}
                      onDelete={() => setConfirmDelete({ id: c.customer_id, name: c.customer_name ?? `#${c.customer_id}`, customer: c })}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-secondary flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · {total} total
          </span>
          <div className="flex gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Sub-modals (rendered above overlay) ── */}
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
