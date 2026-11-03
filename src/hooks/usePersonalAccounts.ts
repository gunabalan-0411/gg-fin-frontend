// Personal Finance expense accounts: the month view, funds, matching with the bank. Everything that shows a balance is re-read
// after one of them changes (an expense paid from an account is handled by the expense hooks).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { personalApi } from "@/services/api";
import { errorText } from "@/components/personal/budget/format";

export const ACCOUNTS_KEY = "personal-accounts";

export function usePersonalAccounts(month?: string, enabled = true) {
  return useQuery({
    queryKey: [ACCOUNTS_KEY, month ?? "now"],
    queryFn: async () => (await personalApi.accounts(month)).data,
    enabled,
  });
}

export function useAccountEntries(accountId: number, enabled: boolean) {
  return useQuery({
    queryKey: [ACCOUNTS_KEY, "entries", accountId],
    queryFn: async () => (await personalApi.accountEntries(accountId)).data,
    enabled,
  });
}

export function useAccountActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [ACCOUNTS_KEY] });
  const onError = (fallback: string) => (e: unknown) => { toast.error(errorText(e, fallback)); };
  return {
    create: useMutation({
      mutationFn: (d: { name: string; opening_balance: number; opening_date?: string }) => personalApi.createAccount(d),
      onSuccess: refresh, onError: onError("Could not add the account"),
    }),
    update: useMutation({
      mutationFn: ({ id, data }: { id: number; data: object }) => personalApi.updateAccount(id, data),
      onSuccess: refresh, onError: onError("Could not save the account"),
    }),
    remove: useMutation({
      mutationFn: (id: number) => personalApi.deleteAccount(id),
      onSuccess: () => Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["personal-expenses"] })]),
      onError: onError("Could not delete the account"),
    }),
    addFund: useMutation({
      mutationFn: ({ id, ...data }: { id: number; amount: number; date?: string; notes?: string | null }) => personalApi.addFund(id, data),
      onSuccess: refresh, onError: onError("Could not add the fund"),
    }),
    deleteEntry: useMutation({
      mutationFn: ({ id, entryId }: { id: number; entryId: number }) => personalApi.deleteEntry(id, entryId),
      onSuccess: refresh, onError: onError("Could not remove that entry"),
    }),
    reconcile: useMutation({
      mutationFn: ({ id, ...data }: { id: number; bank_balance: number; as_of?: string; record?: boolean }) => personalApi.reconcile(id, data),
      onSuccess: (_r, v) => (v.record ? refresh() : undefined),
      onError: onError("Could not compare with the bank"),
    }),
  };
}
