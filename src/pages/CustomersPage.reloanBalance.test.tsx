/**
 * Re-loan / Duplicate with a negative (or zero) balance. RB-01 ... RB-13, in BOTH places that use the form (Customers tab, OCR Customer step).
 *
 * The bug: the copy was pre-filled with the OLD account's balance. When that was negative (an overpaid account) the server created the copy
 * already CLOSED, so it vanished from the active list and the carry-over could not run. Now a copy starts a fresh loan (balance = the loan
 * amount; IOP: nothing paid), the balance follows the loan amount until it is typed over, and an open account with nothing left to pay is
 * refused with a plain message before anything is sent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t") }) }));
vi.mock("@/services/api", () => {
  const ok = (data: unknown = {}) => vi.fn().mockResolvedValue({ data });
  return {
    customersApi: {
      listEdi: vi.fn(), listIop: vi.fn(), ediSegments: ok([{ segment_id: 1, name: "North" }]), iopSegments: ok([{ segment_id: 1, name: "North" }]),
      nextEdiId: ok({ next_id: 7 }), nextIopId: ok({ next_id: 7 }), createEdi: ok(), createIop: ok(),
      updateEdi: ok(), updateIop: ok(), deleteEdi: ok(), deleteIop: ok(), transliterate: ok({ tamil: "" }),
    },
    upiApi: { listVpaMappings: vi.fn(), moveVpaMappings: vi.fn() },
    nameMappingsApi: { carryPreview: vi.fn(), carryForward: vi.fn(), undoCarryForward: vi.fn() },
  };
});

import toast from "react-hot-toast";
import { customersApi, nameMappingsApi, upiApi } from "@/services/api";
import CustomersPage from "@/pages/CustomersPage";
import { CustomerStepOverlay } from "@/components/CustomerStepOverlay";

type Fn = ReturnType<typeof vi.fn>;
const cust = customersApi as unknown as Record<"listEdi" | "listIop" | "nextEdiId" | "nextIopId" | "createEdi" | "createIop" | "updateEdi", Fn>;
const upi = upiApi as unknown as Record<"listVpaMappings" | "moveVpaMappings", Fn>;
const names = nameMappingsApi as unknown as Record<"carryPreview", Fn>;

const account = (over: Record<string, unknown> = {}) => ({
  customer_id: 5, customer_name: "Selvam", customer_name_ta: "செல்வம்", tamil_name: "செல்வம்", customer_segment_id: 1,
  loan_amount: 10000, disbursed_amount: 9000, interest: 1000, loan_start_date: "2026-01-05", month: "Jan 2026",
  outstanding_balance: -2000, is_closed: false, ...over,
});
const iopAccount = (over: Record<string, unknown> = {}) => ({
  customer_id: 5, customer_name: "Selvam", customer_name_ta: "செல்வம்", tamil_name: "செல்வம்", customer_segment_id: 1,
  loan_amount: 100000, disbursed_amount: 100000, interest: 2000, interest_payment_frequency: 1, principal_paid: 120000,
  loan_start_date: "2026-01-05", month: "Jan 2026", outstanding_balance: -20000, is_closed: false, ...over,
});

const SCREENS: [string, () => React.ReactElement][] = [
  ["Customers tab", () => <CustomersPage />],
  ["OCR Customer step", () => <CustomerStepOverlay onDone={() => {}} onSkip={() => {}} onSkipAll={() => {}} />],
];

function renderScreen(make: () => React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{make()}</QueryClientProvider>);
}
type U = ReturnType<typeof userEvent.setup>;

/** Duplicate -> (an open account asks "Close the old account?" -> Yes) -> the form, with its id and values ready. */
async function openCopy(user: U, ask = true) {
  await screen.findByText("Selvam");
  await user.click(screen.getByTitle("Duplicate customer"));
  if (ask) await user.click(await screen.findByTestId("close-old-yes"));
  await screen.findByText(/Duplicate — Copy of #5/);
  await waitFor(() => expect(screen.getByDisplayValue("Selvam")).toBeInTheDocument());
  await waitFor(() => expect(screen.getByDisplayValue("7")).toBeInTheDocument());          // the new id arrived
}
// scoped to the form: the table behind it has column headings with the same words
const box = (label: string) => within(document.querySelector("form") as HTMLElement).getByText(new RegExp(`^${label}`)).parentElement!.querySelector("input") as HTMLInputElement;
const typeOver = async (user: U, label: string, value: string) => { const el = box(label); await user.clear(el); await user.type(el, value); };
const saveButton = () => screen.getByRole("button", { name: "Save" });
const save = async (user: U) => { await waitFor(() => expect(saveButton()).toBeEnabled()); await user.click(saveButton()); };
const closedSwitch = () => screen.getByRole("switch", { name: /Account Closed/ });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  cust.listEdi.mockResolvedValue({ data: { data: [account()], total: 1 } });
  cust.listIop.mockResolvedValue({ data: { data: [], total: 0 } });
  cust.createEdi.mockResolvedValue({ data: {} });
  cust.createIop.mockResolvedValue({ data: {} });
  upi.listVpaMappings.mockResolvedValue({ data: { data: [] } });
  upi.moveVpaMappings.mockResolvedValue({ data: { moved: 0 } });
  names.carryPreview.mockResolvedValue({ data: { customer: { id: 5, name: "Selvam", is_closed: false, finance_type: "EDI" }, aliases: [], mismatches: [] } });
});

