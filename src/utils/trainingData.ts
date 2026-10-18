// Training data for Google Drive (OCR page + table, Voice recordings + table). Pure helpers — no React — so they are unit-testable.
// The server only relays what is built here to Drive; it never stores it. Recordings are encoded to WAV in the browser for that reason.
import type { MappingCandidate, MappingRef } from "@/types";

export type TrainingOrigin = "matched" | "picked" | "manual";

/** One row of the CSV — the same format for OCR and Voice (the server fills in `source_file` with the real uploaded file name). */
export interface TrainingRow {
  customer: string;
  date: string;
  amount: number;
  type: "EDI" | "IOP";
  mode: "CASH" | "ONLINE";
  raw_text: string;
  source_file: string;
  origin: TrainingOrigin;
}

// ── OCR ───────────────────────────────────────────────────────────────────────

/** The parts of an OCR row the training table needs. */
export interface OcrTrainingSource {
  customer_id: number | null;
  customer_name: string;
  extracted_name?: string;
  match_source?: "fuzzy" | "alias" | "ai_mismatch" | null;
  mapping_ref?: MappingRef | null;
  mapping_suggestions?: MappingCandidate[];
  picked?: boolean;
  manual?: boolean;
  collection_date: string;
  product_type: "EDI" | "IOP";
  payment_mode: "CASH" | "ONLINE";
  amount: number;
}

/** The stored alias word this row's customer was reached through (or whose text was written on the page), else null. */
function aliasWritten(row: OcrTrainingSource): string | null {
  const candidates = row.mapping_suggestions ?? [];
  const ref = row.mapping_ref;
  if (ref?.kind === "alias") {
    const hit = candidates.find((c) => c.source === "alias" && c.mapping_id === ref.id);
    return hit?.matched_word ?? (row.extracted_name?.trim() || null);
  }
  // The user picked the customer by hand, but the text on the page is exactly one of that customer's saved aliases.
  const text = row.extracted_name?.trim();
  if (text && row.customer_id != null) {
    const isSavedAlias = candidates.some(
      (c) =>
        c.id === row.customer_id &&
        ((c.source === "alias" && c.matched_word === text) || c.also.some((a) => a.source === "alias" && a.word === text)),
    );
    if (isSavedAlias) return text;
  }
  return null;
}

/**
 * The customer name as it is WRITTEN on the page: the real customer name, or the alias when the page used an alias.
 * Never the misread word (an AI-mismatch name is by definition something the OCR got wrong) and never the raw OCR guess.
 */
export function visibleCustomerName(row: OcrTrainingSource): string {
  if (row.match_source === "ai_mismatch") return row.customer_name;
  return aliasWritten(row) ?? row.customer_name;
}

export function rowOrigin(row: Pick<OcrTrainingSource, "manual" | "picked">): TrainingOrigin {
  if (row.manual) return "manual";
  return row.picked ? "picked" : "matched";
}

/** The rows that were really submitted (same filter as the Submit button), in the training format. */
export function buildOcrTrainingRows(rows: OcrTrainingSource[]): TrainingRow[] {
  return rows
    .filter((r) => r.customer_id && r.amount > 0)
    .map((r) => ({
      customer: visibleCustomerName(r),
      date: r.collection_date,                       // dd-mm-yyyy; the server turns it into yyyy-mm-dd
      amount: r.amount,
      type: r.product_type,
      mode: r.payment_mode,
      raw_text: r.extracted_name ?? "",
      source_file: "",
      origin: rowOrigin(r),
    }));
}

// ── Voice ─────────────────────────────────────────────────────────────────────

/** One spoken entry that was resolved to a customer while the queue ran. */
export interface VoiceSpokenEntry {
  recordingId: string;
  spokenName: string;                               // the name as transcribed
  amount: number;                                   // the amount as spoken
  customerId: number;
  customerName: string;
  origin: "matched" | "picked";
}

export interface VoiceFinalRow {
  customer_id: number;
  customer_name: string;
  amount: string | number;
  payment_mode: "CASH" | "ONLINE";
}

/**
 * Voice rows in the same format as OCR. Amount and mode are what was finally submitted for that customer, so corrections
 * made in the table are captured; a customer spoken more than once keeps each entry's own spoken amount (the table holds only one).
 */
