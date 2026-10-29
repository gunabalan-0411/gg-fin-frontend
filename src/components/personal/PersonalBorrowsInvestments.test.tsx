/**
 * Personal Finance: Friendly borrows (what I owe) and Investments. PB-F01 ... PB-F16. The real sections with only the network layer mocked.
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
import { BorrowsSection, InvestmentsSection } from "./PersonalRecordSections";

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

describe("Friendly borrows - what I owe (PB-F01 ... PB-F07)", () => {
  const BORROWS = [
    { id: 1, from_whom: "Murugan", amount: "4000.00", pay_back_date: iso(-3), is_settled: false, notes: null },
    { id: 2, from_whom: "Selvi", amount: "1500.00", pay_back_date: iso(0), is_settled: false, notes: null },
    { id: 3, from_whom: "Babu", amount: "500.00", pay_back_date: iso(20), is_settled: false, notes: "bike repair" },
    { id: 4, from_whom: "Ganesh", amount: "9000.00", pay_back_date: iso(-30), is_settled: true, notes: null },
  ];

  it("asks the personal endpoint for borrows and shows an empty state (PB-F01)", async () => {
    renderIt(<BorrowsSection isMobile={false} />);
    expect(await screen.findByTestId("records-empty")).toHaveTextContent("You owe nobody");
    expect(api.records).toHaveBeenCalledWith("borrows");
    expect(screen.getByRole("heading", { name: "Friendly borrows" })).toBeInTheDocument();
  });

  it("shows owed to, amount, pay-back date; the summary counts only what is still owed (PB-F02)", async () => {
    api.records.mockResolvedValue({ data: BORROWS });
    renderIt(<BorrowsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    expect(rows[0]).toHaveTextContent("Murugan");
    expect(rows[0]).toHaveTextContent("₹4,000");
    expect(rows[2]).toHaveTextContent("bike repair");
    expect(screen.getByTestId("borrows-section-summary")).toHaveTextContent("You owe ₹6,000");   // 4,000 + 1,500 + 500; Ganesh is paid
    expect(screen.getByTestId("borrows-section-summary")).toHaveTextContent("3 people");
  });

  it("flags an overdue pay-back and one due today; a paid borrow shows Paid and no flag (PB-F03)", async () => {
    api.records.mockResolvedValue({ data: BORROWS });
    renderIt(<BorrowsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    expect(within(rows[0]).getByTestId("pay-back-flag")).toHaveTextContent("Overdue");
    expect(within(rows[1]).getByTestId("pay-back-flag")).toHaveTextContent("Today");
    expect(within(rows[2]).queryByTestId("pay-back-flag")).toBeNull();
    expect(rows[3]).toHaveTextContent("Paid");
    expect(within(rows[3]).queryByTestId("pay-back-flag")).toBeNull();
  });

  it("adds a borrow: owed to, amount, optional pay-back date; empty fields are refused (PB-F04)", async () => {
    const user = userEvent.setup();
    renderIt(<BorrowsSection isMobile={false} />);
    await user.click(await screen.findByRole("button", { name: /Add borrow/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("Enter who you owe");
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getAllByRole("textbox")[0], "  Kumar ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("Enter the amount");
    expect(api.createRecord).not.toHaveBeenCalled();
    await user.type(within(dialog).getByPlaceholderText("0"), "2500");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createRecord).toHaveBeenCalled());
    expect(lastBody(api.createRecord)).toEqual(["borrows", { from_whom: "Kumar", amount: 2500, pay_back_date: null, notes: null }]);   // no date chosen: none sent
  });

  it("the pay-back date can be cleared again on an existing borrow (PB-F05)", async () => {
    api.records.mockResolvedValue({ data: BORROWS });
    const user = userEvent.setup();
    renderIt(<BorrowsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    await user.click(within(rows[2]).getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Clear the pay-back date" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalled());
    expect(lastBody(api.updateRecord).slice(0, 2)).toEqual(["borrows", 3]);
    expect(lastBody(api.updateRecord)[2]).toMatchObject({ from_whom: "Babu", pay_back_date: null });
  });

  it("marks a borrow paid with one click, and back (PB-F06)", async () => {
    api.records.mockResolvedValue({ data: BORROWS });
    const user = userEvent.setup();
    renderIt(<BorrowsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    await user.click(within(rows[0]).getByRole("button", { name: "Mark as paid" }));
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalledWith("borrows", 1, { is_settled: true }));
    await user.click(within(rows[3]).getByRole("button", { name: "Mark as not paid" }));
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalledWith("borrows", 4, { is_settled: false }));
  });

  it("deleting asks first, then deletes that one (PB-F07)", async () => {
    api.records.mockResolvedValue({ data: BORROWS });
    const user = userEvent.setup();
    renderIt(<BorrowsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    await user.click(within(rows[1]).getByRole("button", { name: "Delete" }));
    expect(api.deleteRecord).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("confirm-delete"));
    await waitFor(() => expect(api.deleteRecord).toHaveBeenCalledWith("borrows", 2));
  });
});

describe("Investments (PB-F08 ... PB-F15)", () => {
  const INVESTMENTS = [
    { id: 1, name: "Nifty 50 index fund", inv_type: "mutual_fund", amount: "50000.00", current_value: "56000.00", invested_date: "2026-01-15", notes: null },
    { id: 2, name: "Reliance", inv_type: "stocks", amount: "20000.00", current_value: "18000.00", invested_date: "2025-06-01", notes: "long term" },
    { id: 3, name: "Temple chit", inv_type: "chit", amount: "10000.00", current_value: null, invested_date: null, notes: null },
  ];

  it("asks the personal endpoint for investments and shows an empty state (PB-F08)", async () => {
    renderIt(<InvestmentsSection isMobile={false} />);
    expect(await screen.findByTestId("records-empty")).toHaveTextContent("No investments added yet");
    expect(api.records).toHaveBeenCalledWith("investments");
  });

  it("lists name, type label, invested, current value, gain / loss and the date (PB-F09)", async () => {
    api.records.mockResolvedValue({ data: INVESTMENTS });
    renderIt(<InvestmentsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Nifty 50 index fund");
    expect(rows[0]).toHaveTextContent("Mutual fund");
    expect(rows[0]).toHaveTextContent("₹50,000");
    expect(rows[0]).toHaveTextContent("₹56,000");
    expect(within(rows[0]).getByTestId("gain")).toHaveTextContent("+₹6,000 (+12%)");
    expect(rows[0]).toHaveTextContent("15 Jan 2026");
    expect(within(rows[1]).getByTestId("gain")).toHaveTextContent("−₹2,000 (-10%)");
    expect(rows[2]).toHaveTextContent("Chit");
  });

  it("a holding without a current value shows a dash, not a made-up gain (PB-F10)", async () => {
    api.records.mockResolvedValue({ data: INVESTMENTS });
    renderIt(<InvestmentsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    expect(within(rows[2]).queryByTestId("gain")).toBeNull();
    expect(rows[2]).toHaveTextContent("—");
  });

  it("the summary: invested over everything, worth-now and gain over the valued holdings only, with a note for the rest (PB-F11)", async () => {
    api.records.mockResolvedValue({ data: INVESTMENTS });
    renderIt(<InvestmentsSection isMobile={false} />);
    await screen.findAllByTestId("record");
    const summary = screen.getByTestId("investments-section-summary");
    expect(summary).toHaveTextContent("Invested ₹80,000 in 3 holdings");            // 50,000 + 20,000 + 10,000
    expect(summary).toHaveTextContent("worth now ₹74,000");                          // 56,000 + 18,000 (the chit has no value)
    expect(screen.getByTestId("investments-gain")).toHaveTextContent("gain +₹4,000 (+5.7%)");   // 74,000 - 70,000
    expect(screen.getByTestId("investments-unvalued")).toHaveTextContent("1 without a current value");
  });

  it("with no current value anywhere there is no worth-now or gain, only what was invested (PB-F12)", async () => {
    api.records.mockResolvedValue({ data: [INVESTMENTS[2]] });
    renderIt(<InvestmentsSection isMobile={false} />);
    await screen.findAllByTestId("record");
    const summary = screen.getByTestId("investments-section-summary");
    expect(summary).toHaveTextContent("Invested ₹10,000 in 1 holding");
    expect(summary).not.toHaveTextContent("worth now");
    expect(screen.queryByTestId("investments-gain")).toBeNull();
    expect(screen.queryByTestId("investments-unvalued")).toBeNull();
  });

  it("adds an investment with a type; name and amount are required, current value is optional (PB-F13)", async () => {
    const user = userEvent.setup();
    renderIt(<InvestmentsSection isMobile={false} />);
    await user.click(await screen.findByRole("button", { name: /Add investment/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("Enter the name of the investment");
    await user.type(screen.getByPlaceholderText("e.g. Nifty 50 index fund"), "SBI FD");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast.error).toHaveBeenCalledWith("Enter the amount invested");
    expect(api.createRecord).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "fixed_deposit");
    await user.type(screen.getByPlaceholderText("0"), "100000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createRecord).toHaveBeenCalled());
    const [kind, body] = lastBody(api.createRecord);
    expect(kind).toBe("investments");
    expect(body).toMatchObject({ name: "SBI FD", inv_type: "fixed_deposit", amount: 100000, current_value: null, notes: null });
    expect(body.invested_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("editing holds the values; emptying the current value sends null so it is cleared (PB-F14)", async () => {
    api.records.mockResolvedValue({ data: INVESTMENTS });
    const user = userEvent.setup();
    renderIt(<InvestmentsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    await user.click(within(rows[0]).getByRole("button", { name: "Edit" }));
    expect(screen.getByDisplayValue("Nifty 50 index fund")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("mutual_fund");
    const value = screen.getByDisplayValue("56000");
    await user.clear(value);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalled());
    expect(lastBody(api.updateRecord).slice(0, 2)).toEqual(["investments", 1]);
    expect(lastBody(api.updateRecord)[2]).toMatchObject({ name: "Nifty 50 index fund", inv_type: "mutual_fund", amount: 50000, current_value: null });
  });

  it("deleting asks first, then deletes that one (PB-F15)", async () => {
    api.records.mockResolvedValue({ data: INVESTMENTS });
    const user = userEvent.setup();
    renderIt(<InvestmentsSection isMobile={false} />);
    const rows = await screen.findAllByTestId("record");
    await user.click(within(rows[1]).getByRole("button", { name: "Delete" }));
    expect(api.deleteRecord).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("confirm-delete"));
    await waitFor(() => expect(api.deleteRecord).toHaveBeenCalledWith("investments", 2));
  });
});

describe("on a phone (PB-F16)", () => {
  it("both new sections become cards", async () => {
    api.records.mockImplementation(async (kind: string) => ({
      data: kind === "borrows" ? [{ id: 1, from_whom: "Murugan", amount: "100", pay_back_date: null, is_settled: false, notes: null }]
        : [{ id: 1, name: "Gold coin", inv_type: "gold", amount: "5000", current_value: null, invested_date: null, notes: null }],
    }));
    const { unmount } = renderIt(<BorrowsSection isMobile />);
    expect(await screen.findByTestId("records-cards")).toHaveTextContent("Murugan");
    unmount();
    renderIt(<InvestmentsSection isMobile />);
    expect(await screen.findByTestId("records-cards")).toHaveTextContent("Gold coin");
  });
});
