import { useState, useRef, useCallback } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { Search, Pencil, Trash2, Plus, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { namemapApi, customersApi, upiApi } from "@/services/api";
import type { ProductType } from "@/types";

const PAGE_SIZE = 50;
type ViewType = "names" | "segments" | "upi";

interface NameMapRow {
  customer_id: number;
  customer_name_en: string | null;
  customer_name_ta: string | null;
}

interface SegmentRow {
  customer_segment_id: number;
  customer_segment_name_en: string | null;
  customer_segment_name_ta: string | null;
}

// ── Shared transliterate hook ─────────────────────────────────────────────────
function useTransliterate(setTa: (v: string) => void) {
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnChange = useCallback((value: string, setEn: (v: string) => void) => {
    setEn(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) return;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await customersApi.transliterate(value);
        const tamil = (res.data as { tamil: string }).tamil;
        if (tamil) setTa(tamil);
      } catch (err) {
        console.error("Transliteration failed:", err);
      } finally {
        setLoading(false);
      }
    }, 500);
  }, [setTa]);

  return { loading, handleEnChange };
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NameMapPage() {
  const [product, setProduct] = useSessionState<ProductType>("namemap.product", "edi");
  const [view, setView] = useSessionState<ViewType>("namemap.view", "names");
  const [search, setSearch] = useSessionState("namemap.search", "");
  const [page, setPage] = useSessionState("namemap.page", 0);

  const switchProduct = (p: ProductType) => { setProduct(p); setPage(0); setSearch(""); };
  const switchView = (v: ViewType) => { setView(v); setPage(0); setSearch(""); };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Mapping Configs</h1>
        <p className="text-sm text-muted-foreground">Manage customer name maps, segment maps, and UPI ID mappings</p>
      </div>

      {/* Product + View toggles */}
      <div className="flex flex-wrap gap-3 items-center">
        {view !== "upi" && (
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["edi", "iop"] as ProductType[]).map((p) => (
              <button
                key={p}
                onClick={() => switchProduct(p)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  product === p ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {([["names", "Customer Names"], ["segments", "Segments"], ["upi", "UPI ID Maps"]] as [ViewType, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => switchView(v)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === v ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={view === "upi" ? "Search UPI VPA…" : view === "names" ? "Search names…" : "Search segments…"}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
      </div>

      {view === "names" ? (
        <NamesTable product={product} search={search} page={page} setPage={setPage} />
      ) : view === "segments" ? (
        <SegmentsTable product={product} search={search} />
      ) : (
        <UpiMappingsTable search={search} />
      )}
    </div>
  );
}

// ── Customer Names Table ──────────────────────────────────────────────────────
function NamesTable({ product, search, page, setPage }: {
  product: ProductType;
  search: string;
  page: number;
  setPage: (fn: (p: number) => number) => void;
}) {
  const [editing, setEditing] = useState<NameMapRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<NameMapRow | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const queryClient = useQueryClient();

  const toggleSort = () => {
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    setPage(() => 0);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["namemap-names", product, search, page, sortDir],
    queryFn: async () => {
      const fn = product === "edi" ? namemapApi.listEdi : namemapApi.listIop;
      const res = await fn({ skip: page * PAGE_SIZE, limit: PAGE_SIZE, search, sort_dir: sortDir });
      return res.data as { data: NameMapRow[]; total: number };
    },
  });

  const upsertMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      (product === "edi" ? namemapApi.upsertEdi : namemapApi.upsertIop)(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["namemap-names", product] });
      setEditing(null);
      setAdding(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      (product === "edi" ? namemapApi.deleteEdi : namemapApi.deleteIop)(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["namemap-names", product] });
      setConfirmDelete(null);
    },
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="glass-card overflow-hidden p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">{total} customer name entries</span>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Entry
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-20">
                  <button onClick={toggleSort} className="flex items-center gap-1 hover:text-foreground transition-colors">
                    Cust. ID
                    {sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">English Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tamil Name</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {[...Array(4)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">No entries found</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.customer_id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono">{row.customer_id}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.customer_name_en || "—"}</td>
                    <td className="px-4 py-3 text-foreground">{row.customer_name_ta || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="destructive" size="icon" onClick={() => setConfirmDelete(row)}>
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
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
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

      {(editing || adding) && (
        <NameEditModal
          initial={editing}
          onSave={(id, payload) => upsertMutation.mutate({ id, payload })}
          onClose={() => { setEditing(null); setAdding(false); }}
          saving={upsertMutation.isPending}
        />
      )}

      {confirmDelete && (
        <DeleteConfirm
          label={`#${confirmDelete.customer_id} — ${confirmDelete.customer_name_en || "unnamed"}`}
          onConfirm={() => deleteMutation.mutate(confirmDelete.customer_id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

// ── Segments Table ────────────────────────────────────────────────────────────
function SegmentsTable({ product, search }: { product: ProductType; search: string }) {
  const [editing, setEditing] = useState<SegmentRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SegmentRow | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["namemap-segments", product, search],
    queryFn: async () => {
      const fn = product === "edi" ? namemapApi.listEdiSegments : namemapApi.listIopSegments;
      const res = await fn({ search });
      return res.data as { data: SegmentRow[]; total: number };
    },
  });

  const upsertMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      (product === "edi" ? namemapApi.upsertEdiSegment : namemapApi.upsertIopSegment)(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["namemap-segments", product] });
      setEditing(null);
      setAdding(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      (product === "edi" ? namemapApi.deleteEdiSegment : namemapApi.deleteIopSegment)(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["namemap-segments", product] });
      setConfirmDelete(null);
    },
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <>
      <div className="glass-card overflow-hidden p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">{total} segment entries</span>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Segment
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-24">Segment ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">English Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tamil Name</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
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
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">No segments found</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.customer_segment_id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono">{row.customer_segment_id}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.customer_segment_name_en || "—"}</td>
                    <td className="px-4 py-3 text-foreground">{row.customer_segment_name_ta || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="destructive" size="icon" onClick={() => setConfirmDelete(row)}>
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

      {(editing || adding) && (
        <SegmentEditModal
          initial={editing}
          onSave={(id, payload) => upsertMutation.mutate({ id, payload })}
          onClose={() => { setEditing(null); setAdding(false); }}
          saving={upsertMutation.isPending}
        />
      )}

      {confirmDelete && (
        <DeleteConfirm
          label={`Segment #${confirmDelete.customer_segment_id} — ${confirmDelete.customer_segment_name_en || "unnamed"}`}
          onConfirm={() => deleteMutation.mutate(confirmDelete.customer_segment_id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

// ── Name Edit Modal ───────────────────────────────────────────────────────────
function NameEditModal({ initial, onSave, onClose, saving }: {
  initial: NameMapRow | null;
  onSave: (id: number, payload: object) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const isNew = !initial;
  const [customerId, setCustomerId] = useState(initial ? String(initial.customer_id) : "");
  const [nameEn, setNameEn] = useState(initial?.customer_name_en ?? "");
  const [nameTa, setNameTa] = useState(initial?.customer_name_ta ?? "");
  const { loading: tamilLoading, handleEnChange } = useTransliterate(setNameTa);

  return (
    <Modal open onClose={onClose} title={isNew ? "Add Name Mapping" : `Edit — #${initial!.customer_id}`} className="max-w-md">
      <form onSubmit={(e) => { e.preventDefault(); const id = parseInt(customerId); if (id) onSave(id, { customer_name_en: nameEn || null, customer_name_ta: nameTa || null }); }} className="space-y-4">
        {isNew && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Customer ID</label>
            <Input type="number" value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="Enter customer ID" required />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">English Name</label>
          <Input value={nameEn} onChange={(e) => handleEnChange(e.target.value, setNameEn)} placeholder="Type English name…" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Tamil Name {tamilLoading && <span className="text-muted-foreground animate-pulse ml-1">transliterating…</span>}
          </label>
          <Input value={nameTa} onChange={(e) => setNameTa(e.target.value)} placeholder="Auto-filled or type manually" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Segment Edit Modal ────────────────────────────────────────────────────────
function SegmentEditModal({ initial, onSave, onClose, saving }: {
  initial: SegmentRow | null;
  onSave: (id: number, payload: object) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const isNew = !initial;
  const [segmentId, setSegmentId] = useState(initial ? String(initial.customer_segment_id) : "");
  const [nameEn, setNameEn] = useState(initial?.customer_segment_name_en ?? "");
  const [nameTa, setNameTa] = useState(initial?.customer_segment_name_ta ?? "");
  const { loading: tamilLoading, handleEnChange } = useTransliterate(setNameTa);

  return (
    <Modal open onClose={onClose} title={isNew ? "Add Segment" : `Edit Segment — #${initial!.customer_segment_id}`} className="max-w-md">
      <form onSubmit={(e) => { e.preventDefault(); const id = parseInt(segmentId); if (id) onSave(id, { customer_segment_name_en: nameEn || null, customer_segment_name_ta: nameTa || null }); }} className="space-y-4">
        {isNew && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Segment ID</label>
            <Input type="number" value={segmentId} onChange={(e) => setSegmentId(e.target.value)} placeholder="Enter segment ID" required />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">English Name</label>
          <Input value={nameEn} onChange={(e) => handleEnChange(e.target.value, setNameEn)} placeholder="Type English name…" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Tamil Name {tamilLoading && <span className="text-muted-foreground animate-pulse ml-1">transliterating…</span>}
          </label>
          <Input value={nameTa} onChange={(e) => setNameTa(e.target.value)} placeholder="Auto-filled or type manually" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── UPI ID Mappings Table ─────────────────────────────────────────────────────
interface VpaMapping {
  id: number;
  upi_vpa: string;
  customer_id: number;
  customer_type: string;
  customer_name: string | null;
}

function UpiMappingsTable({ search }: { search: string }) {
  const [confirmDelete, setConfirmDelete] = useState<VpaMapping | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["upi-vpa-mappings"],
    queryFn: async () => {
      const res = await upiApi.listVpaMappings();
      return res.data as { data: VpaMapping[] };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => upiApi.deleteVpaMapping(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upi-vpa-mappings"] });
      setConfirmDelete(null);
    },
  });

  const rows = (data?.data ?? []).filter((r) =>
    !search || r.upi_vpa.toLowerCase().includes(search.toLowerCase()) || (r.customer_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="glass-card overflow-hidden p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">{rows.length} UPI ID mapping{rows.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">UPI VPA</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-20">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-20">Cust. ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Customer Name</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No UPI mappings found</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{row.upi_vpa}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        row.customer_type === "edi" ? "bg-primary/25 text-foreground/65" : "bg-accent/60 text-foreground/65"
                      }`}>
                        {row.customer_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">{row.customer_id}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.customer_name || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="destructive" size="icon" onClick={() => setConfirmDelete(row)}>
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

      {confirmDelete && (
        <DeleteConfirm
          label={`${confirmDelete.upi_vpa} → ${confirmDelete.customer_name || `#${confirmDelete.customer_id}`}`}
          onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────────
function DeleteConfirm({ label, onConfirm, onCancel }: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h3 className="font-semibold text-foreground mb-2">Delete Entry</h3>
        <p className="text-sm text-muted-foreground mb-5">
          Remove <span className="font-medium text-foreground">{label}</span>?
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  );
}
