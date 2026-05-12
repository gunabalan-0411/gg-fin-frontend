import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { debtsApi } from "@/services/api";
import toast from "react-hot-toast";

export interface Debt {
  id: number;
  date: string;
  lender_name: string;
  amount: number;
  total_repaid: number;
  balance: number;
  notes?: string | null;
}

export interface DebtRepayment {
  id: number;
  debt_id: number;
  date: string;
  amount: number;
  balance: number;
  notes?: string | null;
}

// ── Debts ──────────────────────────────────────────────────────────────────

export function useDebts() {
  return useQuery({
    queryKey: ["debts"],
    queryFn: async () => (await debtsApi.list()).data as Debt[],
  });
}

export function useCreateDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => debtsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["debts"] }); toast.success("Debt added"); },
    onError: () => toast.error("Failed to add debt"),
  });
}

export function useUpdateDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => debtsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["debts"] }); toast.success("Debt updated"); },
    onError: () => toast.error("Failed to update debt"),
  });
}

export function useDeleteDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => debtsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["debts"] }); toast.success("Debt deleted"); },
    onError: () => toast.error("Failed to delete debt"),
  });
}

// ── Repayments ─────────────────────────────────────────────────────────────

export function useRepayments(debtId: number | null) {
  return useQuery({
    queryKey: ["repayments", debtId],
    queryFn: async () => (await debtsApi.listRepayments(debtId!)).data as DebtRepayment[],
    enabled: debtId !== null,
  });
}

export function useCreateRepayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ debtId, data }: { debtId: number; data: object }) =>
      debtsApi.createRepayment(debtId, data),
    onSuccess: (_r, { debtId }) => {
      qc.invalidateQueries({ queryKey: ["repayments", debtId] });
      qc.invalidateQueries({ queryKey: ["debts"] });
      toast.success("Repayment recorded");
    },
    onError: () => toast.error("Failed to record repayment"),
  });
}

export function useUpdateRepayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ debtId, repaymentId, data }: { debtId: number; repaymentId: number; data: object }) =>
      debtsApi.updateRepayment(debtId, repaymentId, data),
    onSuccess: (_r, { debtId }) => {
      qc.invalidateQueries({ queryKey: ["repayments", debtId] });
      qc.invalidateQueries({ queryKey: ["debts"] });
      toast.success("Repayment updated");
    },
    onError: () => toast.error("Failed to update repayment"),
  });
}

export function useDeleteRepayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ debtId, repaymentId }: { debtId: number; repaymentId: number }) =>
      debtsApi.deleteRepayment(debtId, repaymentId),
    onSuccess: (_r, { debtId }) => {
      qc.invalidateQueries({ queryKey: ["repayments", debtId] });
      qc.invalidateQueries({ queryKey: ["debts"] });
      toast.success("Repayment deleted");
    },
    onError: () => toast.error("Failed to delete repayment"),
  });
}
