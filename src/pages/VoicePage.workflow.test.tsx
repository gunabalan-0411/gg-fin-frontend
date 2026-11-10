/**
 * Type / Voice Entry: the UPI refresh, totals that follow what is typed, ONE Submit for EDI and IOP together, the Entered / All view,
 * and what follows a Submit (that day's expenses, then customer management). VW-01 ... VW-16.
 * The real VoicePage with only the network layer (and the two panels that follow a Submit, which have their own tests) mocked.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t") }) }));
vi.mock("@/components/expenses/ExpenseStepPanel", () => ({
  ExpenseStepPanel: (p: { dates: string[]; onDone: () => void; onSkip: () => void; onSkipAll: () => void }) => (
    <div data-testid="expense-step" data-dates={p.dates.join(",")}>
      <button onClick={p.onDone}>Expenses done</button><button onClick={p.onSkip}>Skip expenses</button><button onClick={p.onSkipAll}>Skip all steps</button>
    </div>
  ),
}));
vi.mock("@/components/CustomerStepOverlay", () => ({
  CustomerStepOverlay: (p: { onDone: () => void; onSkip: () => void; onSkipAll: () => void }) => (
    <div data-testid="customer-step"><button onClick={p.onDone}>Customers done</button><button onClick={p.onSkip}>Skip customers</button></div>
  ),
}));
vi.mock("@/services/api", () => {
  const ok = (data: unknown = {}) => vi.fn().mockResolvedValue({ data });
  return {
    voiceApi: {
      modelStatus: ok({ loaded: true, on_disk: true, downloading: false, download_progress: 100, idle_seconds: 0, seconds_until_unload: 60 }),
      modelLoad: ok(), modelUnload: ok(), modelReset: ok(), transcribe: vi.fn(), submit: vi.fn(), splitCheck: vi.fn(),
    },
    customersApi: {
      listEdi: ok({
        data: [
          { customer_id: 9, customer_name: "Selvam", outstanding_balance: 1000, customer_segment_id: 1, is_closed: false },
          { customer_id: 10, customer_name: "Kumar", outstanding_balance: 2000, customer_segment_id: 2, is_closed: false },
        ], total: 2,
      }),
      listIop: ok({ data: [{ customer_id: 1, customer_name: "Ravi", outstanding_balance: 20000, customer_segment_id: 1, is_closed: false }], total: 1 }),
      ediSegments: ok([{ segment_id: 1, name: "North" }, { segment_id: 2, name: "South" }]), iopSegments: ok([{ segment_id: 1, name: "North" }]),
    },
    transactionsApi: { listEdi: vi.fn(), listIop: vi.fn() },
    upiApi: { list: ok({ data: [] }), gmailSync: vi.fn() },
    driveApi: { status: ok({ connected: true, email: "owner@example.com" }) },
    trainingDataApi: { saveVoice: vi.fn(), saveOcr: vi.fn() },
  };
});

import { resetConnectionStatus } from "@/hooks/useConnectionStatus";
import { voiceApi, transactionsApi, upiApi } from "@/services/api";
import toast from "react-hot-toast";
import VoicePage from "./VoicePage";

type Fn = ReturnType<typeof vi.fn>;
const voice = voiceApi as unknown as Record<"submit" | "splitCheck", Fn>;
const ediTxns = (transactionsApi as unknown as { listEdi: Fn }).listEdi;
const iopTxns = (transactionsApi as unknown as { listIop: Fn }).listIop;
const upi = upiApi as unknown as Record<"list" | "gmailSync", Fn>;

beforeAll(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(), enumerateDevices: vi.fn().mockResolvedValue([]), addEventListener() {}, removeEventListener() {} },
  });
  (Element.prototype as any).scrollTo = () => {};
  (window as any).scrollTo = () => {};
});

const screenOf = (phone: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: phone && q.includes("max-width: 767px"), media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* fine */ }
  sessionStorage.clear();
  sessionStorage.setItem("voice.date", JSON.stringify("2026-10-17"));
  sessionStorage.setItem("voice.product", JSON.stringify("edi"));
  resetConnectionStatus();
  screenOf(false);
  ediTxns.mockResolvedValue({ data: [] });
  iopTxns.mockResolvedValue({ data: [] });
  voice.submit.mockResolvedValue({ data: { submitted: 1 } });
  voice.splitCheck.mockResolvedValue({ data: { rows: [] } });
  upi.list.mockResolvedValue({ data: { data: [] } });
  upi.gmailSync.mockResolvedValue({ data: { imported: 2, skipped: 1, total_found: 3 } });
});

