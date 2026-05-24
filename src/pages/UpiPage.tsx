import { useEffect, useRef, useState, useMemo } from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import {
  Trash2, Link2, Unlink, X, Search, Eye, Mail, FileText, Check,
  Database, Sparkles, Filter,
} from "lucide-react";
import { upiApi } from "@/services/api";

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const fmt = (n: number) => "â‚¹" + Math.round(n).toLocaleString("en-IN");
const fmtFull = (n: number) =>
  "â‚¹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// â”€â”€ Toast â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ TypeBadge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TypeBadge({ type }: { type: string }) {
  return (
    <span style={{
      fontFamily: "\"Geist Mono\", ui-monospace, monospace",
      fontSize: 9,
      padding: "1px 5px",
      borderRadius: 3,
      background: type === "iop"
        ? "hsl(var(--accent) / 0.5)"
        : "hsl(var(--primary) / 0.24)",
      color: "hsl(var(--foreground) / 0.65)",
      textTransform: "uppercase" as const,
      fontWeight: 600,
      flexShrink: 0,
    }}>
      {type}
    </span>
  );
}

// â”€â”€ IBtn (icon button) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function IBtn({
  onClick, title, children, danger,
}: {
  onClick: () => void; title?: string; children: ReactNode; danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 28, height: 28, borderRadius: 6,
        display: "grid", placeItems: "center",
        background: hov ? (danger ? "hsl(var(--neg) / 0.14)" : "hsl(var(--muted))") : "transparent",
        border: "none",
        color: hov ? (danger ? "hsl(var(--neg))" : "hsl(var(--foreground))") : "hsl(var(--muted-foreground))",
        cursor: "pointer",
        transition: "background-color .12s, color .12s",
      }}
    >
      {children}
    </button>
  );
}

