// Manage the lists behind the dropdowns: categories (two levels) and "for whom". Add, rename, delete.
// Deleting never deletes expenses: a category's expenses move to Miscellaneous (a sub-category's to its category), a person's become "not specified".
import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { expenseGroupsApi } from "@/services/api";
import { splitCategories, useExpenseCategories, useExpensePersons, useRefreshExpenseGroups } from "@/hooks/useExpenseGroups";
import { cn } from "@/utils";

type Row = { id: number; name: string; used: number; locked?: boolean; level: 1 | 2 };

const message = (err: unknown, fallback: string) => {
  const d = (err as { response?: { data?: { detail?: { message?: string } | string } } })?.response?.data?.detail;
  return typeof d === "object" && d?.message ? d.message : typeof d === "string" ? d : fallback;
};

function NameRow({ row, onRename, onDelete, deleteHint, onAddSub }: {
  row: Row;
  onRename: (id: number, name: string) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
  deleteHint: string;
  onAddSub?: (id: number, name: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sub, setSub] = useState("");

  const save = async () => { if (name.trim() && await onRename(row.id, name)) setEditing(false); };
  const addSub = async () => { if (onAddSub && sub.trim() && await onAddSub(row.id, sub)) { setSub(""); setAdding(false); } };

  return (
    <div data-testid="manage-row" data-name={row.name}>
      <div className={cn("flex items-center gap-2 border-b border-border/40 py-1.5", row.level === 2 && "pl-6")}>
        {editing ? (
          <>
            <Input aria-label={`New name for ${row.name}`} value={name} autoFocus onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } if (e.key === "Escape") { e.stopPropagation(); setEditing(false); setName(row.name); } }}
              className="h-8 flex-1" />
            <button aria-label="Save name" onClick={save} className="flex h-7 w-7 items-center justify-center rounded text-emerald-600 hover:bg-emerald-500/10"><Check className="h-3.5 w-3.5" /></button>
            <button aria-label="Cancel rename" onClick={() => { setEditing(false); setName(row.name); }} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
          </>
        ) : confirming ? (
          <>
            <span className="flex-1 text-xs text-muted-foreground">{deleteHint}</span>
            <Button size="sm" variant="destructive" data-testid="confirm-delete" onClick={async () => { await onDelete(row.id); setConfirming(false); }}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep</Button>
          </>
        ) : (
          <>
            <span className={cn("flex-1 text-sm", row.level === 1 && "font-medium")}>{row.name}</span>
            <span className="text-[11px] text-muted-foreground">{row.used} {row.used === 1 ? "expense" : "expenses"}</span>
            {onAddSub && !row.locked && (
              <button aria-label={`Add a sub-category to ${row.name}`} title="Add sub-category" onClick={() => setAdding((a) => !a)}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
            )}
            {row.locked ? (
              <span className="w-[60px] text-right text-[10px] uppercase tracking-wide text-muted-foreground/60">default</span>
            ) : (
              <>
                <button aria-label={`Rename ${row.name}`} onClick={() => setEditing(true)} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                <button aria-label={`Delete ${row.name}`} onClick={() => setConfirming(true)} className="flex h-7 w-7 items-center justify-center rounded text-red-400 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /></button>
              </>
            )}
          </>
        )}
      </div>
      {adding && onAddSub && (
        <div className="flex items-center gap-2 py-1.5 pl-6">
          <Input aria-label={`New sub-category of ${row.name}`} value={sub} autoFocus placeholder="New sub-category…" onChange={(e) => setSub(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addSub(); } }} className="h-8 flex-1" />
          <Button size="sm" onClick={addSub}>Add</Button>
        </div>
      )}
    </div>
  );
}

function AddBox({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const add = async () => { if (name.trim() && await onAdd(name)) setName(""); };
  return (
    <div className="mt-3 flex items-center gap-2">
      <Input aria-label={label} value={name} placeholder={label} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} className="h-9 flex-1" />
      <Button onClick={add}>Add</Button>
    </div>
  );
}

export function ManageExpenseGroupsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"categories" | "persons">("categories");
  const { data: categories } = useExpenseCategories();
  const { data: persons } = useExpensePersons();
  const refresh = useRefreshExpenseGroups();
  const { tops, subsOf } = splitCategories(categories);

  const run = async (fn: () => Promise<unknown>, ok: string): Promise<boolean> => {
    try { await fn(); await refresh(); toast.success(ok); return true; }
    catch (err) { toast.error(message(err, "That did not work")); return false; }
  };

  return (
    <Modal open={open} onClose={onClose} title="Expense categories & people" className="max-w-xl">
      <div className="mb-3 flex rounded-lg border border-border p-0.5">
        {(["categories", "persons"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
            className={cn("flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors", tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
            {t === "categories" ? "Categories" : "For whom"}
          </button>
        ))}
      </div>

      <div className="max-h-[55vh] overflow-y-auto pr-1" data-testid={tab === "categories" ? "manage-categories" : "manage-persons"}>
        {tab === "categories" ? (
          tops.map((top) => (
            <div key={top.id}>
              <NameRow
                row={{ id: top.id, name: top.name, used: top.used, locked: top.is_system, level: 1 }}
                deleteHint={`${top.used} expense${top.used === 1 ? "" : "s"} move to Miscellaneous, and its sub-categories go.`}
                onRename={(id, n) => run(() => expenseGroupsApi.renameCategory(id, n), "Renamed")}
                onDelete={async (id) => { await run(() => expenseGroupsApi.deleteCategory(id), "Deleted"); }}
                onAddSub={(id, n) => run(() => expenseGroupsApi.createCategory(n, id), "Sub-category added")}
              />
              {subsOf(top.id).map((s) => (
                <NameRow
                  key={s.id}
                  row={{ id: s.id, name: s.name, used: s.used, level: 2 }}
                  deleteHint={`${s.used} expense${s.used === 1 ? "" : "s"} move to ${top.name}.`}
                  onRename={(id, n) => run(() => expenseGroupsApi.renameCategory(id, n), "Renamed")}
                  onDelete={async (id) => { await run(() => expenseGroupsApi.deleteCategory(id), "Deleted"); }}
                />
              ))}
            </div>
          ))
        ) : (
          (persons ?? []).map((p) => (
            <NameRow
              key={p.id}
              row={{ id: p.id, name: p.name, used: p.used, level: 1 }}
              deleteHint={`${p.used} expense${p.used === 1 ? "" : "s"} become “not specified”.`}
              onRename={(id, n) => run(() => expenseGroupsApi.renamePerson(id, n), "Renamed")}
              onDelete={async (id) => { await run(() => expenseGroupsApi.deletePerson(id), "Deleted"); }}
            />
          ))
        )}
      </div>

      {tab === "categories"
        ? <AddBox label="New category…" onAdd={(n) => run(() => expenseGroupsApi.createCategory(n, null), "Category added")} />
        : <AddBox label="New person…" onAdd={(n) => run(() => expenseGroupsApi.createPerson(n), "Person added")} />}
      <p className="mt-3 text-[11px] text-muted-foreground">Deleting never deletes expenses. Miscellaneous is the default and stays.</p>
    </Modal>
  );
}
