import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, Check, Download, Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MarkdownEditor } from "@/components/notepad/MarkdownEditor";
import { MarkdownPreview } from "@/components/notepad/MarkdownPreview";
import { useNoteDraft } from "@/hooks/useNoteDraft";
import { notesApi } from "@/services/api";
import { cn } from "@/utils";
import { fileNameFor, toggleTask, wordCount } from "@/utils/markdownEdit";
import type { NotePage, NotePageSummary } from "@/types";

export const MAX_PAGES = 20;
export const MAX_BYTES = 200_000;

type View = "edit" | "preview";
const VIEW_KEY = "gg_notepad_view";
const PAGE_KEY = "gg_notepad_page";

// per-device conveniences: never let a blocked / full storage break the page
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } };
const recall = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };

const apiMessage = (err: any, fallback: string): string => {
  const d = err?.response?.data?.detail;
  return (d && typeof d === "object" ? d.message : typeof d === "string" ? d : null) || fallback;
};

const byteSize = (s: string) => new TextEncoder().encode(s).length;
const kb = (n: number) => (n < 1000 ? `${n} B` : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)} KB`);

// ── one page: title, toolbar, editor / preview, saving ─────────────────────────────────────────────────────

function PageDraft({ page, view, focusTitle, onSaved, onDelete }: {
  page: NotePage;
  view: View;
  focusTitle: boolean;
  onSaved: (page: NotePage) => void;
  onDelete: () => void;
}) {
  const d = useNoteDraft(page, onSaved);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusTitle) { titleRef.current?.focus(); titleRef.current?.select(); }
  }, [focusTitle]);

  const size = useMemo(() => byteSize(d.text), [d.text]);
  const words = useMemo(() => wordCount(d.text), [d.text]);
  const tooBig = size > MAX_BYTES;

  const download = () => {
    const url = URL.createObjectURL(new Blob([d.text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileNameFor(d.title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const statusEl = (() => {
    switch (d.status) {
      case "saving": return <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>;
      case "dirty": return <span>Unsaved changes…</span>;
      case "error": return <span className="text-destructive">Not saved</span>;
      case "conflict": return <span className="text-amber-600 dark:text-amber-400">Not saved — changed elsewhere</span>;
      default: return (
        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Saved{d.savedAt ? ` ${d.savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
      );
    }
  })();

  const editing = view === "edit";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={titleRef}
          value={d.title}
          onChange={(e) => d.setTitle(e.target.value)}
          onBlur={() => void d.flush()}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          maxLength={100}
          aria-label="Page title"
          placeholder="Untitled"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/50 hover:border-border focus:border-border focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span data-testid="save-status" role="status" aria-live="polite" className="flex-shrink-0 text-xs text-muted-foreground">{statusEl}</span>
        <Button type="button" variant="ghost" size="icon" aria-label="Download as .md file" title="Download as .md file" onClick={download}>
          <Download className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Delete this page" title="Delete this page" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {d.conflict && (
        <div data-testid="conflict-banner" role="alert" className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>This page was saved somewhere else (another device or tab) after you opened it. Nothing has been overwritten. Which version do you want?</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={d.takeTheirs}>Load the other version</Button>
            <Button type="button" size="sm" onClick={d.keepMine}>Keep mine (overwrite)</Button>
          </div>
        </div>
      )}

      {d.status === "error" && (
        <div data-testid="error-banner" role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <span className="min-w-0 flex-1">{d.errorText ?? "Could not save"}. Your text is still here.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void d.flush()}>Try again</Button>
        </div>
      )}

      {/* fills what is left of the window: header bar, tabs, title row and footer are above / below it */}
      <div className="grid h-[calc(100dvh-24rem)] min-h-[16rem] grid-cols-1 md:h-[calc(100dvh-17.5rem)]">
        {/* the editor stays mounted (just hidden) while previewing, so the caret, scroll position and Undo history survive the switch */}
        <div hidden={!editing} className={cn("min-h-0 min-w-0", !editing && "hidden")}>
          <MarkdownEditor value={d.text} onChange={d.setText} className="h-full" />
        </div>
        {!editing && (
          <div className="min-h-0 min-w-0 overflow-y-auto rounded-xl border border-border bg-card p-4">
            <MarkdownPreview source={d.text} onToggleTask={(n) => d.setText(toggleTask(d.text, n))} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span data-testid="page-stats">{words} word{words === 1 ? "" : "s"} · {d.text.length.toLocaleString()} characters</span>
        <span data-testid="page-size" className={cn(size > MAX_BYTES * 0.9 && "text-amber-600 dark:text-amber-400", tooBig && "font-semibold text-destructive")}>
          {kb(size)} of {kb(MAX_BYTES)}{tooBig ? " — too long to save, shorten it" : ""}
        </span>
      </div>
    </div>
  );
}

// ── loads one page, then hands it to the editor ────────────────────────────────────────────────────────────

function PageLoader({ id, view, focusTitle, onSaved, onDelete }: {
  id: number; view: View; focusTitle: boolean; onSaved: (p: NotePage) => void; onDelete: () => void;
}) {
  const q = useQuery({
    queryKey: ["note", id],
    queryFn: async () => (await notesApi.get(id)).data,
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, retry: false,
  });
  if (q.isLoading) return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;
  if (q.isError || !q.data) {
    return <p role="alert" className="py-10 text-center text-sm text-destructive">{apiMessage(q.error, "Could not open this page")}</p>;
  }
  // `key`: a different page always starts a fresh editor (and the old one saves itself while unmounting)
  return <PageDraft key={q.data.id} page={q.data} view={view} focusTitle={focusTitle} onSaved={onSaved} onDelete={onDelete} />;
}

