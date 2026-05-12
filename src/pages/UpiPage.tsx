import { useEffect, useRef, useState, useMemo } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import {
  CheckCircle, AlertCircle, Trash2, Link2, Unlink, ChevronDown, X, Search, Eye,
} from "lucide-react";
import { upiApi, customersApi } from "@/services/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UpiTxn {
  id: number;
  upi_ref_no: string;
  amount: string;
  transaction_type: "credit" | "debit";
  sender_vpa: string | null;
  sender_name: string | null;
  notes: string | null;
  transaction_date: string;
  source: "gmail" | "csv";
  mapped_customer_id: number | null;
  mapped_customer_type: "edi" | "iop" | null;
  mapped_customer_name: string | null;
}

interface VpaMapping {
  id: number;
  upi_vpa: string;
  customer_id: number;
  customer_type: string;
  customer_name: string | null;
}

interface UniqueVpa {
  vpa: string;
  sender_name: string;
  count: number;
}

interface CustomerWithBalance {
  customer_id: number;
  customer_name: string;
  type: "edi" | "iop";
  balance: number;
}

interface FuzzySuggestion {
  customer_id: number;
  customer_name: string;
  type: "edi" | "iop";
  score: number;
  balance: number;
}

interface Customer {
  customer_id: number;
  customer_name: string | null;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (msg: string, type: "success" | "error" = "success") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, type });
    timerRef.current = setTimeout(() => setToast(null), 3500);
  };
  return { toast, show };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UpiPage() {
  const { toast, show } = useToast();

  // Transactions
  const [txns, setTxns] = useState<UpiTxn[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useSessionState("upi.dateFrom", "");
  const [dateTo, setDateTo] = useSessionState("upi.dateTo", "");
  const [sourceFilter, setSourceFilter] = useSessionState<"" | "gmail" | "csv">("upi.sourceFilter", "");
  const [mappedFilter, setMappedFilter] = useSessionState<"" | "true" | "false">("upi.mappedFilter", "");

  // Map transaction modal
  const [mapTxn, setMapTxn] = useState<UpiTxn | null>(null);
  const [mapType, setMapType] = useState<"edi" | "iop">("edi");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [mapCustomerId, setMapCustomerId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTxn, setDeleteTxn] = useState<UpiTxn | null>(null);

  // VPA mappings
  const [vpaMappings, setVpaMappings] = useState<VpaMapping[]>([]);

  // Unique VPAs from last 6 months
  const [uniqueVpas, setUniqueVpas] = useState<UniqueVpa[]>([]);
  const [vpaLoading, setVpaLoading] = useState(false);
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false);

  // Detail popover
  const [detailTxn, setDetailTxn] = useState<UpiTxn | null>(null);

  // Selected VPA for mapping
  const [selectedVpa, setSelectedVpa] = useState<UniqueVpa | null>(null);
  const [fuzzySuggestions, setFuzzySuggestions] = useState<FuzzySuggestion[]>([]);
  const [customersWithBalance, setCustomersWithBalance] = useState<CustomerWithBalance[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchTxns();
    fetchVpaMappings();
    fetchUniqueVpas();
    fetchCustomersWithBalance();
  }, []);

  useEffect(() => { fetchTxns(); }, [dateFrom, dateTo, sourceFilter, mappedFilter]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customersWithBalance;
    const q = customerSearch.toLowerCase();
    return customersWithBalance.filter((c) =>
      c.customer_name.toLowerCase().includes(q) ||
      String(c.customer_id).includes(q)
    );
  }, [customersWithBalance, customerSearch]);

  // ── API calls ─────────────────────────────────────────────────────────────

  async function fetchTxns() {
    setLoading(true);
    try {
      const params: Record<string, any> = { limit: 200, skip: 0 };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (sourceFilter) params.source = sourceFilter;
      if (mappedFilter !== "") params.mapped = mappedFilter === "true";
      const { data } = await upiApi.list(params);
      setTxns(data.data);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }

  async function fetchVpaMappings() {
    const { data } = await upiApi.listVpaMappings();
    setVpaMappings(data.data);
  }

  async function fetchUniqueVpas() {
    setVpaLoading(true);
    try {
      const { data } = await upiApi.uniqueVpas();
      setUniqueVpas(data.data);
    } finally {
      setVpaLoading(false);
    }
  }

  async function fetchCustomersWithBalance() {
    const { data } = await upiApi.customersWithBalance();
    setCustomersWithBalance(data.data);
  }

  async function handleSelectVpa(v: UniqueVpa) {
    setSelectedVpa(v);
    setCustomerSearch("");
    setFuzzySuggestions([]);
    if (v.sender_name) {
      try {
        const { data } = await upiApi.fuzzySuggest(v.sender_name);
        setFuzzySuggestions(data.data);
      } catch {
        // ignore fuzzy errors
      }
    }
  }

  async function handleMapFromSuggestion(s: FuzzySuggestion) {
    if (!selectedVpa) return;
    await saveVpaMapping(selectedVpa.vpa, s.customer_id, s.type, s.customer_name);
  }

  async function handleMapFromSearch(c: CustomerWithBalance) {
    if (!selectedVpa) return;
    await saveVpaMapping(selectedVpa.vpa, c.customer_id, c.type, c.customer_name);
  }

  async function saveVpaMapping(vpa: string, customerId: number, type: string, name: string) {
    try {
      await upiApi.createVpaMapping({ upi_vpa: vpa, customer_id: customerId, customer_type: type, customer_name: name });
      show("VPA mapped!");
      setSelectedVpa(null);
      setFuzzySuggestions([]);
      setCustomerSearch("");
      fetchVpaMappings();
      fetchUniqueVpas();
      fetchTxns();
    } catch (e: any) {
      show(e?.response?.data?.detail || "Failed to map", "error");
    }
  }

  async function handleDeleteVpaMapping(id: number) {
    await upiApi.deleteVpaMapping(id);
    show("Mapping removed");
    fetchVpaMappings();
    fetchUniqueVpas();
  }

  async function openMapModal(txn: UpiTxn) {
    setMapTxn(txn);
    setMapType(txn.mapped_customer_type || "edi");
    setMapCustomerId(txn.mapped_customer_id ?? "");
    await loadCustomers(txn.mapped_customer_type || "edi");
  }

  async function loadCustomers(type: "edi" | "iop") {
    const { data } = type === "edi"
      ? await customersApi.listEdi({ limit: 500 })
      : await customersApi.listIop({ limit: 500 });
    setCustomers(data.data || []);
  }

  async function handleMapSave() {
    if (!mapTxn || mapCustomerId === "") return;
    setSaving(true);
    try {
      await upiApi.mapCustomer(mapTxn.id, { customer_id: Number(mapCustomerId), customer_type: mapType });
      show("Customer mapped!");
      setMapTxn(null);
      fetchTxns();
    } catch (e: any) {
      show(e?.response?.data?.detail || "Mapping failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnmap(txn: UpiTxn) {
    await upiApi.mapCustomer(txn.id, { customer_id: null, customer_type: null });
    show("Mapping removed");
    fetchTxns();
  }

  async function handleDelete() {
    if (!deleteTxn) return;
    await upiApi.deleteTransaction(deleteTxn.id);
    show("Transaction deleted");
    setDeleteTxn(null);
    fetchTxns();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const mapped = txns.filter((t) => t.mapped_customer_id).length;
  const gmailCount = txns.filter((t) => t.source === "gmail").length;
  const csvCount = txns.filter((t) => t.source === "csv").length;
  const totalAmt = txns.reduce((s, t) => s + parseFloat(t.amount || "0"), 0);

  return (
    <div className="p-6 space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success"
            ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400"
            : "bg-red-500/20 border border-red-500/40 text-red-400"
        }`}>
          {toast.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">UPI Transactions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Merged view of Gmail-imported and XLS-imported HDFC UPI transactions
        </p>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Total", value: total, color: "bg-primary/10 text-primary" },
          { label: "Gmail", value: gmailCount, color: "bg-blue-500/10 text-blue-400" },
          { label: "XLS", value: csvCount, color: "bg-amber-500/10 text-amber-400" },
          { label: "Mapped", value: mapped, color: "bg-emerald-500/10 text-emerald-400" },
          {
            label: "Total Credit",
            value: `₹${totalAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            color: "bg-purple-500/10 text-purple-400",
          },
        ].map(({ label, value, color }) => (
          <div key={label} className={`px-4 py-2 rounded-xl text-sm font-semibold ${color}`}>
            {label}: {value}
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-5 items-start">

        {/* ── LEFT: Transaction Table ── */}
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as any)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
              <option value="">All Sources</option>
              <option value="gmail">Gmail</option>
              <option value="csv">XLS</option>
            </select>
            <select value={mappedFilter} onChange={(e) => setMappedFilter(e.target.value as any)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
              <option value="">All</option>
              <option value="true">Mapped</option>
              <option value="false">Unmapped</option>
            </select>
            {(dateFrom || dateTo || sourceFilter || mappedFilter) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); setSourceFilter(""); setMappedFilter(""); }}
                className="text-xs text-muted-foreground hover:text-foreground underline">Clear</button>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ref No</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                  ) : txns.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <p className="text-muted-foreground text-sm">No transactions yet.</p>
                        <p className="text-muted-foreground/60 text-xs mt-1">
                          Go to Settings → UPI Data Import to connect Gmail or upload an XLS file.
                        </p>
                      </td>
                    </tr>
                  ) : txns.map((t) => (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.upi_ref_no}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{t.transaction_date}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        <span className={t.transaction_type === "credit" ? "text-emerald-400" : "text-red-400"}>
                          {t.transaction_type === "debit" ? "−" : "+"}₹{parseFloat(t.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <div>{t.sender_name || "—"}</div>
                        {t.mapped_customer_id && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <CheckCircle className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                            <span className="text-xs text-emerald-400">
                              {t.mapped_customer_type?.toUpperCase()} #{t.mapped_customer_id}
                              {t.mapped_customer_name ? ` — ${t.mapped_customer_name}` : ""}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setDetailTxn(t)}
                            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            title="View details">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => openMapModal(t)}
                            className="p-1.5 rounded-lg hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors"
                            title="Map to customer">
                            <Link2 className="h-3.5 w-3.5" />
                          </button>
                          {t.mapped_customer_id && (
                            <button onClick={() => handleUnmap(t)}
                              className="p-1.5 rounded-lg hover:bg-amber-500/15 text-muted-foreground hover:text-amber-400 transition-colors"
                              title="Remove mapping">
                              <Unlink className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => setDeleteTxn(t)}
                            className="p-1.5 rounded-lg hover:bg-red-500/15 text-muted-foreground hover:text-red-400 transition-colors"
                            title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {txns.length > 0 && (
              <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
                Showing {txns.length} of {total} transactions
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Mapping Panel (two components, vertical) ── */}
        <div className="space-y-4">

          {/* ── Component 1: UPI ID → Customer (side-by-side) ── */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-foreground text-sm">UPI ID → Customer</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Select a UPI ID, then choose a customer on the right</p>
              </div>
              <button
                onClick={() => setShowUnmappedOnly((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors flex-shrink-0 ${
                  showUnmappedOnly
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                Unmapped only
              </button>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border" style={{ minHeight: 200 }}>

              {/* Left: VPA list */}
              <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
                {vpaLoading ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">Loading…</div>
                ) : uniqueVpas.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">No UPI IDs in last 6 months.</div>
                ) : uniqueVpas.filter((v) => !showUnmappedOnly || !vpaMappings.find((m) => m.upi_vpa === v.vpa)).map((v) => {
                  const existing = vpaMappings.find((m) => m.upi_vpa === v.vpa);
                  const isSelected = selectedVpa?.vpa === v.vpa;
                  return (
                    <button
                      key={v.vpa}
                      onClick={() => handleSelectVpa(v)}
                      className={`w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors ${
                        isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-0.5">
                        <p className="text-xs font-mono text-foreground truncate leading-tight">{v.vpa}</p>
                        {existing && <CheckCircle className="h-3 w-3 text-emerald-400 flex-shrink-0 mt-0.5" />}
                      </div>
                      {v.sender_name && (
                        <p className="text-xs text-muted-foreground truncate">{v.sender_name}</p>
                      )}
                      <span className="text-xs text-muted-foreground/60">{v.count}×</span>
                    </button>
                  );
                })}
              </div>

              {/* Right: Customer picker (or placeholder) */}
              {selectedVpa ? (
                <div className="overflow-y-auto p-3 space-y-3" style={{ maxHeight: 380 }}>
                  {/* Selected VPA label */}
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-mono text-primary truncate">{selectedVpa.vpa}</p>
                    <button
                      onClick={() => { setSelectedVpa(null); setFuzzySuggestions([]); setCustomerSearch(""); }}
                      className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground flex-shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Fuzzy suggestions */}
                  {fuzzySuggestions.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Suggestions</p>
                      <div className="space-y-1">
                        {fuzzySuggestions.map((s) => (
                          <button
                            key={`${s.type}_${s.customer_id}`}
                            onClick={() => handleMapFromSuggestion(s)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left group"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1">
                                <span className={`text-xs px-1 py-0.5 rounded font-medium flex-shrink-0 ${
                                  s.type === "edi" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
                                }`}>{s.type.toUpperCase()}</span>
                                <span className="text-xs text-foreground truncate">#{s.customer_id}</span>
                              </div>
                              <p className="text-xs text-foreground truncate">{s.customer_name}</p>
                              <div className="mt-1 h-0.5 rounded-full bg-secondary overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${s.score >= 80 ? "bg-emerald-500" : s.score >= 60 ? "bg-amber-500" : "bg-muted-foreground"}`}
                                  style={{ width: `${s.score}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground/60 mt-0.5">{s.score.toFixed(0)}%</p>
                            </div>
                            <Link2 className="h-3 w-3 text-muted-foreground group-hover:text-primary flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Search */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Search</p>
                    <div className="relative mb-1.5">
                      <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Name or ID…"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </div>
                    <div className="space-y-0.5 max-h-36 overflow-y-auto">
                      {filteredCustomers.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">No results.</p>
                      ) : filteredCustomers.map((c) => (
                        <button
                          key={`${c.type}_${c.customer_id}`}
                          onClick={() => handleMapFromSearch(c)}
                          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-secondary/60 transition-colors text-left"
                        >
                          <span className={`text-xs px-1 py-0.5 rounded font-medium flex-shrink-0 ${
                            c.type === "edi" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
                          }`}>{c.type.toUpperCase()}</span>
                          <span className="text-xs text-foreground truncate">#{c.customer_id} {c.customer_name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-4 text-center">
                  <p className="text-xs text-muted-foreground/50">← Select a UPI ID</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Component 2: Saved Mappings (Name Map) ── */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-secondary/30">
              <h2 className="font-semibold text-foreground text-sm">
                Name Map
                {vpaMappings.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">({vpaMappings.length})</span>
                )}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Saved UPI ID → Customer mappings</p>
            </div>
            {vpaMappings.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                No mappings saved yet. Map a UPI ID above.
              </div>
            ) : (
              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                {vpaMappings.map((m) => (
                  <div key={m.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-secondary/20 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-xs px-1 py-0.5 rounded font-medium flex-shrink-0 ${
                          m.customer_type === "edi" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
                        }`}>{m.customer_type.toUpperCase()}</span>
                        <span className="text-xs text-foreground font-medium truncate">
                          #{m.customer_id}{m.customer_name ? ` — ${m.customer_name}` : ""}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground truncate">{m.upi_vpa}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteVpaMapping(m.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/15 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Transaction Detail Modal */}
      {detailTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailTxn(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">Transaction Details</h2>
              <button onClick={() => setDetailTxn(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Ref No", <span className="font-mono text-xs">{detailTxn.upi_ref_no}</span>],
                ["Date", detailTxn.transaction_date],
                ["Amount", <span className={detailTxn.transaction_type === "credit" ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                  {detailTxn.transaction_type === "debit" ? "−" : "+"}₹{parseFloat(detailTxn.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>],
                ["Type", <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${detailTxn.transaction_type === "credit" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{detailTxn.transaction_type}</span>],
                ["Source", <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${detailTxn.source === "gmail" ? "bg-blue-500/15 text-blue-400" : "bg-amber-500/15 text-amber-400"}`}>{detailTxn.source === "gmail" ? "Gmail" : "XLS"}</span>],
                ["Sender Name", detailTxn.sender_name || "—"],
                ["Sender VPA", <span className="font-mono text-xs">{detailTxn.sender_vpa || "—"}</span>],
                ["Notes", detailTxn.notes || "—"],
                ["Customer", detailTxn.mapped_customer_id
                  ? <span className="text-emerald-400">{detailTxn.mapped_customer_type?.toUpperCase()} #{detailTxn.mapped_customer_id}{detailTxn.mapped_customer_name ? ` — ${detailTxn.mapped_customer_name}` : ""}</span>
                  : <span className="text-muted-foreground/50">Not mapped</span>],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground flex-shrink-0">{label}</span>
                  <span className="text-foreground text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Map Customer Modal */}
      {mapTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">Map to Customer</h2>
              <button onClick={() => setMapTxn(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-xl bg-secondary/30 px-4 py-3 mb-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ref</span>
                <span className="font-mono text-xs text-foreground">{mapTxn.upi_ref_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className={`font-semibold ${mapTxn.transaction_type === "credit" ? "text-emerald-400" : "text-red-400"}`}>
                  {mapTxn.transaction_type === "debit" ? "−" : "+"}₹{parseFloat(mapTxn.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              {mapTxn.sender_name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sender</span>
                  <span className="text-foreground">{mapTxn.sender_name}</span>
                </div>
              )}
            </div>
            <div className="flex rounded-xl border border-border overflow-hidden mb-3">
              {(["edi", "iop"] as const).map((t) => (
                <button key={t}
                  onClick={() => { setMapType(t); setMapCustomerId(""); loadCustomers(t); }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    mapType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                  }`}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="relative mb-4">
              <select value={mapCustomerId}
                onChange={(e) => setMapCustomerId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full appearance-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-8">
                <option value="">— Select customer —</option>
                {customers.map((c) => (
                  <option key={c.customer_id} value={c.customer_id}>
                    #{c.customer_id} — {c.customer_name || "Unnamed"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setMapTxn(null)}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">
                Cancel
              </button>
              <button onClick={handleMapSave} disabled={saving || mapCustomerId === ""}
                className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-start gap-3 mb-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/15 flex-shrink-0">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Delete Transaction</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Remove UPI ref <span className="font-mono text-xs">{deleteTxn.upi_ref_no}</span>? This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTxn(null)}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
