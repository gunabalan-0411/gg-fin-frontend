import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MappingCandidate } from "@/types";
import { CustomerCombobox, type ComboboxPick, type ComboboxRow, type Suggestion } from "./CustomerCombobox";

const fuzzy = (id: number, name: string, score: number): Suggestion => ({ id, name, score });
const mapped = (over: Partial<MappingCandidate> = {}): MappingCandidate => ({
  id: 2, name: "Kannan", score: 0.95, source: "ai_mismatch", mapping_id: 9, matched_word: "Kanan",
  exact: false, use_count: 0, also: [], ...over,
});

type Calls = { name: string; id: number | null; pick?: ComboboxPick }[];

function Harness({
  initial, calls, compact = true, fetchSuggestions, fetchMappingSuggestions,
}: {
  initial: Partial<ComboboxRow>;
  calls: Calls;
  compact?: boolean;
  fetchSuggestions?: (q: string, t: "EDI" | "IOP") => Promise<Suggestion[]>;
  fetchMappingSuggestions?: (q: string, t: "EDI" | "IOP") => Promise<MappingCandidate[]>;
}) {
  const [row, setRow] = useState<ComboboxRow>({
    customer_name: "Thiru", customer_id: null, product_type: "EDI", customer_suggestions: [], mapping_suggestions: [], ...initial,
  });
  return (
    <CustomerCombobox
      row={row}
      compact={compact}
      fetchSuggestions={fetchSuggestions}
      fetchMappingSuggestions={fetchMappingSuggestions}
      onChange={(name, id, pick) => { calls.push({ name, id, pick }); setRow((r) => ({ ...r, customer_name: name, customer_id: id })); }}
    />
  );
}

const open = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("textbox"));
  return user;
};

describe("column 1 — the usual fuzzy suggestions, unchanged (R-09)", () => {
  it("shows only the fuzzy list, with scores, when there are no alias / AI-mismatch candidates", async () => {
    render(<Harness calls={[]} initial={{ customer_suggestions: [fuzzy(1, "Selvam", 0.95), fuzzy(2, "Kannan", 0.8)] }} />);
    await open();
    const opts = screen.getAllByTestId("fuzzy-option");
    expect(opts.map((o) => o.textContent)).toEqual(["Selvam95", "Kannan80"]);        // compact: score without %
    expect(screen.queryByTestId("mapped-option")).toBeNull();
    expect(screen.queryByText(/Alias · AI mismatch/)).toBeNull();                    // no extra header / column
    expect(screen.queryByText("Matches")).toBeNull();
    expect(screen.getByTestId("customer-dropdown")).toBeInTheDocument();
  });

  it("non-compact (mobile card) shows percent scores", async () => {
    render(<Harness compact={false} calls={[]} initial={{ customer_suggestions: [fuzzy(1, "Selvam", 0.95)] }} />);
    await open();
    expect(screen.getByTestId("fuzzy-option").textContent).toBe("Selvam95%");
  });

  it("renders nothing when there is nothing to suggest", async () => {
    render(<Harness calls={[]} initial={{}} />);
    await open();
    expect(screen.queryByTestId("customer-dropdown")).toBeNull();
  });

  it("picking a fuzzy option selects that customer and carries no mapping reference", async () => {
    const calls: Calls = [];
    render(<Harness calls={calls} initial={{ customer_suggestions: [fuzzy(1, "Selvam", 0.95)] }} />);
    const user = await open();
    await user.click(screen.getByText("Selvam"));
    expect(calls.at(-1)).toEqual({
      name: "Selvam", id: 1, pick: { mapping_ref: null, match_source: null, matched_customer_name: null },
    });
    await waitFor(() => expect(screen.queryByTestId("customer-dropdown")).toBeNull());
  });
});