// ── the page: tabs + the open page ─────────────────────────────────────────────────────────────────────────

export default function NotePadPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["notes"], queryFn: async () => (await notesApi.list()).data, refetchOnWindowFocus: false });
  const pages = list.data ?? [];

  const [wantedId, setWantedId] = useState<number | null>(() => {
    const n = Number(recall(PAGE_KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  });
  // one view at a time; opens as Edit (an older "side by side" choice stored on this device also opens as Edit)
  const [view, setView] = useState<View>(() => (recall(VIEW_KEY) === "preview" ? "preview" : "edit"));
  const [focusTitleFor, setFocusTitleFor] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeId = pages.find((p) => p.id === wantedId)?.id ?? pages[0]?.id ?? null;
  const active = pages.find((p) => p.id === activeId);

  useEffect(() => { if (activeId != null) remember(PAGE_KEY, String(activeId)); }, [activeId]);
  const chooseView = (v: View) => { setView(v); remember(VIEW_KEY, v); };

  // keep the tab titles in step with what was saved
  const onSaved = (p: NotePage) => {
    qc.setQueryData<NotePageSummary[]>(["notes"], (old) =>
      (old ?? []).map((x) => (x.id === p.id ? { ...x, title: p.title, version: p.version, size: byteSize(p.content), updated_at: p.updated_at } : x)));
  };

  const create = useMutation({
    mutationFn: async () => (await notesApi.create({ title: "Untitled" })).data,
    onSuccess: (p) => {
      qc.setQueryData<NotePageSummary[]>(["notes"], (old) => [...(old ?? []), { id: p.id, title: p.title, version: p.version, size: 0, updated_at: p.updated_at }]);
      setWantedId(p.id);
      setFocusTitleFor(p.id);
    },
    onError: (err) => toast.error(apiMessage(err, "Could not add the page")),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => { await notesApi.remove(id); return id; },
    onSuccess: (id) => {
      const index = pages.findIndex((p) => p.id === id);
      const rest = pages.filter((p) => p.id !== id);
      qc.setQueryData<NotePageSummary[]>(["notes"], rest);
      setWantedId((rest[Math.min(index, rest.length - 1)] ?? null)?.id ?? null);          // the neighbour takes over
      setConfirmDelete(false);
      toast.success("Page deleted");
    },
    onError: (err) => { setConfirmDelete(false); toast.error(apiMessage(err, "Could not delete the page")); },
  });

  const atLimit = pages.length >= MAX_PAGES;

  if (list.isLoading) return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;
  if (list.isError) return <p role="alert" className="py-10 text-center text-sm text-destructive">Could not load the Note Pad. Check the connection and reload.</p>;

  return (
    <div data-testid="notepad" className="flex min-h-0 flex-col gap-3">
      <h1 className="sr-only">Note Pad</h1>

      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Pages" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5">
          {pages.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === activeId}
              data-testid={`page-tab-${p.id}`}
              onClick={() => setWantedId(p.id)}
              title={p.title}
              className={cn(
                "max-w-[11rem] flex-shrink-0 truncate rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
                p.id === activeId ? "border-border bg-card text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {p.title || "Untitled"}
            </button>
          ))}
          <button
            type="button"
            data-testid="new-page"
            aria-label="New page"
            title={atLimit ? `At most ${MAX_PAGES} pages — delete one to add another` : "New page"}
            disabled={atLimit || create.isPending}
            onClick={() => create.mutate()}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {active && (
          // Edit | Preview: the page shows one of them; the other button switches
          <div role="group" aria-label="View" className="flex flex-shrink-0 items-center rounded-lg border border-border bg-card p-0.5">
            {([["edit", "Edit", Pencil], ["preview", "Preview", Eye]] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                title={v === "edit" ? "Edit the text" : "See how it will look"}
                aria-pressed={view === v}
                data-testid={`view-${v}`}
                onClick={() => chooseView(v)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                  view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {pages.length > 0 && (
        <p data-testid="page-count" className={cn("text-[11px] text-muted-foreground", atLimit && "text-amber-600 dark:text-amber-400")}>
          {pages.length} of {MAX_PAGES} pages{atLimit ? " — delete one to add another" : ""}
        </p>
      )}

      {active ? (
        <PageLoader
          key={active.id}
          id={active.id}
          view={view}
          focusTitle={focusTitleFor === active.id}
          onSaved={onSaved}
          onDelete={() => setConfirmDelete(true)}
        />
      ) : (
        <div data-testid="notepad-empty" className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No pages yet. Notes are written in Markdown and kept safely on the server.</p>
          <Button type="button" onClick={() => create.mutate()} disabled={create.isPending}><Plus className="mr-1.5 h-4 w-4" /> Create your first page</Button>
        </div>
      )}

      <Modal open={confirmDelete && !!active} onClose={() => setConfirmDelete(false)} title="Delete this page?">
        <p className="text-sm leading-relaxed text-muted-foreground">
          “<span className="font-medium text-foreground">{active?.title || "Untitled"}</span>” and everything written on it will be deleted. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button type="button" variant="destructive" disabled={remove.isPending} onClick={() => active && remove.mutate(active.id)}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
