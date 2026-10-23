/**
 * The Type / Voice Entry page: the page is named for what it does, the voice panel can be minimised (and still records), and the
 * summary cards are small. VP-01 ... VP-12. The real VoicePage with only the network layer mocked.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t") }) }));
vi.mock("@/services/api", () => {
  const ok = (data: unknown = {}) => vi.fn().mockResolvedValue({ data });
  return {
    voiceApi: {
      modelStatus: ok({ loaded: true, on_disk: true, downloading: false, download_progress: 100, idle_seconds: 0, seconds_until_unload: 60 }),
      modelLoad: ok(), modelUnload: ok(), modelReset: ok(), transcribe: vi.fn(), submit: vi.fn(),
    },
    customersApi: {
      listEdi: ok({ data: [{ customer_id: 1, customer_name: "Selvam", outstanding_balance: 1000, customer_segment_id: 1, is_closed: false }], total: 1 }),
      listIop: ok({ data: [], total: 0 }), ediSegments: ok([]), iopSegments: ok([]),
    },
    transactionsApi: { listEdi: ok([]), listIop: ok([]) },
    upiApi: { list: ok({ data: [] }) },
    driveApi: { status: ok({ connected: true, email: "owner@example.com" }) },
    trainingDataApi: { saveVoice: vi.fn(), saveOcr: vi.fn() },
  };
});

import { resetConnectionStatus } from "@/hooks/useConnectionStatus";
import { voiceApi } from "@/services/api";
import VoicePage from "./VoicePage";

const voice = voiceApi as unknown as Record<"transcribe" | "submit", ReturnType<typeof vi.fn>>;
const KEY = "gg_voice_panel_min";

class FakeRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType = "audio/webm";
  start() {}
  stop() { this.ondataavailable?.({ data: new Blob([new Uint8Array(2000)], { type: "audio/webm" }) }); this.onstop?.(); }
}

beforeAll(() => {
  (globalThis as any).MediaRecorder = FakeRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop() {} }] }), enumerateDevices: vi.fn().mockResolvedValue([]), addEventListener() {}, removeEventListener() {} },
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
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem("voice.date", JSON.stringify("2026-10-17"));
  resetConnectionStatus();
  screenOf(false);
  voice.transcribe.mockResolvedValue({ data: { transcription: "selvem 400", entries: [{ spoken_name: "selvem", amount: 400, customer_id: 1, customer_name: "Selvam", matched: true, score: 0.9 }] } });
  voice.submit.mockResolvedValue({ data: { submitted: 1 } });
});

function renderVoice() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><VoicePage /></QueryClientProvider>);
}
const toggle = () => screen.getByTestId("voice-panel-toggle");
const modeButton = () => screen.queryByRole("button", { name: /Online Payers/ });

describe("the page name (VP-01)", () => {
  it("the top bar says Type / Voice Entry", async () => {
    renderVoice();
    await screen.findByText("Selvam");
    expect(screen.getByText("Type / Voice Entry")).toBeInTheDocument();
    expect(screen.queryByText("Voice Entry")).toBeNull();
  });
});

describe("minimising the voice panel (VP-02 ... VP-08)", () => {
  it("it is open by default, with a Minimise button (VP-02)", async () => {
    renderVoice();
    await screen.findByText("Selvam");
    expect(toggle()).toHaveAttribute("aria-label", "Minimise voice panel");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(modeButton()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start recording" })).toBeInTheDocument();
    expect(screen.queryByTestId("voice-panel-min")).toBeNull();
  });

  it("minimising leaves a thin bar with the mode and a small mic; the big panel goes (VP-03)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    await user.click(toggle());
    const bar = screen.getByTestId("voice-panel-min");
    expect(bar).toHaveTextContent("Transaction");
    expect(within(bar).getByRole("button", { name: "Start recording" })).toBeInTheDocument();
    expect(modeButton()).toBeNull();                                                       // the mode buttons, model status and big mic are gone
    expect(screen.queryByText(/Say a customer name/)).toBeNull();
    expect(toggle()).toHaveAttribute("aria-label", "Expand voice panel");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  it("expanding brings it all back (VP-04)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    await user.click(toggle());
    await user.click(toggle());
    expect(screen.queryByTestId("voice-panel-min")).toBeNull();
    expect(modeButton()).toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBe("0");
  });

  it("the choice is remembered on this device: it opens minimised when it was left minimised (VP-05)", async () => {
    localStorage.setItem(KEY, "1");
    renderVoice();
    await screen.findByText("Selvam");
    expect(screen.getByTestId("voice-panel-min")).toBeInTheDocument();
    expect(modeButton()).toBeNull();
  });

  it("if the browser will not store it, the page still works, open (VP-06)", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    try {
      const user = userEvent.setup();
      renderVoice();
      await screen.findByText("Selvam");
      expect(modeButton()).toBeInTheDocument();
      await user.click(toggle());
      expect(screen.getByTestId("voice-panel-min")).toBeInTheDocument();                  // it still minimises for this visit
    } finally {
      spy.mockRestore();
      set.mockRestore();
    }
  });

  it("the small mic records and stops, and the entry lands in the table (VP-07)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    await user.click(toggle());
    await user.click(within(screen.getByTestId("voice-panel-min")).getByRole("button", { name: "Start recording" }));
    expect(screen.getByTestId("voice-panel-min")).toHaveTextContent(/Recording…/);
    await user.click(within(screen.getByTestId("voice-panel-min")).getByRole("button", { name: "Stop recording" }));
    await waitFor(() => expect(voice.transcribe).toHaveBeenCalled());
    expect(await screen.findByDisplayValue("400")).toBeInTheDocument();
  });

  it("minimising in the middle of a recording does not lose it: the bar shows Recording and can stop it (VP-08)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    await user.click(screen.getByRole("button", { name: "Start recording" }));
    await user.click(toggle());
    const bar = screen.getByTestId("voice-panel-min");
    expect(bar).toHaveTextContent(/Recording…/);
    await user.click(within(bar).getByRole("button", { name: "Stop recording" }));
    await waitFor(() => expect(voice.transcribe).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue("400")).toBeInTheDocument();
  });

  it("the rest of the page is untouched by minimising: search, the table and the transcription list stay (VP-09)", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    await user.click(toggle());
    expect(screen.getByPlaceholderText("Search customer by name…")).toBeInTheDocument();
    expect(screen.getByText("Selvam")).toBeInTheDocument();
    expect(screen.getByText("Transcription")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Save data for training" })).toBeInTheDocument();
  });
});

describe("small summary cards (VP-10, VP-11)", () => {
  it("the six cards (Today, EDI, IOP, Total, GPay, Cash) sit in one compact strip that fits however many columns there is room for (VP-10)", async () => {
    renderVoice();
    await screen.findByText("Selvam");
    const strip = screen.getByTestId("voice-stats");
    expect(strip.style.gridTemplateColumns).toBe("repeat(auto-fit, minmax(118px, 1fr))");
    const cards = within(strip).getAllByTestId("voice-stat");
    expect(cards).toHaveLength(6);
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringContaining("Today"), expect.stringContaining("EDI"), expect.stringContaining("IOP"),
      expect.stringContaining("Total"), expect.stringContaining("GPay"), expect.stringContaining("Cash"),
    ]);
    expect(cards[1]).toHaveTextContent("₹0");
    expect(cards[0]).toHaveTextContent("0 with amount");
  });

  it("they are small: tight padding and small figures, not the old roomy cards (VP-11)", async () => {
    renderVoice();
    await screen.findByText("Selvam");
    const strip = screen.getByTestId("voice-stats");
    for (const card of within(strip).getAllByTestId("voice-stat")) {
      expect(card.className).toMatch(/py-1\.5/);
      expect(card.className).not.toMatch(/py-2\.5/);
      expect(card.className).toMatch(/rounded-lg/);
    }
    expect(strip.className).toMatch(/py-2\b/);
    expect(within(strip).getAllByTestId("voice-stat")[0].innerHTML).toMatch(/text-\[16px\]/);       // the biggest figure is 16px (it was 22px)
    expect(strip.innerHTML).not.toMatch(/text-\[22px\]|text-\[18px\]/);
  });
});

describe("on a phone (VP-12)", () => {
  beforeEach(() => screenOf(true));

  it("the voice card has the same Minimise button, a small mic bar when minimised, and remembers it", async () => {
    const user = userEvent.setup();
    renderVoice();
    await screen.findByRole("button", { name: "Start recording" });
    expect(toggle()).toHaveAttribute("aria-label", "Minimise voice panel");
    await user.click(toggle());
    const bar = screen.getByTestId("voice-panel-min");
    expect(within(bar).getByRole("button", { name: "Start recording" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Online Payers/ })).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("1");
    await user.click(within(bar).getByRole("button", { name: "Start recording" }));
    expect(screen.getByTestId("voice-panel-min")).toHaveTextContent(/Recording…/);
    await user.click(within(screen.getByTestId("voice-panel-min")).getByRole("button", { name: "Stop recording" }));
    await waitFor(() => expect(voice.transcribe).toHaveBeenCalled());
  });
});
