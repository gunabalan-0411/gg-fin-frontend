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
} from "lucide-react";
import { useIsMobile } from "@/hooks/useBreakpoint";
import { ocrApi, upiApi } from "@/services/api";
import toast from "react-hot-toast";

// ── Types ─────────────────────────────────────────────────────────────────────
type Suggestion = { id: number; name: string; score: number };

type Row = {
  uid: string;
  collection_date: string;
  customer_name: string;
  customer_id: number | null;
  product_type: "EDI" | "IOP";
  payment_mode: "CASH" | "ONLINE";
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

function confidenceDot(score: number) {
  if (score >= 0.9) return "bg-green-500";
  if (score >= 0.7) return "bg-yellow-400";
  return "bg-red-500";
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

// Convert DD-MM-YYYY to YYYY-MM-DD for API queries
function ddmmToYyyyMmDd(dmy: string): string {
  const parts = dmy.split("-");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// ── CustomerCombobox ──────────────────────────────────────────────────────────
function CustomerCombobox({
  row,
  onChange,
}: {
  row: Row;
  onChange: (name: string, id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex-1 min-w-0">
      <input
        type="text"
        value={row.customer_name}
        onChange={(e) => onChange(e.target.value, null)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        className={`w-full text-sm rounded-lg border px-3 py-1.5 bg-background focus:outline-none focus:ring-2 pr-7 ${
          row.customer_id
            ? "border-green-500/40 focus:ring-green-500/20"
            : "border-yellow-500/40 focus:ring-yellow-500/20"
        }`}
        placeholder="Customer name…"
      />
      {!row.customer_id && (
        <AlertTriangle className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-yellow-400 pointer-events-none" />
      )}
      {open && row.customer_suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          {row.customer_suggestions.map((s) => (
            <button
              key={s.id}
              onMouseDown={() => {
                onChange(s.name, s.id);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent text-sm text-left gap-3"
            >
              <span className="font-medium truncate">{s.name}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-semibold ${
                  s.score >= 0.9
                    ? "bg-green-500/20 text-green-400"
                    : s.score >= 0.75
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {Math.round(s.score * 100)}%
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── RecordCard ────────────────────────────────────────────────────────────────
function RecordCard({
  row,
  onUpdate,
  onDelete,
}: {
  row: Row;
  onUpdate: (uid: string, patch: Partial<Row>) => void;
  onDelete: (uid: string) => void;
}) {
  return (
    <div
      className={`rounded-xl border p-3 space-y-2 ${
        row.customer_id
          ? "border-border"
          : "border-yellow-500/30 bg-yellow-500/5"
      }`}
    >
      {/* Name row */}
      <div className="flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full flex-shrink-0 ${confidenceDot(row.confidence_score)}`}
          title={`Confidence: ${Math.round(row.confidence_score * 100)}%`}
        />
        <CustomerCombobox
          row={row}
          onChange={(name, id) => onUpdate(row.uid, { customer_name: name, customer_id: id })}
        />
        <button
          onClick={() => onDelete(row.uid)}
          className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Fields row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          type="date"
          value={ddmmyyyyToInput(row.collection_date)}
          onChange={(e) =>
            onUpdate(row.uid, { collection_date: inputToDdmmyyyy(e.target.value) })
          }
          className="text-xs rounded-lg border border-border px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <button
          onClick={() =>
            onUpdate(row.uid, { product_type: row.product_type === "EDI" ? "IOP" : "EDI" })
          }
          className={`text-xs px-2 py-1 rounded-lg font-bold transition-colors ${
            row.product_type === "IOP"
              ? "bg-accent/60 text-foreground/70"
              : "bg-primary/25 text-foreground/70"
          }`}
        >
          {row.product_type}
        </button>
        <button
          onClick={() =>
            onUpdate(row.uid, {
              payment_mode: row.payment_mode === "CASH" ? "ONLINE" : "CASH",
            })
          }
          className={`text-xs px-2 py-1 rounded-lg font-bold transition-colors ${
            row.payment_mode === "ONLINE"
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {row.payment_mode}
        </button>
        <div className="flex items-center border border-border rounded-lg px-2 py-1 bg-background ml-auto">
          <span className="text-xs text-muted-foreground mr-1">₹</span>
          <input
            type="number"
            value={row.amount || ""}
            onChange={(e) => onUpdate(row.uid, { amount: Number(e.target.value) })}
            className="w-20 text-sm font-semibold bg-transparent focus:outline-none"
          />
        </div>
      </div>

      {row.notes && (
        <p className="text-xs text-muted-foreground italic pl-4">{row.notes}</p>
      )}
    </div>
  );
}

// ── OcrPage ───────────────────────────────────────────────────────────────────
export default function OcrPage() {
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
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
  const [isDragging, setIsDragging] = useState(false);
  const [mobileTab, setMobileTab] = useState<"image" | "records">("image");

  // Per-page row storage: { [pageIndex]: Row[] }
  const [pageRows, setPageRows] = useState<Record<number, Row[]>>({});
  const rows = pageRows[pageIndex] ?? [];

  // Per-page UPI transactions: { [pageIndex]: UpiTxn[] }
  const [pageUpiTxns, setPageUpiTxns] = useState<Record<number, UpiTxn[]>>({});
  const upiTxns = pageUpiTxns[pageIndex] ?? [];
  const [loadingUpi, setLoadingUpi] = useState(false);
  const [upiExpanded, setUpiExpanded] = useState(true);
  const [struckUpiIds, setStruckUpiIds] = useState<Set<number>>(new Set());

  const [submitting, setSubmitting] = useState(false);

  const hasSession = Boolean(sessionId) && !uploadStage;
  const unassigned = rows.filter((r) => !r.customer_id).length;
  const assignedCount = rows.filter((r) => r.customer_id).length;

  // Helper to update rows for the current page
  const setRows = useCallback(
    (updater: Row[] | ((prev: Row[]) => Row[])) => {
      setPageRows((prev) => ({
        ...prev,
        [pageIndex]:
          typeof updater === "function" ? updater(prev[pageIndex] ?? []) : updater,
      }));
    },
    [pageIndex]
  );

  // Auto-load the page image whenever session or page changes
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setPageImageB64(null);
    setLoadingImage(true);
    ocrApi.getPage(sessionId, pageIndex)
      .then(({ data }) => { if (!cancelled) setPageImageB64(data.page_image_b64); })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoadingImage(false); });
    return () => { cancelled = true; };
  }, [sessionId, pageIndex]);

  // ── File processing ───────────────────────────────────────────────────────
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
        // Switch to "preparing" spinner the moment the file finishes transferring.
        // The server is still preprocessing page 0 at this point — this gives
        // accurate visual feedback instead of a frozen progress bar at 100%.
        if (pct >= 100) setUploadStage("processing");
      });
      // Response arrives: page 0 is already preprocessed server-side.
      // Set session state — the useEffect will call getPage and get a cache hit.
      setSessionId(data.session_id);
      setTotalPages(data.total_pages);
      setPageIndex(0);
      setPageImageB64(null);
      setPageRows({});
      setPageUpiTxns({});
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

  // ── Fetch UPI transactions for given dates ────────────────────────────────
  const fetchUpiForDates = useCallback(
    async (dates: string[], targetPage: number) => {
      if (!dates.length) return;
      // Convert DD-MM-YYYY → YYYY-MM-DD and find min/max
      const isoDatesList = dates
        .map(ddmmToYyyyMmDd)
        .filter(Boolean)
        .sort();
      if (!isoDatesList.length) return;
      setLoadingUpi(true);
      try {
        const { data } = await upiApi.list({
          date_from: isoDatesList[0],
          date_to: isoDatesList[isoDatesList.length - 1],
          transaction_type: "credit",
          limit: 200,
        });
        const txns: UpiTxn[] = (data.data ?? []);
        setPageUpiTxns((prev) => ({ ...prev, [targetPage]: txns }));
      } catch {
        // Non-critical — don't show error for UPI fetch failure
      } finally {
        setLoadingUpi(false);
      }
    },
    []
  );

  // ── Extract ───────────────────────────────────────────────────────────────
  const handleExtract = async () => {
    if (!sessionId) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const { data } = await ocrApi.extract({
        session_id: sessionId,
        page_index: pageIndex,
        model: selectedModel,
      });
      setPageImageB64(data.page_image_b64);
      const extracted = (data.records as any[]).map((r) => ({
        ...r,
        uid: mkUid(),
        product_type: ((r.product_type as string) || "EDI").toUpperCase() as "EDI" | "IOP",
        payment_mode: ((r.payment_mode as string) || "CASH").toUpperCase() as "CASH" | "ONLINE",
      }));
      setRows(extracted);
      toast.success(`${data.records.length} records extracted`);
      if (isMobile) setMobileTab("records");

      // Auto-fetch UPI transactions for extracted dates
      const uniqueDates = [...new Set(extracted.map((r) => r.collection_date as string))];
      fetchUpiForDates(uniqueDates, pageIndex);
    } catch (err: any) {
      setExtractError(httpError(err));
    } finally {
      setExtracting(false);
    }
  };

  // ── Page navigation — rows are retained per page, not cleared ────────────
  const goPage = (dir: -1 | 1) => {
    const next = pageIndex + dir;
    if (next < 0 || next >= totalPages) return;
    setPageIndex(next);
    setExtractError(null);
  };

  // ── Row mutations ─────────────────────────────────────────────────────────
  const updateRow = (uid: string, patch: Partial<Row>) =>
    setRows((r) => r.map((row) => (row.uid === uid ? { ...row, ...patch } : row)));

  const deleteRow = (uid: string) =>
    setRows((r) => r.filter((row) => row.uid !== uid));

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const valid = rows.filter((r) => r.customer_id && r.amount > 0);
    if (!valid.length) {
      toast.error("No valid records — assign a customer to at least one row");
      return;
    }
    setSubmitting(true);
    const tid = toast.loading(`Saving ${valid.length} records…`);
    try {
      const { data } = await ocrApi.submit({
        records: valid.map((r) => ({
          collection_date: r.collection_date,
          customer_name: r.customer_name,
          customer_id: r.customer_id,
          product_type: r.product_type,
          payment_mode: r.payment_mode,
          amount: r.amount,
        })),
      });
      toast.success(`${data.submitted} records saved`, { id: tid });
      // Clear submitted page rows
      setRows([]);
    } catch {
      toast.error("Submit failed", { id: tid });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setSessionId(null);
    setPageImageB64(null);
    setPageRows({});
    setPageUpiTxns({});
    setTotalPages(0);
    setPageIndex(0);
    setUploadError(null);
    setExtractError(null);
  };

  // ── Shared JSX ────────────────────────────────────────────────────────────
  const uploadZone = (() => {
    if (uploadError) {
      return (
        <div className="w-full max-w-md mx-auto rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center space-y-3">
          <AlertCircle className="h-10 w-10 mx-auto text-red-400" />
          <p className="text-sm font-semibold text-red-400">Upload failed</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{uploadError}</p>
          <button
            onClick={() => { setUploadError(null); fileInputRef.current?.click(); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-sm font-semibold hover:bg-foreground/85 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={onInput} />
        </div>
      );
    }

    if (uploadStage === "uploading") {
      const uploaded = Math.round((uploadProgress / 100) * fileSize);
      return (
        <div className="w-full max-w-md mx-auto rounded-2xl border border-border bg-card p-8 space-y-4">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(uploaded)} of {formatBytes(fileSize)}
              </p>
            </div>
            <span className="ml-auto text-sm font-bold text-foreground/70 flex-shrink-0">
              {uploadProgress}%
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-foreground/70 h-2 rounded-full transition-all duration-150"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-center text-muted-foreground">Uploading to server…</p>
        </div>
      );
    }

    if (uploadStage === "processing") {
      return (
        <div className="w-full max-w-md mx-auto rounded-2xl border border-border bg-card p-10 text-center space-y-3">
          <Loader2 className="h-10 w-10 mx-auto text-muted-foreground animate-spin" />
          <p className="text-sm font-semibold">Preparing first page…</p>
          <p className="text-xs text-muted-foreground">Optimising image for best OCR accuracy</p>
        </div>
      );
    }

    return (
      <div
        className={`w-full max-w-md mx-auto border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-foreground/30 bg-primary/15"
            : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-base font-semibold mb-1">Upload handwritten PDF</p>
        <p className="text-sm text-muted-foreground">Drag & drop or click to browse</p>
        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={onInput} />
      </div>
    );
  })();

  const pageControls = hasSession && (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1">
        <button
          onClick={() => goPage(-1)}
          disabled={pageIndex === 0}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm px-3 py-1 bg-muted rounded-lg font-medium min-w-[76px] text-center">
          {pageIndex + 1} / {totalPages}
        </span>
        <button
          onClick={() => goPage(1)}
          disabled={pageIndex >= totalPages - 1}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        disabled={extracting}
        className="text-xs rounded-lg border border-border px-2 py-2 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 cursor-pointer"
      >
        <option value="gemini-2.5-flash">2.5 Flash ⚡</option>
        <option value="gemini-2.5-pro">2.5 Pro ★</option>
        <option value="gemini-3-flash-preview">3 Flash (Preview)</option>
        <option value="gemini-3-pro-preview">3 Pro (Preview)</option>
        <option value="gemini-3.1-pro-preview">3.1 Pro (Preview)</option>
      </select>
      <button
        onClick={handleExtract}
        disabled={extracting}
        className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-sm font-semibold hover:bg-foreground/85 disabled:opacity-60 transition-colors"
      >
        {extracting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Scan className="h-4 w-4" />
        )}
        {extracting ? "Extracting…" : "Extract This Page"}
      </button>
      <button
        onClick={reset}
        className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        title="Change PDF"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const imageArea = (
    <div className="flex-1 overflow-auto rounded-xl border border-border bg-muted/20 min-h-0">
      {loadingImage ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm">Loading page…</p>
        </div>
      ) : pageImageB64 ? (
        <img
          src={`data:image/png;base64,${pageImageB64}`}
          alt={`Page ${pageIndex + 1}`}
          className="w-full object-contain"
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground gap-3">
          <ImageIcon className="h-10 w-10 opacity-30" />
          <p className="text-sm">Page will appear here</p>
        </div>
      )}
    </div>
  );

  // ── UPI section ───────────────────────────────────────────────────────────
  const extractedDate = rows[0]?.collection_date ?? null;
  const hasUpiData = upiTxns.length > 0 || loadingUpi;
  const upiSection = hasUpiData ? (
    <div className="flex-shrink-0 border-t border-border mt-1">
      <button
        onClick={() => setUpiExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-0 py-2.5 hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-2">
          <Wifi className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            UPI — {extractedDate ?? "…"}
          </span>
          <span className="text-xs text-muted-foreground">{upiTxns.length} txns</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${upiExpanded ? "rotate-180" : ""}`}
        />
      </button>
      {upiExpanded && (
        <div className="border-t border-border/50 divide-y divide-border/40 max-h-56 overflow-y-auto">
          {loadingUpi ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Loading UPI transactions…</span>
            </div>
          ) : upiTxns.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground/50">
              No UPI transactions for {extractedDate ?? "this date"}
            </p>
          ) : (
            upiTxns.map((txn) => {
              const isMapped = txn.mapped_customer_id != null;
              const isStruck = struckUpiIds.has(txn.id);
              return (
                <div key={txn.id} className={`flex items-center gap-3 px-4 py-2.5 ${isStruck ? "opacity-40" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isStruck ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {txn.sender_name || txn.sender_vpa || "—"}
                    </p>
                    {isMapped ? (
                      <p className={`text-xs truncate flex items-center gap-0.5 ${isStruck ? "line-through text-muted-foreground/50" : "text-emerald-400"}`}>
                        <CheckCircle className="h-3 w-3 flex-shrink-0" />
                        {txn.mapped_customer_name || `#${txn.mapped_customer_id}`}
                        {txn.mapped_customer_type && (
                          <span className={`ml-1 text-[9px] font-bold px-1 py-0.5 rounded uppercase ${txn.mapped_customer_type === "edi" ? "bg-primary/25 text-foreground/65" : "bg-accent/60 text-foreground/65"}`}>
                            {txn.mapped_customer_type}
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/50">Unmapped</p>
                    )}
                  </div>
                  <span className={`text-sm font-bold flex-shrink-0 ${isStruck ? "line-through text-muted-foreground" : "text-emerald-400"}`}>
                    ₹{Number(txn.amount).toLocaleString("en-IN")}
                  </span>
                  <button
                    onClick={() => setStruckUpiIds((prev) => {
                      const next = new Set(prev);
                      next.has(txn.id) ? next.delete(txn.id) : next.add(txn.id);
                      return next;
                    })}
                    className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${isStruck ? "bg-secondary text-muted-foreground" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary"}`}
                  >
                    <Strikethrough className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  ) : null;

  const recordsPanel = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div>
          <p className="text-sm font-semibold">
            {rows.length > 0 ? `${rows.length} records` : "No records yet"}
          </p>
          {unassigned > 0 && (
            <p className="text-xs text-yellow-400 flex items-center gap-1 mt-0.5">
              <AlertTriangle className="h-3 w-3" />
              {unassigned} unassigned — select from dropdown
            </p>
          )}
        </div>
        {rows.length > 0 && !extracting && (
          <button
            onClick={handleSubmit}
            disabled={submitting || assignedCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-sm font-semibold hover:bg-foreground/85 disabled:opacity-60 transition-colors"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Submit {assignedCount > 0 ? assignedCount : ""}
          </button>
        )}
      </div>

      {extracting ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">Gemini is reading the page…</p>
            <p className="text-xs text-muted-foreground mt-1">Usually takes 10–20 seconds</p>
          </div>
        </div>
      ) : extractError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8 px-2 text-center">
          <AlertCircle className="h-8 w-8 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-400 mb-1">Extraction failed</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{extractError}</p>
          </div>
          <button
            onClick={() => { setExtractError(null); handleExtract(); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-sm font-semibold hover:bg-foreground/85 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 py-12">
          <ClipboardList className="h-10 w-10 opacity-30" />
          <div className="text-center">
            <p className="text-sm">No records extracted yet</p>
            <p className="text-xs mt-1 opacity-70">Click "Extract This Page" to run Gemini</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-0.5">
          {rows.map((row) => (
            <RecordCard key={row.uid} row={row} onUpdate={updateRow} onDelete={deleteRow} />
          ))}
        </div>
      )}

      {upiSection}
    </div>
  );

  // ── Mobile layout ─────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex flex-col h-full pb-[84px]">
        {!hasSession ? (
          <div className="flex-1 flex items-center justify-center px-4">{uploadZone}</div>
        ) : (
          <>
            <div className="flex bg-muted/50 rounded-xl mx-4 mt-3 p-1 flex-shrink-0">
              {(["image", "records"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMobileTab(tab)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mobileTab === tab
                      ? "bg-card shadow text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {tab === "image" ? (
                    <ImageIcon className="h-4 w-4" />
                  ) : (
                    <ClipboardList className="h-4 w-4" />
                  )}
                  {tab === "image"
                    ? "Image"
                    : `Records${rows.length > 0 ? ` (${rows.length})` : ""}`}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-hidden flex flex-col px-4 pt-3 gap-3 min-h-0">
              {mobileTab === "image" ? (
                <>
                  {pageControls}
                  {imageArea}
                </>
              ) : (
                recordsPanel
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Image viewer */}
      <div className="flex-1 flex flex-col gap-4 p-6 border-r border-border overflow-hidden min-w-0">
        <div className="flex items-center justify-between flex-shrink-0">
          <h1 className="text-xl font-bold">OCR Entry</h1>
        </div>
        {!hasSession ? (
          <div className="flex-1 flex items-center justify-center">{uploadZone}</div>
        ) : (
          <>
            <div className="flex-shrink-0">{pageControls}</div>
            {imageArea}
          </>
        )}
      </div>

      {/* Right: Records */}
      <div className="w-[460px] flex-shrink-0 flex flex-col gap-4 p-6 overflow-hidden">
        <h1 className="text-xl font-bold flex-shrink-0">Records</h1>
        <div className="flex-1 min-h-0">{recordsPanel}</div>
      </div>
    </div>
  );
}
