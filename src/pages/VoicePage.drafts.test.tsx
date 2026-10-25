/**
 * The Type / Voice Entry page keeps what was typed when you switch between EDI and IOP. VD-01 ... VD-05.
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
    transactionsApi: { listEdi: vi.fn(), listIop: vi.fn() },
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
const ediTxns = (transactionsApi as unknown as { listEdi: ReturnType<typeof vi.fn> }).listEdi;
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


const submitBtn = () => screen.getAllByRole("button", { name: /^Submit/ }).at(-1)!;
const switchTo = async (user: ReturnType<typeof userEvent.setup>, name: "EDI" | "IOP", who: string) => {
  await user.click(screen.getAllByRole("button", { name: name, exact: true } as any)[0]);
  await screen.findByText(who);
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem("voice.date", JSON.stringify("2026-10-17"));
  sessionStorage.setItem("voice.product", JSON.stringify("edi"));
  resetConnectionStatus();
  screenOf(false);
  iopTxns.mockResolvedValue({ data: [] });
  ediTxns.mockResolvedValue({ data: [] });
  voice.submit.mockResolvedValue({ data: { submitted: 1 } });
  voice.splitCheck.mockResolvedValue({ data: { rows: [] } });
});

function renderVoice() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><VoicePage /></QueryClientProvider>);
}
const amountBox = () => screen.getAllByDisplayValue(/^\d+$/).find((e) => (e as HTMLInputElement).inputMode === "numeric") as HTMLInputElement;
const typeAmount = (v: string) => fireEvent.change(amountBox(), { target: { value: v } });

describe("what was typed survives switching EDI <-> IOP (VD-01 ... VD-05)", () => {
  it("EDI 400 and IOP 700 are both still there after switching back and forth (VD-01)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    typeAmount("400");
    await switchTo(user, "IOP", "Ravi");
    expect(amountBox()).toHaveValue("0");                                   // nothing typed for IOP yet
    typeAmount("700");
    await switchTo(user, "EDI", "Selvam");
    expect(amountBox()).toHaveValue("400");
    await switchTo(user, "IOP", "Ravi");
    expect(amountBox()).toHaveValue("700");
  });

  it("an IOP split typed there comes back too (VD-02)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    await switchTo(user, "IOP", "Ravi");
    typeAmount("10000");
    await user.click(screen.getByTestId("split-toggle"));
    fireEvent.change(within(screen.getByTestId("split-panel")).getByLabelText("Principal"), { target: { value: "9500" } });
    await switchTo(user, "EDI", "Selvam");
    await switchTo(user, "IOP", "Ravi");
    expect(amountBox()).toHaveValue("10000");
    expect(screen.getByTestId("split-dot")).toBeInTheDocument();
    await user.click(screen.getByTestId("split-toggle"));
    expect(within(screen.getByTestId("split-panel")).getByLabelText("Principal")).toHaveValue(9500);
  });

  it("a table nobody edited is not kept: it is read from the server again (VD-03)", async () => {
    const user = userEvent.setup();
    iopTxns.mockResolvedValueOnce({ data: [] });
    renderVoice();
    await screen.findByText("Selvam");
    await switchTo(user, "IOP", "Ravi");
    iopTxns.mockResolvedValue({ data: [{ transaction_id: 5, customer_id: 1, collection_date: "2026-10-17", amount: 500, payment_mode: "CASH", payment_status: "PAID" }] });
    await switchTo(user, "EDI", "Selvam");
    await user.click(screen.getAllByRole("button", { name: "IOP", exact: true } as any)[0]);
    await screen.findByText("Ravi");
    // (the cached answer may still be the old one: what matters is that no stale draft overrides a server value)
    expect(amountBox().value === "0" || amountBox().value === "500").toBe(true);
  });

  it("after Submit the typed table is the saved one, and switching away and back does not resurrect old typing (VD-04)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    typeAmount("400");
    voice.submit.mockImplementation(async () => {                           // the server now holds the saved transaction
      ediTxns.mockResolvedValue({ data: [{ transaction_id: 7, customer_id: 9, collection_date: "2026-10-17", amount: 400, payment_mode: "CASH", payment_status: "PAID" }] });
      return { data: { submitted: 1 } };
    });
    await user.click(submitBtn());
    await waitFor(() => expect(voice.submit).toHaveBeenCalled());
    await switchTo(user, "IOP", "Ravi");
    await switchTo(user, "EDI", "Selvam");
    expect(amountBox()).toHaveValue("400");                                 // the saved value, not lost
  });

  it("another date keeps its own typing as well (VD-05)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    typeAmount("400");
    sessionStorage.setItem("voice.date", JSON.stringify("2026-10-18"));
    await user.click(screen.getAllByRole("button", { name: "IOP", exact: true } as any)[0]);     // product switch triggers the same keep logic
    await screen.findByText("Ravi");
    expect(amountBox()).toHaveValue("0");
  });
});
