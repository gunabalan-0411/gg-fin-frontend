import React from "react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { useIsMobile } from "@/hooks/useBreakpoint";
import { Mic, MicOff, CheckCircle, Send, ChevronRight, ChevronDown, Clock, Wifi, Zap, ArrowUpToLine, Search, X, Play, Pause, Strikethrough, AlertTriangle, Download, Loader2, Wallet, Users, HardDrive } from "lucide-react";
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
  balance?: number;
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
  const [showGoTop, setShowGoTop] = useState(false);
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

  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>("");

  const { data: modelStatus, refetch: refetchModelStatus } = useQuery({
    queryKey: ["voice-model-status"],
    queryFn: async () => { const r = await voiceApi.modelStatus(); return r.data; },
    refetchInterval: (query) => query.state.data?.downloading ? 3_000 : 10_000,
  });
  const [modelLoading, setModelLoading] = useState(false);

  const handleLoadModel = async () => {
    setModelLoading(true);
    try {
      await voiceApi.modelLoad();
      await refetchModelStatus();
      toast.success("Whisper model loaded — ready to transcribe");
    } catch {
      toast.error("Failed to load model");
    } finally {
      setModelLoading(false);
    }
  };

  const handleUnloadModel = async () => {
    try {
      await voiceApi.modelUnload();
      await refetchModelStatus();
      toast("Model unloaded from RAM", { icon: "💾" });
    } catch {
      toast.error("Failed to unload model");
    }
  };

  // Toast when download finishes
  const prevDownloadingRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const wasDownloading = prevDownloadingRef.current;
    prevDownloadingRef.current = modelStatus?.downloading;
    if (wasDownloading === true && modelStatus?.downloading === false && modelStatus?.on_disk) {
      toast.success("Model saved to volume", { icon: "💾" });
    }
  }, [modelStatus?.downloading]);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    const refresh = () =>
      navigator.mediaDevices.enumerateDevices().then(all =>
        setMicDevices(all.filter(d => d.kind === "audioinput"))
      ).catch(() => {});
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, []);

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
        const balance = "outstanding_balance" in c
          ? Number((c as EdiCustomer).outstanding_balance)
          : Number((c as IopCustomer).loan_closure);
        return {
          customer_id: c.customer_id,
          customer_name: c.customer_name ?? String(c.customer_id),
          amount: txn ? String(txn.amount) : "0",
          payment_mode: mode,
          is_paid: mode === "CASH",
          balance,
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

  useEffect(() => {
    const handler = () => setShowGoTop(window.scrollY > 80);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

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
      const audioConstraint: MediaTrackConstraints | boolean =
        selectedMicId ? { deviceId: { exact: selectedMicId } } : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
      // Re-enumerate now that permission is granted — we'll get real device labels
      navigator.mediaDevices.enumerateDevices().then(all =>
        setMicDevices(all.filter(d => d.kind === "audioinput"))
      ).catch(() => {});
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
    { label: "EDI", value: ediTotal, color: "text-foreground/70", bg: "bg-primary/20 border-primary/30" },
    { label: "IOP", value: iopTotal, color: "text-foreground/60", bg: "bg-accent/50 border-accent/70" },
    { label: "Total", value: combinedTotal, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25" },
    { label: "GPay", value: gpayTotal, color: "text-sky-700 dark:text-sky-400", bg: "bg-sky-500/10 border-sky-500/25" },
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
                className={`px-4 py-2 text-sm font-medium transition-colors ${product === p ? "bg-foreground text-background" : "bg-card text-muted-foreground"}`}>
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
                      className="h-8 w-8 flex items-center justify-center rounded bg-muted text-foreground border border-border hover:bg-muted/80 disabled:opacity-30">
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
                    ? m === "online" ? "bg-sky-500/15 text-sky-700 dark:text-sky-400" : "bg-foreground/10 text-foreground"
                    : "text-muted-foreground bg-card"
                }`}>
                {m === "transaction" ? "Transaction" : "Online Payers"}
              </button>
            ))}
          </div>

          {/* Model status (mobile) */}
          <div className={`w-full rounded-lg border overflow-hidden ${
            modelStatus?.loaded ? "border-emerald-500/30 bg-emerald-500/8"
            : modelStatus?.downloading ? "border-amber-500/30 bg-amber-500/8"
            : modelStatus?.on_disk ? "border-sky-500/30 bg-sky-500/8"
            : "border-border bg-secondary/40"
          }`}>
            <div className="flex items-center gap-2 px-3 py-2">
              {modelStatus?.downloading
                ? <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin flex-shrink-0" />
                : modelStatus?.on_disk && !modelStatus?.loaded
                ? <HardDrive className="h-3.5 w-3.5 text-sky-500 flex-shrink-0" />
                : <span className={`w-2 h-2 rounded-full flex-shrink-0 ${modelStatus?.loaded ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`} />
              }
              <span className={`flex-1 text-[11px] font-medium ${
                modelStatus?.loaded ? "text-emerald-700 dark:text-emerald-400"
                : modelStatus?.downloading ? "text-amber-600 dark:text-amber-400"
                : modelStatus?.on_disk ? "text-sky-700 dark:text-sky-400"
                : "text-muted-foreground"
              }`}>
                {modelStatus?.loaded ? `Ready · unloads in ${modelStatus.seconds_until_unload}s`
                 : modelStatus?.downloading ? `Downloading… ${modelStatus.download_progress}%`
                 : modelStatus?.on_disk ? "Saved to volume · not in RAM"
                 : "Model not downloaded"}
              </span>
              {modelStatus?.loaded ? (
                <button onClick={handleUnloadModel} className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2">Unload</button>
              ) : !modelStatus?.downloading ? (
                <button onClick={handleLoadModel} disabled={modelLoading}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-foreground text-background disabled:opacity-50">
                  {modelLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {modelLoading ? "Loading…" : modelStatus?.on_disk ? "Load" : "↓ Download"}
                </button>
              ) : null}
            </div>
            {modelStatus?.downloading && (
              <div className="h-1 w-full bg-amber-500/15">
                <div
                  className="h-full bg-amber-500 transition-all duration-[800ms] ease-out"
                  style={{ width: `${modelStatus.download_progress || 0}%` }}
                />
              </div>
            )}
          </div>

          {/* Microphone selector (mobile) */}
          {micDevices.length > 0 && (
            <div className="flex items-center gap-2 w-full">
              <Mic className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <div className="relative flex-1">
                <select
                  value={selectedMicId}
                  onChange={e => setSelectedMicId(e.target.value)}
                  disabled={recording}
                  className="w-full text-[11.5px] bg-secondary/40 border border-border rounded-md pl-2.5 pr-6 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 appearance-none cursor-pointer"
                >
                  {micDevices.map((device, i) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${i + 1}`}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

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
                : micMode === "online" ? "bg-sky-500/15 border-2 border-sky-500/60"
                : "bg-primary/15 border-2 border-primary/60"
              }`}>
              {recording ? <MicOff className="h-8 w-8 text-red-400" />
                : micMode === "online" ? <Wifi className="h-8 w-8 text-sky-600 dark:text-sky-400" />
                : <Mic className="h-8 w-8 text-foreground/70" />}
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
                <div className={`h-full rounded-full animate-pulse ${micMode === "online" ? "bg-sky-500" : "bg-red-500"}`} style={{ width: "100%" }} />
              </div>
              <p className={`text-xs text-center mt-1.5 ${micMode === "online" ? "text-sky-600/70 dark:text-sky-400/70" : "text-muted-foreground"}`}>{countdown}s — tap to stop</p>
            </div>
          ) : transcription && queue.length === 0 ? (
            <p className="text-xs text-center text-foreground/60 italic px-2">"{transcription}"</p>
          ) : (
            <p className={`text-xs text-center ${micMode === "online" ? "text-sky-600/60 dark:text-sky-400/60" : "text-muted-foreground/60"}`}>
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
                    i < queueIndex ? "w-3 bg-emerald-500" : i === queueIndex ? "w-4 bg-foreground/70" : "w-1.5 bg-border"
                  }`} />
                ))}
              </div>
            </div>

            {queueDone ? (
              <div className={`flex items-center justify-center gap-2 py-4 ${queueDisplayMode === "online" ? "text-sky-600 dark:text-sky-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-semibold">{queueDisplayMode === "online" ? "Online payers marked" : "All entries processed"}</span>
              </div>
            ) : activeEntry ? (
              <div className="p-4">
                {/* Name + amount */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold bg-foreground/10 text-foreground px-2 py-0.5 rounded-full uppercase tracking-wide">Now</span>
                    <p className="text-base font-bold text-foreground mt-1 truncate">{activeEntry.spoken_name}</p>
                    {activeEntry.customer_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        → <span className={queueDisplayMode === "online" ? "text-sky-600 dark:text-sky-400" : "text-emerald-700 dark:text-emerald-400"}>{activeEntry.customer_name}</span>
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
                  <div className={`flex items-center gap-2 py-2 px-3 rounded-xl ${queueDisplayMode === "online" ? "bg-sky-500/10 border border-sky-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}>
                    <CircularProgress value={progressValue} size={20} color={queueDisplayMode === "online" ? "blue" : "emerald"} />
                    <span className={`text-xs font-medium ${queueDisplayMode === "online" ? "text-sky-600 dark:text-sky-400" : "text-emerald-700 dark:text-emerald-400"}`}>
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
                          className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl border border-border hover:border-border hover:bg-muted/50 transition-colors text-left active:scale-[0.98]">
                          <div className="flex items-center gap-2">
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
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
              <Wifi className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span className="text-sm font-semibold text-foreground">UPI — {date}</span>
              <span className="text-xs text-muted-foreground">{upiTxnsForDate.length} txns</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={(e) => { e.stopPropagation(); applyMappedUpiTransactions(); }}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-muted text-foreground border border-border hover:bg-muted/80 transition-colors">
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
                          {txn.mapped_customer_type && <span className={`ml-1 text-[9px] font-bold px-1 py-0.5 rounded uppercase ${txn.mapped_customer_type === "edi" ? "bg-primary/25 text-foreground/65" : "bg-accent/60 text-foreground/65"}`}>{txn.mapped_customer_type}</span>}
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
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">{group.segment_name}</p>
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
                                ? "border-sky-500/50 bg-sky-500/8 shadow-sm shadow-sky-500/15"
                                : "border-foreground/25 bg-foreground/5 shadow-sm shadow-foreground/10"
                              : "border-border bg-card"
                          }`}
                        >
                          {/* Row 1: Name + Amount input */}
                          <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${isHighlighted ? (isOnlineHighlight ? "text-sky-600 dark:text-sky-400" : "text-foreground") : "text-foreground"}`}>
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
                                      ? "border-sky-500/50 bg-sky-500/5 text-sky-700 dark:text-sky-400 focus:ring-sky-500/20"
                                      : "border-foreground/25 bg-foreground/5 text-foreground focus:ring-foreground/10"
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
                                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30"
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

        {/* ── Floating go-to-top ───────────────────────────────────────────── */}
        {showGoTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed left-4 bottom-[104px] z-50 flex h-11 w-11 items-center justify-center rounded-full shadow-xl border border-border bg-background text-muted-foreground hover:text-foreground hover:border-border transition-all active:scale-95"
            title="Back to top"
          >
            <ArrowUpToLine className="h-4 w-4" />
          </button>
        )}

        {/* ── Floating pause / resume FAB ──────────────────────────────────── */}
        {queue.length > 0 && queueIndex >= 0 && !queueDone && (
          <button
            onClick={queuePaused ? resumeQueue : pauseQueue}
            className={`fixed right-4 bottom-[104px] z-50 flex items-center gap-2 h-12 pl-3.5 pr-4 rounded-full shadow-2xl border-2 transition-all active:scale-95 ${
              queuePaused
                ? "bg-background border-amber-500 text-amber-400 shadow-amber-500/25"
                : queueDisplayMode === "online"
                ? "bg-background border-sky-500/60 text-sky-700 dark:text-sky-400 shadow-sky-500/15"
                : "bg-background border-foreground/30 text-foreground shadow-foreground/10"
            }`}
          >
            {queuePaused
              ? <Play className="h-4 w-4 fill-current" />
              : <Pause className="h-4 w-4" />}
            <span className="text-xs font-bold">{queuePaused ? "Resume" : "Pause"}</span>
          </button>
        )}
      </div>
    );
  }

  // ── DESKTOP LAYOUT ────────────────────────────────────────────────────────
  const queueActive = queue.length > 0 && queueIndex >= 0 && queueIndex < queue.length;
  const currentEntry = queueActive ? queue[queueIndex] : null;

  return (
    <>
      <style>{`
        @keyframes micBar { 0%,100% { height: 8px } 50% { height: 32px } }
        @keyframes txShimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
      `}</style>
      <div className="flex flex-col h-full overflow-hidden bg-background">
        {/* ── Top bar ── */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-secondary/60 flex-shrink-0 z-10">
          <div className="flex items-center gap-2 font-semibold text-sm tracking-tight flex-shrink-0">
            <div className="w-6 h-6 rounded-md bg-foreground flex items-center justify-center">
              <span className="font-mono text-[10px] font-semibold text-background">gf</span>
            </div>
            <span className="text-foreground/80">Voice Entry</span>
          </div>
          <div className="flex items-center gap-1.5 pl-3 border-l border-border text-[13px] text-muted-foreground min-w-0">
            <span>Collections</span>
            <ChevronRight className="h-3 w-3 opacity-40 flex-shrink-0" />
            <span className="font-medium text-foreground">Voice</span>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium flex-shrink-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            live · mic ready
          </span>
          <div className="flex-1" />
          <div className="flex rounded-lg overflow-hidden bg-muted p-0.5 gap-0.5">
            {(["edi", "iop"] as ProductType[]).map((p) => (
              <button key={p} onClick={() => setProduct(p)}
                className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors tracking-wide ${product === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <DatePicker value={date} onChange={setDate} className="w-40" />
          <div className="w-px h-5 bg-border flex-shrink-0" />
          <button onClick={handleSubmitAll} disabled={submitting || isTableLoading || nonZeroCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-[12.5px] font-semibold hover:bg-foreground/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Submit{nonZeroCount > 0 ? ` ${nonZeroCount}` : ""}
          </button>
        </div>

        {/* ── Body: cockpit + (stats + workspace) ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── Cockpit ── */}
          <aside className="w-[380px] flex-shrink-0 flex flex-col border-r border-border bg-secondary/40 overflow-y-auto">

            {/* Section: Voice Cockpit */}
            <div className="px-4 py-4 border-b border-border">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground/60">Voice Cockpit</span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] font-mono text-muted-foreground/40">tally-asr</span>
              </div>
              {/* Mode select */}
              <div className="grid grid-cols-2 gap-1.5 mb-4">
                {(["transaction", "online"] as const).map((m) => (
                  <button key={m} onClick={() => setMicMode(m)} disabled={recording || loading}
                    className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      micMode === m
                        ? m === "online" ? "bg-sky-500/12 border-sky-500/40" : "bg-primary/30 border-primary/60"
                        : "bg-card border-border hover:bg-secondary/60"
                    }`}>
                    <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                      {m === "transaction" ? <Mic className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />}
                      {m === "transaction" ? "Transaction" : "Online Payers"}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">
                      {m === "transaction" ? "Speak name + amount" : "Marks paid via GPay"}
                    </span>
                  </button>
                ))}
              </div>
              {/* Model status */}
              <div className={`rounded-lg border mb-3 overflow-hidden ${
                modelStatus?.loaded ? "border-emerald-500/30 bg-emerald-500/8"
                : modelStatus?.downloading ? "border-amber-500/30 bg-amber-500/8"
                : modelStatus?.on_disk ? "border-sky-500/30 bg-sky-500/8"
                : "border-border bg-secondary/40"
              }`}>
                <div className="flex items-center gap-2 px-3 py-2">
                  {modelStatus?.downloading
                    ? <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin flex-shrink-0" />
                    : modelStatus?.on_disk && !modelStatus?.loaded
                    ? <HardDrive className="h-3.5 w-3.5 text-sky-500 flex-shrink-0" />
                    : <span className={`w-2 h-2 rounded-full flex-shrink-0 ${modelStatus?.loaded ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                  }
                  <div className="flex-1 min-w-0">
                    {modelStatus?.downloading ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11.5px] font-medium text-amber-600 dark:text-amber-400">
                          Downloading model to volume…
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-amber-600 dark:text-amber-400 flex-shrink-0">
                          {modelStatus.download_progress}%
                        </span>
                      </div>
                    ) : (
                      <span className={`text-[11.5px] font-medium ${
                        modelStatus?.loaded ? "text-emerald-700 dark:text-emerald-400"
                        : modelStatus?.on_disk ? "text-sky-700 dark:text-sky-400"
                        : "text-muted-foreground"
                      }`}>
                        {modelStatus?.loaded
                          ? `Model ready · unloads in ${modelStatus.seconds_until_unload}s`
                          : modelStatus?.on_disk
                          ? "Saved to volume · not in RAM"
                          : "Model not downloaded"}
                      </span>
                    )}
                  </div>
                  {modelStatus?.loaded ? (
                    <button onClick={handleUnloadModel} className="text-[10.5px] text-muted-foreground hover:text-foreground underline underline-offset-2 flex-shrink-0 transition-colors">
                      Unload
                    </button>
                  ) : !modelStatus?.downloading ? (
                    <button onClick={handleLoadModel} disabled={modelLoading}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-foreground text-background hover:bg-foreground/85 disabled:opacity-50 transition-colors flex-shrink-0">
                      {modelLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {modelLoading ? "Loading…" : modelStatus?.on_disk ? "Load" : "Download & Load"}
                    </button>
                  ) : null}
                </div>
                {modelStatus?.downloading && (
                  <div className="h-1 w-full bg-amber-500/15">
                    <div
                      className="h-full bg-amber-500 transition-all duration-[800ms] ease-out"
                      style={{ width: `${modelStatus.download_progress || 0}%` }}
                    />
                  </div>
                )}
              </div>
              {/* Microphone selector */}
              {micDevices.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <Mic className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <div className="relative flex-1">
                    <select
                      value={selectedMicId}
                      onChange={e => setSelectedMicId(e.target.value)}
                      disabled={recording}
                      className="w-full text-[11.5px] bg-secondary/40 border border-border rounded-md pl-2.5 pr-6 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 appearance-none cursor-pointer"
                    >
                      {micDevices.map((device, i) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${i + 1}`}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              )}
              {/* Mic hero */}
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="relative">
                  <button onClick={recording ? stopRecording : startRecording} disabled={loading}
                    className={`relative flex items-center justify-center w-[132px] h-[132px] rounded-full border-2 transition-all ${
                      recording
                        ? "border-red-500 bg-red-500/10 shadow-[0_0_0_8px_rgba(239,68,68,0.15),0_18px_50px_rgba(239,68,68,0.18)]"
                        : micMode === "online"
                        ? "border-sky-500/60 bg-sky-500/8 shadow-[0_0_0_6px_color-mix(in_oklab,hsl(var(--primary))_18%,transparent),0_8px_24px_rgba(0,0,0,0.08)]"
                        : "border-primary/60 bg-primary/8 shadow-[0_0_0_6px_color-mix(in_oklab,hsl(var(--primary))_18%,transparent),0_8px_24px_rgba(0,0,0,0.08)]"
                    }`}>
                    {recording ? (
                      <div className="flex items-end gap-1" style={{ height: 36 }}>
                        {[0.35, 0.75, 0.55, 1.0, 0.65].map((h, i) => (
                          <div key={i} className="w-[5px] rounded-full bg-red-400"
                            style={{ height: h * 36, animation: `micBar ${0.6 + (i % 3) * 0.15}s ease-in-out ${i * 0.1}s infinite` }} />
                        ))}
                      </div>
                    ) : micMode === "online" ? (
                      <Wifi className="h-9 w-9 text-sky-600 dark:text-sky-400" />
                    ) : (
                      <Mic className="h-9 w-9 text-foreground/70" />
                    )}
                  </button>
                  {queueActive && (
                    <button onClick={queuePaused ? resumeQueue : pauseQueue}
                      className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(100%+8px)] w-9 h-9 rounded-full border flex items-center justify-center transition-colors shadow-sm ${
                        queuePaused ? "border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400" : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}>
                      {queuePaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2.5 font-mono text-[12px] text-muted-foreground">
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : recording ? (
                    <>
                      <span className="text-red-400 font-semibold">●REC</span>
                      <span>{String(countdown).padStart(2, "0")}s</span>
                      <span className="text-muted-foreground/50">· tap to stop</span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center border border-border rounded px-1.5 py-px text-[10.5px] text-muted-foreground bg-secondary/80">space</span>
                      <span className="text-muted-foreground/60">to record</span>
                    </>
                  )}
                </div>
                {!recording && !loading && (
                  <p className="text-[11.5px] text-muted-foreground/60 text-center max-w-[220px] leading-relaxed">
                    {micMode === "transaction"
                      ? "Say a customer name followed by the amount. Multiple entries supported."
                      : "Records customers who paid online — marks them as ONLINE in the table."}
                  </p>
                )}
                {loading && (
                  <div className="w-full px-2">
                    <TranscribingOverlay color={micMode === "online" ? "blue" : "primary"} />
                    <button onClick={discardTranscription} className="w-full text-[10px] text-red-400 hover:text-red-300 underline underline-offset-2 mt-2 text-center">Discard</button>
                  </div>
                )}
              </div>
            </div>

            {/* Section: Transcription + Queue */}
            <div className="px-4 py-4 border-b border-border">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground/60">Transcription</span>
                <div className="flex-1 h-px bg-border" />
                {queue.length > 0 && <span className="text-[10px] font-mono text-muted-foreground/40">{queue.length} entries</span>}
              </div>
              {/* Trans box */}
              <div className={`relative px-3 py-3 rounded-lg border bg-card text-[13.5px] leading-relaxed min-h-[64px] overflow-hidden mb-3 ${loading ? "border-primary/30" : "border-border"}`}>
                {loading ? (
                  <>
                    <span className="text-muted-foreground/30">···············································</span>
                    <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
                      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, transparent 30%, color-mix(in oklab, hsl(var(--primary)) 24%, transparent) 50%, transparent 70%)", animation: "txShimmer 1.5s infinite" }} />
                    </div>
                  </>
                ) : queue.length > 0 ? (
                  <>
                    {queue.map((e, i) => (
                      <React.Fragment key={i}>
                        <span className="inline-block px-0.5 rounded-sm font-medium bg-primary/22 text-foreground">{e.spoken_name}</span>
                        {" "}
                        <span className="inline-block px-0.5 rounded-sm font-mono font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/12">{e.amount}</span>
                        {i < queue.length - 1 && <span className="text-muted-foreground/40">, </span>}
                      </React.Fragment>
                    ))}
                    {transcription && (
                      <p className="mt-2 text-[11px] text-muted-foreground/50 italic border-t border-border/40 pt-1.5">"{transcription}"</p>
                    )}
                  </>
                ) : transcription ? (
                  <span className="text-foreground/70 text-[13px]">"{transcription}"</span>
                ) : (
                  <span className="text-muted-foreground/40 italic text-[12.5px]">Your spoken words will appear here, with names and amounts highlighted.</span>
                )}
              </div>
              {/* Queue dots + active entry */}
              {queue.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    {queue.map((_, i) => (
                      <div key={i} className={`h-1.5 rounded-full transition-all flex-1 ${
                        i < queueIndex ? "bg-emerald-500 max-w-6" : i === queueIndex ? "bg-foreground/70 flex-[2]" : "max-w-6 bg-border"
                      }`} />
                    ))}
                    <span className="ml-1 text-[11px] font-mono text-muted-foreground/60 flex-shrink-0">{Math.min(queueIndex + 1, queue.length)}/{queue.length}</span>
                  </div>
                  {queueDone ? (
                    <div className={`flex items-center justify-center gap-2 py-5 rounded-xl border text-sm font-medium ${
                      queueDisplayMode === "online" ? "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    }`}>
                      <CheckCircle className="h-4 w-4" />
                      {queueDisplayMode === "online" ? "Online payers marked" : "Queue complete"}
                    </div>
                  ) : currentEntry ? (
                    <div className={`rounded-xl border overflow-hidden ${queueDisplayMode === "online" ? "border-sky-500/30" : "border-border"}`}>
                      <div className="flex items-start gap-2.5 px-3.5 pt-3 pb-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-[16px] font-medium text-foreground tracking-tight">"{currentEntry.spoken_name}"</div>
                          {currentEntry.customer_name ? (
                            <div className="flex items-center gap-1 mt-1 text-[12px] text-muted-foreground">
                              <ChevronRight className="h-3 w-3 opacity-40" />
                              <span className={`font-medium ${queueDisplayMode === "online" ? "text-sky-700 dark:text-sky-400" : "text-emerald-700 dark:text-emerald-400"}`}>{currentEntry.customer_name}</span>
                              <span className="font-mono text-[10.5px] text-muted-foreground/50">#{currentEntry.customer_id}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 mt-1 text-[12px] text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="h-3 w-3" />
                              Low confidence — pick below
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`font-mono text-[22px] font-medium leading-none tracking-tight ${queueDisplayMode === "online" ? "text-sky-700 dark:text-sky-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                            ₹{currentEntry.amount.toLocaleString("en-IN")}
                          </div>
                          {currentEntry.score != null && (
                            <div className={`text-[10.5px] font-mono mt-1 ${currentEntry.score >= 90 ? "text-emerald-700 dark:text-emerald-400" : currentEntry.score >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-400"}`}>
                              {Math.round(currentEntry.score)}% match
                            </div>
                          )}
                        </div>
                      </div>
                      {currentEntry.matched ? (
                        <>
                          <div className="h-[3px] bg-muted relative overflow-hidden">
                            <div className={`absolute left-0 top-0 bottom-0 transition-[width] ${queueDisplayMode === "online" ? "bg-sky-500" : "bg-foreground"}`}
                              style={{ width: `${progressValue}%` }} />
                          </div>
                          <div className="flex items-center justify-between px-3.5 py-2 bg-secondary/60 border-t border-border/50 text-[11.5px] text-muted-foreground">
                            <span className="font-mono">
                              {queuePaused ? "Paused" : `Applying in ${((100 - progressValue) / 100 * (queueDisplayMode === "online" ? 3 : 2)).toFixed(1)}s`}
                            </span>
                            <div className="flex gap-1.5">
                              <button onClick={queuePaused ? resumeQueue : pauseQueue}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium hover:bg-muted transition-colors">
                                {queuePaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                                {queuePaused ? "Resume" : "Pause"}
                              </button>
                              <button onClick={advanceQueue}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium hover:bg-muted transition-colors">
                                Skip <ChevronRight className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col gap-1.5 px-3.5 pb-3.5 pt-1 bg-secondary/40 border-t border-border/50">
                          <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-muted-foreground/60">Alternatives</span>
                            <button onClick={advanceQueue} className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                              Skip <ChevronRight className="h-3 w-3" />
                            </button>
                          </div>
                          {currentEntry.alternatives && currentEntry.alternatives.length > 0 ? currentEntry.alternatives.map((alt) => (
                            <button key={alt.customer_id} onClick={() => pickAltForCurrent(alt)}
                              className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-card hover:bg-secondary hover:border-muted-foreground/30 transition-all text-left active:scale-[0.98]">
                              <span className="flex-1 text-[13px] font-medium text-foreground truncate">{alt.name}</span>
                              <span className="font-mono text-[10.5px] text-muted-foreground/50">#{alt.customer_id}</span>
                              <span className={`font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                                alt.score >= 80 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : alt.score >= 60 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
                              }`}>{Math.round(alt.score)}%</span>
                            </button>
                          )) : (
                            <p className="text-[11.5px] text-muted-foreground/50 italic px-1">No close matches.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Section: UPI */}
            <div className="px-4 py-4 flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground/60">UPI Reconciliation</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-secondary/60">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center bg-sky-500/15 flex-shrink-0">
                    <Wifi className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium">UPI · {date}</p>
                    <p className="text-[11px] text-muted-foreground">{upiTxnsForDate.length} txns · {upiTxnsForDate.filter((t) => t.mapped_customer_id != null).length} mapped</p>
                  </div>
                  <button onClick={applyMappedUpiTransactions}
                    disabled={!upiTxnsForDate.some((t) => t.mapped_customer_id != null && !struckUpiIds.has(t.id))}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors bg-primary/30 border border-primary/50 hover:bg-primary/40 disabled:opacity-40 disabled:cursor-not-allowed">
                    <Zap className="h-3 w-3" /> Apply
                  </button>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                  {upiTxnsForDate.length === 0 ? (
                    <p className="px-3 py-8 text-center text-[11px] text-muted-foreground/50">No UPI transactions for {date}</p>
                  ) : upiTxnsForDate.map((txn) => {
                    const isMapped = txn.mapped_customer_id != null;
                    const isStruck = struckUpiIds.has(txn.id);
                    return (
                      <div key={txn.id}
                        className={`grid items-center gap-2 px-3 py-2 border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors ${isStruck ? "opacity-45" : ""}`}
                        style={{ gridTemplateColumns: "1fr auto auto" }}>
                        <div className="min-w-0">
                          <p className={`text-[12.5px] font-medium truncate ${isStruck ? "line-through text-muted-foreground" : "text-foreground"}`}>{txn.sender_name || "—"}</p>
                          {isMapped ? (
                            <p className={`text-[10.5px] flex items-center gap-1 ${isStruck ? "line-through text-muted-foreground/50" : "text-emerald-700 dark:text-emerald-400"}`}>
                              <CheckCircle className="h-2.5 w-2.5 flex-shrink-0" />
                              {txn.mapped_customer_name}
                              {txn.mapped_customer_type && (
                                <span className={`text-[9px] font-bold px-1 py-px rounded uppercase ${txn.mapped_customer_type === "edi" ? "bg-primary/25 text-foreground/65" : "bg-accent/60 text-foreground/65"}`}>{txn.mapped_customer_type}</span>
                              )}
                            </p>
                          ) : (
                            <p className="text-[10.5px] text-muted-foreground/40 italic">Unmapped</p>
                          )}
                        </div>
                        <span className={`font-mono text-[12.5px] font-medium flex-shrink-0 ${isStruck ? "line-through text-muted-foreground" : "text-emerald-700 dark:text-emerald-400"}`}>
                          ₹{Number(txn.amount).toLocaleString("en-IN")}
                        </span>
                        <button onClick={() => setStruckUpiIds((prev) => { const next = new Set(prev); next.has(txn.id) ? next.delete(txn.id) : next.add(txn.id); return next; })}
                          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-secondary transition-colors">
                          <Strikethrough className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>

          {/* ── Right: stats + workspace ── */}
          <div className="flex flex-col flex-1 overflow-hidden min-w-0">

            {/* ── Stats strip ── */}
            <div className="grid gap-2 px-4 py-3 border-b border-border bg-background flex-shrink-0"
              style={{ gridTemplateColumns: "1.4fr repeat(4, 1fr)" }}>
              {/* Today total */}
              <div className="relative bg-card border border-border/60 rounded-xl px-3 py-2.5 overflow-hidden"
                style={{ background: "radial-gradient(120% 60% at 100% 0%, color-mix(in oklab, hsl(var(--primary)) 45%, transparent) 0%, transparent 60%), hsl(var(--card))" }}>
                <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground/70 mb-0.5">₹ Today</div>
                <div className="font-mono text-[22px] font-medium leading-none tracking-tight text-foreground">{formatCurrency(combinedTotal)}</div>
                <div className="text-[10.5px] text-emerald-700 dark:text-emerald-400 mt-1">↑ {nonZeroCount} with amount</div>
                <div className="absolute right-2.5 top-2.5 opacity-70">
                  {(() => {
                    const pts = [3.8, 4.2, 3.6, 4.6, 5.1, 4.9, 5.4];
                    const w = 52, h = 22, pad = 1;
                    const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
                    const stepX = (w - pad * 2) / (pts.length - 1);
                    const xy = pts.map((v, i) => [pad + i * stepX, h - pad - ((v - min) / range) * (h - pad * 2)]);
                    const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
                    return <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }}><path d={d} stroke="hsl(var(--primary))" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>;
                  })()}
                </div>
              </div>
              {/* EDI, IOP, GPay, Cash */}
              {statChips.map(({ label, value, color, bg }) => (
                <div key={label} className={`bg-card border border-border/60 rounded-xl px-3 py-2.5 ${bg}`}>
                  <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground/70 mb-0.5">{label}</div>
                  <div className={`font-mono text-[18px] font-medium leading-none tracking-tight ${color}`}>{formatCurrency(value)}</div>
                  <div className="text-[10.5px] text-muted-foreground/60 mt-1">
                    {label === "GPay" || label === "Cash"
                      ? `${combinedTotal ? Math.round((value / combinedTotal) * 100) : 0}% of total`
                      : label === "EDI" ? `${ediTxns.length} customers` : `${iopTxns.length} customers`}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Workspace ── */}
            <section className="flex flex-col flex-1 overflow-hidden min-h-0">
              {/* ws-head */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-background flex-shrink-0">
                <div className="relative flex-1 max-w-[360px]" ref={searchRef}>
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input type="text" placeholder="Search customer by name…" value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
                    className="w-full h-9 rounded-lg border border-border bg-card pl-8 pr-8 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-muted-foreground/40 transition-shadow" />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {searchResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-card shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
                      {searchResults.map((r) => (
                        <div key={r.customer_id} className="grid items-center gap-2 px-3 py-2 hover:bg-secondary/60 border-b border-border/40 last:border-0"
                          style={{ gridTemplateColumns: "1fr 96px 36px" }}>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-foreground truncate">{r.customer_name}</p>
                            <p className="text-[10.5px] text-muted-foreground">#{r.customer_id} · current <span className="text-emerald-700 dark:text-emerald-400 font-semibold font-mono">{formatCurrency(Number(r.amount))}</span></p>
                          </div>
                          <input type="text" inputMode="numeric" placeholder="amount"
                            value={searchAmounts[r.customer_id] ?? ""}
                            onChange={(e) => setSearchAmounts((prev) => ({ ...prev, [r.customer_id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && applySearchAmount(r.customer_id)}
                            className="w-full h-8 rounded border border-border bg-secondary px-2 text-[12px] text-right font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20" />
                          <button onClick={() => applySearchAmount(r.customer_id)} disabled={!searchAmounts[r.customer_id]}
                            className="h-8 w-9 flex items-center justify-center rounded bg-muted border border-border hover:bg-muted/80 disabled:opacity-30 transition-colors">
                            <CheckCircle className="h-3.5 w-3.5 text-foreground" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchQuery.trim().length > 0 && searchResults.length === 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-card shadow-xl px-3 py-4 text-center text-xs text-muted-foreground">No customers found</div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-auto text-[11.5px] text-muted-foreground">
                  <span><span className="font-mono font-medium text-foreground/80">{rows.filter((r) => Number(r.amount) > 0).length}</span> with amount</span>
                </div>
              </div>

              {/* ws-body */}
              <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4" ref={tableScrollRef}>
                {isTableLoading ? (
                  <div className="space-y-6">
                    {[...Array(2)].map((_, gi) => (
                      <div key={gi}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-2.5 w-24 bg-secondary/60 rounded animate-pulse" />
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <div className="bg-card border border-border rounded-xl overflow-hidden">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="grid items-center gap-3 px-3 py-3 border-b border-border/50 last:border-0 animate-pulse"
                              style={{ gridTemplateColumns: "40px 1fr 80px 130px 96px 30px" }}>
                              {[...Array(6)].map((_, j) => <div key={j} className="h-4 bg-secondary rounded" />)}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3 py-20">
                    <Users className="h-10 w-10 opacity-20" />
                    <div>
                      <p className="font-medium text-sm">No customers with outstanding balance</p>
                      <p className="text-xs mt-1 opacity-60">All settled — try a different date.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {groupedRows.map((group) => {
                      const segTotal = group.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
                      const segCount = group.rows.filter((r) => Number(r.amount) > 0).length;
                      return (
                        <div key={group.segment_id ?? "unknown"}>
                          <div className="flex items-center gap-2.5 mb-2">
                            <span className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-muted-foreground/70">{group.segment_name}</span>
                            <div className="flex-1 h-px bg-border" />
                            <span className="font-mono text-[10.5px] text-muted-foreground/60">{group.rows.length} customers</span>
                            {segCount > 0 && (
                              <>
                                <span className="font-mono text-[10.5px] text-muted-foreground/60">· {segCount} entered</span>
                                <span className="font-mono text-[12px] font-medium text-foreground/80">{formatCurrency(segTotal)}</span>
                              </>
                            )}
                          </div>
                          <div className="bg-card border border-border rounded-xl overflow-hidden">
                            {/* ctable header */}
                            <div className="grid text-[10.5px] font-medium uppercase tracking-[.06em] text-muted-foreground bg-secondary/60 border-b border-border"
                              style={{ gridTemplateColumns: "40px 1fr 80px 130px 96px 30px" }}>
                              <div className="px-3 py-2" />
                              <div className="px-3 py-2">Customer</div>
                              <div className="px-3 py-2 text-right">Balance</div>
                              <div className="px-3 py-2">Mode / Status</div>
                              <div className="px-3 py-2 text-right">Amount</div>
                              <div className="px-3 py-2" />
                            </div>
                            {/* ctable rows */}
                            {group.rows.map((r) => {
                              const isHighlighted = r.customer_id === highlightedCustomerId;
                              const isOnlineHighlight = isHighlighted && activeQueueModeRef.current === "online";
                              const hasAmt = Number(r.amount) > 0;
                              return (
                                <div key={r.customer_id}
                                  ref={(el) => { if (el) rowRefs.current.set(r.customer_id, el as any); else rowRefs.current.delete(r.customer_id); }}
                                  className={`grid items-center border-b border-border/50 last:border-0 transition-colors ${
                                    isHighlighted ? isOnlineHighlight ? "bg-sky-500/12" : "bg-primary/15" : "hover:bg-secondary/40"
                                  }`}
                                  style={{ gridTemplateColumns: "40px 1fr 80px 130px 96px 30px" }}>
                                  <div className="px-3 py-2.5">
                                    <span className="text-[10.5px] font-mono text-muted-foreground/40">{String(r.rowIdx + 1).padStart(2, "0")}</span>
                                  </div>
                                  <div className="px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
                                    <span className="text-[13px] font-medium text-foreground truncate">{r.customer_name}</span>
                                    <span className="font-mono text-[10.5px] text-muted-foreground/60">#{r.customer_id}</span>
                                  </div>
                                  <div className="px-3 py-2.5 text-right">
                                    <span className="font-mono text-[12.5px] text-muted-foreground/70">
                                      {r.balance != null ? formatCurrency(r.balance) : "—"}
                                    </span>
                                  </div>
                                  <div className="px-3 py-2.5 flex items-center gap-1.5">
                                    <button onClick={() => setRows((prev) => { const next = [...prev]; const newMode = next[r.rowIdx].payment_mode === "CASH" ? "ONLINE" : "CASH"; next[r.rowIdx] = { ...next[r.rowIdx], payment_mode: newMode, is_paid: newMode === "CASH" }; return next; })}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                                        r.payment_mode === "ONLINE" ? "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/30" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                      }`}>
                                      {r.payment_mode === "ONLINE" ? <Wifi className="h-2.5 w-2.5" /> : <Wallet className="h-2.5 w-2.5" />}
                                      {r.payment_mode}
                                    </button>
                                    <button onClick={() => setRows((prev) => { const next = [...prev]; next[r.rowIdx] = { ...next[r.rowIdx], is_paid: !next[r.rowIdx].is_paid }; return next; })}
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                                        r.is_paid ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                      }`}>
                                      {r.is_paid ? "paid" : "unpaid"}
                                    </button>
                                  </div>
                                  <div className="px-3 py-2.5">
                                    <input type="text" inputMode="numeric" value={r.amount}
                                      onChange={(e) => setRows((prev) => { const next = [...prev]; next[r.rowIdx] = { ...next[r.rowIdx], amount: e.target.value }; return next; })}
                                      className={`w-full px-2.5 py-1.5 rounded-md border text-right font-mono text-[13.5px] font-medium bg-secondary focus:outline-none transition-all ${
                                        isHighlighted
                                          ? isOnlineHighlight
                                            ? "border-sky-500/40 bg-sky-500/8 text-sky-700 dark:text-sky-400 focus:ring-2 focus:ring-sky-500/20"
                                            : "border-foreground/25 bg-card text-foreground focus:ring-2 focus:ring-primary/25"
                                          : hasAmt
                                          ? "border-border text-emerald-700 dark:text-emerald-400 focus:border-foreground/30 focus:ring-2 focus:ring-primary/20 focus:bg-card"
                                          : "border-border text-foreground focus:border-foreground/30 focus:ring-2 focus:ring-primary/20 focus:bg-card"
                                      }`}
                                    />
                                  </div>
                                  <div className="flex items-center justify-center py-2.5">
                                    {progressCustomerId === r.customer_id && (
                                      <CircularProgress value={progressValue} size={22} color={activeQueueModeRef.current === "online" ? "blue" : "emerald"} />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* ── Dock ── */}
        <div className="flex items-center gap-4 px-5 border-t border-border bg-card flex-shrink-0" style={{ height: 60 }}>
          <div className="flex flex-col font-mono">
            <span className="text-[10.5px] uppercase tracking-[.08em] text-muted-foreground/60 mb-0.5">Entries</span>
            <span className="text-[18px] font-medium leading-none text-foreground">{nonZeroCount}</span>
          </div>
          <div className="w-px h-7 bg-border flex-shrink-0" />
          <div className="flex flex-col font-mono">
            <span className="text-[10.5px] uppercase tracking-[.08em] text-muted-foreground/60 mb-0.5">Total</span>
            <span className="text-[18px] font-medium leading-none text-foreground">{formatCurrency(tableTotal)}</span>
          </div>
          <div className="w-px h-7 bg-border flex-shrink-0" />
          <div className="flex items-center gap-3.5 text-[11.5px] text-muted-foreground">
            <span>
              <span className="font-mono text-emerald-700 dark:text-emerald-400">●</span>{" "}
              <span className="font-mono font-medium text-foreground/80">{rows.filter((r) => Number(r.amount) > 0 && r.payment_mode === "CASH").length}</span>{" "}
              cash
            </span>
            <span>
              <span className="font-mono text-sky-600 dark:text-sky-400">●</span>{" "}
              <span className="font-mono font-medium text-foreground/80">{rows.filter((r) => Number(r.amount) > 0 && r.payment_mode === "ONLINE").length}</span>{" "}
              online
            </span>
          </div>
          <div className="flex-1" />
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-[12.5px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
            <Download className="h-3.5 w-3.5" /> Export dataset
          </button>
          <button onClick={handleSubmitAll} disabled={submitting || isTableLoading || nonZeroCount === 0}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-foreground text-background text-[12.5px] font-semibold hover:bg-foreground/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Submit{nonZeroCount > 0 ? ` ${nonZeroCount} entries` : ""}
            {nonZeroCount > 0 && <span className="font-mono text-[10.5px] border border-background/25 bg-background/15 px-1.5 py-px rounded text-background/80">⌘↵</span>}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Voice-to-text transcription animation ─────────────────────────────────────
function TranscribingOverlay({ color = "primary" }: { color?: "primary" | "blue" }) {
  const c = color === "blue" ? "#38bdf8" : "var(--color-primary, #a8d3c2)";
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
  const strokeColor = color === "emerald" ? "#34d399" : color === "blue" ? "#38bdf8" : "var(--color-primary, #a8d3c2)";
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
