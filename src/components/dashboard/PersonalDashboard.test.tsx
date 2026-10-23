/**
 * The Personal view of the dashboard and the Office / Personal switch. PD-01 ... PD-10.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/services/api", () => ({
  personalApi: { dashboard: vi.fn() },
  customersApi: {},
}));
// the Office dashboard has its own tests; here it is only a marker so the switch can be seen
vi.mock("@/hooks/useDashboard", () => {
  const idle = () => ({ data: undefined, isLoading: true });
  return {
    useDashboardSummary: idle, useDailyActivity: idle, useLoanSummary: idle, useIopReminders: idle, useIopCalendar: idle,
    useEdiInactive: idle, useEdiDefaulters: idle, useIopMonthlyDues: idle,
  };
});

import { personalApi } from "@/services/api";
import { FinanceModeToggle, PersonalDashboard } from "./PersonalDashboard";
import DashboardPage from "@/pages/DashboardPage";

const dash = personalApi.dashboard as unknown as ReturnType<typeof vi.fn>;

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const m = ((i + 10) % 12) + 1;                                   // Nov 2025 ... Oct 2026
  const y = i < 2 ? 2025 : 2026;
  return { month: `${y}-${String(m).padStart(2, "0")}`, total: i === 11 ? "1500.00" : i === 10 ? "2000.00" : "0.00" };
});
const DATA = {
  month: "2026-10",
  this_month: { total: "1500.00", count: 3 },
  last_month: { total: "2000.00", count: 5 },
  categories: [
    { id: 1, name: "Groceries", ungrouped: false, count: 2, total: "1000.00", subs: [{ id: 2, name: "Fish & Chicken", count: 1, total: "600.00" }] },
    { id: 4, name: "Medical", ungrouped: false, count: 1, total: "500.00", subs: [] },
  ],
  people: [],
  monthly: MONTHS,
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  dash.mockResolvedValue({ data: DATA });
});

describe("the Personal view (PD-01 ... PD-06)", () => {
  it("shows this month, last month and the 12-month total (PD-01)", async () => {
    wrap(<PersonalDashboard />);
    expect(await screen.findByTestId("personal-this-month")).toHaveTextContent("₹1,500");
    expect(screen.getByText(/Spent in Oct 2026/)).toBeInTheDocument();
    expect(screen.getByTestId("personal-last-month")).toHaveTextContent("₹2,000");
    expect(screen.getByTestId("personal-year")).toHaveTextContent("₹3,500");
    expect(screen.getByTestId("personal-average")).toHaveTextContent("About ₹292 a month");                // 3,500 / 12
  });

  it("says whether spending fell or rose against last month, in words and colour (PD-02)", async () => {
    const { unmount } = wrap(<PersonalDashboard />);
    const down = await screen.findByTestId("personal-change");
    expect(down).toHaveTextContent("▼ 25% less than last month");
    expect(down.className).toMatch(/emerald/);                                                  // spending less is good news
    unmount();
    dash.mockResolvedValue({ data: { ...DATA, this_month: { total: "3000.00", count: 4 } } });
    wrap(<PersonalDashboard />);
    const up = await screen.findByTestId("personal-change");
    expect(up).toHaveTextContent("▲ 50% more than last month");
    expect(up.className).toMatch(/amber/);
  });

  it("with no spending last month it does not divide by zero (PD-02)", async () => {
    dash.mockResolvedValue({ data: { ...DATA, last_month: { total: "0.00", count: 0 } } });
    wrap(<PersonalDashboard />);
    expect(await screen.findByTestId("personal-change")).toHaveTextContent("no spending last month");
  });

  it("lists this month's categories biggest first with the share, and their sub-categories (PD-03)", async () => {
    wrap(<PersonalDashboard />);
    const cats = await screen.findAllByTestId("personal-category");
    expect(cats.map((c) => c.textContent)).toEqual([expect.stringContaining("Groceries"), expect.stringContaining("Medical")]);
    expect(cats[0]).toHaveTextContent("₹1,000");
    expect(cats[0]).toHaveTextContent("67%");                                                    // 1000 of 1500
    expect(within(cats[0]).getByTestId("personal-sub")).toHaveTextContent("Fish & Chicken");
    expect(within(cats[0]).getByTestId("personal-sub")).toHaveTextContent("₹600");
    expect(cats[1]).toHaveTextContent("33%");
    expect(within(cats[1]).queryByTestId("personal-sub")).toBeNull();
  });

  it("draws one bar for each of the last 12 months, the current month last and marked (PD-04)", async () => {
    wrap(<PersonalDashboard />);
    const bars = await screen.findAllByTestId("personal-bar");
    expect(bars).toHaveLength(12);
    expect(bars[11]).toHaveAttribute("data-month", "2026-10");
    expect(bars[11]).toHaveAttribute("title", "Oct 2026: ₹1,500");
    expect(bars[10]).toHaveAttribute("title", "Sep 2026: ₹2,000");
    expect(bars[0]).toHaveTextContent("Nov");
    const heights = bars.map((b) => (b.firstElementChild as HTMLElement).style.height);
    expect(heights[10]).toBe("100%");                                                            // the biggest month is full height
    expect(heights[11]).toBe("75%");
    expect(heights[0]).toBe("0%");                                                               // an empty month has no bar
  });

  it("a month with no expenses says so and points to Personal Finance (PD-05)", async () => {
    dash.mockResolvedValue({ data: { ...DATA, this_month: { total: "0.00", count: 0 }, categories: [] } });
    wrap(<PersonalDashboard />);
    const empty = await screen.findByTestId("personal-empty");
    expect(empty).toHaveTextContent("No personal expenses this month yet.");
    expect(within(empty).getByRole("link", { name: "Add one" })).toHaveAttribute("href", "/personal");
    expect(screen.getByRole("link", { name: /Open Personal Finance/ })).toHaveAttribute("href", "/personal");
  });

  it("shows loading, and an error if the numbers cannot be read (PD-06)", async () => {
    let finish!: (v: unknown) => void;
    dash.mockReturnValue(new Promise((r) => { finish = r; }));
    const { unmount } = wrap(<PersonalDashboard />);
    expect(screen.getByTestId("personal-loading")).toBeInTheDocument();
    finish({ data: DATA });
    await screen.findByTestId("personal-dashboard");
    unmount();
    dash.mockRejectedValue(new Error("500"));
    wrap(<PersonalDashboard />);
    expect(await screen.findByText("Could not load your personal spending")).toBeInTheDocument();
  });
});

describe("the Office / Personal switch (PD-07 ... PD-10)", () => {
  it("starts on Office; the Personal numbers are not even asked for (PD-07)", async () => {
    wrap(<DashboardPage />);
    const toggle = screen.getByTestId("finance-mode");
    expect(within(toggle).getByRole("button", { name: "Office" })).toHaveAttribute("aria-pressed", "true");
    expect(within(toggle).getByRole("button", { name: "Personal" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Financial overview")).toBeInTheDocument();
    expect(screen.queryByTestId("personal-dashboard")).toBeNull();
    expect(dash).not.toHaveBeenCalled();
  });

  it("Personal shows the person's own spending in place of the office dashboard; Office brings it back (PD-08)", async () => {
    const user = userEvent.setup();
    wrap(<DashboardPage />);
    await user.click(screen.getByRole("button", { name: "Personal" }));
    expect(await screen.findByTestId("personal-dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Financial overview")).toBeNull();
    expect(screen.getByRole("heading", { name: "Personal finance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Personal" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Office" }));
    expect(screen.getByText("Financial overview")).toBeInTheDocument();
    expect(screen.queryByTestId("personal-dashboard")).toBeNull();
  });

  it("leaving the dashboard and coming back starts on Office again (PD-09)", async () => {
    const user = userEvent.setup();
    const first = wrap(<DashboardPage />);
    await user.click(screen.getByRole("button", { name: "Personal" }));
    await screen.findByTestId("personal-dashboard");
    first.unmount();
    wrap(<DashboardPage />);
    expect(screen.getByRole("button", { name: "Office" })).toHaveAttribute("aria-pressed", "true");
  });

  it("the switch itself reports changes and marks the current view (PD-10)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<FinanceModeToggle mode="office" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Personal" }));
    expect(onChange).toHaveBeenCalledWith("personal");
    rerender(<FinanceModeToggle mode="personal" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Office" }));
    expect(onChange).toHaveBeenLastCalledWith("office");
    expect(screen.getByRole("group", { name: "Dashboard view" })).toBeInTheDocument();
  });
});