function renderVoice() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><VoicePage /></QueryClientProvider>);
}
const amountOf = (name: string) =>
  screen.getByText(name).closest('div[style*="grid-template-columns"]')!.querySelector("input") as HTMLInputElement;
const type = (name: string, v: string) => fireEvent.change(amountOf(name), { target: { value: v } });
const switchTo = async (user: ReturnType<typeof userEvent.setup>, name: "EDI" | "IOP", who: string) => {
  await user.click(screen.getAllByRole("button", { name, exact: true } as any)[0]);
  await screen.findByText(who);
};
const stat = (label: string) => screen.getAllByTestId("voice-stat").find((c) => c.textContent?.toUpperCase().includes(label.toUpperCase()))!;
const submit = () => screen.getByRole("button", { name: /^Submit/ });

describe("UPI refresh (VW-01, VW-02)", () => {
  it("the desktop UPI panel has a Refresh button: it pulls the latest credits from Gmail, then reloads the day (VW-01)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    await waitFor(() => expect(upi.list).toHaveBeenCalled());
    const before = upi.list.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Refresh UPI" }));
    await waitFor(() => expect(upi.gmailSync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(upi.list.mock.calls.length).toBeGreaterThan(before));
    expect(toast.success).toHaveBeenCalledWith("Gmail synced — 2 new, 1 already imported");
  });

  it("when Gmail cannot be reached it says why, and the list is still reloaded (VW-02)", async () => {
    upi.gmailSync.mockRejectedValue({ response: { data: { detail: "Gmail is not connected" } } });
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    await waitFor(() => expect(upi.list).toHaveBeenCalled());
    const before = upi.list.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Refresh UPI" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Gmail is not connected"));
    await waitFor(() => expect(upi.list.mock.calls.length).toBeGreaterThan(before));
    expect(screen.getByRole("button", { name: "Refresh UPI" })).toBeEnabled();                    // not stuck spinning
  });
});

describe("totals follow what is typed (VW-03, VW-04)", () => {
  it("the cards and the dock add up as amounts are typed, EDI and IOP together (VW-03)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    expect(stat("Today")).toHaveTextContent("₹0");
    type("Selvam", "400");
    expect(stat("EDI")).toHaveTextContent("₹400");
    expect(stat("Today")).toHaveTextContent("₹400");
    expect(screen.getByTestId("dock-total")).toHaveTextContent("₹400");
    type("Kumar", "250");
    expect(stat("EDI")).toHaveTextContent("₹650");
    await switchTo(user, "IOP", "Ravi");
    expect(stat("EDI")).toHaveTextContent("₹650");                                                // what was typed for EDI is still counted
    type("Ravi", "700");
    expect(stat("IOP")).toHaveTextContent("₹700");
    expect(stat("Today")).toHaveTextContent("₹1,350");
    expect(screen.getByTestId("dock-total")).toHaveTextContent("₹1,350");
    expect(screen.getByTestId("dock-entries")).toHaveTextContent("3");
    expect(screen.getByTestId("dock-split")).toHaveTextContent("EDI 2 · IOP 1");
  });

  it("cash and GPay follow the mode of what is typed; clearing an amount takes it off again (VW-04)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    type("Selvam", "400");
    type("Kumar", "100");
    const row = amountOf("Kumar").closest('div[style*="grid-template-columns"]')!;
    await user.click(within(row as HTMLElement).getByRole("button", { name: /CASH/ }));            // Kumar pays online
    expect(stat("GPay")).toHaveTextContent("₹100");
    expect(stat("Cash")).toHaveTextContent("₹400");
    type("Kumar", "0");
    expect(stat("GPay")).toHaveTextContent("₹0");
    expect(stat("Today")).toHaveTextContent("₹400");
  });
});

