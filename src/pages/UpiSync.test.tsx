/**
 * "Sync Gmail now" on the UPI Transactions page, and the renamed Customer Groupings page (MN-05, MN-06).
 * (The same button in the empty UPI panel of the OCR page is covered in OcrPage.upi.test.tsx.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/services/api", () => {
  const ok = (data: unknown = {}) => vi.fn().mockResolvedValue({ data });
  return {
    upiApi: {
      list: ok({ data: [], total: 0 }), listVpaMappings: ok({ data: [] }), uniqueVpas: ok({ data: [] }),
      customersWithBalance: ok({ data: [] }), gmailSync: vi.fn(), deleteVpaMapping: ok(), mapCustomer: ok(),
      deleteTransaction: ok(), createVpaMapping: ok(), fuzzySuggest: ok({ data: [] }),
    },
    namemapApi: {
      listEdi: ok({ data: [], total: 0 }), listIop: ok({ data: [], total: 0 }),
      listEdiSegments: ok({ data: [], total: 0 }), listIopSegments: ok({ data: [], total: 0 }),
    },
    customersApi: { transliterate: ok({ tamil: "" }) },
  };
});

import { upiApi } from "@/services/api";
import UpiPage from "./UpiPage";
import NameMapPage from "./NameMapPage";

const upi = upiApi as unknown as Record<"list" | "gmailSync", ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  upi.list.mockResolvedValue({ data: { data: [], total: 0 } });
});

describe("Sync Gmail now on the UPI page (MN-06)", () => {
  it("pulls the latest credits from Gmail, refreshes the list and says how many were new", async () => {
    upi.gmailSync.mockResolvedValue({ data: { imported: 3, skipped: 1, total_found: 4 } });
    const user = userEvent.setup();
    render(<UpiPage />);
    await waitFor(() => expect(upi.list).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    const before = upi.list.mock.calls.length;

    await user.click(await screen.findByTestId("sync-gmail"));
    await waitFor(() => expect(upi.gmailSync).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Gmail synced — 3 new, 1 already imported")).toBeInTheDocument();
    await waitFor(() => expect(upi.list.mock.calls.length).toBe(before + 1));    // the list was reloaded, once
  });

  it("shows a busy state while syncing and cannot be pressed twice", async () => {
    let finish!: (v: unknown) => void;
    upi.gmailSync.mockReturnValue(new Promise((r) => { finish = r; }));
    const user = userEvent.setup();
    render(<UpiPage />);
    const button = await screen.findByTestId("sync-gmail");
    await user.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Syncing…");
    await user.click(button);
    expect(upi.gmailSync).toHaveBeenCalledTimes(1);

    finish({ data: { imported: 0, skipped: 0, total_found: 0 } });
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveTextContent("Sync Gmail now");
  });

  it("when Gmail is not connected the server's message is shown", async () => {
    upi.gmailSync.mockRejectedValue({ response: { status: 400, data: { detail: "Gmail is not connected" } } });
    const user = userEvent.setup();
    render(<UpiPage />);
    await waitFor(() => expect(upi.list).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    const before = upi.list.mock.calls.length;
    await user.click(await screen.findByTestId("sync-gmail"));
    expect(await screen.findByText("Gmail is not connected")).toBeInTheDocument();
    expect(upi.list.mock.calls.length).toBe(before);                             // nothing to refresh after a failure
  });

  it("an error without a message falls back to a hint about where to connect Gmail", async () => {
    upi.gmailSync.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<UpiPage />);
    await user.click(await screen.findByTestId("sync-gmail"));
    expect(await screen.findByText(/Gmail sync failed — is Gmail connected\? \(Settings → UPI Import\)/)).toBeInTheDocument();
  });
});

describe("Customer Groupings page (MN-05)", () => {
  it("the heading matches the menu", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><NameMapPage /></QueryClientProvider>);
    expect(await screen.findByRole("heading", { level: 1, name: "Customer Groupings" })).toBeInTheDocument();
    expect(screen.queryByText("Mapping Configs")).toBeNull();
  });
});
