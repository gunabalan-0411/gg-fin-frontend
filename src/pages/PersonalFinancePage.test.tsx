/**
 * Personal Finance (/personal): the logged-in person's OWN expenses - same screen and categories as the office expenses, but its own
 * data (the /personal endpoints), "for whom" optional, nothing to group. PF-FE-01 ... PF-FE-12.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/utils/download", () => ({ saveBlob: vi.fn() }));
vi.mock("@/services/api", () => {
  const anyApi = () => new Proxy({}, { get: () => vi.fn().mockResolvedValue({ data: [] }) });
  return {
    personalApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), summary: vi.fn(), exportCsv: vi.fn(), dashboard: vi.fn() },
    expensesApi: { list: vi.fn(), summary: vi.fn(), exportCsv: vi.fn(), legacyGroups: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    expenseGroupsApi: {
      categories: vi.fn(), persons: vi.fn(), createCategory: vi.fn(), renameCategory: vi.fn(), deleteCategory: vi.fn(),
      createPerson: vi.fn(), renamePerson: vi.fn(), deletePerson: vi.fn(),
    },
    unclaimedBalancesApi: anyApi(), defaultedBalancesApi: anyApi(),
  };
});

import toast from "react-hot-toast";
import { saveBlob } from "@/utils/download";
import { expenseGroupsApi, expensesApi, personalApi } from "@/services/api";
import PersonalFinancePage from "./PersonalFinancePage";

type Fn = ReturnType<typeof vi.fn>;
const personal = personalApi as unknown as Record<"list" | "create" | "update" | "delete" | "summary" | "exportCsv" | "dashboard", Fn>;
const office = expensesApi as unknown as Record<"list" | "summary" | "exportCsv" | "legacyGroups" | "create" | "update" | "delete", Fn>;
const grp = expenseGroupsApi as unknown as Record<"categories" | "persons", Fn>;

const CATS = [
  { id: 1, name: "Groceries", parent_id: null, is_system: false, used: 2 },
  { id: 4, name: "Medical", parent_id: null, is_system: false, used: 1 },
  { id: 3, name: "Miscellaneous", parent_id: null, is_system: true, used: 0 },
  { id: 2, name: "Fish & Chicken", parent_id: 1, is_system: false, used: 1 },
];
const PEOPLE = [{ id: 1, name: "Amma", used: 1 }, { id: 2, name: "Appa", used: 0 }];
const MINE = [
  { id: 1, amount: "300.00", date: "2026-10-17", notes: "fish", category_id: 2, top_id: 1, top_name: "Groceries", sub_name: "Fish & Chicken", person_id: 2, person_name: "Appa" },
  { id: 2, amount: "700.00", date: "2026-10-18", notes: "tablets", category_id: 4, top_id: 4, top_name: "Medical", sub_name: null, person_id: null, person_name: null },
];
const SUMMARY = {
  categories: [
    { id: 4, name: "Medical", ungrouped: false, count: 1, total: "700.00", subs: [] },
    { id: 1, name: "Groceries", ungrouped: false, count: 1, total: "300.00", subs: [{ id: 2, name: "Fish & Chicken", count: 1, total: "300.00" }] },
  ],
  people: [{ id: 2, name: "Appa", count: 1, total: "300.00" }, { id: null, name: "Not specified", count: 1, total: "700.00" }],
  total: "1000.00", count: 2,
};

function setup(at = "/personal?section=expenses") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[at]}><PersonalFinancePage /></MemoryRouter></QueryClientProvider>);
  return { ...utils, user: userEvent.setup() };
}
const rows = () => screen.findAllByTestId("expense-row");
const combo = (name: string) => screen.getByRole("combobox", { name });
const lastList = () => personal.list.mock.calls[personal.list.mock.calls.length - 1][0];

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  personal.list.mockResolvedValue({ data: MINE });
  personal.summary.mockResolvedValue({ data: SUMMARY });
  personal.exportCsv.mockResolvedValue({ data: new Blob(["x"]) });
  personal.create.mockResolvedValue({ data: {} });
  personal.update.mockResolvedValue({ data: {} });
  personal.delete.mockResolvedValue({ data: {} });
  office.list.mockResolvedValue({ data: [] });
  office.summary.mockResolvedValue({ data: { categories: [], people: [], total: "0", count: 0 } });
  office.legacyGroups.mockResolvedValue({ data: { groups: [], count: 0, total: "0" } });
  grp.categories.mockResolvedValue({ data: CATS });
  grp.persons.mockResolvedValue({ data: PEOPLE });
});

describe("the page (PF-FE-01 ... PF-FE-03)", () => {
  it("is titled Personal expenses and lists the person's own expenses with the total at the end (PF-FE-01)", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Personal expenses" })).toBeInTheDocument();
    const r = await rows();
    expect(r.map((x) => x.textContent)).toEqual([expect.stringContaining("Medical"), expect.stringContaining("Groceries › Fish & Chicken")]);   // newest first
    expect(r[0]).toHaveTextContent("Not specified");                                              // no person: fine for a personal expense
    expect(screen.getByTestId("expenses-footer-total")).toHaveTextContent("Total expense · 2 records");
    expect(screen.getByTestId("expenses-footer-total")).toHaveTextContent("₹1,000");
    expect(screen.getByTestId("personal-finance")).toHaveAttribute("data-section", "expenses");
  });

  it("only ever reads the PERSONAL endpoints - the office expenses and the old-expense banner are not touched (PF-FE-02)", async () => {
    setup();
    await rows();
    await waitFor(() => expect(personal.list).toHaveBeenCalled());
    expect(office.list).not.toHaveBeenCalled();
    expect(office.summary).not.toHaveBeenCalled();
    expect(office.legacyGroups).not.toHaveBeenCalled();
    expect(screen.queryByTestId("legacy-banner")).toBeNull();
  });

  it("Personal Finance opens on its Dashboard, and so does an unknown section in the address (PF-FE-03)", async () => {
    personal.dashboard.mockResolvedValue({ data: { month: "2026-10", this_month: { total: 0, count: 0 }, last_month: { total: 0, count: 0 }, categories: [], people: [], monthly: [] } });
    const first = setup("/personal");
    expect(await screen.findByRole("heading", { name: "Personal finance" })).toBeInTheDocument();
    expect(screen.getByTestId("personal-finance")).toHaveAttribute("data-section", "dashboard");
    expect(personal.list).not.toHaveBeenCalled();
    first.unmount();
    setup("/personal?section=nonsense");
    expect(await screen.findByRole("heading", { name: "Personal finance" })).toBeInTheDocument();
  });
});

describe("adding and editing (PF-FE-04 ... PF-FE-06)", () => {
  async function openAdd(user: ReturnType<typeof userEvent.setup>) {
    await rows();
    await user.click(screen.getByRole("button", { name: /Add Expense/ }));
    const form = (await screen.findByText("Add Expense", { selector: "h2" })).closest("[role=dialog]") as HTMLElement;
    await waitFor(() => expect(within(form).getByRole("combobox", { name: "Category" })).toHaveValue("Miscellaneous"));
    return form;
  }

  it("for whom is OPTIONAL: it says so, and an expense saves without it, in Miscellaneous by default (PF-FE-04)", async () => {
    const { user } = setup();
    const form = await openAdd(user);
    expect(within(form).getByRole("combobox", { name: "For whom" })).toHaveAttribute("placeholder", "For whom (optional)");
    await user.type(within(form).getByLabelText("Amount"), "250");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(personal.create).toHaveBeenCalledTimes(1));
    expect(personal.create.mock.calls[0][0]).toMatchObject({ amount: 250, notes: null, category_id: null, person_id: null });
    expect(office.create).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("a person and a sub-category can still be picked (the same categories as the office) (PF-FE-05)", async () => {
    const { user } = setup();
    const form = await openAdd(user);
    await user.type(within(form).getByLabelText("Amount"), "90");
    await user.click(within(form).getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Groceries" }));
    await user.click(within(form).getByRole("combobox", { name: "Sub-category" }));
    await user.click(await screen.findByRole("option", { name: "Fish & Chicken" }));
    await user.click(within(form).getByRole("combobox", { name: "For whom" }));
    await user.click(await screen.findByRole("option", { name: "Amma" }));
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(personal.create).toHaveBeenCalledTimes(1));
    expect(personal.create.mock.calls[0][0]).toMatchObject({ amount: 90, category_id: 2, person_id: 1 });
    await waitFor(() => expect(personal.list.mock.calls.length).toBeGreaterThan(1));                  // the list is read again
  });

  it("editing changes through the personal endpoint, and an expense without a person can be saved (PF-FE-06)", async () => {
    const { user } = setup();
    const r = await rows();
    await user.click(within(r[0]).getAllByRole("button")[0]);                                         // edit "tablets" (newest, no person)
    const form = (await screen.findByText("Edit Expense", { selector: "h2" })).closest("[role=dialog]") as HTMLElement;
    await waitFor(() => expect(within(form).getByRole("combobox", { name: "Category" })).toHaveValue("Medical"));
    await user.clear(within(form).getByLabelText("Amount"));
    await user.type(within(form).getByLabelText("Amount"), "750");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(personal.update).toHaveBeenCalledTimes(1));
    expect(personal.update).toHaveBeenCalledWith(2, expect.objectContaining({ amount: 750, category_id: 4 }));
    expect(office.update).not.toHaveBeenCalled();
  });
});

describe("deleting, filtering, totals, export (PF-FE-07 ... PF-FE-12)", () => {
  it("delete asks first and uses the personal endpoint (PF-FE-07)", async () => {
    const { user } = setup();
    const r = await rows();
    await user.click(within(r[1]).getAllByRole("button")[1]);                                          // the fish expense (id 1)
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(personal.delete).toHaveBeenCalledWith(1));
    expect(office.delete).not.toHaveBeenCalled();
  });

  it("filters go to the personal list (PF-FE-08)", async () => {
    const { user } = setup();
    await rows();
    await user.click(combo("Filter by category"));
    await user.click(await screen.findByRole("option", { name: "Medical" }));
    await waitFor(() => expect(lastList()).toEqual({ category_id: 4 }));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-01" } });
    await waitFor(() => expect(lastList()).toEqual({ category_id: 4, date_from: "2026-10-01" }));
    expect(office.list).not.toHaveBeenCalled();
  });

  it("the By-category view uses the personal totals, with the grand total at the end (PF-FE-09)", async () => {
    const { user } = setup();
    await rows();
    await user.click(screen.getByRole("button", { name: /By category/ }));
    expect(await screen.findByTestId("summary-total")).toHaveTextContent("₹1,000");
    expect(personal.summary).toHaveBeenCalled();
    expect(office.summary).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("summary-category").map((c) => c.textContent)).toEqual([expect.stringContaining("Medical"), expect.stringContaining("Groceries")]);
  });

  it("Export CSV uses the personal export and names the file personal_… (PF-FE-10)", async () => {
    const { user } = setup();
    await rows();
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(personal.exportCsv).toHaveBeenCalledWith("rows", {}));
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "personal_expenses.csv");
    await user.click(screen.getByRole("button", { name: /By category/ }));
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(personal.exportCsv).toHaveBeenLastCalledWith("summary", {}));
    expect(saveBlob).toHaveBeenLastCalledWith(expect.any(Blob), "personal_expenses_summary.csv");
    expect(office.exportCsv).not.toHaveBeenCalled();
  });

  it("the categories are the SAME lists as the office's: the manage screen shows them (PF-FE-11)", async () => {
    const { user } = setup();
    await rows();
    await user.click(screen.getByRole("button", { name: /^Categories$/ }));
    const list = await screen.findByTestId("manage-categories");
    expect(within(list).getAllByTestId("manage-row").map((r) => r.getAttribute("data-name"))).toEqual(["Groceries", "Fish & Chicken", "Medical", "Miscellaneous"]);
    expect(grp.categories).toHaveBeenCalled();
  });

  it("an empty list says so (PF-FE-12)", async () => {
    personal.list.mockResolvedValue({ data: [] });
    setup();
    expect(await screen.findByText("No expenses recorded")).toBeInTheDocument();
  });
});
