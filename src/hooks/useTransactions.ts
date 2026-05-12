import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { transactionsApi } from "@/services/api";
import toast from "react-hot-toast";
import type { ProductType } from "@/types";

export function useTransactions(product: ProductType, date: string) {
  return useQuery({
    queryKey: ["transactions", product, date],
    queryFn: async () => {
      const fn = product === "edi" ? transactionsApi.listEdi : transactionsApi.listIop;
      const res = await fn(date);
      return res.data;
    },
    enabled: !!date,
  });
}

export function useCreateTransaction(product: ProductType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) =>
      product === "edi" ? transactionsApi.createEdi(data) : transactionsApi.createIop(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions", product] });
      toast.success("Transaction created");
    },
    onError: () => toast.error("Failed to create transaction"),
  });
}

export function useUpdateTransaction(product: ProductType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      product === "edi" ? transactionsApi.updateEdi(id, data) : transactionsApi.updateIop(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions", product] });
      toast.success("Transaction updated");
    },
    onError: () => toast.error("Failed to update transaction"),
  });
}

export function useDeleteTransaction(product: ProductType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      product === "edi" ? transactionsApi.deleteEdi(id) : transactionsApi.deleteIop(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions", product] });
      toast.success("Transaction deleted");
    },
    onError: () => toast.error("Failed to delete transaction"),
  });
}
