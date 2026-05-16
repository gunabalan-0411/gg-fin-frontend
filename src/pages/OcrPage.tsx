import React, { useCallback, useRef, useState } from "react";
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  Scan,
  Send,
  Trash2,
  AlertTriangle,
  Loader2,
  Image as ImageIcon,
  ClipboardList,
  RefreshCw,
} from "lucide-react";
import { useIsMobile } from "@/hooks/useBreakpoint";
import { ocrApi } from "@/services/api";
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

// ── Utilities ─────────────────────────────────────────────────────────────────
function mkUid() {
  return Math.random().toString(36).slice(2, 9);
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
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
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
              ? "bg-purple-500/20 text-purple-400"
              : "bg-blue-500/20 text-blue-400"
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

  const [uploading, setUploading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageImageB64, setPageImageB64] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mobileTab, setMobileTab] = useState<"image" | "records">("image");

  const hasSession = Boolean(sessionId);
  const unassigned = rows.filter((r) => !r.customer_id).length;
  const assignedCount = rows.filter((r) => r.customer_id).length;

  // ── File processing ───────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please select a PDF file");
      return;
    }
    setUploading(true);
    const tid = toast.loading("Uploading PDF…");
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await ocrApi.upload(form);
      setSessionId(data.session_id);
      setTotalPages(data.total_pages);
      setPageIndex(0);
      setPageImageB64(null);
      setRows([]);
      toast.success(`${data.total_pages} page${data.total_pages !== 1 ? "s" : ""} ready`, {
        id: tid,
      });
    } catch {
      toast.error("Upload failed", { id: tid });
    } finally {
      setUploading(false);
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

  // ── Extract ───────────────────────────────────────────────────────────────
  const handleExtract = async () => {
    if (!sessionId) return;
    setExtracting(true);
    const tid = toast.loading("Gemini is reading the page…");
    try {
      const { data } = await ocrApi.extract({ session_id: sessionId, page_index: pageIndex });
      setPageImageB64(data.page_image_b64);
      setRows(
        (data.records as any[]).map((r) => ({
          ...r,
          uid: mkUid(),
          product_type: ((r.product_type as string) || "EDI").toUpperCase() as "EDI" | "IOP",
          payment_mode: ((r.payment_mode as string) || "CASH").toUpperCase() as "CASH" | "ONLINE",
        }))
      );
      toast.success(`${data.records.length} records extracted`, { id: tid });
      if (isMobile) setMobileTab("records");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Extraction failed", { id: tid });
    } finally {
      setExtracting(false);
    }
  };

  // ── Page navigation ───────────────────────────────────────────────────────
  const goPage = (dir: -1 | 1) => {
    const next = pageIndex + dir;
    if (next < 0 || next >= totalPages) return;
    setPageIndex(next);
    setPageImageB64(null);
    setRows([]);
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
    setRows([]);
    setTotalPages(0);
    setPageIndex(0);
  };

  // ── Shared JSX ────────────────────────────────────────────────────────────
  const uploadZone = (
    <div
      className={`w-full max-w-md mx-auto border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
        isDragging
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/50 hover:bg-muted/30"
      }`}
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      {uploading ? (
        <Loader2 className="h-12 w-12 mx-auto mb-4 text-primary animate-spin" />
      ) : (
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
      )}
      <p className="text-base font-semibold mb-1">
        {uploading ? "Uploading…" : "Upload handwritten PDF"}
      </p>
      {!uploading && (
        <p className="text-sm text-muted-foreground">Drag & drop or click to browse</p>
      )}
      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={onInput} />
    </div>
  );

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
      <button
        onClick={handleExtract}
        disabled={extracting}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
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
      {pageImageB64 ? (
        <img
          src={`data:image/png;base64,${pageImageB64}`}
          alt={`Page ${pageIndex + 1}`}
          className="w-full object-contain"
        />
      ) : extracting ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm">Gemini is reading the page…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground gap-3">
          <ImageIcon className="h-10 w-10 opacity-30" />
          <p className="text-sm">Click "Extract This Page" to process</p>
        </div>
      )}
    </div>
  );

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
        {rows.length > 0 && (
          <button
            onClick={handleSubmit}
            disabled={submitting || assignedCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
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

      {rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 py-12">
          <ClipboardList className="h-10 w-10 opacity-30" />
          <div className="text-center">
            <p className="text-sm">No records extracted yet</p>
            <p className="text-xs mt-1 opacity-70">Navigate to a page and click Extract</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-0.5">
          {rows.map((row) => (
            <RecordCard key={row.uid} row={row} onUpdate={updateRow} onDelete={deleteRow} />
          ))}
        </div>
      )}
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
