/**
 * The real VoicePage with only the network layer mocked: record -> transcribe -> table -> Submit -> what goes to Drive.
 * Covers TD-02, TD-05, TD-06, TD-08 (voice side) and the "nothing stored on the server" design (the recording stays in
 * the browser until Submit and is sent from there).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

import toast from "react-hot-toast";
import { resetConnectionStatus } from "@/hooks/useConnectionStatus";
import { trainingDataApi, voiceApi } from "@/services/api";
import VoicePage from "./VoicePage";

const voice = voiceApi as unknown as Record<"transcribe" | "submit", ReturnType<typeof vi.fn>>;
const training = trainingDataApi as unknown as Record<"saveVoice", ReturnType<typeof vi.fn>>;

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
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop() {} }] }),
      enumerateDevices: vi.fn().mockResolvedValue([]),
      addEventListener() {}, removeEventListener() {},
    },
  });
  (Element.prototype as any).scrollTo = () => {};
  (window as any).scrollTo = () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("voice.date", JSON.stringify("2026-10-17"));
  resetConnectionStatus();
  voice.transcribe.mockResolvedValue({
    data: {
      transcription: "selvem 400",
      entries: [{ spoken_name: "selvem", amount: 400, customer_id: 1, customer_name: "Selvam", matched: true, score: 0.9 }],
    },
  });
  voice.submit.mockResolvedValue({ data: { submitted: 1 } });
  training.saveVoice.mockResolvedValue({ data: { saved: 1, folder: "fintech/voice/2026-10-17", files: [] } });
});

function renderVoice() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><VoicePage /></QueryClientProvider>);
}

async function recordAndResolveOneEntry() {
  const user = userEvent.setup();
  renderVoice();
  await screen.findByText("Selvam");
  await user.click(screen.getByRole("button", { name: "Start recording" }));
  await user.click(await screen.findByRole("button", { name: "Stop recording" }));
  await waitFor(() => expect(voice.transcribe).toHaveBeenCalled());
  await screen.findByDisplayValue("400");                        // the entry was applied to the table
  return user;
}

const submitButton = () => screen.getAllByRole("button", { name: /^Submit/ })[0];

describe("Voice page — training data (TD-02, TD-05)", () => {
  it("the toggle is in the bottom bar, ON by default", async () => {
    renderVoice();
    expect(await screen.findByRole("switch", { name: "Save data for training" })).toHaveAttribute("aria-checked", "true");
  });

  it("ON: Submit saves the records, then sends the recording + the table (real name, spoken word, final amount) to Drive", async () => {
    const user = await recordAndResolveOneEntry();
    await user.click(submitButton());

    await waitFor(() => expect(voice.submit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(training.saveVoice).toHaveBeenCalledTimes(1));
    const form = training.saveVoice.mock.calls[0][0] as FormData;

    const recordings = form.getAll("recordings") as File[];
    expect(recordings).toHaveLength(1);
    expect(recordings[0].name).toMatch(/^rec1\.(wav|webm)$/);        // WAV when the browser can decode it, else the original
    expect(recordings[0].size).toBeGreaterThan(0);
    expect(JSON.parse(form.get("rows") as string)).toEqual([
      { customer: "Selvam", date: "2026-10-17", amount: 400, type: "EDI", mode: "CASH", raw_text: "selvem", source_file: "rec1", origin: "matched" },
    ]);
    expect(JSON.parse(form.get("transcriptions") as string)).toEqual({ rec1: "selvem 400" });
    expect(form.get("folder_date")).toBe("2026-10-17");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Training data saved to Drive"));
  });

  it("OFF: the records are saved and NOTHING is sent for training; the toggle is back ON for the next session", async () => {
    const user = await recordAndResolveOneEntry();
    await user.click(screen.getByRole("switch", { name: "Save data for training" }));
    expect(screen.getByRole("switch", { name: "Save data for training" })).toHaveAttribute("aria-checked", "false");

    await user.click(submitButton());
    await waitFor(() => expect(voice.submit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Save data for training" })).toHaveAttribute("aria-checked", "true"));
    expect(training.saveVoice).not.toHaveBeenCalled();
  });

  it("a Drive failure only warns — the records were already saved (TD-08)", async () => {
    training.saveVoice.mockRejectedValue({ response: { status: 409, data: { detail: "Google Drive is not connected — connect it in Settings to save training data." } } });
    const user = await recordAndResolveOneEntry();
    await user.click(submitButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Records saved"));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("not connected"));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("transactions saved"));
    expect(toast.error).not.toHaveBeenCalledWith("Submit failed");
  });

  it("when the records themselves fail to save, nothing is uploaded and the recording is kept for a retry", async () => {
    voice.submit.mockRejectedValueOnce(new Error("500"));
    const user = await recordAndResolveOneEntry();
    await user.click(submitButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Submit failed"));
    expect(training.saveVoice).not.toHaveBeenCalled();

    await user.click(submitButton());                                   // retry succeeds
    await waitFor(() => expect(training.saveVoice).toHaveBeenCalledTimes(1));
  });

  it("each recording is sent once — a second Submit does not send it again", async () => {
    const user = await recordAndResolveOneEntry();
    await user.click(submitButton());
    await waitFor(() => expect(training.saveVoice).toHaveBeenCalledTimes(1));

    await user.click(submitButton());
    await waitFor(() => expect(voice.submit).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 50));
    expect(training.saveVoice).toHaveBeenCalledTimes(1);
  });

  it("a submit with no spoken entries uploads nothing", async () => {
    voice.transcribe.mockResolvedValue({ data: { transcription: "noise", entries: [] } });
    const user = userEvent.setup();
    renderVoice();
    await screen.findByText("Selvam");
    await user.click(screen.getByRole("button", { name: "Start recording" }));
    await user.click(await screen.findByRole("button", { name: "Stop recording" }));
    await waitFor(() => expect(voice.transcribe).toHaveBeenCalled());
    expect(training.saveVoice).not.toHaveBeenCalled();
  });
});

describe("Voice page — the old dataset module is gone (TD-06)", () => {
  it("no Export dataset button, and Submit does not download a zip", async () => {
    const createUrl = vi.fn(() => "blob:x");
    (URL as any).createObjectURL = createUrl;
    const user = await recordAndResolveOneEntry();
    expect(screen.queryByText(/Export dataset/i)).toBeNull();
    await user.click(submitButton());
    await waitFor(() => expect(voice.submit).toHaveBeenCalled());
    await waitFor(() => expect(training.saveVoice).toHaveBeenCalled());
    expect(createUrl).not.toHaveBeenCalled();
  });
});
