// Pure helpers for the alias / AI-mismatch name-mapping UI (OCR page). Kept free of React so they are unit-testable.
import type { MappingCandidate, MappingKind } from "@/types";

/** Per-customer limits (the server enforces the same numbers and returns them with the popup data). */
export const ALIAS_MAX = 3;
export const MISMATCH_MAX = 10;
export const MAX_WORD_LEN = 200;

export const KIND_LABEL: Record<MappingKind, string> = { alias: "2nd alias", ai_mismatch: "AI mismatch" };
export const KIND_BADGE: Record<MappingKind, string> = { alias: "ALIAS", ai_mismatch: "AI" };
export const KIND_MAX: Record<MappingKind, number> = { alias: ALIAS_MAX, ai_mismatch: MISMATCH_MAX };

/** The fuzzy scorer's own idea of "exactly equal": lower-case, trimmed, whitespace collapsed. */
function scorerForm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sameForScorer(a: string, b: string): boolean {
  return scorerForm(a) === scorerForm(b);
}

/** OCR writes "[UNCLEAR]" for illegible text, and a line with no letters is not a name — never offer to remember those. */
export function isRememberableText(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (/^\[.*\]$/.test(t)) return false;
  return /[A-Za-z஀-௿]/.test(t);
}

/**
 * Should the "Remember this" chip be offered after the user picked a customer for a row?
 * Yes when the OCR text differs from the picked customer's name and is not already mapped to that customer.
 */
export function shouldOfferRemember(args: {
  extractedName?: string | null;
  pickedName: string;
  pickedId: number;
  mappingSuggestions?: MappingCandidate[];
}): boolean {
  const extracted = (args.extractedName ?? "").trim();
  if (!isRememberableText(extracted)) return false;
  // Equal as far as the scorer is concerned: step 1 already matches it with score 100, remembering adds nothing.
  if (sameForScorer(extracted, args.pickedName)) return false;
  const already = (args.mappingSuggestions ?? []).some(
    (c) =>
      c.id === args.pickedId &&
      (c.matched_word === extracted || c.also.some((a) => a.word === extracted)),
  );
  return !already;
}

// ── Popup draft lists ─────────────────────────────────────────────────────────────────────────────────────
export type DraftFailure = "empty" | "duplicate" | "limit" | "too_long";
export type DraftResult = { ok: true; list: string[] } | { ok: false; reason: DraftFailure };

/** Words are stored as typed — only the outer whitespace is trimmed (no case folding, no inner-space collapsing). */
export function cleanWord(word: string): string {
  return word.trim();
}

export function addWord(list: string[], word: string, max: number): DraftResult {
  const w = cleanWord(word);
  if (!w) return { ok: false, reason: "empty" };
  if (w.length > MAX_WORD_LEN) return { ok: false, reason: "too_long" };
  if (list.includes(w)) return { ok: false, reason: "duplicate" };
  if (list.length >= max) return { ok: false, reason: "limit" };
  return { ok: true, list: [...list, w] };
}

/** Edit keeps the slot count, so it is allowed at the limit. */
export function editWord(list: string[], index: number, word: string): DraftResult {
  const w = cleanWord(word);
  if (!w) return { ok: false, reason: "empty" };
  if (w.length > MAX_WORD_LEN) return { ok: false, reason: "too_long" };
  if (list.some((x, i) => i !== index && x === w)) return { ok: false, reason: "duplicate" };
  return { ok: true, list: list.map((x, i) => (i === index ? w : x)) };
}

export function removeWord(list: string[], index: number): string[] {
  return list.filter((_, i) => i !== index);
}

/** Words in the draft that are not on the server yet — only these can raise a "mapped to someone else" conflict. */
export function newWords(original: string[], draft: string[]): string[] {
  return draft.filter((w) => !original.includes(w));
}

export function isDirty(original: string[], draft: string[]): boolean {
  if (original.length !== draft.length) return true;
  const a = [...original].sort();
  const b = [...draft].sort();
  return a.some((w, i) => w !== b[i]);
}

export function failureMessage(reason: DraftFailure, kind: MappingKind, max: number): string {
  switch (reason) {
    case "empty": return "Type a name first";
    case "duplicate": return "Already in the list";
    case "too_long": return `At most ${MAX_WORD_LEN} characters`;
    case "limit": return `Limit of ${max} reached — edit or delete an existing ${KIND_LABEL[kind]} name`;
  }
}

// ── Dropdown ──────────────────────────────────────────────────────────────────────────────────────────────
export type DropdownEntry<S> =
  | { column: 1; fuzzy: S }
  | { column: 2; mapped: MappingCandidate };

/** One flat list for keyboard navigation: column 1 first, then column 2 (the on-screen reading order). */
export function flattenDropdown<S>(col1: S[], col2: MappingCandidate[]): DropdownEntry<S>[] {
  return [
    ...col1.map((fuzzy) => ({ column: 1 as const, fuzzy })),
    ...col2.map((mapped) => ({ column: 2 as const, mapped })),
  ];
}
