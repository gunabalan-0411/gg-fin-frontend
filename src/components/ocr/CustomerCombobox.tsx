import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import type { MappingCandidate, MappingKind, MappingRef } from "@/types";
import { SourceBadge } from "@/components/ocr/SourceBadge";
import { KIND_LABEL, flattenDropdown } from "@/utils/nameMapping";

export type Suggestion = { id: number; name: string; score: number; balance?: number };

/** The slice of an OCR row the dropdown needs. */
export interface ComboboxRow {
  customer_name: string;
  customer_id: number | null;
  product_type: "EDI" | "IOP";
  customer_suggestions: Suggestion[];
  mapping_suggestions?: MappingCandidate[];
}

/** Extra row fields to set when a customer is picked (how the match was made). */
export interface ComboboxPick {
  mapping_ref?: MappingRef | null;
  match_source?: "fuzzy" | MappingKind | null;
  matched_customer_name?: string | null;
}

type Props = {
  row: ComboboxRow;
  onChange: (name: string, id: number | null, pick?: ComboboxPick) => void;
  fetchSuggestions?: (query: string, productType: "EDI" | "IOP") => Promise<Suggestion[]>;
  /** Live column 2 (alias / AI-mismatch) for the text being typed. */
  fetchMappingSuggestions?: (query: string, productType: "EDI" | "IOP") => Promise<MappingCandidate[]>;
  compact?: boolean;
};

function scorePillClass(score: number, compact: boolean) {
  const alpha = compact ? "/15" : "/20";
  return score >= 0.9 ? `bg-green-500${alpha} text-green-600 dark:text-green-400`
    : score >= 0.75 ? `bg-amber-500${alpha} text-amber-600 dark:text-amber-400`
    : `bg-red-500${alpha} text-red-400`;
}

/**
 * Customer picker used by every OCR row.
 *
 * Column 1  — the usual fuzzy suggestions (unchanged).
 * Column 2  — alias / AI-mismatch candidates, exact matches first, then by score; shown whenever there are any, even
 *             when column 1 is a confident match. Refreshed from the server while the user types.
 */
