/**
 * Closing an account through Edit -> "Account Closed" must always be possible and must refresh the dashboard reports. CA-01 ... CA-04.
 *
 * Found with the live data (EDI #344): many old accounts have no segment filled in; the form demanded one even to close the account, so the
 * switch could not be saved. And the dashboard reports (reminders, defaulters) kept their cached copy after a customer changed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
import { customersApi } from "@/services/api";
import CustomersPage from "@/pages/CustomersPage";

type Fn = ReturnType<typeof vi.fn>;
const cust = customersApi as unknown as Record<"listEdi" | "listIop" | "updateEdi", Fn>;

// an old account like #344: loan open, nothing wrong with the money - but no segment
const OLD = {
  customer_id: 344, customer_name: "ramesh meen", customer_name_ta: "ரமேஷ் மீன்", tamil_name: "ரமேஷ் மீன்", customer_segment_id: null,
  loan_amount: 40000, disbursed_amount: 36000, interest: 4000, loan_start_date: "2023-08-23", month: "Aug 2023", outstanding_balance: 28300, is_closed: false,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  render(<QueryClientProvider client={qc}><CustomersPage /></QueryClientProvider>);
  return { spy };
}
const openEdit = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByText("ramesh meen");
  await user.click((document.querySelector("svg.lucide-pencil") as SVGElement).closest("button") as HTMLElement);
  await screen.findByRole("switch", { name: /Account Closed/ });
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  cust.listEdi.mockResolvedValue({ data: { data: [OLD], total: 1 } });
  cust.listIop.mockResolvedValue({ data: { data: [], total: 0 } });
  cust.updateEdi.mockResolvedValue({ data: {} });
});

describe("closing an account with a missing segment (CA)", () => {
  it("CA-01 switching Account Closed on and saving works even though the old account has no segment", async () => {
    const user = userEvent.setup();
    renderPage();
    await openEdit(user);
    await user.click(screen.getByRole("switch", { name: /Account Closed/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(cust.updateEdi).toHaveBeenCalledTimes(1));
    const [id, body] = cust.updateEdi.mock.calls[0];
    expect(id).toBe(344);
    expect(body).toMatchObject({ is_closed: true });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("CA-02 keeping the account OPEN still needs the segment (the rule is unchanged)", async () => {
    const user = userEvent.setup();
    renderPage();
    await openEdit(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Segment")));
    expect(cust.updateEdi).not.toHaveBeenCalled();
  });

  it("CA-03 after a customer is saved the dashboard reports are refreshed (reminders, defaulters)", async () => {
    const user = userEvent.setup();
    const { spy } = renderPage();
    await openEdit(user);
    await user.click(screen.getByRole("switch", { name: /Account Closed/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(cust.updateEdi).toHaveBeenCalled());
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["dashboard"] }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["customers", "edi"] });
  });

  it("CA-04 a failed save says why when the server explains it", async () => {
    cust.updateEdi.mockRejectedValue({ response: { data: { detail: "Customer not found" } } });
    const user = userEvent.setup();
    renderPage();
    await openEdit(user);
    await user.click(screen.getByRole("switch", { name: /Account Closed/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Customer not found"));
  });
});