describe("column 2 — alias / AI-mismatch candidates (R-10, R-12)", () => {
  const both = {
    customer_suggestions: [fuzzy(1, "Selvam", 0.7)],
    mapping_suggestions: [
      mapped({ id: 2, name: "Kannan", source: "ai_mismatch", mapping_id: 9, matched_word: "Thiru", exact: true, score: 1 }),
      mapped({ id: 3, name: "Anbu", source: "alias", mapping_id: 4, matched_word: "Thiruu", exact: false, score: 0.92 }),
    ],
  };

  it("shows both columns with headers, source badges, the matched word and an exact marker", async () => {
    render(<Harness calls={[]} initial={both} />);
    await open();
    const colMapped = screen.getByTestId("col-mapped");
    expect(within(screen.getByTestId("col-matches")).getByText("Selvam")).toBeInTheDocument();
    expect(screen.getByText("Matches")).toBeInTheDocument();
    expect(within(colMapped).getByText(/Alias · AI mismatch/)).toBeInTheDocument();
    const opts = within(colMapped).getAllByTestId("mapped-option");
    expect(opts).toHaveLength(2);
    expect(opts[0]).toHaveTextContent("Kannan");
    expect(opts[0]).toHaveTextContent("via “Thiru”");
    expect(opts[0]).toHaveTextContent("AI");
    expect(opts[0]).toHaveTextContent("=");                                          // exact
    expect(opts[1]).toHaveTextContent("ALIAS");
    expect(opts[1]).not.toHaveTextContent("=");
  });

  it("shows column 2 even when column 1 holds a confident match (user can still open it and choose)", async () => {
    render(<Harness calls={[]} initial={{ ...both, customer_suggestions: [fuzzy(1, "Selvam", 0.99)] }} />);
    await open();
    expect(screen.getAllByTestId("mapped-option")).toHaveLength(2);
    expect(screen.getAllByTestId("fuzzy-option")).toHaveLength(1);
  });

  it("shows only column 2 when column 1 is empty", async () => {
    render(<Harness calls={[]} initial={{ ...both, customer_suggestions: [] }} />);
    await open();
    expect(screen.queryByTestId("col-matches")).toBeNull();
    expect(screen.getAllByTestId("mapped-option")).toHaveLength(2);
  });

  it("keeps the order the server returned (exact first, then score)", async () => {
    render(<Harness calls={[]} initial={both} />);
    await open();
    expect(screen.getAllByTestId("mapped-option").map((o) => o.getAttribute("title"))).toEqual([
      "AI mismatch “Thiru”", "2nd alias “Thiruu”",
    ]);
  });

  it("picking a column-2 item selects the customer and records which mapping row was used (R-12, T-11)", async () => {
    const calls: Calls = [];
    render(<Harness calls={calls} initial={both} />);
    const user = await open();
    await user.click(screen.getAllByTestId("mapped-option")[1]);
    expect(calls.at(-1)).toEqual({
      name: "Anbu", id: 3,
      pick: { mapping_ref: { kind: "alias", id: 4 }, match_source: "alias", matched_customer_name: "Anbu" },
    });
  });

  it("two customers behind the same word are both listed", async () => {
    render(<Harness calls={[]} initial={{
      mapping_suggestions: [mapped({ id: 1, name: "Selvam A", mapping_id: 1 }), mapped({ id: 2, name: "Selvam B", mapping_id: 2 })],
    }} />);
    await open();
    expect(screen.getAllByTestId("mapped-option").map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Selvam A"), expect.stringContaining("Selvam B")]),
    );
  });
});