export function CustomerCombobox({ row, onChange, fetchSuggestions, fetchMappingSuggestions, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [liveSuggestions, setLiveSuggestions] = useState<Suggestion[]>([]);
  const [liveMapping, setLiveMapping] = useState<MappingCandidate[]>([]);
  const [typed, setTyped] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleChange = (value: string) => {
    onChange(value, null);                 // typing un-assigns the row (and drops any mapping reference)
    setHighlightedIndex(-1);
    if (!fetchSuggestions && !fetchMappingSuggestions) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    debounceRef.current = setTimeout(async () => {
      const ticket = ++requestRef.current;
      if (q.length < 2) {
        setLiveSuggestions([]);
        setLiveMapping([]);
        setTyped(false);
        return;
      }
      const [fuzzy, mapped] = await Promise.all([
        fetchSuggestions ? fetchSuggestions(q, row.product_type).catch(() => []) : Promise.resolve([]),
        fetchMappingSuggestions ? fetchMappingSuggestions(q, row.product_type).catch(() => []) : Promise.resolve([]),
      ]);
      if (ticket !== requestRef.current) return;     // a newer keystroke superseded this answer
      setLiveSuggestions(fuzzy);
      setLiveMapping(mapped);
      setTyped(true);
    }, 200);
  };

  const col1: Suggestion[] = fetchSuggestions
    ? liveSuggestions.length > 0 ? liveSuggestions : row.customer_suggestions
    : row.customer_suggestions;
  const col2: MappingCandidate[] = typed ? liveMapping : (row.mapping_suggestions ?? []);
  const entries = flattenDropdown(col1, col2);
  const hasBoth = col1.length > 0 && col2.length > 0;

  // The list is rendered in a portal with fixed positioning: the OCR table sits in a scroll container that would clip an
  // absolutely positioned dropdown (the right-hand column and its badges were cut off).
  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wanted = hasBoth ? (compact ? 480 : Math.max(r.width, 280)) : Math.max(r.width, 220);
    const width = Math.min(wanted, vw - 16);
    const left = Math.max(8, Math.min(r.left, vw - 8 - width));
    const below = vh - r.bottom - 8;
    const above = r.top - 8;
    const flip = below < 230 && above > below;          // not enough room underneath: open upwards
    setPos(flip ? { left, width, bottom: vh - r.top + 4 } : { left, width, top: r.bottom + 4 });
  }, [hasBoth, compact]);

  const showing = open && entries.length > 0;
  useLayoutEffect(() => { if (showing) place(); }, [showing, entries.length, place]);
  useEffect(() => {
    if (!showing) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);       // capture: any scrolling ancestor, e.g. the table
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [showing, place]);

  // Keep the highlighted item visible
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const buttons = listRef.current.querySelectorAll("button");
    buttons[highlightedIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [highlightedIndex]);

  const close = () => { setOpen(false); setHighlightedIndex(-1); };

  const pickFuzzy = (s: Suggestion) => {
    onChange(s.name, s.id, { mapping_ref: null, match_source: null, matched_customer_name: null });
    setLiveSuggestions([]); setLiveMapping([]); setTyped(false);
    close();
  };
  const pickMapped = (c: MappingCandidate) => {
    onChange(c.name, c.id, {
      mapping_ref: { kind: c.source, id: c.mapping_id },
      match_source: c.source,
      matched_customer_name: c.name,
    });
    setLiveSuggestions([]); setLiveMapping([]); setTyped(false);
    close();
  };
  const pickEntry = (i: number) => {
    const e = entries[i];
    if (!e) return;
    if (e.column === 1) pickFuzzy(e.fuzzy); else pickMapped(e.mapped);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" && entries.length > 0) {
        setOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickEntry(highlightedIndex >= 0 ? highlightedIndex : 0);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  // ── Rendering ────────────────────────────────────────────────────────────────
  const rowBtn = (idx: number) =>
    `w-full flex items-center justify-between px-3 py-2 text-left gap-3 ${compact ? "text-[12.5px]" : "text-sm"} transition-colors ${
      idx === highlightedIndex ? "bg-secondary" : "hover:bg-secondary"
    }`;

  const fuzzyItems = col1.map((s, i) => (
    <button
      key={`f-${s.id}`}
      role="option"
      data-testid="fuzzy-option"
      onMouseDown={() => pickFuzzy(s)}
      onMouseEnter={() => setHighlightedIndex(i)}
      className={rowBtn(i)}
    >
      <span className="font-medium truncate">{s.name}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-semibold ${compact ? "font-mono" : ""} ${scorePillClass(s.score, !!compact)}`}>
        {Math.round(s.score * 100)}{compact ? "" : "%"}
      </span>
    </button>
  ));

  const mappedItems = col2.map((c, j) => {
    const idx = col1.length + j;
    return (
      <button
        key={`m-${c.mapping_id}`}
        role="option"
        data-testid="mapped-option"
        title={`${KIND_LABEL[c.source]} “${c.matched_word}”${c.also.length ? ` (+${c.also.length} more)` : ""}`}
        onMouseDown={() => pickMapped(c)}
        onMouseEnter={() => setHighlightedIndex(idx)}
        className={rowBtn(idx)}
      >
        <span className="min-w-0">
          <span className="block font-medium truncate">{c.name}</span>
          <span className="block text-[10px] text-muted-foreground truncate">via “{c.matched_word}”</span>
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          <SourceBadge source={c.source} />
          {c.exact && <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400" title="Exact match">=</span>}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${compact ? "font-mono" : ""} ${scorePillClass(c.score, !!compact)}`}>
            {Math.round(c.score * 100)}{compact ? "" : "%"}
          </span>
        </span>
      </button>
    );
  });

  const header = (label: string) => (
    <div className="px-3 pt-2 pb-1 text-[9.5px] font-semibold uppercase tracking-[.08em] text-muted-foreground/70">{label}</div>
  );

  const dropdown = showing && pos && createPortal(
    <div
      ref={listRef}
      role="listbox"
      data-testid="customer-dropdown"
      style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
      className={`z-[70] bg-card border border-border rounded-xl overflow-hidden ${compact ? "shadow-2xl" : "shadow-xl"}`}
    >
      {hasBoth ? (
        <div className={compact ? "grid grid-cols-2 divide-x divide-border" : "flex flex-col divide-y divide-border"}>
          <div data-testid="col-matches" className="max-h-52 overflow-y-auto">
            {header("Matches")}
            {fuzzyItems}
          </div>
          <div data-testid="col-mapped" className="max-h-52 overflow-y-auto">
            {header("Alias · AI mismatch")}
            {mappedItems}
          </div>
        </div>
      ) : col2.length > 0 ? (
        <div data-testid="col-mapped" className="max-h-52 overflow-y-auto">
          {header("Alias · AI mismatch")}
          {mappedItems}
        </div>
      ) : (
        <div data-testid="col-matches" className="max-h-52 overflow-y-auto">{fuzzyItems}</div>
      )}
    </div>,
    document.body,
  );

  if (compact) {
    return (
      <div className="relative w-full">
        <input
          ref={inputRef}
          type="text"
          value={row.customer_name}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          onKeyDown={handleKeyDown}
          placeholder="Customer…"
          className={`w-full text-[12.5px] bg-transparent border-0 outline-0 px-1.5 py-1 rounded transition-all
            hover:bg-muted focus:bg-card focus:shadow-[0_0_0_2px_hsl(var(--foreground)),0_0_0_4px_hsl(var(--primary)/0.35)]
            ${!row.customer_id ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}
        />
        {dropdown}
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={inputRef}
        type="text"
        value={row.customer_name}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        onKeyDown={handleKeyDown}
        className={`w-full text-sm rounded-lg border px-3 py-1.5 bg-background focus:outline-none focus:ring-2 pr-7 ${
          row.customer_id
            ? "border-green-500/40 focus:ring-green-500/20"
            : "border-amber-500/40 focus:ring-amber-500/20"
        }`}
        placeholder="Customer name…"
      />
      {!row.customer_id && (
        <AlertTriangle className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-amber-400 pointer-events-none" />
      )}
      {dropdown}
    </div>
  );
}
