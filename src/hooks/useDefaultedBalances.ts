import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { defaultedBalancesApi } from "@/services/api";
import toast from "react-hot-toast";

export function useDefaultedBalances() {
  return useQuery({
    queryKey: ["defaulted-balances"],
    queryFn: async () => {
      const res = await defaultedBalancesApi.list();
      return res.data as DefaultedBalance[];
    },
  });
}

export function useCreateDefaultedBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => defaultedBalancesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["defaulted-balances"] });
      toast.success("Record added");
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(detail || "Failed to add record");
    },
  });
}

export function useDeleteDefaultedBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => defaultedBalancesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["defaulted-balances"] });
      toast.success("Record deleted");
    },
    onError: () => toast.error("Failed to delete record"),
  });
}

export interface DefaultedBalance {
  id: number;
  date: string;
  product: string;
  customer_id: number;
  customer_name: string;
  amount: number;
  notes?: string | null;
}