describe("keyboard", () => {
  const rowInit = {
    customer_suggestions: [fuzzy(1, "Selvam", 0.95), fuzzy(5, "Selva", 0.8)],
    mapping_suggestions: [mapped({ id: 2, name: "Kannan", mapping_id: 9 })],
  };

  it("ArrowDown opens, Enter picks the first item", async () => {
    const calls: Calls = [];
    render(<Harness calls={calls} initial={rowInit} />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    input.focus();
    await user.keyboard("{ArrowDown}");                       // already open on focus; stays open
    await user.keyboard("{Enter}");
    expect(calls.at(-1)?.id).toBe(1);
  });

  it("walks through column 1 and continues into column 2, Escape closes", async () => {
    const calls: Calls = [];
    render(<Harness calls={calls} initial={rowInit} />);
    const user = await open();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");   // index 0 -> 1 -> 2 (first item of column 2)
    await user.keyboard("{Enter}");
    expect(calls.at(-1)).toMatchObject({ id: 2, pick: { mapping_ref: { kind: "ai_mismatch", id: 9 } } });
  });

  it("Escape closes the list", async () => {
    render(<Harness calls={[]} initial={rowInit} />);
    const user = await open();
    expect(screen.getByTestId("customer-dropdown")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("customer-dropdown")).toBeNull();
  });
});

describe("typing (R-11)", () => {
  it("un-assigns the row immediately and refreshes BOTH columns from the server", async () => {
    const calls: Calls = [];
    const fetchSuggestions = vi.fn(async () => [fuzzy(7, "Thirumal", 0.9)]);
    const fetchMappingSuggestions = vi.fn(async () => [mapped({ id: 8, name: "Murugan", mapping_id: 77, matched_word: "Thiru", exact: true, score: 1 })]);
    render(<Harness calls={calls} initial={{ customer_name: "", customer_id: 1 }}
      fetchSuggestions={fetchSuggestions} fetchMappingSuggestions={fetchMappingSuggestions} />);
    const user = await open();
    await user.type(screen.getByRole("textbox"), "Thiru");
    expect(calls.at(-1)).toEqual({ name: "Thiru", id: null, pick: undefined });            // typing clears the customer
    await waitFor(() => expect(screen.getAllByTestId("mapped-option")).toHaveLength(1));
    expect(fetchMappingSuggestions).toHaveBeenLastCalledWith("Thiru", "EDI");
    expect(fetchSuggestions).toHaveBeenLastCalledWith("Thiru", "EDI");
    expect(screen.getByTestId("mapped-option")).toHaveTextContent("Murugan");
    expect(screen.getByTestId("fuzzy-option")).toHaveTextContent("Thirumal");
  });

  it("while typing, column 2 follows the typed text — not the stale extract-time candidates", async () => {
    const fetchMappingSuggestions = vi.fn(async () => [] as MappingCandidate[]);
    render(<Harness calls={[]} initial={{ customer_name: "", mapping_suggestions: [mapped({ name: "Stale Candidate" })] }}
      fetchMappingSuggestions={fetchMappingSuggestions} />);
    const user = await open();
    expect(screen.getByText("Stale Candidate")).toBeInTheDocument();                         // before typing: extract-time list
    await user.type(screen.getByRole("textbox"), "zz");
    await waitFor(() => expect(fetchMappingSuggestions).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Stale Candidate")).toBeNull());
  });

  it("ignores an answer that arrives after a newer keystroke", async () => {
    let release!: (v: MappingCandidate[]) => void;
    const slow = new Promise<MappingCandidate[]>((r) => { release = r; });
    const fetchMappingSuggestions = vi.fn()
      .mockImplementationOnce(() => slow)
      .mockImplementation(async () => [mapped({ name: "Fresh", mapping_id: 2 })]);
    render(<Harness calls={[]} initial={{ customer_name: "" }} fetchMappingSuggestions={fetchMappingSuggestions} />);
    const user = await open();
    const input = screen.getByRole("textbox");
    await user.type(input, "ab");                                    // first request (slow)
    await waitFor(() => expect(fetchMappingSuggestions).toHaveBeenCalledTimes(1));
    await user.type(input, "c");                                     // newer request (fast)
    await waitFor(() => expect(screen.getByText("Fresh")).toBeInTheDocument());
    release([mapped({ name: "Late Stale", mapping_id: 1 })]);        // the slow one finally answers
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("Late Stale")).toBeNull();
    expect(screen.getByText("Fresh")).toBeInTheDocument();
  });

  it("a failing lookup never breaks the dropdown", async () => {
    const fetchMappingSuggestions = vi.fn(async () => { throw new Error("boom"); });
    const fetchSuggestions = vi.fn(async () => [fuzzy(1, "Selvam", 0.9)]);
    render(<Harness calls={[]} initial={{ customer_name: "" }} fetchSuggestions={fetchSuggestions}
      fetchMappingSuggestions={fetchMappingSuggestions} />);
    const user = await open();
    await user.type(screen.getByRole("textbox"), "se");
    await waitFor(() => expect(screen.getByText("Selvam")).toBeInTheDocument());
  });
});
