import { afterEach, describe, expect, it, vi } from "vitest";
import type { MappingCandidate } from "@/types";
import {
  b64ToBlob, buildOcrTrainingRows, buildVoiceTrainingRows, encodeWav, ocrFormData, recordingExt, rowOrigin, sniffImageExt,
  toTrainingAudio, visibleCustomerName, voiceFormData, type OcrTrainingSource, type VoiceFinalRow, type VoiceSpokenEntry,
} from "./trainingData";

const cand = (over: Partial<MappingCandidate> = {}): MappingCandidate => ({
  id: 1, name: "Kannan K", score: 1, source: "alias", mapping_id: 4, matched_word: "Kannan anna", exact: true, use_count: 0, also: [], ...over,
});

const row = (over: Partial<OcrTrainingSource> = {}): OcrTrainingSource => ({
  customer_id: 1, customer_name: "Kannan K", extracted_name: "Kannan anna", match_source: "fuzzy", mapping_ref: null,
  mapping_suggestions: [], collection_date: "17-10-2026", product_type: "EDI", payment_mode: "CASH", amount: 500, ...over,
});

const readBlob = (b: Blob) => new Promise<ArrayBuffer>((res) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.readAsArrayBuffer(b); });

// ── the name as written on the page (TD-03) ───────────────────────────────────

describe("visibleCustomerName — real name or alias, never the misread word", () => {
  it("a normal (fuzzy / exact) match shows the real customer name", () => {
    expect(visibleCustomerName(row({ extracted_name: "Kanan K", match_source: "fuzzy" }))).toBe("Kannan K");
  });

  it("an AI-mismatch match is a misread, so the real name is used — not the misread word", () => {
    const r = row({ extracted_name: "Thirumalay", match_source: "ai_mismatch", mapping_ref: { kind: "ai_mismatch", id: 9 },
      mapping_suggestions: [cand({ source: "ai_mismatch", mapping_id: 9, matched_word: "Thirumalay" })] });
    expect(visibleCustomerName(r)).toBe("Kannan K");
  });

  it("a match through an alias shows the alias that is written on the page (the stored word, not the OCR's typo of it)", () => {
    const r = row({ extracted_name: "Kanan anna", match_source: "alias", mapping_ref: { kind: "alias", id: 4 }, mapping_suggestions: [cand()] });
    expect(visibleCustomerName(r)).toBe("Kannan anna");
  });

  it("an alias match whose candidate is no longer in the list falls back to the OCR text", () => {
    const r = row({ extracted_name: "Kannan anna", match_source: "alias", mapping_ref: { kind: "alias", id: 4 }, mapping_suggestions: [] });
    expect(visibleCustomerName(r)).toBe("Kannan anna");
  });

  it("an alias id is never confused with an AI-mismatch row that happens to have the same id", () => {
    const r = row({ extracted_name: "Kannan anna", match_source: "alias", mapping_ref: { kind: "alias", id: 9 },
      mapping_suggestions: [cand({ source: "ai_mismatch", mapping_id: 9, matched_word: "WRONG WORD" })] });
    expect(visibleCustomerName(r)).toBe("Kannan anna");
  });

  it("a hand-picked customer whose saved alias is exactly the text on the page shows that alias", () => {
    const r = row({ extracted_name: "Kannan anna", match_source: null, mapping_ref: null, picked: true, mapping_suggestions: [cand()] });
    expect(visibleCustomerName(r)).toBe("Kannan anna");
  });

  it("an alias listed under 'also' counts as well", () => {
    const r = row({ extracted_name: "Anna", match_source: null, picked: true,
      mapping_suggestions: [cand({ source: "ai_mismatch", matched_word: "Thirumalay", also: [{ source: "alias", word: "Anna", mapping_id: 7 }] })] });
    expect(visibleCustomerName(r)).toBe("Anna");
  });

  it("a hand-picked customer with unrelated page text shows the real name", () => {
    expect(visibleCustomerName(row({ extracted_name: "Qwerty", match_source: null, picked: true, mapping_suggestions: [cand()] }))).toBe("Kannan K");
  });

  it("an alias of a DIFFERENT customer is ignored", () => {
    const r = row({ extracted_name: "Kannan anna", match_source: null, picked: true, customer_id: 1, mapping_suggestions: [cand({ id: 2 })] });
    expect(visibleCustomerName(r)).toBe("Kannan K");
  });

  it("a manual (Add) row simply uses the customer name", () => {
    expect(visibleCustomerName(row({ extracted_name: undefined, match_source: undefined, manual: true }))).toBe("Kannan K");
  });
});

