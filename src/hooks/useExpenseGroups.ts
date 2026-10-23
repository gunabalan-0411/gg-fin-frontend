// Expense categories (two levels) and "for whom": loaded once, shared by the OCR Expense step and the Expenses page.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { expenseGroupsApi } from "@/services/api";
import type { ExpenseCategory, ExpensePerson } from "@/types";

export const CATEGORY_KEY = ["expense-categories"] as const;
export const PERSON_KEY = ["expense-persons"] as const;

export function useExpenseCategories() {
  return useQuery({
    queryKey: CATEGORY_KEY,
    queryFn: async () => (await expenseGroupsApi.categories()).data,
    staleTime: 60_000,
  });
}

export function useExpensePersons() {
  return useQuery({
    queryKey: PERSON_KEY,
    queryFn: async () => (await expenseGroupsApi.persons()).data,
    staleTime: 60_000,
  });
}

/** Re-read categories / people (after one was created, renamed or deleted) and the expenses that show their names. */
export function useRefreshExpenseGroups() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: CATEGORY_KEY }),
    qc.invalidateQueries({ queryKey: PERSON_KEY }),
    qc.invalidateQueries({ queryKey: ["expenses"] }),
    qc.invalidateQueries({ queryKey: ["expense-summary"] }),
    qc.invalidateQueries({ queryKey: ["expense-legacy"] }),
    qc.invalidateQueries({ queryKey: ["personal-expenses"] }),                 // categories and people are shared with Personal Finance
    qc.invalidateQueries({ queryKey: ["personal-expense-summary"] }),
    qc.invalidateQueries({ queryKey: ["personal-dashboard"] }),
  ]);
}

/** Top-level categories, and the sub-categories of each. */
export function splitCategories(all: ExpenseCategory[] | undefined) {
  const list = all ?? [];
  const tops = list.filter((c) => c.parent_id === null);
  const subsOf = (topId: number | null) => (topId === null ? [] : list.filter((c) => c.parent_id === topId));
  const misc = tops.find((c) => c.is_system) ?? null;
  const byId = new Map(list.map((c) => [c.id, c]));
  return { tops, subsOf, misc, byId };
}

/** "Groceries › Fish & Chicken" for a category id (a sub-category shows its parent first). */
export function categoryLabel(all: ExpenseCategory[] | undefined, id: number | null | undefined): string {
  if (id == null) return "";
  const byId = new Map((all ?? []).map((c) => [c.id, c]));
  const c = byId.get(id);
  if (!c) return "";
  const parent = c.parent_id != null ? byId.get(c.parent_id) : null;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

export type { ExpensePerson };
