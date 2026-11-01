/**
 * Personal Finance > Monthly budget. BG-01 ... BG-10. The real section with only the network layer mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/services/api", () => ({ personalApi: { budgets: vi.fn(), setBudget: vi.fn() } }));

import toast from "react-hot-toast";
import { personalApi } from "@/services/api";
import { BudgetSection } from "./BudgetSection";

const api = personalApi as unknown as Record<"budgets" | "setBudget", ReturnType<typeof vi.fn>>;

const VIEW = {
  month: "2026-11",
  total_budget: 6000, spent_on_budgeted: 2700, total_spent: 2800, over_count: 1, budgeted_count: 2,
  ungrouped: null,
  categories: [
    { category_id: 1, name: "Food", budget: 5000, spent: 1200, left: 3800, over: false, subs: [{ id: 11, name: "Fish", total: 250 }] },
    { category_id: 2, name: "Fun", budget: null, spent: 100, left: null, over: false, subs: [] },
    { category_id: 3, name: "Travel", budget: 1000, spent: 1500, left: -500, over: true, subs: [] },
  ],
};

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><BudgetSection /></QueryClientProvider>);
}
const rows = () => screen.findAllByTestId("budget-row");
const box = (name: string) => screen.getByRole("spinbutton", { name: `Budget for ${name}` });

beforeEach(() => {
  vi.clearAllMocks();
  api.budgets.mockResolvedValue({ data: VIEW });
  api.setBudget.mockResolvedValue({ data: {} });
});

describe("Monthly budget (BG-01 ... BG-10)", () => {
  it("asks for this month and lists every main category with what was spent (BG-01)", async () => {
    renderIt();
    const r = await rows();
    expect(r.map((x) => within(x).getByText(/^(Food|Fun|Travel)$/).textContent)).toEqual(["Food", "Fun", "Travel"]);
    const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    expect(api.budgets).toHaveBeenCalledWith(thisMonth);
    expect(within(r[0]).getByTestId("budget-spent")).toHaveTextContent("Spent ₹1,200");
    expect(r[0]).toHaveTextContent("Fish ₹250");                                                // the sub-category breakdown
  });

  it("shows what is left, or by how much a category is over, and marks the over ones (BG-02)", async () => {
    renderIt();
    const [food, fun, travel] = await rows();
    expect(within(food).getByTestId("budget-left")).toHaveTextContent("₹3,800 left");
    expect(within(travel).getByTestId("budget-left")).toHaveTextContent("Over by ₹500");
    expect(travel).toHaveAttribute("data-over", "true");
    expect(food).toHaveAttribute("data-over", "false");
    expect(within(fun).queryByTestId("budget-left")).toBeNull();                               // no budget: no 'left'
    expect(within(fun).queryByTestId("budget-bar")).toBeNull();
  });

  it("the bar fills with the share spent: normal, amber from 80%, red past the budget and stopping at full (BG-03)", async () => {
    api.budgets.mockResolvedValue({ data: { ...VIEW, categories: [
      { ...VIEW.categories[0], spent: 1000 },                                                    // 20%
      { ...VIEW.categories[0], category_id: 5, name: "A", spent: 4200 },                         // 84%
      VIEW.categories[2],                                                                       // 150%
    ] } });
    renderIt();
    const bars = (await screen.findAllByTestId("budget-bar")) as HTMLElement[];
    expect(bars.map((b) => b.style.width)).toEqual(["20%", "84%", "100%"]);
    expect(bars.map((b) => /bg-(primary|amber-500|red-500)/.exec(b.className)![0])).toEqual(["bg-primary", "bg-amber-500", "bg-red-500"]);
  });

  it("the summary line gives the total budget, what was spent against it and how many are over (BG-04)", async () => {
    renderIt();
    const s = await screen.findByTestId("budget-summary");
    expect(s).toHaveTextContent("Budget ₹6,000");
    expect(s).toHaveTextContent("spent on those categories ₹2,700");
    expect(s).toHaveTextContent("₹3,300 left");
    expect(screen.getByTestId("budget-over-count")).toHaveTextContent("1 over budget");
    expect(screen.getByTestId("budget-unbudgeted")).toHaveTextContent("₹100 was spent on categories without a budget");
  });

  it("typing an amount and leaving the box saves it for that category (BG-05)", async () => {
    const user = userEvent.setup();
    renderIt();
    await rows();
    await user.type(box("Fun"), "800");
    await user.tab();
    await waitFor(() => expect(api.setBudget).toHaveBeenCalledWith(2, 800));
  });

  it("changing an existing budget sends the new amount; Enter saves too (BG-06)", async () => {
    const user = userEvent.setup();
    renderIt();
    await rows();
    expect(box("Food")).toHaveValue(5000);
    await user.clear(box("Food"));
    await user.type(box("Food"), "6500{Enter}");
    await waitFor(() => expect(api.setBudget).toHaveBeenCalledWith(1, 6500));
  });

  it("emptying the box removes the budget (sends null) (BG-07)", async () => {
    const user = userEvent.setup();
    renderIt();
    await rows();
    await user.clear(box("Travel"));
    await user.tab();
    await waitFor(() => expect(api.setBudget).toHaveBeenCalledWith(3, null));
  });

  it("nothing is sent when the amount did not change, or when it is not a valid amount (BG-08)", async () => {
    const user = userEvent.setup();
    renderIt();
    await rows();
    await user.click(box("Food"));
    await user.tab();                                                                           // untouched
    await user.type(box("Fun"), "-5");
    await user.tab();                                                                           // negative
    expect(api.setBudget).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("A budget must be a number, 0 or more");
    expect(box("Fun")).toHaveValue(null);                                                       // and the box goes back to what is saved
  });

  it("the month arrows read other months; next stops at the current month (BG-09)", async () => {
    const user = userEvent.setup();
    renderIt();
    await rows();
    const next = screen.getByRole("button", { name: "Next month" });
    expect(next).toBeDisabled();
    const label = screen.getByTestId("budget-month").textContent;
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByTestId("budget-month").textContent).not.toBe(label);
    await waitFor(() => expect(api.budgets).toHaveBeenCalledTimes(2));
    const prev = new Date(); prev.setMonth(prev.getMonth() - 1, 1);
    expect(api.budgets.mock.calls[1][0]).toBe(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`);
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
  });

  it("with no budget it says how to start, and a refusal from the server is shown (BG-10)", async () => {
    api.budgets.mockResolvedValue({ data: { ...VIEW, total_budget: 0, spent_on_budgeted: 0, over_count: 0, budgeted_count: 0, categories: VIEW.categories.map((c) => ({ ...c, budget: null, left: null, over: false })) } });
    api.setBudget.mockRejectedValue({ response: { data: { detail: "Budgets are set on the main categories, not on a sub-category" } } });
    const user = userEvent.setup();
    renderIt();
    expect(await screen.findByTestId("budget-summary")).toHaveTextContent("No budget set yet");
    await user.type(box("Food"), "100");
    await user.tab();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Budgets are set on the main categories, not on a sub-category"));
  });
});
