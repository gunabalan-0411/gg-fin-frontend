/**
 * The OCR page's MOBILE layout (cards in the Records tab): the UPI highlight, pairing, continue button and the
 * training toggle behave the same as on desktop (UP-02, UP-04, UP-07, TD-05).
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
    upiApi: { list: vi.fn(), fuzzySuggest: ok({ data: [] }), applyPairings: ok({ paired: 1, skipped: [] }), gmailSync: vi.fn() },
    driveApi: { status: ok({ connected: false, email: null }) },
    trainingDataApi: { saveOcr: vi.fn(), saveVoice: vi.fn() },
    expensesApi: { create: ok() },
    customersApi: {},
    nameMappingsApi: { get: vi.fn(), check: vi.fn(), save: vi.fn(), remember: vi.fn(), suggest: vi.fn().mockResolvedValue({ data: { candidates: [] } }), resync: vi.fn() },
  };
});

import { resetConnectionStatus } from "@/hooks/useConnectionStatus";
import { ocrApi, trainingDataApi, upiApi } from "@/services/api";
import OcrPage from "./OcrPage";

const ocr = ocrApi as unknown as Record<"upload" | "getPage" | "extract" | "submit", ReturnType<typeof vi.fn>>;
const upi = upiApi as unknown as Record<"list", ReturnType<typeof vi.fn>>;
const training = trainingDataApi as unknown as Record<"saveOcr", ReturnType<typeof vi.fn>>;

const record = (over: Record<string, unknown>) => ({
  collection_date: "17-10-2026", customer_name: "", product_type: "EDI", payment_mode: "CASH", amount: 500, raw_text: "",
  confidence_score: 0.95, page_number: 1, notes: "", customer_suggestions: [], customer_id: null, mapping_suggestions: [],
  match_source: null, mapping_ref: null, matched_customer_name: null, ...over,
});
const txn = (id: number, over: Record<string, unknown> = {}) => ({
  id, upi_ref_no: `ref${id}`, amount: "100", transaction_type: "credit", sender_vpa: `p${id}@upi`, sender_name: `PAYER ${id}`, notes: null,
  transaction_date: "2026-10-17", mapped_customer_id: null, mapped_customer_type: null, mapped_customer_name: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetConnectionStatus();
  // a phone-sized screen: only the "max-width: 767px" query matches
  window.matchMedia = ((q: string) => ({
    matches: q.includes("max-width: 767px"), media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  ocr.upload.mockResolvedValue({ data: { session_id: "s1", total_pages: 1 } });
  ocr.getPage.mockResolvedValue({ data: { page_image_b64: "AAAA" } });
  ocr.extract.mockResolvedValue({ data: { page_image_b64: "AAAA", records: [record({ customer_name: "Selvam", customer_id: 1, match_source: "fuzzy" })] } });
  ocr.submit.mockResolvedValue({ data: { submitted: 1, mapping_usage: 0 } });
  upi.list.mockResolvedValue({ data: { data: [txn(10, { amount: "500", sender_name: "SELVAM K" }), txn(11, { amount: "200", sender_name: "OTHER" })], total: 2 } });
  training.saveOcr.mockResolvedValue({ data: { saved: 1, folder: "fintech/ocr/x", files: [] } });
});

async function reachRecords() {
  const user = userEvent.setup();
  const { container } = render(<OcrPage />);
  await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(["%PDF-1.4"], "page.pdf", { type: "application/pdf" }));
  await user.click(await screen.findByRole("button", { name: /^Extract$/ }));
  await user.click(await screen.findByRole("button", { name: "Confirm Dates" }));
  await screen.findAllByTestId("upi-item");
  return user;
}

describe("OCR page on a phone", () => {
  it("highlights the UPI cards when a customer is marked online, with the banner, tag and Continue button", async () => {
    const user = await reachRecords();
    expect(screen.getAllByTestId("upi-item")[0].className).toMatch(/rounded-xl/);          // mobile cards
    expect(screen.getByTestId("upi-continue")).toHaveTextContent("Skip remaining (2) & continue");
    expect(screen.queryByTestId("upi-target-banner")).toBeNull();

    await user.click(screen.getByText("CASH"));                                             // the card's mode button -> ONLINE
    expect(screen.getByTestId("upi-target-banner")).toHaveTextContent(/Selvam\s*·\s*₹500/);
    expect(screen.getAllByTestId("upi-ants")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Use the payment from SELVAM K/ })).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Use the payment from SELVAM K/ })).getByTestId("upi-match-tag")).toHaveTextContent("Name & amount match");
    expect(screen.getByTestId("upi-waiting")).toHaveTextContent("Picking UPI…");
  });

  it("picking pairs it (struck + customer shown + Undo), and there is no strike-out icon", async () => {
    const user = await reachRecords();
    await user.click(screen.getByText("CASH"));
    await user.click(screen.getByRole("button", { name: /Use the payment from SELVAM K/ }));
    const paired = screen.getAllByTestId("upi-item").find((el) => el.getAttribute("data-state") === "paired")!;
    expect(within(paired).getByText("Selvam")).toBeInTheDocument();
    expect(within(paired).getByRole("button", { name: /Undo/ })).toBeInTheDocument();
    expect(document.querySelector(".lucide-strikethrough")).toBeNull();
    expect(screen.getByTestId("upi-continue")).toHaveTextContent("Skip remaining (1) & continue");
    expect(screen.queryByTestId("upi-target-banner")).toBeNull();
  });

  it("does not move on by itself; Continue does", async () => {
    const user = await reachRecords();
    await new Promise((r) => setTimeout(r, 700));
    expect(screen.queryByText("Daily Expenses")).toBeNull();
    await user.click(screen.getByTestId("upi-continue"));
    expect(await screen.findByText("Daily Expenses")).toBeInTheDocument();
  });

  it("has the training toggle (ON by default) with a Drive warning when Drive is not connected, and OFF sends nothing", async () => {
    const user = await reachRecords();
    const sw = screen.getByRole("switch", { name: "Save data for training" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByTestId("training-drive-warning")).toHaveTextContent(/Drive not connected/);

    await user.click(sw);
    expect(screen.queryByTestId("training-drive-warning")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Submit/ }));
    await waitFor(() => expect(ocr.submit).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(training.saveOcr).not.toHaveBeenCalled();
  });

  it("with the toggle ON the page image + table are sent after the records", async () => {
    const user = await reachRecords();
    await user.click(screen.getByRole("button", { name: /^Submit/ }));
    await waitFor(() => expect(training.saveOcr).toHaveBeenCalledTimes(1));
    expect(JSON.parse((training.saveOcr.mock.calls[0][0] as FormData).get("rows") as string)).toEqual([
      { customer: "Selvam", date: "17-10-2026", amount: 500, type: "EDI", mode: "CASH", raw_text: "Selvam", source_file: "", origin: "matched" },
    ]);
  });
});
