import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/services/api";
import toast from "react-hot-toast";
import type { ProductType } from "@/types";

export function useCustomers(
  product: ProductType,
  params: {
    skip?: number;
    limit?: number;
    search?: string;
    segment_id?: number;
    sort_by?: string;
    sort_dir?: string;
    active_only?: boolean;
  }
) {
  return useQuery({
    queryKey: ["customers", product, params],
    queryFn: async () => {
      const fn = product === "edi" ? customersApi.listEdi : customersApi.listIop;
      const res = await fn(params);
      return res.data as { data: unknown[]; total: number };
    },
  });
}

export function useNextCustomerId(product: ProductType) {
  return useQuery({
    queryKey: ["customers", product, "next-id"],
    queryFn: async () => {
      const fn = product === "edi" ? customersApi.nextEdiId : customersApi.nextIopId;
      const res = await fn();
      return (res.data as { next_id: number }).next_id;
    },
    enabled: false, // only fetch on demand
  });
}

/** The dashboard reports (reminders, defaulters, monthly dues ...) are built from the customers: refresh them whenever a customer changes. */
const refreshDashboard = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ["dashboard"] });

export function useCreateCustomer(product: ProductType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) =>
      product === "edi" ? customersApi.createEdi(data) : customersApi.createIop(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers", product] });
      refreshDashboard(qc);
      toast.success("Customer created");
    },
    // say WHY (e.g. "the balance to pay is zero or less") when the server explains it
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to create customer");
    },
  });
}

export function useUpdateCustomer(product: ProductType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      product === "edi" ? customersApi.updateEdi(id, data) : customersApi.updateIop(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers", product] });
      refreshDashboard(qc);
      toast.success("Customer updated");
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to update customer");
    },
  });
}

export function useDeleteCustomer(product: ProductType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resequence }: { id: number; resequence?: boolean }) =>
      product === "edi"
        ? customersApi.deleteEdi(id, resequence)
        : customersApi.deleteIop(id, resequence),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers", product] });
      refreshDashboard(qc);
      toast.success("Customer deleted");
    },
    onError: () => toast.error("Failed to delete customer"),
  });
}
