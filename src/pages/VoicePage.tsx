import React from "react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { useIsMobile } from "@/hooks/useBreakpoint";
import { Mic, MicOff, CheckCircle, Send, ChevronRight, ChevronDown, Clock, Wifi, Zap, ArrowUpToLine, Search, X, Play, Pause, Strikethrough } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { voiceApi, customersApi, datasetApi, upiApi } from "@/services/api";
import { formatCurrency, toISODate } from "@/utils";
import toast from "react-hot-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useTransactions } from "@/hooks/useTransactions";
import { useCustomers } from "@/hooks/useCustomers";
import { DatePicker } from "@/components/ui/DatePicker";
import type { ProductType, VoiceEntry, VoiceAlternative, EdiCustomer, IopCustomer, EdiTransaction, IopTransaction } from "@/types";


function generateAudioId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

type TableRow = {
  customer_id: number;
  customer_name: string;
  amount: string;
  payment_mode: "CASH" | "ONLINE";
  is_paid: boolean;
  transaction_id?: number;
  customer_segment_id?: number;
};

type AnyTxn = EdiTransaction | IopTransaction;

export default function VoicePage() {
  const [product, setProduct] = useSessionState<ProductType>("voice.product", "edi");
  const [date, setDate] = useSessionState("voice.date", toISODate(new Date()));
  const [recording, setRecording] = useState(false);
  const isMobile = useIsMobile();
  const [upiExpanded, setUpiExpanded] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [transcription, setTranscription] = useState("");
  const [queue, setQueue] = useState<VoiceEntry[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [highlightedCustomerId, setHighlightedCustomerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [micMode, setMicMode] = useState<"transaction" | "online">("transaction");
  const [queueDisplayMode, setQueueDisplayMode] = useState<"transaction" | "online">("transaction");
  const [pinnedCustomerId, setPinnedCustomerId] = useState<number | null>(null);
  const [struckUpiIds, setStruckUpiIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchAmounts, setSearchAmounts] = useState<Record<number, string>>({});
  const searchRef = useRef<HTMLDivElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcribeAbortRef = useRef<AbortController | null>(null);
  const audioIdRef = useRef<string>("");
  // Each recording produces one entry; labels accumulate as queue resolves
  const datasetRecordsRef = useRef<{ audioId: string; transcription: string; labels: { name: string; amount: number }[] }[]>([]);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeQueueModeRef = useRef<"transaction" | "online">("transaction");
  const progressElapsedRef = useRef(0);
  const progressDurationRef = useRef(2000);
  const progressOnDoneRef = useRef<(() => void) | null>(null);
  const progressCustomerIdForResumeRef = useRef<number | null>(null);
  const [queuePaused, setQueuePaused] = useState(false);
  const queuePausedRef = useRef(false);
  const [progressCustomerId, setProgressCustomerId] = useState<number | null>(null);
  const [progressValue, setProgressValue] = useState(0);
  const qc = useQueryClient();

  const { data: txnsData = [], isLoading: txnsLoading } = useTransactions(product, date);
  const { data: ediTxnsAll = [] } = useTransactions("edi", date);
  const { data: iopTxnsAll = [] } = useTransactions("iop", date);
  const { data: custsData, isLoading: custsLoading } = useCustomers(product, {
    skip: 0, limit: 10000,
    sort_by: "customer_segment_id", sort_dir: "asc",
  });

  const { data: segmentsData } = useQuery({
    queryKey: ["segment-names-map", product],
    queryFn: async () => {
      const fn = product === "edi" ? customersApi.ediSegments : customersApi.iopSegments;
      const res = await fn();
      const map: Record<number, string> = {};
      (res.data as { segment_id: number; name: string }[]).forEach((s) => {
        map[s.segment_id] = s.name;
      });
      return map;
    },
  });
  const segmentNames = segmentsData ?? {};

  const txns = txnsData as AnyTxn[];
  const allCustomers = (custsData?.data ?? []) as (EdiCustomer | IopCustomer)[];
  const hasTxns = txns.length > 0;

  useEffect(() => {
    if (txnsLoading || custsLoading) return;
    const withBalance = allCustomers.filter((c) => {
      if ("outstanding_balance" in c) return Number((c as EdiCustomer).outstanding_balance) > 0;
      return Number((c as IopCustomer).loan_closure) > 0;
    });
    const txnMap = new Map(txns.map((t) => [t.customer_id, t]));
    setRows(
      withBalance.map((c) => {
        const txn = txnMap.get(c.customer_id);
        const mode = ((txn as any)?.payment_mode ?? "CASH") as "CASH" | "ONLINE";
        return {
          customer_id: c.customer_id,
          customer_name: c.customer_name ?? String(c.customer_id),
          amount: txn ? String(txn.amount) : "0",
          payment_mode: mode,
          is_paid: mode === "CASH",
          transaction_id: txn?.transaction_id,
          customer_segment_id: c.customer_segment_id,
        };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, date, txnsLoading, custsLoading, hasTxns]);

  // Keep queuePausedRef in sync with state so interval closures read current value
  const _setQueuePaused = (v: boolean) => {
    queuePausedRef.current = v;
    setQueuePaused(v);
  };

  const _runProgressInterval = (duration: number) => {
    const STEP = 20;
    progressIntervalRef.current = setInterval(() => {
      progressElapsedRef.current += STEP;
      setProgressValue(Math.min((progressElapsedRef.current / duration) * 100, 100));
      if (progressElapsedRef.current >= duration) {
        clearInterval(progressIntervalRef.current!);
        progressIntervalRef.current = null;
        setProgressCustomerId(null);
        setProgressValue(0);
        progressElapsedRef.current = 0;
        progressOnDoneRef.current?.();
        progressOnDoneRef.current = null;
      }
    }, STEP);
  };

  // Helper: start circular progress (duration ms) then call onDone
  const startRowProgress = (customerId: number, onDone: () => void, duration = 2000) => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressElapsedRef.current = 0;
    progressDurationRef.current = duration;
    progressOnDoneRef.current = onDone;
    progressCustomerIdForResumeRef.current = customerId;
    setProgressCustomerId(customerId);
    setProgressValue(0);
    if (!queuePausedRef.current) {
      _runProgressInterval(duration);
    }
  };

  const pauseQueue = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    _setQueuePaused(true);
  };

  const resumeQueue = () => {
    _setQueuePaused(false);
    if (progressCustomerIdForResumeRef.current && progressOnDoneRef.current) {
      _runProgressInterval(progressDurationRef.current);
    }
  };

  // Process queue entry whenever the active index changes
  useEffect(() => {
    if (queueIndex < 0 || queueIndex >= queue.length) return;
    const entry = queue[queueIndex];
    if (entry.matched && entry.customer_id) {
      const isOnline = activeQueueModeRef.current === "online";
      // Apply amount (and mode if online) immediately so user can see it
      setRows((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex((r) => r.customer_id === entry.customer_id);
        if (idx >= 0) {
          updated[idx] = isOnline
            ? { ...updated[idx], amount: String(entry.amount), payment_mode: "ONLINE" as const, is_paid: false }
            : { ...updated[idx], amount: String(entry.amount) };
        }
        return updated;
      });
      setHighlightedCustomerId(entry.customer_id);
      scrollToRow(entry.customer_id);
      // Collect auto-matched customer name + amount for dataset
      if (entry.customer_name) {
        const records = datasetRecordsRef.current;
        const last = records[records.length - 1];
        if (last) last.labels.push({ name: entry.customer_name, amount: entry.amount });
      }
      // Show circular progress on the row, then advance
      startRowProgress(entry.customer_id, () => {
        setHighlightedCustomerId(null);
        setQueueIndex((i) => i + 1);
      }, isOnline ? 3000 : 2000);
      return () => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      };
    } else {
      setHighlightedCustomerId(null);
      setProgressCustomerId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueIndex]);

  // Keyboard arrow navigation for queue
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setQueueIndex((i) => (queue.length > 0 && i < queue.length ? i + 1 : i));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setQueueIndex((i) => (i > 0 ? i - 1 : i));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [queue.length]);

  const scrollToRow = (customerId: number) => {
    setTimeout(() => {
      const row = rowRefs.current.get(customerId);
      if (!row) return;
      if (isMobile) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        const container = tableScrollRef.current;
        if (container) container.scrollTo({ top: row.offsetTop - 33, behavior: "smooth" });
      }
    }, 50);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        audioIdRef.current = generateAudioId();
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await transcribeAudio(blob);
      };

      mediaRecorder.start(100);
      activeQueueModeRef.current = micMode;
      _setQueuePaused(false);
      setRecording(true);
      setCountdown(0);

      countdownRef.current = setInterval(() => {
        setCountdown((c) => c + 1);
      }, 1000);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
    setCountdown(0);
  };

  const discardTranscription = () => {
    transcribeAbortRef.current?.abort();
    transcribeAbortRef.current = null;
    setLoading(false);
    setTranscription("");
    setQueue([]);
    setQueueIndex(-1);
    setHighlightedCustomerId(null);
    toast("Transcription discarded", { icon: "🗑️" });
  };

  const transcribeAudio = async (blob: Blob) => {
    if (blob.size < 1000) {
      toast.error("Recording too short or empty — try again");
      return;
    }
    const abortCtrl = new AbortController();
    transcribeAbortRef.current = abortCtrl;
    setLoading(true);
    setTranscription("");
    setQueue([]);
    setQueueIndex(-1);
    setHighlightedCustomerId(null);
    try {
      const res = await voiceApi.transcribe(blob, product, abortCtrl.signal);
      const transcription = res.data.transcription;
      setTranscription(transcription);
      const entries: VoiceEntry[] = res.data.entries;
      // Keep transcription order — process as spoken
      setQueue(entries);
      setQueueDisplayMode(activeQueueModeRef.current);
      setQueueIndex(0);
      // Save audio file now; metadata (with final customer names) is saved at submit time
      if (audioIdRef.current) {
        datasetApi.saveAudio(blob, audioIdRef.current).catch((err) =>
          console.error("Dataset audio save failed:", err)
        );
        datasetRecordsRef.current.push({ audioId: audioIdRef.current, transcription, labels: [] });
      }
    } catch (err: any) {
      if (err?.code !== "ERR_CANCELED") toast.error("Transcription failed");
    } finally {
      transcribeAbortRef.current = null;
      setLoading(false);
    }
  };

  const advanceQueue = () => {
    setHighlightedCustomerId(null);
    setQueueIndex((i) => i + 1);
  };

  // User picks an alternative for the current active (low-confidence) entry
  const pickAltForCurrent = (alt: VoiceAlternative) => {
    const entry = queue[queueIndex];
    const isOnline = activeQueueModeRef.current === "online";
    setRows((prev) => {
      const updated = [...prev];
      const idx = updated.findIndex((r) => r.customer_id === alt.customer_id);
      if (idx >= 0) {
        updated[idx] = isOnline
          ? { ...updated[idx], amount: String(entry.amount), payment_mode: "ONLINE" as const, is_paid: false }
          : { ...updated[idx], amount: String(entry.amount) };
      }
      return updated;
    });
    setQueue((prev) => {
      const updated = [...prev];
      updated[queueIndex] = {
        ...updated[queueIndex],
        customer_id: alt.customer_id,
        customer_name: alt.name,
        matched: true,
      };
      return updated;
    });
    // Collect manually chosen customer name + amount for dataset
    const records = datasetRecordsRef.current;
    const last = records[records.length - 1];
    if (last && alt.name) last.labels.push({ name: alt.name, amount: entry.amount });

    setHighlightedCustomerId(alt.customer_id);
    scrollToRow(alt.customer_id);
    startRowProgress(alt.customer_id, () => {
      setHighlightedCustomerId(null);
      setQueueIndex((i) => i + 1);
    }, activeQueueModeRef.current === "online" ? 3000 : 2000);
  };

  const handleSubmitAll = async () => {
    const nonZero = rows.filter((r) => Number(r.amount) > 0);
    if (!nonZero.length) { toast.error("No amounts entered"); return; }
    setSubmitting(true);
    try {
      await voiceApi.submit(
        nonZero.map((r) => ({ customer_id: r.customer_id, amount: Number(r.amount), payment_mode: r.payment_mode })),
        date,
        product
      );
      toast.success(`${nonZero.length} transactions saved`);
      qc.invalidateQueries({ queryKey: ["transactions", product, date] });

      // Save metadata with final customer names, then export zip
      const pendingRecords = datasetRecordsRef.current;
      if (pendingRecords.length > 0) {
        try {
          await datasetApi.saveMetadata(
            pendingRecords.map((r) => ({
              audio_id: r.audioId,
              transcription: r.transcription,
              labels: r.labels.map((l) => `${l.name} ${l.amount}`).join(", "),
            }))
          );
          datasetRecordsRef.current = [];
        } catch (err) {
          console.error("Dataset metadata save failed:", err);
        }
      }
      try {
        // Export only this day's recordings (date format: YYYYMMDD)
        const datePrefix = date.replace(/-/g, "");
        const zipRes = await datasetApi.exportZip(datePrefix);
        const url = URL.createObjectURL(new Blob([zipRes.data], { type: "application/zip" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `dataset_${datePrefix}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        // Always clear dataset folder after export
        await datasetApi.clear();
      } catch (err) {
        console.error("Dataset export failed:", err);
      }
    } catch {
      toast.error("Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const searchResults = searchQuery.trim().length > 0
    ? rows.filter((r) => r.customer_name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const applySearchAmount = (customerId: number) => {
    const amount = searchAmounts[customerId];
    if (!amount || isNaN(Number(amount))) return;
    setRows((prev) => {
      const next = [...prev];
      const idx = next.findIndex((r) => r.customer_id === customerId);
      if (idx >= 0) next[idx] = { ...next[idx], amount };
      return next;
    });
    setHighlightedCustomerId(customerId);
    scrollToRow(customerId);
    setTimeout(() => setHighlightedCustomerId(null), 1500);
    setSearchAmounts((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
    setSearchQuery("");
  };

  const isTableLoading = txnsLoading || custsLoading;

  const groupedRows = (() => {
    const groups: { segment_id: number | undefined; segment_name: string; rows: (TableRow & { rowIdx: number })[] }[] = [];
    const seen = new Map<number | undefined, number>();
    rows.forEach((r, i) => {
      const sid = r.customer_segment_id;
      if (!seen.has(sid)) {
        seen.set(sid, groups.length);
        groups.push({
          segment_id: sid,
          segment_name: sid != null ? (segmentNames[sid] || `Segment ${sid}`) : "Unknown",
          rows: [],
        });
      }
      groups[seen.get(sid)!].rows.push({ ...r, rowIdx: i });
    });
    groups.sort((a, b) => (a.segment_id ?? Infinity) - (b.segment_id ?? Infinity));
    groups.forEach((g) => g.rows.sort((a, b) => b.customer_id - a.customer_id));
    return groups;
  })();

  const queueDone = queue.length > 0 && queueIndex >= queue.length;

  const ediTxns = ediTxnsAll as AnyTxn[];
  const iopTxns = iopTxnsAll as AnyTxn[];
  const ediTotal = ediTxns.reduce((s, t) => s + Number(t.amount), 0);
  const iopTotal = iopTxns.reduce((s, t) => s + Number(t.amount), 0);
  const combinedTotal = ediTotal + iopTotal;
  const gpayTotal = [...ediTxns, ...iopTxns].filter((t) => (t as any).payment_mode === "ONLINE").reduce((s, t) => s + Number(t.amount), 0);
  const cashTotal = [...ediTxns, ...iopTxns].filter((t) => (t as any).payment_mode === "CASH").reduce((s, t) => s + Number(t.amount), 0);

  // UPI transactions for selected date
  const { data: upiRaw } = useQuery({
    queryKey: ["upi-voice-date", date],
    queryFn: async () => {
      const res = await upiApi.list({ date_from: date, date_to: date, limit: 500 });
      return res.data.data as any[];
    },
  });

  const upiTxnsForDate = useMemo(() => {
    const all = upiRaw ?? [];
    return [...all].sort((a, b) => {
      const am = a.mapped_customer_id != null ? 1 : 0;
      const bm = b.mapped_customer_id != null ? 1 : 0;
      return bm - am;
    });
  }, [upiRaw]);

  const applyMappedUpiTransactions = () => {
    const mapped = upiTxnsForDate.filter(
      (t) => t.mapped_customer_id != null && t.mapped_customer_type === product
    );
    if (!mapped.length) {
      toast.error(`No mapped UPI transactions for ${date} (${product.toUpperCase()})`);
      return;
    }
    let applied = 0;
    const appliedIds: number[] = [];
    setRows((prev) => {
      const next = [...prev];
      for (const upiTxn of mapped) {
        const idx = next.findIndex((r) => r.customer_id === upiTxn.mapped_customer_id);
        if (idx >= 0) {
          next[idx] = { ...next[idx], is_paid: true, payment_mode: "ONLINE", amount: String(upiTxn.amount) };
          applied++;
          appliedIds.push(upiTxn.id);
        }
      }
      return next;
    });
    setStruckUpiIds((prev) => new Set([...prev, ...appliedIds]));
    setTimeout(() => {
      if (applied > 0) toast.success(`Applied ${applied} mapped UPI transaction${applied > 1 ? "s" : ""}`);
      else toast.error("No matching customers found in table");
    }, 0);
  };

  const statChips = [
    { label: "EDI", value: ediTotal, color: "text-primary", bg: "bg-primary/10 border-primary/25" },
    { label: "IOP", value: iopTotal, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/25" },
    { label: "Total", value: combinedTotal, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25" },
    { label: "GPay", value: gpayTotal, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/25" },
    { label: "Cash", value: cashTotal, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/25" },
  ];

  const nonZeroCount = rows.filter((r) => Number(r.amount) > 0).length;
  const tableTotal = rows.reduce((sum, r) => sum + Number(r.amount), 0);

  // ── MOBILE LAYOUT ─────────────────────────────────────────────────────────
  if (isMobile) {
    const activeEntry = queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null;
    return (
      <div className="space-y-3 pb-4">

        {/* ── Stats row (horizontal scroll) ───────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4">
          {statChips.map(({ label, value, color, bg }) => (
            <div key={label} className={`flex flex-col items-center px-3 py-1.5 rounded-lg border flex-shrink-0 ${bg}`}>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
              <span className={`text-sm font-bold ${color}`}>{formatCurrency(value)}</span>
            </div>
          ))}
        </div>

        {/* ── Product toggle + Date ────────────────────────────────────────── */}
        <div className="flex gap-2 items-center">
          <div className="flex rounded-lg border border-border overflow-hidden flex-shrink-0">
            {(["edi", "iop"] as ProductType[]).map((p) => (
              <button key={p} onClick={() => setProduct(p)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${product === p ? "bg-primary text-white" : "bg-card text-muted-foreground"}`}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <DatePicker value={date} onChange={setDate} className="flex-1" />
        </div>

        {/* ── Search ──────────────────────────────────────────────────────── */}
        <div ref={searchRef} className="relative">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder="Search customer…" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
              className="w-full h-10 rounded-lg border border-border bg-card pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-card shadow-xl overflow-hidden max-h-64 overflow-y-auto">
              {searchResults.map((r) => (
                <div key={r.customer_id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-secondary/60 border-b border-border/40 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.customer_name}</p>
                    <p className="text-[10px] text-muted-foreground">#{r.customer_id} · <span className="text-emerald-400 font-semibold">{formatCurrency(Number(r.amount))}</span></p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input type="text" inputMode="numeric" placeholder="amt"
                      value={searchAmounts[r.customer_id] ?? ""}
                      onChange={(e) => setSearchAmounts((prev) => ({ ...prev, [r.customer_id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && applySearchAmount(r.customer_id)}
                      className="w-20 h-8 rounded border border-border bg-secondary px-2 text-sm text-right text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    <button onClick={() => applySearchAmount(r.customer_id)} disabled={!searchAmounts[r.customer_id]}
                      className="h-8 w-8 flex items-center justify-center rounded bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-30">
                      <CheckCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {searchQuery.trim().length > 0 && searchResults.length === 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-card shadow-xl px-3 py-4 text-center text-xs text-muted-foreground">No customers found</div>
          )}
        </div>

        {/* ── Mic hero card ────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card/60 flex flex-col items-center gap-3 py-5 px-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden w-full">
            {(["transaction", "online"] as const).map((m) => (
              <button key={m} onClick={() => setMicMode(m)} disabled={recording || loading}
                className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                  micMode === m
                    ? m === "online" ? "bg-blue-500/20 text-blue-400" : "bg-primary/20 text-primary"
                    : "text-muted-foreground bg-card"
                }`}>
                {m === "transaction" ? "Transaction" : "Online Payers"}
              </button>
            ))}
          </div>

          {/* Mic button + pause */}
          <div className="flex items-center gap-5">
            {queue.length > 0 && queueIndex >= 0 && queueIndex < queue.length && (
              <button onClick={queuePaused ? resumeQueue : pauseQueue}
                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all ${
                  queuePaused ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-muted-foreground/30 bg-secondary text-muted-foreground"
                }`}>
                {queuePaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
            )}
            <button onClick={recording ? stopRecording : startRecording} disabled={loading}
              className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-all shadow-lg ${
                recording ? "bg-red-500/20 border-2 border-red-500 animate-pulse"
                : micMode === "online" ? "bg-blue-500/20 border-2 border-blue-500"
                : "bg-primary/20 border-2 border-primary"
              }`}>
              {recording ? <MicOff className="h-8 w-8 text-red-400" />
                : micMode === "online" ? <Wifi className="h-8 w-8 text-blue-400" />
                : <Mic className="h-8 w-8 text-primary" />}
              {recording && (
                <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card border border-red-500 flex items-center justify-center text-xs font-bold text-red-400">
                  {countdown}
                </span>
              )}
            </button>
          </div>

          {/* Status */}
          {loading ? (
            <div className="flex flex-col items-center gap-1 w-full">
              <TranscribingOverlay color={micMode === "online" ? "blue" : "primary"} />
              <button onClick={discardTranscription} className="text-[10px] text-red-400 underline underline-offset-2 mt-0.5">Discard</button>
            </div>
          ) : recording ? (
            <div className="w-full">
              <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                <div className={`h-full rounded-full animate-pulse ${micMode === "online" ? "bg-blue-500" : "bg-red-500"}`} style={{ width: "100%" }} />
              </div>
              <p className={`text-xs text-center mt-1.5 ${micMode === "online" ? "text-blue-400/70" : "text-muted-foreground"}`}>{countdown}s — tap to stop</p>
            </div>
          ) : (
            <p className={`text-xs text-center ${micMode === "online" ? "text-blue-400/60" : "text-muted-foreground/60"}`}>
              {micMode === "transaction" ? "Say name + amount → entry" : "Say name + amount → marks online"}
            </p>
          )}
        </div>

        {/* ── Active queue entry ───────────────────────────────────────────── */}
        {queue.length > 0 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {/* Progress header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-secondary/30">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">
                  {queueDone ? "Queue complete" : `Entry ${Math.min(queueIndex + 1, queue.length)} of ${queue.length}`}
                </span>
              </div>
              <div className="flex gap-1">
                {queue.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all ${
                    i < queueIndex ? "w-3 bg-emerald-500" : i === queueIndex ? "w-4 bg-primary" : "w-1.5 bg-border"
                  }`} />
                ))}
              </div>
            </div>

            {queueDone ? (
              <div className={`flex items-center justify-center gap-2 py-4 ${queueDisplayMode === "online" ? "text-blue-400" : "text-emerald-400"}`}>
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-semibold">{queueDisplayMode === "online" ? "Online payers marked" : "All entries processed"}</span>
              </div>
            ) : activeEntry ? (
              <div className="p-4">
                {/* Name + amount */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full uppercase tracking-wide">Now</span>
                    <p className="text-base font-bold text-foreground mt-1 truncate">{activeEntry.spoken_name}</p>
                    {activeEntry.customer_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        → <span className={queueDisplayMode === "online" ? "text-blue-400" : "text-emerald-400"}>{activeEntry.customer_name}</span>
                        <span className="text-muted-foreground/60"> #{activeEntry.customer_id}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl font-bold text-emerald-400">{formatCurrency(activeEntry.amount)}</p>
                    {activeEntry.score != null && (
                      <p className={`text-xs font-semibold ${activeEntry.score >= 90 ? "text-emerald-400" : activeEntry.score >= 70 ? "text-amber-400" : "text-red-400"}`}>
                        {Math.round(activeEntry.score)}% match
                      </p>
                    )}
                  </div>
                </div>

                {/* Matched: progress */}
                {activeEntry.matched ? (
                  <div className={`flex items-center gap-2 py-2 px-3 rounded-xl ${queueDisplayMode === "online" ? "bg-blue-500/10 border border-blue-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}>
                    <CircularProgress value={progressValue} size={20} color={queueDisplayMode === "online" ? "blue" : "emerald"} />
                    <span className={`text-xs font-medium ${queueDisplayMode === "online" ? "text-blue-400" : "text-emerald-400"}`}>
                      {queueDisplayMode === "online" ? "Marking ONLINE in 3s…" : "Applying in 2s…"}
                    </span>
                  </div>
                ) : (
                  /* Alternatives */
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Pick the correct customer:</p>
                    {activeEntry.alternatives && activeEntry.alternatives.length > 0 ? (
                      activeEntry.alternatives.map((alt) => (
                        <button key={alt.customer_id} onClick={() => pickAltForCurrent(alt)}
                          className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left active:scale-[0.98]">
                          <div className="flex items-center gap-2">
                            <ChevronRight className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-foreground">{alt.name}</p>
                              <p className="text-[10px] text-muted-foreground">#{alt.customer_id}</p>
                            </div>
                          </div>
                          <span className={`text-sm font-bold flex-shrink-0 ${alt.score >= 80 ? "text-emerald-400" : alt.score >= 60 ? "text-amber-400" : "text-muted-foreground"}`}>
                            {Math.round(alt.score)}%
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground/60 italic px-1">No close matches found</p>
                    )}
                    <button onClick={advanceQueue}
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-2 border-t border-border/30 transition-colors">
                      Skip this entry →
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* ── UPI transactions (collapsible) ───────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <button onClick={() => setUpiExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Wifi className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-sm font-semibold text-foreground">UPI — {date}</span>
              <span className="text-xs text-muted-foreground">{upiTxnsForDate.length} txns</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={(e) => { e.stopPropagation(); applyMappedUpiTransactions(); }}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors">
                <Zap className="h-3 w-3" /> Apply
              </button>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${upiExpanded ? "rotate-180" : ""}`} />
            </div>
          </button>

          {upiExpanded && (
            <div className="border-t border-border/50 divide-y divide-border/40 max-h-56 overflow-y-auto">
              {upiTxnsForDate.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground/50">No UPI transactions for {date}</p>
              ) : upiTxnsForDate.map((txn) => {
                const isMapped = txn.mapped_customer_id != null;
                const isStruck = struckUpiIds.has(txn.id);
                return (
                  <div key={txn.id} className={`flex items-center gap-3 px-4 py-2.5 ${isStruck ? "opacity-40" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isStruck ? "line-through text-muted-foreground" : "text-foreground"}`}>{txn.sender_name || "—"}</p>
                      {isMapped ? (
                        <p className={`text-xs truncate flex items-center gap-0.5 ${isStruck ? "line-through text-muted-foreground/50" : "text-emerald-400"}`}>
                          <CheckCircle className="h-3 w-3 flex-shrink-0" />{txn.mapped_customer_name || `#${txn.mapped_customer_id}`}
                          {txn.mapped_customer_type && <span className={`ml-1 text-[9px] font-bold px-1 py-0.5 rounded uppercase ${txn.mapped_customer_type === "edi" ? "bg-primary/15 text-primary" : "bg-blue-500/15 text-blue-400"}`}>{txn.mapped_customer_type}</span>}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/50">Unmapped</p>
                      )}
                    </div>
                    <span className={`text-sm font-bold flex-shrink-0 ${isStruck ? "line-through text-muted-foreground" : "text-emerald-400"}`}>₹{Number(txn.amount).toLocaleString("en-IN")}</span>
                    <button onClick={() => setStruckUpiIds((prev) => { const next = new Set(prev); next.has(txn.id) ? next.delete(txn.id) : next.add(txn.id); return next; })}
                      className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${isStruck ? "bg-secondary text-muted-foreground" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary"}`}>
                      <Strikethrough className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Customer cards ───────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-foreground">Customers · {date}</p>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              {formatCurrency(tableTotal)}
            </span>
          </div>

          {isTableLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-3 space-y-2 animate-pulse">
                  <div className="flex gap-3">
                    <div className="flex-1 h-4 bg-secondary rounded" />
                    <div className="w-20 h-9 bg-secondary rounded-lg" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 h-8 bg-secondary rounded-lg" />
                    <div className="flex-1 h-8 bg-secondary rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">No records for {date}</div>
          ) : (
            <div className="space-y-4">
              {groupedRows.map((group) => (
                <div key={group.segment_id ?? "unknown"}>
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1.5 px-0.5">{group.segment_name}</p>
                  <div className="space-y-2">
                    {group.rows.map((r) => {
                      const isHighlighted = r.customer_id === highlightedCustomerId;
                      const isOnlineHighlight = isHighlighted && activeQueueModeRef.current === "online";
                      return (
                        <div
                          key={r.customer_id}
                          ref={(el) => { if (el) rowRefs.current.set(r.customer_id, el as any); else rowRefs.current.delete(r.customer_id); }}
                          className={`rounded-xl border p-3 transition-all duration-200 ${
                            isHighlighted
                              ? isOnlineHighlight
                                ? "border-blue-500/60 bg-blue-500/8 shadow-sm shadow-blue-500/20"
                                : "border-primary/60 bg-primary/8 shadow-sm shadow-primary/20"
                              : "border-border bg-card"
                          }`}
                        >
                          {/* Row 1: Name + Amount input */}
                          <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${isHighlighted ? (isOnlineHighlight ? "text-blue-400" : "text-primary") : "text-foreground"}`}>
                                {r.customer_name}
                              </p>
                              <p className="text-[10px] text-muted-foreground">#{r.customer_id}</p>
                            </div>
                            <div className="relative flex-shrink-0">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={r.amount}
                                onChange={(e) => setRows((prev) => { const next = [...prev]; next[r.rowIdx] = { ...next[r.rowIdx], amount: e.target.value }; return next; })}
                                className={`w-24 h-10 rounded-lg border text-right px-3 text-base font-bold focus:outline-none focus:ring-2 transition-colors ${
                                  isHighlighted
                                    ? isOnlineHighlight
                                      ? "border-blue-500/60 bg-blue-500/5 text-blue-400 focus:ring-blue-500/20"
                                      : "border-primary/60 bg-primary/5 text-primary focus:ring-primary/20"
                                    : "border-border bg-secondary text-foreground focus:ring-ring"
                                }`}
                              />
                            </div>
                            {progressCustomerId === r.customer_id && (
                              <CircularProgress value={progressValue} size={26} color={activeQueueModeRef.current === "online" ? "blue" : "emerald"} />
                            )}
                          </div>

                          {/* Row 2: Mode + Paid toggles */}
                          <div className="flex gap-2">
                            <button type="button"
                              onClick={() => setRows((prev) => { const next = [...prev]; const newMode = next[r.rowIdx].payment_mode === "CASH" ? "ONLINE" : "CASH"; next[r.rowIdx] = { ...next[r.rowIdx], payment_mode: newMode, is_paid: newMode === "CASH" }; return next; })}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                r.payment_mode === "ONLINE"
                                  ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                                  : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              }`}>
                              {r.payment_mode}
                            </button>
                            <button type="button"
                              onClick={() => setRows((prev) => { const next = [...prev]; next[r.rowIdx] = { ...next[r.rowIdx], is_paid: !next[r.rowIdx].is_paid }; return next; })}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                r.is_paid
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              }`}>
                              {r.is_paid ? "Paid" : "Unpaid"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Submit ───────────────────────────────────────────────────────── */}
        <Button onClick={handleSubmitAll} disabled={submitting || isTableLoading} className="w-full h-12 text-base">
          <Send className="h-4 w-4 mr-2" />
          {submitting ? "Saving…" : `Submit All (${nonZeroCount} with amount)`}
        </Button>
      </div>
    );
  }

  // ── DESKTOP LAYOUT ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Voice Transaction Entry</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Record and tap again to stop — multiple customers and amounts are processed in order.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          {statChips.map(({ label, value, color, bg }) => (
            <div key={label} className={`flex flex-col items-center px-3 py-1.5 rounded-lg border ${bg}`}>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
              <span className={`text-sm font-bold ${color}`}>{formatCurrency(value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["edi", "iop"] as ProductType[]).map((p) => (
            <button key={p} onClick={() => setProduct(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${product === p ? "bg-primary text-white" : "bg-card text-muted-foreground hover:text-foreground"}`}>
              {p.toUpperCase()}
            </button>
          ))}
        </div>
        <DatePicker value={date} onChange={setDate} className="w-44" />

        <div ref={searchRef} className="relative flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder="Search customer…" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
              className="w-full h-9 rounded-lg border border-border bg-card pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-card shadow-xl overflow-hidden max-h-72 overflow-y-auto">
              {searchResults.map((r) => (
                <div key={r.customer_id} className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/60 border-b border-border/40 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.customer_name}</p>
                    <p className="text-[10px] text-muted-foreground">#{r.customer_id} · current: <span className="text-emerald-400 font-semibold">{formatCurrency(Number(r.amount))}</span></p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input type="text" inputMode="numeric" placeholder="amount"
                      value={searchAmounts[r.customer_id] ?? ""}
                      onChange={(e) => setSearchAmounts((prev) => ({ ...prev, [r.customer_id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && applySearchAmount(r.customer_id)}
                      className="w-20 h-7 rounded border border-border bg-secondary px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-right" />
                    <button onClick={() => applySearchAmount(r.customer_id)} disabled={!searchAmounts[r.customer_id]}
                      className="h-7 w-7 flex items-center justify-center rounded bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-30 transition-colors">
                      <CheckCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {searchQuery.trim().length > 0 && searchResults.length === 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-card shadow-xl px-3 py-4 text-center text-xs text-muted-foreground">No customers found</div>
          )}
        </div>
      </div>

      {/* Two-column layout: 60% queue+mic | 40% table */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "3fr 2fr" }}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 flex-1" style={{ gridTemplateColumns: "3fr 2fr" }}>
            {/* Queue Visualizer */}
            <div className="glass-card overflow-hidden p-0">
              <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-foreground">Queue</p>
                </div>
                {queue.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{queueDone ? "All done" : `${queueIndex + 1} / ${queue.length}`}</span>
                    <div className="flex gap-1">
                      {queue.map((_, i) => (
                        <div key={i} className={`h-1.5 rounded-full transition-all ${i < queueIndex ? "w-3 bg-emerald-500" : i === queueIndex ? "w-4 bg-primary" : "w-1.5 bg-border"}`} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground/50">
                  <div className="flex gap-1">
                    {[...Array(3)].map((_, i) => <div key={i} className="w-8 h-10 rounded-lg border-2 border-dashed border-border/40" style={{ opacity: 1 - i * 0.25 }} />)}
                  </div>
                  <p className="text-xs mt-1">Queue empty — record to fill</p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[300px] px-3 py-3 space-y-2">
                  {queue.map((entry, i) => {
                    const isDone = i < queueIndex;
                    const isActive = i === queueIndex;
                    const score = entry.score ?? (entry.matched ? 95 : 0);
                    const scoreColor = score >= 90 ? "text-emerald-400" : score >= 70 ? "text-amber-400" : "text-red-400";
                    return (
                      <div key={i} className={`rounded-xl border transition-all duration-200 ${isDone ? "opacity-40 border-border bg-card" : isActive ? "border-primary/60 bg-primary/5 shadow-md shadow-primary/10" : "border-border/40 bg-card/60 opacity-70"}`}>
                        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            {isDone && <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle className="h-3 w-3 text-emerald-400" /></div>}
                            {isActive && <span className="flex-shrink-0 text-[10px] font-bold text-primary bg-primary/20 px-1.5 py-0.5 rounded tracking-wide">NOW</span>}
                            {!isDone && !isActive && <span className="flex-shrink-0 text-[10px] font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">#{i + 1}</span>}
                            <span className={`text-sm font-semibold truncate ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>{entry.spoken_name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            <span className={`text-xs font-bold ${scoreColor}`}>{Math.round(score)}%</span>
                            <span className="text-xs font-semibold text-emerald-400">{formatCurrency(entry.amount)}</span>
                            {entry.customer_id && (
                              <button onClick={() => { setPinnedCustomerId((prev) => prev === entry.customer_id ? null : entry.customer_id!); scrollToRow(entry.customer_id!); }}
                                className={`flex-shrink-0 p-0.5 rounded transition-colors ${pinnedCustomerId === entry.customer_id ? "text-amber-400 bg-amber-500/20" : "text-muted-foreground/40 hover:text-amber-400 hover:bg-amber-500/10"}`}>
                                <ArrowUpToLine className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        {entry.customer_name && (
                          <div className="px-3 pb-1.5">
                            <span className="text-xs text-muted-foreground">→ {entry.customer_name} <span className="text-primary/70">#{entry.customer_id}</span></span>
                          </div>
                        )}
                        {isActive && (
                          <div className="px-3 pb-3 pt-1 border-t border-border/30 mt-1">
                            {entry.matched ? (
                              <div className="flex items-center gap-2 py-1">
                                <CircularProgress value={progressValue} size={18} color={queueDisplayMode === "online" ? "blue" : "emerald"} />
                                <span className={`text-xs ${queueDisplayMode === "online" ? "text-blue-400" : "text-emerald-400"}`}>{queueDisplayMode === "online" ? "Marking ONLINE in 3s…" : "Applying in 2s…"}</span>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <p className="text-xs text-muted-foreground font-medium">Pick the correct match:</p>
                                {entry.alternatives && entry.alternatives.length > 0 ? entry.alternatives.map((alt) => (
                                  <button key={alt.customer_id} onClick={() => pickAltForCurrent(alt)}
                                    className="flex items-center justify-between w-full px-2.5 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left">
                                    <div className="flex items-center gap-1.5">
                                      <ChevronRight className="h-3 w-3 text-primary flex-shrink-0" />
                                      <span className="text-xs font-medium text-foreground">{alt.name}</span>
                                      <span className="text-xs text-muted-foreground">#{alt.customer_id}</span>
                                    </div>
                                    <span className={`text-xs font-semibold flex-shrink-0 ${alt.score >= 80 ? "text-emerald-400" : alt.score >= 60 ? "text-amber-400" : "text-muted-foreground"}`}>{Math.round(alt.score)}%</span>
                                  </button>
                                )) : <p className="text-xs text-muted-foreground/60 italic">No close matches found</p>}
                                <button onClick={advanceQueue} className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors border-t border-border/30 mt-1 pt-2">Skip this entry →</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {queueDone && (
                    <div className={`flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-xl border ${queueDisplayMode === "online" ? "text-blue-400 bg-blue-500/10 border-blue-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"}`}>
                      <CheckCircle className="h-3.5 w-3.5" />
                      {queueDisplayMode === "online" ? "Online payers marked" : "Queue complete"}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* UPI Transactions panel */}
            <div className="glass-card overflow-hidden p-0 flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
                <div>
                  <p className="text-xs font-semibold text-foreground">UPI — {date}</p>
                  <p className="text-[10px] text-muted-foreground">{upiTxnsForDate.length} txns · mapped first</p>
                </div>
                <button onClick={applyMappedUpiTransactions} className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors">
                  <Zap className="h-3 w-3" /> Apply
                </button>
              </div>
              <div className="overflow-y-auto flex-1" style={{ maxHeight: "300px" }}>
                {upiTxnsForDate.length === 0 ? (
                  <p className="px-3 py-8 text-center text-[10px] text-muted-foreground/50">No UPI transactions</p>
                ) : (
                  <table className="w-full"><tbody>
                    {upiTxnsForDate.map((txn) => {
                      const isMapped = txn.mapped_customer_id != null;
                      const isStruck = struckUpiIds.has(txn.id);
                      return (
                        <tr key={txn.id} className={`border-b border-border/40 transition-colors ${isStruck ? "opacity-50 bg-secondary/30" : "hover:bg-secondary/20"}`}>
                          <td className="px-2 py-1.5 w-16 text-right flex-shrink-0">
                            <span className={`text-xs font-bold whitespace-nowrap ${isStruck ? "line-through text-muted-foreground" : "text-emerald-400"}`}>₹{Number(txn.amount).toLocaleString("en-IN")}</span>
                          </td>
                          <td className="px-2 py-1.5 min-w-0">
                            <p className={`text-xs font-medium truncate leading-tight ${isStruck ? "line-through text-muted-foreground" : "text-foreground"}`}>{txn.sender_name || "—"}</p>
                            {isMapped ? (
                              <p className={`text-[10px] truncate leading-tight flex items-center gap-0.5 ${isStruck ? "line-through text-muted-foreground/50" : "text-emerald-400"}`}>
                                <CheckCircle className="h-2.5 w-2.5 flex-shrink-0" />{txn.mapped_customer_name || `#${txn.mapped_customer_id}`}
                              </p>
                            ) : <p className="text-[10px] text-muted-foreground/50 leading-tight">Unmapped</p>}
                          </td>
                          <td className="px-1.5 py-1.5 w-8 text-center flex-shrink-0">
                            {txn.mapped_customer_type ? (
                              <span className={`text-[9px] font-bold px-1 py-0.5 rounded uppercase ${txn.mapped_customer_type === "edi" ? "bg-primary/15 text-primary" : "bg-blue-500/15 text-blue-400"}`}>{txn.mapped_customer_type}</span>
                            ) : <span className="text-[9px] text-muted-foreground/30">—</span>}
                          </td>
                          <td className="px-1 py-1.5 w-7 text-center flex-shrink-0">
                            <button onClick={() => setStruckUpiIds((prev) => { const next = new Set(prev); next.has(txn.id) ? next.delete(txn.id) : next.add(txn.id); return next; })}
                              className={`p-0.5 rounded transition-colors ${isStruck ? "text-muted-foreground/60" : "text-muted-foreground/30 hover:text-muted-foreground"}`}>
                              <Strikethrough className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody></table>
                )}
              </div>
            </div>
          </div>

          {/* Mic card */}
          <div className="glass-card py-5 px-4">
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center rounded-lg border border-border overflow-hidden">
                {(["transaction", "online"] as const).map((m) => (
                  <button key={m} onClick={() => setMicMode(m)} disabled={recording || loading}
                    className={`px-4 py-1.5 text-xs font-semibold transition-colors ${micMode === m ? m === "online" ? "bg-blue-500/20 text-blue-400" : "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    {m === "transaction" ? "Transaction" : "Online Payers"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                {queue.length > 0 && queueIndex >= 0 && queueIndex < queue.length && (
                  <button onClick={queuePaused ? resumeQueue : pauseQueue}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${queuePaused ? "border-amber-500 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400" : "border-muted-foreground/30 bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground"}`}>
                    {queuePaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </button>
                )}
                <button onClick={recording ? stopRecording : startRecording} disabled={loading}
                  className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all ${recording ? "bg-red-500/20 border-2 border-red-500 animate-pulse" : micMode === "online" ? "bg-blue-500/20 border-2 border-blue-500 hover:bg-blue-500/30" : "bg-primary/20 border-2 border-primary hover:bg-primary/30"}`}>
                  {recording ? <MicOff className="h-7 w-7 text-red-400" /> : micMode === "online" ? <Wifi className="h-7 w-7 text-blue-400" /> : <Mic className="h-7 w-7 text-primary" />}
                  {recording && <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card border border-red-500 flex items-center justify-center text-[10px] font-bold text-red-400">{countdown}</span>}
                </button>
              </div>
              {loading ? (
                <div className="flex flex-col items-center gap-1 w-full">
                  <TranscribingOverlay color={micMode === "online" ? "blue" : "primary"} />
                  <button onClick={discardTranscription} className="text-[10px] text-red-400 hover:text-red-300 underline underline-offset-2 mt-0.5">Discard</button>
                </div>
              ) : recording ? (
                <div className="w-full">
                  <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full animate-pulse ${micMode === "online" ? "bg-blue-500" : "bg-red-500"}`} style={{ width: "100%" }} />
                  </div>
                  <p className={`text-xs text-center mt-1 ${micMode === "online" ? "text-blue-400/70" : "text-muted-foreground"}`}>{countdown}s — tap to stop</p>
                </div>
              ) : micMode === "transaction" ? (
                <p className="text-[11px] text-muted-foreground text-center">say name + amount <span className="text-primary/70">→ amount entry</span></p>
              ) : (
                <p className="text-[11px] text-blue-400/70 text-center">say name + amount <span className="text-blue-400">→ amount + online check</span></p>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — Customer table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Customers with balance — {date}</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{rows.length} records</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">{formatCurrency(tableTotal)}</span>
            </div>
          </div>
          <div className="glass-card overflow-hidden p-0">
            <div className="overflow-y-auto max-h-[480px]" ref={tableScrollRef}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">ID</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Mode</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {isTableLoading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {[...Array(5)].map((_, j) => <td key={j} className="px-3 py-2"><div className="h-4 bg-secondary rounded animate-pulse" /></td>)}
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">No records found</td></tr>
                  ) : (
                    <>
                      {pinnedCustomerId != null && (() => {
                        const r = rows.map((row, idx) => ({ ...row, rowIdx: idx })).find(row => row.customer_id === pinnedCustomerId);
                        if (!r) return null;
                        const isHighlighted = r.customer_id === highlightedCustomerId;
                        return (
                          <>
                            <tr key="pinned-header">
                              <td colSpan={5} className="px-3 py-1 bg-amber-500/10 border-b border-amber-500/20">
                                <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1"><ArrowUpToLine className="h-3 w-3" /> Pinned</span>
                              </td>
                            </tr>
                            <tr key={`pinned-${r.customer_id}`} ref={(el) => { if (el) rowRefs.current.set(r.customer_id, el); else rowRefs.current.delete(r.customer_id); }}
                              className={`border-b border-amber-500/20 transition-colors ${isHighlighted ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : "bg-amber-500/5 hover:bg-amber-500/10"}`}>
                              <td className={`px-3 py-2 text-xs font-medium ${isHighlighted ? "text-primary" : "text-muted-foreground"}`}>{r.customer_id}</td>
                              <td className={`px-3 py-2 font-medium truncate max-w-[120px] ${isHighlighted ? "text-primary" : "text-foreground"}`}>{r.customer_name}</td>
                              <td className="px-3 py-2">
                                <input type="text" value={r.amount} onChange={(e) => setRows((prev) => { const next = [...prev]; next[r.rowIdx] = { ...next[r.rowIdx], amount: e.target.value }; return next; })}
                                  className={`w-20 h-7 rounded border px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${isHighlighted ? "border-primary/60 bg-primary/5" : "border-border bg-secondary"}`} />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-col gap-0.5">
                                  <button type="button" onClick={() => setRows((prev) => { const next = [...prev]; const newMode = next[r.rowIdx].payment_mode === "CASH" ? "ONLINE" : "CASH"; next[r.rowIdx] = { ...next[r.rowIdx], payment_mode: newMode, is_paid: newMode === "CASH" }; return next; })}
                                    className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${r.payment_mode === "ONLINE" ? "bg-blue-500/20 text-blue-400 border border-blue-500/40" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"}`}>{r.payment_mode}</button>
                                  <button type="button" onClick={() => setRows((prev) => { const next = [...prev]; next[r.rowIdx] = { ...next[r.rowIdx], is_paid: !next[r.rowIdx].is_paid }; return next; })}
                                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${r.is_paid ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>{r.is_paid ? "Paid" : "Unpaid"}</button>
                                </div>
                              </td>
                              <td className="px-1 py-2 w-8">{progressCustomerId === r.customer_id && <CircularProgress value={progressValue} />}</td>
                            </tr>
                          </>
                        );
                      })()}
                      {groupedRows.map((group) => (
                        <React.Fragment key={`seg-${group.segment_id}`}>
                          <tr>
                            <td colSpan={4} className="px-3 py-1.5 bg-secondary/60 border-b border-border/50">
                              <span className="text-xs font-semibold text-primary uppercase tracking-wider">{group.segment_name}</span>
                            </td>
                          </tr>
                          {group.rows.filter((r) => r.customer_id !== pinnedCustomerId).map((r) => {
                            const isHighlighted = r.customer_id === highlightedCustomerId;
                            return (
                              <tr key={r.customer_id} ref={(el) => { if (el) rowRefs.current.set(r.customer_id, el); else rowRefs.current.delete(r.customer_id); }}
                                className={`border-b border-border/50 transition-colors ${
                                  isHighlighted
                                    ? activeQueueModeRef.current === "online" ? "bg-blue-500/10 ring-1 ring-inset ring-blue-500/40" : "bg-primary/10 ring-1 ring-inset ring-primary/40"
                                    : "hover:bg-secondary/20"
                                }`}>
                                <td className={`px-3 py-2 text-xs font-medium ${isHighlighted ? (activeQueueModeRef.current === "online" ? "text-blue-400" : "text-primary") : "text-muted-foreground"}`}>{r.customer_id}</td>
                                <td className={`px-3 py-2 font-medium truncate max-w-[120px] ${isHighlighted ? (activeQueueModeRef.current === "online" ? "text-blue-400" : "text-primary") : "text-foreground"}`}>{r.customer_name}</td>
                                <td className="px-3 py-2">
                                  <input type="text" value={r.amount} onChange={(e) => setRows((prev) => { const next = [...prev]; next[r.rowIdx] = { ...next[r.rowIdx], amount: e.target.value }; return next; })}
                                    className={`w-20 h-7 rounded border px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${isHighlighted ? "border-primary/60 bg-primary/5" : "border-border bg-secondary"}`} />
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-col gap-0.5">
                                    <button type="button" onClick={() => setRows((prev) => { const next = [...prev]; const newMode = next[r.rowIdx].payment_mode === "CASH" ? "ONLINE" : "CASH"; next[r.rowIdx] = { ...next[r.rowIdx], payment_mode: newMode, is_paid: newMode === "CASH" }; return next; })}
                                      className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${r.payment_mode === "ONLINE" ? "bg-blue-500/20 text-blue-400 border border-blue-500/40" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"}`}>{r.payment_mode}</button>
                                    <button type="button" onClick={() => setRows((prev) => { const next = [...prev]; next[r.rowIdx] = { ...next[r.rowIdx], is_paid: !next[r.rowIdx].is_paid }; return next; })}
                                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${r.is_paid ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>{r.is_paid ? "Paid" : "Unpaid"}</button>
                                  </div>
                                </td>
                                <td className="px-1 py-2 w-8">{progressCustomerId === r.customer_id && <CircularProgress value={progressValue} />}</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <Button onClick={handleSubmitAll} disabled={submitting || isTableLoading} className="w-full">
            <Send className="h-4 w-4 mr-2" />
            {submitting ? "Saving..." : `Submit All (${nonZeroCount} with amount)`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Voice-to-text transcription animation ─────────────────────────────────────
function TranscribingOverlay({ color = "primary" }: { color?: "primary" | "blue" }) {
  const c = color === "blue" ? "#60a5fa" : "var(--color-primary, #818cf8)";
  const barHeights = [0.35, 0.75, 0.55, 1.0, 0.65, 0.85, 0.45, 0.9, 0.6, 0.3];
  return (
    <div className="w-full flex flex-col items-center gap-2.5">
      <style>{`
        @keyframes vBar { 0%,100%{transform:scaleY(0.25)} 50%{transform:scaleY(1)} }
        @keyframes vSlide { 0%{left:-40%} 100%{left:140%} }
        @keyframes vDot { 0%,100%{transform:scale(0.5);opacity:0.3} 50%{transform:scale(1.3);opacity:1} }
        @keyframes vGlow { 0%,100%{opacity:0.4} 50%{opacity:1} }
      `}</style>

      {/* Wave → progress → dots row */}
      <div className="w-full flex items-center gap-2">
        {/* Left: voice waveform bars */}
        <div className="flex items-end gap-[2px] shrink-0" style={{ height: 28 }}>
          {barHeights.map((h, i) => (
            <div
              key={i}
              className="w-[3px] rounded-full origin-bottom"
              style={{
                height: `${h * 28}px`,
                backgroundColor: c,
                opacity: 0.5 + h * 0.5,
                animation: `vBar ${0.6 + (i % 4) * 0.15}s ease-in-out ${i * 0.07}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Middle: shimmer progress bar */}
        <div className="flex-1 relative h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: `${c}22` }}>
          <div
            className="absolute inset-y-0 w-[40%] rounded-full"
            style={{
              background: `linear-gradient(90deg, transparent, ${c}, transparent)`,
              animation: "vSlide 1.1s cubic-bezier(0.4,0,0.6,1) infinite",
            }}
          />
        </div>

        {/* Right: text-appearing dots */}
        <div className="flex items-center gap-1 shrink-0">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-sm"
              style={{
                width: i === 3 ? 2 : 5 + i * 2,
                height: 5,
                backgroundColor: c,
                animation: `vDot 1.1s ease-in-out ${i * 0.18}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Label */}
      <p
        className="text-[10px] font-medium tracking-wide uppercase"
        style={{ color: c, animation: "vGlow 1.4s ease-in-out infinite" }}
      >
        Converting voice → text
      </p>
    </div>
  );
}

// ── Circular progress indicator ───────────────────────────────────────────────
function CircularProgress({
  value,
  size = 22,
  color = "primary",
}: {
  value: number;
  size?: number;
  color?: "primary" | "emerald" | "blue";
}) {
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value / 100);
  const cx = size / 2;
  const strokeColor = color === "emerald" ? "#34d399" : color === "blue" ? "#60a5fa" : "var(--color-primary, #6366f1)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={cx} cy={cx} r={r} fill="none" strokeWidth="2" stroke="currentColor" className="text-border" />
      <circle
        cx={cx} cy={cx} r={r}
        fill="none" strokeWidth="2"
        stroke={strokeColor}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: "stroke-dashoffset 0.02s linear" }}
      />
    </svg>
  );
}
