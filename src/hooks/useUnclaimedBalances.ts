import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { unclaimedBalancesApi } from "@/services/api";
import toast from "react-hot-toast";

export function useUnclaimedBalances() {
  return useQuery({
    queryKey: ["unclaimed-balances"],
    queryFn: async () => {
      const res = await unclaimedBalancesApi.list();
      return res.data as UnclaimedBalance[];
    },
  });
}

export function useCreateUnclaimedBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => unclaimedBalancesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unclaimed-balances"] });
      toast.success("Record added");
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(detail || "Failed to add record");
    },
  });
}

export function useDeleteUnclaimedBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => unclaimedBalancesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unclaimed-balances"] });
      toast.success("Record deleted");
    },
    onError: () => toast.error("Failed to delete record"),
  });
}

export interface UnclaimedBalance {
  id: number;
  date: string;
  product: string;
  customer_id: number;
  customer_name: string;
  amount: number;
  notes?: string | null;
}
