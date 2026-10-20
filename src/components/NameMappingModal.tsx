import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock, Info, Pencil, Plus, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { nameMappingsApi } from "@/services/api";
import { cn } from "@/utils";
import type {
  ConflictAction, FinanceType, MappingConflict, MappingItem, MappingKind, MappingPopupData, MappingSimilar,
} from "@/types";
import {
  KIND_LABEL, KIND_MAX, addWord, editWord, failureMessage, isDirty, isRememberableText, newWords, removeWord,
  sameForScorer,
} from "@/utils/nameMapping";

type Props = {
  open: boolean;
  onClose: () => void;
  financeType: FinanceType;
  customerId: number | null;
  /** The OCR text of the row — offered as a one-click "add as AI mismatch" when it differs from the customer name. */
  extractedName?: string | null;
  /** A word to add as soon as the popup has loaded (from the "Remember this" chip when it hit the limit / a conflict). */
  prefill?: { kind: MappingKind; word: string } | null;
  /** Shown at the top, e.g. why the popup opened instead of saving silently. */
  notice?: string | null;
  onSaved?: (data: MappingPopupData) => void;
};

const KINDS: MappingKind[] = ["alias", "ai_mismatch"];
const keyOf = (kind: MappingKind, word: string) => `${kind}|${word}`;

const SECTION_TEXT: Record<MappingKind, { title: string; help: string }> = {
  alias: { title: "2nd alias names", help: "Other names this customer is genuinely known by." },
  ai_mismatch: { title: "AI mismatch names", help: "Wrong spellings the AI/OCR produced for this customer." },
};

// Same product colours the OCR table uses for the EDI / IOP pills
const PRODUCT_BADGE: Record<FinanceType, string> = {
  EDI: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  IOP: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
};

/** A look-alike of ANOTHER customer must be confirmed; being close to the customer's own name is only a note. */
const needsConfirm = (s: MappingSimilar) => s.matches.some((m) => !m.own);
const pct = (score: number) => `${Number(score.toFixed(1))}%`;

function apiDetail(err: any): {
  code?: string; message?: string; conflicts?: MappingConflict[]; similar?: MappingSimilar[]; kind?: MappingKind; limit?: number;
} {
  const d = err?.response?.data?.detail;
  if (d && typeof d === "object") return d;
  return { message: typeof d === "string" ? d : err?.message };
}

