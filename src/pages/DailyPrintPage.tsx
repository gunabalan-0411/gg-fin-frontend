import { useEffect, useRef, useState } from "react";
import { Download, Printer, Share2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { printApi } from "@/services/api";

type Product = "edi" | "iop";

interface ColDef {
  key: string;
  label: string;
}

const ALL_COLS: ColDef[] = [
  { key: "id",      label: "ID"        },
  { key: "name",    label: "பெயர்"     },
  { key: "date",    label: "தொடக்கம்"  },
  { key: "loan",    label: "கடன் ₹"    },
  { key: "balance", label: "நிலுவை ₹"  },
  { key: "days",    label: "நாட்கள்"   },
  { key: "collect", label: "வசூல் ₹"   },
];

export default function DailyPrintPage() {
  const [product, setProduct]         = useState<Product>("edi");
  const [enabledCols, setEnabledCols] = useState<Record<string, boolean>>(
    () => Object.fromEntries(ALL_COLS.map((c) => [c.key, true]))
  );
  const [twoCol, setTwoCol]           = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const [pdfUrl, setPdfUrl]   = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const abortRef  = useRef<AbortController | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const today     = new Date();
  const dateLabel = today.toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const activeCols = ALL_COLS
    .filter((c) => enabledCols[c.key])
    .map((c) => c.key)
    .join(",");

  function fetchPdf() {
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    // Revoke old blob URL
    setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setPdfBlob(null);

    const params = { cols: activeCols || "id,name,date,loan,balance,days,collect", two_col: twoCol };
    const req = product === "edi"
      ? printApi.edi(params, ctrl.signal)
      : printApi.iop(params, ctrl.signal);

    req
      .then((res) => {
        if (ctrl.signal.aborted) return;
        const blob = res.data as Blob;
        setPdfBlob(blob);
        setPdfUrl(URL.createObjectURL(blob));
        setLoading(false);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return; // a newer request is already running
        const msg = err?.message ?? "Failed to generate PDF";
        setError(msg);
        setLoading(false);
      });
  }

  // Auto-fetch when product changes
  useEffect(() => {
    fetchPdf();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDownload() {
    if (!pdfUrl) return;
    const label   = product === "edi" ? "EDI_Daily" : "IOP_Interest";
    const dateStr = today.toLocaleDateString("en-IN", {
      day: "2-digit", month: "2-digit", year: "numeric",
    }).replace(/\//g, "-");
    const a = document.createElement("a");
    a.href     = pdfUrl;
    a.download = `${label}_${dateStr}.pdf`;
    a.click();
  }

  function handlePrint() {
    if (!pdfUrl) return;
    const win = window.open(pdfUrl, "_blank");
    if (win) win.onload = () => win.print();
  }

  async function handleShare() {
    if (!pdfBlob) return;
    const label   = product === "edi" ? "EDI_Daily" : "IOP_Interest";
    const dateStr = today.toLocaleDateString("en-IN", {
      day: "2-digit", month: "2-digit", year: "numeric",
    }).replace(/\//g, "-");
    const filename = `${label}_${dateStr}.pdf`;
    const file     = new File([pdfBlob], filename, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); } catch { /* cancelled */ }
    } else {
      handleDownload();
    }
  }

  function toggleCol(key: string) {
    setEnabledCols((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-background flex-shrink-0 gap-3 flex-wrap">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground leading-none">Daily Print</h1>
          <p className="text-[12px] text-muted-foreground mt-1">{dateLabel}</p>
        </div>

        {/* Product toggle */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(["edi", "iop"] as Product[]).map((p) => (
            <button
              key={p}
              onClick={() => setProduct(p)}
              className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all duration-150 ${
                product === p
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOptions((v) => !v)}
            className={`flex items-center gap-1.5 px-3 h-8 rounded-lg border text-[13px] transition-colors ${
              showOptions
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Options
          </button>
          <button
            onClick={fetchPdf}
            disabled={loading}
            className="flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleDownload}
            disabled={!pdfUrl || loading}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-border bg-background text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          <button
            onClick={handleShare}
            disabled={!pdfBlob || loading}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-border bg-background text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
          <button
            onClick={handlePrint}
            disabled={!pdfUrl || loading}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition-colors disabled:opacity-40"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* ── Options panel ── */}
      {showOptions && (
        <div className="flex items-center gap-6 px-5 py-3 border-b border-border bg-muted/30 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[11px] font-medium text-muted-foreground mr-2">Columns:</span>
            {ALL_COLS.map((col) => (
              <button
                key={col.key}
                onClick={() => toggleCol(col.key)}
                className={`px-2.5 py-1 rounded-md text-[12px] border transition-colors ${
                  enabledCols[col.key]
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:border-foreground/40"
                }`}
              >
                {col.label}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Two-column:</span>
            <button
              onClick={() => setTwoCol((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                twoCol ? "bg-foreground" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  twoCol ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <button
            onClick={fetchPdf}
            disabled={loading}
            className="ml-auto px-4 py-1.5 rounded-lg bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition-colors disabled:opacity-40"
          >
            {loading ? "Generating…" : "Generate PDF"}
          </button>
        </div>
      )}

      {/* ── PDF viewer ── */}
      <div className="flex-1 relative bg-muted/30 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 z-10">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-[13px] text-muted-foreground">Generating PDF…</p>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <p className="text-[13px] text-destructive text-center max-w-xs">{error}</p>
            <button
              onClick={fetchPdf}
              className="px-4 py-1.5 rounded-lg bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {pdfUrl && !loading && (
          <iframe
            ref={iframeRef}
            src={pdfUrl}
            className="w-full h-full border-0"
            title={`${product.toUpperCase()} Daily Print`}
          />
        )}
      </div>
    </div>
  );
}
