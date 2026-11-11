/**
 * A customer's transaction list: tick rows, "Delete selected". TD-01 ... TD-09.
 * (The server side - balance / principal follow, all-or-nothing - is tested in the backend: tests/test_bulk_delete_transactions.py.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t") }) }));
vi.mock("@/services/api", () => ({
  customersApi: { ediTransactions: vi.fn(), iopTransactions: vi.fn() },
  transactionsApi: { bulkDeleteEdi: vi.fn(), bulkDeleteIop: vi.fn() },
  upiApi: {}, nameMappingsApi: {},
}));

import toast from "react-hot-toast";
import { customersApi, transactionsApi } from "@/services/api";
import { CustomerDetailModal } from "@/pages/CustomersPage";
import type { EdiCustomer, IopCustomer } from "@/types";

type Fn = ReturnType<typeof vi.fn>;
const api = customersApi as unknown as Record<"ediTransactions" | "iopTransactions", Fn>;
const bulk = transactionsApi as unknown as Record<"bulkDeleteEdi" | "bulkDeleteIop", Fn>;

const tx = (id: number, date: string, amount: number, status = "PAID", principal?: number) =>
  ({ transaction_id: id, customer_id: 964, collection_date: date, amount, payment_mode: "ONLINE", payment_status: status, ...(principal !== undefined ? { principal_amount: principal } : {}) });
const EDI_ROWS = [tx(10, "2026-10-09", 200), tx(11, "2026-10-08", 200), tx(12, "2026-10-06", 200), tx(13, "2026-10-05", 1500), tx(14, "2026-10-04", 500, "UNPAID")];

const EDI_CUSTOMER = { customer_id: 964, customer_name: "Chinna Raja", tamil_name: "சின்ன ராஜா", loan_amount: 15000, loan_start_date: "2026-05-14", is_closed: false } as unknown as EdiCustomer;
const IOP_CUSTOMER = { customer_id: 964, customer_name: "Chinna Raja", tamil_name: "சின்ன ராஜா", loan_amount: 20000, principal_paid: 12500, outstanding_balance: 7500, loan_start_date: "2026-05-14", is_closed: false } as unknown as IopCustomer;

function renderModal(product: "edi" | "iop" = "edi") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  render(<QueryClientProvider client={qc}><CustomerDetailModal customer={product === "edi" ? EDI_CUSTOMER : IOP_CUSTOMER} product={product} onClose={() => {}} /></QueryClientProvider>);
  return { spy };
}
const rows = () => screen.getAllByTestId("txn-row");
const tick = async (user: ReturnType<typeof userEvent.setup>, id: number, opts: { shift?: boolean } = {}) => {
  if (opts.shift) await user.keyboard("{Shift>}");
  await user.click(screen.getByTestId(`txn-select-${id}`));
  if (opts.shift) await user.keyboard("{/Shift}");
};

beforeEach(() => {
  vi.clearAllMocks();
  api.ediTransactions.mockResolvedValue({ data: EDI_ROWS });
  bulk.bulkDeleteEdi.mockResolvedValue({ data: { deleted: 2 } });
  bulk.bulkDeleteIop.mockResolvedValue({ data: { deleted: 1 } });
});

describe("select rows and delete them (TD)", () => {
  it("TD-01 every row has a checkbox, there is a select-all, and the selection shows how many and how much", async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findAllByTestId("txn-row");
    expect(rows()).toHaveLength(5);
    expect(screen.getByTestId("txn-select-all")).toBeInTheDocument();
    expect(screen.queryByTestId("txn-selection-bar")).not.toBeInTheDocument();
    await tick(user, 10);
    await tick(user, 13);
    expect(screen.getByTestId("txn-selected-count")).toHaveTextContent("2 selected");
    expect(screen.getByTestId("txn-selected-count")).toHaveTextContent("₹1,700");
    await tick(user, 10);                                                    // un-tick
    expect(screen.getByTestId("txn-selected-count")).toHaveTextContent("1 selected");
  });

  it("TD-02 Delete selected asks first; 'Yes, delete' sends the ticked ids for THIS customer and refreshes everything that shows them", async () => {
    const user = userEvent.setup();
    const { spy } = renderModal();
    await screen.findAllByTestId("txn-row");
    await tick(user, 10); await tick(user, 12);
    await user.click(screen.getByTestId("txn-delete-selected"));
    expect(bulk.bulkDeleteEdi).not.toHaveBeenCalled();                       // only a question so far
    expect(screen.getByText(/Delete 2 transactions for good\?/)).toBeInTheDocument();
    await user.click(screen.getByTestId("txn-delete-confirm"));
    await waitFor(() => expect(bulk.bulkDeleteEdi).toHaveBeenCalledTimes(1));
    expect(bulk.bulkDeleteEdi).toHaveBeenCalledWith(964, [10, 12]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("2 transactions deleted"));
    for (const key of [["customer-txns", "edi", 964], ["customers", "edi"], ["transactions", "edi"], ["dashboard"]]) {
      expect(spy).toHaveBeenCalledWith({ queryKey: key });
    }
    expect(screen.queryByTestId("txn-selection-bar")).not.toBeInTheDocument();    // selection cleared
  });

  it("TD-03 Cancel keeps everything", async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findAllByTestId("txn-row");
    await tick(user, 11);
    await user.click(screen.getByTestId("txn-delete-selected"));
    await user.click(screen.getByTestId("txn-delete-cancel"));
    expect(bulk.bulkDeleteEdi).not.toHaveBeenCalled();
    expect(screen.getByTestId("txn-selected-count")).toHaveTextContent("1 selected");
    expect(screen.getByTestId("txn-delete-selected")).toBeInTheDocument();           // back to the first button
  });

  it("TD-04 select-all ticks every row shown; it follows the All / Paid Only filter, and changing the filter clears the ticks", async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findAllByTestId("txn-row");
    await user.click(screen.getByRole("button", { name: "Paid Only" }));
    expect(rows()).toHaveLength(4);
    await user.click(screen.getByTestId("txn-select-all"));
    expect(screen.getByTestId("txn-selected-count")).toHaveTextContent("4 selected");
    expect(screen.queryByTestId("txn-select-14")).not.toBeInTheDocument();           // the unpaid one is not shown, so not ticked
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.queryByTestId("txn-selection-bar")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("txn-select-all"));
    expect(screen.getByTestId("txn-selected-count")).toHaveTextContent("5 selected");
    await user.click(screen.getByTestId("txn-select-all"));                          // again: all off
    expect(screen.queryByTestId("txn-selection-bar")).not.toBeInTheDocument();
  });

  it("TD-05 Shift + click ticks the whole stretch between two clicks", async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findAllByTestId("txn-row");
    await tick(user, 10);
    await tick(user, 13, { shift: true });
    expect(screen.getByTestId("txn-selected-count")).toHaveTextContent("4 selected");     // rows 10, 11, 12, 13
    expect(screen.getByTestId("txn-select-14")).not.toBeChecked();
  });

  it("TD-06 the server refusing shows its reason and deletes nothing from the screen", async () => {
    bulk.bulkDeleteEdi.mockRejectedValue({ response: { data: { detail: "Some of those transactions do not belong to this customer or were already deleted. Nothing was deleted." } } });
    const user = userEvent.setup();
    renderModal();
    await screen.findAllByTestId("txn-row");
    await tick(user, 10);
    await user.click(screen.getByTestId("txn-delete-selected"));
    await user.click(screen.getByTestId("txn-delete-confirm"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Nothing was deleted")));
    expect(rows()).toHaveLength(5);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("TD-07 EDI: after deleting, the rows are read again and Outstanding follows the remaining payments", async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findAllByTestId("txn-row");
    const outstanding = () => (screen.getByText("Outstanding").parentElement as HTMLElement);
    expect(outstanding()).toHaveTextContent("₹12,900");                               // 15,000 - (200 + 200 + 200 + 1,500)
    await tick(user, 10); await tick(user, 12);
    await user.click(screen.getByTestId("txn-delete-selected"));
    api.ediTransactions.mockResolvedValue({ data: EDI_ROWS.filter((t) => ![10, 12].includes(t.transaction_id)) });
    await user.click(screen.getByTestId("txn-delete-confirm"));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(outstanding()).toHaveTextContent("₹13,300");                               // 15,000 - (200 + 1,500)
  });

  it("TD-08 IOP: it uses the IOP endpoint and the Outstanding goes back up by the principal of the deleted rows", async () => {
    api.iopTransactions.mockResolvedValue({ data: [tx(20, "2026-10-01", 500, "PAID", 9500), tx(21, "2026-10-02", 500, "PAID", 0)] });
    const user = userEvent.setup();
    renderModal("iop");
    await screen.findAllByTestId("txn-row");
    const stats = screen.getByText("Outstanding").parentElement as HTMLElement;
    expect(stats).toHaveTextContent("₹7,500");
    await tick(user, 20);
    await user.click(screen.getByTestId("txn-delete-selected"));
    expect(screen.getByText(/Their principal is taken back/)).toBeInTheDocument();
    api.iopTransactions.mockResolvedValue({ data: [tx(21, "2026-10-02", 500, "PAID", 0)] });
    await user.click(screen.getByTestId("txn-delete-confirm"));
    await waitFor(() => expect(bulk.bulkDeleteIop).toHaveBeenCalledWith(964, [20]));
    await waitFor(() => expect(within(screen.getByText("Outstanding").parentElement as HTMLElement).getByText("₹17,000")).toBeInTheDocument());   // 7,500 + 9,500
    expect(bulk.bulkDeleteEdi).not.toHaveBeenCalled();
  });

  it("TD-09 no transactions: no select-all to press, no bar", async () => {
    api.ediTransactions.mockResolvedValue({ data: [] });
    renderModal();
    await screen.findByText("No transactions found");
    expect(screen.getByTestId("txn-select-all")).toBeDisabled();
    expect(screen.queryByTestId("txn-selection-bar")).not.toBeInTheDocument();
  });
});