describe("rowOrigin", () => {
  it("manual beats picked, picked beats matched", () => {
    expect(rowOrigin({ manual: true, picked: true })).toBe("manual");
    expect(rowOrigin({ picked: true })).toBe("picked");
    expect(rowOrigin({})).toBe("matched");
  });
});

describe("buildOcrTrainingRows", () => {
  it("only the rows that were really submitted, in the CSV format (raw OCR text in its own column)", () => {
    const rows = buildOcrTrainingRows([
      row({ extracted_name: "Kanan K", payment_mode: "ONLINE", amount: 750 }),
      row({ customer_id: null, customer_name: "" }),            // unassigned -> not submitted
      row({ amount: 0 }),                                       // no amount -> not submitted
      row({ manual: true, extracted_name: undefined, customer_name: "Added" }),
    ]);
    expect(rows).toEqual([
      { customer: "Kannan K", date: "17-10-2026", amount: 750, type: "EDI", mode: "ONLINE", raw_text: "Kanan K", source_file: "", origin: "matched" },
      { customer: "Added", date: "17-10-2026", amount: 500, type: "EDI", mode: "CASH", raw_text: "", source_file: "", origin: "manual" },
    ]);
  });
});

// ── Voice rows have the same format ───────────────────────────────────────────

describe("buildVoiceTrainingRows", () => {
  const entry = (over: Partial<VoiceSpokenEntry> = {}): VoiceSpokenEntry => ({
    recordingId: "rec1", spokenName: "selvem", amount: 400, customerId: 1, customerName: "Selvam", origin: "matched", ...over,
  });
  const final = (over: Partial<VoiceFinalRow> = {}): VoiceFinalRow => ({ customer_id: 1, customer_name: "Selvam", amount: "400", payment_mode: "CASH", ...over });

  it("uses the submitted amount and mode, the real name, and the transcribed word as raw_text", () => {
    const rows = buildVoiceTrainingRows([entry({ amount: 40 })], [final({ amount: "400", payment_mode: "ONLINE" })], { date: "2026-10-17", product: "edi" });
    expect(rows).toEqual([{ customer: "Selvam", date: "2026-10-17", amount: 400, type: "EDI", mode: "ONLINE", raw_text: "selvem", source_file: "rec1", origin: "matched" }]);
  });

  it("a customer spoken twice keeps each entry's own spoken amount", () => {
    const rows = buildVoiceTrainingRows(
      [entry({ amount: 100 }), entry({ recordingId: "rec2", amount: 300, origin: "picked" })], [final({ amount: "300" })], { date: "2026-10-17", product: "iop" });
    expect(rows.map((r) => [r.source_file, r.amount, r.origin, r.type])).toEqual([["rec1", 100, "matched", "IOP"], ["rec2", 300, "picked", "IOP"]]);
  });

  it("entries that were not submitted (no row / zero amount) are left out", () => {
    const rows = buildVoiceTrainingRows([entry(), entry({ customerId: 2 }), entry({ customerId: 3 })],
      [final(), final({ customer_id: 3, amount: "0" })], { date: "2026-10-17", product: "edi" });
    expect(rows).toHaveLength(1);
  });
});

// ── upload bodies ─────────────────────────────────────────────────────────────

