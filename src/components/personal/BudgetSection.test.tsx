/**
 * Personal Finance > Monthly budget: the category budgets with what carries forward, and the month switch that drives the whole page.
 * BG-01 ... BG-14. The real page with only the network layer mocked (the expense accounts have their own tests).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/services/api", () => ({
  personalApi: {
    budgets: vi.fn(), setBudget: vi.fn(),
    accounts: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(), deleteAccount: vi.fn(),
    accountEntries: vi.fn(), addFund: vi.fn(), deleteEntry: vi.fn(), reconcile: vi.fn(),
  },
}));

import toast from "react-hot-toast";
import { personalApi } from "@/services/api";
import { BudgetSection } from "./BudgetSection";

const api = personalApi as unknown as Record<"budgets" | "setBudget" | "accounts", ReturnType<typeof vi.fn>>;

const CAT = (over: object) => ({ budget: null, spent: 0, over: false, carried_in: null, available: null, left: null, subs: [], ...over });
const VIEW = {
  month: "2026-11",
  total_budget: 8500, total_carried_in: 1000, total_available: 9500, spent_on_budgeted: 2700, total_spent: 3000, left: 6800, over_count: 1, budgeted_count: 3,
  ungrouped: null,
  categories: [
    CAT({ category_id: 1, name: "Food", budget: 5000, carried_in: 800, available: 5800, spent: 1200, left: 4600, subs: [{ id: 11, name: "Fish", total: 250 }] }),
    CAT({ category_id: 2, name: "Fun", spent: 300 }),
    CAT({ category_id: 3, name: "Medical", budget: 1000, carried_in: -1500, available: -500, spent: 0, left: -500, over: true }),
    CAT({ category_id: 4, name: "Travel", budget: 2500, carried_in: 1700, available: 4200, spent: 1500, left: 2700 }),
    CAT({ category_id: 5, name: "Gifts" }),
    CAT({ category_id: 6, name: "Pets" }),
  ],
};
const NO_ACCOUNTS = { month: "2026-11", accounts: [], totals: { month_opening: 0, funds: 0, adjustments: 0, spent: 0, closing: 0, balance_now: 0 } };

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><BudgetSection /></QueryClientProvider>);
}
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const rows = () => screen.findAllByTestId("budget-row");
const box = (name: string) => screen.getByRole("textbox", { name: `Monthly budget for ${name}` });
const inRow = (r: HTMLElement, id: string) => within(r).getByTestId(id).textContent;

beforeEach(() => {
  vi.clearAllMocks();
  api.budgets.mockResolvedValue({ data: VIEW });
  api.accounts.mockResolvedValue({ data: NO_ACCOUNTS });
  api.setBudget.mockResolvedValue({ data: {} });
});

describe("Category budgets (BG-01 ... BG-08)", () => {
  it("asks for this month and lists only the categories that have a budget or spending (BG-01)", async () => {
    renderIt();
    const r = await rows();
    expect(r.map((x) => within(x).getByText(/^(Food|Fun|Medical|Travel)$/).textContent)).toEqual(["Food", "Fun", "Medical", "Travel"]);
    expect(api.budgets).toHaveBeenCalledWith(thisMonth());
    expect(screen.queryByText("Gifts")).toBeNull();                                           // nothing set, nothing spent: kept out of the way
    expect(r[0]).toHaveTextContent("Fish ₹250");                                              // the sub-category breakdown
  });

  it("each row reads budget + carried in = available, then spent and what is left (BG-02)", async () => {
    renderIt();
    const [food, fun, medical, travel] = await rows();
    expect(box("Food")).toHaveValue("₹5,000");
    expect([inRow(food, "budget-carried"), inRow(food, "budget-available"), inRow(food, "budget-spent"), inRow(food, "budget-left")]).toEqual(["+₹800", "₹5,800", "₹1,200", "₹4,600 left"]);
    expect(inRow(travel, "budget-carried")).toBe("+₹1,700");
    expect([inRow(medical, "budget-carried"), inRow(medical, "budget-available"), inRow(medical, "budget-left")]).toEqual(["−₹1,500", "−₹500", "Over ₹500"]);
    expect(medical).toHaveAttribute("data-over", "true");
    expect(food).toHaveAttribute("data-over", "false");
    expect([inRow(fun, "budget-carried"), inRow(fun, "budget-available")]).toEqual(["—", "—"]);   // spent on it but no budget: no arithmetic
    expect(within(fun).queryByTestId("budget-bar")).toBeNull();
    expect(box("Fun")).toHaveValue("");
    expect(box("Fun")).toHaveAttribute("placeholder", "Set budget");
  });

  it("the bar shows the share of what is available: normal, amber from 80%, and full red once nothing is left (BG-03)", async () => {
    api.budgets.mockResolvedValue({ data: { ...VIEW, categories: [
      CAT({ category_id: 1, name: "A", budget: 1000, carried_in: 0, available: 1000, spent: 200, left: 800 }),            // 20%
      CAT({ category_id: 2, name: "B", budget: 1000, carried_in: 0, available: 1000, spent: 850, left: 150 }),            // 85%
      VIEW.categories[2],                                                                                                 // available -500
      CAT({ category_id: 4, name: "D", budget: 1000, carried_in: 0, available: 1000, spent: 1400, left: -400, over: true }),
    ] } });
    renderIt();
    const bars = (await screen.findAllByTestId("budget-bar")) as HTMLElement[];
    expect(bars.map((b) => b.style.width)).toEqual(["20%", "85%", "100%", "100%"]);
    expect(bars.map((b) => /bg-(primary|amber-500|\[hsl\(var\(--neg\)\)\])/.exec(b.className)![0])).toEqual(["bg-primary", "bg-amber-500", "bg-[hsl(var(--neg))]", "bg-[hsl(var(--neg))]"]);
  });

  it("the statement adds the month up and says where the leftover goes (BG-04)", async () => {
    renderIt();
    await rows();
    const s = screen.getByTestId("budget-statement");
    expect(within(s).getByTestId("st-budget")).toHaveTextContent("₹8,500");
    expect(within(s).getByTestId("st-carried")).toHaveTextContent("₹1,000");
    expect(within(s).getByTestId("st-available")).toHaveTextContent("₹9,500");
    expect(within(s).getByTestId("st-spent")).toHaveTextContent("₹2,700");
    expect(within(s).getByTestId("st-left")).toHaveTextContent("₹6,800");
    expect(within(s).getByTestId("st-note")).toHaveTextContent("₹6,800 left so far. It carries into");
    expect(screen.getByTestId("budget-over-count")).toHaveTextContent("1 category is over");
  });

  it("when the month is overspent the statement says Over by, not Left (BG-05)", async () => {
    api.budgets.mockResolvedValue({ data: { ...VIEW, left: -300, spent_on_budgeted: 9800 } });
    renderIt();
    await rows();
    expect(screen.getByText("Over by")).toBeInTheDocument();
    expect(screen.getByTestId("st-left")).toHaveTextContent("₹300");
    expect(screen.getByTestId("st-note")).toHaveTextContent("₹300 over what was available");
  });

  it("typing an amount and leaving the box saves it; the box shows a plain number while typing and ₹ amounts otherwise (BG-06)", async () => {
    const user = userEvent.setup();
    renderIt();
    await rows();
    await user.click(box("Fun"));
    await user.type(box("Fun"), "800");
    expect(box("Fun")).toHaveValue("800");
    await user.tab();
    await waitFor(() => expect(api.setBudget).toHaveBeenCalledWith(2, 800));
  });

  it("changing an existing budget sends the new amount (Enter saves too); emptying the box removes it (BG-07)", async () => {
    const user = userEvent.setup();
    renderIt();
    await rows();
    await user.click(box("Food"));
    expect(box("Food")).toHaveValue("5000");                                                   // focused: the plain number to edit
    await user.clear(box("Food"));
    await user.type(box("Food"), "6500{Enter}");
    await waitFor(() => expect(api.setBudget).toHaveBeenCalledWith(1, 6500));
    await user.click(box("Travel"));
    await user.clear(box("Travel"));
    await user.tab();
    await waitFor(() => expect(api.setBudget).toHaveBeenCalledWith(4, null));
  });

  it("nothing is sent for an unchanged or a negative amount; letters are not accepted (BG-08)", async () => {
    const user = userEvent.setup();
    renderIt();
    await rows();
    await user.click(box("Food"));
    await user.tab();                                                                          // untouched
    await user.click(box("Fun"));
    await user.type(box("Fun"), "ab-5");
    expect(box("Fun")).toHaveValue("-5");                                                      // the letters never got in
    await user.tab();
    expect(api.setBudget).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("A budget must be a number, 0 or more");
    expect(box("Fun")).toHaveValue("");                                                        // back to what is saved
  });
});

describe("The rest of the page (BG-09 ... BG-14)", () => {
  it("categories with nothing set sit behind one line, and a budget can be started from there (BG-09)", async () => {
    const user = userEvent.setup();
    renderIt();
    await rows();
    expect(screen.queryByTestId("budget-others")).toBeNull();
    const toggle = screen.getByTestId("budget-others-toggle");
    expect(toggle).toHaveTextContent("Show 2 categories without a budget or spending");
    await user.click(toggle);
    const others = within(screen.getByTestId("budget-others"));
    expect(others.getAllByTestId("budget-other-row").map((r) => r.textContent)).toEqual(["Gifts", "Pets"]);
    await user.type(box("Pets"), "400");
    await user.tab();
    await waitFor(() => expect(api.setBudget).toHaveBeenCalledWith(6, 400));
    await user.click(screen.getByTestId("budget-others-toggle"));
    expect(screen.queryByTestId("budget-others")).toBeNull();
  });

  it("the month arrows read other months for BOTH the accounts and the budgets; next stops at this month (BG-10)", async () => {
    const user = userEvent.setup();
    renderIt();
    await rows();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    const label = screen.getByTestId("budget-month").textContent;
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByTestId("budget-month").textContent).not.toBe(label);
    const prev = new Date(); prev.setMonth(prev.getMonth() - 1, 1);
    const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    await waitFor(() => expect(api.budgets).toHaveBeenCalledWith(prevKey));
    expect(api.accounts).toHaveBeenCalledWith(prevKey);
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Back to this month" }));
    expect(screen.getByTestId("budget-month").textContent).toBe(label);
    expect(screen.queryByRole("button", { name: "Back to this month" })).toBeNull();
  });

  it("a past month talks in the past tense about what carried forward (BG-11)", async () => {
    const user = userEvent.setup();
    renderIt();
    await rows();
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await waitFor(() => expect(screen.getByTestId("st-note")).toHaveTextContent("It carried into"));
    expect(screen.getByTestId("st-note")).not.toHaveTextContent("so far");
  });

  it("spending outside the budgeted categories is listed under the table, not counted against the budget (BG-12)", async () => {
    api.budgets.mockResolvedValue({ data: { ...VIEW, ungrouped: { name: "Ungrouped", spent: 75 } } });
    renderIt();
    await rows();
    expect(screen.getByTestId("budget-unbudgeted")).toHaveTextContent("₹300 was spent on categories without a budget, including ₹75 in no category at all");
  });

  it("with no budget there is no statement and a way in; a refusal from the server is shown (BG-13)", async () => {
    api.budgets.mockResolvedValue({ data: { ...VIEW, total_budget: 0, total_carried_in: 0, total_available: 0, spent_on_budgeted: 0, left: 0, over_count: 0, budgeted_count: 0,
      categories: VIEW.categories.map((c) => ({ ...c, budget: null, carried_in: null, available: null, left: null, over: false, spent: 0 })) } });
    api.setBudget.mockRejectedValue({ response: { data: { detail: "Budgets are set on the main categories, not on a sub-category" } } });
    const user = userEvent.setup();
    renderIt();
    expect(await screen.findByTestId("budget-none-yet")).toHaveTextContent("No budget set yet");
    expect(screen.queryByTestId("budget-statement")).toBeNull();
    await user.click(within(screen.getByTestId("budget-none-yet")).getByRole("button", { name: "the category list" }));
    await user.type(box("Food"), "100");
    await user.tab();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Budgets are set on the main categories, not on a sub-category"));
  });

  it("says so when the budget cannot be read (BG-14)", async () => {
    api.budgets.mockRejectedValue(new Error("500"));
    renderIt();
    expect(await screen.findByText("Could not load your budget")).toBeInTheDocument();
  });
});
