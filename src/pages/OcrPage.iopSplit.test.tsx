/**
 * The real OcrPage with only the network layer mocked: an IOP row can be expanded to say how much of the collection was PRINCIPAL and
 * how much INTEREST. IP-01 ... IP-12. The interest is the transaction, the principal goes to the customer's principal paid.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
const RECORDS = [
  record({ customer_name: "Ravi", customer_id: 4, product_type: "IOP", amount: 10000, match_source: "fuzzy" }),     // row 0: IOP, cash
  record({ customer_name: "Selvam", customer_id: 1, product_type: "EDI", amount: 500, match_source: "fuzzy" }),     // row 1: EDI
];
const CHECK_OK = { index: 0, principal: 9500, interest: 500, balance_before: 17000, balance_after: 7500, error: null };

async function reachRows(records: unknown[] = RECORDS) {
  ocr.extract.mockResolvedValue({ data: { page_image_b64: "AAAA", records: (records as object[]).map((r) => ({ ...r })) } });
  const user = userEvent.setup();
  const utils = render(<OcrPage />);
  await user.upload(utils.container.querySelector('input[type="file"]') as HTMLInputElement, new File(["%PDF-1.4"], "page.pdf", { type: "application/pdf" }));
  await user.click(await screen.findByRole("button", { name: /^Extract$/ }));
  await user.click(await screen.findByRole("button", { name: "Confirm Dates" }));
  await screen.findAllByPlaceholderText("Customer…");
  return { user, ...utils };
}
const customerInputs = () => screen.getAllByPlaceholderText("Customer…") as HTMLInputElement[];
const rowEl = (i: number) => customerInputs()[i].closest("tr") as HTMLElement;
const toggleOf = (i: number) => within(rowEl(i)).queryByTestId("split-toggle");
const principal = () => screen.getByRole("spinbutton", { name: "Principal" }) as HTMLInputElement;
const interest = () => screen.getByRole("spinbutton", { name: "Interest" }) as HTMLInputElement;
const savePost = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: /Save & Post/ }));
const submitted = () => ocr.submit.mock.calls[0][0].records as Record<string, unknown>[];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetConnectionStatus();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  ocr.upload.mockResolvedValue({ data: { session_id: "s1", total_pages: 1 } });
  ocr.getPage.mockResolvedValue({ data: { page_image_b64: "AAAA" } });
  ocr.submit.mockResolvedValue({ data: { submitted: 2, mapping_usage: 0, principal_added: 0 } });
  ocr.splitCheck.mockImplementation(async (records: { principal_amount: number }[]) => ({
    data: { rows: records.map((r, index) => ({ index, principal: r.principal_amount, interest: 10000 - r.principal_amount, balance_before: 17000, balance_after: 17000 - r.principal_amount, error: null })) },
  }));
  upi.list.mockResolvedValue({ data: { data: [], total: 0 } });
  upi.listVpaMappings.mockResolvedValue({ data: { data: [] } });
  training.saveOcr.mockResolvedValue({ data: { saved: 2, folder: "fintech/ocr/x", files: [] } });
});

describe("the split button (IP-01)", () => {
  it("only an IOP row has it; clicking opens and closes the panel under that row", async () => {
    const { user } = await reachRows();
    expect(toggleOf(0)).not.toBeNull();
    expect(toggleOf(1)).toBeNull();
    expect(screen.queryByTestId("split-panel")).toBeNull();
    await user.click(toggleOf(0)!);
    expect(await screen.findByTestId("split-panel")).toBeInTheDocument();
    expect(screen.getByTestId("split-total")).toHaveTextContent("₹10,000");
    expect(rowEl(0).nextElementSibling).toHaveAttribute("data-testid", "split-row");           // directly under its row
    await user.click(toggleOf(0)!);
    expect(screen.queryByTestId("split-panel")).toBeNull();
  });

  it("switching the row to EDI hides the button and drops the principal (IP-02)", async () => {
    const { user } = await reachRows();
    await user.click(toggleOf(0)!);
    await user.type(principal(), "9500");
    await user.click(within(rowEl(0)).getByRole("button", { name: "IOP" }));                   // the type badge toggles IOP -> EDI
    expect(toggleOf(0)).toBeNull();
    expect(screen.queryByTestId("split-panel")).toBeNull();
    await user.click(within(rowEl(0)).getByRole("button", { name: "EDI" }));                   // and back: nothing is remembered
    expect(within(rowEl(0)).queryByTestId("split-dot")).toBeNull();
  });
});

describe("typing the split (IP-03)", () => {
  it("principal fills interest and interest fills principal; a dot marks the row", async () => {
    const { user } = await reachRows();
    await user.click(toggleOf(0)!);
    await user.type(principal(), "9500");
    expect(interest()).toHaveValue(500);
    expect(within(rowEl(0)).getByTestId("split-dot")).toBeInTheDocument();
    await user.clear(interest());
    await user.type(interest(), "300");
    expect(principal()).toHaveValue(9700);
    await user.click(toggleOf(0)!);                                                            // closing keeps what was entered
    await user.click(toggleOf(0)!);
    expect(principal()).toHaveValue(9700);
  });

  it("the amount stays what was collected", async () => {
    const { user } = await reachRows();
    await user.click(toggleOf(0)!);
    await user.type(principal(), "9500");
    expect(within(rowEl(0)).getByRole("spinbutton", { name: "" })).toHaveValue(10000);        // the row's amount box (no label)
  });
});

describe("the live check (IP-04)", () => {
  it("asks the server (after a short pause) and shows the balance before and after", async () => {
    ocr.splitCheck.mockResolvedValue({ data: { rows: [CHECK_OK] } });
    const { user } = await reachRows();
    await user.click(toggleOf(0)!);
    await user.type(principal(), "9500");
    await waitFor(() => expect(screen.getByTestId("split-balance")).toHaveTextContent("Balance ₹17,000 → ₹7,500"));
    const last = ocr.splitCheck.mock.calls[ocr.splitCheck.mock.calls.length - 1][0];
    expect(last).toEqual([expect.objectContaining({ customer_id: 4, product_type: "IOP", amount: 10000, principal_amount: 9500, payment_mode: "CASH", is_paid: true })]);
  });

  it("is not asked for while no IOP row is open or split (the EDI row is never sent)", async () => {
    await reachRows();
    await new Promise((r) => setTimeout(r, 600));
    expect(ocr.splitCheck).not.toHaveBeenCalled();
  });

  it("a failing check is harmless: the panel still works", async () => {
    ocr.splitCheck.mockRejectedValue(new Error("500"));
    const { user } = await reachRows();
    await user.click(toggleOf(0)!);
    await user.type(principal(), "9500");
    await new Promise((r) => setTimeout(r, 600));
    expect(interest()).toHaveValue(500);
    expect(screen.queryByTestId("split-error")).toBeNull();
  });
});

describe("saving (IP-05 ... IP-08)", () => {
  it("sends the amount collected AND the principal; the toast says how much principal was added (IP-05)", async () => {
    ocr.submit.mockResolvedValue({ data: { submitted: 2, mapping_usage: 0, principal_added: 9500 } });
    const { user } = await reachRows();
    await user.click(toggleOf(0)!);
    await user.type(principal(), "9500");
    await savePost(user);
    await waitFor(() => expect(ocr.submit).toHaveBeenCalledTimes(1));
    const [ravi, selvam] = submitted();
    expect(ravi).toMatchObject({ customer_id: 4, product_type: "IOP", amount: 10000, principal_amount: 9500, is_paid: true });
    expect(selvam).toMatchObject({ customer_id: 1, product_type: "EDI", amount: 500, principal_amount: 0 });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("2 records saved · ₹9,500 principal added", { id: "t" }));
  });

  it("a row nobody split is sent with principal 0, exactly as before (IP-05)", async () => {
    const { user } = await reachRows();
    await savePost(user);
    await waitFor(() => expect(ocr.submit).toHaveBeenCalled());
    expect(submitted().map((r) => r.principal_amount)).toEqual([0, 0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("2 records saved", { id: "t" }));
  });

  it("an unpaid ONLINE IOP row has no principal: the boxes are off and it is sent with 0 (IP-06)", async () => {
    const { user } = await reachRows();
    await user.click(toggleOf(0)!);
    await user.type(principal(), "9500");
    await user.click(within(rowEl(0)).getByText("CSH"));                                       // -> ONLINE, unpaid until a UPI payment is paired
    expect(principal()).toBeDisabled();
    expect(screen.getByText("An unpaid row has no principal.")).toBeInTheDocument();
    await savePost(user);
    await waitFor(() => expect(ocr.submit).toHaveBeenCalled());
    expect(submitted()[0]).toMatchObject({ is_paid: false, principal_amount: 0 });
  });

  it("a principal above the amount is blocked by the page: nothing is sent, the panel is open and says why (IP-07)", async () => {
    const { user } = await reachRows();
    await user.click(toggleOf(0)!);
    await user.type(principal(), "12000");
    expect(screen.getByTestId("split-error")).toHaveTextContent("more than the amount collected ₹10,000");
    await user.click(toggleOf(0)!);                                                            // even with the panel closed ...
    await savePost(user);
    expect(ocr.submit).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Ravi: The principal ₹12,000 is more than the amount collected ₹10,000"));
    expect(await screen.findByTestId("split-panel")).toBeInTheDocument();                       // ... it is opened again
  });

  it("a principal above the customer's balance (the server's check) is blocked before anything is sent (IP-07)", async () => {
    const msg = "The principal ₹9,500 is more than the balance ₹5,000 of Ravi";
    ocr.splitCheck.mockResolvedValue({ data: { rows: [{ ...CHECK_OK, balance_before: 5000, balance_after: -4500, error: msg }] } });
    const { user } = await reachRows();
    await user.click(toggleOf(0)!);
    await user.type(principal(), "9500");
    expect(await screen.findByTestId("split-error")).toHaveTextContent(msg);
    await savePost(user);
    expect(ocr.submit).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(`Ravi: ${msg}`);
  });

  it("if the server refuses at submit, nothing was saved: it says so, opens that row and keeps the rows (IP-08)", async () => {
    ocr.submit.mockRejectedValue({ response: { status: 422, data: { detail: { code: "bad_principal", message: "The principal ₹9,500 is more than the balance ₹5,000 of Ravi", rows: [{ index: 0, message: "x" }] } } } });
    const { user } = await reachRows();
    await user.click(toggleOf(0)!);
    await user.type(principal(), "9500");
    await user.click(toggleOf(0)!);
    await savePost(user);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The principal ₹9,500 is more than the balance ₹5,000 of Ravi — nothing was saved", { id: "t" }));
    expect(await screen.findByTestId("split-panel")).toBeInTheDocument();
    expect(customerInputs()).toHaveLength(2);                                                  // the page still has its rows
  });

  it("another kind of failure still says 'Submit failed' (IP-08)", async () => {
    ocr.submit.mockRejectedValue({ response: { status: 500, data: {} } });
    const { user } = await reachRows();
    await savePost(user);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Submit failed", { id: "t" }));
  });
});

describe("two IOP rows of one customer (IP-09)", () => {
  it("both are sent to the check so they share the balance, each with its own principal", async () => {
    const two = [
      record({ customer_name: "Ravi", customer_id: 4, product_type: "IOP", amount: 6000, match_source: "fuzzy" }),
      record({ customer_name: "Ravi", customer_id: 4, product_type: "IOP", amount: 5000, payment_mode: "ONLINE", is_paid: true, match_source: "fuzzy" }),
    ];
    const { user } = await reachRows(two);
    await user.click(toggleOf(0)!);
    await user.type(principal(), "5000");
    await waitFor(() => expect(ocr.splitCheck).toHaveBeenCalled());
    const last = ocr.splitCheck.mock.calls[ocr.splitCheck.mock.calls.length - 1][0];
    expect(last).toHaveLength(2);
    expect(last.map((r: { principal_amount: number }) => r.principal_amount)).toEqual([5000, 0]);
  });
});

describe("on a phone (IP-10)", () => {
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("max-width: 767px"), media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  });

  it("the card has the same split button and panel, and the payload is the same", async () => {
    const user = userEvent.setup();
    const { container } = render(<OcrPage />);
    ocr.extract.mockResolvedValue({ data: { page_image_b64: "AAAA", records: RECORDS.map((r) => ({ ...r })) } });
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(["%PDF-1.4"], "page.pdf", { type: "application/pdf" }));
    await user.click(await screen.findByRole("button", { name: /^Extract$/ }));
    await user.click(await screen.findByRole("button", { name: "Confirm Dates" }));
    const toggles = await screen.findAllByTestId("split-toggle");
    expect(toggles).toHaveLength(1);                                                           // the IOP card only
    await user.click(toggles[0]);
    await user.type(principal(), "9500");
    expect(interest()).toHaveValue(500);
    await user.click(screen.getByRole("button", { name: /^Submit/ }));                          // the phone's button
    await waitFor(() => expect(ocr.submit).toHaveBeenCalled());
    expect(submitted()[0]).toMatchObject({ customer_id: 4, amount: 10000, principal_amount: 9500 });
  });
});