describe("form data", () => {
  it("sniffs JPEG vs PNG from the base64 and builds the OCR body", async () => {
    expect(sniffImageExt("/9j/4AAQ")).toBe("jpg");
    expect(sniffImageExt("iVBORw0KGgo")).toBe("png");
    const rows = buildOcrTrainingRows([row()]);
    const form = ocrFormData({ pageImageB64: btoa("jpegbytes"), page: 3, rows, folderDate: "2026-10-17" });
    const image = form.get("image") as File;
    expect(image.name).toBe("page.jpg");
    expect(new TextDecoder().decode(await readBlob(image))).toBe("jpegbytes");
    expect(form.get("page")).toBe("3");
    expect(form.get("folder_date")).toBe("2026-10-17");
    expect(JSON.parse(form.get("rows") as string)).toEqual(rows);
    expect(ocrFormData({ pageImageB64: "iVBORw0KGgo=", page: 1, rows }).get("folder_date")).toBeNull();
  });

  it("the voice body names every recording by its id, and carries the full transcriptions", () => {
    const form = voiceFormData({
      recordings: [
        { id: "rec1", blob: new Blob(["a"], { type: "audio/wav" }), ext: "wav", transcription: "செல்வம் 400" },
        { id: "rec2", blob: new Blob(["b"], { type: "audio/webm" }), ext: "webm", transcription: "" },
      ],
      rows: [], folderDate: "2026-10-17",
    });
    expect((form.getAll("recordings") as File[]).map((f) => f.name)).toEqual(["rec1.wav", "rec2.webm"]);
    expect(JSON.parse(form.get("transcriptions") as string)).toEqual({ rec1: "செல்வம் 400", rec2: "" });
  });

  it("b64ToBlob round-trips bytes", async () => {
    const blob = b64ToBlob(btoa("\x00\x01\xffabc"), "image/jpeg");
    expect(blob.type).toBe("image/jpeg");
    expect(Array.from(new Uint8Array(await readBlob(blob)))).toEqual([0, 1, 255, 97, 98, 99]);
  });
});

// ── WAV, in the browser ───────────────────────────────────────────────────────

describe("encodeWav", () => {
  it("writes a valid 16 kHz mono 16-bit PCM file", async () => {
    const blob = encodeWav(new Float32Array([0, 1, -1, 0.5, 2, -2]), 16000);
    expect(blob.type).toBe("audio/wav");
    const buf = await readBlob(blob);
    const v = new DataView(buf);
    const text = (o: number, n: number) => String.fromCharCode(...new Uint8Array(buf, o, n));
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(text(12, 4)).toBe("fmt ");
    expect(v.getUint16(20, true)).toBe(1);                 // PCM
    expect(v.getUint16(22, true)).toBe(1);                 // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(text(36, 4)).toBe("data");
    expect(v.getUint32(40, true)).toBe(12);
    expect(v.getUint32(4, true)).toBe(buf.byteLength - 8);
    expect([0, 1, 2, 3, 4, 5].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 16383, 32767, -32768]);   // out-of-range samples are clamped
  });
});

describe("toTrainingAudio", () => {
  const w = window as any;
  afterEach(() => { delete w.AudioContext; delete w.OfflineAudioContext; });

  it("decodes in the browser and returns 16 kHz mono WAV", async () => {
    const offlineArgs: unknown[] = [];
    w.AudioContext = class { decodeAudioData = vi.fn().mockResolvedValue({ duration: 0.5 }); close = vi.fn(); };
    w.OfflineAudioContext = class {
      destination = {};
      constructor(...a: unknown[]) { offlineArgs.push(...a); }
      createBufferSource() { return { connect() {}, start() {}, buffer: null }; }
      startRendering = async () => ({ getChannelData: () => new Float32Array([0, 0.5, -0.5]) });
    };
    const out = await toTrainingAudio(new Blob(["webm-bytes"], { type: "audio/webm" }));
    expect(out.ext).toBe("wav");
    expect(out.blob.type).toBe("audio/wav");
    expect(out.blob.size).toBe(44 + 6);
    expect(offlineArgs).toEqual([1, 8000, 16000]);          // mono, 0.5 s at 16 kHz
  });

  it("falls back to the original recording when the browser cannot decode it", async () => {
    w.AudioContext = class { decodeAudioData = vi.fn().mockRejectedValue(new Error("bad data")); close = vi.fn(); };
    w.OfflineAudioContext = class {};
    const original = new Blob(["x"], { type: "audio/webm;codecs=opus" });
    const out = await toTrainingAudio(original);
    expect(out.blob).toBe(original);
    expect(out.ext).toBe("webm");
  });

  it("falls back when Web Audio does not exist at all", async () => {
    const original = new Blob(["x"], { type: "audio/mp4" });
    expect(await toTrainingAudio(original)).toEqual({ blob: original, ext: "mp4" });
  });

  it("recordingExt maps the recorder's mime types", () => {
    expect(["audio/wav", "audio/ogg", "audio/mp4", "audio/webm;codecs=opus", ""].map((t) => recordingExt(new Blob([], { type: t }))))
      .toEqual(["wav", "ogg", "mp4", "webm", "webm"]);
  });
});
