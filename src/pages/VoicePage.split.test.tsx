/**
 * The Type / Voice Entry page: an IOP row can be split into principal + interest, just like on the OCR page. VS-F01 ... VS-F12.
 * The real VoicePage with only the network layer mocked.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t") }) }));
vi.mock("@/services/api", () => {
  const ok = (data: unknown = {}) => vi.fn().mockResolvedValue({ data });
  return {
    voiceApi: {
      modelStatus: ok({ loaded: true, on_disk: true, downloading: false, download_progress: 100, idle_seconds: 0, seconds_until_unload: 60 }),
      modelLoad: ok(), modelUnload: ok(), modelReset: ok(), transcribe: vi.fn(), submit: vi.fn(), splitCheck: vi.fn(),
    },
    customersApi: {
      listEdi: ok({ data: [{ customer_id: 9, customer_name: "Selvam", outstanding_balance: 1000, customer_segment_id: 1, is_closed: false }], total: 1 }),
      listIop: ok({ data: [{ customer_id: 1, customer_name: "Ravi", outstanding_balance: 20000, customer_segment_id: 1, is_closed: false }], total: 1 }),
      ediSegments: ok([]), iopSegments: ok([]),
    },
    transactionsApi: { listEdi: ok([]), listIop: vi.fn() },
    upiApi: { list: ok({ data: [] }) },
    driveApi: { status: ok({ connected: true, email: "owner@example.com" }) },
    trainingDataApi: { saveVoice: vi.fn(), saveOcr: vi.fn() },
  };
});

import { resetConnectionStatus } from "@/hooks/useConnectionStatus";
import { voiceApi, transactionsApi, customersApi } from "@/services/api";
import toast from "react-hot-toast";
import VoicePage from "./VoicePage";

const voice = voiceApi as unknown as Record<"submit" | "splitCheck", ReturnType<typeof vi.fn>>;
const iopTxns = (transactionsApi as unknown as { listIop: ReturnType<typeof vi.fn> }).listIop;
const listIopCustomers = (customersApi as unknown as { listIop: ReturnType<typeof vi.fn> }).listIop;

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

const checkOf = (principal: number, balance = 20000) => ({
  rows: [{ index: 0, principal, interest: 0, balance_before: balance, balance_after: balance - principal, error: principal > balance ? `Principal ₹${principal} is more than the balance ₹${balance}` : null }],
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem("voice.date", JSON.stringify("2026-10-17"));
  sessionStorage.setItem("voice.product", JSON.stringify("iop"));
  resetConnectionStatus();
  screenOf(false);
  iopTxns.mockResolvedValue({ data: [] });
  voice.submit.mockResolvedValue({ data: { submitted: 1 } });
  voice.splitCheck.mockImplementation(async (records: any[]) => ({ data: checkOf(Number(records[0]?.principal_amount) || 0) }));
});

function renderVoice() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><VoicePage /></QueryClientProvider>);
}
const amountBox = () => screen.getAllByDisplayValue("0")[0] as HTMLInputElement;
const typeAmount = (v: string) => fireEvent.change(amountBox(), { target: { value: v } });
const submitButton = () => screen.getAllByRole("button", { name: /^Submit/ }).at(-1)!;       // desktop has a Submit in the top bar and in the dock

describe("the split button (VS-F01 ... VS-F03)", () => {
  it("an IOP row has the Split button; the panel is closed until it is clicked (VS-F01)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Ravi");
    expect(screen.getByTestId("split-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("split-panel")).toBeNull();
    await user.click(screen.getByTestId("split-toggle"));
    expect(screen.getByTestId("split-panel")).toBeInTheDocument();
  });

  it("an EDI row has no Split button (VS-F02)", async () => {
    sessionStorage.setItem("voice.product", JSON.stringify("edi"));
    renderVoice();
    await screen.findByText("Selvam");
    expect(screen.queryByTestId("split-toggle")).toBeNull();
  });

  it("typing the principal gives the interest, and the other way round; they add up to the amount (VS-F03)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Ravi");
    typeAmount("10000");
    await user.click(screen.getByTestId("split-toggle"));
    const panel = screen.getByTestId("split-panel");
    fireEvent.change(within(panel).getByLabelText("Principal"), { target: { value: "9500" } });
    expect(within(panel).getByLabelText("Interest")).toHaveValue(500);
    fireEvent.change(within(panel).getByLabelText("Interest"), { target: { value: "1000" } });
    expect(within(panel).getByLabelText("Principal")).toHaveValue(9000);
    expect(within(panel).getByTestId("split-total")).toHaveTextContent("₹10,000");
    expect(screen.getByTestId("split-dot")).toBeInTheDocument();
  });

  it("a principal bigger than the amount is paid ON TOP: amount 200 + principal 8,000 = 8,200 with interest 200, never a negative interest (VS-F03b)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Ravi");
    typeAmount("200");
    await user.click(screen.getByTestId("split-toggle"));
    const panel = screen.getByTestId("split-panel");
    await user.click(within(panel).getByLabelText("Principal"));
    await user.keyboard("8000");
    expect(screen.getByDisplayValue("8200")).toBeInTheDocument();                         // the row's amount grew
    expect(within(panel).getByLabelText("Interest")).toHaveValue(200);
    expect(within(panel).getByTestId("split-total")).toHaveTextContent("₹8,200");
    expect(screen.queryByTestId("split-error")).toBeNull();
    await user.clear(within(panel).getByLabelText("Principal"));
    expect(screen.queryByDisplayValue("8200")).toBeNull();                                // emptied: back to the original amount 200
    expect(screen.getAllByDisplayValue("200")).toHaveLength(2);                           // (the amount box and the interest box)
  });
});

describe("submitting a split (VS-F04 ... VS-F07)", () => {
  it("sends the amount collected with the principal, and says how much principal was added (VS-F04)", async () => {
    const user = userEvent.setup();
    voice.submit.mockResolvedValue({ data: { submitted: 1, principal_added: 9500 } });
    renderVoice();
    await screen.findByText("Ravi");
    typeAmount("10000");
    await user.click(screen.getByTestId("split-toggle"));
    fireEvent.change(within(screen.getByTestId("split-panel")).getByLabelText("Principal"), { target: { value: "9500" } });
    await user.click(submitButton());
    await waitFor(() => expect(voice.submit).toHaveBeenCalled());
    expect(voice.submit).toHaveBeenCalledWith([{ customer_id: 1, amount: 10000, payment_mode: "CASH", principal_amount: 9500 }], "2026-10-17", "iop");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("1 transactions saved · ₹9,500 principal added"));
    await waitFor(() => expect(listIopCustomers).toHaveBeenCalledTimes(2));       // the balances moved: the customer list is fetched again
  });

  it("a row with no split sends principal 0, as an ordinary collection (VS-F05)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Ravi");
    typeAmount("500");
    await user.click(submitButton());
    await waitFor(() => expect(voice.submit).toHaveBeenCalled());
    expect(voice.submit.mock.calls[0][0]).toEqual([{ customer_id: 1, amount: 500, payment_mode: "CASH", principal_amount: 0 }]);
    expect(toast.success).toHaveBeenCalledWith("1 transactions saved");
  });

  it("EDI sends no principal field at all (VS-F06)", async () => {
    sessionStorage.setItem("voice.product", JSON.stringify("edi"));
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    typeAmount("400");
    await user.click(submitButton());
    await waitFor(() => expect(voice.submit).toHaveBeenCalled());
    expect(voice.submit.mock.calls[0][0]).toEqual([{ customer_id: 9, amount: 400, payment_mode: "CASH" }]);
  });

  it("an unpaid row carries no principal (VS-F07)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Ravi");
    typeAmount("10000");
    await user.click(screen.getByTestId("split-toggle"));
    fireEvent.change(within(screen.getByTestId("split-panel")).getByLabelText("Principal"), { target: { value: "9500" } });
    await user.click(screen.getByRole("button", { name: "paid" }));
    expect(screen.getByText("An unpaid row has no principal.")).toBeInTheDocument();
    await user.click(submitButton());
    await waitFor(() => expect(voice.submit).toHaveBeenCalled());
    expect(voice.submit.mock.calls[0][0][0].principal_amount).toBe(0);
  });
});

describe("a split that cannot be saved blocks the submit (VS-F08 ... VS-F10)", () => {
  it("a principal above the amount (the amount lowered below it) stops the submit, opens the panel and saves nothing (VS-F08)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Ravi");
    typeAmount("500");
    await user.click(screen.getByTestId("split-toggle"));
    fireEvent.change(within(screen.getByTestId("split-panel")).getByLabelText("Principal"), { target: { value: "400" } });
    fireEvent.change(screen.getByDisplayValue("500"), { target: { value: "300" } });
    expect(await screen.findByTestId("split-error")).toHaveTextContent(/more than the amount collected/);
    await user.click(submitButton());
    expect(voice.submit).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Ravi:"));
  });

  it("the live check shows the balance before / after, and its error blocks the submit (VS-F09)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Ravi");
    typeAmount("30000");
    await user.click(screen.getByTestId("split-toggle"));
    fireEvent.change(within(screen.getByTestId("split-panel")).getByLabelText("Principal"), { target: { value: "25000" } });
    expect(await screen.findByTestId("split-balance", {}, { timeout: 3000 })).toHaveTextContent("₹20,000");
    expect(await screen.findByTestId("split-error")).toHaveTextContent(/more than the balance/);
    await user.click(submitButton());
    expect(voice.submit).not.toHaveBeenCalled();
    const sent = voice.splitCheck.mock.calls.at(-1)![0][0];
    expect(sent).toMatchObject({ collection_date: "17-10-2026", product_type: "IOP", is_paid: true, amount: 30000, principal_amount: 25000, customer_id: 1 });
  });

  it("if the server still refuses (422 bad_principal) it says why, opens the panel and nothing is lost (VS-F10)", async () => {
    const user = userEvent.setup();
    voice.submit.mockRejectedValue({ response: { status: 422, data: { detail: { code: "bad_principal", message: "Ravi: principal ₹9,500 is more than the balance ₹5,000", rows: [{ index: 0, message: "x" }] } } } });
    renderVoice();
    await screen.findByText("Ravi");
    typeAmount("10000");
    await user.click(screen.getByTestId("split-toggle"));
    fireEvent.change(within(screen.getByTestId("split-panel")).getByLabelText("Principal"), { target: { value: "9500" } });
    await user.click(screen.getByTestId("split-toggle"));                         // close the panel: the refusal must bring it back
    expect(screen.queryByTestId("split-panel")).toBeNull();
    await user.click(submitButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Ravi: principal ₹9,500 is more than the balance ₹5,000"));
    expect(await screen.findByTestId("split-panel")).toBeInTheDocument();
    expect(within(screen.getByTestId("split-panel")).getByLabelText("Principal")).toHaveValue(9500);
  });
});

describe("a saved split comes back as it was entered (VS-F11)", () => {
  it("the row shows the amount collected (interest + principal) with its split, so submitting again does not lose the principal", async () => {
    const user = userEvent.setup();
    iopTxns.mockResolvedValue({ data: [{ transaction_id: 5, customer_id: 1, collection_date: "2026-10-17", amount: 500, principal_amount: 9500, payment_mode: "CASH", payment_status: "PAID" }] });
    renderVoice();
    await screen.findByDisplayValue("10000");                                     // 500 interest + 9,500 principal
    expect(screen.getByTestId("split-dot")).toBeInTheDocument();
    await user.click(submitButton());
    await waitFor(() => expect(voice.submit).toHaveBeenCalled());
    expect(voice.submit.mock.calls[0][0]).toEqual([{ customer_id: 1, amount: 10000, payment_mode: "CASH", principal_amount: 9500 }]);
  });

  it("a saved transaction without principal looks exactly as before (VS-F11b)", async () => {
    iopTxns.mockResolvedValue({ data: [{ transaction_id: 5, customer_id: 1, collection_date: "2026-10-17", amount: 500, payment_mode: "CASH", payment_status: "PAID" }] });
    renderVoice();
    await screen.findByDisplayValue("500");
    expect(screen.queryByTestId("split-dot")).toBeNull();
  });
});

describe("on a phone (VS-F12)", () => {
  beforeEach(() => screenOf(true));

  it("the customer card has the Split button and the same panel; the submit sends the principal", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Ravi");
    typeAmount("10000");
    await user.click(screen.getByTestId("split-toggle"));
    fireEvent.change(within(screen.getByTestId("split-panel")).getByLabelText("Principal"), { target: { value: "9500" } });
    await user.click(screen.getByRole("button", { name: /Submit All/ }));
    await waitFor(() => expect(voice.submit).toHaveBeenCalled());
    expect(voice.submit.mock.calls[0][0]).toEqual([{ customer_id: 1, amount: 10000, payment_mode: "CASH", principal_amount: 9500 }]);
  });
});