// â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // VPA mapping state
  const [vpaMappings, setVpaMappings] = useState<VpaMapping[]>([]);
  const [uniqueVpas, setUniqueVpas] = useState<UniqueVpa[]>([]);
  const [vpaLoading, setVpaLoading] = useState(false);
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false);
  const [selectedVpa, setSelectedVpa] = useState<UniqueVpa | null>(null);
  const [fuzzySuggestions, setFuzzySuggestions] = useState<FuzzySuggestion[]>([]);
  const [customersWithBalance, setCustomersWithBalance] = useState<CustomerWithBalance[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");

  // UI state
  const [detailTxn, setDetailTxn] = useState<UpiTxn | null>(null);
  const [deleteTxn, setDeleteTxn] = useState<UpiTxn | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [cockpitTab, setCockpitTab] = useState<"map" | "saved">("map");

  // â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    fetchTxns();
    fetchVpaMappings();
    fetchUniqueVpas();
    fetchCustomersWithBalance();
  }, []);

  useEffect(() => { fetchTxns(); }, [dateFrom, dateTo, sourceFilter, mappedFilter]);

  // â”€â”€ Computed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const mappedVpaSet = useMemo(() => new Set(vpaMappings.map(m => m.upi_vpa)), [vpaMappings]);

  const filteredTxns = useMemo(() => {
    if (!q.trim()) return txns;
    const lower = q.toLowerCase();
    return txns.filter(t => {
      const blob = `${t.sender_name ?? ""} ${t.sender_vpa ?? ""} ${t.upi_ref_no} ${t.amount}`.toLowerCase();
      return blob.includes(lower);
    });
  }, [txns, q]);

  const grouped = useMemo(() => {
    const map: Record<string, UpiTxn[]> = {};
    filteredTxns.forEach(t => { (map[t.transaction_date] = map[t.transaction_date] ?? []).push(t); });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTxns]);

  const filteredVpas = useMemo(() =>
    showUnmappedOnly ? uniqueVpas.filter(v => !mappedVpaSet.has(v.vpa)) : uniqueVpas,
    [uniqueVpas, showUnmappedOnly, mappedVpaSet]
  );

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customersWithBalance;
    const lower = customerSearch.toLowerCase();
    return customersWithBalance.filter(c =>
      c.customer_name.toLowerCase().includes(lower) || String(c.customer_id).includes(lower)
    );
  }, [customersWithBalance, customerSearch]);

  const mappedCount = txns.filter(t => t.mapped_customer_id).length;
  const gmailCount = txns.filter(t => t.source === "gmail").length;
  const csvCount   = txns.filter(t => t.source === "csv").length;
  const totalAmt   = txns.reduce((s, t) => s + parseFloat(t.amount || "0"), 0);
  const mappedAmt  = txns.filter(t => t.mapped_customer_id).reduce((s, t) => s + parseFloat(t.amount || "0"), 0);
  const mappedPct  = txns.length === 0 ? 0 : Math.round(mappedCount / txns.length * 100);

  const allChecked = filteredTxns.length > 0 && filteredTxns.every(t => selected.has(t.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allChecked) filteredTxns.forEach(t => next.delete(t.id));
    else filteredTxns.forEach(t => next.add(t.id));
    setSelected(next);
  };
  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  // â”€â”€ API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        // ignore
      }
    }
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

  async function openMapForTxn(txn: UpiTxn) {
    setCockpitTab("map");
    setShowUnmappedOnly(false);
    if (txn.sender_vpa) {
      const vpa = uniqueVpas.find(v => v.vpa === txn.sender_vpa);
      if (vpa) await handleSelectVpa(vpa);
    }
  }

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const unmappedVpaCount = uniqueVpas.filter(v => !mappedVpaSet.has(v.vpa)).length;

  // â”€â”€ inline style helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const card: CSSProperties = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 12,
    overflow: "hidden",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  };

  const cardH: CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: "1px solid hsl(var(--border))",
    background: "hsl(var(--secondary))",
    flexShrink: 0, gap: 10,
  };

  const smBtn: CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "4px 9px", borderRadius: 6,
    fontSize: 12, fontWeight: 500,
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    color: "hsl(var(--foreground))",
    cursor: "pointer",
  };

  const fieldStyle: CSSProperties = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 12.5,
    color: "hsl(var(--foreground))",
    outline: 0,
    cursor: "pointer",
  };

  const pip = (
    <span style={{ width: 3, height: 3, borderRadius: 999, background: "hsl(var(--muted-foreground) / 0.5)", display: "inline-block", flexShrink: 0 }} />
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "hsl(var(--background))" }}>

      {/* â”€â”€ Summary bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{
        padding: "13px 16px",
        background: "hsl(var(--secondary))",
        borderBottom: "1px solid hsl(var(--border))",
        flexShrink: 0,
        display: "grid",
        gridTemplateColumns: "minmax(240px, 1.4fr) repeat(3, minmax(120px, 1fr))",
        gap: 14,
        alignItems: "center",
      }}>
        {/* Reconciliation */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: "hsl(var(--muted-foreground))", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: "hsl(var(--pos))", display: "inline-block" }} />
            Reconciliation Â· last 30 days
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
            <div style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 24, fontWeight: 500, letterSpacing: "-.025em", lineHeight: 1 }}>
              {mappedCount}
              <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 400 }}> / {txns.length}</span>
            </div>
            <div style={{
              fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 11.5,
              padding: "2px 9px", borderRadius: 999, fontWeight: 500,
              background: mappedPct < 70 ? "hsl(var(--warn) / 0.18)" : "hsl(var(--pos) / 0.14)",
              color: mappedPct < 70 ? "hsl(var(--warn))" : "hsl(var(--pos))",
            }}>
              {mappedPct}% mapped
            </div>
          </div>
          <div style={{ height: 5, background: "hsl(var(--muted))", borderRadius: 999, overflow: "hidden", display: "flex" }}>
            <div style={{ width: mappedPct + "%", background: "hsl(var(--pos))", borderRadius: 999, transition: "width .3s" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7, fontSize: 11.5, color: "hsl(var(--muted-foreground))", fontFamily: "\"Geist Mono\", ui-monospace, monospace", flexWrap: "wrap" }}>
            <span><b style={{ color: "hsl(var(--foreground) / 0.7)", fontWeight: 500 }}>{fmt(mappedAmt)}</b> matched</span>
            {pip}
            <span><b style={{ color: "hsl(var(--foreground) / 0.7)", fontWeight: 500 }}>{fmt(totalAmt - mappedAmt)}</b> pending</span>
            {pip}
            <span><b style={{ color: "hsl(var(--foreground) / 0.7)", fontWeight: 500 }}>{vpaMappings.length}</b> saved maps</span>
          </div>
        </div>

        {/* Gmail tile */}
        <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 10.5, color: "hsl(var(--muted-foreground))", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".08em", display: "flex", alignItems: "center", gap: 5 }}>
              <Mail size={11} /> Gmail
            </span>
            <span style={{ width: 20, height: 20, borderRadius: 5, display: "grid", placeItems: "center", background: "hsl(220 60% 60% / 0.14)", color: "#5b8db8" }}>
              <Mail size={11} />
            </span>
          </div>
          <div style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 18, fontWeight: 500, letterSpacing: "-.02em", lineHeight: 1.2 }}>{gmailCount}</div>
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2, fontFamily: "\"Geist Mono\", ui-monospace, monospace" }}>
            {txns.length ? Math.round(gmailCount / txns.length * 100) : 0}% of imports
          </div>
        </div>

        {/* XLS tile */}
        <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 10.5, color: "hsl(var(--muted-foreground))", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".08em", display: "flex", alignItems: "center", gap: 5 }}>
              <FileText size={11} /> XLS
            </span>
            <span style={{ width: 20, height: 20, borderRadius: 5, display: "grid", placeItems: "center", background: "hsl(var(--warn) / 0.18)", color: "hsl(var(--warn))" }}>
              <FileText size={11} />
            </span>
          </div>
          <div style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 18, fontWeight: 500, letterSpacing: "-.02em", lineHeight: 1.2 }}>{csvCount}</div>
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2, fontFamily: "\"Geist Mono\", ui-monospace, monospace" }}>
            {txns.length ? Math.round(csvCount / txns.length * 100) : 0}% of imports
          </div>
        </div>

        {/* Total Credit tile */}
        <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 10.5, color: "hsl(var(--muted-foreground))", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".08em" }}>Total credit</span>
            <span style={{ width: 20, height: 20, borderRadius: 5, display: "grid", placeItems: "center", background: "hsl(var(--pos) / 0.14)", color: "hsl(var(--pos))", fontSize: 12, fontWeight: 700 }}>â‚¹</span>
          </div>
          <div style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 18, fontWeight: 500, letterSpacing: "-.02em", lineHeight: 1.2 }}>{fmt(totalAmt)}</div>
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2, fontFamily: "\"Geist Mono\", ui-monospace, monospace" }}>
            avg {txns.length ? fmt(totalAmt / txns.length) : "â‚¹0"}
          </div>
        </div>
      </div>

      {/* â”€â”€ Two-column grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 14, padding: "14px 16px", flex: 1, overflow: "hidden" }}>

        {/* LEFT: Transaction list */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          <div style={card}>

            {/* Card header */}
            <div style={cardH}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Transactions</div>
                <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 1, fontFamily: "\"Geist Mono\", ui-monospace, monospace" }}>
                  {filteredTxns.length} of {total} Â· last 30 days
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={toggleAll} style={smBtn}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, border: allChecked ? "none" : "1.5px solid hsl(var(--border))", background: allChecked ? "hsl(var(--foreground))" : "hsl(var(--card))", display: "grid", placeItems: "center", color: "hsl(var(--background))", flexShrink: 0 }}>
                    {allChecked && <Check size={9} />}
                  </span>
                  Select all
                </button>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--background))", flexShrink: 0, flexWrap: "wrap" }}>
              {/* Search */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, padding: "3px 10px", flex: 1, maxWidth: 300, minWidth: 150 }}>
                <Search size={12} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
                <input
                  placeholder="Search name, VPA, refâ€¦"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  style={{ flex: 1, background: "transparent", border: 0, outline: 0, fontSize: 12.5, padding: "3px 0", color: "hsl(var(--foreground))" }}
                />
                {q && (
                  <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "hsl(var(--muted-foreground))", display: "grid", placeItems: "center" }}>
                    <X size={11} />
                  </button>
                )}
              </div>
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as any)} style={fieldStyle}>
                <option value="">All sources</option>
                <option value="gmail">Gmail</option>
                <option value="csv">XLS</option>
              </select>
              <select value={mappedFilter} onChange={e => setMappedFilter(e.target.value as any)} style={fieldStyle}>
                <option value="">All</option>
                <option value="true">Mapped</option>
                <option value="false">Unmapped</option>
              </select>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ ...fieldStyle, fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 12 }} />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ ...fieldStyle, fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 12 }} />
              {(q || sourceFilter || mappedFilter || dateFrom || dateTo) && (
                <button
                  onClick={() => { setQ(""); setSourceFilter(""); setMappedFilter(""); setDateFrom(""); setDateTo(""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "hsl(var(--muted-foreground))", textDecoration: "underline" }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Bulk bar */}
            {selected.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "hsl(var(--foreground))", color: "hsl(var(--background))", borderBottom: "1px solid hsl(var(--border))", flexShrink: 0 }}>
                <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontWeight: 500, background: "rgba(255,255,255,.1)", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>
                  {selected.size} selected
                </span>
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => setSelected(new Set())}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "transparent", border: "1px solid rgba(255,255,255,.2)", color: "hsl(var(--background))", cursor: "pointer" }}
                >
                  <X size={11} /> Clear
                </button>
              </div>
            )}

            {/* Transaction scroll */}
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingBottom: 12 }}>
              {loading ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "hsl(var(--muted-foreground))", fontSize: 13 }}>Loadingâ€¦</div>
              ) : grouped.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "hsl(var(--muted-foreground))" }}>
                  <div style={{ width: 44, height: 44, margin: "0 auto 12px", background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))", borderRadius: 12, display: "grid", placeItems: "center" }}>
                    <Search size={18} />
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: "hsl(var(--foreground) / 0.7)", marginBottom: 4 }}>No transactions found</div>
                  <div style={{ fontSize: 12.5 }}>Try clearing filters or adjusting the date range.</div>
                </div>
              ) : grouped.map(([date, list]) => {
                const daySum = list.reduce((s, t) => s + parseFloat(t.amount || "0"), 0);
                const dateObj = new Date(date + "T00:00:00");
                const dayLabel = dateObj.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
                return (
                  <div key={date}>
                    {/* Day header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px 4px", fontSize: 10.5, color: "hsl(var(--muted-foreground))", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em" }}>
                      <span>{dayLabel}</span>
                      <span style={{ flex: 1, height: 1, background: "hsl(var(--border))" }} />
                      <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", color: "hsl(var(--foreground) / 0.65)", fontWeight: 500, letterSpacing: 0 }}>{fmt(daySum)}</span>
                      <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", color: "hsl(var(--muted-foreground) / 0.6)", fontWeight: 400, letterSpacing: 0, fontSize: 10 }}>{list.length} txns</span>
                    </div>
                    {/* Rows */}
                    {list.map(t => {
                      const isSel = selected.has(t.id);
                      const SrcIcon = t.source === "gmail" ? Mail : FileText;
                      return (
                        <TxRow
                          key={t.id}
                          t={t}
                          isSel={isSel}
                          SrcIcon={SrcIcon}
                          onToggle={() => toggleOne(t.id)}
                          onView={() => setDetailTxn(t)}
                          onMap={() => openMapForTxn(t)}
                          onUnmap={() => handleUnmap(t)}
                          onDelete={() => setDeleteTxn(t)}
                        />
                      );
                    })}
                  </div>
                );
              })}
              {txns.length > 0 && (
                <div style={{ padding: "8px 14px", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                  Showing {filteredTxns.length} of {total} transactions
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Mapping cockpit */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          <div style={card}>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, padding: "0 12px", background: "hsl(var(--secondary))", borderBottom: "1px solid hsl(var(--border))", flexShrink: 0 }}>
              {([
                { id: "map" as const, label: "Map VPAs", icon: <Link2 size={13} />, count: unmappedVpaCount },
                { id: "saved" as const, label: "Saved", icon: <Database size={13} />, count: vpaMappings.length },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setCockpitTab(tab.id)}
                  style={{
                    padding: "11px 13px", fontSize: 12.5, fontWeight: 500,
                    color: cockpitTab === tab.id ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                    borderBottom: cockpitTab === tab.id ? "2px solid hsl(var(--foreground))" : "2px solid transparent",
                    marginBottom: -1,
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "none", border: "none", cursor: "pointer",
                    transition: "color .12s",
                  }}
                >
                  {tab.icon} {tab.label}
                  <span style={{
                    fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 10,
                    background: cockpitTab === tab.id ? "hsl(var(--foreground))" : "hsl(var(--muted))",
                    color: cockpitTab === tab.id ? "hsl(var(--background))" : "hsl(var(--muted-foreground))",
                    padding: "1px 5px", borderRadius: 999,
                  }}>
                    {tab.count}
                  </span>
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {cockpitTab === "map" && (
                <button
                  onClick={() => setShowUnmappedOnly(v => !v)}
                  style={{
                    margin: "6px 0", padding: "4px 9px", borderRadius: 6, fontSize: 11.5, fontWeight: 500,
                    background: showUnmappedOnly ? "hsl(var(--foreground))" : "transparent",
                    border: "none",
                    color: showUnmappedOnly ? "hsl(var(--background))" : "hsl(var(--muted-foreground))",
                    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
                  }}
                >
                  <Filter size={11} /> Unmapped
                </button>
              )}
            </div>

            {/* Cockpit body */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>

              {/* Map VPAs tab â€” VPA list */}
              {cockpitTab === "map" && !selectedVpa && (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "0 2px" }}>
                    <span style={{ fontSize: 11.5, color: "hsl(var(--muted-foreground))" }}>{filteredVpas.length} VPAs</span>
                    <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 10.5, color: "hsl(var(--muted-foreground))", border: "1px solid hsl(var(--border))", borderRadius: 4, padding: "1px 5px", background: "hsl(var(--secondary))" }}>
                      click to map
                    </span>
                  </div>
                  {vpaLoading ? (
                    <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Loadingâ€¦</div>
                  ) : filteredVpas.length === 0 ? (
                    <EmptyState icon={<Check size={18} />} title="Nothing to map" body="All VPAs in the last 6 months are mapped." />
                  ) : filteredVpas.map(v => (
                    <VpaCard key={v.vpa} v={v} isMapped={mappedVpaSet.has(v.vpa)} onClick={() => handleSelectVpa(v)} />
                  ))}
                </>
              )}

              {/* Map VPAs tab â€” selected VPA with suggestions */}
              {cockpitTab === "map" && selectedVpa && (
                <>
                  {/* Selected VPA */}
                  <div style={{ background: "hsl(var(--card))", border: "2px solid hsl(var(--foreground))", borderRadius: 10, padding: "10px 12px", marginBottom: 14, boxShadow: "0 0 0 3px hsl(var(--primary) / 0.2)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 12, color: "hsl(var(--muted-foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{selectedVpa.vpa}</span>
                      <button
                        onClick={() => { setSelectedVpa(null); setFuzzySuggestions([]); setCustomerSearch(""); }}
                        style={{ width: 26, height: 26, borderRadius: 5, display: "grid", placeItems: "center", background: "none", border: "none", cursor: "pointer", color: "hsl(var(--muted-foreground))", flexShrink: 0 }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 2 }}>{selectedVpa.sender_name || "â€”"}</div>
                    <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 5, fontFamily: "\"Geist Mono\", ui-monospace, monospace" }}>
                      <b style={{ color: "hsl(var(--foreground) / 0.65)" }}>{selectedVpa.count}</b>Ã— txns
                    </div>
                  </div>

                  {/* AI Suggestions */}
                  {fuzzySuggestions.length > 0 && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", marginBottom: 8, padding: "0 2px", fontSize: 11, color: "hsl(var(--muted-foreground))", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".08em" }}>
                        <Sparkles size={11} style={{ marginRight: 5, color: "hsl(var(--primary))" }} />
                        AI suggestions
                      </div>
                      {fuzzySuggestions.map(s => {
                        const scoreColor = s.score >= 80 ? "hsl(var(--pos))" : s.score >= 60 ? "hsl(var(--warn))" : "hsl(var(--muted-foreground))";
                        const scoreBg = s.score >= 80 ? "hsl(var(--pos) / 0.14)" : s.score >= 60 ? "hsl(var(--warn) / 0.18)" : "hsl(var(--muted))";
                        return (
                          <SuggestionCard
                            key={`${s.type}_${s.customer_id}`}
                            type={s.type} id={s.customer_id} name={s.customer_name}
                            score={s.score} scoreColor={scoreColor} scoreBg={scoreBg}
                            onClick={() => saveVpaMapping(selectedVpa.vpa, s.customer_id, s.type, s.customer_name)}
                          />
                        );
                      })}
                    </>
                  )}

                  {/* Search all */}
                  <div style={{ margin: "14px 2px 8px", fontSize: 11, color: "hsl(var(--muted-foreground))", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".08em" }}>
                    Search all
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, padding: "4px 10px", marginBottom: 8 }}>
                    <Search size={13} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
                    <input
                      placeholder="Name or customer IDâ€¦"
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      autoFocus
                      style={{ flex: 1, background: "transparent", border: 0, outline: 0, fontSize: 12.5, padding: "3px 0", color: "hsl(var(--foreground))" }}
                    />
                  </div>
                  {filteredCustomers.length === 0 ? (
                    <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "hsl(var(--muted-foreground))" }}>No customers found</div>
                  ) : filteredCustomers.map(c => (
                    <SuggestionCard
                      key={`${c.type}_${c.customer_id}`}
                      type={c.type} id={c.customer_id} name={c.customer_name}
                      meta={`bal ${fmt(c.balance)}`}
                      onClick={() => saveVpaMapping(selectedVpa.vpa, c.customer_id, c.type, c.customer_name)}
                    />
                  ))}
                </>
              )}

              {/* Saved tab */}
              {cockpitTab === "saved" && (
                vpaMappings.length === 0 ? (
                  <EmptyState icon={<Database size={18} />} title="No saved mappings yet" body="Map a VPA to a customer and it'll appear here." />
                ) : (
                  <div style={{ marginTop: -12, marginLeft: -12, marginRight: -12 }}>
                    {vpaMappings.map(m => (
                      <div
                        key={m.id}
                        style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "9px 14px", borderBottom: "1px solid hsl(var(--border) / 0.5)", transition: "background-color .12s" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "hsl(var(--secondary))"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                            <TypeBadge type={m.customer_type} />
                            <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>#{m.customer_id}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.customer_name}</span>
                          </div>
                          <div style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 11, color: "hsl(var(--muted-foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.upi_vpa}</div>
                        </div>
                        <IBtn onClick={() => handleDeleteVpaMapping(m.id)} title="Remove" danger>
                          <Trash2 size={13} />
                        </IBtn>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* â”€â”€ Detail Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {detailTxn && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", padding: 40, background: "hsl(var(--foreground) / 0.25)", backdropFilter: "blur(2px)" }} onClick={() => setDetailTxn(null)}>
          <div style={{ width: "100%", maxWidth: 460, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 16, boxShadow: "0 18px 50px rgba(0,0,0,.15)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid hsl(var(--border))" }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Transaction details</h3>
              <IBtn onClick={() => setDetailTxn(null)}><X size={14} /></IBtn>
            </div>
            <div style={{ padding: "4px 18px", maxHeight: "65vh", overflowY: "auto" }}>
              {([
                ["Ref",      <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 12 }}>{detailTxn.upi_ref_no}</span>],
                ["Date",     new Date(detailTxn.transaction_date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })],
                ["Amount",   <span style={{ color: detailTxn.transaction_type === "credit" ? "hsl(var(--pos))" : "hsl(var(--neg))", fontWeight: 500, fontSize: 15, fontFamily: "\"Geist Mono\", ui-monospace, monospace" }}>{detailTxn.transaction_type === "credit" ? "+" : "âˆ’"}{fmtFull(parseFloat(detailTxn.amount))}</span>],
                ["Source",   <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: detailTxn.source === "gmail" ? "hsl(220 60% 60% / 0.14)" : "hsl(var(--warn) / 0.18)", color: detailTxn.source === "gmail" ? "#5b8db8" : "hsl(var(--warn))" }}>{detailTxn.source === "gmail" ? <Mail size={10} /> : <FileText size={10} />} {detailTxn.source === "gmail" ? "Gmail" : "XLS"}</span>],
                ["Sender",   detailTxn.sender_name || "â€”"],
                ["VPA",      <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 12 }}>{detailTxn.sender_vpa || "â€”"}</span>],
                ["Notes",    detailTxn.notes || "â€”"],
                ["Customer", detailTxn.mapped_customer_id
                  ? <span style={{ color: "hsl(var(--pos))" }}><span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", textTransform: "uppercase" as const, fontSize: 10, marginRight: 6 }}>{detailTxn.mapped_customer_type}</span>#{detailTxn.mapped_customer_id} Â· {detailTxn.mapped_customer_name}</span>
                  : <span style={{ color: "hsl(var(--muted-foreground))", fontStyle: "italic" }}>not mapped</span>],
              ] as [string, ReactNode][]).map(([k, v]) => (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 12, alignItems: "baseline", padding: "7px 0", borderBottom: "1px solid hsl(var(--border) / 0.4)", fontSize: 12.5 }}>
                  <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".06em", fontSize: 10.5 }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid hsl(var(--border))", background: "hsl(var(--secondary))", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setDetailTxn(null)} style={smBtn}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Delete Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {deleteTxn && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", padding: 40, background: "hsl(var(--foreground) / 0.25)", backdropFilter: "blur(2px)" }} onClick={() => setDeleteTxn(null)}>
          <div style={{ width: "100%", maxWidth: 400, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 16, boxShadow: "0 18px 50px rgba(0,0,0,.15)" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 22 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "hsl(var(--neg) / 0.15)", color: "hsl(var(--neg))", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Trash2 size={16} />
                </div>
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 500 }}>Delete transaction</h3>
                  <p style={{ margin: 0, fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.5 }}>
                    Remove UPI ref <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 12 }}>{deleteTxn.upi_ref_no}</span> for{" "}
                    <b style={{ color: "hsl(var(--foreground) / 0.7)" }}>{fmtFull(parseFloat(deleteTxn.amount))}</b>? This cannot be undone.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setDeleteTxn(null)} style={smBtn}>Cancel</button>
                <button onClick={handleDelete} style={{ ...smBtn, background: "hsl(var(--neg))", border: "none", color: "#fff" }}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Toast â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", background: "hsl(var(--foreground))", color: "hsl(var(--background))", padding: "9px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 500, boxShadow: "0 18px 50px rgba(0,0,0,.15)", display: "flex", alignItems: "center", gap: 8, zIndex: 100, whiteSpace: "nowrap" }}>
          {toast.type === "success" ? <Check size={14} /> : <X size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TxRow({ t, isSel, SrcIcon, onToggle, onView, onMap, onUnmap, onDelete }: {
  t: UpiTxn;
  isSel: boolean;
  SrcIcon: ElementType;
  onToggle: () => void;
  onView: () => void;
  onMap: () => void;
  onUnmap: () => void;
  onDelete: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "20px 26px 1fr auto auto",
        gap: 10, alignItems: "center",
        padding: "9px 14px",
        borderBottom: "1px solid hsl(var(--border) / 0.5)",
        background: isSel ? "hsl(var(--primary) / 0.12)" : hov ? "hsl(var(--secondary))" : undefined,
        transition: "background-color .12s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        style={{ width: 16, height: 16, borderRadius: 4, border: isSel ? "none" : "1.5px solid hsl(var(--border))", background: isSel ? "hsl(var(--foreground))" : "hsl(var(--card))", display: "grid", placeItems: "center", color: "hsl(var(--background))", cursor: "pointer", flexShrink: 0 }}
      >
        {isSel && <Check size={9} />}
      </button>

      {/* Source icon */}
      <div style={{ width: 26, height: 26, borderRadius: 6, display: "grid", placeItems: "center", background: t.source === "gmail" ? "hsl(220 60% 60% / 0.14)" : "hsl(var(--warn) / 0.18)", color: t.source === "gmail" ? "#5b8db8" : "hsl(var(--warn))", flexShrink: 0 }}>
        <SrcIcon size={13} />
      </div>

      {/* Body */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
          {t.sender_name || <span style={{ fontSize: 10, fontStyle: "italic", color: "hsl(var(--muted-foreground) / 0.6)", fontWeight: 400 }}>no sender name</span>}
        </div>
        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontFamily: "\"Geist Mono\", ui-monospace, monospace", marginTop: 1, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{t.sender_vpa || "â€”"}</span>
          <span style={{ width: 3, height: 3, borderRadius: 999, background: "hsl(var(--muted-foreground) / 0.4)", display: "inline-block", flexShrink: 0 }} />
          <span>{t.upi_ref_no.slice(-8)}</span>
          {t.mapped_customer_id && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px", borderRadius: 999, background: "hsl(var(--pos) / 0.14)", color: "hsl(var(--pos))", fontFamily: "inherit", fontWeight: 500, fontSize: 10.5 }}>
              <Check size={9} />
              <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 9, padding: "0 3px", borderRadius: 3, background: "rgba(255,255,255,.45)", color: "hsl(var(--foreground) / 0.6)", textTransform: "uppercase" }}>{t.mapped_customer_type}</span>
              {t.mapped_customer_name || "#" + t.mapped_customer_id}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontWeight: 500, fontSize: 14, letterSpacing: "-.01em", color: t.transaction_type === "credit" ? "hsl(var(--pos))" : "hsl(var(--neg))", whiteSpace: "nowrap" }}>
        {t.transaction_type === "credit" ? "+" : "âˆ’"}â‚¹{Math.round(parseFloat(t.amount)).toLocaleString("en-IN")}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 1, opacity: hov || isSel ? 1 : 0, transition: "opacity .12s" }}>
        <IBtn onClick={onView} title="Details"><Eye size={13} /></IBtn>
        <IBtn onClick={onMap} title="Map to customer"><Link2 size={13} /></IBtn>
        {t.mapped_customer_id && <IBtn onClick={onUnmap} title="Remove mapping"><Unlink size={13} /></IBtn>}
        <IBtn onClick={onDelete} title="Delete" danger><Trash2 size={13} /></IBtn>
      </div>
    </div>
  );
}

