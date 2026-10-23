/**
 * The OCR page's "Daily Expenses" step: several lines per date, Category (search & click, Miscellaneous by default) with an optional
 * Sub-category, For whom (REQUIRED), Amount, Notes, and the total of everything at the end. EX-01 ... EX-12.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/services/api", () => ({
  expensesApi: { createBulk: vi.fn() },
  expenseGroupsApi: { categories: vi.fn(), persons: vi.fn(), createCategory: vi.fn(), createPerson: vi.fn() },
}));

import toast from "react-hot-toast";
import { expenseGroupsApi, expensesApi } from "@/services/api";
import { ExpenseStepPanel } from "./ExpenseStepPanel";

const api = expenseGroupsApi as unknown as Record<"categories" | "persons" | "createCategory" | "createPerson", ReturnType<typeof vi.fn>>;
const bulk = (expensesApi as unknown as { createBulk: ReturnType<typeof vi.fn> }).createBulk;

const CATS = [
  { id: 1, name: "Groceries", parent_id: null, is_system: false, used: 0 },
  { id: 4, name: "Medical", parent_id: null, is_system: false, used: 0 },
  { id: 3, name: "Miscellaneous", parent_id: null, is_system: true, used: 0 },
  { id: 2, name: "Fish & Chicken", parent_id: 1, is_system: false, used: 0 },
  { id: 5, name: "Vegetables & Fruit", parent_id: 1, is_system: false, used: 0 },
];
const PEOPLE = [{ id: 1, name: "Amma", used: 0 }, { id: 2, name: "Appa", used: 0 }, { id: 3, name: "Guru", used: 0 }];

const handlers = () => ({ onDone: vi.fn(), onSkip: vi.fn(), onSkipAll: vi.fn() });

function setup(dates = ["17-10-2026", "18-10-2026"], isMobile = false) {
  const h = handlers();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(<QueryClientProvider client={qc}><ExpenseStepPanel dates={dates} isMobile={isMobile} {...h} /></QueryClientProvider>);
  return { ...h, ...utils, user: userEvent.setup() };
}

const dateCard = (d: string) => document.querySelector(`[data-date="${d}"]`) as HTMLElement;
const lines = (d: string) => within(dateCard(d)).getAllByTestId("expense-line");
const field = (scope: HTMLElement, name: string) => within(scope).getByRole(name === "Amount" || name === "Notes" ? "textbox" : "combobox", { name }) as HTMLInputElement;
const amount = (scope: HTMLElement) => within(scope).getByLabelText("Amount") as HTMLInputElement;
const pickFrom = async (user: ReturnType<typeof userEvent.setup>, scope: HTMLElement, label: string, option: string) => {
  await user.click(within(scope).getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
};
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: /Save & Continue/ }));
const total = () => screen.getByTestId("expense-total");

beforeEach(() => {
  vi.clearAllMocks();
  api.categories.mockResolvedValue({ data: CATS });
  api.persons.mockResolvedValue({ data: PEOPLE });
  bulk.mockResolvedValue({ data: [] });
});

describe("the lines (EX-01 ... EX-03)", () => {
  it("each date gets a card with one empty line: Category already Miscellaneous, Sub-category off, For whom empty (EX-01)", async () => {
    setup();
    await screen.findAllByTestId("expense-date");
    expect(screen.getAllByTestId("expense-date")).toHaveLength(2);
    expect(screen.getByText("17 Oct 2026")).toBeInTheDocument();
    const line = lines("17-10-2026")[0];
    await waitFor(() => expect(field(line, "Category")).toHaveValue("Miscellaneous"));
    expect(field(line, "Sub-category")).toBeDisabled();
    expect(field(line, "For whom")).toHaveValue("");
    expect(amount(line)).toHaveValue(null);
  });

  it("choosing a category enables its sub-categories only; changing the category clears the sub-category (EX-02)", async () => {
    const { user } = setup(["17-10-2026"]);
    const line = (await screen.findAllByTestId("expense-line"))[0];
    await waitFor(() => expect(field(line, "Category")).toHaveValue("Miscellaneous"));
    await pickFrom(user, line, "Category", "Groceries");
    expect(field(line, "Sub-category")).toBeEnabled();
    await user.click(field(line, "Sub-category"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Fish & Chicken", "Vegetables & Fruit"]);
    await user.click(screen.getByRole("option", { name: "Fish & Chicken" }));
    expect(field(line, "Sub-category")).toHaveValue("Fish & Chicken");
    await pickFrom(user, line, "Category", "Medical");
    expect(field(line, "Sub-category")).toHaveValue("");
    expect(field(line, "Sub-category")).toBeEnabled() ;
  });

  it("a sub-category left over from the previous category is never saved: the payload carries the NEW category (EX-02)", async () => {
    const { user } = setup(["17-10-2026"]);
    const line = (await screen.findAllByTestId("expense-line"))[0];
    await waitFor(() => expect(field(line, "Category")).toHaveValue("Miscellaneous"));
    await pickFrom(user, line, "Category", "Groceries");
    await pickFrom(user, line, "Sub-category", "Fish & Chicken");
    await pickFrom(user, line, "Category", "Medical");              // Medical has no Fish & Chicken
    await pickFrom(user, line, "For whom", "Amma");
    await user.type(amount(line), "75");
    await save(user);
    await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1));
    expect(bulk.mock.calls[0][0]).toEqual([{ date: "2026-10-17", amount: 75, notes: null, category_id: 4, person_id: 1 }]);   // Medical (4), not Fish & Chicken (2)
  });

  it("'Add another expense' adds a line to THAT date; the x removes one, and the last one is only emptied (EX-03)", async () => {
    const { user } = setup();
    await screen.findAllByTestId("expense-date");
    await user.click(within(dateCard("17-10-2026")).getByRole("button", { name: /Add another expense/ }));
    expect(lines("17-10-2026")).toHaveLength(2);
    expect(lines("18-10-2026")).toHaveLength(1);
    await user.type(amount(lines("17-10-2026")[1]), "40");
    await user.click(within(lines("17-10-2026")[1]).getByRole("button", { name: "Remove this expense" }));
    expect(lines("17-10-2026")).toHaveLength(1);
    await user.type(amount(lines("17-10-2026")[0]), "9");
    await user.click(within(lines("17-10-2026")[0]).getByRole("button", { name: "Remove this expense" }));
    expect(lines("17-10-2026")).toHaveLength(1);
    expect(amount(lines("17-10-2026")[0])).toHaveValue(null);                                   // emptied, not gone
  });
});

describe("the total at the end (EX-04)", () => {
  it("starts at ₹0 and follows every amount: per-date totals and the grand total with the entry count", async () => {
    const { user } = setup();
    await screen.findAllByTestId("expense-date");
    expect(total()).toHaveTextContent("Total expense");
    expect(total()).toHaveTextContent("₹0");
    await user.type(amount(lines("17-10-2026")[0]), "300");
    await user.click(within(dateCard("17-10-2026")).getByRole("button", { name: /Add another expense/ }));
    await user.type(amount(lines("17-10-2026")[1]), "700");
    await user.type(amount(lines("18-10-2026")[0]), "1250");
    expect(within(dateCard("17-10-2026")).getByTestId("date-total")).toHaveTextContent("₹1,000");
    expect(within(dateCard("18-10-2026")).getByTestId("date-total")).toHaveTextContent("₹1,250");
    expect(total()).toHaveTextContent("₹2,250");
    expect(total()).toHaveTextContent("3 entries");
    await user.clear(amount(lines("18-10-2026")[0]));
    expect(total()).toHaveTextContent("₹1,000");
    expect(total()).toHaveTextContent("2 entries");
  });
});

describe("for whom is required (EX-05)", () => {
  it("Save is refused while a line with an amount has no person: nothing is sent, the line is marked, an error is shown", async () => {
    const { user, onDone } = setup(["17-10-2026"]);
    const line = (await screen.findAllByTestId("expense-line"))[0];
    await user.type(amount(line), "300");
    await save(user);
    expect(bulk).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Choose for whom"));
    expect(within(line).getByTestId("person-error")).toBeInTheDocument();
    expect(field(line, "For whom")).toHaveAttribute("aria-invalid", "true");
    await pickFrom(user, line, "For whom", "Amma");
    expect(within(line).queryByTestId("person-error")).toBeNull();
    await save(user);
    await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1));
  });

  it("counts several missing ones in the message, and ignores lines without an amount", async () => {
    const { user } = setup(["17-10-2026"]);
    await screen.findAllByTestId("expense-line");
    await user.click(screen.getByRole("button", { name: /Add another expense/ }));
    await user.click(screen.getByRole("button", { name: /Add another expense/ }));
    const ls = lines("17-10-2026");
    await user.type(amount(ls[0]), "10");
    await user.type(amount(ls[1]), "20");                                                         // ls[2] stays empty: not counted
    await save(user);
    expect(toast.error).toHaveBeenCalledWith("Choose for whom the 2 expenses were (required)");
  });
});

describe("saving (EX-06 ... EX-08)", () => {
  it("sends every filled line in ONE request: ISO date, amount, trimmed notes, the sub-category when chosen else the category, Miscellaneous (null) by default (EX-06)", async () => {
    const { user, onDone } = setup();
    await screen.findAllByTestId("expense-date");
    const a = lines("17-10-2026")[0];
    await pickFrom(user, a, "Category", "Groceries");
    await pickFrom(user, a, "Sub-category", "Fish & Chicken");
    await pickFrom(user, a, "For whom", "Appa");
    await user.type(amount(a), "300");
    await user.type(within(a).getByLabelText("Notes"), "  fish for sunday ");

    await user.click(within(dateCard("17-10-2026")).getByRole("button", { name: /Add another expense/ }));
    const b = lines("17-10-2026")[1];
    await pickFrom(user, b, "Category", "Medical");
    await pickFrom(user, b, "For whom", "Amma");
    await user.type(amount(b), "700.50");

    const c = lines("18-10-2026")[0];
    await pickFrom(user, c, "For whom", "Guru");
    await user.type(amount(c), "50");

    await save(user);
    await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1));
    expect(bulk).toHaveBeenCalledWith([
      { date: "2026-10-17", amount: 300, notes: "fish for sunday", category_id: 2, person_id: 2 },        // the sub-category
      { date: "2026-10-17", amount: 700.5, notes: null, category_id: 4, person_id: 1 },                    // a category without a sub-category
      { date: "2026-10-18", amount: 50, notes: null, category_id: null, person_id: 3 },                    // untouched category: the server uses Miscellaneous
    ]);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith("3 expenses saved · ₹1,050.5");
  });

  it("nothing entered: Save & Continue just moves on without calling the server (EX-07)", async () => {
    const { user, onDone } = setup();
    await screen.findAllByTestId("expense-date");
    await save(user);
    expect(bulk).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a failed save says nothing was saved, stays on the step and keeps what was typed (EX-08)", async () => {
    bulk.mockRejectedValue(new Error("500"));
    const { user, onDone } = setup(["17-10-2026"]);
    const line = (await screen.findAllByTestId("expense-line"))[0];
    await pickFrom(user, line, "For whom", "Amma");
    await user.type(amount(line), "300");
    await save(user);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to save expenses — nothing was saved"));
    expect(onDone).not.toHaveBeenCalled();
    expect(amount(line)).toHaveValue(300);
    expect(screen.getByRole("button", { name: /Save & Continue/ })).toBeEnabled();
  });

  it("Skip and Skip All call their handlers and save nothing (EX-07)", async () => {
    const { user, onSkip, onSkipAll } = setup(["17-10-2026"]);
    await screen.findAllByTestId("expense-date");
    await user.type(amount(lines("17-10-2026")[0]), "300");
    await user.click(screen.getByRole("button", { name: "Skip" }));
    await user.click(screen.getByRole("button", { name: "Skip All" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSkipAll).toHaveBeenCalledTimes(1);
    expect(bulk).not.toHaveBeenCalled();
  });
});

describe("creating from the dropdown (EX-09, EX-10)", () => {
  it("a new category typed in the dropdown is created and picked; a new sub-category goes under the chosen category (EX-09)", async () => {
    api.createCategory.mockImplementation(async (name: string, parent: number | null) => {
      const created = { id: parent ? 11 : 10, name, parent_id: parent, is_system: false, used: 0 };
      api.categories.mockResolvedValue({ data: [...CATS, created] });
      return { data: created };
    });
    const { user } = setup(["17-10-2026"]);
    const line = (await screen.findAllByTestId("expense-line"))[0];
    await waitFor(() => expect(field(line, "Category")).toHaveValue("Miscellaneous"));
    await user.click(field(line, "Category"));                                                    // a click selects the shown name, so typing replaces it
    await user.keyboard("Education");
    await user.click(screen.getByTestId("pick-create"));
    expect(api.createCategory).toHaveBeenCalledWith("Education", null);
    await waitFor(() => expect(field(line, "Category")).toHaveValue("Education"));

    await user.click(field(line, "Sub-category"));
    await user.type(field(line, "Sub-category"), "Books");
    await user.click(screen.getByTestId("pick-create"));
    expect(api.createCategory).toHaveBeenLastCalledWith("Books", 10);
    await waitFor(() => expect(field(line, "Sub-category")).toHaveValue("Books"));
  });

  it("a name that already exists (409) simply picks the existing one (EX-09)", async () => {
    api.createCategory.mockRejectedValue({ response: { status: 409, data: { detail: { code: "exists", message: "'groceries' already exists here", id: 1 } } } });
    const { user } = setup(["17-10-2026"]);
    const line = (await screen.findAllByTestId("expense-line"))[0];
    await user.click(field(line, "Category"));
    await user.keyboard("Grocer");                                           // not an exact match, so + Create is offered
    await user.click(screen.getByTestId("pick-create"));
    await waitFor(() => expect(field(line, "Category")).toHaveValue("Groceries"));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("a new person is created from the For whom box; another failure shows the server's reason (EX-10)", async () => {
    api.createPerson.mockImplementation(async (name: string) => {
      const p = { id: 9, name, used: 0 };
      api.persons.mockResolvedValue({ data: [...PEOPLE, p] });
      return { data: p };
    });
    const { user } = setup(["17-10-2026"]);
    const line = (await screen.findAllByTestId("expense-line"))[0];
    await user.click(field(line, "For whom"));
    await user.type(field(line, "For whom"), "Suji");
    await user.click(screen.getByTestId("pick-create"));
    expect(api.createPerson).toHaveBeenCalledWith("Suji");
    await waitFor(() => expect(field(line, "For whom")).toHaveValue("Suji"));

    api.createPerson.mockRejectedValue({ response: { status: 422, data: { detail: { code: "name_too_long", message: "A name can be at most 60 characters" } } } });
    await user.click(field(line, "For whom"));
    await user.clear(field(line, "For whom"));
    await user.type(field(line, "For whom"), "x");
    await user.click(screen.getByTestId("pick-create"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A name can be at most 60 characters"));
    expect(field(line, "For whom")).toHaveValue("x");
  });
});

describe("layout (EX-11)", () => {
  it("desktop: a side panel; phone: full screen", async () => {
    const first = setup(["17-10-2026"], false);
    await screen.findAllByTestId("expense-date");
    expect(document.querySelector(".fixed.right-0")).not.toBeNull();
    first.unmount();
    setup(["17-10-2026"], true);
    await screen.findAllByTestId("expense-date");
    expect(document.querySelector(".fixed.inset-0")).not.toBeNull();
  });
});
