import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const POPUP_W = 288;       // the calendar's own width (w-72)
const EDGE = 8;            // always keep this much space to the screen edge
const GAP = 4;             // between the button and the calendar

interface DatePickerProps {
  value?: string; // ISO date "YYYY-MM-DD"
  onChange: (value: string) => void;
  className?: string;
}

/** An ancestor with a transform / filter becomes the reference for position: fixed (a centred dialog is one): coordinates must be relative to it. */
function fixedOrigin(container: HTMLElement): { left: number; top: number } {
  if (container === document.body) return { left: 0, top: 0 };
  const cs = getComputedStyle(container);
  const shifted = cs.transform !== "none" || cs.filter !== "none" || cs.perspective !== "none" || /transform|filter|perspective/.test(cs.willChange);
  if (!shifted) return { left: 0, top: 0 };
  const r = container.getBoundingClientRect();
  return { left: r.left + container.clientLeft, top: r.top + container.clientTop };
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
};

/**
 * A date button that opens a calendar. The calendar is drawn in its own layer on the page (a portal, position: fixed) and placed from the
 * button's position, so a card with overflow hidden, a narrow column or the edge of the screen can no longer cut it off: it is kept inside the
 * screen (shifted sideways, opened upwards when there is no room below, scrolled inside itself when the screen is very short).
 *
 * Keyboard: on the button, Left / Right = the day before / after (no need to open it). Open: Left / Right = a day, Up / Down = a week,
 * PageUp / PageDown = a month, Enter = pick the highlighted day, Esc = close.
 */
