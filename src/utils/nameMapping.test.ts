import { describe, expect, it } from "vitest";
import type { MappingCandidate } from "@/types";
import {
  ALIAS_MAX, MISMATCH_MAX, addWord, cleanWord, editWord, failureMessage, flattenDropdown, isDirty,
  isRememberableText, newWords, removeWord, sameForScorer, shouldOfferRemember,
} from "./nameMapping";

const cand = (over: Partial<MappingCandidate> = {}): MappingCandidate => ({
  id: 2, name: "Kannan", score: 0.95, source: "ai_mismatch", mapping_id: 9, matched_word: "Kanan",
  exact: false, use_count: 0, also: [], ...over,
});

describe("limits", () => {
  it("are 3 aliases and 10 AI-mismatch names", () => {
    expect(ALIAS_MAX).toBe(3);
    expect(MISMATCH_MAX).toBe(10);
  });
});

describe("shouldOfferRemember (R-18)", () => {
  const base = { extractedName: "Selvm", pickedName: "Selvam", pickedId: 1, mappingSuggestions: [] as MappingCandidate[] };

  it("offers when the OCR text differs from the picked customer's name", () => {
    expect(shouldOfferRemember(base)).toBe(true);
  });

  it("does not offer when they are the same", () => {
    expect(shouldOfferRemember({ ...base, extractedName: "Selvam" })).toBe(false);
  });

  it("treats case / outer & repeated whitespace as the same (the scorer already scores those 100)", () => {
    expect(shouldOfferRemember({ ...base, extractedName: "  selvam " })).toBe(false);
    expect(shouldOfferRemember({ ...base, extractedName: "SELVAM" })).toBe(false);
    expect(shouldOfferRemember({ ...base, extractedName: "Muthu   Kumar", pickedName: "muthu kumar" })).toBe(false);
  });

  it("but a real difference is offered — no further normalization", () => {
    expect(shouldOfferRemember({ ...base, extractedName: "Selvam K", pickedName: "Selvam" })).toBe(true);
    expect(shouldOfferRemember({ ...base, extractedName: "Selva-m", pickedName: "Selvam" })).toBe(true);
  });

  it("does not offer for empty / missing OCR text (manual rows)", () => {
    expect(shouldOfferRemember({ ...base, extractedName: "" })).toBe(false);
    expect(shouldOfferRemember({ ...base, extractedName: "   " })).toBe(false);
    expect(shouldOfferRemember({ ...base, extractedName: undefined })).toBe(false);
    expect(shouldOfferRemember({ ...base, extractedName: null })).toBe(false);
  });

  it("never offers for OCR placeholders or text without letters", () => {
    expect(shouldOfferRemember({ ...base, extractedName: "[UNCLEAR]" })).toBe(false);
    expect(shouldOfferRemember({ ...base, extractedName: "1234" })).toBe(false);
    expect(shouldOfferRemember({ ...base, extractedName: "---" })).toBe(false);
  });

  it("offers for Tamil-script text", () => {
    expect(shouldOfferRemember({ ...base, extractedName: "செல்வம்" })).toBe(true);
  });

  it("does not offer when this exact text is already mapped to that customer", () => {
    expect(shouldOfferRemember({ ...base, mappingSuggestions: [cand({ id: 1, matched_word: "Selvm" })] })).toBe(false);
    expect(shouldOfferRemember({
      ...base,
      mappingSuggestions: [cand({ id: 1, matched_word: "Other", also: [{ source: "alias", word: "Selvm", mapping_id: 3 }] })],
    })).toBe(false);
  });

  it("still offers when the text is mapped to a DIFFERENT customer, or only a similar word is mapped", () => {
    expect(shouldOfferRemember({ ...base, mappingSuggestions: [cand({ id: 2, matched_word: "Selvm" })] })).toBe(true);
    expect(shouldOfferRemember({ ...base, mappingSuggestions: [cand({ id: 1, matched_word: "Selvam" })] })).toBe(true);
  });
});

describe("isRememberableText / sameForScorer", () => {
  it("classifies text", () => {
    expect(isRememberableText("Selvam")).toBe(true);
    expect(isRememberableText(" a ")).toBe(true);
    expect(isRememberableText("[UNCLEAR]")).toBe(false);
    expect(isRememberableText("")).toBe(false);
    expect(isRememberableText(undefined)).toBe(false);
  });
  it("compares like the fuzzy scorer's exact branch", () => {
    expect(sameForScorer("A  B", "a b")).toBe(true);
    expect(sameForScorer("AB", "A B")).toBe(false);
  });
});

describe("popup draft helpers (R-14, R-15)", () => {
  it("stores words as typed — only outer whitespace trimmed", () => {
    expect(cleanWord("  Sel  vam ")).toBe("Sel  vam");
    const r = addWord(["selvam"], "Selvam", 3);                    // different case is a different word
    expect(r).toEqual({ ok: true, list: ["selvam", "Selvam"] });
  });

  it("rejects empty, duplicate, over-long and over-limit", () => {
    expect(addWord([], "   ", 3)).toEqual({ ok: false, reason: "empty" });
    expect(addWord(["a"], "a", 3)).toEqual({ ok: false, reason: "duplicate" });
    expect(addWord([], "x".repeat(201), 3)).toEqual({ ok: false, reason: "too_long" });
    expect(addWord(["a", "b", "c"], "d", 3)).toEqual({ ok: false, reason: "limit" });
    expect(addWord(Array.from({ length: 10 }, (_, i) => `m${i}`), "m11", 10)).toEqual({ ok: false, reason: "limit" });
  });

  it("allows editing and removing at the limit", () => {
    expect(editWord(["a", "b", "c"], 1, "bb")).toEqual({ ok: true, list: ["a", "bb", "c"] });
    expect(editWord(["a", "b", "c"], 1, "c")).toEqual({ ok: false, reason: "duplicate" });
    expect(editWord(["a", "b"], 0, "a")).toEqual({ ok: true, list: ["a", "b"] });       // unchanged is fine
    expect(editWord(["a"], 0, " ")).toEqual({ ok: false, reason: "empty" });
    expect(removeWord(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    const afterRemove = removeWord(["a", "b", "c"], 0);
    expect(addWord(afterRemove, "z", 3).ok).toBe(true);                                  // room again
  });

  it("detects what is new / dirty", () => {
    expect(newWords(["a", "b"], ["a", "c", "d"])).toEqual(["c", "d"]);
    expect(isDirty(["a", "b"], ["b", "a"])).toBe(false);                                 // order is irrelevant
    expect(isDirty(["a"], ["a", "b"])).toBe(true);
    expect(isDirty(["a"], ["b"])).toBe(true);
  });

  it("has a readable message per failure", () => {
    expect(failureMessage("limit", "alias", 3)).toMatch(/Limit of 3/);
    expect(failureMessage("limit", "ai_mismatch", 10)).toMatch(/Limit of 10/);
    expect(failureMessage("duplicate", "alias", 3)).toMatch(/Already/);
  });
});

describe("flattenDropdown", () => {
  it("lists column 1 first, then column 2 (keyboard order = reading order)", () => {
    const flat = flattenDropdown([{ id: 1 }, { id: 2 }], [cand(), cand({ mapping_id: 10 })]);
    expect(flat.map((e) => e.column)).toEqual([1, 1, 2, 2]);
  });
});
