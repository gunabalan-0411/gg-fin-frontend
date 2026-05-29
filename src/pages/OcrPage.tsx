import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Scan,
  Send,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  ClipboardList,
  RefreshCw,
  RotateCcw,
  Wifi,
  CheckCircle,
  Strikethrough,
  Plus,
  ZoomIn,
  ZoomOut,
  Download,
  Search,
  Layers,
  Undo2,
  Redo2,
} from "lucide-react";
import { useIsMobile } from "@/hooks/useBreakpoint";
import { ocrApi, upiApi, expensesApi, customersApi } from "@/services/api";
import { CustomerStepOverlay } from "@/components/CustomerStepOverlay";
import toast from "react-hot-toast";

// ── Types ─────────────────────────────────────────────────────────────────────
type Suggestion = { id: number; name: string; score: number; balance?: number };

type Row = {
  uid: string;
  collection_date: string;
  customer_name: string;
  customer_id: number | null;
  product_type: "EDI" | "IOP";
  payment_mode: "CASH" | "ONLINE";
  is_paid: boolean;
  amount: number;
  confidence_score: number;
  notes: string;
  customer_suggestions: Suggestion[];
};

type UpiTxn = {
  id: number;
  upi_ref_no: string;
  amount: string;
  transaction_type: "credit" | "debit";
  sender_vpa: string | null;
  sender_name: string | null;
  notes: string | null;
  transaction_date: string;
  mapped_customer_name: string | null;
  mapped_customer_id: number | null;
  mapped_customer_type: string | null;
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function mkUid() {
  return Math.random().toString(36).slice(2, 9);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Per-model timing (persisted in localStorage) ───────────────────────────────
const MODEL_TIMING_KEY = "ocr_model_timings";
type ModelTiming = { count: number; avgMs: number };

function loadModelTimings(): Record<string, ModelTiming> {
  try { return JSON.parse(localStorage.getItem(MODEL_TIMING_KEY) ?? "{}"); }
  catch { return {}; }
}

function saveModelTiming(model: string, elapsedMs: number): void {
  const t = loadModelTimings();
  const prev = t[model] ?? { count: 0, avgMs: 0 };
  const n = prev.count + 1;
  t[model] = { count: n, avgMs: (prev.avgMs * prev.count + elapsedMs) / n };
  try { localStorage.setItem(MODEL_TIMING_KEY, JSON.stringify(t)); } catch {}
}

function getModelAvgMs(model: string): number {
  return loadModelTimings()[model]?.avgMs ?? 0;
}

function getModelRunCount(model: string): number {
  return loadModelTimings()[model]?.count ?? 0;
}

function httpError(err: any): string {
  const status: number | undefined = err?.response?.status;
  const detail: string | undefined = err?.response?.data?.detail;
  if (err?.code === "ERR_NETWORK" || err?.code === "ECONNABORTED")
    return "Cannot reach the server. The backend may be restarting — wait 30 seconds and try again.";
  if (status === 413)
    return "File too large (server limit: 50 MB). Try compressing the PDF first.";
  if (status === 400) return detail || "Invalid file. Make sure you selected a PDF.";
  if (status === 401) return "Session expired — please log in again.";
  if (status === 503)
    return detail || "Service unavailable. GEMINI_API_KEY may not be configured in Railway.";
  if (status === 502 || status === 504)
    return `Gateway error (${status}). The backend is not responding — it may still be starting up. Try again in 30 seconds.`;
  if (detail?.includes("RESOURCE_EXHAUSTED") || detail?.includes("Quota exceeded"))
    return "Gemini API quota exceeded (free tier limit reached). Enable billing on your Google Cloud project at console.cloud.google.com to continue.";
  if (status === 500) return detail || "Internal server error. Check the backend logs in Railway.";
  if (detail) return detail;
  return err?.message || "Something went wrong. Please try again.";
}

function confidenceDotClass(score: number) {
  if (score >= 0.95) return "bg-green-500";
  if (score >= 0.85) return "bg-amber-400";
  return "bg-red-500";
}

function confidenceTextClass(score: number) {
  if (score >= 0.95) return "text-muted-foreground";
  if (score >= 0.85) return "text-amber-500 dark:text-amber-400";
  return "text-red-500";
}

function ddmmyyyyToInput(dmy: string) {
  const parts = dmy.split("-");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function inputToDdmmyyyy(ymd: string) {
  const parts = ymd.split("-");
  if (parts.length !== 3) return "";
  const [y, m, d] = parts;
  return `${d}-${m}-${y}`;
}

function ddmmToYyyyMmDd(dmy: string): string {
  const parts = dmy.split("-");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function fmtTxnDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parts[2]} ${months[parseInt(parts[1], 10) - 1] ?? ""} ${parts[0]}`;
}

// ── SkeletonRow ───────────────────────────────────────────────────────────────
const SKEL_WIDTHS = [72, 55, 83, 61, 78, 52, 68, 45];
function SkeletonRow({ index }: { index: number }) {
  const delay = `${index * 90}ms`;
  return (
    <tr className="border-b border-border/40">
      <td className="pl-3 pr-1 py-3.5">
        <div className="h-2 w-2 rounded-full bg-muted animate-pulse" style={{ animationDelay: delay }} />
      </td>
      <td className="px-1 py-3.5">
        <div className="h-2.5 rounded-md bg-muted animate-pulse" style={{ width: `${SKEL_WIDTHS[index % SKEL_WIDTHS.length]}%`, animationDelay: delay }} />
      </td>
      <td className="px-1 py-3.5 w-28">
        <div className="h-2.5 w-[72px] rounded-md bg-muted animate-pulse" style={{ animationDelay: `${index * 90 + 25}ms` }} />
      </td>
      <td className="px-1 py-3.5 w-12 text-center">
        <div className="h-5 w-8 rounded-md bg-muted animate-pulse mx-auto" style={{ animationDelay: `${index * 90 + 50}ms` }} />
      </td>
      <td className="px-1 py-3.5 w-20">
        <div className="h-5 w-12 rounded-full bg-muted animate-pulse" style={{ animationDelay: `${index * 90 + 75}ms` }} />
      </td>
      <td className="px-1 py-3.5 w-24 text-right">
        <div className="h-2.5 w-14 rounded-md bg-muted animate-pulse ml-auto" style={{ animationDelay: `${index * 90 + 100}ms` }} />
      </td>
      <td className="px-3 py-3.5 w-14 text-right">
        <div className="h-2.5 w-7 rounded-md bg-muted animate-pulse ml-auto" style={{ animationDelay: `${index * 90 + 125}ms` }} />
      </td>
      <td className="pr-2 w-6" />
    </tr>
  );
}

// ── CustomerCombobox ──────────────────────────────────────────────────────────
function CustomerCombobox({
  row,
  onChange,
  fetchSuggestions,
  compact,
}: {
  row: Row;
  onChange: (name: string, id: number | null) => void;
  fetchSuggestions?: (query: string, productType: "EDI" | "IOP") => Promise<Suggestion[]>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [liveSuggestions, setLiveSuggestions] = useState<Suggestion[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (value: string) => {
    onChange(value, null);
    if (!fetchSuggestions) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (value.trim().length >= 2) {
        const results = await fetchSuggestions(value.trim(), row.product_type);
        setLiveSuggestions(results);
      } else {
        setLiveSuggestions([]);
      }
    }, 200);
  };

  const suggestions = fetchSuggestions
    ? liveSuggestions.length > 0 ? liveSuggestions : row.customer_suggestions
    : row.customer_suggestions;

  if (compact) {
    return (
      <div className="relative w-full">
        <input
          type="text"
          value={row.customer_name}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          placeholder="Customer…"
          className={`w-full text-[12.5px] bg-transparent border-0 outline-0 px-1.5 py-1 rounded transition-all
            hover:bg-muted focus:bg-card focus:shadow-[0_0_0_2px_hsl(var(--foreground)),0_0_0_4px_hsl(var(--primary)/0.35)]
            ${!row.customer_id ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}
        />
        {open && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-2xl overflow-hidden min-w-[220px]">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onMouseDown={() => {
                  onChange(s.name, s.id);
                  setLiveSuggestions([]);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary text-left gap-3 text-[12.5px]"
              >
                <span className="font-medium truncate">{s.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-mono font-semibold ${
                  s.score >= 0.9 ? "bg-green-500/15 text-green-600 dark:text-green-400"
                  : s.score >= 0.75 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-red-500/15 text-red-400"
                }`}>
                  {Math.round(s.score * 100)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-w-0">
      <input
        type="text"
        value={row.customer_name}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        className={`w-full text-sm rounded-lg border px-3 py-1.5 bg-background focus:outline-none focus:ring-2 pr-7 ${
          row.customer_id
            ? "border-green-500/40 focus:ring-green-500/20"
            : "border-amber-500/40 focus:ring-amber-500/20"
        }`}
        placeholder="Customer name…"
      />
      {!row.customer_id && (
        <AlertTriangle className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-amber-400 pointer-events-none" />
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.id}
              onMouseDown={() => {
                onChange(s.name, s.id);
                setLiveSuggestions([]);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary text-sm text-left gap-3"
            >
              <span className="font-medium truncate">{s.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-semibold ${
                s.score >= 0.9 ? "bg-green-500/20 text-green-600 dark:text-green-400"
                : s.score >= 0.75 ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                : "bg-red-500/20 text-red-400"
              }`}>
                {Math.round(s.score * 100)}%
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── RecordCard (mobile) ───────────────────────────────────────────────────────
function RecordCard({
  row,
  onUpdate,
  onDelete,
  fetchSuggestions,
}: {
  row: Row;
  onUpdate: (uid: string, patch: Partial<Row>) => void;
  onDelete: (uid: string) => void;
  fetchSuggestions?: (query: string, productType: "EDI" | "IOP") => Promise<Suggestion[]>;
}) {
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${
      row.customer_id ? "border-border" : "border-amber-500/30 bg-amber-500/5"
    }`}>
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${confidenceDotClass(row.confidence_score)}`}
          title={`Confidence: ${Math.round(row.confidence_score * 100)}%`} />
        <CustomerCombobox
          row={row}
          onChange={(name, id) => onUpdate(row.uid, { customer_name: name, customer_id: id })}
          fetchSuggestions={fetchSuggestions}
        />
        <button onClick={() => onDelete(row.uid)}
          className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <input type="date" value={ddmmyyyyToInput(row.collection_date)}
          onChange={(e) => onUpdate(row.uid, { collection_date: inputToDdmmyyyy(e.target.value) })}
          className="text-xs rounded-lg border border-border px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20" />
        <button onClick={() => onUpdate(row.uid, { product_type: row.product_type === "EDI" ? "IOP" : "EDI", customer_name: "", customer_id: null, customer_suggestions: [] })}
          className={`text-xs px-2 py-1 rounded-lg font-bold transition-colors ${
            row.product_type === "IOP"
              ? "bg-orange-500/15 text-orange-700 dark:text-orange-400"
              : "bg-blue-500/15 text-blue-700 dark:text-blue-400"
          }`}>{row.product_type}</button>
        <button onClick={() => {
          const next = row.payment_mode === "CASH" ? "ONLINE" : "CASH";
          onUpdate(row.uid, { payment_mode: next, is_paid: next === "CASH" });
        }} className={`text-xs px-2 py-1 rounded-lg font-bold transition-colors ${
          row.payment_mode === "ONLINE" ? "bg-sky-500/15 text-sky-700 dark:text-sky-400" : "bg-muted text-muted-foreground"
        }`}>{row.payment_mode}</button>
        {row.payment_mode === "ONLINE" && (
          <button onClick={() => onUpdate(row.uid, { is_paid: !row.is_paid })}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg font-medium transition-all ${
              row.is_paid ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
            }`}>
            <span className={`h-3.5 w-3.5 rounded-sm border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              row.is_paid ? "bg-emerald-500 border-emerald-500" : "border-current bg-transparent"
            }`}>
              {row.is_paid && (
                <svg viewBox="0 0 10 8" className="h-2 w-2 fill-white">
                  <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            {row.is_paid ? "Paid" : "Unpaid"}
          </button>
        )}
        <div className="flex items-center border border-border rounded-lg px-2 py-1 bg-background ml-auto">
          <span className="text-xs text-muted-foreground mr-1">₹</span>
          <input type="number" value={row.amount || ""}
            onChange={(e) => onUpdate(row.uid, { amount: Number(e.target.value) })}
            className="w-20 text-sm font-semibold bg-transparent focus:outline-none" />
        </div>
      </div>
      {row.notes && <p className="text-xs text-muted-foreground italic pl-4">{row.notes}</p>}
    </div>
  );
}

// ── DateConfirmModal ─────────────────────────────────────────────────────────
// Right-side slide panel (mirrors ExpenseStepPanel) so the PDF stays visible
// while the user corrects extracted dates.
function DateConfirmModal({
  pendingRows,
  onConfirm,
  onCancel,
}: {
  pendingRows: Row[];
  onConfirm: (dateMap: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const isMobile = useIsMobile();
  const uniqueDates = [...new Set(pendingRows.map((r) => r.collection_date).filter(Boolean))].sort();

  const [dateMap, setDateMap] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    uniqueDates.forEach((d) => { init[d] = d; });
    return init;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  const body = (
    <>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-secondary border-b border-border flex-shrink-0">
        <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-background">2</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Confirm Dates</p>
          <p className="text-[11px] text-muted-foreground">
            {uniqueDates.length === 1
              ? "Correct the date if the AI got it wrong."
              : `AI found ${uniqueDates.length} dates — correct any that look wrong.`}
          </p>
        </div>
      </div>

      {/* Date list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {uniqueDates.map((origDate) => {
          const count = pendingRows.filter((r) => r.collection_date === origDate).length;
          const changed = dateMap[origDate] && dateMap[origDate] !== origDate;
          return (
            <div key={origDate} className={`rounded-xl border p-3 transition-colors ${
              changed ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-background"
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground/60">
                  {count} record{count !== 1 ? "s" : ""}
                </span>
                {changed && (
                  <span className="text-[10px] text-amber-500 font-medium">edited</span>
                )}
              </div>
              <input
                type="date"
                value={ddmmyyyyToInput(dateMap[origDate] ?? origDate)}
                onChange={(e) =>
                  setDateMap((prev) => ({ ...prev, [origDate]: inputToDdmmyyyy(e.target.value) }))
                }
                className="w-full text-sm font-mono rounded-lg border border-border px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-foreground/15"
              />
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 p-4 border-t border-border bg-secondary flex-shrink-0">
        <button
          onClick={() => onConfirm(dateMap)}
          className="w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/85 transition-colors"
        >
          Confirm Dates
        </button>
        <button
          onClick={onCancel}
          className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          Cancel
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return <div className="fixed inset-0 z-50 flex flex-col bg-card">{body}</div>;
  }
  return (
    <div className="fixed right-0 top-0 bottom-0 z-40 flex flex-col bg-card border-l border-border shadow-2xl" style={{ width: 360 }}>
      {body}
    </div>
  );
}

// ── AddRowModal ───────────────────────────────────────────────────────────────
function AddRowModal({
  open, defaultDate, onClose, onAdd, fetchSuggestions,
}: {
  open: boolean;
  defaultDate: string;
  onClose: () => void;
  onAdd: (row: Omit<Row, "uid" | "confidence_score" | "notes" | "customer_suggestions">) => void;
  fetchSuggestions: (query: string, productType: "EDI" | "IOP") => Promise<Suggestion[]>;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [productType, setProductType] = useState<"EDI" | "IOP">("EDI");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "ONLINE">("CASH");
  const [isPaid, setIsPaid] = useState(true);
  const [amount, setAmount] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sugOpen, setSugOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setCustomerName(""); setCustomerId(null);
      setProductType("EDI"); setPaymentMode("CASH"); setIsPaid(true);
      setAmount(""); setSuggestions([]);
    }
  }, [open, defaultDate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleNameChange = (value: string) => {
    setCustomerName(value); setCustomerId(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (value.trim().length >= 2) setSuggestions(await fetchSuggestions(value.trim(), productType));
      else setSuggestions([]);
    }, 200);
  };

  const handleAdd = () => {
    if (!customerId || !amount || Number(amount) <= 0) return;
    onAdd({ collection_date: date, customer_name: customerName, customer_id: customerId,
      product_type: productType, payment_mode: paymentMode, is_paid: isPaid, amount: Number(amount) });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Add Transaction</h3>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Customer</label>
          <div className="relative">
            <input type="text" value={customerName} onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => setSugOpen(true)} onBlur={() => setTimeout(() => setSugOpen(false), 160)}
              placeholder="Type to search…"
              className={`w-full text-sm rounded-lg border px-3 py-2 bg-background focus:outline-none focus:ring-2 ${
                customerId ? "border-emerald-500/40 focus:ring-emerald-500/20" : "border-border focus:ring-foreground/10"
              }`} />
            {customerId && <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 pointer-events-none" />}
            {sugOpen && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                {suggestions.map((s) => (
                  <button key={s.id} onMouseDown={() => { setCustomerName(s.name); setCustomerId(s.id); setSuggestions([]); setSugOpen(false); setTimeout(() => amountRef.current?.focus(), 50); }}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/60 text-sm text-left gap-3">
                    <span className="font-medium truncate">{s.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-semibold ${
                      s.score >= 0.9 ? "bg-green-500/20 text-green-600 dark:text-green-400"
                      : s.score >= 0.75 ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      : "bg-red-500/20 text-red-400"
                    }`}>{Math.round(s.score * 100)}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Date</label>
            <input type="date" value={ddmmyyyyToInput(date)} onChange={(e) => setDate(inputToDdmmyyyy(e.target.value))}
              className="w-full text-sm rounded-lg border border-border px-2.5 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Product</label>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["EDI", "IOP"] as const).map((p) => (
                <button key={p} onClick={() => setProductType(p)}
                  className={`px-3 py-2 text-xs font-bold transition-colors ${
                    productType === p
                      ? p === "IOP" ? "bg-orange-500/15 text-orange-700 dark:text-orange-400" : "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                      : "text-muted-foreground hover:bg-muted/40"
                  }`}>{p}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Amount</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center border border-border rounded-lg px-3 py-2 bg-background focus-within:ring-1 focus-within:ring-foreground/20">
              <span className="text-sm text-muted-foreground mr-1">₹</span>
              <input ref={amountRef} type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()} placeholder="0"
                className="flex-1 text-sm font-semibold bg-transparent focus:outline-none" />
            </div>
            <button onClick={() => { const next = paymentMode === "CASH" ? "ONLINE" : "CASH"; setPaymentMode(next); setIsPaid(next === "CASH"); }}
              className={`text-xs px-3 py-2 rounded-lg font-bold transition-colors flex-shrink-0 ${
                paymentMode === "ONLINE" ? "bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/25"
                : "bg-muted text-muted-foreground border border-border"
              }`}>{paymentMode}</button>
          </div>
        </div>
        {paymentMode === "ONLINE" && (
          <button onClick={() => setIsPaid((v) => !v)}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all border ${
              isPaid ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
            }`}>
            <span className={`h-4 w-4 rounded-sm border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              isPaid ? "bg-emerald-500 border-emerald-500" : "border-current bg-transparent"
            }`}>
              {isPaid && <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-white"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </span>
            {isPaid ? "Marked as Paid" : "Marked as Unpaid"}
          </button>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted/40 transition-colors">Cancel</button>
          <button onClick={handleAdd} disabled={!customerId || !amount || Number(amount) <= 0}
            className="flex-1 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Add Transaction
          </button>
        </div>
      </div>
    </div>
  );
}

// ── OcrTableRow (desktop table row) ──────────────────────────────────────────
function OcrTableRow({
  row, index, onUpdate, onDelete, fetchSuggestions, isActive, onHoverIn, onHoverOut,
}: {
  row: Row;
  index: number;
  onUpdate: (uid: string, patch: Partial<Row>) => void;
  onDelete: (uid: string) => void;
  fetchSuggestions?: (query: string, productType: "EDI" | "IOP") => Promise<Suggestion[]>;
  isActive?: boolean;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
}) {
  return (
    <tr
      className={`group border-b border-border/50 transition-colors cursor-default ${
        isActive ? "bg-primary/10" : !row.customer_id ? "bg-amber-500/5 hover:bg-amber-500/8" : "hover:bg-secondary"
      }`}
      onMouseEnter={onHoverIn}
      onMouseLeave={onHoverOut}
    >
      {/* Row # */}
      <td className="pl-3 pr-1">
        <span className="text-[10px] text-muted-foreground/40 font-mono select-none">
          {String(index + 1).padStart(2, "0")}
        </span>
      </td>

      {/* Customer */}
      <td className="min-w-0 max-w-0">
        <CustomerCombobox
          row={row}
          onChange={(name, id) => onUpdate(row.uid, { customer_name: name, customer_id: id })}
          fetchSuggestions={fetchSuggestions}
          compact
        />
        {row.customer_id && (
          <span className="text-[10px] font-mono text-muted-foreground/65 px-1.5 block leading-tight pb-0.5">#{row.customer_id}</span>
        )}
      </td>

      {/* Date */}
      <td className="px-1">
        <input
          type="date"
          value={ddmmyyyyToInput(row.collection_date)}
          onChange={(e) => onUpdate(row.uid, { collection_date: inputToDdmmyyyy(e.target.value) })}
          className="text-[11.5px] font-mono bg-transparent border-0 outline-0 px-1.5 py-1 rounded w-full
            hover:bg-muted focus:bg-card focus:shadow-[0_0_0_2px_hsl(var(--foreground))] transition-all"
        />
      </td>

      {/* Product */}
      <td className="px-1 text-center">
        <button
          onClick={() => onUpdate(row.uid, { product_type: row.product_type === "EDI" ? "IOP" : "EDI", customer_name: "", customer_id: null, customer_suggestions: [] })}
          className={`text-[10.5px] px-2 py-0.5 rounded-md font-bold transition-colors ${
            row.product_type === "IOP"
              ? "bg-orange-500/15 text-orange-700 dark:text-orange-400"
              : "bg-blue-500/15 text-blue-700 dark:text-blue-400"
          }`}
        >
          {row.product_type}
        </button>
      </td>

      {/* Mode + Paid */}
      <td className="px-1">
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const next = row.payment_mode === "CASH" ? "ONLINE" : "CASH";
              onUpdate(row.uid, { payment_mode: next, is_paid: next === "CASH" });
            }}
            className={`text-[10.5px] px-2 py-0.5 rounded-md font-bold transition-colors ${
              row.payment_mode === "ONLINE"
                ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {row.payment_mode === "ONLINE" ? "ONL" : "CSH"}
          </button>
          {row.payment_mode === "ONLINE" && (
            <button
              onClick={() => onUpdate(row.uid, { is_paid: !row.is_paid })}
              title={row.is_paid ? "Paid" : "Unpaid"}
              className={`flex items-center justify-center h-4.5 w-4.5 rounded transition-all ${
                row.is_paid ? "bg-emerald-500" : "bg-transparent border border-amber-500/60"
              }`}
              style={{ width: 18, height: 18 }}
            >
              {row.is_paid ? (
                <svg viewBox="0 0 10 8" className="h-2 w-2 fill-none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              )}
            </button>
          )}
        </div>
      </td>

      {/* Amount */}
      <td className="px-1 text-right">
        <div className="flex items-center justify-end gap-0.5 px-1.5">
          <span className="text-[10.5px] text-muted-foreground">₹</span>
          <input
            type="number"
            value={row.amount || ""}
            onChange={(e) => onUpdate(row.uid, { amount: Number(e.target.value) })}
            className="w-16 text-[12.5px] font-semibold font-mono text-right bg-transparent border-0 outline-0
              hover:bg-muted focus:bg-card focus:shadow-[0_0_0_2px_hsl(var(--foreground))] focus:px-1.5 focus:rounded transition-all"
          />
        </div>
      </td>

      {/* Confidence */}
      <td className="px-3">
        <div className="flex items-center justify-end gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${confidenceDotClass(row.confidence_score)}`} />
          <span className={`text-[11px] font-mono ${confidenceTextClass(row.confidence_score)}`}>
            {Math.round(row.confidence_score * 100)}
          </span>
        </div>
      </td>

      {/* Delete */}
      <td className="pr-2">
        <button
          onClick={() => onDelete(row.uid)}
          className="flex items-center justify-center h-5 w-5 rounded text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-20 group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
}

// ── Workflow ──────────────────────────────────────────────────────────────────
type WfStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const WF_STEPS: { n: WfStep; label: string; desc: string }[] = [
  { n: 1, label: "Extract",  desc: "Choose page & run OCR" },
  { n: 2, label: "Dates",    desc: "Confirm extracted dates" },
  { n: 3, label: "Review",   desc: "Review & edit rows" },
  { n: 4, label: "UPI",      desc: "Match & strike UPI" },
  { n: 5, label: "Expense",  desc: "Log daily expenses" },
  { n: 6, label: "Customer", desc: "Add new customers" },
  { n: 7, label: "Submit",   desc: "Final review & submit" },
];

// ── ExpenseStepPanel ──────────────────────────────────────────────────────────
// Right-side slide panel so user can scroll the PDF while entering expenses.
function ExpenseStepPanel({
  dates,
  isMobile,
  onDone,
  onSkip,
  onSkipAll,
}: {
  dates: string[];
  isMobile: boolean;
  onDone: () => void;
  onSkip: () => void;
  onSkipAll: () => void;
}) {
  type Entry = { amount: string; notes: string };
  const [entries, setEntries] = useState<Record<string, Entry>>(() => {
    const init: Record<string, Entry> = {};
    dates.forEach((d) => { init[d] = { amount: "", notes: "" }; });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const setEntry = (date: string, patch: Partial<Entry>) =>
    setEntries((prev) => ({ ...prev, [date]: { ...prev[date], ...patch } }));

  const handleSave = async () => {
    const toSave = dates.filter((d) => entries[d]?.amount && Number(entries[d].amount) > 0);
    if (toSave.length === 0) { onDone(); return; }
    setSaving(true);
    try {
      await Promise.all(
        toSave.map((d) =>
          expensesApi.create({
            date: ddmmToYyyyMmDd(d),
            amount: Number(entries[d].amount),
            notes: entries[d].notes || null,
          })
        )
      );
      toast.success(`${toSave.length} expense${toSave.length > 1 ? "s" : ""} saved`);
      onDone();
    } catch {
      toast.error("Failed to save expenses");
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <>
      <div className="flex items-center gap-2.5 px-4 py-3 bg-secondary border-b border-border flex-shrink-0">
        <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-background">5</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Daily Expenses</p>
          <p className="text-[11px] text-muted-foreground">Scroll the PDF and log expenses per date</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {dates.map((date) => (
          <div key={date} className="rounded-xl border border-border bg-background p-3 space-y-2">
            <p className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide">
              {fmtTxnDate(ddmmToYyyyMmDd(date))}
            </p>
            <div className="flex items-center border border-border rounded-lg px-2.5 py-1.5 bg-card focus-within:ring-1 focus-within:ring-foreground/20">
              <span className="text-xs text-muted-foreground mr-1">₹</span>
              <input
                type="number"
                value={entries[date]?.amount ?? ""}
                onChange={(e) => setEntry(date, { amount: e.target.value })}
                placeholder="0"
                className="flex-1 text-sm font-semibold bg-transparent focus:outline-none"
              />
            </div>
            <input
              type="text"
              value={entries[date]?.notes ?? ""}
              onChange={(e) => setEntry(date, { notes: e.target.value })}
              placeholder="Notes (optional)…"
              className="w-full text-xs rounded-lg border border-border px-2.5 py-1.5 bg-card focus:outline-none focus:ring-1 focus:ring-foreground/15 placeholder:text-muted-foreground/40"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 p-4 border-t border-border bg-secondary flex-shrink-0">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/85 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save & Continue"}
        </button>
        <div className="flex gap-2">
          <button onClick={onSkip} className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
            Skip
          </button>
          <button onClick={onSkipAll} className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
            Skip All
          </button>
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return <div className="fixed inset-0 z-50 flex flex-col bg-card">{body}</div>;
  }
  return (
    <div className="fixed right-0 top-0 bottom-0 z-40 flex flex-col bg-card border-l border-border shadow-2xl" style={{ width: 360 }}>
      {body}
    </div>
  );
}

// ── FinalSummaryModal ─────────────────────────────────────────────────────────
function FinalSummaryModal({
  rows,
  totalAmount,
  assignedCount,
  unassigned,
  submitting,
  onSubmit,
  onClose,
}: {
  rows: Row[];
  totalAmount: number;
  assignedCount: number;
  unassigned: number;
  submitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 bg-secondary border-b border-border flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-bold text-background">7</span>
          </div>
          <div>
            <p className="text-sm font-semibold">Final Summary</p>
            <p className="text-[11px] text-muted-foreground">Review and submit all extracted records</p>
          </div>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 p-4 flex-shrink-0">
          <div className="rounded-xl bg-secondary p-3 text-center">
            <div className="text-2xl font-bold font-mono">{rows.length}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Total</div>
          </div>
          <div className={`rounded-xl p-3 text-center ${assignedCount === rows.length ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
            <div className={`text-2xl font-bold font-mono ${assignedCount === rows.length ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {assignedCount}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Assigned</div>
          </div>
          <div className="rounded-xl bg-secondary p-3 text-center">
            <div className="text-xl font-bold font-mono">
              ₹{totalAmount >= 100000 ? `${(totalAmount / 1000).toFixed(1)}K` : totalAmount.toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Total Amount</div>
          </div>
        </div>
        {unassigned > 0 && (
          <div className="mx-4 mb-3 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[12px] text-amber-600 dark:text-amber-400 flex-shrink-0">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            {unassigned} unassigned row{unassigned !== 1 ? "s" : ""} will be skipped on submit
          </div>
        )}
        {/* Row list */}
        <div className="flex-1 overflow-y-auto mx-4 mb-4 rounded-xl border border-border min-h-0">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border sticky top-0 bg-secondary">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Customer</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                <th className="px-2 py-2 text-center font-medium text-muted-foreground w-10">Type</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground w-12">Mode</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid} className={`border-b border-border/50 ${!r.customer_id ? "opacity-40" : ""}`}>
                  <td className="px-3 py-1.5 font-medium truncate max-w-[140px]">
                    {r.customer_id ? r.customer_name : <span className="text-amber-500">Unassigned</span>}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{r.collection_date}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold">₹{r.amount.toLocaleString("en-IN")}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`text-[9.5px] font-bold px-1.5 py-px rounded uppercase ${
                      r.product_type === "IOP" ? "bg-orange-500/15 text-orange-700 dark:text-orange-400"
                                               : "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                    }`}>{r.product_type}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`text-[9.5px] font-bold ${r.payment_mode === "ONLINE" ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"}`}>
                      {r.payment_mode === "ONLINE" ? "GPay" : "Cash"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Footer */}
        <div className="flex gap-2 px-4 py-4 bg-secondary border-t border-border flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
            Close
          </button>
          <button onClick={onSubmit} disabled={submitting || assignedCount === 0}
            className="flex-1 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/85 disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Submit {assignedCount > 0 ? `${assignedCount} Record${assignedCount !== 1 ? "s" : ""}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Date totals helper ────────────────────────────────────────────────────────
function computeDateTotals(rows: Row[]): Record<string, { total: number; cash: number; online: number }> {
  const acc: Record<string, { total: number; cash: number; online: number }> = {};
  for (const r of rows) {
    const d = r.collection_date;
    if (!acc[d]) acc[d] = { total: 0, cash: 0, online: 0 };
    acc[d].total += r.amount || 0;
    if (r.payment_mode === "CASH") acc[d].cash += r.amount || 0;
    else acc[d].online += r.amount || 0;
  }
  return acc;
}

// ── OcrPage ───────────────────────────────────────────────────────────────────
export default function OcrPage() {
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedModel, setSelectedModel] = useState("gemini-3.1-pro-preview");
  const [uploadStage, setUploadStage] = useState<"uploading" | "processing" | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImageB64, setPageImageB64] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractElapsed, setExtractElapsed] = useState(0);
  const [modelAvgMs, setModelAvgMs] = useState(0);
  const extractTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mobileTab, setMobileTab] = useState<"image" | "records">("image");
  const [zoom, setZoom] = useState(1);
  const [activeRowUid, setActiveRowUid] = useState<string | null>(null);
  const [upiSearch, setUpiSearch] = useState("");

  const [pageRows, setPageRows] = useState<Record<number, Row[]>>({});
  const rows = pageRows[pageIndex] ?? [];
  const [pageUpiTxns, setPageUpiTxns] = useState<Record<number, UpiTxn[]>>({});
  const upiTxns = pageUpiTxns[pageIndex] ?? [];
  const [loadingUpi, setLoadingUpi] = useState(false);
  const [upiExpanded, setUpiExpanded] = useState(true);
  const [struckUpiIds, setStruckUpiIds] = useState<Set<number>>(new Set());
  const [appliedUpiTxns, setAppliedUpiTxns] = useState<Map<number, { payment_mode: "CASH" | "ONLINE"; is_paid: boolean; amount: number }>>(new Map());
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDateConfirm, setShowDateConfirm] = useState(false);
  const [pendingExtracted, setPendingExtracted] = useState<Row[]>([]);
  const [rowsUndo, setRowsUndo] = useState<Row[][]>([]);
  const [rowsRedo, setRowsRedo] = useState<Row[][]>([]);

  // ── Workflow ──────────────────────────────────────────────────────────────
  const [wfStep, setWfStep] = useState<WfStep | null>(1);
  const [wfDone, setWfDone] = useState<Set<number>>(new Set());
  const [wfSkipped, setWfSkipped] = useState<Set<number>>(new Set());

  const wfComplete = useCallback((step: WfStep, next: WfStep | null) => {
    setWfDone((prev) => new Set([...prev, step]));
    setWfStep(next);
  }, []);

  const wfSkipStep = useCallback((step: WfStep, next: WfStep | null) => {
    setWfSkipped((prev) => new Set([...prev, step]));
    setWfStep(next);
  }, []);

  const wfSkipAll = useCallback((from: WfStep) => {
    const toSkip = ([5, 6, 7] as WfStep[]).filter((s) => s >= from);
    setWfSkipped((prev) => new Set([...prev, ...toSkip]));
    setWfStep(null);
  }, []);

  const hasSession = Boolean(sessionId) && !uploadStage;
  const unassigned = rows.filter((r) => !r.customer_id).length;
  const assignedCount = rows.filter((r) => r.customer_id).length;
  const totalAmount = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const dateTotals = computeDateTotals(rows);
  const avgConf = rows.length
    ? Math.round(rows.reduce((s, r) => s + r.confidence_score, 0) / rows.length * 100)
    : 0;

  const setRows = useCallback(
    (updater: Row[] | ((prev: Row[]) => Row[])) => {
      setPageRows((prev) => ({
        ...prev,
        [pageIndex]: typeof updater === "function" ? updater(prev[pageIndex] ?? []) : updater,
      }));
    },
    [pageIndex]
  );

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setPageImageB64(null);
    setLoadingImage(true);
    ocrApi.getPage(sessionId, pageIndex)
      .then(({ data }) => { if (!cancelled) setPageImageB64(data.page_image_b64); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingImage(false); });
    return () => { cancelled = true; };
  }, [sessionId, pageIndex]);

  // Clear extraction timer on unmount
  useEffect(() => {
    return () => { if (extractTimerRef.current) clearInterval(extractTimerRef.current); };
  }, []);

  // Auto-trigger Step 5 when all UPI transactions are handled (struck or applied).
  // Fires on step 3 OR 4 because users often strike UPI without clicking the manual → button.
  useEffect(() => {
    if (wfStep === null || wfStep > 4) return;
    if (loadingUpi) return;
    if (upiTxns.length === 0) {
      if (wfStep === 4) wfComplete(4, 5);
      return;
    }
    const handled = upiTxns.filter((t: UpiTxn) => struckUpiIds.has(t.id) || appliedUpiTxns.has(t.id)).length;
    if (handled >= upiTxns.length) {
      const t = setTimeout(() => {
        setWfDone((prev) => new Set([...prev, 3, 4]));
        setWfStep(5);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [wfStep, loadingUpi, upiTxns.length, struckUpiIds.size, appliedUpiTxns.size, pageIndex, wfComplete]);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Only PDF files are accepted. Please select a .pdf file.");
      return;
    }
    setFileName(file.name);
    setFileSize(file.size);
    setUploadError(null);
    setUploadProgress(0);
    setUploadStage("uploading");
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await ocrApi.upload(form, (pct) => {
        setUploadProgress(pct);
        if (pct >= 100) setUploadStage("processing");
      });
      setSessionId(data.session_id);
      setTotalPages(data.total_pages);
      setPageIndex(0);
      setPageImageB64(null);
      setPageRows({});
      setPageUpiTxns({});
      setStruckUpiIds(new Set());
      setAppliedUpiTxns(new Map());
      setWfStep(1);
      setWfDone(new Set());
      setWfSkipped(new Set());
      toast.success(`${data.total_pages} page${data.total_pages !== 1 ? "s" : ""} ready`);
    } catch (err) {
      setUploadError(httpError(err));
    } finally {
      setUploadStage(null);
      setUploadProgress(0);
    }
  }, []);

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };

  const fetchUpiForDates = useCallback(async (dates: string[], targetPage: number) => {
    if (!dates.length) return;
    const isoDatesList = dates.map(ddmmToYyyyMmDd).filter(Boolean).sort();
    if (!isoDatesList.length) return;
    setLoadingUpi(true);
    try {
      const { data } = await upiApi.list({
        date_from: isoDatesList[0],
        date_to: isoDatesList[isoDatesList.length - 1],
        transaction_type: "credit",
        limit: 200,
      });
      setPageUpiTxns((prev) => ({ ...prev, [targetPage]: data.data ?? [] }));
    } catch {}
    finally { setLoadingUpi(false); }
  }, []);

  const handleExtract = async () => {
    if (!sessionId) return;
    setExtracting(true);
    setExtractError(null);
    setExtractElapsed(0);
    const avg = getModelAvgMs(selectedModel);
    setModelAvgMs(avg);
    const startTime = Date.now();
    if (extractTimerRef.current) clearInterval(extractTimerRef.current);
    extractTimerRef.current = setInterval(() => setExtractElapsed(Date.now() - startTime), 100);
    try {
      const { data } = await ocrApi.extract({ session_id: sessionId, page_index: pageIndex, model: selectedModel });
      const elapsed = Date.now() - startTime;
      saveModelTiming(selectedModel, elapsed);
      setPageImageB64(data.page_image_b64);
      const extracted = (data.records as any[]).map((r) => {
        const mode = ((r.payment_mode as string) || "CASH").toUpperCase() as "CASH" | "ONLINE";
        return { ...r, uid: mkUid(), product_type: ((r.product_type as string) || "EDI").toUpperCase() as "EDI" | "IOP", payment_mode: mode, is_paid: mode === "CASH" };
      });
      setPendingExtracted(extracted);
      setShowDateConfirm(true);
      setWfDone((prev) => new Set([...prev, 1]));
      setWfStep(2);
    } catch (err: any) {
      setExtractError(httpError(err));
    } finally {
      if (extractTimerRef.current) { clearInterval(extractTimerRef.current); extractTimerRef.current = null; }
      setExtracting(false);
    }
  };

  const handleDateConfirmed = (dateMap: Record<string, string>) => {
    const updated = pendingExtracted.map((r: Row) => ({
      ...r,
      collection_date: dateMap[r.collection_date] ?? r.collection_date,
    }));
    pushHistory();
    setRows(updated);
    toast.success(`${updated.length} records extracted`);
    if (isMobile) setMobileTab("records");
    const confirmedDates = [...new Set(updated.map((r: Row) => r.collection_date))];
    fetchUpiForDates(confirmedDates, pageIndex);
    setShowDateConfirm(false);
    setPendingExtracted([]);
    wfComplete(2, 3);
  };

  const goPage = (dir: -1 | 1) => {
    const next = pageIndex + dir;
    if (next < 0 || next >= totalPages) return;
    setPageIndex(next);
    setStruckUpiIds(new Set());
    setAppliedUpiTxns(new Map());
    setExtractError(null);
    setRowsUndo([]);
    setRowsRedo([]);
  };

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const pushHistory = useCallback(() => {
    setRowsUndo((prev) => [...prev.slice(-29), rows]);
    setRowsRedo([]);
  }, [rows]);

  const undoRows = useCallback(() => {
    if (!rowsUndo.length) return;
    const prev = rowsUndo[rowsUndo.length - 1];
    setRowsRedo((f) => [rows, ...f.slice(0, 29)]);
    setRowsUndo((p) => p.slice(0, -1));
    setRows(prev);
  }, [rowsUndo, rows, setRows]);

  const redoRows = useCallback(() => {
    if (!rowsRedo.length) return;
    const next = rowsRedo[0];
    setRowsUndo((p) => [...p.slice(-29), rows]);
    setRowsRedo((f) => f.slice(1));
    setRows(next);
  }, [rowsRedo, rows, setRows]);

  // Keyboard undo/redo — skip when focus is in an input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") { e.preventDefault(); undoRows(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redoRows(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undoRows, redoRows]);

  const updateRow = (uid: string, patch: Partial<Row>) => {
    pushHistory();
    setRows((r) => r.map((row) => (row.uid === uid ? { ...row, ...patch } : row)));
  };

  const deleteRow = (uid: string) => {
    pushHistory();
    setRows((r) => r.filter((row) => row.uid !== uid));
  };

  const handleSubmit = async () => {
    const valid = rows.filter((r) => r.customer_id && r.amount > 0);
    if (!valid.length) { toast.error("No valid records — assign a customer to at least one row"); return; }
    setSubmitting(true);
    const tid = toast.loading(`Saving ${valid.length} records…`);
    try {
      const { data } = await ocrApi.submit({
        records: valid.map((r) => ({
          collection_date: r.collection_date, customer_name: r.customer_name,
          customer_id: r.customer_id, product_type: r.product_type,
          payment_mode: r.payment_mode, is_paid: r.is_paid, amount: r.amount,
        })),
      });
      toast.success(`${data.submitted} records saved`, { id: tid });
      setRows([]);
      const nextPage = pageIndex + 1;
      if (nextPage < totalPages) {
        setPageIndex(nextPage);
        setStruckUpiIds(new Set());
        setAppliedUpiTxns(new Map());
        setWfStep(1);
        setWfDone(new Set());
        setWfSkipped(new Set());
        toast(`Page ${nextPage + 1} of ${totalPages} — extract to continue`, { icon: "📄" });
      } else {
        setWfStep(null);
      }
    } catch { toast.error("Submit failed", { id: tid }); }
    finally { setSubmitting(false); }
  };

  const extractedDate = rows[0]?.collection_date ?? null;
  const allExtractedDates: string[] = Array.from(new Set(rows.map((r: Row) => r.collection_date))).filter(Boolean).sort() as string[];

  const reset = () => {
    setSessionId(null); setPageImageB64(null); setPageRows({}); setPageUpiTxns({});
    setTotalPages(0); setPageIndex(0); setUploadError(null); setExtractError(null);
    setStruckUpiIds(new Set()); setAppliedUpiTxns(new Map());
    setWfStep(1); setWfDone(new Set()); setWfSkipped(new Set());
  };

  const fetchCustomerSuggestions = async (query: string, productType: "EDI" | "IOP" = "EDI"): Promise<Suggestion[]> => {
    try {
      const { data } = await upiApi.fuzzySuggest(query);
      const typeFilter = productType.toLowerCase();
      return (data.data ?? [])
        .filter((item: any) => {
          const itemType = (item.type ?? "edi").toLowerCase();
          return itemType === typeFilter && (item.balance ?? 0) > 0;
        })
        .map((item: any) => ({
          id: item.customer_id ?? item.id,
          name: item.customer_name ?? item.name ?? "",
          score: item.score ?? 0.8,
        }));
    } catch { return []; }
  };

  const addManualRow = (rowData: Omit<Row, "uid" | "confidence_score" | "notes" | "customer_suggestions">) => {
    pushHistory();
    setRows((prev) => [...prev, { ...rowData, uid: mkUid(), confidence_score: 1, notes: "", customer_suggestions: [] }]);
    if (isMobile) setMobileTab("records");
  };

  const todayStr = (() => {
    const t = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(t.getDate())}-${p(t.getMonth() + 1)}-${t.getFullYear()}`;
  })();

  // ── Workflow step status ───────────────────────────────────────────────────
  const getWfStatus = (n: WfStep): "done" | "skipped" | "active" | "pending" => {
    if (wfDone.has(n)) return "done";
    if (wfSkipped.has(n)) return "skipped";
    if (wfStep === n) return "active";
    return "pending";
  };

  // ── Upload zone ────────────────────────────────────────────────────────────
  const uploadZone = (() => {
    if (uploadError) return (
      <div className="w-full max-w-md mx-auto rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center space-y-3">
        <AlertCircle className="h-10 w-10 mx-auto text-red-400" />
        <p className="text-sm font-semibold text-red-400">Upload failed</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{uploadError}</p>
        <button onClick={() => { setUploadError(null); fileInputRef.current?.click(); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-sm font-semibold hover:bg-foreground/85 transition-colors">
          <RotateCcw className="h-3.5 w-3.5" /> Try again
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={onInput} />
      </div>
    );
    if (uploadStage === "uploading") {
      const uploaded = Math.round((uploadProgress / 100) * fileSize);
      return (
        <div className="w-full max-w-md mx-auto rounded-2xl border border-border bg-card p-8 space-y-4">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(uploaded)} of {formatBytes(fileSize)}</p>
            </div>
            <span className="ml-auto text-sm font-bold text-foreground/70 flex-shrink-0">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div className="bg-foreground/70 h-1.5 rounded-full transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
          </div>
          <p className="text-xs text-center text-muted-foreground">Uploading to server…</p>
        </div>
      );
    }
    if (uploadStage === "processing") return (
      <div className="w-full max-w-md mx-auto rounded-2xl border border-border bg-card p-10 text-center space-y-3">
        <Loader2 className="h-10 w-10 mx-auto text-muted-foreground animate-spin" />
        <p className="text-sm font-semibold">Preparing first page…</p>
        <p className="text-xs text-muted-foreground">Optimising image for best OCR accuracy</p>
      </div>
    );
    return (
      <div
        className={`w-full max-w-md mx-auto border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-colors ${
          isDragging ? "border-foreground/30 bg-primary/10" : "border-border hover:border-muted-foreground/30 hover:bg-secondary/60"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
        <p className="text-base font-semibold mb-1">Upload handwritten PDF</p>
        <p className="text-sm text-muted-foreground">Drag & drop or click to browse</p>
        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={onInput} />
      </div>
    );
  })();

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    const noUpiForDay = !loadingUpi && allExtractedDates.length > 0 && upiTxns.length === 0 && rows.length > 0 && wfStep !== null && wfStep <= 4;
    const skipToExpenses = () => { setWfDone((prev) => new Set([...prev, 3, 4])); setWfStep(5); };

    const mobileUpiSection = noUpiForDay ? (
      <div className="flex-shrink-0 mt-3 px-0">
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-center space-y-2">
          <p className="text-[11.5px] text-muted-foreground">
            No UPI credits for {allExtractedDates.length > 1 ? "these dates" : allExtractedDates[0]}.
          </p>
          <button
            onClick={skipToExpenses}
            className="w-full py-2 rounded-lg bg-foreground text-background text-[12.5px] font-semibold hover:bg-foreground/85 transition-colors"
          >
            Skip to Expenses →
          </button>
        </div>
      </div>
    ) : (upiTxns.length > 0 || loadingUpi) ? (
      <div className="flex-shrink-0 mt-3">
        <button onClick={() => setUpiExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-colors">
          <div className="flex items-center gap-2">
            <Wifi className="h-3.5 w-3.5 text-foreground/60" />
            <span className="text-xs font-semibold">UPI{allExtractedDates.length > 0
              ? ` — ${allExtractedDates.length === 1 ? allExtractedDates[0] : `${allExtractedDates[0]} · ${allExtractedDates.length} dates`}`
              : ""}</span>
            <span className="text-[11px] text-muted-foreground bg-background/60 rounded-full px-2 py-0.5">{upiTxns.length}</span>
          </div>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${upiExpanded ? "rotate-180" : ""}`} />
        </button>
        {upiExpanded && (
          <div className="mt-1.5 max-h-52 overflow-y-auto">
            {loadingUpi ? (
              <div className="flex items-center justify-center py-5 gap-2 text-muted-foreground bg-primary/5 rounded-xl border border-primary/15">
                <Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs">Loading UPI…</span>
              </div>
            ) : (() => {
              const mobileByDate = upiTxns.reduce((acc: Record<string, UpiTxn[]>, txn: UpiTxn) => {
                const d = txn.transaction_date as string;
                (acc[d] ??= []).push(txn);
                return acc;
              }, {} as Record<string, UpiTxn[]>);
              const mobileDates = Object.keys(mobileByDate).sort().reverse();
              return mobileDates.map((date) => (
                <React.Fragment key={date}>
                  <div className="flex items-center justify-between px-3 py-1 bg-muted/60 border-b border-border/40">
                    <span className="text-[9px] font-semibold uppercase tracking-[.08em] text-muted-foreground/60">{fmtTxnDate(date)}</span>
                    <span className="text-[9px] font-mono text-muted-foreground/40">{mobileByDate[date].length}</span>
                  </div>
                  <div className="space-y-1 px-0 py-1">
                    {mobileByDate[date].map((txn) => {
                      const isMapped = txn.mapped_customer_id != null;
                      const isStruck = struckUpiIds.has(txn.id);
                      const isApplied = appliedUpiTxns.has(txn.id);
                      return (
                        <div key={txn.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                          isStruck ? "opacity-40 bg-muted/40 border-border/40"
                          : isApplied ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40"
                          : isMapped ? "bg-primary/8 border-primary/20" : "bg-card border-border/60"
                        }`}>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isStruck ? "line-through text-muted-foreground" : ""}`}>
                              {txn.sender_name || txn.sender_vpa || "—"}
                            </p>
                            {isMapped && (
                              <p className={`text-xs flex items-center gap-0.5 mt-0.5 truncate ${isStruck ? "line-through text-muted-foreground/50" : isApplied ? "text-emerald-600 dark:text-emerald-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                                <CheckCircle className="h-3 w-3 flex-shrink-0" />{txn.mapped_customer_name}
                              </p>
                            )}
                          </div>
                          <span className={`text-sm font-bold flex-shrink-0 ${isStruck ? "line-through text-muted-foreground" : "text-emerald-700 dark:text-emerald-400"}`}>
                            ₹{Number(txn.amount).toLocaleString("en-IN")}
                          </span>
                          {isMapped && !isStruck && (
                            isApplied ? (
                              <button onClick={() => undoUpiTxn(txn)}
                                className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted-foreground bg-muted/60 hover:bg-muted border border-border/50 transition-colors">
                                <RotateCcw className="h-2.5 w-2.5" />Undo
                              </button>
                            ) : (
                              <button onClick={() => applyUpiTxn(txn)}
                                className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800/50 transition-colors">
                                <CheckCircle className="h-2.5 w-2.5" />Apply
                              </button>
                            )
                          )}
                          <button onClick={() => setStruckUpiIds((prev) => { const next = new Set(prev); next.has(txn.id) ? next.delete(txn.id) : next.add(txn.id); return next; })}
                            className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary transition-colors">
                            <Strikethrough className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </React.Fragment>
              ));
            })()}
          </div>
        )}
      </div>
    ) : null;

    return (
      <>
        <div className="flex flex-col h-full pb-[84px]">
          {!hasSession ? (
            <div className="flex-1 flex items-center justify-center px-4">{uploadZone}</div>
          ) : (
            <>
              <div className="flex bg-muted/50 rounded-xl mx-4 mt-3 p-1 flex-shrink-0">
                {(["image", "records"] as const).map((tab) => (
                  <button key={tab} onClick={() => setMobileTab(tab)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      mobileTab === tab ? "bg-card shadow text-foreground" : "text-muted-foreground"
                    }`}>
                    {tab === "image" ? <ImageIcon className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
                    {tab === "image" ? "Image" : `Records${rows.length > 0 ? ` (${rows.length})` : ""}`}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-hidden flex flex-col px-4 pt-3 gap-3 min-h-0">
                {mobileTab === "image" ? (
                  <>
                    <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <button onClick={() => goPage(-1)} disabled={pageIndex === 0}
                          className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-secondary disabled:opacity-40 transition-colors">
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-sm px-3 py-1 bg-muted rounded-lg font-medium min-w-[76px] text-center">{pageIndex + 1} / {totalPages}</span>
                        <button onClick={() => goPage(1)} disabled={pageIndex >= totalPages - 1}
                          className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-secondary disabled:opacity-40 transition-colors">
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                      <button onClick={handleExtract} disabled={extracting}
                        className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-sm font-semibold hover:bg-foreground/85 disabled:opacity-60 transition-colors">
                        {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
                        {extracting ? "Extracting…" : "Extract"}
                      </button>
                    </div>
                    <div className="flex-1 overflow-auto rounded-xl border border-border bg-muted/20 min-h-0">
                      {loadingImage ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3 text-muted-foreground">
                          <Loader2 className="h-8 w-8 animate-spin" /><p className="text-sm">Loading page…</p>
                        </div>
                      ) : pageImageB64 ? (
                        <img src={`data:image/png;base64,${pageImageB64}`} alt={`Page ${pageIndex + 1}`} className="w-full object-contain" />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3 text-muted-foreground">
                          <ImageIcon className="h-10 w-10 opacity-30" /><p className="text-sm">Page will appear here</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col h-full min-h-0">
                    <div className="flex items-center justify-between mb-3 flex-shrink-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold">{rows.length > 0 ? `${rows.length} records` : "No records yet"}</p>
                        {rows.length > 0 && (
                          <>
                            <button onClick={undoRows} disabled={!rowsUndo.length} title="Undo"
                              className="flex items-center justify-center h-7 w-7 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                              <Undo2 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={redoRows} disabled={!rowsRedo.length} title="Redo"
                              className="flex items-center justify-center h-7 w-7 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                              <Redo2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {hasSession && (
                          <button onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                            <Plus className="h-3.5 w-3.5" />Add
                          </button>
                        )}
                        {rows.length > 0 && !extracting && (
                          <button onClick={handleSubmit} disabled={submitting || assignedCount === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-sm font-semibold hover:bg-foreground/85 disabled:opacity-60 transition-colors">
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Submit{assignedCount > 0 ? ` ${assignedCount}` : ""}
                          </button>
                        )}
                      </div>
                    </div>
                    {rows.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                        <ClipboardList className="h-10 w-10 opacity-30" />
                        <p className="text-sm">Click "Extract" on the image tab</p>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                        {rows.map((row, i) => {
                          const prevDate = i > 0 ? rows[i - 1].collection_date : null;
                          const nextDate = i < rows.length - 1 ? rows[i + 1].collection_date : null;
                          const showDivider = prevDate !== null && row.collection_date !== prevDate;
                          const showSummary = nextDate !== row.collection_date;
                          const dt = dateTotals[row.collection_date] ?? { total: 0, cash: 0, online: 0 };
                          return (
                            <React.Fragment key={row.uid}>
                              {showDivider && (
                                <div className="flex items-center gap-2 py-1 px-1">
                                  <div className="flex-1 h-px bg-primary/25" />
                                  <span className="text-[9.5px] font-semibold uppercase tracking-[.1em] text-muted-foreground/60 flex-shrink-0">
                                    {fmtTxnDate(ddmmToYyyyMmDd(row.collection_date))}
                                  </span>
                                  <div className="flex-1 h-px bg-primary/25" />
                                </div>
                              )}
                              <RecordCard row={row} onUpdate={updateRow} onDelete={deleteRow} fetchSuggestions={fetchCustomerSuggestions} />
                              {showSummary && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-xl border border-border/50 text-[10.5px] font-mono">
                                  <span className="text-muted-foreground/50 text-[9.5px] uppercase tracking-wide font-semibold">subtotal</span>
                                  <span className="font-semibold text-foreground/80">₹{dt.total.toLocaleString("en-IN")}</span>
                                  <span className="flex-1" />
                                  <span className="text-muted-foreground/60">Cash</span>
                                  <span className="font-semibold text-foreground/70">₹{dt.cash.toLocaleString("en-IN")}</span>
                                  <span className="text-border">·</span>
                                  <span className="text-muted-foreground/60">GPay</span>
                                  <span className="font-semibold text-sky-600 dark:text-sky-400">₹{dt.online.toLocaleString("en-IN")}</span>
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    )}
                    {mobileUpiSection}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <AddRowModal open={showAddModal} defaultDate={extractedDate ?? todayStr}
          onClose={() => setShowAddModal(false)} onAdd={addManualRow} fetchSuggestions={fetchCustomerSuggestions} />
        {showDateConfirm && pendingExtracted.length > 0 && (
          <DateConfirmModal pendingRows={pendingExtracted}
            onConfirm={handleDateConfirmed} onCancel={() => { setShowDateConfirm(false); setPendingExtracted([]); }} />
        )}
        {wfStep === 5 && allExtractedDates.length > 0 && (
          <ExpenseStepPanel
            dates={allExtractedDates}
            isMobile={isMobile}
            onDone={() => wfComplete(5, 6)}
            onSkip={() => wfSkipStep(5, 6)}
            onSkipAll={() => wfSkipAll(5)}
          />
        )}
        {wfStep === 6 && (
          <CustomerStepOverlay
            onDone={() => wfComplete(6, 7)}
            onSkip={() => wfSkipStep(6, 7)}
            onSkipAll={() => wfSkipAll(6)}
          />
        )}
        {wfStep === 7 && (
          <FinalSummaryModal
            rows={rows}
            totalAmount={totalAmount}
            assignedCount={assignedCount}
            unassigned={unassigned}
            submitting={submitting}
            onSubmit={handleSubmit}
            onClose={() => wfSkipStep(7, null)}
          />
        )}
      </>
    );
  }

  const applyUpiTxn = (txn: UpiTxn) => {
    if (!txn.mapped_customer_id || !txn.mapped_customer_type) return;
    const productType = txn.mapped_customer_type.toUpperCase() as "EDI" | "IOP";
    const matchIdx = rows.findIndex(
      (r) => r.customer_id === txn.mapped_customer_id && r.product_type === productType
    );
    if (matchIdx === -1) {
      toast.error(`No row for ${txn.mapped_customer_name} (${productType})`);
      return;
    }
    const orig = {
      payment_mode: rows[matchIdx].payment_mode,
      is_paid: rows[matchIdx].is_paid,
      amount: rows[matchIdx].amount,
    };
    setRows((prev) => {
      const next = [...prev];
      next[matchIdx] = { ...next[matchIdx], payment_mode: "ONLINE" as const, is_paid: true, amount: Number(txn.amount) };
      return next;
    });
    setAppliedUpiTxns((prev) => { const next = new Map(prev); next.set(txn.id, orig); return next; });
    toast.success(`Applied ₹${Number(txn.amount).toLocaleString("en-IN")} → ${txn.mapped_customer_name}`);
  };

  const undoUpiTxn = (txn: UpiTxn) => {
    if (!txn.mapped_customer_id || !txn.mapped_customer_type) return;
    const productType = txn.mapped_customer_type.toUpperCase() as "EDI" | "IOP";
    const matchIdx = rows.findIndex(
      (r) => r.customer_id === txn.mapped_customer_id && r.product_type === productType
    );
    const orig = appliedUpiTxns.get(txn.id);
    if (matchIdx === -1 || !orig) return;
    setRows((prev) => {
      const next = [...prev];
      next[matchIdx] = { ...next[matchIdx], ...orig };
      return next;
    });
    setAppliedUpiTxns((prev) => { const next = new Map(prev); next.delete(txn.id); return next; });
    toast(`Reverted ${txn.mapped_customer_name}`);
  };

  // ── Desktop layout ─────────────────────────────────────────────────────────
  // Progress % — uses stored avg time; caps at 95 until response arrives
  const extractPct = extracting
    ? modelAvgMs > 0
      ? Math.min((extractElapsed / modelAvgMs) * 100, 95)
      : Math.min((extractElapsed / 28000) * 90, 90)
    : 0;
  const runCount = getModelRunCount(selectedModel);

  // Filter UPI by search
  const filteredUpi = upiSearch
    ? upiTxns.filter((t) =>
        (t.sender_name + " " + t.sender_vpa + " " + t.mapped_customer_name).toLowerCase().includes(upiSearch.toLowerCase())
      )
    : upiTxns;

  // Group UPI transactions by date (newest first)
  const upiByDate = filteredUpi.reduce((acc: Record<string, UpiTxn[]>, txn: UpiTxn) => {
    const d = txn.transaction_date as string;
    (acc[d] ??= []).push(txn);
    return acc;
  }, {} as Record<string, UpiTxn[]>);
  const upiGroupDates = Object.keys(upiByDate).sort().reverse();

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden bg-background">

        {/* ── Top bar ── */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-secondary/60 flex-shrink-0 z-10">
          {/* Brand + breadcrumb */}
          <div className="flex items-center gap-2 font-semibold text-sm tracking-tight flex-shrink-0">
            <div className="w-6 h-6 rounded-md bg-foreground flex items-center justify-center">
              <span className="font-mono text-[10px] font-semibold text-background">gf</span>
            </div>
            <span className="text-foreground/80">OCR</span>
          </div>

          {hasSession && (
            <div className="flex items-center gap-1.5 pl-3 border-l border-border text-[13px] text-muted-foreground min-w-0">
              <span className="flex-shrink-0">Inbox</span>
              <ChevronRight className="h-3 w-3 opacity-40 flex-shrink-0" />
              <span className="inline-flex items-center gap-1.5 bg-muted px-2.5 py-1 rounded-lg text-foreground font-medium max-w-[260px]">
                <FileText className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                <span className="truncate text-[12.5px]">{fileName.replace(/\.pdf$/i, "")}</span>
                <span className="text-muted-foreground text-[11px] font-mono flex-shrink-0">.pdf</span>
              </span>
            </div>
          )}

          {/* Status pill */}
          {hasSession && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium flex-shrink-0 ${
              extracting
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : rows.length > 0
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}>
              {extracting
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <span className={`w-1.5 h-1.5 rounded-full bg-current ${rows.length > 0 ? "animate-pulse" : ""}`} />
              }
              {extracting ? "Extracting…" : rows.length > 0 ? `Ready · ${avgConf}%` : "Awaiting extraction"}
            </span>
          )}

          <div className="flex-1" />

          {/* Actions */}
          {hasSession && (
            <>
              <button onClick={reset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-[12.5px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                <RefreshCw className="h-3.5 w-3.5" /> New PDF
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-[12.5px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
              <button onClick={handleSubmit} disabled={submitting || assignedCount === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-[12.5px] font-semibold hover:bg-foreground/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Save & Post{assignedCount > 0 ? ` (${assignedCount})` : ""}
              </button>
            </>
          )}
        </div>

        {/* ── Workflow status bar ── */}
        {hasSession && (
          <div className="flex items-center gap-1 px-4 border-b border-border bg-background flex-shrink-0" style={{ height: 36 }}>
            {WF_STEPS.map((step, i) => {
              const status = getWfStatus(step.n);
              return (
                <React.Fragment key={step.n}>
                  <div
                    title={step.desc}
                    className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full transition-colors cursor-default select-none ${
                      status === "done"    ? "text-emerald-600 dark:text-emerald-400"
                      : status === "skipped" ? "text-muted-foreground/40 line-through"
                      : status === "active"  ? "bg-foreground text-background font-semibold"
                      : "text-muted-foreground/50"
                    }`}
                  >
                    {status === "done" ? (
                      <CheckCircle className="h-2.5 w-2.5 flex-shrink-0" />
                    ) : (
                      <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold flex-shrink-0 ${
                        status === "active" ? "bg-background text-foreground" : "bg-muted text-muted-foreground"
                      }`}>{step.n}</span>
                    )}
                    {step.label}
                    {/* Manual "proceed" button for steps 3 and 4 */}
                    {status === "active" && step.n === 3 && (
                      <button
                        onClick={() => wfComplete(3, 4)}
                        title="Proceed to UPI step"
                        className="ml-0.5 px-1.5 py-px rounded text-[9px] font-semibold bg-background/20 hover:bg-background/40 transition-colors"
                      >→</button>
                    )}
                    {status === "active" && step.n === 4 && (
                      <button
                        onClick={() => wfComplete(4, 5)}
                        title="Proceed to Expense step"
                        className="ml-0.5 px-1.5 py-px rounded text-[9px] font-semibold bg-background/20 hover:bg-background/40 transition-colors"
                      >→</button>
                    )}
                    {status === "active" && step.n === 7 && (
                      <button
                        onClick={() => setWfStep(7)}
                        title="Open final summary"
                        className="ml-0.5 px-1.5 py-px rounded text-[9px] font-semibold bg-background/20 hover:bg-background/40 transition-colors"
                      >↗</button>
                    )}
                  </div>
                  {i < WF_STEPS.length - 1 && (
                    <span className="w-2 h-px bg-border/60 flex-shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
            <div className="flex-1" />
            <span className="text-[11px] text-muted-foreground">
              Model <span className="font-mono text-foreground/70">{selectedModel.replace("gemini-", "")}</span>
            </span>
          </div>
        )}

        {/* ── Main 3-column area ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── PDF column ── */}
          <div className="flex flex-col border-r border-border min-w-0" style={{ flex: "1 1 0" }}>
            {/* Col header */}
            <div className="flex items-center gap-2.5 px-4 h-12 border-b border-border bg-background flex-shrink-0">
              <h3 className="text-[13px] font-medium text-muted-foreground">
                {hasSession ? `Page ${pageIndex + 1}` : "Document"}
              </h3>
              {hasSession && (
                <span className="text-[11px] font-mono text-muted-foreground/50">
                  {totalPages} page{totalPages !== 1 ? "s" : ""} · {formatBytes(fileSize)}
                </span>
              )}
              <div className="flex-1" />
              {hasSession && (
                <>
                  {/* Page nav */}
                  <div className="flex items-center gap-1 bg-muted rounded-lg px-0.5 py-0.5">
                    <button onClick={() => goPage(-1)} disabled={pageIndex === 0}
                      className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 transition-colors">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[11px] font-mono text-foreground/70 px-1">{pageIndex + 1}/{totalPages}</span>
                    <button onClick={() => goPage(1)} disabled={pageIndex >= totalPages - 1}
                      className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 transition-colors">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/* Zoom */}
                  <div className="flex items-center gap-1 bg-muted rounded-lg px-0.5 py-0.5">
                    <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
                      className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
                      <ZoomOut className="h-3 w-3" />
                    </button>
                    <span className="text-[11px] font-mono text-foreground/70 min-w-[36px] text-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
                      className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
                      <ZoomIn className="h-3 w-3" />
                    </button>
                  </div>
                  {/* Overlays toggle */}
                  <div className="flex items-center gap-1 bg-muted rounded-lg px-0.5 py-0.5">
                    <button title="Overlays" className="flex items-center justify-center h-6 w-6 rounded-md bg-card text-foreground shadow-sm transition-colors">
                      <Layers className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* PDF viewport (checkered background) */}
            <div
              className="flex-1 overflow-auto flex justify-center items-start"
              style={{
                background: `
                  linear-gradient(45deg,hsl(var(--muted)) 25%,transparent 25%),
                  linear-gradient(-45deg,hsl(var(--muted)) 25%,transparent 25%),
                  linear-gradient(45deg,transparent 75%,hsl(var(--muted)) 75%),
                  linear-gradient(-45deg,transparent 75%,hsl(var(--muted)) 75%)`,
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
                backgroundColor: "hsl(var(--background))",
              }}
            >
              {!hasSession ? (
                <div className="flex-1 flex items-center justify-center py-16">{uploadZone}</div>
              ) : loadingImage ? (
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">Loading page…</p>
                </div>
              ) : pageImageB64 ? (
                <div
                  className="m-6 shadow-2xl rounded-sm overflow-hidden bg-white flex-shrink-0"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "top center", width: 560 }}
                >
                  <img src={`data:image/png;base64,${pageImageB64}`} alt={`Page ${pageIndex + 1}`} className="w-full" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
                  <ImageIcon className="h-12 w-12 opacity-20" />
                  <p className="text-sm">Page image will appear here</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Data column ── */}
          <div className="flex flex-col border-r border-border flex-shrink-0" style={{ width: 460 }}>
            {/* Column header with tabs */}
            <div className="flex items-center border-b border-border px-4 flex-shrink-0" style={{ height: 48 }}>
              <div className="flex items-center gap-0.5 -mb-px">
                <span className="flex items-center gap-1.5 px-3 py-3 text-[13px] font-medium text-foreground border-b-2 border-foreground">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Records
                  {rows.length > 0 && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-foreground text-background">{rows.length}</span>
                  )}
                </span>
              </div>
              <div className="flex-1" />
              {/* Add + Extract */}
              <div className="flex items-center gap-1.5">
                {hasSession && (
                  <>
                    <button onClick={() => setShowAddModal(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-card text-[12px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                      <Plus className="h-3 w-3" /> Add
                    </button>
                    <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} disabled={extracting}
                      className="text-[11.5px] rounded-lg border border-border px-2 py-1.5 bg-card text-foreground focus:outline-none disabled:opacity-50 cursor-pointer">
                      <option value="gemini-2.5-flash">2.5 Flash ⚡</option>
                      <option value="gemini-2.5-pro">2.5 Pro ★</option>
                      <option value="gemini-3-flash-preview">3 Flash</option>
                      <option value="gemini-3.1-pro-preview">3 Pro</option>
                    </select>
                    <button onClick={handleExtract} disabled={extracting}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-card text-[12px] font-medium text-foreground hover:bg-secondary disabled:opacity-50 transition-colors">
                      {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scan className="h-3 w-3" />}
                      {extracting ? "…" : "Extract"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Records content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {extracting ? (
                <div className="p-4">
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    {/* Progress header */}
                    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-secondary border-b border-border">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />
                      <span className="text-[13px] font-medium">
                        Gemini {selectedModel.replace("gemini-", "")} reading…
                      </span>
                      <div className="flex-1" />
                      <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                        {(extractElapsed / 1000).toFixed(1)}s
                        {modelAvgMs > 0 && ` / ~${Math.round(modelAvgMs / 1000)}s`}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="px-4 pt-3 pb-2">
                      <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                        <div
                          className="h-1 rounded-full transition-[width] duration-200 ease-linear"
                          style={{ width: `${extractPct}%`, background: "hsl(var(--primary))" }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[9.5px] text-muted-foreground/70">
                          {runCount > 0
                            ? `avg ${Math.round(modelAvgMs / 1000)}s · ${runCount} run${runCount === 1 ? "" : "s"}`
                            : "Recording timing for future estimates…"}
                        </span>
                        <span className="text-[9.5px] font-mono text-muted-foreground">{Math.round(extractPct)}%</span>
                      </div>
                    </div>

                    {/* Skeleton table */}
                    <div className="border-t border-border overflow-auto">
                      <table className="w-full border-collapse" style={{ fontSize: "12.5px" }}>
                        <thead>
                          <tr className="border-b border-border">
                            <th className="pl-3 pr-1 py-2 text-left w-7 bg-secondary" />
                            <th className="px-1 py-2 text-left font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary">Customer</th>
                            <th className="px-1 py-2 text-left font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary w-28">Date</th>
                            <th className="px-1 py-2 text-center font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary w-12">Type</th>
                            <th className="px-1 py-2 text-left font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary w-20">Mode</th>
                            <th className="px-1 py-2 text-right font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary w-24">Amount</th>
                            <th className="px-3 py-2 text-right font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary w-14">Conf.</th>
                            <th className="pr-2 bg-secondary w-6" />
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} index={i} />)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : extractError ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
                  <AlertCircle className="h-8 w-8 text-red-400" />
                  <div><p className="text-sm font-semibold text-red-400 mb-1">Extraction failed</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{extractError}</p></div>
                  <button onClick={() => { setExtractError(null); handleExtract(); }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-sm font-semibold hover:bg-foreground/85 transition-colors">
                    <RotateCcw className="h-3.5 w-3.5" /> Try again
                  </button>
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <ClipboardList className="h-10 w-10 opacity-20" />
                  <div className="text-center">
                    <p className="text-sm">{hasSession ? "Click Extract to run Gemini" : "Upload a PDF first"}</p>
                    <p className="text-xs mt-1 opacity-60">Extracted records will appear here</p>
                  </div>
                </div>
              ) : (
                /* ── x-table-card ── */
                <div className="p-4">
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    {/* Card header */}
                    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-secondary border-b border-border">
                      <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[13px] font-medium">Line items</span>
                      {avgConf > 0 && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium ${
                          avgConf >= 90 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : avgConf >= 80 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-red-500/15 text-red-400"
                        }`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          avg {avgConf}%
                        </span>
                      )}
                      <div className="flex-1" />
                      <div className="flex items-center gap-1">
                        <button onClick={undoRows} disabled={!rowsUndo.length} title="Undo (Ctrl+Z)"
                          className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                          <Undo2 className="h-3 w-3" />
                        </button>
                        <button onClick={redoRows} disabled={!rowsRedo.length} title="Redo (Ctrl+Y)"
                          className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                          <Redo2 className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">{rows.length} rows</span>
                    </div>

                    {/* Table */}
                    <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
                      <table className="w-full border-collapse" style={{ fontSize: "12.5px" }}>
                        <thead>
                          <tr className="border-b border-border">
                            <th className="pl-3 pr-1 py-2 text-left w-7 bg-secondary sticky top-0 z-10" />
                            <th className="px-1 py-2 text-left font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary sticky top-0 z-10">Customer</th>
                            <th className="px-1 py-2 text-left font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary sticky top-0 z-10 w-28">Date</th>
                            <th className="px-1 py-2 text-center font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary sticky top-0 z-10 w-12">Type</th>
                            <th className="px-1 py-2 text-left font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary sticky top-0 z-10 w-20">Mode</th>
                            <th className="px-1 py-2 text-right font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary sticky top-0 z-10 w-24">Amount</th>
                            <th className="px-3 py-2 text-right font-medium text-[11px] uppercase tracking-[.06em] text-muted-foreground bg-secondary sticky top-0 z-10 w-14">Conf.</th>
                            <th className="pr-2 bg-secondary sticky top-0 z-10 w-6" />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, i) => {
                            const prevDate = i > 0 ? rows[i - 1].collection_date : null;
                            const nextDate = i < rows.length - 1 ? rows[i + 1].collection_date : null;
                            const showDivider = prevDate !== null && row.collection_date !== prevDate;
                            const showSummary = nextDate !== row.collection_date;
                            const dt = dateTotals[row.collection_date] ?? { total: 0, cash: 0, online: 0 };
                            return (
                              <React.Fragment key={row.uid}>
                                {showDivider && (
                                  <tr>
                                    <td colSpan={8} className="px-3 pt-2.5 pb-1 bg-muted/30 border-t-2 border-primary/20">
                                      <span className="text-[9.5px] font-semibold uppercase tracking-[.1em] text-muted-foreground/60">
                                        {fmtTxnDate(ddmmToYyyyMmDd(row.collection_date))}
                                      </span>
                                    </td>
                                  </tr>
                                )}
                                <OcrTableRow
                                  row={row}
                                  index={i}
                                  onUpdate={updateRow}
                                  onDelete={deleteRow}
                                  fetchSuggestions={fetchCustomerSuggestions}
                                  isActive={activeRowUid === row.uid}
                                  onHoverIn={() => setActiveRowUid(row.uid)}
                                  onHoverOut={() => setActiveRowUid(null)}
                                />
                                {showSummary && (
                                  <tr className="bg-muted/20 border-b-2 border-primary/15">
                                    <td colSpan={2} className="pl-3 pr-1 py-1.5">
                                      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono">
                                        <span className="text-muted-foreground/50 text-[9px] uppercase tracking-wide font-semibold">subtotal</span>
                                        <span className="font-semibold text-foreground/80">₹{dt.total.toLocaleString("en-IN")}</span>
                                      </span>
                                    </td>
                                    <td colSpan={2} />
                                    <td colSpan={3} className="px-2 py-1.5 text-right">
                                      <span className="inline-flex items-center gap-2 text-[10px] font-mono">
                                        <span className="text-muted-foreground/50">Cash <span className="text-foreground/70 font-semibold">₹{dt.cash.toLocaleString("en-IN")}</span></span>
                                        <span className="text-border/60">·</span>
                                        <span className="text-muted-foreground/50">GPay <span className="text-sky-600 dark:text-sky-400 font-semibold">₹{dt.online.toLocaleString("en-IN")}</span></span>
                                      </span>
                                    </td>
                                    <td />
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Table footer toolbar */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-secondary border-t border-border">
                      {unassigned === 0 ? (
                        <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                          <CheckCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          All customers assigned ·
                          <span className="font-mono text-foreground/70">
                            ₹{totalAmount.toLocaleString("en-IN")} total
                          </span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[11.5px] text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          {unassigned} unassigned ·
                          <span className="font-mono text-foreground/70 text-[11.5px]">
                            ₹{totalAmount.toLocaleString("en-IN")} total
                          </span>
                        </span>
                      )}
                      <div className="flex-1" />
                      <button onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors">
                        <Plus className="h-3 w-3" /> Add row
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── UPI Reference column ── */}
          <div className="hidden xl:flex flex-col bg-secondary flex-shrink-0" style={{ width: 280 }}>
            {/* Ref header */}
            <div className="flex items-center justify-between px-4 border-b border-border flex-shrink-0" style={{ height: 48 }}>
              <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                <Wifi className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                UPI Reference
              </h3>
              <button onClick={() => setUpiExpanded((v) => !v)}
                className="flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${upiExpanded ? "rotate-180" : ""}`} />
              </button>
            </div>

            {/* UPI date info */}
            {allExtractedDates.length > 0 && (
              <div className="flex items-center justify-between px-4 py-1.5 border-b border-border/50">
                <span className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground/50">
                  {allExtractedDates.length === 1 ? allExtractedDates[0] : `${allExtractedDates[0]} + ${allExtractedDates.length - 1} more`}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground/50">{upiTxns.length} txns</span>
              </div>
            )}

            {/* Search */}
            {upiTxns.length > 0 && (
              <div className="px-3 py-2 border-b border-border/50">
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-2.5 py-1.5">
                  <Search className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <input
                    type="text"
                    value={upiSearch}
                    onChange={(e) => setUpiSearch(e.target.value)}
                    placeholder="Search sender or customer…"
                    className="flex-1 text-[11.5px] bg-transparent focus:outline-none font-mono placeholder:font-sans placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>
            )}

            {/* UPI list */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loadingUpi ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs">Loading…</span>
                </div>
              ) : !hasSession || (!loadingUpi && allExtractedDates.length === 0) ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/40 py-10">
                  <Wifi className="h-8 w-8 opacity-30" />
                  <p className="text-xs text-center px-4">UPI transactions appear here after extraction</p>
                </div>
              ) : filteredUpi.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground/40 py-8 px-4">
                  {upiSearch ? "No matches" : `No UPI credits for ${allExtractedDates.length > 1 ? "these dates" : extractedDate}`}
                </p>
              ) : (
                <div>
                  {upiGroupDates.map((date) => (
                    <React.Fragment key={date}>
                      {/* Date separator */}
                      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-1 bg-secondary/95 border-b border-border/40 backdrop-blur-sm">
                        <span className="text-[9.5px] font-semibold uppercase tracking-[.08em] text-muted-foreground/60">
                          {fmtTxnDate(date)}
                        </span>
                        <span className="text-[9.5px] font-mono text-muted-foreground/40">{upiByDate[date].length}</span>
                      </div>
                      {upiByDate[date].map((txn) => {
                        const isMapped = txn.mapped_customer_id != null;
                        const isStruck = struckUpiIds.has(txn.id);
                        const isApplied = appliedUpiTxns.has(txn.id);
                        return (
                          <div
                            key={txn.id}
                            className={`flex items-center gap-2 px-4 py-2.5 cursor-default group border-b border-border/30 transition-colors last:border-0 ${
                              isStruck ? "opacity-40"
                              : isApplied ? "bg-emerald-50/70 dark:bg-emerald-950/20"
                              : isMapped ? "hover:bg-primary/10"
                              : "hover:bg-muted/60"
                            }`}
                            style={isMapped && !isStruck && !isApplied ? {
                              background: "color-mix(in oklab, hsl(var(--primary)) 8%, transparent)"
                            } : undefined}
                          >
                            <div className="flex-1 min-w-0">
                              <p className={`text-[12.5px] font-medium truncate ${isStruck ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                {txn.sender_name || txn.sender_vpa || "—"}
                              </p>
                              {isMapped ? (
                                <p className={`text-[10.5px] flex items-center gap-0.5 mt-0.5 truncate ${
                                  isStruck ? "line-through text-muted-foreground/50"
                                  : isApplied ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-emerald-700 dark:text-emerald-400"
                                }`}>
                                  <CheckCircle className="h-2.5 w-2.5 flex-shrink-0" />
                                  {txn.mapped_customer_name}
                                  {txn.mapped_customer_type && (
                                    <span className={`ml-1 text-[8.5px] font-bold px-1 py-px rounded uppercase ${
                                      txn.mapped_customer_type === "edi" ? "bg-blue-500/15 text-blue-700 dark:text-blue-400" : "bg-orange-500/15 text-orange-700 dark:text-orange-400"
                                    }`}>{txn.mapped_customer_type}</span>
                                  )}
                                </p>
                              ) : (
                                <p className="text-[10.5px] text-muted-foreground/40 mt-0.5">Unmapped</p>
                              )}
                            </div>
                            <span className={`text-[12.5px] font-semibold font-mono flex-shrink-0 ${
                              isStruck ? "line-through text-muted-foreground" : "text-emerald-700 dark:text-emerald-400"
                            }`}>
                              ₹{Number(txn.amount).toLocaleString("en-IN")}
                            </span>
                            {isMapped && !isStruck && (
                              isApplied ? (
                                <button
                                  onClick={() => undoUpiTxn(txn)}
                                  className="flex-shrink-0 flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium text-muted-foreground bg-muted/80 hover:bg-muted border border-border/60 transition-colors"
                                >
                                  <RotateCcw className="h-2.5 w-2.5" />Undo
                                </button>
                              ) : (
                                <button
                                  onClick={() => applyUpiTxn(txn)}
                                  title={`Apply ₹${Number(txn.amount).toLocaleString("en-IN")} as ONLINE + Paid`}
                                  className="flex-shrink-0 flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800/50 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <CheckCircle className="h-2.5 w-2.5" />Apply
                                </button>
                              )
                            )}
                            <button
                              onClick={() => setStruckUpiIds((prev) => { const next = new Set(prev); next.has(txn.id) ? next.delete(txn.id) : next.add(txn.id); return next; })}
                              className="flex-shrink-0 p-1 rounded text-muted-foreground/20 hover:text-muted-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Strikethrough className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>

            {/* No-UPI skip card */}
            {hasSession && !loadingUpi && allExtractedDates.length > 0 && upiTxns.length === 0 && rows.length > 0 && wfStep !== null && wfStep <= 4 && (
              <div className="p-3 border-t border-border bg-background flex-shrink-0">
                <p className="text-[11px] text-muted-foreground mb-2">
                  No UPI credits for {allExtractedDates.length > 1 ? "these dates" : extractedDate}.
                </p>
                <button
                  onClick={() => { setWfDone((prev) => new Set([...prev, 3, 4])); setWfStep(5); }}
                  className="w-full py-1.5 rounded-lg bg-foreground text-background text-[11.5px] font-semibold hover:bg-foreground/85 transition-colors"
                >
                  Skip to Expenses →
                </button>
              </div>
            )}

            {/* Suggested action card (when there are unmapped txns) */}
            {hasSession && upiTxns.length > 0 && !loadingUpi && (
              <div className="p-3 border-t border-border bg-background flex-shrink-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground/60">Summary</span>
                </div>
                <div className="text-[11.5px] text-muted-foreground leading-relaxed mb-2">
                  <span className="font-mono text-foreground font-semibold">{upiTxns.filter(t => t.mapped_customer_id != null).length}</span> of{" "}
                  <span className="font-mono text-foreground">{upiTxns.length}</span> UPI credits matched to customers.
                  Total <span className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                    ₹{upiTxns.reduce((s, t) => s + Number(t.amount), 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom dock ── */}
        <div className="flex items-center gap-4 px-4 border-t border-border bg-secondary flex-shrink-0 font-mono"
          style={{ height: 32, fontSize: "11.5px", color: "hsl(var(--muted-foreground))" }}>
          {hasSession ? (
            <>
              <span><span style={{ color: "hsl(var(--foreground)/0.7)", fontWeight: 500 }}>{fileName}</span></span>
              <span style={{ width: 1, height: 14, background: "hsl(var(--border))", display: "inline-block" }} />
              <span>{formatBytes(fileSize)}</span>
              <span style={{ width: 1, height: 14, background: "hsl(var(--border))", display: "inline-block" }} />
              <span>{totalPages} pages</span>
              <div style={{ flex: 1 }} />
              {activeRowUid && (() => {
                const r = rows.find((x) => x.uid === activeRowUid);
                return r ? (
                  <span>
                    row · <span style={{ color: "hsl(var(--foreground)/0.7)", fontWeight: 500 }}>{r.customer_name || "—"}</span> · conf{" "}
                    <span style={{ color: "hsl(var(--foreground)/0.7)", fontWeight: 500 }}>{Math.round(r.confidence_score * 100)}%</span>
                  </span>
                ) : null;
              })()}
              {!activeRowUid && <span>Hover a row to see details</span>}
              <span style={{ width: 1, height: 14, background: "hsl(var(--border))", display: "inline-block" }} />
              <span>p.{pageIndex + 1}</span>
            </>
          ) : (
            <span>Upload a PDF to begin · Powered by Gemini</span>
          )}
        </div>
      </div>

      <AddRowModal open={showAddModal} defaultDate={extractedDate ?? todayStr}
        onClose={() => setShowAddModal(false)} onAdd={addManualRow} fetchSuggestions={fetchCustomerSuggestions} />
      {showDateConfirm && pendingExtracted.length > 0 && (
        <DateConfirmModal pendingRows={pendingExtracted}
          onConfirm={handleDateConfirmed} onCancel={() => { setShowDateConfirm(false); setPendingExtracted([]); }} />
      )}
      {wfStep === 5 && allExtractedDates.length > 0 && (
        <ExpenseStepPanel
          dates={allExtractedDates}
          isMobile={isMobile}
          onDone={() => wfComplete(5, 6)}
          onSkip={() => wfSkipStep(5, 6)}
          onSkipAll={() => wfSkipAll(5)}
        />
      )}
      {wfStep === 6 && (
        <CustomerStepOverlay
          onDone={() => wfComplete(6, 7)}
          onSkip={() => wfSkipStep(6, 7)}
          onSkipAll={() => wfSkipAll(6)}
        />
      )}
      {wfStep === 7 && (
        <FinalSummaryModal
          rows={rows}
          totalAmount={totalAmount}
          assignedCount={assignedCount}
          unassigned={unassigned}
          submitting={submitting}
          onSubmit={handleSubmit}
          onClose={() => wfSkipStep(7, null)}
        />
      )}
    </>
  );
}