describe("one Submit (VW-05 ... VW-08)", () => {
  it("the desktop page has a single Submit button (VW-05)", async () => {
    renderVoice();
    await screen.findByText("Selvam");
    expect(screen.getAllByRole("button", { name: /^Submit/ })).toHaveLength(1);
    expect(submit()).toBeDisabled();                                                              // nothing typed
    type("Selvam", "400");
    expect(submit()).toHaveTextContent("Submit 1 entries");
  });

  it("it saves what was typed for IOP and for EDI together - IOP first (VW-06)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    type("Selvam", "400");
    await switchTo(user, "IOP", "Ravi");
    type("Ravi", "700");
    expect(submit()).toHaveTextContent("Submit 2 entries");
    await user.click(submit());
    await waitFor(() => expect(voice.submit).toHaveBeenCalledTimes(2));
    const [first, second] = voice.submit.mock.calls;
    expect(first[2]).toBe("iop");
    expect(first[0]).toEqual([{ customer_id: 1, amount: 700, payment_mode: "CASH", principal_amount: 0 }]);
    expect(first[1]).toBe("2026-10-17");
    expect(second[2]).toBe("edi");
    expect(second[0]).toEqual([{ customer_id: 9, amount: 400, payment_mode: "CASH" }]);          // EDI sends no principal field
    expect(toast.success).toHaveBeenCalledWith("2 transactions saved (IOP 1 · EDI 1)");
  });

  it("with only one product typed, only that one is sent (VW-07)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    type("Selvam", "400");
    await user.click(submit());
    await waitFor(() => expect(voice.submit).toHaveBeenCalledTimes(1));
    expect(voice.submit.mock.calls[0][2]).toBe("edi");
    expect(toast.success).toHaveBeenCalledWith("1 transactions saved");
  });

  it("a refused IOP principal saves nothing at all, and shows the IOP table (VW-08)", async () => {
    voice.submit.mockRejectedValueOnce({ response: { data: { detail: { code: "bad_principal", message: "Principal is more than the balance", rows: [{ index: 0 }] } } } });
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    await switchTo(user, "IOP", "Ravi");
    type("Ravi", "700");
    await switchTo(user, "EDI", "Selvam");                                                        // looking at EDI when Submit is pressed
    type("Selvam", "400");
    await user.click(submit());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Principal is more than the balance"));
    expect(voice.submit).toHaveBeenCalledTimes(1);                                                // IOP went first, was refused, EDI never sent
    expect(voice.submit.mock.calls[0][2]).toBe("iop");
    await screen.findByText("Ravi");                                                              // the table with the problem is shown
    expect(screen.queryByTestId("expense-step")).toBeNull();
  });

  it("if EDI fails after IOP was saved it says so, and a second Submit sends only what is left (VW-09)", async () => {
    voice.submit.mockResolvedValueOnce({ data: { submitted: 1 } }).mockRejectedValueOnce(new Error("500"));
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    type("Selvam", "400");
    await switchTo(user, "IOP", "Ravi");
    type("Ravi", "700");
    await user.click(submit());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("EDI could not be saved - press Submit to try again"));
    expect(toast.success).toHaveBeenCalledWith("1 transactions saved");                           // the IOP part
    expect(screen.queryByTestId("expense-step")).toBeNull();                                      // not finished: no follow-up yet
    voice.submit.mockClear();
    await switchTo(user, "EDI", "Selvam");
    await user.click(submit());
    await waitFor(() => expect(voice.submit).toHaveBeenCalled());
    expect(voice.submit.mock.calls.map((c) => c[2])).toEqual(["edi"]);
  });
});

