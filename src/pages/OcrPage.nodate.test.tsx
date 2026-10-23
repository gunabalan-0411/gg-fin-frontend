/**
 * The real OcrPage with only the network layer mocked: a page the AI could not find a date on. ND-01 ... ND-08.
 * It used to leave a BLANK page after "Confirm Dates" (the date was null and the page tried to read it); now the Confirm Dates step asks
 * for the date first, and nothing proceeds to the review stage until there is one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t") }) }));
vi.mock("@/components/CustomerStepOverlay", () => ({ CustomerStepOverlay: () => null }));
vi.mock("@/components/expenses/ExpenseStepPanel", () => ({ ExpenseStepPanel: () => null }));
vi.mock("@/services/api", () => {
  const ok = (data: unknown = {}) => vi.fn().mockResolvedValue({ data });
  return {
    ocrApi: { upload: vi.fn(), getPage: vi.fn(), extract: vi.fn(), submit: vi.fn(), splitCheck: vi.fn() },
    upiApi: { list: vi.fn(), listVpaMappings: vi.fn(), fuzzySuggest: ok({ data: [] }), applyPairings: vi.fn(), gmailSync: vi.fn() },
    driveApi: { status: ok({ connected: false, email: null }) },
    trainingDataApi: { saveOcr: vi.fn(), saveVoice: vi.fn() },
    expensesApi: { create: ok() },
    customersApi: {},
    nameMappingsApi: { get: vi.fn(), check: vi.fn(), save: vi.fn(), remember: vi.fn(), suggest: vi.fn().mockResolvedValue({ data: { candidates: [] } }), resync: vi.fn() },
  };
});

import toast from "react-hot-toast";
import { resetConnectionStatus } from "@/hooks/useConnectionStatus";
import { ocrApi, trainingDataApi, upiApi } from "@/services/api";
import OcrPage from "./OcrPage";

type Fn = ReturnType<typeof vi.fn>;
const ocr = ocrApi as unknown as Record<"upload" | "getPage" | "extract" | "submit" | "splitCheck", Fn>;
const upi = upiApi as unknown as Record<"list" | "listVpaMappings", Fn>;
const training = trainingDataApi as unknown as Record<"saveOcr", Fn>;

const record = (over: Record<string, unknown>) => ({
  collection_date: "17-10-2026", customer_name: "", product_type: "EDI", payment_mode: "CASH", amount: 500, raw_text: "",
  confidence_score: 0.95, page_number: 1, notes: "", customer_suggestions: [], customer_id: null, mapping_suggestions: [],
  match_source: null, mapping_ref: null, matched_customer_name: null, ...over,
});
const ROWS = (date: unknown) => [
  record({ customer_name: "Selvam", customer_id: 1, amount: 500, match_source: "fuzzy", collection_date: date }),
  record({ customer_name: "Kannan", customer_id: 2, amount: 300, match_source: "fuzzy", collection_date: date }),
];

async function extract(records: object[]) {
  ocr.extract.mockResolvedValue({ data: { page_image_b64: "AAAA", records: records.map((r) => ({ ...r })) } });
  const user = userEvent.setup();
  const utils = render(<OcrPage />);
  await user.upload(utils.container.querySelector('input[type="file"]') as HTMLInputElement, new File(["%PDF-1.4"], "page.pdf", { type: "application/pdf" }));
  await user.click(await screen.findByRole("button", { name: /^Extract$/ }));
  await screen.findByRole("button", { name: "Confirm Dates" });
  return { user, ...utils };
}
const confirm = () => screen.getByRole("button", { name: "Confirm Dates" });
const panel = () => screen.getByTestId("date-confirm");
const pick = (el: Element, ymd: string) => fireEvent.change(el, { target: { value: ymd } });
const savePost = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: /Save & Post/ }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetConnectionStatus();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  ocr.upload.mockResolvedValue({ data: { session_id: "s1", total_pages: 1 } });
  ocr.getPage.mockResolvedValue({ data: { page_image_b64: "AAAA" } });
  ocr.submit.mockResolvedValue({ data: { submitted: 2, mapping_usage: 0, principal_added: 0 } });
  ocr.splitCheck.mockResolvedValue({ data: { rows: [] } });
  upi.list.mockResolvedValue({ data: { data: [], total: 0 } });
  upi.listVpaMappings.mockResolvedValue({ data: { data: [] } });
  training.saveOcr.mockResolvedValue({ data: { saved: 2, folder: "fintech/ocr/x", files: [] } });
});

describe("a page with no date (ND-01 ... ND-04)", () => {
  it.each([["null", null], ["empty text", ""], ["not a date", "unknown"], ["impossible date", "31-02-2026"], ["spaces", "   "]])(
    "the date is %s: the Confirm Dates step asks for one and the page does not go blank (ND-01)", async (_name, value) => {
      await extract(ROWS(value));
      expect(within(panel()).getByText("No date found")).toBeInTheDocument();
      expect(within(panel()).getByText(/2 records/)).toBeInTheDocument();
      expect((within(panel()).getByTestId("date-missing") as HTMLInputElement).value).toBe("");
      expect(confirm()).toBeDisabled();
    });

  it.each([["slashes", "17/10/2026", "2026-10-17"], ["yyyy-mm-dd", "2026-10-17", "2026-10-17"], ["2-digit year", "17-10-26", "2026-10-17"], ["single digits", "7-9-2026", "2026-09-07"], ["slashes the other way", "2026/10/17", "2026-10-17"]])(
    "a date written differently (%s) is understood, not treated as missing (ND-09)", async (_name, written, expected) => {
      await extract(ROWS(written));
      expect(screen.queryByText("No date found")).toBeNull();
      expect((panel().querySelector('input[type="date"]') as HTMLInputElement).value).toBe(expected);
      expect(confirm()).toBeEnabled();
    });

  it("the field is missing altogether (ND-01b)", async () => {
    const rows = ROWS("x").map(({ collection_date, ...rest }) => rest);
    await extract(rows);
    expect(within(panel()).getByText("No date found")).toBeInTheDocument();
    expect(confirm()).toBeDisabled();
  });

  it("choosing a date enables Confirm; the records go to the review stage with that date (ND-02)", async () => {
    const { user } = await extract(ROWS(null));
    expect(screen.getByTestId("date-missing-hint")).toHaveTextContent(/Choose the date/);
    pick(within(panel()).getByTestId("date-missing"), "2026-10-17");
    expect(confirm()).toBeEnabled();
    await user.click(confirm());
    await screen.findAllByPlaceholderText("Customer…");
    const dates = (document.querySelectorAll('tbody input[type="date"]') as NodeListOf<HTMLInputElement>);
    expect(dates.length).toBeGreaterThan(0);
    dates.forEach((d) => expect(d.value).toBe("2026-10-17"));
    await savePost(user);
    await waitFor(() => expect(ocr.submit).toHaveBeenCalled());
    expect(ocr.submit.mock.calls[0][0].records.map((r: { collection_date: string }) => r.collection_date)).toEqual(["17-10-2026", "17-10-2026"]);
  });

  it("clearing the chosen date disables Confirm again (ND-03)", async () => {
    await extract(ROWS(null));
    pick(within(panel()).getByTestId("date-missing"), "2026-10-17");
    expect(confirm()).toBeEnabled();
    pick(within(panel()).getByTestId("date-missing"), "");
    expect(confirm()).toBeDisabled();
  });

  it("Cancel leaves the page as it was, with no crash (ND-04)", async () => {
    const { user } = await extract(ROWS(null));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("date-confirm")).toBeNull();
    expect(screen.getByRole("button", { name: /^Extract$/ })).toBeInTheDocument();
  });
});

describe("a page with some dates missing (ND-05, ND-06)", () => {
  const MIXED = () => [
    record({ customer_name: "Selvam", customer_id: 1, amount: 500, match_source: "fuzzy", collection_date: "16-10-2026" }),
    record({ customer_name: "Kannan", customer_id: 2, amount: 300, match_source: "fuzzy", collection_date: null }),
    record({ customer_name: "Anbu", customer_id: 3, amount: 200, match_source: "fuzzy", collection_date: "" }),
  ];

  it("the dated rows keep their date card, the undated rows share ONE 'No date found' card (ND-05)", async () => {
    const { user } = await extract(MIXED());
    expect(within(panel()).getAllByText(/^\d+ records?$/).map((e) => e.textContent)).toEqual(expect.arrayContaining(["1 record", "2 records"]));
    expect(within(panel()).getAllByText("No date found")).toHaveLength(1);
    expect(confirm()).toBeDisabled();
    pick(within(panel()).getByTestId("date-missing"), "2026-10-18");
    await user.click(confirm());
    await screen.findAllByPlaceholderText("Customer…");
    const dates = Array.from(document.querySelectorAll('tbody input[type="date"]') as NodeListOf<HTMLInputElement>).map((d) => d.value);
    expect(dates.filter((d) => d === "2026-10-16")).toHaveLength(1);
    expect(dates.filter((d) => d === "2026-10-18")).toHaveLength(2);
  });

  it("every row dated: nothing changes - no extra card, Confirm is enabled at once (ND-06)", async () => {
    await extract(ROWS("17-10-2026"));
    expect(screen.queryByText("No date found")).toBeNull();
    expect(screen.queryByTestId("date-missing")).toBeNull();
    expect(confirm()).toBeEnabled();
  });
});

describe("a date removed later in the review stage (ND-07)", () => {
  it("does not blank the page; Save & Post says which row needs a date and sends nothing", async () => {
    const { user } = await extract(ROWS("17-10-2026"));
    await user.click(confirm());
    await screen.findAllByPlaceholderText("Customer…");
    const first = document.querySelector('tbody input[type="date"]') as HTMLInputElement;
    pick(first, "");
    expect(screen.getAllByPlaceholderText("Customer…").length).toBe(2);            // still showing
    await savePost(user);
    expect(ocr.submit).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/date/i));
  });
});

describe("on a phone (ND-08)", () => {
  it("the same panel asks for the date", async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("max-width: 767px"), media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    const { user } = await extract(ROWS(null));
    expect(screen.getByText("No date found")).toBeInTheDocument();
    expect(confirm()).toBeDisabled();
    pick(screen.getByTestId("date-missing"), "2026-10-17");
    await user.click(confirm());
    await waitFor(() => expect(screen.queryByText("No date found")).toBeNull());
  });
});
