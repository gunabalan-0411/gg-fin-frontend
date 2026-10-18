/**
 * "Use existing UPI ids" on the Copy (Duplicate) form — in BOTH places that use it: the Customers tab and the OCR
 * "Customer" step. Covers CP-01 … CP-04: shown only when a CLOSED account is copied and the copy is saved as OPEN (and it
 * has saved UPI ids), ON by default, the ids move after the new account is created, and Undo / Redo move them back / again.
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
      listEdi: vi.fn(), listIop: vi.fn(), ediSegments: ok([{ segment_id: 1, name: "North" }]), iopSegments: ok([]),
      nextEdiId: ok({ next_id: 7 }), nextIopId: ok({ next_id: 7 }), createEdi: ok(), createIop: ok(),
      updateEdi: ok(), updateIop: ok(), deleteEdi: ok(), deleteIop: ok(), transliterate: ok({ tamil: "" }),
    },
    upiApi: { listVpaMappings: vi.fn(), moveVpaMappings: vi.fn() },
  };
});

import toast from "react-hot-toast";
import { customersApi, upiApi } from "@/services/api";
import CustomersPage from "@/pages/CustomersPage";
import { CustomerStepOverlay } from "@/components/CustomerStepOverlay";

const cust = customersApi as unknown as Record<"listEdi" | "nextEdiId" | "createEdi" | "deleteEdi", ReturnType<typeof vi.fn>>;
const upi = upiApi as unknown as Record<"listVpaMappings" | "moveVpaMappings", ReturnType<typeof vi.fn>>;

const account = (over: Record<string, unknown> = {}) => ({
  customer_id: 5, customer_name: "Selvam", customer_name_ta: "செல்வம்", tamil_name: "செல்வம்", customer_segment_id: 1,
  loan_amount: 10000, disbursed_amount: 9000, interest: 1000, loan_start_date: "2026-01-05", month: "Jan 2026",
  outstanding_balance: 0, is_closed: true, ...over,
});
const vpa = (id: number) => ({ id, upi_vpa: `p${id}@upi`, customer_id: 5, customer_type: "edi", customer_name: "Selvam" });

const SCREENS: [string, () => React.ReactElement][] = [
  ["Customers tab", () => <CustomersPage />],
  ["OCR Customer step", () => <CustomerStepOverlay onDone={() => {}} onSkip={() => {}} onSkipAll={() => {}} />],
];

function renderScreen(make: () => React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{make()}</QueryClientProvider>);
}

async function openCopy(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Selvam");
  await user.click(screen.getByTitle("Duplicate customer"));
  await screen.findByText(/Duplicate — Copy of #5/);
  await waitFor(() => expect(screen.getByDisplayValue("Selvam")).toBeInTheDocument());     // the form is prefilled
  await waitFor(() => expect(cust.nextEdiId).toHaveBeenCalled());
}

const reopen = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("switch", { name: /Account Closed/ }));
const saveButton = () => screen.getByRole("button", { name: "Save" });
const undo = () => screen.getByTitle(/^Undo/);
const redo = () => screen.getByTitle(/^Redo/);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  cust.listEdi.mockResolvedValue({ data: { data: [account()], total: 1 } });
  (customersApi as any).listIop.mockResolvedValue({ data: { data: [], total: 0 } });
  upi.listVpaMappings.mockResolvedValue({ data: { data: [vpa(1), vpa(2)] } });
  upi.moveVpaMappings.mockResolvedValue({ data: { moved: 2 } });
});

describe.each(SCREENS)("Use existing UPI ids — %s", (_name, make) => {
  it("is not shown while the copy of a closed account is still closed", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    expect(screen.getByRole("switch", { name: /Account Closed/ })).toHaveAttribute("aria-checked", "true");   // copied as closed
    expect(screen.queryByTestId("reuse-upi")).toBeNull();
  });

  it("appears — ON by default, with the count — when the copy is re-opened", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await reopen(user);
    const box = await screen.findByTestId("reuse-upi");
    expect(within(box).getByRole("switch", { name: "Use existing UPI ids" })).toHaveAttribute("aria-checked", "true");
    expect(within(box).getByTestId("reuse-upi-hint")).toHaveTextContent("2 saved UPI ids of the closed account will follow this account");
    expect(upi.listVpaMappings).toHaveBeenCalledWith({ customer_id: 5, customer_type: "edi" });
    await user.click(within(box).getByRole("switch", { name: "Use existing UPI ids" }));
    expect(within(box).getByTestId("reuse-upi-hint")).toHaveTextContent(/stay with the closed account/);
  });

  it("is never shown for a copy of an OPEN account, nor when the closed account has no saved UPI ids", async () => {
    const user = userEvent.setup();
    cust.listEdi.mockResolvedValue({ data: { data: [account({ is_closed: false })], total: 1 } });
    const first = renderScreen(make);
    await openCopy(user);
    expect(screen.queryByTestId("reuse-upi")).toBeNull();
    expect(upi.listVpaMappings).not.toHaveBeenCalled();
    first.unmount();

    cust.listEdi.mockResolvedValue({ data: { data: [account()], total: 1 } });
    upi.listVpaMappings.mockResolvedValue({ data: { data: [] } });
    renderScreen(make);
    await openCopy(user);
    await reopen(user);
    await waitFor(() => expect(upi.listVpaMappings).toHaveBeenCalled());
    expect(screen.queryByTestId("reuse-upi")).toBeNull();
  });

  it("ON: after the new account is created the closed account's UPI ids move to it", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await reopen(user);
    await screen.findByTestId("reuse-upi");
    await user.click(saveButton());

    await waitFor(() => expect(cust.createEdi).toHaveBeenCalledTimes(1));
    expect(cust.createEdi.mock.calls[0][0]).toMatchObject({ customer_id: 7, customer_name: "Selvam", is_closed: false });
    await waitFor(() => expect(upi.moveVpaMappings).toHaveBeenCalledTimes(1));
    expect(upi.moveVpaMappings).toHaveBeenCalledWith({ customer_type: "edi", from_customer_id: 5, to_customer_id: 7 });
    expect(cust.createEdi.mock.invocationCallOrder[0]).toBeLessThan(upi.moveVpaMappings.mock.invocationCallOrder[0]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("2 UPI ids moved to the new account"));
  });

  it("OFF: the new account is created and nothing moves — not even on Undo", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await reopen(user);
    await user.click(within(await screen.findByTestId("reuse-upi")).getByRole("switch", { name: "Use existing UPI ids" }));
    await user.click(saveButton());
    await waitFor(() => expect(cust.createEdi).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(upi.moveVpaMappings).not.toHaveBeenCalled();

    await user.click(undo());
    await waitFor(() => expect(cust.deleteEdi).toHaveBeenCalledWith(7, ...(make === SCREENS[0][1] ? [false] : [])));
    expect(upi.moveVpaMappings).not.toHaveBeenCalled();
  });

  it("copying a closed account and keeping it closed creates it and moves nothing", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await user.click(saveButton());
    await waitFor(() => expect(cust.createEdi).toHaveBeenCalledTimes(1));
    expect(cust.createEdi.mock.calls[0][0]).toMatchObject({ is_closed: true });
    await new Promise((r) => setTimeout(r, 30));
    expect(upi.moveVpaMappings).not.toHaveBeenCalled();
  });

  it("Undo moves the ids back to the closed account BEFORE deleting the new one; Redo creates it and moves them again (CP-04)", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await reopen(user);
    await screen.findByTestId("reuse-upi");
    await user.click(saveButton());
    await waitFor(() => expect(upi.moveVpaMappings).toHaveBeenCalledTimes(1));

    await user.click(undo());
    await waitFor(() => expect(cust.deleteEdi).toHaveBeenCalledTimes(1));
    expect(upi.moveVpaMappings).toHaveBeenCalledTimes(2);
    expect(upi.moveVpaMappings).toHaveBeenLastCalledWith({ customer_type: "edi", from_customer_id: 7, to_customer_id: 5 });
    expect(upi.moveVpaMappings.mock.invocationCallOrder[1]).toBeLessThan(cust.deleteEdi.mock.invocationCallOrder[0]);

    await user.click(redo());
    await waitFor(() => expect(cust.createEdi).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(upi.moveVpaMappings).toHaveBeenCalledTimes(3));
    expect(upi.moveVpaMappings).toHaveBeenLastCalledWith({ customer_type: "edi", from_customer_id: 5, to_customer_id: 7 });
    expect(cust.createEdi.mock.invocationCallOrder[1]).toBeLessThan(upi.moveVpaMappings.mock.invocationCallOrder[2]);
  });

  it("if the ids cannot be moved back, the new account is NOT deleted (they would point at nothing)", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await reopen(user);
    await screen.findByTestId("reuse-upi");
    await user.click(saveButton());
    await waitFor(() => expect(upi.moveVpaMappings).toHaveBeenCalledTimes(1));

    upi.moveVpaMappings.mockRejectedValueOnce(new Error("500"));
    await user.click(undo());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Undo failed"));
    expect(cust.deleteEdi).not.toHaveBeenCalled();
  });

  it("if the move fails after the account was created, the user is told", async () => {
    upi.moveVpaMappings.mockRejectedValue(new Error("500"));
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await reopen(user);
    await screen.findByTestId("reuse-upi");
    await user.click(saveButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Account created, but its UPI ids could not be moved"));
  });

  it("the toggle starts ON again every time the form is opened", async () => {
    const user = userEvent.setup();
    renderScreen(make);
    await openCopy(user);
    await reopen(user);
    await user.click(within(await screen.findByTestId("reuse-upi")).getByRole("switch", { name: "Use existing UPI ids" }));
    expect(screen.getByRole("switch", { name: "Use existing UPI ids" })).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByTitle("Duplicate customer"));
    await waitFor(() => expect(screen.getByDisplayValue("Selvam")).toBeInTheDocument());
    await reopen(user);
    expect(await screen.findByRole("switch", { name: "Use existing UPI ids" })).toHaveAttribute("aria-checked", "true");
  });
});
