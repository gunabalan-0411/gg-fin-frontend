// Personal Finance > Monthly budget: the category budgets of one month (with what rolled in from earlier months) and saving one.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { personalApi } from "@/services/api";
import { errorText } from "@/components/personal/budget/format";

export function usePersonalBudget(month: string) {
  return useQuery({
    queryKey: ["personal-budget", month],
    queryFn: async () => (await personalApi.budgets(month)).data,
  });
}

export function useSetBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, amount }: { categoryId: number; amount: number | null }) => personalApi.setBudget(categoryId, amount),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ["personal-budget"] }),
      qc.invalidateQueries({ queryKey: ["personal-dashboard"] }),
    ]),
    onError: (e: unknown) => { toast.error(errorText(e, "Could not save the budget")); },
  });
}
