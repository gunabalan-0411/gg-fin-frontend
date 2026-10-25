// Savings accounts, friendly lends and gifts received of the logged-in person (Personal Finance). One list per kind, own cache key.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { personalApi } from "@/services/api";
import type { PersonalRecordKind } from "@/types";

const key = (kind: PersonalRecordKind) => ["personal-records", kind] as const;

export function usePersonalRecords<T>(kind: PersonalRecordKind) {
  return useQuery({
    queryKey: key(kind),
    queryFn: async () => (await personalApi.records<T>(kind)).data,
  });
}

/** The server explains a refusal (e.g. "money gift: how much is required"): show that, else the plain failure. */
function why(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, "");
  return fallback;
}

export function useSavePersonalRecord(kind: PersonalRecordKind, label: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: object }) => (id == null ? personalApi.createRecord(kind, data) : personalApi.updateRecord(kind, id, data)),
    onSuccess: (_r, v) => { qc.invalidateQueries({ queryKey: key(kind) }); toast.success(v.id == null ? `${label} added` : `${label} updated`); },
    onError: (e) => toast.error(why(e, `Could not save the ${label.toLowerCase()}`)),
  });
}

export function useDeletePersonalRecord(kind: PersonalRecordKind, label: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => personalApi.deleteRecord(kind, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key(kind) }); toast.success(`${label} deleted`); },
    onError: () => toast.error(`Could not delete the ${label.toLowerCase()}`),
  });
}
