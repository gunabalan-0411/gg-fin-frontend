import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { investorsApi } from "@/services/api";
import toast from "react-hot-toast";

export interface Investor {
  id: number;
  date: string;
  investor_name: string;
  amount: number;
  return_amount: number;
  notes?: string | null;
}

export function useInvestors() {
  return useQuery({
    queryKey: ["investors"],
    queryFn: async () => (await investorsApi.list()).data as Investor[],
  });
}

export function useCreateInvestor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => investorsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["investors"] }); toast.success("Investor added"); },
    onError: () => toast.error("Failed to add investor"),
  });
}

export function useUpdateInvestor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => investorsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["investors"] }); toast.success("Investor updated"); },
    onError: () => toast.error("Failed to update investor"),
  });
}

export function useDeleteInvestor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => investorsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["investors"] }); toast.success("Investor deleted"); },
    onError: () => toast.error("Failed to delete investor"),
  });
}