describe.each(SCREENS)("A copy starts a fresh loan - %s", (_name, make) => {
  it("RB-01 the copy of an overpaid (negative) account shows the NEW loan's balance, not the old negative one", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    expect(box("Outstanding Balance").value).toBe("10000");                  // = the loan amount
    expect(screen.queryByDisplayValue("-2000")).toBeNull();
  });

  it("RB-02 saving it sends an OPEN account with the fresh balance - not a closed one with -2000", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await save(user);
    await waitFor(() => expect(cust.createEdi).toHaveBeenCalledTimes(1));
    expect(cust.createEdi.mock.calls[0][0]).toMatchObject({ customer_id: 7, customer_name: "Selvam", loan_amount: 10000, outstanding_balance: 10000, is_closed: false });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("RB-03 an old balance that is still positive is not carried either: the copy is a new loan", async () => {
    cust.listEdi.mockResolvedValue({ data: { data: [account({ outstanding_balance: 8000 })], total: 1 } });
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    expect(box("Outstanding Balance").value).toBe("10000");
  });

  it("RB-04 changing the loan amount of the copy moves its balance with it, until the balance is typed over", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await typeOver(user, "Loan Amount", "12000");
    await waitFor(() => expect(box("Outstanding Balance").value).toBe("12000"));
    await save(user);
    await waitFor(() => expect(cust.createEdi).toHaveBeenCalled());
    expect(cust.createEdi.mock.calls[0][0]).toMatchObject({ loan_amount: 12000, outstanding_balance: 12000 });
  });

  it("RB-05 once the balance is typed over it stays as typed, even if the loan amount changes afterwards", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await typeOver(user, "Outstanding Balance", "3000");
    await typeOver(user, "Loan Amount", "12000");
    expect(box("Outstanding Balance").value).toBe("3000");
    await save(user);
    await waitFor(() => expect(cust.createEdi).toHaveBeenCalled());
    expect(cust.createEdi.mock.calls[0][0]).toMatchObject({ loan_amount: 12000, outstanding_balance: 3000 });
  });

  it("RB-06 a balance of zero or less on an OPEN account is stopped with a plain message - nothing is sent", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    for (const bad of ["-500", "0"]) {
      await typeOver(user, "Outstanding Balance", bad);
      await save(user);
      expect(toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/zero or less.*already closed.*Account Closed/));
    }
    expect(cust.createEdi).not.toHaveBeenCalled();
    expect(screen.getByText(/Duplicate — Copy of #5/)).toBeInTheDocument();       // the form stays open so it can be corrected
  });

  it("RB-07 with Account Closed switched ON a zero balance is fine (the person meant it)", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await typeOver(user, "Outstanding Balance", "0");
    await user.click(closedSwitch());
    await save(user);
    await waitFor(() => expect(cust.createEdi).toHaveBeenCalledTimes(1));
    expect(cust.createEdi.mock.calls[0][0]).toMatchObject({ outstanding_balance: 0, is_closed: true });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("RB-08 copying an already CLOSED account (balance 0): reopening it gives the fresh balance, so it is created open", async () => {
    cust.listEdi.mockResolvedValue({ data: { data: [account({ is_closed: true, outstanding_balance: 0 })], total: 1 } });
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user, false);
    expect(box("Outstanding Balance").value).toBe("10000");
    await user.click(closedSwitch());                                              // reopen
    await save(user);
    await waitFor(() => expect(cust.createEdi).toHaveBeenCalledTimes(1));
    expect(cust.createEdi.mock.calls[0][0]).toMatchObject({ outstanding_balance: 10000, is_closed: false });
  });

  it("RB-09 'No, keep it open' gets the same fresh balance", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await screen.findByText("Selvam");
    await user.click(screen.getByTitle("Duplicate customer"));
    await user.click(await screen.findByTestId("close-old-no"));
    await screen.findByText(/Duplicate — Copy of #5/);
    await waitFor(() => expect(screen.getByDisplayValue("7")).toBeInTheDocument());
    expect(box("Outstanding Balance").value).toBe("10000");
  });

  it("RB-10 the re-loan runs to the end: new account created open, then the old one is closed", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await save(user);
    await waitFor(() => expect(cust.updateEdi).toHaveBeenCalledWith(5, { is_closed: true }));
    expect(cust.createEdi.mock.invocationCallOrder[0]).toBeLessThan(cust.updateEdi.mock.invocationCallOrder[0]);
    expect(cust.createEdi.mock.calls[0][0]).toMatchObject({ is_closed: false });
  });

  it("RB-11 when the server refuses, its reason is what the person reads (not just 'Failed')", async () => {
    cust.createEdi.mockRejectedValue({ response: { data: { detail: "The balance to pay on this new account is zero or less" } } });
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await save(user);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The balance to pay on this new account is zero or less"));
  });
});

