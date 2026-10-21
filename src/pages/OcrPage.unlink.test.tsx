/**
 * The real OcrPage with only the network layer mocked: "Unlink" on a mapped UPI transaction (UL-01 … UL-10).
 * The UPI id stops pointing at its customer: the saved mapping is deleted on the server, the link disappears from the
 * id's payments on screen, and a later pairing no longer meets a "belongs to another customer" clash.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t") }) }));
vi.mock("@/components/CustomerStepOverlay", () => ({
  CustomerStepOverlay: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Customers done</button>,
}));
vi.mock("@/services/api", () => {
  const ok = (data: unknown = {}) => vi.fn().mockResolvedValue({ data });
  return {
    ocrApi: { upload: vi.fn(), getPage: vi.fn(), extract: vi.fn(), submit: vi.fn() },
    upiApi: { list: vi.fn(), listVpaMappings: vi.fn(), unlinkVpa: vi.fn(), fuzzySuggest: ok({ data: [] }), applyPairings: vi.fn(), gmailSync: vi.fn() },
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
const upi = upiApi as unknown as Record<"list" | "listVpaMappings" | "unlinkVpa" | "applyPairings", ReturnType<typeof vi.fn>>;
const training = trainingDataApi as unknown as Record<"saveOcr", ReturnType<typeof vi.fn>>;

const record = (over: Record<string, unknown>) => ({
  collection_date: "17-10-2026", customer_name: "", product_type: "EDI", payment_mode: "CASH", amount: 500, raw_text: "",
  confidence_score: 0.95, page_number: 1, notes: "", customer_suggestions: [], customer_id: null, mapping_suggestions: [],
  match_source: null, mapping_ref: null, matched_customer_name: null, ...over,
});
const RECORDS = [
  record({ customer_name: "Selvam", customer_id: 1, match_source: "fuzzy", amount: 500 }),                              // row 0: cash
  record({ customer_name: "Kannan", customer_id: 2, match_source: "fuzzy", amount: 300, payment_mode: "ONLINE" }),      // row 1
];

const txn = (id: number, over: Record<string, unknown> = {}) => ({
  id, upi_ref_no: `ref${id}`, amount: "100", transaction_type: "credit", sender_vpa: `p${id}@upi`, sender_name: `PAYER ${id}`, notes: null,
  transaction_date: "2026-10-17", mapped_customer_id: null, mapped_customer_type: null, mapped_customer_name: null, ...over,
});
const linked = (id: number, type: string, name: string) => ({ mapped_customer_id: id, mapped_customer_type: type, mapped_customer_name: name });

// the sheet's wrong link from the screenshot: PARTHIBAN's UPI id is saved for sathiskumar (IOP)
const PARTHI = { amount: "500", sender_name: "PARTHIBAN K", sender_vpa: "parthi@upi", ...linked(7, "iop", "sathiskumar") };
const TXNS = [
  txn(10, { amount: "500", sender_name: "SELVAM K", sender_vpa: "selvam@upi" }),                                       // not linked
  txn(40, PARTHI),                                                                                                     // linked to sathiskumar
  txn(41, { ...PARTHI, amount: "75" }),                                                                                // same UPI id, same link
  txn(42, { ...PARTHI, amount: "60", ...linked(8, "iop", "Another Owner") }),                                          // same UPI id, an earlier owner's history
  txn(43, { amount: "90", sender_name: "OTHER", sender_vpa: "other@upi", ...linked(7, "iop", "sathiskumar") }),        // other UPI id, same customer
];
const SAVED = [
  { id: 1, upi_vpa: "parthi@upi", customer_id: 7, customer_type: "iop", customer_name: "sathiskumar" },
  { id: 2, upi_vpa: "other@upi", customer_id: 7, customer_type: "iop", customer_name: "sathiskumar" },
];

async function reachUpiStep(txns: unknown[] = TXNS) {
  upi.list.mockResolvedValue({ data: { data: txns, total: txns.length } });
  ocr.extract.mockResolvedValue({ data: { page_image_b64: "AAAA", records: (RECORDS as object[]).map((r) => ({ ...r })) } });
  const user = userEvent.setup();
  const utils = render(<OcrPage />);
  await user.upload(utils.container.querySelector('input[type="file"]') as HTMLInputElement, new File(["%PDF-1.4"], "page.pdf", { type: "application/pdf" }));
  await user.click(await screen.findByRole("button", { name: /^Extract$/ }));
  await user.click(await screen.findByRole("button", { name: "Confirm Dates" }));
  await screen.findAllByTestId("upi-item");
  await screen.findAllByPlaceholderText("Customer…");
  return { user, ...utils };
}

const item = (id: number) => document.querySelector(`[data-upi-id="${id}"]`) as HTMLElement;
const unlinkBtn = (id: number) => within(item(id)).queryByTestId("upi-unlink");
const customerInputs = () => screen.getAllByPlaceholderText("Customer…") as HTMLInputElement[];
const rowEl = (i: number) => customerInputs()[i].closest("tr") as HTMLElement;
const reply = (data: unknown = { removed_mappings: 1, cleared: 3, upi_vpa: "parthi@upi" }) => upi.unlinkVpa.mockResolvedValue({ data });
const reject = (status: number, detail?: string) =>
  upi.unlinkVpa.mockRejectedValue(Object.assign(new Error(`HTTP ${status}`), { response: { status, data: detail ? { detail } : {} } }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetConnectionStatus();
  ocr.upload.mockResolvedValue({ data: { session_id: "s1", total_pages: 1 } });
  ocr.getPage.mockResolvedValue({ data: { page_image_b64: "AAAA" } });
  ocr.submit.mockResolvedValue({ data: { submitted: 2, mapping_usage: 0 } });
  upi.listVpaMappings.mockResolvedValue({ data: { data: SAVED } });
  upi.applyPairings.mockResolvedValue({ data: { paired: 1, created: 1, replaced: 0, unchanged: 0, stamped: 1, skipped: [] } });
  training.saveOcr.mockResolvedValue({ data: { saved: 2, folder: "fintech/ocr/2026-10-17", files: [] } });
  reply();
});

describe("the Unlink button (UL-01)", () => {
  it("every linked transaction has one, an unlinked transaction has none", async () => {
    await reachUpiStep();
    for (const id of [40, 41, 42, 43]) expect(unlinkBtn(id)).not.toBeNull();
    expect(unlinkBtn(10)).toBeNull();
    expect(unlinkBtn(40)).toHaveAttribute("aria-label", "Unlink sathiskumar from PARTHIBAN K");
  });

  it("asks first — naming the UPI id, the customer and the product — and sends nothing until confirmed (UL-02)", async () => {
    const { user } = await reachUpiStep();
    await user.click(unlinkBtn(40)!);
    const text = await screen.findByTestId("unlink-text");
    expect(text).toHaveTextContent(/parthi@upi/);
    expect(text).toHaveTextContent(/no longer point to\s*sathiskumar\s*\(IOP\)/);
    expect(text).toHaveTextContent(/1 other payment from it on this page lose the link too/);   // 41 (42 belongs to another owner)
    expect(text).toHaveTextContent(/Records already submitted do not change/);
    expect(upi.unlinkVpa).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("unlink-cancel"));
    expect(screen.queryByTestId("unlink-text")).toBeNull();
    expect(upi.unlinkVpa).not.toHaveBeenCalled();
    expect(within(item(40)).getByText("sathiskumar")).toBeInTheDocument();
  });
});

describe("confirming (UL-03 … UL-05)", () => {
  it("asks the server about that transaction and the link disappears from it — it now reads 'Unmapped' and has no Unlink", async () => {
    const { user } = await reachUpiStep();
    await user.click(unlinkBtn(40)!);
    await user.click(await screen.findByTestId("unlink-confirm"));
    await waitFor(() => expect(screen.queryByTestId("unlink-text")).toBeNull());
    expect(upi.unlinkVpa).toHaveBeenCalledTimes(1);
    expect(upi.unlinkVpa).toHaveBeenCalledWith(40);
    expect(within(item(40)).queryByText("sathiskumar")).toBeNull();
    expect(within(item(40)).getByText("Unmapped")).toBeInTheDocument();
    expect(unlinkBtn(40)).toBeNull();
    expect(toast.success).toHaveBeenCalledWith("Unlinked sathiskumar from parthi@upi");
  });

  it("the same UPI id's other payments to that customer lose the link too; another owner's history, other UPI ids and unlinked ones stay as they were", async () => {
    const { user } = await reachUpiStep();
    await user.click(unlinkBtn(40)!);
    await user.click(await screen.findByTestId("unlink-confirm"));
    await waitFor(() => expect(unlinkBtn(41)).toBeNull());
    expect(within(item(41)).getByText("Unmapped")).toBeInTheDocument();
    expect(within(item(42)).getByText("Another Owner")).toBeInTheDocument();         // history of another account
    expect(unlinkBtn(42)).not.toBeNull();
    expect(within(item(43)).getByText("sathiskumar")).toBeInTheDocument();           // a different UPI id of the same customer
    expect(unlinkBtn(43)).not.toBeNull();
    expect(within(item(10)).getByText("Unmapped")).toBeInTheDocument();
  });

  it("the saved UPI id is forgotten on the page too: pairing that payment with another customer no longer asks 'belongs to another customer'", async () => {
    const { user } = await reachUpiStep();
    // before: the id is saved for sathiskumar, so pairing it with Selvam clashes
    await user.click(within(rowEl(0)).getByText("CSH"));
    await user.click(item(40));
    expect(await screen.findByTestId("remap-text")).toHaveTextContent(/is saved for\s*sathiskumar/);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Stop highlighting" }));

    await user.click(unlinkBtn(40)!);
    await user.click(await screen.findByTestId("unlink-confirm"));
    await waitFor(() => expect(unlinkBtn(40)).toBeNull());

    await user.click(within(rowEl(0)).getByTestId("upi-waiting"));
    await user.click(item(40));
    expect(screen.queryByTestId("remap-text")).toBeNull();                            // no clash any more: it just pairs
    expect(item(40)).toHaveAttribute("data-state", "paired");
  });

  it("the other customer's own saved UPI ids are not touched (the other id still clashes)", async () => {
    const { user } = await reachUpiStep();
    await user.click(unlinkBtn(40)!);
    await user.click(await screen.findByTestId("unlink-confirm"));
    await waitFor(() => expect(unlinkBtn(40)).toBeNull());
    await user.click(within(rowEl(0)).getByText("CSH"));
    await user.click(screen.getByRole("button", { name: /Use the payment from OTHER/ }));
    expect(await screen.findByTestId("remap-text")).toHaveTextContent(/other@upi.*is saved for\s*sathiskumar/);
  });

  it("while the server is answering the buttons are disabled so it cannot be sent twice", async () => {
    let finish!: (v: unknown) => void;
    upi.unlinkVpa.mockReturnValue(new Promise((r) => { finish = r; }));
    const { user } = await reachUpiStep();
    await user.click(unlinkBtn(40)!);
    await user.click(await screen.findByTestId("unlink-confirm"));
    expect(screen.getByTestId("unlink-confirm")).toBeDisabled();
    expect(screen.getByTestId("unlink-confirm")).toHaveTextContent("Unlinking…");
    expect(screen.getByTestId("unlink-cancel")).toBeDisabled();
    finish({ data: { removed_mappings: 1, cleared: 2, upi_vpa: "parthi@upi" } });
    await waitFor(() => expect(screen.queryByTestId("unlink-text")).toBeNull());
    expect(upi.unlinkVpa).toHaveBeenCalledTimes(1);
  });
});

describe("when it fails (UL-06, UL-07)", () => {
  it("a server error keeps the dialog open and the link in place, shows the reason, and can be retried", async () => {
    reject(500, "database is down");
    const { user } = await reachUpiStep();
    await user.click(unlinkBtn(40)!);
    await user.click(await screen.findByTestId("unlink-confirm"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("database is down"));
    expect(screen.getByTestId("unlink-text")).toBeInTheDocument();
    expect(screen.getByTestId("unlink-confirm")).not.toBeDisabled();
    expect(within(item(40)).getByText("sathiskumar")).toBeInTheDocument();

    reply();
    await user.click(screen.getByTestId("unlink-confirm"));
    await waitFor(() => expect(unlinkBtn(40)).toBeNull());
    expect(upi.unlinkVpa).toHaveBeenCalledTimes(2);
  });

  it("an unreadable error still says something sensible", async () => {
    reject(500);
    const { user } = await reachUpiStep();
    await user.click(unlinkBtn(40)!);
    await user.click(await screen.findByTestId("unlink-confirm"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not unlink — please try again"));
  });

  it("'not linked' (already unlinked elsewhere) closes the dialog and reloads the list from the server", async () => {
    reject(400, "This transaction is not linked to a customer");
    const { user } = await reachUpiStep();
    expect(upi.list).toHaveBeenCalledTimes(1);
    await user.click(unlinkBtn(40)!);
    await user.click(await screen.findByTestId("unlink-confirm"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This transaction is not linked to a customer"));
    await waitFor(() => expect(screen.queryByTestId("unlink-text")).toBeNull());
    await waitFor(() => expect(upi.list).toHaveBeenCalledTimes(2));
  });
});

describe("payments already used on this page (UL-08, UL-09)", () => {
  it("a paired payment offers Undo, not Unlink; after Undo the Unlink button is back", async () => {
    const { user } = await reachUpiStep();
    await user.click(within(rowEl(0)).getByText("CSH"));
    await user.click(item(40));
    await user.click(await screen.findByRole("button", { name: "Re-point" }));        // sathiskumar owns the id: re-point it to Selvam
    expect(item(40)).toHaveAttribute("data-state", "paired");
    expect(unlinkBtn(40)).toBeNull();
    await user.click(within(item(40)).getByRole("button", { name: /Undo/ }));
    expect(unlinkBtn(40)).not.toBeNull();
  });

  it("the dialog says how many of the id's other payments are already applied to a row; they stay applied", async () => {
    const txns = [
      txn(50, { amount: "500", sender_name: "SELVAM K", sender_vpa: "selvam@upi", ...linked(1, "edi", "Selvam") }),     // auto-applies to Selvam's row
      txn(51, { amount: "75", sender_name: "SELVAM K", sender_vpa: "selvam@upi", ...linked(1, "edi", "Selvam") }),      // same id + link, stays free
    ];
    const { user } = await reachUpiStep(txns);
    await waitFor(() => expect(item(50)).toHaveAttribute("data-state", "paired"));
    expect(unlinkBtn(50)).toBeNull();
    await user.click(unlinkBtn(51)!);
    const text = await screen.findByTestId("unlink-text");
    expect(text).toHaveTextContent(/1 other payment from it on this page lose the link too/);
    expect(text).toHaveTextContent(/1 of them is already applied to a row and stays applied/);
    await user.click(screen.getByTestId("unlink-confirm"));
    await waitFor(() => expect(unlinkBtn(51)).toBeNull());
    expect(item(50)).toHaveAttribute("data-state", "paired");                          // the applied payment is not undone behind the user's back
    expect(within(rowEl(0)).getByText("ONL")).toBeInTheDocument();
    // Undo on it now shows an unlinked payment
    await user.click(within(item(50)).getByRole("button", { name: /Undo/ }));
    expect(within(item(50)).getByText("Unmapped")).toBeInTheDocument();
    expect(item(50)).toHaveAttribute("data-state", "idle");                            // and nothing re-applies it
  });

  it("control: a linked payment applies itself as soon as the sheet's amount is edited to match (so the next test means something)", async () => {
    const { user } = await reachUpiStep([txn(70, { amount: "75", sender_name: "SELVAM K", sender_vpa: "selvam@upi", ...linked(1, "edi", "Selvam") })]);
    expect(item(70)).toHaveAttribute("data-state", "idle");                              // 75 is not the sheet's 500
    const amount = within(rowEl(0)).getByRole("spinbutton");
    await user.clear(amount);
    await user.type(amount, "75");
    await waitFor(() => expect(item(70)).toHaveAttribute("data-state", "paired"));
  });

  it("once unlinked, the payment is not applied by itself any more", async () => {
    const { user } = await reachUpiStep([txn(70, { amount: "75", sender_name: "SELVAM K", sender_vpa: "selvam@upi", ...linked(1, "edi", "Selvam") })]);
    await user.click(unlinkBtn(70)!);
    await user.click(await screen.findByTestId("unlink-confirm"));
    await waitFor(() => expect(unlinkBtn(70)).toBeNull());
    const amount = within(rowEl(0)).getByRole("spinbutton");
    await user.clear(amount);
    await user.type(amount, "75");
    await new Promise((r) => setTimeout(r, 80));
    expect(item(70)).toHaveAttribute("data-state", "idle");
    expect(within(rowEl(0)).queryByText("ONL")).toBeNull();
  });
});

describe("dismissing (UL-10)", () => {
  it("Escape / closing the dialog sends nothing", async () => {
    const { user } = await reachUpiStep();
    await user.click(unlinkBtn(40)!);
    await screen.findByTestId("unlink-text");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("unlink-text")).toBeNull());
    expect(upi.unlinkVpa).not.toHaveBeenCalled();
  });
});
