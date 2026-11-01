/**
 * Capital > Borrowings: the lender's own balance (and the date it is as of) a loan's balance is rolled forward from. DA-01 ... DA-05.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/services/api", () => ({
  debtsApi: {
    list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    listRepayments: vi.fn(), createRepayment: vi.fn(), updateRepayment: vi.fn(), deleteRepayment: vi.fn(),
  },
  investorsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

import { debtsApi } from "@/services/api";
import DebtsPage from "./DebtsPage";

const api = debtsApi as unknown as Record<"list" | "create" | "update" | "listRepayments", ReturnType<typeof vi.fn>>;

const LOAN = {
  id: 1, date: "2022-01-07", lender_name: "ICICI PL", borrower_name: "Suji", amount: 450000, emi_amount: 10000,
  interest_rate_pa: 13, tenure_months: 60, end_date: "2027-09-05", paid_by: "Business", total_repaid: 0,
  balance: 102468, balance_anchor: 202000, balance_anchor_date: "2025-10-24", notes: null,
};
const PLAIN = {
  ...LOAN, id: 2, lender_name: "HDFC PL", borrower_name: "Gu", balance: 763638, balance_anchor: null, balance_anchor_date: null,
};

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><DebtsPage /></QueryClientProvider>);
}

async function openEdit(lender: string) {
  const row = (await screen.findByText(lender)).closest("tr")!;
  await userEvent.click(within(row).getAllByRole("button")[1]);        // [0] expands the repayments, [1] is the pencil
  return screen.findByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  sessionStorage.clear();
  api.list.mockResolvedValue({ data: [LOAN, PLAIN] });
  api.update.mockResolvedValue({ data: LOAN });
  api.create.mockResolvedValue({ data: LOAN });
  api.listRepayments.mockResolvedValue({ data: [] });
});

describe("the lender's balance on a loan (DA-01 ... DA-05)", () => {
  it("shows what the lender said and when, only on loans that have it (DA-01)", async () => {
    renderIt();
    await screen.findByText("ICICI PL");
    const notes = screen.getAllByTestId("balance-anchor-note");
    expect(notes).toHaveLength(1);                                        // the HDFC PL has none
    expect(notes[0]).toHaveTextContent("lender: ₹2,02,000");
    expect(notes[0]).toHaveTextContent("2025");
    expect(screen.getByText("₹1,02,468")).toBeInTheDocument();           // the balance shown is the rolled-forward one the server sent
  });

  it("the edit form opens with the lender's balance and date filled in and saves them unchanged (DA-02)", async () => {
    renderIt();
    const dialog = await openEdit("ICICI PL");
    expect(within(dialog).getByLabelText("Lender balance")).toHaveValue(202000);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    const [id, body] = api.update.mock.calls[0];
    expect(id).toBe(1);
    expect(body).toMatchObject({ balance_anchor: 202000, balance_anchor_date: "2025-10-24", emi_amount: 10000 });
  });

  it("a newer lender balance is sent as typed (DA-03)", async () => {
    renderIt();
    const dialog = await openEdit("ICICI PL");
    const box = within(dialog).getByLabelText("Lender balance");
    await userEvent.clear(box);
    await userEvent.type(box, "150000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(api.update.mock.calls[0][1]).toMatchObject({ balance_anchor: 150000, balance_anchor_date: "2025-10-24" });
  });

  it("emptying the balance clears both and the loan goes back to the schedule (DA-04)", async () => {
    renderIt();
    const dialog = await openEdit("ICICI PL");
    await userEvent.clear(within(dialog).getByLabelText("Lender balance"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(api.update.mock.calls[0][1]).toMatchObject({ balance_anchor: null, balance_anchor_date: null });
  });

  it("a balance without its date cannot be saved (DA-05)", async () => {
    renderIt();
    const dialog = await openEdit("HDFC PL");
    await userEvent.type(within(dialog).getByLabelText("Lender balance"), "500000");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("both the lender's balance and the date");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(api.update).not.toHaveBeenCalled();
  });
});
