/**
 * The OCR page while a page is being read: a radar scan over the page image instead of the plain progress bar.   RS-12 … RS-18
 * The real page; only the network layer is mocked, and a canvas is faked (jsdom has none).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t") }) }));
vi.mock("@/components/CustomerStepOverlay", () => ({ CustomerStepOverlay: () => null }));
vi.mock("@/services/api", () => {
  const ok = (data: unknown = {}) => vi.fn().mockResolvedValue({ data });
  return {
    ocrApi: { upload: vi.fn(), getPage: vi.fn(), extract: vi.fn(), submit: vi.fn(), pageInk: vi.fn() },
    upiApi: { list: vi.fn(), listVpaMappings: ok({ data: [] }), fuzzySuggest: ok({ data: [] }), applyPairings: ok({ paired: 0, skipped: [] }), gmailSync: vi.fn() },
    driveApi: { status: ok({ connected: false, email: null }) },
    trainingDataApi: { saveOcr: vi.fn(), saveVoice: vi.fn() },
    expensesApi: { create: ok() },
    customersApi: {},
    nameMappingsApi: { get: vi.fn(), check: vi.fn(), save: vi.fn(), remember: vi.fn(), suggest: vi.fn().mockResolvedValue({ data: { candidates: [] } }), resync: vi.fn() },
  };
});

import { resetConnectionStatus } from "@/hooks/useConnectionStatus";
import { ocrApi, upiApi } from "@/services/api";
import OcrPage from "./OcrPage";

const ocr = ocrApi as unknown as Record<"upload" | "getPage" | "extract" | "submit" | "pageInk", ReturnType<typeof vi.fn>>;
const upi = upiApi as unknown as Record<"list", ReturnType<typeof vi.fn>>;

const INK = { width: 800, height: 1200, mask_png_b64: "AAAA", blobs: [[100, 100, 60, 30], [100, 400, 60, 30]], coverage: 0.05 };
const RECORD = {
  collection_date: "17-10-2026", customer_name: "Selvam", customer_id: 1, product_type: "EDI", payment_mode: "CASH", amount: 500, raw_text: "",
  confidence_score: 0.95, page_number: 1, notes: "", customer_suggestions: [], mapping_suggestions: [], match_source: "fuzzy", mapping_ref: null, matched_customer_name: null,
};

function screenOf(kind: "phone" | "desktop", reducedMotion = false) {
  window.matchMedia = ((q: string) => ({
    matches: (kind === "phone" && q.includes("max-width: 767px")) || (reducedMotion && q.includes("prefers-reduced-motion")),
    media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const fakeCtx = () => {
  const ctx: any = { globalAlpha: 1, fillStyle: "" };
  for (const fn of ["clearRect", "drawImage", "fillRect", "save", "restore", "putImageData"]) ctx[fn] = () => {};
  ctx.createLinearGradient = () => ({ addColorStop: () => {} });
  return ctx;
};

let original: typeof HTMLCanvasElement.prototype.getContext;
let finishExtract: (value?: unknown) => void;
let failExtract: (e: unknown) => void;

beforeEach(() => {
  vi.clearAllMocks();
  resetConnectionStatus();
  screenOf("desktop");
  original = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as any).getContext = () => fakeCtx();
  Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get: () => 300 });
  Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get: () => 450 });
  ocr.upload.mockResolvedValue({ data: { session_id: "s1", total_pages: 1 } });
  ocr.getPage.mockResolvedValue({ data: { page_image_b64: "AAAA" } });
  ocr.pageInk.mockResolvedValue({ data: INK });
  ocr.extract.mockImplementation(() => new Promise((resolve, reject) => {
    finishExtract = () => resolve({ data: { page_image_b64: "AAAA", records: [{ ...RECORD }] } });
    failExtract = reject;
  }));
  upi.list.mockResolvedValue({ data: { data: [], total: 0 } });
});
afterEach(() => {
  (HTMLCanvasElement.prototype as any).getContext = original;
  delete (HTMLCanvasElement.prototype as any).clientWidth;
  delete (HTMLCanvasElement.prototype as any).clientHeight;
});

async function uploadPage() {
  const user = userEvent.setup();
  const utils = render(<OcrPage />);
  await user.upload(utils.container.querySelector('input[type="file"]') as HTMLInputElement, new File(["%PDF-1.4"], "page.pdf", { type: "application/pdf" }));
  await screen.findAllByRole("button", { name: /^Extract$/ });
  return { user, ...utils };
}
const extractButton = () => screen.getAllByRole("button", { name: /^Extract$/ })[0];
const finish = async () => { await act(async () => { finishExtract(); await Promise.resolve(); }); };

describe("asking for the ink", () => {
  it("is requested as soon as the page is on screen — before Extract is pressed", async () => {
    await uploadPage();
    await waitFor(() => expect(ocr.pageInk).toHaveBeenCalledWith("s1", 0));
    expect(ocr.pageInk).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("scan-overlay")).toBeNull();                      // nothing scans until the reading starts
  });
});

describe("while the page is being read (desktop)", () => {
  it("the scan overlay covers the page image and replaces the progress bar with a short caption", async () => {
    const { user } = await uploadPage();
    await waitFor(() => expect(ocr.pageInk).toHaveBeenCalled());
    await user.click(extractButton());
    const overlay = await screen.findByTestId("scan-overlay");
    const image = screen.getAllByAltText("Page 1")[0];
    expect(overlay.parentElement).toBe(image.parentElement);                        // laid over the image, in the same box
    expect(await screen.findByTestId("scan-caption")).toHaveTextContent("Scanning your page");
    expect(screen.queryByTestId("progress-bar")).toBeNull();                          // no bar, no percentage
    expect(screen.getByText(/reading…/)).toBeInTheDocument();                       // the status text with the elapsed time stays
  });

  it("when the records arrive the overlay fades away on its own, the records show and nothing is delayed", async () => {
    const { user } = await uploadPage();
    await waitFor(() => expect(ocr.pageInk).toHaveBeenCalled());
    await user.click(extractButton());
    await screen.findByTestId("scan-overlay");
    await finish();
    await user.click(await screen.findByRole("button", { name: "Confirm Dates" }));      // the records are there straight away
    await waitFor(() => expect(screen.queryByTestId("scan-overlay")).toBeNull(), { timeout: 3000 });
    expect(screen.queryByTestId("scan-caption")).toBeNull();
    expect(await screen.findAllByPlaceholderText("Customer…")).not.toHaveLength(0);
  });

  it("a failed reading stops the scan too", async () => {
    const { user } = await uploadPage();
    await waitFor(() => expect(ocr.pageInk).toHaveBeenCalled());
    await user.click(extractButton());
    await screen.findByTestId("scan-overlay");
    await act(async () => { failExtract({ response: { data: { detail: "model busy" } } }); await Promise.resolve(); });
    await waitFor(() => expect(screen.queryByTestId("scan-overlay")).toBeNull(), { timeout: 3000 });
  });

  it("reading the same page again scans again", async () => {
    const { user } = await uploadPage();
    await waitFor(() => expect(ocr.pageInk).toHaveBeenCalled());
    await user.click(extractButton());
    await screen.findByTestId("scan-overlay");
    await finish();
    await user.click(await screen.findByRole("button", { name: "Confirm Dates" }));
    await waitFor(() => expect(screen.queryByTestId("scan-overlay")).toBeNull(), { timeout: 3000 });
    await user.click(extractButton());
    expect(await screen.findByTestId("scan-overlay")).toBeInTheDocument();
  });
});

describe("when the scan cannot be shown, the plain progress bar stays (RS-15)", () => {
  it("the ink could not be found (server error): bar and percentage, no overlay", async () => {
    ocr.pageInk.mockRejectedValue(new Error("500"));
    const { user } = await uploadPage();
    await waitFor(() => expect(ocr.pageInk).toHaveBeenCalled());
    await user.click(extractButton());
    expect(await screen.findByTestId("progress-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("scan-overlay")).toBeNull();
    expect(screen.queryByTestId("scan-caption")).toBeNull();
  });

  it("the user asked for reduced motion: the bar, no moving scan", async () => {
    screenOf("desktop", true);
    const { user } = await uploadPage();
    await user.click(extractButton());
    expect(await screen.findByTestId("progress-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("scan-overlay")).toBeNull();
  });

  it("the reading finishing before the ink arrived: no scan starts late", async () => {
    let resolveInk!: (v: unknown) => void;
    ocr.pageInk.mockImplementation(() => new Promise((r) => { resolveInk = r; }));
    const { user } = await uploadPage();
    await user.click(extractButton());
    expect(await screen.findByTestId("progress-bar")).toBeInTheDocument();           // the bar while waiting for the ink
    await finish();
    await user.click(await screen.findByRole("button", { name: "Confirm Dates" }));
    await act(async () => { resolveInk({ data: INK }); await Promise.resolve(); });
    expect(screen.queryByTestId("scan-overlay")).toBeNull();
  });
});

describe("on a phone (RS-16)", () => {
  beforeEach(() => screenOf("phone"));

  it("the page image on the image tab is scanned, and the Records tab shows a small scanning preview card instead of nothing", async () => {
    const { user } = await uploadPage();
    await waitFor(() => expect(ocr.pageInk).toHaveBeenCalled());
    await user.click(extractButton());
    expect(await screen.findByTestId("scan-overlay")).toBeInTheDocument();          // over the image on the image tab
    await user.click(screen.getByRole("button", { name: /Records/ }));
    const card = await screen.findByTestId("scan-preview-card");
    expect(within(card).getByText("Reading your page…")).toBeInTheDocument();
    expect(within(card).getByTestId("scan-overlay")).toBeInTheDocument();           // the same scan, small, inside the card
    expect(within(card).getByAltText("Page 1")).toBeInTheDocument();
    await finish();
    await waitFor(() => expect(screen.queryByTestId("scan-preview-card")).toBeNull(), { timeout: 3000 });
  });
});
