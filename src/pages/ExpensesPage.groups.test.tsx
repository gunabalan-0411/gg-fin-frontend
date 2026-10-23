/**
 * The Expenses page with categories (two levels) and "for whom": the columns, the filters, the totals at the end, the By-category view,
 * the CSV export, the Add / Edit form, managing categories and people, and grouping the old expenses. EP-01 ... EP-16.
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
    expensesApi: {
      list: vi.fn(), summary: vi.fn(), exportCsv: vi.fn(), legacyGroups: vi.fn(), applyLegacy: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    expenseGroupsApi: {
      categories: vi.fn(), persons: vi.fn(), createCategory: vi.fn(), renameCategory: vi.fn(), deleteCategory: vi.fn(),
      createPerson: vi.fn(), renamePerson: vi.fn(), deletePerson: vi.fn(),
    },
    personalApi: anyApi(), unclaimedBalancesApi: anyApi(), defaultedBalancesApi: anyApi(),
  };
});

import toast from "react-hot-toast";
import { saveBlob } from "@/utils/download";
import { expenseGroupsApi, expensesApi } from "@/services/api";
import AccountAdjustmentsPage from "./ExpensesPage";

type Fn = ReturnType<typeof vi.fn>;
const exp = expensesApi as unknown as Record<"list" | "summary" | "exportCsv" | "legacyGroups" | "applyLegacy" | "create" | "update" | "delete", Fn>;
const grp = expenseGroupsApi as unknown as Record<"categories" | "persons" | "createCategory" | "renameCategory" | "deleteCategory" | "createPerson" | "renamePerson" | "deletePerson", Fn>;

const CATS = [
  { id: 1, name: "Groceries", parent_id: null, is_system: false, used: 2 },
  { id: 4, name: "Medical", parent_id: null, is_system: false, used: 1 },
  { id: 3, name: "Miscellaneous", parent_id: null, is_system: true, used: 0 },
  { id: 2, name: "Fish & Chicken", parent_id: 1, is_system: false, used: 1 },
];
const PEOPLE = [{ id: 1, name: "Amma", used: 1 }, { id: 2, name: "Appa", used: 1 }];
const EXPENSES = [
  { id: 1, amount: "300.00", date: "2026-10-17", notes: "fish", category_id: 2, top_id: 1, top_name: "Groceries", sub_name: "Fish & Chicken", person_id: 2, person_name: "Appa" },
  { id: 2, amount: "700.00", date: "2026-10-17", notes: "tablets", category_id: 4, top_id: 4, top_name: "Medical", sub_name: null, person_id: 1, person_name: "Amma" },
  { id: 3, amount: "1000.00", date: "2022-08-16", notes: "old note", category_id: null, top_id: null, top_name: null, sub_name: null, person_id: null, person_name: null },
];
const SUMMARY = {
  categories: [
    { id: 4, name: "Medical", ungrouped: false, count: 1, total: "700.00", subs: [] },
    { id: 1, name: "Groceries", ungrouped: false, count: 1, total: "300.00", subs: [{ id: 2, name: "Fish & Chicken", count: 1, total: "300.00" }] },
    { id: null, name: "Ungrouped", ungrouped: true, count: 1, total: "1000.00", subs: [] },
  ],
  people: [{ id: 2, name: "Appa", count: 1, total: "300.00" }, { id: 1, name: "Amma", count: 1, total: "700.00" }, { id: null, name: "Not specified", count: 1, total: "1000.00" }],
  total: "2000.00", count: 3,
};
const GROUPS = {
  groups: [
    { notes: "groceries, appa", count: 5, total: "900.00", first: "2022-08-16", last: "2022-09-01", category_id: 1, person_id: 2 },
    { notes: "eye glass, amma", count: 1, total: "600.00", first: "2022-08-19", last: "2022-08-19", category_id: 4, person_id: 1 },
    { notes: "day expense", count: 2, total: "500.00", first: "2022-08-20", last: "2022-08-21", category_id: 3, person_id: null },
  ],
  count: 8, total: "2000.00",
};

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/expenses"]}><AccountAdjustmentsPage /></MemoryRouter></QueryClientProvider>);
  return { ...utils, user: userEvent.setup() };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  exp.list.mockResolvedValue({ data: EXPENSES });
  exp.summary.mockResolvedValue({ data: SUMMARY });
  exp.exportCsv.mockResolvedValue({ data: new Blob(["x"]) });
  exp.legacyGroups.mockResolvedValue({ data: GROUPS });
  exp.applyLegacy.mockResolvedValue({ data: { updated: 6 } });
  exp.create.mockResolvedValue({ data: {} });
  exp.update.mockResolvedValue({ data: {} });
  grp.categories.mockResolvedValue({ data: CATS });
  grp.persons.mockResolvedValue({ data: PEOPLE });
  grp.createCategory.mockResolvedValue({ data: { id: 20, name: "New", parent_id: null, is_system: false, used: 0 } });
  grp.renameCategory.mockResolvedValue({ data: {} });
  grp.deleteCategory.mockResolvedValue({ data: { deleted: 1, moved: 2 } });
  grp.createPerson.mockResolvedValue({ data: { id: 21, name: "New", used: 0 } });
  grp.renamePerson.mockResolvedValue({ data: {} });
  grp.deletePerson.mockResolvedValue({ data: { deleted: 2, unspecified: 1 } });
});

const rows = () => screen.findAllByTestId("expense-row");
const combo = (name: string) => screen.getByRole("combobox", { name });
const lastList = () => exp.list.mock.calls[exp.list.mock.calls.length - 1][0];

describe("the list (EP-01, EP-02)", () => {
  it("shows Category (with its sub-category) and For whom; old expenses read Ungrouped / Not specified (EP-01)", async () => {
    setup();
    const r = await rows();
    expect(r).toHaveLength(3);
    const text = r.map((x) => x.textContent);
    expect(text[0]).toContain("Groceries › Fish & Chicken");
    expect(text[0]).toContain("Appa");
    expect(text[1]).toContain("Medical");
    expect(text[1]).not.toContain("›");
    expect(text[2]).toContain("Ungrouped");
    expect(text[2]).toContain("Not specified");
  });

  it("the total expense is at the end of the table and in the header, and follows the filters (EP-02)", async () => {
    const { user } = setup();
    await rows();
    expect(screen.getByTestId("expenses-footer-total")).toHaveTextContent("Total expense · 3 records");
    expect(screen.getByTestId("expenses-footer-total")).toHaveTextContent("₹2,000");
    expect(screen.getByTestId("expenses-total")).toHaveTextContent("₹2,000");
    exp.list.mockResolvedValue({ data: [EXPENSES[0]] });
    await user.click(combo("Filter by person"));
    await user.click(await screen.findByRole("option", { name: "Appa" }));
    await waitFor(() => expect(screen.getByTestId("expenses-footer-total")).toHaveTextContent("Total expense · 1 record"));
    expect(screen.getByTestId("expenses-total")).toHaveTextContent("₹300");
    expect(screen.getByText(/\(filtered\)/)).toBeInTheDocument();
  });
});

describe("the filters (EP-03)", () => {
  it("category (a top-level one also covers its sub-categories), person, dates and search are sent to the server; clearing removes them", async () => {
    const { user } = setup();
    await rows();
    expect(lastList()).toEqual({});
    await user.click(combo("Filter by category"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Groceries", "Groceries › Fish & Chicken", "Medical", "Miscellaneous"]);
    await user.click(screen.getByRole("option", { name: "Groceries › Fish & Chicken" }));
    await waitFor(() => expect(lastList()).toEqual({ category_id: 2 }));
    await user.click(combo("Filter by person"));
    await user.click(await screen.findByRole("option", { name: "Amma" }));
    await waitFor(() => expect(lastList()).toEqual({ category_id: 2, person_id: 1 }));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-10-31" } });
    await waitFor(() => expect(lastList()).toEqual({ category_id: 2, person_id: 1, date_from: "2026-10-01", date_to: "2026-10-31" }));
    await user.type(screen.getByLabelText("Search notes"), "fish");
    await waitFor(() => expect(lastList()).toMatchObject({ search: "fish" }));
    await user.click(screen.getByRole("button", { name: "Clear Filter by category" }));
    await waitFor(() => expect(lastList()).not.toHaveProperty("category_id"));
  });

  it("an empty result says no expenses match (EP-03)", async () => {
    const { user } = setup();
    await rows();
    exp.list.mockResolvedValue({ data: [] });
    await user.type(screen.getByLabelText("Search notes"), "zzz");
    expect(await screen.findByText("No expenses match these filters")).toBeInTheDocument();
  });
});

describe("By category (EP-04)", () => {
  it("shows categories with their sub-categories, people, and the grand total at the end of each table", async () => {
    const { user } = setup();
    await rows();
    await user.click(screen.getByRole("button", { name: /By category/ }));
    const cats = await screen.findAllByTestId("summary-category");
    expect(cats.map((c) => c.textContent)).toEqual([expect.stringContaining("Medical"), expect.stringContaining("Groceries"), expect.stringContaining("Ungrouped (old expenses)")]);
    expect(screen.getByTestId("summary-sub")).toHaveTextContent("Fish & Chicken");
    expect(screen.getByTestId("summary-sub")).toHaveTextContent("₹300");
    expect(screen.getByTestId("summary-total")).toHaveTextContent("Total expense");
    expect(screen.getByTestId("summary-total")).toHaveTextContent("₹2,000");
    expect(screen.getAllByTestId("summary-person").map((p) => p.textContent)).toEqual([expect.stringContaining("Appa"), expect.stringContaining("Amma"), expect.stringContaining("Not specified")]);
    expect(cats[0]).toHaveTextContent("35%");                                                    // 700 of 2000
  });

  it("follows the filters, and says so when nothing matches", async () => {
    const { user } = setup();
    await rows();
    await user.click(combo("Filter by person"));
    await user.click(await screen.findByRole("option", { name: "Appa" }));
    await user.click(screen.getByRole("button", { name: /By category/ }));
    await waitFor(() => expect(exp.summary).toHaveBeenLastCalledWith(expect.objectContaining({ person_id: 2 })));
    exp.summary.mockResolvedValue({ data: { categories: [], people: [], total: "0.00", count: 0 } });
    await user.click(combo("Filter by person"));
    await user.click(await screen.findByRole("option", { name: "Amma" }));
    expect(await screen.findByTestId("summary-empty")).toBeInTheDocument();
  });
});

describe("Export CSV (EP-05)", () => {
  it("the list exports its rows with the current filters; the By-category view exports the totals", async () => {
    const { user } = setup();
    await rows();
    await user.click(combo("Filter by person"));
    await user.click(await screen.findByRole("option", { name: "Appa" }));
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(exp.exportCsv).toHaveBeenCalledWith("rows", { person_id: 2 }));
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "expenses.csv");
    await user.click(screen.getByRole("button", { name: /By category/ }));
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(exp.exportCsv).toHaveBeenLastCalledWith("summary", { person_id: 2 }));
    expect(saveBlob).toHaveBeenLastCalledWith(expect.any(Blob), "expenses_summary.csv");
  });

  it("a failed export is reported, not silent", async () => {
    exp.exportCsv.mockRejectedValue(new Error("500"));
    const { user } = setup();
    await rows();
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not export the expenses"));
    expect(saveBlob).not.toHaveBeenCalled();
  });
});

describe("Add / Edit (EP-06, EP-07)", () => {
  it("Add Expense needs For whom; the category starts as Miscellaneous; save sends category + person (EP-06)", async () => {
    const { user } = setup();
    await rows();
    await user.click(screen.getByRole("button", { name: /Add Expense/ }));
    const form = (await screen.findByText("Add Expense", { selector: "h2" })).closest("[role=dialog]") as HTMLElement;
    await waitFor(() => expect(within(form).getByRole("combobox", { name: "Category" })).toHaveValue("Miscellaneous"));
    await user.type(within(form).getByLabelText("Amount"), "250");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    expect(exp.create).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Choose who the expense was for");
    await user.click(within(form).getByRole("combobox", { name: "For whom" }));
    await user.click(await screen.findByRole("option", { name: "Amma" }));
    await user.click(within(form).getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Groceries" }));
    await user.click(within(form).getByRole("combobox", { name: "Sub-category" }));
    await user.click(await screen.findByRole("option", { name: "Fish & Chicken" }));
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(exp.create).toHaveBeenCalledTimes(1));
    expect(exp.create.mock.calls[0][0]).toMatchObject({ amount: 250, category_id: 2, person_id: 1, notes: null });
  });

  it("editing a grouped expense shows its category, sub-category and person (EP-07)", async () => {
    const { user } = setup();
    const r = await rows();
    await user.click(within(r[0]).getAllByRole("button")[0]);
    const form = (await screen.findByText("Edit Expense", { selector: "h2" })).closest("[role=dialog]") as HTMLElement;
    await waitFor(() => expect(within(form).getByRole("combobox", { name: "Category" })).toHaveValue("Groceries"));
    expect(within(form).getByRole("combobox", { name: "Sub-category" })).toHaveValue("Fish & Chicken");
    expect(within(form).getByRole("combobox", { name: "For whom" })).toHaveValue("Appa");
    expect(within(form).getByLabelText("Amount")).toHaveValue(300);
    await user.clear(within(form).getByLabelText("Amount"));
    await user.type(within(form).getByLabelText("Amount"), "320");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(exp.update).toHaveBeenCalledTimes(1));
    expect(exp.update).toHaveBeenCalledWith(1, expect.objectContaining({ amount: 320, category_id: 2, person_id: 2 }));
  });

  it("editing an OLD expense shows an empty category (not Miscellaneous) and keeps it ungrouped unless one is picked; For whom is still required (EP-07)", async () => {
    const { user } = setup();
    const r = await rows();
    await user.click(within(r[2]).getAllByRole("button")[0]);
    const form = (await screen.findByText("Edit Expense", { selector: "h2" })).closest("[role=dialog]") as HTMLElement;
    const cat = within(form).getByRole("combobox", { name: "Category" });
    expect(cat).toHaveValue("");
    expect(cat).toHaveAttribute("placeholder", "Ungrouped — pick a category");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    expect(exp.update).not.toHaveBeenCalled();                                                   // no person yet
    await user.click(within(form).getByRole("combobox", { name: "For whom" }));
    await user.click(await screen.findByRole("option", { name: "Appa" }));
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(exp.update).toHaveBeenCalledTimes(1));
    expect(exp.update.mock.calls[0][1]).toMatchObject({ category_id: null, person_id: 2 });
  });
});

describe("the old-expenses banner (EP-08)", () => {
  it("appears while old expenses have no category and opens the grouping screen; hidden when there are none", async () => {
    const { user, unmount } = setup();
    expect((await screen.findByTestId("legacy-banner"))).toHaveTextContent("1 old expense has no category yet.");
    await user.click(screen.getByRole("button", { name: "Group old expenses" }));
    expect(await screen.findByText(/These expenses have no category yet/)).toBeInTheDocument();
    unmount();
    exp.summary.mockResolvedValue({ data: { ...SUMMARY, categories: SUMMARY.categories.filter((c) => !c.ungrouped) } });
    setup();
    await rows();
    await waitFor(() => expect(exp.summary).toHaveBeenCalled());
    expect(screen.queryByTestId("legacy-banner")).toBeNull();
  });
});

describe("Group old expenses (EP-09 ... EP-12)", () => {
  async function openLegacy() {
    const ctx = setup();
    await ctx.user.click(await screen.findByRole("button", { name: "Group old expenses" }));
    await screen.findAllByTestId("legacy-row");
    return ctx;
  }
  const legacyRow = (notes: string) => screen.getAllByTestId("legacy-row").find((r) => r.textContent?.includes(notes)) as HTMLElement;

  it("lists one line per notes text with the suggested category and person, all ticked, with the counts (EP-09)", async () => {
    await openLegacy();
    expect(screen.getAllByTestId("legacy-row")).toHaveLength(3);
    const g = legacyRow("groceries, appa");
    expect(within(g).getByRole("combobox", { name: /^Category for/ })).toHaveValue("Groceries");
    expect(within(g).getByRole("combobox", { name: /^For whom/ })).toHaveValue("Appa");
    expect(within(legacyRow("day expense")).getByRole("combobox", { name: /^Category for/ })).toHaveValue("Miscellaneous");
    expect(within(legacyRow("day expense")).getByRole("combobox", { name: /^For whom/ })).toHaveValue("");
    expect(screen.getByTestId("legacy-apply")).toHaveTextContent("Apply to 8 expenses");
    expect(screen.getByTestId("legacy-hint")).toHaveTextContent("1 line without a person stay “not specified”");
  });

  it("nothing is saved until Apply; Apply sends the ticked lines with their (possibly changed) category and person (EP-10)", async () => {
    const { user } = await openLegacy();
    expect(exp.applyLegacy).not.toHaveBeenCalled();
    const eye = legacyRow("eye glass");
    await user.click(within(eye).getByRole("combobox", { name: /^Category for/ }));
    await user.click(await screen.findByRole("option", { name: "Groceries › Fish & Chicken" }));    // changed from the guess
    const day = legacyRow("day expense");
    await user.click(within(day).getByRole("combobox", { name: /^For whom/ }));
    await user.click(await screen.findByRole("option", { name: "Appa" }));
    await user.click(within(legacyRow("groceries, appa")).getByRole("checkbox"));                  // leave this one for later
    expect(screen.getByTestId("legacy-apply")).toHaveTextContent("Apply to 3 expenses");
    await user.click(screen.getByTestId("legacy-apply"));
    await waitFor(() => expect(exp.applyLegacy).toHaveBeenCalledTimes(1));
    expect(exp.applyLegacy).toHaveBeenCalledWith([
      { notes: "eye glass, amma", category_id: 2, person_id: 1 },
      { notes: "day expense", category_id: 3, person_id: 2 },
    ]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("6 old expenses grouped"));
    await waitFor(() => expect(screen.queryByText(/These expenses have no category yet/)).toBeNull());
  });

  it("Select none / Select all, and Apply is off while nothing is ticked (EP-11)", async () => {
    const { user } = await openLegacy();
    await user.click(screen.getByRole("button", { name: "Select none" }));
    expect(screen.getByTestId("legacy-apply")).toBeDisabled();
    expect(screen.getByTestId("legacy-apply")).toHaveTextContent("Apply to 0 expenses");
    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByTestId("legacy-apply")).toBeEnabled();
  });

  it("a failed Apply changes nothing and says so; with nothing left it says every expense is grouped (EP-12)", async () => {
    exp.applyLegacy.mockRejectedValue(new Error("500"));
    const { user } = await openLegacy();
    await user.click(screen.getByTestId("legacy-apply"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not group the old expenses — nothing was changed"));
    expect(screen.getAllByTestId("legacy-row")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Close" }));
    exp.legacyGroups.mockResolvedValue({ data: { groups: [], count: 0, total: "0.00" } });
    await user.click(await screen.findByRole("button", { name: "Group old expenses" }));
    expect(await screen.findByTestId("legacy-empty")).toBeInTheDocument();
  });
});

describe("Categories & people (EP-13 ... EP-16)", () => {
  async function openManage() {
    const ctx = setup();
    await rows();
    await ctx.user.click(screen.getByRole("button", { name: /^Categories$/ }));
    await screen.findByTestId("manage-categories");
    return ctx;
  }
  const manageRow = (name: string) => screen.getAllByTestId("manage-row").find((r) => r.getAttribute("data-name") === name) as HTMLElement;

  it("lists categories with their sub-categories and use counts; Miscellaneous is marked default and cannot be changed (EP-13)", async () => {
    await openManage();
    expect(screen.getAllByTestId("manage-row").map((r) => r.getAttribute("data-name"))).toEqual(["Groceries", "Fish & Chicken", "Medical", "Miscellaneous"]);
    expect(manageRow("Groceries")).toHaveTextContent("2 expenses");
    expect(manageRow("Fish & Chicken")).toHaveTextContent("1 expense");
    expect(manageRow("Miscellaneous")).toHaveTextContent("default");
    expect(within(manageRow("Miscellaneous")).queryByRole("button", { name: /Rename|Delete/ })).toBeNull();
  });

  it("adds a category and a sub-category (EP-14)", async () => {
    const { user } = await openManage();
    await user.type(screen.getByLabelText("New category…"), "Education");
    await user.click(screen.getAllByRole("button", { name: "Add" })[0]);
    await waitFor(() => expect(grp.createCategory).toHaveBeenCalledWith("Education", null));
    await user.click(screen.getByRole("button", { name: "Add a sub-category to Medical" }));
    await user.type(screen.getByLabelText("New sub-category of Medical"), "Dental{Enter}");
    await waitFor(() => expect(grp.createCategory).toHaveBeenLastCalledWith("Dental", 4));
  });

  it("renames, and shows the server's reason when the name is taken (EP-14)", async () => {
    const { user } = await openManage();
    await user.click(within(manageRow("Medical")).getByRole("button", { name: "Rename Medical" }));
    const input = screen.getByLabelText("New name for Medical");
    await user.clear(input);
    await user.type(input, "Health{Enter}");
    await waitFor(() => expect(grp.renameCategory).toHaveBeenCalledWith(4, "Health"));
    grp.renameCategory.mockRejectedValueOnce({ response: { data: { detail: { message: "'Groceries' already exists here" } } } });
    await user.click(within(manageRow("Medical")).getByRole("button", { name: "Rename Medical" }));
    await user.clear(screen.getByLabelText("New name for Medical"));
    await user.type(screen.getByLabelText("New name for Medical"), "Groceries{Enter}");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("'Groceries' already exists here"));
    expect(screen.getByLabelText("New name for Medical")).toBeInTheDocument();                  // stays open to be corrected
  });

  it("delete asks first and says where the expenses go; Keep cancels (EP-15)", async () => {
    const { user } = await openManage();
    await user.click(within(manageRow("Groceries")).getByRole("button", { name: "Delete Groceries" }));
    expect(manageRow("Groceries")).toHaveTextContent("2 expenses move to Miscellaneous, and its sub-categories go.");
    await user.click(within(manageRow("Groceries")).getByRole("button", { name: "Keep" }));
    expect(grp.deleteCategory).not.toHaveBeenCalled();
    await user.click(within(manageRow("Fish & Chicken")).getByRole("button", { name: "Delete Fish & Chicken" }));
    expect(manageRow("Fish & Chicken")).toHaveTextContent("1 expense move to Groceries.");
    await user.click(within(manageRow("Fish & Chicken")).getByTestId("confirm-delete"));
    await waitFor(() => expect(grp.deleteCategory).toHaveBeenCalledWith(2));
  });

  it("the For whom tab adds, renames and deletes people; a deleted person's expenses become not specified (EP-16)", async () => {
    const { user } = await openManage();
    await user.click(screen.getByRole("button", { name: "For whom" }));
    await screen.findByTestId("manage-persons");
    expect(screen.getAllByTestId("manage-row").map((r) => r.getAttribute("data-name"))).toEqual(["Amma", "Appa"]);
    await user.type(screen.getByLabelText("New person…"), "Suji{Enter}");
    await waitFor(() => expect(grp.createPerson).toHaveBeenCalledWith("Suji"));
    await user.click(within(manageRow("Appa")).getByRole("button", { name: "Rename Appa" }));
    await user.clear(screen.getByLabelText("New name for Appa"));
    await user.type(screen.getByLabelText("New name for Appa"), "Father{Enter}");
    await waitFor(() => expect(grp.renamePerson).toHaveBeenCalledWith(2, "Father"));
    await user.click(within(manageRow("Appa")).getByRole("button", { name: "Delete Appa" }));
    expect(manageRow("Appa")).toHaveTextContent("1 expense become “not specified”.");
    await user.click(within(manageRow("Appa")).getByTestId("confirm-delete"));
    await waitFor(() => expect(grp.deletePerson).toHaveBeenCalledWith(2));
  });
});
