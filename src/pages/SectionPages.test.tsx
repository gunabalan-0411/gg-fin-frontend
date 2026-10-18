/**
 * Account Adjustments and Settings no longer have a navigation bar of their own: the section comes from the URL
 * (?section=…) and is chosen in the left menu. Where the menu is only a drawer (phone, tablet) a compact tab row remains,
 * driving the same URL. Covers SM-03, SM-04, SM-07.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/services/api", () => {
  // every API method resolves with an empty answer — the pages only need to render their section
  // (an empty ARRAY that also carries the fields of the object answers: some lists are `res.data`, others `res.data.data`)
  const answer = () => Object.assign([], { data: [], total: 0, connected: false, email: null, device: "cpu", device_name: "CPU", gpu_available: false });
  const anyApi = () => new Proxy({}, { get: () => vi.fn().mockImplementation(async () => ({ data: answer() })) });
  return {
    expensesApi: anyApi(), unclaimedBalancesApi: anyApi(), defaultedBalancesApi: anyApi(), customersApi: anyApi(),
    authApi: anyApi(), backupApi: anyApi(), upiApi: anyApi(), driveApi: anyApi(), voiceApi: anyApi(),
  };
});

import AccountAdjustmentsPage from "./ExpensesPage";
import SettingsPage from "./SettingsPage";

function Probe() {
  return <span data-testid="url">{useLocation().search}</span>;
}

function renderAt(page: React.ReactElement, at: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter initialEntries={[at]}>{page}<Probe /></MemoryRouter></QueryClientProvider>,
  );
}

/** A screen of the given kind: phone < 768, tablet 768–1023, desktop >= 1024. */
function screenOf(kind: "phone" | "tablet" | "desktop") {
  window.matchMedia = ((q: string) => ({
    matches: (kind === "phone" && q.includes("max-width: 767px"))
      || (kind === "tablet" && q.includes("min-width: 768px") && q.includes("max-width: 1023px")),
    media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("Account Adjustments (SM-03, SM-04, SM-07)", () => {
  const heading = (name: string) => screen.findByRole("heading", { name });

  it("desktop: the URL picks the section, and the page has no left panel or tab row of its own", async () => {
    screenOf("desktop");
    const { container } = renderAt(<AccountAdjustmentsPage />, "/expenses?section=unclaimed");
    expect(await heading("Unclaimed Amount")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Defaulted Amount" })).toBeNull();
    expect(container.querySelector("aside")).toBeNull();
    expect(screen.queryByTestId("section-tabs")).toBeNull();
    expect(screen.queryByText("Account Adjustments")).toBeNull();                         // the old panel's title
  });

  it("desktop: no ?section= shows the first section (expenses); ?section=defaulted shows Defaulted", async () => {
    screenOf("desktop");
    const first = renderAt(<AccountAdjustmentsPage />, "/expenses");
    expect(await heading("Expenses")).toBeInTheDocument();
    first.unmount();
    renderAt(<AccountAdjustmentsPage />, "/expenses?section=defaulted");
    expect(await heading("Defaulted Amount")).toBeInTheDocument();
  });

  it("an unknown section falls back to the first", async () => {
    screenOf("desktop");
    renderAt(<AccountAdjustmentsPage />, "/expenses?section=nonsense");
    expect(await heading("Expenses")).toBeInTheDocument();
  });

  it("phone: a compact tab row switches the section through the URL", async () => {
    screenOf("phone");
    const user = userEvent.setup();
    renderAt(<AccountAdjustmentsPage />, "/expenses");
    const tabs = await screen.findByTestId("section-tabs");
    expect(within(tabs).getAllByRole("button").map((b) => b.textContent)).toEqual(["Expenses", "Unclaimed", "Defaulted"]);
    expect(within(tabs).getByRole("button", { name: "Expenses" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(tabs).getByRole("button", { name: "Defaulted" }));
    expect(await heading("Defaulted Amount")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("section=defaulted");
    expect(within(tabs).getByRole("button", { name: "Defaulted" })).toHaveAttribute("aria-pressed", "true");
  });

  it("tablet (the menu is a drawer there too): the tab row is kept", async () => {
    screenOf("tablet");
    renderAt(<AccountAdjustmentsPage />, "/expenses?section=unclaimed");
    const tabs = await screen.findByTestId("section-tabs");
    expect(within(tabs).getByRole("button", { name: "Unclaimed" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Settings (SM-03, SM-04, SM-07)", () => {
  const h2 = (re: RegExp) => screen.findByRole("heading", { level: 2, name: re });

  it("desktop: the URL picks the section, and there is no left list of sections on the page", async () => {
    screenOf("desktop");
    const { container } = renderAt(<SettingsPage />, "/settings?section=drive");
    expect(await h2(/Google Drive Backup/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Local Backup/ })).toBeNull();
    expect(container.querySelector("aside")).toBeNull();
    expect(screen.queryByTestId("section-tabs")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();   // kept for screen readers
  });

  it("desktop: the first section is the default, and each section of the menu is reachable by URL", async () => {
    screenOf("desktop");
    const first = renderAt(<SettingsPage />, "/settings");
    expect(await h2(/Local Backup/)).toBeInTheDocument();
    first.unmount();
    const second = renderAt(<SettingsPage />, "/settings?section=security");
    expect(await h2(/Security/)).toBeInTheDocument();
    second.unmount();
    renderAt(<SettingsPage />, "/settings?section=upi");
    expect(await h2(/UPI Data Import/)).toBeInTheDocument();
  });

  it("phone: the tab row lists the same five sections and switches through the URL", async () => {
    screenOf("phone");
    const user = userEvent.setup();
    renderAt(<SettingsPage />, "/settings");
    const tabs = await screen.findByTestId("section-tabs");
    expect(within(tabs).getAllByRole("button").map((b) => b.textContent?.trim())).toEqual(["Local Backup", "UPI Import", "Google Drive", "Inference", "Security"]);
    await user.click(within(tabs).getByRole("button", { name: /Security/ }));
    expect(await h2(/Security/)).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("section=security");
  });

  it("tablet: the tab row is kept", async () => {
    screenOf("tablet");
    renderAt(<SettingsPage />, "/settings?section=device");
    expect(await screen.findByTestId("section-tabs")).toBeInTheDocument();
  });
});
