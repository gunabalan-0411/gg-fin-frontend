// "Group old expenses": the expenses entered before categories existed, one line per distinct notes text, each with a SUGGESTED category and
// person (a keyword guess). Nothing is saved until Apply; every choice can be changed first; the notes themselves are never edited.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { expensesApi } from "@/services/api";
import { categoryLabel, useExpenseCategories, useExpensePersons, useRefreshExpenseGroups } from "@/hooks/useExpenseGroups";
import { PickCombobox } from "@/components/expenses/PickCombobox";
import { formatCurrency } from "@/utils";
import type { LegacyExpenseGroup } from "@/types";

type Choice = { checked: boolean; category_id: number; person_id: number | null };
const keyOf = (g: LegacyExpenseGroup) => (g.notes ?? "").trim().toLowerCase();

export function LegacyGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["expense-legacy"],
    queryFn: async () => (await expensesApi.legacyGroups()).data,
    enabled: open,
    gcTime: 0,
  });
  const { data: categories } = useExpenseCategories();
  const { data: persons } = useExpensePersons();
  const refresh = useRefreshExpenseGroups();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!data) return;
    setChoices(Object.fromEntries(data.groups.map((g) => [keyOf(g), { checked: true, category_id: g.category_id, person_id: g.person_id }])));
  }, [data]);

  const options = useMemo(() => {
    const all = categories ?? [];
    const tops = all.filter((c) => c.parent_id === null);
    return tops.flatMap((t) => [t, ...all.filter((c) => c.parent_id === t.id)]).map((c) => ({ id: c.id, label: categoryLabel(all, c.id) }));
  }, [categories]);

  const groups = data?.groups ?? [];
  const selected = groups.filter((g) => choices[keyOf(g)]?.checked);
  const selectedCount = selected.reduce((s, g) => s + g.count, 0);
  const noPerson = selected.filter((g) => choices[keyOf(g)]?.person_id == null).length;

  const set = (g: LegacyExpenseGroup, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [keyOf(g)]: { ...c[keyOf(g)], ...patch } }));

  const apply = async () => {
    if (!selected.length) return;
    setApplying(true);
    try {
      const { data: res } = await expensesApi.applyLegacy(selected.map((g) => ({
        notes: g.notes, category_id: choices[keyOf(g)].category_id, person_id: choices[keyOf(g)].person_id,
      })));
      await refresh();
      toast.success(`${res.updated} old expense${res.updated === 1 ? "" : "s"} grouped`);
      onClose();
    } catch {
      toast.error("Could not group the old expenses — nothing was changed");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Group old expenses" className="max-w-4xl">
      <p className="mb-3 text-xs text-muted-foreground">
        These expenses have no category yet. Each line is one notes text; the category and person are a <b>suggestion</b> read from the notes — change any of them,
        untick what you want to leave for later, then press Apply. The notes are never edited.
      </p>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Reading the old expenses…</p>
      ) : groups.length === 0 ? (
        <p data-testid="legacy-empty" className="py-8 text-center text-sm text-muted-foreground">Every expense is grouped.</p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-3 text-xs">
            <button className="text-muted-foreground underline" onClick={() => setChoices((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { ...v, checked: true }])))}>Select all</button>
            <button className="text-muted-foreground underline" onClick={() => setChoices((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { ...v, checked: false }])))}>Select none</button>
            <span className="ml-auto text-muted-foreground">{groups.length} different notes · {data?.count} expenses · {formatCurrency(Number(data?.total ?? 0))}</span>
          </div>
          <div className="max-h-[52vh] overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-secondary">
                <tr className="border-b border-border">
                  <th className="w-8 px-2 py-2" />
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Notes</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Entries</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Total</th>
                  <th className="w-56 px-2 py-2 text-left font-medium text-muted-foreground">Category</th>
                  <th className="w-36 px-2 py-2 text-left font-medium text-muted-foreground">For whom</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const c = choices[keyOf(g)];
                  if (!c) return null;
                  return (
                    <tr key={keyOf(g) || "(none)"} data-testid="legacy-row" className="border-b border-border/40 align-middle">
                      <td className="px-2 py-1.5"><input type="checkbox" aria-label={`Apply to ${g.notes ?? "no notes"}`} checked={c.checked} onChange={(e) => set(g, { checked: e.target.checked })} /></td>
                      <td className="max-w-[16rem] truncate px-2 py-1.5" title={g.notes ?? ""}>{g.notes?.trim() || <i className="text-muted-foreground">(no notes)</i>}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">{g.count}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(Number(g.total))}</td>
                      <td className="px-2 py-1">
                        <PickCombobox ariaLabel={`Category for ${g.notes ?? "no notes"}`} value={c.category_id} options={options} onChange={(id) => id != null && set(g, { category_id: id })} />
                      </td>
                      <td className="px-2 py-1">
                        <PickCombobox ariaLabel={`For whom, ${g.notes ?? "no notes"}`} value={c.person_id} placeholder="Not specified" allowClear
                          options={(persons ?? []).map((p) => ({ id: p.id, label: p.name }))} onChange={(id) => set(g, { person_id: id })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p data-testid="legacy-hint" className="text-[11px] text-muted-foreground">
          {noPerson > 0 && selected.length > 0 ? `${noPerson} line${noPerson === 1 ? "" : "s"} without a person stay “not specified” until you set one.` : ""}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button data-testid="legacy-apply" onClick={apply} disabled={applying || selected.length === 0}>
            {applying ? "Applying…" : `Apply to ${selectedCount} expense${selectedCount === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
