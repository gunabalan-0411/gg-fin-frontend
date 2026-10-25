/** The Personal dashboard's two top cards: total in savings and what is still to be collected from friends. PH-F01 ... PH-F06. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/services/api", () => ({ personalApi: { dashboard: vi.fn() } }));

import { personalApi } from "@/services/api";
import { PersonalDashboard } from "./PersonalDashboard";

const dash = personalApi.dashboard as unknown as ReturnType<typeof vi.fn>;
const BASE = {
  month: "2026-10", this_month: { total: "0", count: 0 }, last_month: { total: "0", count: 0 }, categories: [], people: [],
  monthly: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, total: "0" })),
};
const show = (holdings?: unknown) => {
  dash.mockResolvedValue({ data: { ...BASE, ...(holdings ? { holdings } : {}) } });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><PersonalDashboard /></MemoryRouter></QueryClientProvider>);
};

beforeEach(() => vi.clearAllMocks());

describe("holdings", () => {
  it("shows the total in savings with the number of accounts (PH-F01)", async () => {
    show({ savings: { total: "35000.50", accounts: 2 }, lends: { to_collect: 0, people: 0, overdue: 0, overdue_amount: 0, next_follow_up: null, next_follow_up_to: null } });
    expect(await screen.findByTestId("personal-savings-total")).toHaveTextContent("₹35,001");
    expect(screen.getByTestId("personal-savings-note")).toHaveTextContent("2 accounts");
  });

  it("shows what is still to be collected from friends and from how many (PH-F02)", async () => {
    show({ savings: { total: 0, accounts: 0 }, lends: { to_collect: "7000.00", people: 3, overdue: 0, overdue_amount: 0, next_follow_up: null, next_follow_up_to: null } });
    expect(await screen.findByTestId("personal-lends-total")).toHaveTextContent("₹7,000");
    expect(screen.getByTestId("personal-lends-note")).toHaveTextContent("from 3 people");
    expect(screen.queryByTestId("personal-lends-overdue")).toBeNull();
    expect(screen.queryByTestId("personal-lends-next")).toBeNull();
  });

  it("flags how many follow-ups are overdue and their amount, and names the next one (PH-F03)", async () => {
    show({ savings: { total: 0, accounts: 0 }, lends: { to_collect: "2100", people: 5, overdue: 2, overdue_amount: "1500", next_follow_up: "2026-11-04", next_follow_up_to: "Near" } });
    expect(await screen.findByTestId("personal-lends-overdue")).toHaveTextContent("2 overdue (₹1,500)");
    expect(screen.getByTestId("personal-lends-next")).toHaveTextContent("next follow-up 04 Nov 2026 (Near)");
  });

  it("nothing entered yet reads as such, not as an error (PH-F04)", async () => {
    show({ savings: { total: 0, accounts: 0 }, lends: { to_collect: 0, people: 0, overdue: 0, overdue_amount: 0, next_follow_up: null, next_follow_up_to: null } });
    expect(await screen.findByTestId("personal-savings-note")).toHaveTextContent("No savings added yet");
    expect(screen.getByTestId("personal-lends-note")).toHaveTextContent("Nothing to collect");
    expect(screen.getByTestId("personal-lends-total")).toHaveTextContent("₹0");
  });

  it("an older answer without holdings still renders (PH-F05)", async () => {
    show();
    expect(await screen.findByTestId("personal-savings-total")).toHaveTextContent("₹0");
    expect(screen.getByTestId("personal-this-month")).toBeInTheDocument();
  });

  it("each card opens its section in Personal Finance (PH-F06)", async () => {
    show();
    await screen.findByTestId("personal-holdings");
    const links = screen.getByTestId("personal-holdings").querySelectorAll("a");
    expect([...links].map((a) => a.getAttribute("href"))).toEqual(["/personal?section=savings", "/personal?section=lends"]);
  });
});
