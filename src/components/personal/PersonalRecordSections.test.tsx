/**
 * Personal Finance: Savings, Friendly lends, Gifts received. PS-01 ... PS-20. The real sections with only the network layer mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/services/api", () => ({
  personalApi: { records: vi.fn(), createRecord: vi.fn(), updateRecord: vi.fn(), deleteRecord: vi.fn() },
}));

import toast from "react-hot-toast";
import { personalApi } from "@/services/api";
import { GiftsSection, LendsSection, SavingsSection } from "./PersonalRecordSections";

const api = personalApi as unknown as Record<"records" | "createRecord" | "updateRecord" | "deleteRecord", ReturnType<typeof vi.fn>>;

function renderIt(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
const lastBody = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)!;
const iso = (offsetDays: number) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10); };

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  api.records.mockResolvedValue({ data: [] });
  api.createRecord.mockResolvedValue({ data: {} });
  api.updateRecord.mockResolvedValue({ data: {} });
  api.deleteRecord.mockResolvedValue({});
});

describe("Savings (PS-01 ... PS-06)", () => {
  const SAVINGS = [
    { id: 1, amount: "25000.00", bank: "HDFC", account_name: "Salary", balance_date: "2026-10-20", notes: null },
    { id: 2, amount: "10000.50", bank: "SBI", account_name: "Joint", balance_date: "2026-09-01", notes: "FD ends in March" },
  ];

  it("asks the personal endpoint for savings only and shows an empty state (PS-01)", async () => {
    renderIt(<SavingsSection isMobile={false} />);
    expect(await screen.findByTestId("records-empty")).toHaveTextContent("No savings added yet");
    expect(api.records).toHaveBeenCalledWith("savings");
  });

  it("lists bank, account name, amount and the balance date, with the total and the account count (PS-02)", async () => {
    api.records.mockResolvedValue({ data: SAVINGS });
    renderIt(<SavingsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("HDFC");
    expect(rows[0]).toHaveTextContent("Salary");
    expect(rows[0]).toHaveTextContent("₹25,000");
    expect(rows[0]).toHaveTextContent("20 Oct 2026");
    expect(screen.getByTestId("savings-section-summary")).toHaveTextContent("₹35,001");
    expect(screen.getByTestId("savings-section-summary")).toHaveTextContent("2 accounts");
  });

  it("adds a saving with amount, bank, account name and the last recorded balance date (PS-03)", async () => {
    const user = userEvent.setup();
    renderIt(<SavingsSection isMobile={false} />);
    await user.click(await screen.findByRole("button", { name: /Add savings/ }));
    await user.type(screen.getByPlaceholderText("e.g. HDFC"), "  ICICI ");
    await user.type(screen.getByPlaceholderText("e.g. Salary account"), "Emergency");
    await user.type(screen.getByPlaceholderText("0"), "50000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createRecord).toHaveBeenCalled());
    const [kind, body] = lastBody(api.createRecord);
    expect(kind).toBe("savings");
    expect(body).toMatchObject({ bank: "ICICI", account_name: "Emergency", amount: 50000, notes: null });
    expect(body.balance_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("will not save without a bank, an account name or an amount (PS-04)", async () => {
    const user = userEvent.setup();
    renderIt(<SavingsSection isMobile={false} />);
    await user.click(await screen.findByRole("button", { name: /Add savings/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("Enter the bank");
    await user.type(screen.getByPlaceholderText("e.g. HDFC"), "SBI");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("Enter the account name");
    await user.type(screen.getByPlaceholderText("e.g. Salary account"), "Main");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("Enter the amount");
    expect(api.createRecord).not.toHaveBeenCalled();
  });

  it("edits a saving: the form holds its values and the update goes to that id (PS-05)", async () => {
    api.records.mockResolvedValue({ data: SAVINGS });
    const user = userEvent.setup();
    renderIt(<SavingsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    await user.click(within(rows[1]).getByRole("button", { name: "Edit" }));
    expect(screen.getByDisplayValue("SBI")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Joint")).toBeInTheDocument();
    const amount = screen.getByDisplayValue("10000.5");
    await user.clear(amount);
    await user.type(amount, "12000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalled());
    expect(lastBody(api.updateRecord).slice(0, 2)).toEqual(["savings", 2]);
    expect(lastBody(api.updateRecord)[2]).toMatchObject({ amount: 12000, bank: "SBI", notes: "FD ends in March" });
  });

  it("deleting asks first, then deletes that one (PS-06)", async () => {
    api.records.mockResolvedValue({ data: SAVINGS });
    const user = userEvent.setup();
    renderIt(<SavingsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    await user.click(within(rows[0]).getByRole("button", { name: "Delete" }));
    expect(api.deleteRecord).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("confirm-delete"));
    await waitFor(() => expect(api.deleteRecord).toHaveBeenCalledWith("savings", 1));
  });
});

describe("Friendly lends (PS-07 ... PS-12)", () => {
  const LENDS = [
    { id: 1, to_whom: "Karthik", amount: "5000.00", follow_up_date: iso(-3), is_settled: false, notes: null },
    { id: 2, to_whom: "Suresh", amount: "2000.00", follow_up_date: iso(0), is_settled: false, notes: null },
    { id: 3, to_whom: "Mani", amount: "1000.00", follow_up_date: iso(20), is_settled: false, notes: null },
    { id: 4, to_whom: "Ravi", amount: "9000.00", follow_up_date: iso(-30), is_settled: true, notes: null },
  ];

  it("shows to whom, amount and the next follow-up date; the summary counts only what is still to come back (PS-07)", async () => {
    api.records.mockResolvedValue({ data: LENDS });
    renderIt(<LendsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    expect(rows[0]).toHaveTextContent("Karthik");
    expect(rows[0]).toHaveTextContent("₹5,000");
    expect(screen.getByTestId("lends-section-summary")).toHaveTextContent("₹8,000");        // 5,000 + 2,000 + 1,000; Ravi is repaid
    expect(screen.getByTestId("lends-section-summary")).toHaveTextContent("3 people");
  });

  it("flags an overdue follow-up and one due today; a repaid lend shows Repaid and no flag (PS-08)", async () => {
    api.records.mockResolvedValue({ data: LENDS });
    renderIt(<LendsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    expect(within(rows[0]).getByTestId("follow-up-flag")).toHaveTextContent("Overdue");
    expect(within(rows[1]).getByTestId("follow-up-flag")).toHaveTextContent("Today");
    expect(within(rows[2]).queryByTestId("follow-up-flag")).toBeNull();
    expect(rows[3]).toHaveTextContent("Repaid");
    expect(within(rows[3]).queryByTestId("follow-up-flag")).toBeNull();
  });

  it("adds a lend: to whom, amount and an optional follow-up date (PS-09)", async () => {
    const user = userEvent.setup();
    renderIt(<LendsSection isMobile={false} />);
    await user.click(await screen.findByRole("button", { name: /Add lend/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("Enter who it was lent to");
    const dialog = screen.getByRole("dialog");
    const [toWhom, amount] = within(dialog).getAllByRole("textbox").length ? [within(dialog).getAllByRole("textbox")[0], within(dialog).getByPlaceholderText("0")] : [];
    await user.type(toWhom!, "Gopal");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("Enter the amount");
    await user.type(amount!, "3000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createRecord).toHaveBeenCalled());
    expect(lastBody(api.createRecord)).toEqual(["lends", { to_whom: "Gopal", amount: 3000, follow_up_date: null, notes: null }]);   // no date chosen: none sent
  });

  it("the follow-up date can be cleared again on an existing lend (PS-10)", async () => {
    api.records.mockResolvedValue({ data: LENDS });
    const user = userEvent.setup();
    renderIt(<LendsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    await user.click(within(rows[2]).getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Clear the follow-up date" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalled());
    expect(lastBody(api.updateRecord)[2]).toMatchObject({ to_whom: "Mani", follow_up_date: null });
  });

  it("marks a lend repaid with one click, and back (PS-11)", async () => {
    api.records.mockResolvedValue({ data: LENDS });
    const user = userEvent.setup();
    renderIt(<LendsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    await user.click(within(rows[0]).getByRole("button", { name: "Mark as repaid" }));
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalledWith("lends", 1, { is_settled: true }));
    await user.click(within(rows[3]).getByRole("button", { name: "Mark as not repaid" }));
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalledWith("lends", 4, { is_settled: false }));
  });

  it("empty and delete (PS-12)", async () => {
    const user = userEvent.setup();
    api.records.mockResolvedValueOnce({ data: [] });
    const { unmount } = renderIt(<LendsSection isMobile={false} />);
    expect(await screen.findByTestId("records-empty")).toHaveTextContent("No friendly lends yet");
    unmount();
    api.records.mockResolvedValue({ data: LENDS });
    renderIt(<LendsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    await user.click(within(rows[1]).getByRole("button", { name: "Delete" }));
    await user.click(screen.getByTestId("confirm-delete"));
    await waitFor(() => expect(api.deleteRecord).toHaveBeenCalledWith("lends", 2));
  });
});

describe("Gifts received (PS-13 ... PS-19)", () => {
  const GIFTS = [
    { id: 1, gift_type: "money", amount: "2000.00", gold_grams: null, item_name: null, occasion: "Birthday", gift_from: "Uncle", received_date: "2026-09-01", notes: null },
    { id: 2, gift_type: "gold", amount: null, gold_grams: "8.000", item_name: null, occasion: "Wedding", gift_from: "Aunt", received_date: "2026-05-10", notes: null },
    { id: 3, gift_type: "other", amount: null, gold_grams: null, item_name: "Wall clock", occasion: "Housewarming", gift_from: "Friends", received_date: null, notes: null },
  ];

  it("shows each kind its own way and the totals by kind (PS-13)", async () => {
    api.records.mockResolvedValue({ data: GIFTS });
    renderIt(<GiftsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    expect(rows[0]).toHaveTextContent("₹2,000");
    expect(rows[1]).toHaveTextContent("Gold · 8 g");
    expect(rows[2]).toHaveTextContent("Wall clock");
    expect(rows[0]).toHaveTextContent("Birthday");
    expect(rows[0]).toHaveTextContent("Uncle");
    expect(screen.getByTestId("gifts-section-summary")).toHaveTextContent("₹2,000 money");
    expect(screen.getByTestId("gifts-section-summary")).toHaveTextContent("8 g gold");
    expect(screen.getByTestId("gifts-section-summary")).toHaveTextContent("1 other gift");
  });

  it("a money gift asks how much and sends only the amount (PS-14)", async () => {
    const user = userEvent.setup();
    renderIt(<GiftsSection isMobile={false} />);
    await user.click(await screen.findByRole("button", { name: /Add gift/ }));
    expect(screen.getByText("How much (₹)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("Enter how much money");
    await user.type(screen.getByPlaceholderText("0"), "5000");
    await user.type(screen.getByPlaceholderText("e.g. Birthday, Wedding"), "Wedding");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createRecord).toHaveBeenCalled());
    expect(lastBody(api.createRecord)[1]).toMatchObject({ gift_type: "money", amount: 5000, gold_grams: null, item_name: null, occasion: "Wedding", gift_from: null });
  });

  it("choosing Gold asks for grams instead; the money box is gone (PS-15)", async () => {
    const user = userEvent.setup();
    renderIt(<GiftsSection isMobile={false} />);
    await user.click(await screen.findByRole("button", { name: /Add gift/ }));
    await user.click(screen.getByRole("button", { name: "Gold" }));
    expect(screen.getByText("How much gold (grams)")).toBeInTheDocument();
    expect(screen.queryByText("How much (₹)")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("Enter how many grams of gold");
    await user.type(screen.getByPlaceholderText("0"), "4.5");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createRecord).toHaveBeenCalled());
    expect(lastBody(api.createRecord)[1]).toMatchObject({ gift_type: "gold", gold_grams: 4.5, amount: null, item_name: null });
  });

  it("choosing Other asks for the name of the gift (PS-16)", async () => {
    const user = userEvent.setup();
    renderIt(<GiftsSection isMobile={false} />);
    await user.click(await screen.findByRole("button", { name: /Add gift/ }));
    await user.click(screen.getByRole("button", { name: "Other" }));
    expect(screen.getByText("Name of the gift")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("Enter the name of the gift");
    await user.type(screen.getByPlaceholderText("e.g. Wall clock"), "Silk saree");
    await user.type(screen.getByPlaceholderText("e.g. Birthday, Wedding"), "Diwali");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createRecord).toHaveBeenCalled());
    expect(lastBody(api.createRecord)[1]).toMatchObject({ gift_type: "other", item_name: "Silk saree", amount: null, gold_grams: null, occasion: "Diwali" });
  });

  it("occasion, giver and notes are optional (PS-17)", async () => {
    const user = userEvent.setup();
    renderIt(<GiftsSection isMobile={false} />);
    await user.click(await screen.findByRole("button", { name: /Add gift/ }));
    await user.type(screen.getByPlaceholderText("0"), "100");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createRecord).toHaveBeenCalled());
    expect(lastBody(api.createRecord)[1]).toMatchObject({ occasion: null, gift_from: null, notes: null });
  });

  it("editing a gold gift opens on Gold with its grams; switching to Money sends the money and drops the gold (PS-18)", async () => {
    api.records.mockResolvedValue({ data: GIFTS });
    const user = userEvent.setup();
    renderIt(<GiftsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    await user.click(within(rows[1]).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Gold" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("8")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Money" }));
    await user.type(screen.getByPlaceholderText("0"), "30000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalled());
    expect(lastBody(api.updateRecord)[2]).toMatchObject({ gift_type: "money", amount: 30000, gold_grams: null, item_name: null });
  });

  it("a refusal from the server is shown as the server says it (PS-19)", async () => {
    api.createRecord.mockRejectedValue({ response: { data: { detail: "money gift: how much is required" } } });
    const user = userEvent.setup();
    renderIt(<GiftsSection isMobile={false} />);
    await user.click(await screen.findByRole("button", { name: /Add gift/ }));
    await user.type(screen.getByPlaceholderText("0"), "100");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("money gift: how much is required"));
  });
});

describe("on a phone (PS-20)", () => {
  it("each record is a card with the first column as its title", async () => {
    api.records.mockResolvedValue({ data: [{ id: 1, to_whom: "Karthik", amount: "5000.00", follow_up_date: "2030-01-01", is_settled: false, notes: null }] });
    renderIt(<LendsSection isMobile />);
    const cards = await screen.findByTestId("records-cards");
    expect(cards).toHaveTextContent("Karthik");
    expect(cards).toHaveTextContent("Next follow-up");
    expect(cards.querySelector("table")).toBeNull();
  });
});
