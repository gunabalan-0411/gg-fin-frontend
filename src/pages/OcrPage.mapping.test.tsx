/**
 * Integration test of the real OcrPage with only the network layer mocked:
 * upload -> extract -> confirm dates -> rows (dropdown column 2, edit icon, badge, Remember chip) -> Submit payload.
 * Covers FE-03, FE-04, FE-05, FE-07, FE-08, FE-09 and R-09 … R-13, R-18, R-30 end to end in the browser layer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t") }) }));
vi.mock("@/components/CustomerStepOverlay", () => ({ CustomerStepOverlay: () => null }));
vi.mock("@/services/api", () => {
  const ok = (data: unknown = {}) => vi.fn().mockResolvedValue({ data });
  return {
    ocrApi: { upload: vi.fn(), getPage: vi.fn(), extract: vi.fn(), submit: vi.fn() },
    upiApi: { list: ok({ data: [] }), fuzzySuggest: ok({ data: [] }), applyPairings: ok({ paired: 0, skipped: [] }), gmailSync: ok({ imported: 0, skipped: 0, total_found: 0 }) },
    driveApi: { status: ok({ connected: true, email: "owner@example.com" }) },
    trainingDataApi: { saveOcr: ok({ saved: 1, folder: "fintech/ocr/x", files: [] }), saveVoice: ok() },
    expensesApi: { create: ok() },
    customersApi: {},
    nameMappingsApi: { get: vi.fn(), check: vi.fn(), save: vi.fn(), remember: vi.fn(), suggest: vi.fn(), resync: vi.fn() },
  };
});

import toast from "react-hot-toast";
import { nameMappingsApi, ocrApi, upiApi } from "@/services/api";
import OcrPage from "./OcrPage";

const ocr = ocrApi as unknown as Record<"upload" | "getPage" | "extract" | "submit", ReturnType<typeof vi.fn>>;
const nm = nameMappingsApi as unknown as Record<"get" | "check" | "save" | "remember" | "suggest", ReturnType<typeof vi.fn>>;
const upi = upiApi as unknown as Record<"list" | "fuzzySuggest", ReturnType<typeof vi.fn>>;

const mappedCand = (over: object = {}) => ({
  id: 2, name: "Kannan", score: 1, source: "ai_mismatch", mapping_id: 9, matched_word: "Thirumalay", exact: true,
  use_count: 0, also: [], ...over,
});

const record = (over: Record<string, unknown>) => ({
  collection_date: "01-10-2026", customer_name: "", product_type: "EDI", payment_mode: "CASH", online_marker: null,
  amount: 500, raw_text: "", confidence_score: 0.95, page_number: 1, notes: "",
  customer_suggestions: [], customer_id: null, mapping_suggestions: [], match_source: null, mapping_ref: null,
  matched_customer_name: null, ...over,
});

const RECORDS = [
  // A: low fuzzy, matched through an AI-mismatch word
  record({
    customer_name: "Thirumalay", customer_id: 2, match_source: "ai_mismatch", matched_customer_name: "Kannan",
    mapping_ref: { kind: "ai_mismatch", id: 9 }, mapping_suggestions: [mappedCand()],
    customer_suggestions: [{ id: 1, name: "Selvam", score: 0.3 }],
  }),
  // B: confident fuzzy match, column 2 still offers someone else
  record({
    customer_name: "Selvm", customer_id: 1, match_source: "fuzzy",
    customer_suggestions: [{ id: 1, name: "Selvam", score: 0.95 }, { id: 2, name: "Kannan", score: 0.5 }],
    mapping_suggestions: [mappedCand({ mapping_id: 11, matched_word: "Selvm", exact: true })],
  }),
  // C: nothing matched; column 1 and column 2 both have candidates
  record({
    customer_name: "Qwerty", customer_id: null,
    customer_suggestions: [{ id: 2, name: "Kannan", score: 0.6 }],
    mapping_suggestions: [mappedCand({ id: 3, name: "Anbu", source: "alias", mapping_id: 4, matched_word: "Qwertu", exact: false, score: 0.8 })],
  }),
];

async function reachReviewStep() {
  const user = userEvent.setup();
  const { container } = render(<OcrPage />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File(["%PDF-1.4"], "page.pdf", { type: "application/pdf" }));
  await user.click(await screen.findByRole("button", { name: /^Extract$/ }));
  await user.click(await screen.findByRole("button", { name: "Confirm Dates" }));
  await screen.findAllByTestId("mapping-edit");
  return { user, container };
}

const customerInputs = () => screen.getAllByPlaceholderText("Customer…") as HTMLInputElement[];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  ocr.upload.mockResolvedValue({ data: { session_id: "s1", total_pages: 1 } });
  ocr.getPage.mockResolvedValue({ data: { page_image_b64: "AAAA" } });
  ocr.extract.mockResolvedValue({ data: { page_image_b64: "AAAA", records: RECORDS.map((r) => ({ ...r })) } });
  ocr.submit.mockResolvedValue({ data: { submitted: 2, mapping_usage: 1 } });
  nm.get.mockResolvedValue({ data: { customer: { id: 1, name: "Selvam", finance_type: "EDI" }, aliases: [], mismatches: [], limits: { alias: 3, ai_mismatch: 10 } } });
  nm.check.mockResolvedValue({ data: { conflicts: [] } });
  nm.suggest.mockResolvedValue({ data: { candidates: [] } });
});

describe("extracted rows (FE-03, FE-05, FE-09)", () => {
  it("shows an edit icon on every row — enabled once a customer is assigned (R-13)", async () => {
    await reachReviewStep();
    const icons = screen.getAllByTestId("mapping-edit");
    expect(icons).toHaveLength(3);
    expect(icons[0]).toBeEnabled();      // A: assigned through AI mismatch
    expect(icons[1]).toBeEnabled();      // B: assigned by fuzzy
    expect(icons[2]).toBeDisabled();     // C: no customer yet
  });

  it("marks a row that was matched through a mapping, and does not for plain fuzzy matches", async () => {
    await reachReviewStep();
    const badges = screen.getAllByTestId("match-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("AI");
  });

  it("the extracted text stays in the box (the customer is shown by id), nothing is overwritten", async () => {
    await reachReviewStep();
    expect(customerInputs().map((i) => i.value)).toEqual(["Thirumalay", "Selvm", "Qwerty"]);
  });

  it("warns visibly when the server could not read the mapping tables", async () => {
    ocr.extract.mockResolvedValue({ data: { page_image_b64: "AAAA", records: RECORDS, mapping_warning: "Alias / AI-mismatch matching is unavailable: X" } });
    await reachReviewStep();
    expect(toast).toHaveBeenCalledWith("Alias / AI-mismatch matching is unavailable: X", expect.anything());
  });
});

describe("dropdown (FE-04, R-09 … R-12)", () => {
  it("shows column 1 and column 2 for the row the user opens — even for a confident match", async () => {
    const { user } = await reachReviewStep();
    await user.click(customerInputs()[1]);                       // row B: confident fuzzy match
    const dd = await screen.findByTestId("customer-dropdown");
    expect(within(dd).getAllByTestId("fuzzy-option").map((o) => o.textContent)).toEqual(["Selvam95", "Kannan50"]);
    const mapped = within(dd).getAllByTestId("mapped-option");
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toHaveTextContent("Kannan");
    expect(mapped[0]).toHaveTextContent("via “Selvm”");
  });

  it("picking from column 2 assigns that customer and shows it matched through the mapping (R-12)", async () => {
    const { user } = await reachReviewStep();
    await user.click(customerInputs()[2]);                       // row C
    const dd = await screen.findByTestId("customer-dropdown");
    await user.click(within(dd).getByTestId("mapped-option"));
    await waitFor(() => expect(screen.getAllByTestId("match-badge")).toHaveLength(2));
    expect(screen.getAllByTestId("mapping-edit")[2]).toBeEnabled();
    expect(customerInputs()[2].value).toBe("Anbu");
  });

  it("typing refreshes column 2 from the server for the row's finance type (R-11)", async () => {
    nm.suggest.mockResolvedValue({ data: { candidates: [mappedCand({ id: 8, name: "Live Result", mapping_id: 70 })] } });
    const { user } = await reachReviewStep();
    await user.click(customerInputs()[2]);
    await user.type(customerInputs()[2], "x");
    await waitFor(() => expect(nm.suggest).toHaveBeenCalledWith("EDI", "Qwertyx"));
    expect(await screen.findByText("Live Result")).toBeInTheDocument();
  });
});

describe("popup from the row icon (FE-05, FE-06)", () => {
  it("opens for the row's customer with the extracted text", async () => {
    const { user } = await reachReviewStep();
    await user.click(screen.getAllByTestId("mapping-edit")[1]);
    expect(await screen.findByText("Alias & AI-mismatch names")).toBeInTheDocument();
    expect(nm.get).toHaveBeenCalledWith("EDI", 1);
    expect(await screen.findByText(/Extracted text:/)).toHaveTextContent("“Selvm”");
  });
});

describe("Remember this (FE-07, R-18)", () => {
  async function pickKannanForRowC(user: ReturnType<typeof userEvent.setup>) {
    await user.click(customerInputs()[2]);
    const dd = await screen.findByTestId("customer-dropdown");
    await user.click(within(dd).getByText("Kannan"));            // column 1 pick -> differs from the OCR text "Qwerty"
  }

  it("offers the chip after picking a different customer, and saves it as an AI-mismatch name", async () => {
    nm.remember.mockResolvedValue({ data: { status: "added", word: "Qwerty" } });
    const { user } = await reachReviewStep();
    expect(screen.queryByTestId("remember-chip")).toBeNull();     // nothing offered for untouched rows
    await pickKannanForRowC(user);
    const chip = await screen.findByTestId("remember-chip");
    expect(chip).toHaveTextContent("Save “Qwerty” as an AI-mismatch name for Kannan?");
    await user.click(within(chip).getByRole("button", { name: "Remember “Qwerty” as an AI-mismatch name" }));
    await waitFor(() => expect(nm.remember).toHaveBeenCalledWith({ finance_type: "EDI", customer_id: 2, word: "Qwerty" }));
    await waitFor(() => expect(screen.queryByTestId("remember-chip")).toBeNull());
    expect(toast.success).toHaveBeenCalledWith("Remembered “Qwerty”");
  });

  it("at the limit it opens the popup instead of saving silently", async () => {
    nm.remember.mockResolvedValue({ data: { status: "limit_reached", word: "Qwerty", limit: 10 } });
    nm.get.mockResolvedValue({ data: { customer: { id: 2, name: "Kannan", finance_type: "EDI" }, aliases: [], mismatches: [], limits: { alias: 3, ai_mismatch: 10 } } });
    const { user } = await reachReviewStep();
    await pickKannanForRowC(user);
    await user.click(within(await screen.findByTestId("remember-chip")).getByRole("button", { name: /^Remember/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("already has 10 AI-mismatch names");
  });

  it("on a conflict it opens the popup with the word added and the choices shown", async () => {
    nm.remember.mockResolvedValue({ data: { status: "conflict", word: "Qwerty", conflicts: [] } });
    nm.get.mockResolvedValue({ data: { customer: { id: 2, name: "Kannan", finance_type: "EDI" }, aliases: [], mismatches: [], limits: { alias: 3, ai_mismatch: 10 } } });
    nm.check.mockResolvedValue({ data: { conflicts: [{ kind: "ai_mismatch", word: "Qwerty", customers: [{ mapping_id: 5, customer_id: 9, customer_name: "Beta" }] }] } });
    const { user } = await reachReviewStep();
    await pickKannanForRowC(user);
    await user.click(within(await screen.findByTestId("remember-chip")).getByRole("button", { name: /^Remember/ }));
    expect(await screen.findByTestId("conflict")).toHaveTextContent("Beta");
  });

  it("can be dismissed", async () => {
    const { user } = await reachReviewStep();
    await pickKannanForRowC(user);
    await user.click(await screen.findByLabelText("Dismiss"));
    expect(screen.queryByTestId("remember-chip")).toBeNull();
    expect(nm.remember).not.toHaveBeenCalled();
  });

  it("is not offered when the picked customer's name equals the OCR text", async () => {
    const { user } = await reachReviewStep();
    await user.click(customerInputs()[1]);                       // row B: OCR text "Selvm"
    const dd = await screen.findByTestId("customer-dropdown");
    await user.click(within(dd).getByText("Selvam"));            // pick "Selvam" — differs from "Selvm" -> offered
    const chip = await screen.findByTestId("remember-chip");
    expect(chip).toHaveTextContent("Save “Selvm” as an AI-mismatch name for Selvam?");
  });
});

describe("EDI / IOP toggle resets everything customer-related", () => {
  it("clears the customer, the badge, the mapping reference and the icon", async () => {
    const { user } = await reachReviewStep();
    expect(screen.getAllByTestId("match-badge")).toHaveLength(1);
    await user.click(screen.getAllByText("EDI")[0]);              // row A's product button
    await waitFor(() => expect(screen.queryByTestId("match-badge")).toBeNull());
    expect(customerInputs()[0].value).toBe("");
    expect(screen.getAllByTestId("mapping-edit")[0]).toBeDisabled();
  });
});

describe("suggestions while typing (score scale)", () => {
  // /api/upi/fuzzy-suggest returns scores on a 0-100 scale (UpiPage relies on that); the dropdown pill shows round(score x 100)
  // of a 0-1 value, so the page must divide by 100. Before the fix a 95 showed up as "9500".
  const live = (rows: object[]) => upi.fuzzySuggest.mockResolvedValue({ data: { data: rows } });

  it("shows the endpoint's 0-100 score as a normal percentage", async () => {
    live([
      { customer_id: 1, customer_name: "Selvam", type: "edi", score: 95, balance: 1000 },
      { customer_id: 2, customer_name: "Kannan", type: "edi", score: 62, balance: 500 },
    ]);
    const { user } = await reachReviewStep();
    await user.click(customerInputs()[2]);
    await user.type(customerInputs()[2], "x");                                       // live lookup (debounced)
    await waitFor(() => expect(upi.fuzzySuggest).toHaveBeenCalledWith("Qwertyx"));
    await waitFor(() =>
      expect(within(screen.getByTestId("customer-dropdown")).getAllByTestId("fuzzy-option").map((o) => o.textContent))
        .toEqual(["Selvam95", "Kannan62"]));
  });

  it("colours the pill by the real score (green >= 90, amber >= 75, red below), like the extract-time list", async () => {
    live([
      { customer_id: 1, customer_name: "Strong", type: "edi", score: 95, balance: 1 },
      { customer_id: 2, customer_name: "Middling", type: "edi", score: 80, balance: 1 },
      { customer_id: 3, customer_name: "Weak", type: "edi", score: 40, balance: 1 },
    ]);
    const { user } = await reachReviewStep();
    await user.click(customerInputs()[2]);
    await user.type(customerInputs()[2], "x");
    await waitFor(() => expect(screen.getAllByTestId("fuzzy-option")).toHaveLength(3));
    const pill = (name: string) => within(screen.getByText(name).closest("button") as HTMLElement).getByText(/^\d+$/);
    expect(pill("Strong").className).toMatch(/green/);
    expect(pill("Middling").className).toMatch(/amber/);
    expect(pill("Weak").className).toMatch(/red/);                                    // before the fix every typed result was green
  });

  it("still filters to the row's product and to customers with a balance, and keeps the 80% fallback for a missing score", async () => {
    live([
      { customer_id: 1, customer_name: "Edi With Balance", type: "edi", score: 90, balance: 10 },
      { customer_id: 2, customer_name: "Edi No Balance", type: "edi", score: 99, balance: 0 },
      { customer_id: 11, customer_name: "Iop Customer", type: "iop", score: 99, balance: 10 },
      { customer_id: 3, customer_name: "No Score", type: "edi", balance: 10 },
    ]);
    const { user } = await reachReviewStep();
    await user.click(customerInputs()[2]);
    await user.type(customerInputs()[2], "x");
    await waitFor(() =>
      expect(screen.getAllByTestId("fuzzy-option").map((o) => o.textContent)).toEqual(["Edi With Balance90", "No Score80"]));
  });
});

describe("Submit (FE-08, R-30)", () => {
  it("sends the mapping reference of rows matched through a mapping — and only those", async () => {
    const { user } = await reachReviewStep();
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(ocr.submit).toHaveBeenCalledTimes(1));
    const records = ocr.submit.mock.calls[0][0].records as Record<string, unknown>[];
    expect(records).toHaveLength(2);                                                   // C has no customer: not sent
    expect(records[0]).toMatchObject({ customer_id: 2, mapping_ref: { kind: "ai_mismatch", id: 9 } });
    expect(records[1]).toMatchObject({ customer_id: 1 });
    expect(records[1].mapping_ref).toBeUndefined();                                    // plain fuzzy match: nothing to count
  });

  it("includes the reference when the user picked a column-2 candidate by hand", async () => {
    const { user } = await reachReviewStep();
    await user.click(customerInputs()[2]);
    await user.click(within(await screen.findByTestId("customer-dropdown")).getByTestId("mapped-option"));
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(ocr.submit).toHaveBeenCalled());
    const records = ocr.submit.mock.calls[0][0].records as Record<string, unknown>[];
    expect(records).toHaveLength(3);
    expect(records[2]).toMatchObject({ customer_id: 3, mapping_ref: { kind: "alias", id: 4 } });
  });

  it("drops the reference when the user later changes the customer by hand", async () => {
    const { user } = await reachReviewStep();
    await user.click(customerInputs()[0]);
    const dd = await screen.findByTestId("customer-dropdown");
    await user.click(within(dd).getByText("Selvam"));                                  // row A: switch to a fuzzy suggestion
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(ocr.submit).toHaveBeenCalled());
    const records = ocr.submit.mock.calls[0][0].records as Record<string, unknown>[];
    expect(records[0]).toMatchObject({ customer_id: 1 });
    expect(records[0].mapping_ref).toBeUndefined();
  });
});