function VpaCard({ v, isMapped, onClick }: { v: UniqueVpa; isMapped: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: "hsl(var(--card))", border: `1px solid ${hov ? "hsl(var(--muted-foreground))" : "hsl(var(--border))"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 7, cursor: "pointer", transition: "border-color .12s" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 12, color: "hsl(var(--muted-foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{v.vpa}</span>
        {isMapped && <Check size={14} style={{ color: "hsl(var(--pos))", flexShrink: 0, marginLeft: 6 }} />}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {v.sender_name || <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 400, fontStyle: "italic" }}>no name</span>}
      </div>
      <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 5, fontFamily: "\"Geist Mono\", ui-monospace, monospace" }}>
        <b style={{ color: "hsl(var(--foreground) / 0.65)" }}>{v.count}</b>Ã— txns
      </div>
    </div>
  );
}

function SuggestionCard({ type, id, name, score, scoreColor, scoreBg, meta, onClick }: {
  type: string; id: number; name: string;
  score?: number; scoreColor?: string; scoreBg?: string;
  meta?: string;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? "hsl(var(--card))" : "hsl(var(--secondary))", border: `1px solid ${hov ? "hsl(var(--muted-foreground))" : "hsl(var(--border))"}`, borderRadius: 8, padding: "9px 11px", marginBottom: 5, display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", cursor: "pointer", transition: "background-color .12s, border-color .12s" }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
          <TypeBadge type={type} />
          <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>#{id}</span>
          {score !== undefined && (
            <div style={{ marginLeft: "auto", width: 56, height: 3, background: "hsl(var(--muted))", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: score + "%", height: "100%", borderRadius: 999, background: scoreColor }} />
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
      </div>
      {score !== undefined && (
        <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 11, padding: "2px 7px", borderRadius: 999, fontWeight: 500, background: scoreBg, color: scoreColor, whiteSpace: "nowrap" }}>
          {Math.round(score)}%
        </span>
      )}
      {meta && (
        <span style={{ fontFamily: "\"Geist Mono\", ui-monospace, monospace", fontSize: 11, color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>{meta}</span>
      )}
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "hsl(var(--muted-foreground))" }}>
      <div style={{ width: 44, height: 44, margin: "0 auto 12px", background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))", borderRadius: 12, display: "grid", placeItems: "center" }}>
        {icon}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 500, color: "hsl(var(--foreground) / 0.7)", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12.5 }}>{body}</div>
    </div>
  );
}
