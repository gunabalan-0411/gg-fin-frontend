// Search-and-click dropdown for categories / sub-categories / people: type to narrow the list, click (or Enter) to pick, and when what
// was typed is not in the list it offers  + Create "text"  so a new one can be added on the spot.
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/utils";

export interface PickOption {
  id: number;
  label: string;
  hint?: string;
}

interface Props {
  options: PickOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** Create a new entry from the typed text; resolves to its id (it is then picked), or null when it could not be created. */
  onCreate?: (text: string) => Promise<number | null>;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  allowClear?: boolean;
  className?: string;
  testId?: string;
}

export function PickCombobox({ options, value, onChange, onCreate, placeholder, ariaLabel, disabled, invalid, allowClear, className, testId }: Props) {
  const [query, setQuery] = useState<string | null>(null);     // null = not typing: the picked label is shown
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value) ?? null;

  const typed = (query ?? "").trim();
  const q = typed.toLowerCase();
  const matches = (q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
        .sort((a, b) => Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q)))
    : options);
  const canCreate = Boolean(onCreate) && typed.length > 0 && !options.some((o) => o.label.toLowerCase() === q);
  const rows: ({ kind: "option"; option: PickOption } | { kind: "create" })[] = [
    ...matches.map((option) => ({ kind: "option" as const, option })),
    ...(canCreate ? [{ kind: "create" as const }] : []),
  ];

  useEffect(() => { setActive(0); }, [query]);

  const close = () => { setOpen(false); setQuery(null); };

  const pick = (id: number | null) => { onChange(id); close(); };

  const create = async () => {
    if (!onCreate || busy) return;
    setBusy(true);
    try {
      const id = await onCreate(typed);
      if (id != null) pick(id);
    } finally {
      setBusy(false);
    }
  };

  const choose = (row: (typeof rows)[number] | undefined) => {
    if (!row) return;
    if (row.kind === "create") void create();
    else pick(row.option.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(rows.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { if (open && rows.length) { e.preventDefault(); choose(rows[active]); } }
    else if (e.key === "Escape") { if (open) { e.preventDefault(); e.stopPropagation(); close(); } }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          data-testid={testId}
          disabled={disabled}
          value={query ?? selected?.label ?? ""}
          placeholder={placeholder}
          onFocus={(e) => { setOpen(true); e.currentTarget.select(); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onBlur={close}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full rounded-lg border bg-card px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-foreground/20 disabled:opacity-50",
            invalid ? "border-red-500/60" : "border-border",
            allowClear && selected ? "pr-7" : "",
          )}
        />
        {allowClear && selected && !disabled && (
          <button
            type="button"
            aria-label={`Clear ${ariaLabel}`}
            onMouseDown={(e) => { e.preventDefault(); pick(null); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >×</button>
        )}
      </div>
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${ariaLabel} options`}
          className="absolute left-0 right-0 z-[70] mt-1 max-h-52 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-xl"
        >
          {rows.length === 0 && <li className="px-2.5 py-1.5 text-xs text-muted-foreground">Nothing found</li>}
          {rows.map((row, i) => (
            <li
              key={row.kind === "create" ? "create" : row.option.id}
              role="option"
              aria-selected={row.kind === "option" && row.option.id === value}
              data-testid={row.kind === "create" ? "pick-create" : undefined}
              onMouseDown={(e) => { e.preventDefault(); choose(row); }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-xs",
                i === active ? "bg-primary/10" : "",
                row.kind === "create" ? "font-medium text-emerald-700 dark:text-emerald-400" : "",
              )}
            >
              {row.kind === "create"
                ? <span>{busy ? "Creating…" : <>+ Create “{typed}”</>}</span>
                : (<>
                    <span className={cn(row.option.id === value && "font-semibold")}>{row.option.label}</span>
                    {row.option.hint && <span className="text-[10px] text-muted-foreground">{row.option.hint}</span>}
                  </>)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
