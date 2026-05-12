import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { expensesApi } from "@/services/api";
import toast from "react-hot-toast";

export function useExpenses(params?: object) {
  return useQuery({
    queryKey: ["expenses", params],
    queryFn: async () => {
      const res = await expensesApi.list(params);
      return res.data;
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => expensesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense added");
    },
    onError: () => toast.error("Failed to add expense"),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => expensesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense updated");
    },
    onError: () => toast.error("Failed to update expense"),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => expensesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense deleted");
    },
    onError: () => toast.error("Failed to delete expense"),
  });
}
