import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MappingCandidate } from "@/types";
import {
  MappingEditButton, MatchBadge, RememberBanner, clearedCustomer, pickPatch, type MappableRow,
} from "./rowMapping";

const row = (over: Partial<MappableRow> = {}): MappableRow => ({
  customer_id: 1, customer_name: "Selvam", customer_suggestions: [], product_type: "EDI",
  extracted_name: "Selvm", mapping_suggestions: [], match_source: null, matched_customer_name: null,
  mapping_ref: null, remember_offer: null, ...over,
});

describe("MappingEditButton — the search/edit icon on each row (R-13)", () => {
  it("is disabled until a customer is selected, and says why", () => {
    render(<MappingEditButton row={row({ customer_id: null })} onOpen={() => {}} />);
    const b = screen.getByTestId("mapping-edit");
    expect(b).toBeDisabled();
    // the tooltip sits on a wrapper: a disabled <button> swallows pointer events, so its own title would never show
    expect(screen.getByTitle("Select a customer first")).toContainElement(b);
  });

  it("opens the popup for the row's customer when clicked", async () => {
    const onOpen = vi.fn();
    const r = row();
    render(<MappingEditButton row={r} onOpen={onOpen} />);
    const b = screen.getByTestId("mapping-edit");
    expect(b).toBeEnabled();
    expect(screen.getByTitle("Add alias / AI-mismatch names for this customer")).toContainElement(b);
    await userEvent.click(b);
    expect(onOpen).toHaveBeenCalledWith(r);
  });

  it("does not click through while disabled", async () => {
    const onOpen = vi.fn();
    render(<MappingEditButton row={row({ customer_id: null })} onOpen={onOpen} />);
    await userEvent.click(screen.getByTestId("mapping-edit"));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("renders nothing when no handler is given (e.g. read-only contexts)", () => {
    const { container } = render(<MappingEditButton row={row()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RememberBanner (R-18)", () => {
  it("states exactly what will be saved, for which customer, and calls back on Remember / Dismiss", async () => {
    const onRemember = vi.fn(); const onDismiss = vi.fn();
    const r = row({ remember_offer: "Selvm" });
    render(<RememberBanner row={r} onRemember={onRemember} onDismiss={onDismiss} />);
    const banner = screen.getByTestId("remember-chip");
    expect(banner).toHaveTextContent("Save “Selvm” as an AI-mismatch name for Selvam?");   // readable prompt, no truncation
    await userEvent.click(screen.getByRole("button", { name: "Remember “Selvm” as an AI-mismatch name" }));
    expect(onRemember).toHaveBeenCalledWith(r);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith(r);
  });

  it("is hidden without an offer, without a customer, or without a handler", () => {
    const h = vi.fn();
    expect(render(<RememberBanner row={row({ remember_offer: null })} onRemember={h} />).container).toBeEmptyDOMElement();
    expect(render(<RememberBanner row={row({ remember_offer: "x", customer_id: null })} onRemember={h} />).container).toBeEmptyDOMElement();
    expect(render(<RememberBanner row={row({ remember_offer: "x" })} />).container).toBeEmptyDOMElement();
  });
});

describe("MatchBadge", () => {
  it("labels rows matched through the mapping tables only", () => {
    const { rerender } = render(<MatchBadge row={row({ match_source: "ai_mismatch", matched_customer_name: "Kannan" })} />);
    expect(screen.getByTestId("match-badge")).toHaveTextContent("AI");
    expect(screen.getByTestId("match-badge").getAttribute("title")).toContain("Kannan");
    rerender(<MatchBadge row={row({ match_source: "alias" })} />);
    expect(screen.getByTestId("match-badge")).toHaveTextContent("ALIAS");
    rerender(<MatchBadge row={row({ match_source: "fuzzy" })} />);
    expect(screen.queryByTestId("match-badge")).toBeNull();
    rerender(<MatchBadge row={row({ match_source: null })} />);
    expect(screen.queryByTestId("match-badge")).toBeNull();
  });
});

describe("pickPatch", () => {
  it("typing (id null) clears the customer, the mapping reference and any remember offer", () => {
    const p = pickPatch(row({ remember_offer: "Selvm", mapping_ref: { kind: "alias", id: 1 }, match_source: "alias" }), "Sel", null);
    expect(p).toMatchObject({ customer_name: "Sel", customer_id: null, mapping_ref: null, match_source: null, remember_offer: null });
  });

  it("offers to remember when the picked customer differs from the OCR text", () => {
    expect(pickPatch(row(), "Selvam", 1).remember_offer).toBe("Selvm");
  });

  it("does not offer when they match, for manual rows, or when that text is already mapped to the customer", () => {
    expect(pickPatch(row({ extracted_name: "Selvam" }), "Selvam", 1).remember_offer).toBeNull();
    expect(pickPatch(row({ extracted_name: "" }), "Selvam", 1).remember_offer).toBeNull();
    expect(pickPatch(row({ extracted_name: undefined }), "Selvam", 1).remember_offer).toBeNull();
    const already: MappingCandidate = { id: 1, name: "Selvam", score: 1, source: "ai_mismatch", mapping_id: 3, matched_word: "Selvm",
      exact: true, use_count: 0, also: [] };
    expect(pickPatch(row({ mapping_suggestions: [already] }), "Selvam", 1).remember_offer).toBeNull();
  });

  it("merges the extras from a column-2 pick (so usage can be counted on save)", () => {
    const p = pickPatch(row(), "Kannan", 2, { mapping_ref: { kind: "ai_mismatch", id: 9 }, match_source: "ai_mismatch", matched_customer_name: "Kannan" });
    expect(p).toMatchObject({ customer_id: 2, mapping_ref: { kind: "ai_mismatch", id: 9 }, match_source: "ai_mismatch" });
  });

  it("never touches the extracted text", () => {
    expect("extracted_name" in pickPatch(row(), "Selvam", 1)).toBe(false);
  });
});

describe("clearedCustomer", () => {
  it("resets every customer / mapping field and returns a fresh object each time", () => {
    const a = clearedCustomer();
    expect(a).toEqual({
      customer_name: "", customer_id: null, customer_suggestions: [], mapping_suggestions: [],
      match_source: null, matched_customer_name: null, mapping_ref: null, remember_offer: null,
    });
    expect(clearedCustomer().customer_suggestions).not.toBe(a.customer_suggestions);
    expect("extracted_name" in a).toBe(false);                    // the OCR text is kept
  });
});