export function buildVoiceTrainingRows(
  entries: VoiceSpokenEntry[],
  finalRows: VoiceFinalRow[],
  opts: { date: string; product: "edi" | "iop" },
): TrainingRow[] {
  const byCustomer = new Map(finalRows.map((r) => [r.customer_id, r]));
  const timesSpoken = new Map<number, number>();
  for (const e of entries) timesSpoken.set(e.customerId, (timesSpoken.get(e.customerId) ?? 0) + 1);

  const out: TrainingRow[] = [];
  for (const e of entries) {
    const final = byCustomer.get(e.customerId);
    if (!final) continue;                            // not in the submitted table
    const submitted = Number(final.amount);
    if (!(submitted > 0)) continue;                  // not submitted
    out.push({
      customer: final.customer_name || e.customerName,
      date: opts.date,
      amount: timesSpoken.get(e.customerId) === 1 ? submitted : e.amount,
      type: opts.product.toUpperCase() as "EDI" | "IOP",
      mode: final.payment_mode,
      raw_text: e.spokenName,
      source_file: e.recordingId,
      origin: e.origin,
    });
  }
  return out;
}

/** The warning shown when the Drive upload failed (the records themselves were already saved). */
export function trainingErrorMessage(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  const reason = typeof detail === "string" ? detail : "";
  return `Records saved, but the training data was not saved to Drive${reason ? ` — ${reason}` : ""}`;
}

// ── Upload bodies ─────────────────────────────────────────────────────────────

export function sniffImageExt(b64: string): "jpg" | "png" {
  return b64.startsWith("iVBOR") ? "png" : "jpg";   // PNG files start 89 50 4E 47 -> "iVBOR"; the preprocessed pages are JPEG
}

export function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function ocrFormData(args: { pageImageB64: string; page: number; rows: TrainingRow[]; folderDate?: string }): FormData {
  const ext = sniffImageExt(args.pageImageB64);
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  const form = new FormData();
  form.append("image", b64ToBlob(args.pageImageB64, mime), `page.${ext}`);
  form.append("rows", JSON.stringify(args.rows));
  form.append("page", String(args.page));
  if (args.folderDate) form.append("folder_date", args.folderDate);
  return form;
}

export interface VoiceRecordingFile {
  id: string;                                       // e.g. "rec1" — the rows' `source_file`
  blob: Blob;                                       // WAV (or the original recording if it could not be converted)
  ext: string;
  transcription: string;
}

export function voiceFormData(args: { recordings: VoiceRecordingFile[]; rows: TrainingRow[]; folderDate?: string }): FormData {
  const form = new FormData();
  for (const r of args.recordings) form.append("recordings", r.blob, `${r.id}.${r.ext}`);
  form.append("rows", JSON.stringify(args.rows));
  form.append("transcriptions", JSON.stringify(Object.fromEntries(args.recordings.map((r) => [r.id, r.transcription]))));
  if (args.folderDate) form.append("folder_date", args.folderDate);
  return form;
}

// ── Recording -> 16 kHz mono WAV, in the browser ──────────────────────────────

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };

  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);                     // PCM header size
  view.setUint16(20, 1, true);                      // PCM
  view.setUint16(22, 1, true);                      // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * bytesPerSample, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the recording"));
    reader.readAsArrayBuffer(blob);
  });
}

export function recordingExt(blob: Blob): string {
  const t = (blob.type || "").toLowerCase();
  if (t.includes("wav")) return "wav";
  if (t.includes("ogg")) return "ogg";
  if (t.includes("mp4") || t.includes("aac")) return "mp4";
  return "webm";
}

/**
 * Decode a recording and re-encode it as 16 kHz mono WAV (what speech models train on) — all in the browser, so the
 * server never needs ffmpeg or a temp file. Falls back to the original recording when the browser cannot decode it.
 */
export async function toTrainingAudio(blob: Blob): Promise<{ blob: Blob; ext: string }> {
  try {
    const Ctx: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
    const Offline: typeof OfflineAudioContext | undefined = window.OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
    if (!Ctx || !Offline) throw new Error("Web Audio is not available");
    const ctx = new Ctx();
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(await readBlob(blob));
    } finally {
      void ctx.close?.();
    }
    const rate = 16000;
    const offline = new Offline(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return { blob: encodeWav(rendered.getChannelData(0), rate), ext: "wav" };
  } catch {
    return { blob, ext: recordingExt(blob) };
  }
}