describe("IOP copies (Customers tab)", () => {
  async function openIopCopy(user: U, over: Record<string, unknown> = {}) {
    cust.listIop.mockResolvedValue({ data: { data: [iopAccount(over)], total: 1 } });
    renderScreen(SCREENS[0][1]);
    await user.click(await screen.findByRole("button", { name: /^IOP/ }));
    await screen.findByText("Selvam");
    await user.click(screen.getByTitle("Duplicate customer"));
    await user.click(await screen.findByTestId("close-old-yes"));
    await screen.findByText(/Duplicate — Copy of #5/);
    await waitFor(() => expect(screen.getByDisplayValue("7")).toBeInTheDocument());
  }

  it("RB-12 an IOP copy starts with nothing paid, even if the old account's principal paid was over the loan", async () => {
    const user = userEvent.setup();
    await openIopCopy(user);
    expect(box("Principal Paid").value).toBe("0");
    await save(user);
    await waitFor(() => expect(cust.createIop).toHaveBeenCalledTimes(1));
    expect(cust.createIop.mock.calls[0][0]).toMatchObject({ customer_id: 7, loan_amount: 100000, is_closed: false });
    expect(Number(cust.createIop.mock.calls[0][0].principal_paid ?? 0)).toBe(0);
    expect(cust.createIop.mock.calls[0][0]).not.toHaveProperty("outstanding_balance");
  });

  it("RB-13 principal paid equal to or over the loan on an open IOP copy is stopped with a plain message", async () => {
    const user = userEvent.setup();
    await openIopCopy(user);
    await typeOver(user, "Principal Paid", "100000");
    await save(user);
    expect(toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/Principal paid is not less than the loan.*Account Closed/));
    expect(cust.createIop).not.toHaveBeenCalled();
  });
});