export function NameMappingModal({ open, onClose, financeType, customerId, extractedName, prefill, notice, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [server, setServer] = useState<MappingPopupData | null>(null);
  const [drafts, setDrafts] = useState<Record<MappingKind, string[]>>({ alias: [], ai_mismatch: [] });
  const [inputs, setInputs] = useState<Record<MappingKind, string>>({ alias: "", ai_mismatch: "" });
  const [fieldError, setFieldError] = useState<Partial<Record<MappingKind, string>>>({});
  const [editing, setEditing] = useState<{ kind: MappingKind; index: number; value: string } | null>(null);
  const [conflicts, setConflicts] = useState<Record<string, MappingConflict>>({});
  const [resolutions, setResolutions] = useState<Record<string, ConflictAction>>({});
  const [similar, setSimilar] = useState<Record<string, MappingSimilar>>({});         // words that look like a customer's name
  const [confirmedSimilar, setConfirmedSimilar] = useState<Record<string, boolean>>({});   // ... and the ones the user chose to add anyway
  const [saving, setSaving] = useState(false);

  const limits: Record<MappingKind, number> = {
    alias: server?.limits.alias ?? KIND_MAX.alias,
    ai_mismatch: server?.limits.ai_mismatch ?? KIND_MAX.ai_mismatch,
  };
  const serverWords: Record<MappingKind, string[]> = {
    alias: server?.aliases.map((i) => i.word) ?? [],
    ai_mismatch: server?.mismatches.map((i) => i.word) ?? [],
  };
  const serverItems: Record<MappingKind, MappingItem[]> = {
    alias: server?.aliases ?? [],
    ai_mismatch: server?.mismatches ?? [],
  };

  // ── Conflicts: words that are NEW (not on the server yet) and already belong to another active customer ──────
  const refreshConflicts = useCallback(async (next: Record<MappingKind, string[]>, base: Record<MappingKind, string[]>) => {
    if (customerId == null) return;
    const items = KINDS.flatMap((k) => newWords(base[k], next[k]).map((word) => ({ kind: k, word })));
    if (items.length === 0) { setConflicts({}); setSimilar({}); return; }
    try {
      const { data } = await nameMappingsApi.check({ finance_type: financeType, customer_id: customerId, items });
      const map: Record<string, MappingConflict> = {};
      data.conflicts.forEach((c) => { map[keyOf(c.kind, c.word)] = c; });
      setConflicts(map);
      const sim: Record<string, MappingSimilar> = {};
      (data.similar ?? []).forEach((s) => { sim[keyOf(s.kind, s.word)] = s; });
      setSimilar(sim);
      setResolutions((prev) => {
        const out: Record<string, ConflictAction> = {};
        Object.keys(map).forEach((k) => { out[k] = prev[k] ?? "keep_both"; });
        return out;
      });
    } catch {
      /* the server re-checks on Save (409), so a failed pre-check is not fatal */
    }
  }, [customerId, financeType]);

  // ── Load when opened ─────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || customerId == null) return;
    let cancelled = false;
    setLoading(true); setLoadError(null); setServer(null); setConflicts({}); setResolutions({}); setSimilar({}); setConfirmedSimilar({});
    setInputs({ alias: "", ai_mismatch: "" }); setFieldError({}); setEditing(null);
    nameMappingsApi.get(financeType, customerId)
      .then(({ data }) => {
        if (cancelled) return;
        const base = { alias: data.aliases.map((i) => i.word), ai_mismatch: data.mismatches.map((i) => i.word) };
        setServer(data);
        let next = base;
        if (prefill) {
          const r = addWord(base[prefill.kind], prefill.word, data.limits[prefill.kind]);
          if (r.ok) next = { ...base, [prefill.kind]: r.list };
          else setFieldError({ [prefill.kind]: failureMessage(r.reason, prefill.kind, data.limits[prefill.kind]) });
        }
        setDrafts(next);
        if (next !== base) refreshConflicts(next, base);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(apiDetail(err).message ?? "Could not load the names");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId, financeType]);

  // ── Draft editing ────────────────────────────────────────────────────────────────────────────────────────
  const commitDrafts = (next: Record<MappingKind, string[]>) => {
    setDrafts(next);
    // forget conflict decisions for words that were removed
    setConflicts((prev) => {
      const keep: Record<string, MappingConflict> = {};
      KINDS.forEach((k) => next[k].forEach((w) => { const key = keyOf(k, w); if (prev[key]) keep[key] = prev[key]; }));
      return keep;
    });
    // same for look-alike warnings and their "add anyway" (an edited word is a different word: it is checked again)
    const stillThere = (key: string) => KINDS.some((k) => next[k].some((w) => keyOf(k, w) === key));
    setSimilar((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => stillThere(key))));
    setConfirmedSimilar((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => stillThere(key))));
    refreshConflicts(next, serverWords);
  };

  const tryAdd = (kind: MappingKind, word: string) => {
    const r = addWord(drafts[kind], word, limits[kind]);
    if (!r.ok) { setFieldError((p) => ({ ...p, [kind]: failureMessage(r.reason, kind, limits[kind]) })); return; }
    setFieldError((p) => ({ ...p, [kind]: undefined }));
    setInputs((p) => ({ ...p, [kind]: "" }));
    commitDrafts({ ...drafts, [kind]: r.list });
  };

  const tryEdit = () => {
    if (!editing) return;
    const r = editWord(drafts[editing.kind], editing.index, editing.value);
    if (!r.ok) { setFieldError((p) => ({ ...p, [editing.kind]: failureMessage(r.reason, editing.kind, limits[editing.kind]) })); return; }
    setFieldError((p) => ({ ...p, [editing.kind]: undefined }));
    commitDrafts({ ...drafts, [editing.kind]: r.list });
    setEditing(null);
  };

  const doRemove = (kind: MappingKind, index: number) => {
    setFieldError((p) => ({ ...p, [kind]: undefined }));
    commitDrafts({ ...drafts, [kind]: removeWord(drafts[kind], index) });
  };

  const dirty = KINDS.some((k) => isDirty(serverWords[k], drafts[k]));
  const overLimit = KINDS.some((k) => drafts[k].length > limits[k]);
  // look-alikes of another customer that are still in the lists and have not been confirmed ("Add anyway") — Save waits for a choice
  const draftSimilar = Object.values(similar).filter((s) => needsConfirm(s) && drafts[s.kind].includes(s.word));
  const unconfirmedCount = draftSimilar.filter((s) => !confirmedSimilar[keyOf(s.kind, s.word)]).length;

  // ── Save ─────────────────────────────────────────────────────────────────────────────────────────────────
  const save = async () => {
    if (customerId == null || saving) return;
    setSaving(true);
    try {
      const resList = Object.values(conflicts)
        .filter((c) => drafts[c.kind].includes(c.word))
        .map((c) => ({ kind: c.kind, word: c.word, action: resolutions[keyOf(c.kind, c.word)] ?? ("keep_both" as ConflictAction) }));
      const { data } = await nameMappingsApi.save({
        finance_type: financeType, customer_id: customerId,
        aliases: drafts.alias, mismatches: drafts.ai_mismatch, resolutions: resList,
        confirmed_similar: draftSimilar
          .filter((s) => confirmedSimilar[keyOf(s.kind, s.word)])
          .map((s) => ({ kind: s.kind, word: s.word })),
      });
      toast.success("Names saved");
      onSaved?.(data);
      onClose();
    } catch (err: any) {
      const d = apiDetail(err);
      if ((d.code === "conflict" && d.conflicts) || d.code === "similar") {
        const map: Record<string, MappingConflict> = {};
        (d.conflicts ?? []).forEach((c) => { map[keyOf(c.kind, c.word)] = c; });
        setConflicts((p) => ({ ...p, ...map }));
        const sim: Record<string, MappingSimilar> = {};
        (d.similar ?? []).forEach((s) => { sim[keyOf(s.kind, s.word)] = s; });
        setSimilar((p) => ({ ...p, ...sim }));
        toast.error(d.code === "similar"
          ? "Some names look like an existing customer — choose Add anyway or Cancel"
          : "Some names are already mapped to another customer — choose what to do");
      } else if (d.code === "limit_exceeded" && d.kind) {
        setFieldError((p) => ({ ...p, [d.kind!]: d.message }));
        toast.error(d.message ?? "Limit reached");
      } else {
        toast.error(d.message ?? "Could not save the names");
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Quick-add of the OCR text ────────────────────────────────────────────────────────────────────────────
  const customerName = server?.customer.name ?? "";
  const suggestWord = useMemo(() => {
    const w = (extractedName ?? "").trim();
    if (!server || !isRememberableText(w)) return null;
    if (sameForScorer(w, customerName)) return null;
    if (drafts.ai_mismatch.includes(w) || drafts.alias.includes(w)) return null;
    return w;
  }, [extractedName, server, customerName, drafts]);

  // ── Render ───────────────────────────────────────────────────────────────────────────────────────────────
  const renderConflict = (kind: MappingKind, word: string, index: number) => {
    const conflict = conflicts[keyOf(kind, word)];
    if (!conflict) return null;
    const chosen = resolutions[keyOf(kind, word)] ?? "keep_both";
    return (
      <div data-testid="conflict" className="mt-2 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
          <span>Already mapped to <b className="font-semibold">{conflict.customers.map((c) => c.customer_name).join(", ")}</b>.</span>
        </p>
        <div role="radiogroup" aria-label={`What to do with ${word}`} className="flex flex-wrap gap-1.5">
          {([["keep_both", "Keep both"], ["move", "Move to this customer (delete the other)"]] as const).map(([action, label]) => (
            <Button
              key={action}
              type="button"
              role="radio"
              aria-checked={chosen === action}
              size="sm"
              variant={chosen === action ? "default" : "outline"}
              className="h-7 px-2.5"
              onClick={() => setResolutions((p) => ({ ...p, [keyOf(kind, word)]: action }))}
            >
              {label}
            </Button>
          ))}
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2.5" onClick={() => doRemove(kind, index)}>Cancel</Button>
        </div>
      </div>
    );
  };

  // A word that looks like the NAME of an existing customer (90%+): warn, with Add anyway / Cancel. Close to the customer's OWN name is just a note.
  const renderSimilar = (kind: MappingKind, word: string, index: number) => {
    const key = keyOf(kind, word);
    const s = similar[key];
    if (!s) return null;
    const others = s.matches.filter((m) => !m.own);
    const own = s.matches.find((m) => m.own);
    if (others.length === 0) {
      return (
        <p data-testid="similar-own" className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-px h-3 w-3 flex-shrink-0" />
          <span>Very close to this customer’s own name ({pct(own!.score)}) — it is matched anyway.</span>
        </p>
      );
    }
    const chosen = Boolean(confirmedSimilar[key]);
    return (
      <div data-testid="similar" className="mt-2 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Looks like an existing customer:{" "}
            {others.map((m, i) => (
              <span key={m.customer_id}>{i > 0 && ", "}<b className="font-semibold">{m.customer_name}</b> ({pct(m.score)} match)</span>
            ))}
            .{own ? " It is also close to this customer’s own name." : ""}
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={chosen ? "default" : "outline"}
            aria-pressed={chosen}
            className="h-7 px-2.5"
            onClick={() => setConfirmedSimilar((p) => ({ ...p, [key]: !p[key] }))}
          >
            {chosen ? "Will be added anyway ✓" : "Add anyway"}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2.5" onClick={() => doRemove(kind, index)}>Cancel</Button>
        </div>
      </div>
    );
  };

  const renderSection = (kind: MappingKind) => {
    const list = drafts[kind];
    const max = limits[kind];
    const full = list.length >= max;
    const over = list.length > max;
    const { title, help } = SECTION_TEXT[kind];
    return (
      <section key={kind} data-testid={`section-${kind}`} className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
          <span
            data-testid={`count-${kind}`}
            className={cn(
              "font-mono text-xs font-semibold",
              over ? "text-destructive" : full ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
            )}
          >
            {list.length}/{max}
          </span>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground/80">{help}</p>

        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {list.map((word, i) => {
            const item = serverItems[kind].find((x) => x.word === word);
            const isEditing = editing?.kind === kind && editing.index === i;
            return (
              <li key={`${kind}-${i}-${word}`} className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Input
                        autoFocus
                        aria-label={`Edit ${word}`}
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); tryEdit(); }
                          if (e.key === "Escape") { e.preventDefault(); setEditing(null); }   // the dialog stays open (see onEscapeKeyDown)
                        }}
                        className="h-7 min-w-0 flex-1 text-[13px]"
                      />
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Apply edit" onClick={tryEdit}>
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Cancel edit" onClick={() => setEditing(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={word}>{word}</span>
                      {item?.stale && (
                        <Badge
                          data-testid="stale-badge"
                          title={item.last_used_at ? `Last used ${item.last_used_at.slice(0, 10)}` : "Never used"}
                          className="flex-shrink-0 gap-1 bg-amber-500/10 px-1.5 text-[10px] text-amber-600 dark:text-amber-400"
                        >
                          <Clock className="h-2.5 w-2.5" /> not used recently
                        </Badge>
                      )}
                      {item && item.use_count > 0 && (
                        <span title="Times used" className="flex-shrink-0 font-mono text-[10px] text-muted-foreground">×{item.use_count}</span>
                      )}
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${word}`}
                        onClick={() => setEditing({ kind, index: i, value: word })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="destructive" size="icon" className="h-7 w-7" aria-label={`Delete ${word}`}
                        onClick={() => doRemove(kind, i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
                {!isEditing && renderConflict(kind, word, i)}
                {!isEditing && renderSimilar(kind, word, i)}
              </li>
            );
          })}
          {list.length === 0 && <li className="px-3 py-2 text-xs italic text-muted-foreground">None yet</li>}
        </ul>

        <div className="flex gap-2">
          <Input
            aria-label={`Add ${title}`}
            value={inputs[kind]}
            disabled={full}
            placeholder={full ? `Limit of ${max} reached` : "Type a name…"}
            onChange={(e) => { setInputs((p) => ({ ...p, [kind]: e.target.value })); setFieldError((p) => ({ ...p, [kind]: undefined })); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tryAdd(kind, inputs[kind]); } }}
          />
          <Button type="button" variant="outline" aria-label={`Add to ${title}`} disabled={full || !inputs[kind].trim()}
            onClick={() => tryAdd(kind, inputs[kind])}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {fieldError[kind] && <p role="alert" className="text-xs text-destructive">{fieldError[kind]}</p>}
        {full && !fieldError[kind] && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Limit reached — edit or delete an existing name to make room{serverItems[kind].some((i) => i.stale) ? " (try one marked “not used recently”)" : ""}.
          </p>
        )}
      </section>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Alias & AI-mismatch names"
      className="max-w-lg"
      // Escape while an inline edit is open only cancels that edit — it must not throw away the whole draft
      onEscapeKeyDown={(e) => { if (editing) e.preventDefault(); }}
    >
      {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
      {loadError && <p role="alert" className="py-4 text-sm text-destructive">{loadError}</p>}
      {server && !loading && (
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{server.customer.name}</span>
              <Badge className={cn("rounded-md px-1.5 text-[10px] font-bold", PRODUCT_BADGE[server.customer.finance_type])}>
                {server.customer.finance_type}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">#{server.customer.id}</span>
            </div>
            {extractedName && isRememberableText(extractedName) && (
              <p className="text-xs text-muted-foreground">Extracted text: <span className="font-medium text-foreground">“{extractedName}”</span></p>
            )}
          </div>

          {notice && (
            <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              {notice}
            </p>
          )}

          {suggestWord && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="quick-add"
              className="h-8 w-full justify-start font-normal"
              disabled={drafts.ai_mismatch.length >= limits.ai_mismatch}
              onClick={() => tryAdd("ai_mismatch", suggestWord)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add “{suggestWord}” as an AI mismatch name
            </Button>
          )}

          {/* The lists scroll inside the dialog so Save / Cancel are always reachable, even with 3 + 10 names */}
          <div className="max-h-[max(10rem,calc(78vh-17rem))] space-y-5 overflow-y-auto pr-1 md:max-h-[max(10rem,calc(100vh-20rem))]">
            {KINDS.map(renderSection)}
          </div>

          {unconfirmedCount > 0 && (
            <p data-testid="similar-hint" className="text-xs text-amber-600 dark:text-amber-400">
              Choose “Add anyway” or “Cancel” for {unconfirmedCount === 1 ? "the highlighted name" : `the ${unconfirmedCount} highlighted names`} before saving.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={save} disabled={!dirty || saving || overLimit || unconfirmedCount > 0}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
