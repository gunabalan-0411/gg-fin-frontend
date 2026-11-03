/**
 * Monthly budget > Expense accounts: adding accounts, funds, matching with the bank, history, editing and deleting. AC-01 ... AC-14.
 * The real panel with only the network layer mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/services/api", () => ({
  personalApi: {
    accounts: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(), deleteAccount: vi.fn(),
    accountEntries: vi.fn(), addFund: vi.fn(), deleteEntry: vi.fn(), reconcile: vi.fn(),
  },
}));

import toast from "react-hot-toast";
import { personalApi } from "@/services/api";
import { AccountsPanel } from "./AccountsPanel";

type Fn = ReturnType<typeof vi.fn>;
const api = personalApi as unknown as Record<"accounts" | "createAccount" | "updateAccount" | "deleteAccount" | "accountEntries" | "addFund" | "deleteEntry" | "reconcile", Fn>;

const HDFC = { id: 1, name: "HDFC expenses", opening_balance: 25000, opening_date: "2026-10-01", balance_now: 29050, active: true, month_opening: 31500, funds: 0, adjustments: 0, spent: 2450, closing: 29050 };
const WALLET = { id: 2, name: "Cash wallet", opening_balance: 2000, opening_date: "2026-11-01", balance_now: 1850, active: true, month_opening: 2000, funds: 500, adjustments: -100, spent: 150, closing: 2250 };
const VIEW = (accounts: object[]) => ({
  month: "2026-11", accounts,
  totals: { month_opening: 33500, funds: 500, adjustments: -100, spent: 2600, closing: 31300, balance_now: 30900 },
});

const now = new Date();
const THIS = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const OLD = "2020-03";

function renderIt(month = THIS) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AccountsPanel month={month} /></QueryClientProvider>);
}
const row = (name: string) => screen.getAllByTestId("account-row").find((r) => r.textContent?.includes(name))!;
const act = (name: string, button: string | RegExp) => userEvent.click(within(row(name)).getByRole("button", { name: button }));

beforeEach(() => {
  vi.clearAllMocks();
  api.accounts.mockResolvedValue({ data: VIEW([HDFC, WALLET]) });
  api.createAccount.mockResolvedValue({ data: {} });
  api.updateAccount.mockResolvedValue({ data: {} });
  api.deleteAccount.mockResolvedValue({ data: {} });
  api.accountEntries.mockResolvedValue({ data: [] });
  api.addFund.mockResolvedValue({ data: {} });
  api.deleteEntry.mockResolvedValue({ data: {} });
  api.reconcile.mockResolvedValue({ data: {} });
});

describe("the accounts (AC-01 ... AC-04)", () => {
  it("shows start of month, funds, spent and the balance, with the total of all accounts (AC-01)", async () => {
    renderIt();
    await screen.findAllByTestId("account-row");
    const h = within(row("HDFC"));
    expect(h.getByTestId("account-balance")).toHaveTextContent("₹29,050");
    expect(row("HDFC")).toHaveTextContent("₹31,500");
    expect(row("HDFC")).toHaveTextContent("₹2,450");
    expect(api.accounts).toHaveBeenCalledWith(THIS);
    expect(screen.getByTestId("accounts-total-balance")).toHaveTextContent("₹31,300");
  });

  it("a bank adjustment is shown under the funds so the figures still add up (AC-02)", async () => {
    renderIt();
    await screen.findAllByTestId("account-row");
    expect(row("Cash wallet")).toHaveTextContent("adjusted −₹100");
    expect(row("HDFC")).not.toHaveTextContent("adjusted");
  });

  it("one account gets no 'all accounts' line, and a month before it opened says when it opens (AC-03)", async () => {
    const future = { ...WALLET, active: false, month_opening: null, closing: null, funds: 0, adjustments: 0, spent: 0 };
    api.accounts.mockResolvedValue({ data: { ...VIEW([HDFC, future]), totals: { ...VIEW([]).totals, closing: 29050 } } });
    renderIt();
    await screen.findAllByTestId("account-row");
    expect(row("Cash wallet")).toHaveTextContent("Opens 01 Nov 2026");
    expect(within(row("Cash wallet")).queryByTestId("account-balance")).toBeNull();
    expect(within(row("Cash wallet")).queryByRole("button", { name: "Add fund" })).toBeNull();
    expect(screen.queryByTestId("accounts-total")).toBeNull();                                  // only one account is live that month
  });

  it("the balance column is called Closing balance in a past month (AC-04)", async () => {
    renderIt(OLD);
    await screen.findAllByTestId("account-row");
    expect(screen.getByTestId("accounts-panel")).toHaveTextContent("Closing balance");
  });
});

describe("adding an account (AC-05, AC-06)", () => {
  it("with none yet it explains and offers to add one (AC-05)", async () => {
    api.accounts.mockResolvedValue({ data: VIEW([]) });
    const user = userEvent.setup();
    renderIt();
    expect(await screen.findByTestId("accounts-empty")).toHaveTextContent("No expense accounts yet");
    await user.click(within(screen.getByTestId("accounts-empty")).getByRole("button", { name: /Add account/ }));
    expect(screen.getByTestId("add-account-form")).toBeInTheDocument();
    expect(screen.queryByTestId("accounts-empty")).toBeNull();
  });

  it("sends the name, what it held and the day it held it; a name is required; a refusal is shown (AC-06)", async () => {
    api.accounts.mockResolvedValue({ data: VIEW([]) });
    const user = userEvent.setup();
    renderIt();
    await user.click(await screen.findByRole("button", { name: /Add account/ }));
    await user.click(screen.getByRole("button", { name: "Add account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give the account a name");
    expect(api.createAccount).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Name"), "  HDFC expenses ");
    await user.type(screen.getByLabelText("It held"), "25000");
    api.createAccount.mockRejectedValueOnce({ response: { data: { detail: "You already have an expense account with that name" } } });
    await user.click(screen.getByRole("button", { name: "Add account" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You already have an expense account with that name"));
    expect(screen.getByTestId("add-account-form")).toBeInTheDocument();                         // stays open so the name can be changed

    await user.click(screen.getByRole("button", { name: "Add account" }));
    await waitFor(() => expect(api.createAccount).toHaveBeenCalledTimes(2));
    expect(api.createAccount).toHaveBeenLastCalledWith({ name: "HDFC expenses", opening_balance: 25000, opening_date: `${THIS}-01` });
    await waitFor(() => expect(screen.queryByTestId("add-account-form")).toBeNull());
  });
});

describe("funds (AC-07, AC-08)", () => {
  it("adds a fund with the amount, the day and a note, then closes (AC-07)", async () => {
    const user = userEvent.setup();
    renderIt();
    await screen.findAllByTestId("account-row");
    await act("HDFC", "Add fund");
    await user.type(screen.getByLabelText("Amount added"), "5000");
    await user.type(screen.getByLabelText(/^Note/), "Salary");
    await user.click(within(screen.getByTestId("fund-form")).getByRole("button", { name: "Add fund" }));
    await waitFor(() => expect(api.addFund).toHaveBeenCalled());
    const [id, body] = api.addFund.mock.calls[0];
    expect(id).toBe(1);
    expect(body).toMatchObject({ amount: 5000, notes: "Salary" });
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => expect(screen.queryByTestId("fund-form")).toBeNull());
    expect(toast.success).toHaveBeenCalledWith("₹5,000 added to HDFC expenses");
  });

  it("will not add a fund of nothing (AC-08)", async () => {
    const user = userEvent.setup();
    renderIt();
    await screen.findAllByTestId("account-row");
    await act("HDFC", "Add fund");
    await user.click(within(screen.getByTestId("fund-form")).getByRole("button", { name: "Add fund" }));
    expect(screen.getByRole("alert")).toHaveTextContent("more than zero");
    expect(api.addFund).not.toHaveBeenCalled();
  });
});

describe("matching with the bank (AC-09 ... AC-11)", () => {
  const RESULT = (over: object) => ({ data: { as_of: "2026-11-03", tickbook_balance: 29050, bank_balance: 29050, difference: 0, matched: true, recorded: false, ...over } });

  it("says it matches when the bank shows the same (AC-09)", async () => {
    api.reconcile.mockResolvedValue(RESULT({}));
    const user = userEvent.setup();
    renderIt();
    await screen.findAllByTestId("account-row");
    await act("HDFC", /Match bank/);
    await user.type(screen.getByLabelText("Bank balance"), "29050");
    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByTestId("bank-matched")).toHaveTextContent("It matches. TickBook and the bank both show ₹29,050");
    expect(api.reconcile).toHaveBeenCalledWith(1, expect.objectContaining({ bank_balance: 29050, record: false }));
    expect(screen.queryByRole("button", { name: /^Record/ })).toBeNull();
  });

  it("when they differ it says by how much and which way, and only records when asked (AC-10)", async () => {
    api.reconcile.mockResolvedValueOnce(RESULT({ bank_balance: 28900, difference: -150, matched: false }));
    const user = userEvent.setup();
    renderIt();
    await screen.findAllByTestId("account-row");
    await act("HDFC", /Match bank/);
    await user.type(screen.getByLabelText("Bank balance"), "28900");
    await user.click(screen.getByRole("button", { name: "Compare" }));
    const differs = await screen.findByTestId("bank-differs");
    expect(differs).toHaveTextContent("TickBook shows ₹29,050");
    expect(differs).toHaveTextContent("the bank shows ₹28,900");
    expect(differs).toHaveTextContent("₹150 less");
    expect(api.reconcile).toHaveBeenCalledTimes(1);                                             // comparing recorded nothing
    api.reconcile.mockResolvedValueOnce(RESULT({ bank_balance: 28900, difference: -150, matched: false, recorded: true }));
    await user.click(screen.getByRole("button", { name: "Record −₹150 so TickBook matches" }));
    expect(await screen.findByTestId("bank-recorded")).toHaveTextContent("Recorded.");
    expect(api.reconcile).toHaveBeenLastCalledWith(1, expect.objectContaining({ bank_balance: 28900, record: true }));
  });

  it("the bank having more says more, and a changed figure clears the old answer (AC-11)", async () => {
    api.reconcile.mockResolvedValue(RESULT({ bank_balance: 29300, difference: 250, matched: false }));
    const user = userEvent.setup();
    renderIt();
    await screen.findAllByTestId("account-row");
    await act("HDFC", /Match bank/);
    await user.type(screen.getByLabelText("Bank balance"), "29300");
    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByTestId("bank-differs")).toHaveTextContent("₹250 more");
    expect(screen.getByRole("button", { name: "Record +₹250 so TickBook matches" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Bank balance"), "1");
    expect(screen.queryByTestId("bank-result")).toBeNull();
  });

  it("asks for the bank's balance first, and on a past month starts on that month's last day (AC-12)", async () => {
    const user = userEvent.setup();
    renderIt(OLD);
    await screen.findAllByTestId("account-row");
    await act("HDFC", /Match bank/);
    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type the balance the bank shows");
    expect(api.reconcile).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Bank balance"), "100");
    api.reconcile.mockResolvedValue({ data: { as_of: "2020-03-31", tickbook_balance: 100, bank_balance: 100, difference: 0, matched: true, recorded: false } });
    await user.click(screen.getByRole("button", { name: "Compare" }));
    await waitFor(() => expect(api.reconcile).toHaveBeenCalled());
    expect(api.reconcile.mock.calls[0][1].as_of).toBe("2020-03-31");
  });
});

describe("history, editing, deleting (AC-13, AC-14)", () => {
  it("lists funds and adjustments and removes one (AC-13)", async () => {
    api.accountEntries.mockResolvedValue({ data: [
      { id: 7, date: "2026-11-02", amount: -100, kind: "adjustment", notes: "Matched with the bank" },
      { id: 6, date: "2026-10-05", amount: 15000, kind: "fund", notes: "Salary transfer" },
    ] });
    const user = userEvent.setup();
    renderIt();
    await screen.findAllByTestId("account-row");
    await act("HDFC", /^History of/);
    const items = await screen.findAllByTestId("history-row");
    expect(items[0]).toHaveTextContent("Bank adjustment");
    expect(items[0]).toHaveTextContent("−₹100");
    expect(items[1]).toHaveTextContent("Fund · Salary transfer");
    expect(items[1]).toHaveTextContent("+₹15,000");
    await user.click(within(items[1]).getByRole("button", { name: /^Remove the fund of ₹15,000/ }));
    await waitFor(() => expect(api.deleteEntry).toHaveBeenCalledWith(1, 6));
  });

  it("only one account's panel is open at a time, and the same button closes it (AC-14)", async () => {
    const user = userEvent.setup();
    renderIt();
    await screen.findAllByTestId("account-row");
    await act("HDFC", "Add fund");
    await act("Cash wallet", /Match bank/);
    expect(screen.getAllByTestId("account-panel")).toHaveLength(1);
    expect(within(row("Cash wallet")).getByTestId("bank-form")).toBeInTheDocument();
    await act("Cash wallet", /Match bank/);
    expect(screen.queryByTestId("account-panel")).toBeNull();
    await user.click(within(row("HDFC")).getByRole("button", { name: /^Edit HDFC/ }));
    expect(screen.getByTestId("edit-form")).toBeInTheDocument();
  });

  it("editing sends the new name, balance and day; deleting asks first and says what happens (AC-15)", async () => {
    const user = userEvent.setup();
    renderIt();
    await screen.findAllByTestId("account-row");
    await act("HDFC", /^Edit HDFC/);
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Salary account");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateAccount).toHaveBeenCalledWith(1, { name: "Salary account", opening_balance: 25000, opening_date: "2026-10-01" }));

    await act("HDFC", /^Edit HDFC/);
    await user.click(screen.getByRole("button", { name: "Delete this account" }));
    expect(screen.getByTestId("delete-confirm")).toHaveTextContent("Expenses paid from it stay");
    expect(api.deleteAccount).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByTestId("delete-confirm")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Delete this account" }));
    await user.click(within(screen.getByTestId("delete-confirm")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteAccount).toHaveBeenCalledWith(1));
  });

  it("says so when the accounts cannot be read (AC-16)", async () => {
    api.accounts.mockRejectedValue(new Error("500"));
    renderIt();
    expect(await screen.findByText("Could not load your expense accounts")).toBeInTheDocument();
  });
});