describe("the Entered / All view (VW-10 ... VW-12)", () => {
  it("All shows everybody; Entered only the customers with an amount, and a group with none is gone (VW-10)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    const toggle = screen.getByTestId("voice-view");
    expect(within(toggle).getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("North")).toBeInTheDocument();
    expect(screen.getByText("South")).toBeInTheDocument();
    type("Selvam", "400");
    expect(within(toggle).getByRole("button", { name: /^Entered/ })).toHaveTextContent("1");
    expect(within(toggle).getByRole("button", { name: /^All/ })).toHaveTextContent("2");
    await user.click(within(toggle).getByRole("button", { name: /^Entered/ }));
    expect(screen.getByText("Selvam")).toBeInTheDocument();
    expect(screen.queryByText("Kumar")).toBeNull();
    expect(screen.getByText("North")).toBeInTheDocument();
    expect(screen.queryByText("South")).toBeNull();
    await user.click(within(toggle).getByRole("button", { name: /^All/ }));
    expect(screen.getByText("Kumar")).toBeInTheDocument();
  });

  it("the Entered view keeps the row you are typing in until you leave it (VW-11)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    type("Selvam", "400");
    await user.click(within(screen.getByTestId("voice-view")).getByRole("button", { name: /^Entered/ }));
    const box = amountOf("Selvam");
    await user.clear(box);                                                                        // 0 for a moment while retyping
    expect(screen.getByText("Selvam")).toBeInTheDocument();
    await user.type(box, "450");
    await user.tab();
    expect(screen.getByText("Selvam")).toBeInTheDocument();
    expect(amountOf("Selvam")).toHaveValue("450");
  });

  it("with nothing entered it says so and offers all customers (VW-12)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    await user.click(within(screen.getByTestId("voice-view")).getByRole("button", { name: /^Entered/ }));
    expect(screen.getByTestId("nothing-entered")).toHaveTextContent("Nothing entered yet");
    expect(screen.queryByText("Selvam")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show all customers" }));
    expect(screen.getByText("Selvam")).toBeInTheDocument();
    expect(screen.queryByTestId("nothing-entered")).toBeNull();
  });
});

describe("after Submit: that day's expenses, then customers (VW-13 ... VW-15)", () => {
  it("the expense panel opens by itself for the day that was submitted (VW-13)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    expect(screen.queryByTestId("expense-step")).toBeNull();
    type("Selvam", "400");
    await user.click(submit());
    const panel = await screen.findByTestId("expense-step");
    expect(panel).toHaveAttribute("data-dates", "17-10-2026");
    expect(screen.queryByTestId("customer-step")).toBeNull();
  });

  it("when the expenses are done (or skipped) customer management follows; then everything closes (VW-14)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    type("Selvam", "400");
    await user.click(submit());
    await user.click(await screen.findByRole("button", { name: "Expenses done" }));
    expect(screen.queryByTestId("expense-step")).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Skip customers" }));
    expect(screen.queryByTestId("customer-step")).toBeNull();
    expect(screen.queryByTestId("expense-step")).toBeNull();
  });

  it("Skip on the expenses still offers customers, but skipping all ends it (VW-15)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    type("Selvam", "400");
    await user.click(submit());
    await user.click(await screen.findByRole("button", { name: "Skip expenses" }));
    expect(await screen.findByTestId("customer-step")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Customers done" }));
    type("Selvam", "500");                                                                         // a second round of the same day
    await user.click(submit());
    await user.click(await screen.findByRole("button", { name: "Skip all steps" }));
    expect(screen.queryByTestId("expense-step")).toBeNull();
    expect(screen.queryByTestId("customer-step")).toBeNull();
  });

  it("a failed Submit opens nothing (VW-16)", async () => {
    voice.submit.mockRejectedValue(new Error("500"));
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    type("Selvam", "400");
    await user.click(submit());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Submit failed"));
    expect(screen.queryByTestId("expense-step")).toBeNull();
  });
});

describe("on a phone (VW-17)", () => {
  it("has the Entered / All view, live totals in the strip, one Submit, and the same steps after it (VW-17)", async () => {
    screenOf(true);
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    const toggle = screen.getByTestId("voice-view");
    const box = (name: string) => screen.getByText(name).closest("div.rounded-xl")!.querySelector("input[inputmode='numeric']") as HTMLInputElement;
    fireEvent.change(box("Selvam"), { target: { value: "400" } });
    expect(screen.getByText("Total").parentElement).toHaveTextContent("₹400");                    // the strip follows what is typed
    await user.click(within(toggle).getByRole("button", { name: /^Entered/ }));
    expect(screen.queryByText("Kumar")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Submit/ })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /^Submit/ }));
    expect(await screen.findByTestId("expense-step")).toHaveAttribute("data-dates", "17-10-2026");
  });
});