export function DatePicker({ value, onChange, className }: DatePickerProps) {
  const parsed = value ? new Date(value + "T00:00:00") : null;
  const today = new Date();

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth());
  const [cursor, setCursor] = useState<Date>(parsed ?? today);          // the day the keyboard is on
  const [pos, setPos] = useState<CSSProperties>({ position: "fixed", opacity: 0, pointerEvents: "none" })   // measured first, then shown (opacity, not visibility: a hidden box cannot take the keyboard);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Inside a modal dialog the calendar must live INSIDE it (the dialog blocks clicks, focus and "outside" presses elsewhere); otherwise on the page body.
  const [host, setHost] = useState<HTMLElement | null>(null);

  const openCalendar = () => {
    const start = parsed ?? new Date();
    setViewYear(start.getFullYear());
    setViewMonth(start.getMonth());
    setCursor(start);
    setHost((btnRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? document.body);
    setOpen(true);
  };
  const closeCalendar = (refocus = false) => { setOpen(false); if (refocus) btnRef.current?.focus(); };

  // ── where the calendar goes: from the button, kept inside the screen ──
  const place = useCallback(() => {
    const btn = btnRef.current, pop = popRef.current;
    if (!btn || !pop || !host) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(POPUP_W, vw - EDGE * 2);
    pop.style.width = `${width}px`;                                       // measure the height at the final width (a narrower box is taller)
    pop.style.maxHeight = "";
    const h = pop.offsetHeight;
    let left = r.left;
    left = Math.max(EDGE, Math.min(left, vw - width - EDGE));
    const below = vh - r.bottom - GAP - EDGE, above = r.top - GAP - EDGE;
    let top: number, maxHeight: number | undefined;
    if (h <= below) { top = r.bottom + GAP; }
    else if (h <= above) { top = r.top - GAP - h; }
    else if (below >= above) { top = r.bottom + GAP; maxHeight = Math.max(160, below); }   // very short screen: scroll inside the calendar
    else { maxHeight = Math.max(160, above); top = r.top - GAP - maxHeight; }
    const o = fixedOrigin(host);
    setPos({ position: "fixed", left: left - o.left, top: Math.max(EDGE, top) - o.top, width, maxHeight, overflowY: maxHeight ? "auto" : undefined, opacity: 1 });
  }, [host]);

  useLayoutEffect(() => { if (open) place(); }, [open, place, viewMonth, viewYear]);
  useEffect(() => {
    if (!open) return;
    const again = () => place();
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);                      // any scrolling parent: follow the button
    return () => { window.removeEventListener("resize", again); window.removeEventListener("scroll", again, true); };
  }, [open, place]);

  // the calendar takes the keyboard when it opens; a click outside (the layer is outside the wrapper) closes it
  useEffect(() => { if (open) popRef.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const commit = (d: Date) => { onChange(iso(d)); setOpen(false); };
  const selectDay = (day: number) => commit(new Date(viewYear, viewMonth, day));

  const moveCursor = (next: Date) => { setCursor(next); setViewYear(next.getFullYear()); setViewMonth(next.getMonth()); };

  const onPopupKey = (e: ReactKeyboardEvent) => {
    const k = e.key;
    if ((e.target as HTMLElement).tagName === "SELECT" && k !== "Escape") return;      // the month / year lists keep their own arrow keys
    const step: Record<string, () => Date> = {
      ArrowLeft: () => addDays(cursor, -1), ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7), ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, -1), PageDown: () => addMonths(cursor, 1),
    };
    if (step[k]) { e.preventDefault(); e.stopPropagation(); moveCursor(step[k]()); return; }
    if (k === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") { e.preventDefault(); e.stopPropagation(); commit(cursor); return; }
    if (k === "Escape") { e.preventDefault(); e.stopPropagation(); closeCalendar(true); }
  };

  // on the closed button: Left / Right = the previous / next day (the date moves without opening the calendar)
  const onButtonKey = (e: ReactKeyboardEvent) => {
    if (open || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const base = parsed ?? new Date();
    const next = addDays(base, e.key === "ArrowLeft" ? -1 : 1);
    onChange(iso(next));
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const selectedDay = parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth
    ? parsed.getDate() : null;
  const cursorDay = cursor.getFullYear() === viewYear && cursor.getMonth() === viewMonth ? cursor.getDate() : null;

  const displayValue = parsed
    ? parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "Select date";

  const calendar = (
    <div
      ref={popRef} role="dialog" aria-label="Choose a date" tabIndex={-1} data-testid="date-popup"
      onKeyDown={onPopupKey}
      style={{ zIndex: 9999, ...pos }}
      className="rounded-xl border border-border bg-card shadow-2xl p-4 outline-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Previous month"
          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <select
            value={viewMonth}
            onChange={(e) => setViewMonth(Number(e.target.value))}
            aria-label="Month"
            className="bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer"
          >
            {MONTHS.map((m, i) => <option key={m} value={i} className="bg-card">{m}</option>)}
          </select>
          <select
            value={viewYear}
            onChange={(e) => setViewYear(Number(e.target.value))}
            aria-label="Year"
            className="bg-transparent text-sm font-semibold text-foreground focus:outline-none cursor-pointer"
          >
            {Array.from({ length: 20 }, (_, i) => today.getFullYear() - 10 + i).map((y) => (
              <option key={y} value={y} className="bg-card">{y}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="Next month"
          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const isSelected = day === selectedDay;
          const isCursor = day === cursorDay;
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          return (
            <button
              key={day}
              type="button"
              tabIndex={-1}
              data-cursor={isCursor ? "true" : undefined}
              onClick={() => selectDay(day)}
              className={cn(
                "aspect-square flex items-center justify-center text-xs rounded-lg transition-colors",
                isSelected
                  ? "bg-foreground text-background font-semibold"
                  : isToday
                    ? "border border-foreground/30 text-foreground font-medium hover:bg-secondary"
                    : "text-foreground hover:bg-secondary",
                isCursor && "ring-2 ring-foreground/60"
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Today button */}
      <div className="mt-3 pt-3 border-t border-border">
        <button
          type="button"
          onClick={() => commit(new Date())}
          className="w-full text-xs text-foreground hover:text-foreground/70 font-medium py-1 transition-colors"
        >
          Today
        </button>
      </div>
    </div>
  );

  return (
    <div className={cn("relative", className)} ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? closeCalendar() : openCalendar())}
        onKeyDown={onButtonKey}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-border bg-secondary",
          "text-sm text-left transition-colors hover:border-muted-foreground/40 focus:outline-none focus:border-muted-foreground/40",
          !parsed && "text-muted-foreground"
        )}
      >
        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span>{displayValue}</span>
      </button>

      {open && host && createPortal(calendar, host)}
    </div>
  );
}
