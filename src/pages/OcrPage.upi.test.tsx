/**
 * The real OcrPage with only the network layer mocked: the UPI step (highlight, tags, pairing, same-day add, undo,
 * remap confirm, continue button, no auto-advance) and what Submit sends (UPI pairings + training data).
 * Covers UP-01 … UP-10, TD-01, TD-05, TD-08 (OCR side).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t") }) }));
// the real overlay is a customer-management screen; here it is just a button that finishes step 6
vi.mock("@/components/CustomerStepOverlay", () => ({
  CustomerStepOverlay: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Customers done</button>,
}));
vi.mock("@/services/api", () => {
  const ok = (data: unknown = {}) => vi.fn().mockResolvedValue({ data });
  return {
    ocrApi: { upload: vi.fn(), getPage: vi.fn(), extract: vi.fn(), submit: vi.fn() },
    upiApi: { list: vi.fn(), listVpaMappings: vi.fn(), fuzzySuggest: ok({ data: [] }), applyPairings: vi.fn(), gmailSync: vi.fn() },
    driveApi: { status: ok({ connected: true, email: "owner@example.com" }) },
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

const ocr = ocrApi as unknown as Record<"upload" | "getPage" | "extract" | "submit", ReturnType<typeof vi.fn>>;
const upi = upiApi as unknown as Record<"list" | "listVpaMappings" | "applyPairings" | "gmailSync", ReturnType<typeof vi.fn>>;
const training = trainingDataApi as unknown as Record<"saveOcr", ReturnType<typeof vi.fn>>;

const record = (over: Record<string, unknown>) => ({
  collection_date: "17-10-2026", customer_name: "", product_type: "EDI", payment_mode: "CASH", amount: 500, raw_text: "",
  confidence_score: 0.95, page_number: 1, notes: "", customer_suggestions: [], customer_id: null, mapping_suggestions: [],
  match_source: null, mapping_ref: null, matched_customer_name: null, ...over,
});
const RECORDS = [
  record({ customer_name: "Selvam", customer_id: 1, match_source: "fuzzy", amount: 500 }),                              // row 0: cash
  record({ customer_name: "Kannan", customer_id: 2, match_source: "fuzzy", amount: 300, payment_mode: "ONLINE" }),      // row 1: read as ONLINE by the OCR
  record({ customer_name: "Anbu", customer_id: 3, match_source: "fuzzy", amount: 200, collection_date: "18-10-2026" }), // row 2: cash, another day
];

const txn = (id: number, over: Record<string, unknown> = {}) => ({
  id, upi_ref_no: `ref${id}`, amount: "100", transaction_type: "credit", sender_vpa: `p${id}@upi`, sender_name: `PAYER ${id}`, notes: null,
  transaction_date: "2026-10-17", mapped_customer_id: null, mapped_customer_type: null, mapped_customer_name: null, ...over,
});
const TXNS = [
  txn(10, { amount: "500", sender_name: "SELVAM K", sender_vpa: "selvam@upi" }),                                       // matches row 0 by name AND amount
  txn(11, { amount: "200", sender_name: "SOMEONE ELSE", sender_vpa: "x@upi" }),
  txn(12, { amount: "300", sender_name: "KANNAN R", sender_vpa: "kannan@upi", mapped_customer_id: 2, mapped_customer_type: "edi", mapped_customer_name: "Kannan" }),
  txn(13, { amount: "150", sender_name: "ZZ", sender_vpa: "zz@upi", mapped_customer_id: 9, mapped_customer_type: "edi", mapped_customer_name: "Old Owner" }),
  txn(14, { amount: "100", sender_name: "PAYER 14", sender_vpa: "p14@upi" }),
];

async function reachUpiStep(txns: unknown[] = TXNS, records: unknown[] = RECORDS) {
  upi.list.mockResolvedValue({ data: { data: txns, total: txns.length } });
  ocr.extract.mockResolvedValue({ data: { page_image_b64: "AAAA", records: (records as object[]).map((r) => ({ ...r })) } });
  const user = userEvent.setup();
  const utils = render(<OcrPage />);
  await user.upload(utils.container.querySelector('input[type="file"]') as HTMLInputElement, new File(["%PDF-1.4"], "page.pdf", { type: "application/pdf" }));
  await user.click(await screen.findByRole("button", { name: /^Extract$/ }));
  await user.click(await screen.findByRole("button", { name: "Confirm Dates" }));
  if (txns.length) await screen.findAllByTestId("upi-item");
  await screen.findAllByPlaceholderText("Customer…");
  return { user, ...utils };
}

const customerInputs = () => screen.getAllByPlaceholderText("Customer…") as HTMLInputElement[];
const rowEl = (i: number) => customerInputs()[i].closest("tr") as HTMLElement;
const amountOf = (i: number) => (within(rowEl(i)).getByRole("spinbutton") as HTMLInputElement).value;
const item = (id: number) => document.querySelector(`[data-upi-id="${id}"]`) as HTMLElement;
const states = () => screen.getAllByTestId("upi-item").map((el) => el.getAttribute("data-state"));
const markOnline = async (user: ReturnType<typeof userEvent.setup>, rowIndex: number) =>
  user.click(within(rowEl(rowIndex)).getByText("CSH"));
const pick = async (user: ReturnType<typeof userEvent.setup>, sender: string | RegExp) =>
  user.click(screen.getByRole("button", { name: typeof sender === "string" ? new RegExp(`Use the payment from ${sender}`) : sender }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetConnectionStatus();
  ocr.upload.mockResolvedValue({ data: { session_id: "s1", total_pages: 1 } });
  ocr.getPage.mockResolvedValue({ data: { page_image_b64: "AAAA" } });
  ocr.submit.mockResolvedValue({ data: { submitted: 3, mapping_usage: 0 } });
  upi.listVpaMappings.mockResolvedValue({ data: { data: [] } });
  upi.applyPairings.mockResolvedValue({ data: { paired: 1, created: 1, replaced: 0, unchanged: 0, stamped: 1, skipped: [] } });
  training.saveOcr.mockResolvedValue({ data: { saved: 3, folder: "fintech/ocr/2026-10-17", files: [] } });
});

// ── no strike icon, no highlight until a customer is marked online ────────────

describe("the UPI list (UP-01)", () => {
  it("has no strike-out icon, and nothing is highlighted at first", async () => {
    const { container } = await reachUpiStep();
    expect(container.querySelector(".lucide-strikethrough")).toBeNull();
    expect(states().every((s) => s === "idle")).toBe(true);
    expect(screen.queryByTestId("upi-target-banner")).toBeNull();
  });
});

describe("marking a customer paid online starts the highlight (UP-02, UP-03, UP-10)", () => {
  it("every unpaired transaction gets the dotted outline, with a text saying how it matches the row", async () => {
    const { user } = await reachUpiStep();
    await markOnline(user, 0);                                              // Selvam, 500, 17 Oct

    expect(screen.getByTestId("upi-target-banner")).toHaveTextContent(/Pick the UPI payment for\s*Selvam\s*·\s*₹500/);
    expect(states()).toEqual(Array(5).fill("highlight"));
    expect(screen.getAllByTestId("upi-ants")).toHaveLength(5);

    const tag = (id: number) => within(item(id)).queryByTestId("upi-match-tag")?.textContent ?? null;
    expect(tag(10)).toBe("Name & amount match");                            // SELVAM K, 500
    expect(tag(11)).toBeNull();                                             // someone else, 200
    expect(within(rowEl(0)).getByTestId("upi-waiting")).toHaveTextContent("UPI?");
    expect(rowEl(0)).toHaveAttribute("data-upi-target", "true");
  });

  it("a transaction from another date than the row is tagged 'other date'", async () => {
    const { user } = await reachUpiStep();
    await markOnline(user, 2);                                              // Anbu, 200, 18 Oct — all the payments are 17 Oct
    expect(within(item(11)).getByTestId("upi-match-tag")).toHaveTextContent("Amount matches · other date");
    expect(within(item(10)).getByTestId("upi-match-tag")).toHaveTextContent("other date");
  });

  it("a row the OCR already read as Online starts the highlight from its 'UPI?' badge", async () => {
    const { user } = await reachUpiStep();
    expect(states().every((s) => s === "idle")).toBe(true);                 // already Online, but nothing happens by itself
    await user.click(within(rowEl(1)).getByTestId("upi-waiting"));
    expect(screen.getByTestId("upi-target-banner")).toHaveTextContent(/Kannan\s*·\s*₹300/);
    expect(states().every((s) => s === "highlight")).toBe(true);
  });

  it("editing something else on a row (its amount, the Paid tick) does not start the highlight", async () => {
    const { user } = await reachUpiStep();
    const amount = within(rowEl(0)).getByRole("spinbutton");
    await user.clear(amount);
    await user.type(amount, "650");
    expect(screen.queryByTestId("upi-target-banner")).toBeNull();
    await user.click(within(rowEl(1)).getByTitle("Unpaid"));                // ticking Paid on the Online row
    expect(screen.queryByTestId("upi-target-banner")).toBeNull();
    expect(states().every((s) => s === "idle")).toBe(true);
  });

  it("switching the row back to cash, or the x on the banner, switches the highlight off", async () => {
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    expect(screen.getByTestId("upi-target-banner")).toBeInTheDocument();
    await user.click(within(rowEl(0)).getByText("ONL"));                    // back to cash
    expect(screen.queryByTestId("upi-target-banner")).toBeNull();
    expect(states().every((s) => s === "idle")).toBe(true);

    await markOnline(user, 0);
    await user.click(screen.getByRole("button", { name: "Stop highlighting" }));
    expect(screen.queryByTestId("upi-target-banner")).toBeNull();
  });
});

describe("picking a transaction (UP-04, UP-05, UP-09)", () => {
  it("pairs it: the row becomes Online + Paid with the UPI amount, the transaction is struck and shows the customer, the highlight ends", async () => {
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "SELVAM K");

    expect(within(rowEl(0)).getByText("ONL")).toBeInTheDocument();
    expect(amountOf(0)).toBe("500");
    expect(within(rowEl(0)).getByTitle("Paid")).toBeInTheDocument();
    expect(item(10)).toHaveAttribute("data-state", "paired");
    expect(within(item(10)).getByText("Selvam")).toBeInTheDocument();
    expect(screen.queryByTestId("upi-target-banner")).toBeNull();           // 500 covers the 500 on the sheet
    expect(states().filter((s) => s === "idle")).toHaveLength(4);
    expect(toast.success).toHaveBeenCalledWith("Paired ₹500 → Selvam");
  });

  it("two payments the same day are ADDED, and the highlight stays until the sheet amount is covered", async () => {
    const { user } = await reachUpiStep();
    await user.click(within(rowEl(1)).getByTestId("upi-waiting"));          // Kannan, sheet says 300
    await pick(user, "SOMEONE ELSE");                                       // 200
    expect(amountOf(1)).toBe("200");
    expect(screen.getByTestId("upi-target-banner")).toHaveTextContent(/Kannan\s*·\s*₹100/);   // 100 still to find
    expect(item(14)).toHaveAttribute("data-state", "highlight");

    await pick(user, "PAYER 14");                                           // 100
    expect(amountOf(1)).toBe("300");
    expect(screen.queryByTestId("upi-target-banner")).toBeNull();           // covered
  });

  it("the second payment is compared with what is still unpaid ('Amount matches')", async () => {
    const { user } = await reachUpiStep();
    await user.click(within(rowEl(1)).getByTestId("upi-waiting"));          // 300
    await pick(user, "SOMEONE ELSE");                                       // 200 -> 100 left
    expect(within(item(14)).getByTestId("upi-match-tag")).toHaveTextContent("Amount matches");   // the 100 one
    expect(within(item(10)).queryByTestId("upi-match-tag")).toBeNull();     // the 500 one no longer matches anything
  });

  it("Undo restores the row exactly as it was and frees the transaction; the highlight comes back for a still-waiting row", async () => {
    const { user } = await reachUpiStep();
    await user.click(within(rowEl(1)).getByTestId("upi-waiting"));
    await pick(user, "SOMEONE ELSE");                                       // 200 of 300
    await user.click(within(item(11)).getByRole("button", { name: /Undo/ }));
    expect(amountOf(1)).toBe("300");
    expect(within(rowEl(1)).getByText("ONL")).toBeInTheDocument();
    expect(within(rowEl(1)).getByTitle("Unpaid")).toBeInTheDocument();
    expect(item(11)).toHaveAttribute("data-state", "highlight");           // free again, and the row is waiting again
  });

  it("a row with no customer cannot be paired — the user is told", async () => {
    const records = [record({ customer_name: "Qwerty", customer_id: null, amount: 500 })];
    const { user } = await reachUpiStep(TXNS, records);
    await markOnline(user, 0);
    await pick(user, "SELVAM K");
    expect(toast.error).toHaveBeenCalledWith("Pick a customer for this row first");
    expect(states().every((s) => s === "highlight")).toBe(true);
  });

  it("deleting a paired row frees its transaction", async () => {
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "SELVAM K");
    expect(item(10)).toHaveAttribute("data-state", "paired");
    await user.click(within(rowEl(0)).getAllByRole("button").at(-1)!);        // the row's trash icon
    expect(customerInputs()).toHaveLength(2);
    expect(item(10)).toHaveAttribute("data-state", "idle");
  });

  it("the existing Apply on an already-mapped transaction pairs it with that customer's row", async () => {
    const { user } = await reachUpiStep();
    await user.click(within(item(12)).getByRole("button", { name: /^Apply/ }));
    expect(item(12)).toHaveAttribute("data-state", "paired");
    expect(amountOf(1)).toBe("300");
    expect(within(rowEl(1)).getByTitle("Paid")).toBeInTheDocument();
  });
});

describe("a UPI id that belongs to someone else (UP-06)", () => {
  it("asks before re-pointing it, and does nothing when cancelled", async () => {
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "ZZ");
    const text = await screen.findByTestId("remap-text");
    expect(text).toHaveTextContent(/zz@upi/);
    expect(text).toHaveTextContent(/Old Owner/);
    expect(text).toHaveTextContent(/Selvam/);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("remap-text")).toBeNull();
    expect(item(13)).toHaveAttribute("data-state", "highlight");
  });

  it("when the user confirms, the transaction is paired and the re-point is saved at Submit with replace=true", async () => {
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "ZZ");
    await user.click(await screen.findByRole("button", { name: "Re-point" }));
    expect(item(13)).toHaveAttribute("data-state", "paired");
    expect(upi.applyPairings).not.toHaveBeenCalled();                        // nothing is saved at the click …

    await user.click(screen.getByRole("button", { name: /Save & Post/ }));  // … only at Submit
    await waitFor(() => expect(upi.applyPairings).toHaveBeenCalledTimes(1));
    expect(upi.applyPairings).toHaveBeenCalledWith([
      { txn_id: 13, customer_id: 1, customer_type: "edi", customer_name: "Selvam", replace: true },
    ]);
  });
});

describe("a UPI id clash is settled while pairing, not after Submit (UP-11)", () => {
  // txn 14 (p14@upi) has no customer on it, but the saved UPI id list says it belongs to customer 9 "Old Owner"
  const saved = [{ id: 1, upi_vpa: "p14@upi", customer_id: 9, customer_type: "edi", customer_name: "Old Owner" }];

  it("a UPI id saved for another customer (older transaction, no customer on it) asks at the click, naming the owner and offering both ways out", async () => {
    upi.listVpaMappings.mockResolvedValue({ data: { data: saved } });
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "PAYER 14");
    const text = await screen.findByTestId("remap-text");
    expect(text).toHaveTextContent(/p14@upi/);
    expect(text).toHaveTextContent(/is saved for\s*Old Owner/);
    expect(screen.getByTestId("remap-keep")).toHaveTextContent("Pair, keep the UPI id for Old Owner");
    expect(screen.getByRole("button", { name: "Re-point" })).toBeInTheDocument();
    expect(item(14)).toHaveAttribute("data-state", "highlight");               // nothing is paired until the user chooses
  });

  it("'Pair, keep the UPI id for …' pairs the payment but leaves the saved UPI id alone: nothing to warn about at Submit", async () => {
    upi.listVpaMappings.mockResolvedValue({ data: { data: saved } });
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "PAYER 14");
    await user.click(await screen.findByTestId("remap-keep"));
    expect(item(14)).toHaveAttribute("data-state", "paired");
    expect(within(rowEl(0)).getByText("ONL")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(ocr.submit).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(upi.applyPairings).not.toHaveBeenCalled();                         // no mapping change, so no "not saved" warning either
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining("not saved"), expect.anything());
  });

  it("'Re-point' moves the saved UPI id to this customer (replace=true, sent at Submit)", async () => {
    upi.listVpaMappings.mockResolvedValue({ data: { data: saved } });
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "PAYER 14");
    await user.click(await screen.findByRole("button", { name: "Re-point" }));
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(upi.applyPairings).toHaveBeenCalledTimes(1));
    expect(upi.applyPairings).toHaveBeenCalledWith([{ txn_id: 14, customer_id: 1, customer_type: "edi", customer_name: "Selvam", replace: true }]);
  });

  it("without the clash the click pairs at once, as before", async () => {
    upi.listVpaMappings.mockResolvedValue({ data: { data: [{ id: 1, upi_vpa: "p14@upi", customer_id: 1, customer_type: "edi", customer_name: "Selvam" }] } });
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "PAYER 14");
    expect(screen.queryByTestId("remap-text")).toBeNull();
    expect(item(14)).toHaveAttribute("data-state", "paired");
  });

  it("the same UPI id used for two different customers on one page is caught at the second click", async () => {
    const twin = [
      txn(20, { amount: "500", sender_name: "FAMILY", sender_vpa: "family@upi" }),
      txn(21, { amount: "300", sender_name: "FAMILY", sender_vpa: "family@upi" }),
    ];
    const { user } = await reachUpiStep(twin);
    await markOnline(user, 0);                                                // Selvam 500
    await user.click(item(20));
    expect(screen.queryByTestId("remap-text")).toBeNull();                    // first use: just pairs
    await user.click(within(rowEl(1)).getByTestId("upi-waiting"));            // Kannan, 300
    await user.click(item(21));
    const text = await screen.findByTestId("remap-text");
    expect(text).toHaveTextContent(/was already paired with\s*Selvam/);
    await user.click(screen.getByTestId("remap-keep"));                       // Kannan's payment counts, the id stays with Selvam
    expect(item(21)).toHaveAttribute("data-state", "paired");
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(upi.applyPairings).toHaveBeenCalledTimes(1));
    expect(upi.applyPairings).toHaveBeenCalledWith([{ txn_id: 20, customer_id: 1, customer_type: "edi", customer_name: "Selvam", replace: false }]);
  });

  it("if the saved list cannot be loaded the page still works (only the clashes the transaction itself shows are caught)", async () => {
    upi.listVpaMappings.mockRejectedValue(new Error("500"));
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "PAYER 14");
    expect(item(14)).toHaveAttribute("data-state", "paired");
  });
});
// ── the step never moves on by itself (UP-07, UP-08) ──────────────────────────

describe("continuing from the UPI step", () => {
  it("shows 'Skip remaining (N) & continue' while transactions are left, and moves on only when pressed", async () => {
    const { user } = await reachUpiStep();
    expect(screen.getByTestId("upi-continue")).toHaveTextContent("Skip remaining (5) & continue");
    await markOnline(user, 0);
    await pick(user, "SELVAM K");
    expect(screen.getByTestId("upi-continue")).toHaveTextContent("Skip remaining (4) & continue");
    expect(screen.queryByText("Daily Expenses")).toBeNull();

    await user.click(screen.getByTestId("upi-continue"));
    expect(await screen.findByText("Daily Expenses")).toBeInTheDocument();
    expect(screen.queryByTestId("upi-continue")).toBeNull();
  });

  it("when every transaction is paired it does NOT move on by itself — the button reads 'Continue to Expenses'", async () => {
    const two = [TXNS[0], TXNS[2]];
    const { user } = await reachUpiStep(two);
    await markOnline(user, 0);
    await pick(user, "SELVAM K");
    await user.click(within(item(12)).getByRole("button", { name: /^Apply/ }));
    expect(states()).toEqual(["paired", "paired"]);
    expect(screen.getByTestId("upi-continue")).toHaveTextContent("Continue to Expenses");

    await new Promise((r) => setTimeout(r, 900));                           // the old code advanced after 500 ms
    expect(screen.queryByText("Daily Expenses")).toBeNull();
    expect(screen.getByTestId("upi-continue")).toBeInTheDocument();

    await user.click(screen.getByTestId("upi-continue"));
    expect(await screen.findByText("Daily Expenses")).toBeInTheDocument();
  });

  it("a day with no UPI credits does not move on by itself either — it offers the skip button", async () => {
    await reachUpiStep([]);
    await screen.findAllByText(/No UPI credits/);
    await new Promise((r) => setTimeout(r, 900));
    expect(screen.queryByText("Daily Expenses")).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Skip to Expenses/ }));
    expect(await screen.findByText("Daily Expenses")).toBeInTheDocument();
  });

  it("'Sync Gmail now' in the empty UPI panel syncs, reloads the list and the transactions appear (MN-06)", async () => {
    upi.gmailSync.mockResolvedValue({ data: { imported: 5, skipped: 0, total_found: 5 } });
    const { user } = await reachUpiStep([]);
    await screen.findAllByText(/No UPI credits/);
    upi.list.mockResolvedValue({ data: { data: TXNS, total: TXNS.length } });            // what Gmail brought in

    await user.click(screen.getByTestId("sync-gmail"));
    await waitFor(() => expect(upi.gmailSync).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith("Gmail synced — 5 new, 0 already imported");
    expect((await screen.findAllByTestId("upi-item"))).toHaveLength(5);
    expect(screen.queryByTestId("sync-gmail")).toBeNull();                               // the empty card is gone
  });

  it("… and a failed sync shows the server's message and keeps the skip button", async () => {
    upi.gmailSync.mockRejectedValue({ response: { status: 400, data: { detail: "Gmail is not connected" } } });
    const { user } = await reachUpiStep([]);
    await screen.findAllByText(/No UPI credits/);
    await user.click(screen.getByTestId("sync-gmail"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Gmail is not connected"));
    expect(screen.getByRole("button", { name: /Skip to Expenses/ })).toBeInTheDocument();
  });

  it("continuing with a customer marked online but no transaction picked switches the highlight off — it returns only when another customer is marked online", async () => {
    const { user } = await reachUpiStep();
    await markOnline(user, 0);                                              // highlight on, nothing picked
    await user.click(screen.getByTestId("upi-continue"));
    await screen.findByText("Daily Expenses");
    expect(screen.queryByTestId("upi-target-banner")).toBeNull();
    expect(states().every((s) => s === "idle")).toBe(true);
    expect(within(rowEl(0)).getByText("ONL")).toBeInTheDocument();          // the row stays Online …
    expect(within(rowEl(0)).getByTitle("Unpaid")).toBeInTheDocument();      // … and unpaid

    await markOnline(user, 2);                                              // another customer is marked online
    expect(screen.getByTestId("upi-target-banner")).toHaveTextContent(/Anbu/);
    expect(states().every((s) => s === "highlight")).toBe(true);
  });
});

// ── Submit: UPI pairings + training data ──────────────────────────────────────

describe("Submit (UP-06, TD-01, TD-05, TD-08)", () => {
  it("a pairing whose UPI id is already mapped to that customer needs no save", async () => {
    const { user } = await reachUpiStep();
    await user.click(within(item(12)).getByRole("button", { name: /^Apply/ }));
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(ocr.submit).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(upi.applyPairings).not.toHaveBeenCalled();
  });

  it("a click-pairing is saved for future auto-mapping after the records (customer + product, not saved at the click)", async () => {
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "SELVAM K");
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(upi.applyPairings).toHaveBeenCalledTimes(1));
    expect(upi.applyPairings).toHaveBeenCalledWith([{ txn_id: 10, customer_id: 1, customer_type: "edi", customer_name: "Selvam", replace: false }]);
    expect(ocr.submit.mock.invocationCallOrder[0]).toBeLessThan(upi.applyPairings.mock.invocationCallOrder[0]);
  });

  it("an undone pairing is never saved", async () => {
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "SELVAM K");
    await user.click(within(item(10)).getByRole("button", { name: /Undo/ }));
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(ocr.submit).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(upi.applyPairings).not.toHaveBeenCalled();
  });

  it("UPI ids the server could not save only warn (the records are already saved)", async () => {
    upi.applyPairings.mockResolvedValue({ data: { paired: 0, skipped: [{ txn_id: 10, reason: "vpa_mapped_to_other" }] } });
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "SELVAM K");
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining("not saved"), expect.anything()));
    expect(toast.success).toHaveBeenCalledWith("3 records saved", expect.anything());
  });

  it("a failed UPI save only warns", async () => {
    upi.applyPairings.mockRejectedValue(new Error("500"));
    const { user } = await reachUpiStep();
    await markOnline(user, 0);
    await pick(user, "SELVAM K");
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("UPI ids could not be saved")));
    expect(toast.success).toHaveBeenCalledWith("3 records saved", expect.anything());
  });

  it("training toggle ON (the default): the page image + the submitted table go to Drive, after the records", async () => {
    const { user } = await reachUpiStep();
    expect(screen.getAllByRole("switch", { name: "Save data for training" })[0]).toHaveAttribute("aria-checked", "true");
    await markOnline(user, 0);
    await pick(user, "SELVAM K");                                           // row 0 becomes Online / 500
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));

    await waitFor(() => expect(training.saveOcr).toHaveBeenCalledTimes(1));
    const form = training.saveOcr.mock.calls[0][0] as FormData;
    expect((form.get("image") as File).name).toBe("page.jpg");
    expect(form.get("page")).toBe("1");
    expect(JSON.parse(form.get("rows") as string)).toEqual([
      { customer: "Selvam", date: "17-10-2026", amount: 500, type: "EDI", mode: "ONLINE", raw_text: "Selvam", source_file: "", origin: "matched" },
      { customer: "Kannan", date: "17-10-2026", amount: 300, type: "EDI", mode: "ONLINE", raw_text: "Kannan", source_file: "", origin: "matched" },
      { customer: "Anbu", date: "18-10-2026", amount: 200, type: "EDI", mode: "CASH", raw_text: "Anbu", source_file: "", origin: "matched" },
    ]);
    expect(ocr.submit.mock.invocationCallOrder[0]).toBeLessThan(training.saveOcr.mock.invocationCallOrder[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Training data saved to Drive"));
  });

  it("training toggle OFF: nothing is sent for training", async () => {
    const { user } = await reachUpiStep();
    await user.click(screen.getAllByRole("switch", { name: "Save data for training" })[0]);
    expect(screen.getAllByRole("switch", { name: "Save data for training" })[0]).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(ocr.submit).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(training.saveOcr).not.toHaveBeenCalled();
  });

  it("a new file starts with the toggle ON again", async () => {
    const { user, container } = await reachUpiStep();
    await user.click(screen.getAllByRole("switch", { name: "Save data for training" })[0]);
    expect(screen.getAllByRole("switch", { name: "Save data for training" })[0]).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("button", { name: /New file/ }));
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(["%PDF-1.4"], "next.pdf", { type: "application/pdf" }));
    await user.click(await screen.findByRole("button", { name: /^Extract$/ }));
    await user.click(await screen.findByRole("button", { name: "Confirm Dates" }));
    await screen.findAllByPlaceholderText("Customer…");
    expect(screen.getAllByRole("switch", { name: "Save data for training" })[0]).toHaveAttribute("aria-checked", "true");
  });

  it("a Drive failure only warns — the records were saved", async () => {
    training.saveOcr.mockRejectedValue({ response: { status: 409, data: { detail: "Google Drive is not connected — connect it in Settings to save training data." } } });
    const { user } = await reachUpiStep();
    await user.click(screen.getByRole("button", { name: /Save & Post/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Records saved")));
    expect(toast.error).not.toHaveBeenCalledWith("Submit failed", expect.anything());
    expect(toast.success).toHaveBeenCalledWith("3 records saved", expect.anything());
  });

  async function openFinalSummary() {
    const { user } = await reachUpiStep();
    await user.click(screen.getByTestId("upi-continue"));                         // 4 UPI -> 5 Expenses
    await user.click(await screen.findByRole("button", { name: "Skip" }));         // 5 -> 6 Customers (a stub with one button)
    await user.click(await screen.findByRole("button", { name: "Customers done" }));
    const dialog = (await screen.findByText("Final Summary")).closest("div.max-w-lg") as HTMLElement;
    return { user, dialog };
  }

  it("the toggle is also in the Final Summary — where the submit happens — and its state decides the upload (ON)", async () => {
    const { user, dialog } = await openFinalSummary();
    const sw = within(dialog).getByRole("switch", { name: "Save data for training" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    await user.click(within(dialog).getByRole("button", { name: /^Submit/ }));
    await waitFor(() => expect(training.saveOcr).toHaveBeenCalledTimes(1));
  });

  it("… and OFF there sends nothing", async () => {
    const { user, dialog } = await openFinalSummary();
    await user.click(within(dialog).getByRole("switch", { name: "Save data for training" }));
    await user.click(within(dialog).getByRole("button", { name: /^Submit/ }));
    await waitFor(() => expect(ocr.submit).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(training.saveOcr).not.toHaveBeenCalled();
  });
});
