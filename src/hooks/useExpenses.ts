// Expenses: the OFFICE ones (shared) and, with scope "personal", the logged-in person's OWN personal expenses (Personal Finance).
// Same shape, two endpoints, two cache keys.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { expensesApi, personalApi } from "@/services/api";
import toast from "react-hot-toast";

export type ExpenseScope = "office" | "personal";

const SOURCES = {
  office: { api: expensesApi, key: "expenses" },
  personal: { api: personalApi, key: "personal-expenses" },
} as const;

/** Everything that shows personal totals must be re-read after a personal expense changes. */
const PERSONAL_KEYS = ["personal-expenses", "personal-expense-summary", "personal-dashboard"] as const;
const OFFICE_KEYS = ["expenses", "expense-summary"] as const;

export function expenseKeys(scope: ExpenseScope): readonly string[] {
  return scope === "personal" ? PERSONAL_KEYS : OFFICE_KEYS;
}

export function useExpenses(params?: object, scope: ExpenseScope = "office") {
  const { api, key } = SOURCES[scope];
  return useQuery({
    queryKey: [key, params],
    queryFn: async () => {
      const res = await api.list(params);
      return res.data;
    },
  });
}

function useInvalidate(scope: ExpenseScope) {
  const qc = useQueryClient();
  return () => Promise.all(expenseKeys(scope).map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export function useCreateExpense(scope: ExpenseScope = "office") {
  const invalidate = useInvalidate(scope);
  return useMutation({
    mutationFn: (data: object) => SOURCES[scope].api.create(data),
    onSuccess: () => {
      invalidate();
      toast.success("Expense added");
    },
    onError: () => toast.error("Failed to add expense"),
  });
}

export function useUpdateExpense(scope: ExpenseScope = "office") {
  const invalidate = useInvalidate(scope);
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => SOURCES[scope].api.update(id, data),
    onSuccess: () => {
      invalidate();
      toast.success("Expense updated");
    },
    onError: () => toast.error("Failed to update expense"),
  });
}

export function useDeleteExpense(scope: ExpenseScope = "office") {
  const invalidate = useInvalidate(scope);
  return useMutation({
    mutationFn: (id: number) => SOURCES[scope].api.delete(id),
    onSuccess: () => {
      invalidate();
      toast.success("Expense deleted");
    },
    onError: () => toast.error("Failed to delete expense"),
  });
}
