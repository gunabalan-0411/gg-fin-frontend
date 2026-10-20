import { useRef, type KeyboardEvent } from "react";
import {
  Bold, Code, FileCode, Heading1, Heading2, Heading3, Italic, Link as LinkIcon, List, ListChecks, ListOrdered, Minus, Quote,
  Strikethrough, Table as TableIcon, type LucideIcon,
} from "lucide-react";
import { cn } from "@/utils";
import {
  continueList, insertCodeBlock, insertDivider, insertLink, insertTable, toggleLines, wrapSelection, type Edit, type LineKind,
} from "@/utils/markdownEdit";

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Put an edit into the textarea. `execCommand("insertText")` keeps the browser's own Undo / Redo working (setting `value`
 * directly wipes the undo history); where it is not available the text is set through React instead.
 */
function applyEdit(el: HTMLTextAreaElement, edit: Edit, onChange: (v: string) => void) {
  const old = el.value;
  if (edit.value === old) {
    el.setSelectionRange(edit.start, edit.end);
    return;
  }
  // only the part that really changed is replaced
  const max = Math.min(old.length, edit.value.length);
  let head = 0;
  while (head < max && old[head] === edit.value[head]) head++;
  let tail = 0;
  while (tail < max - head && old[old.length - 1 - tail] === edit.value[edit.value.length - 1 - tail]) tail++;
  const insert = edit.value.slice(head, edit.value.length - tail);

  el.focus();
  el.setSelectionRange(head, old.length - tail);
  let done = false;
  try {
    done = insert === "" ? document.execCommand("delete") : document.execCommand("insertText", false, insert);
  } catch { /* not supported: fall through */ }

  if (done && el.value === edit.value) {
    el.setSelectionRange(edit.start, edit.end);
    return;
  }
  onChange(edit.value);
  setTimeout(() => { el.setSelectionRange(edit.start, edit.end); }, 0);          // after React has put the new text in
}

type Action = { id: string; label: string; icon: LucideIcon; run: (v: string, s: number, e: number) => Edit };
const lines = (kind: LineKind) => (v: string, s: number, e: number) => toggleLines(v, s, e, kind);

const GROUPS: Action[][] = [
  [
    { id: "h1", label: "Heading 1", icon: Heading1, run: lines("h1") },
    { id: "h2", label: "Heading 2", icon: Heading2, run: lines("h2") },
    { id: "h3", label: "Heading 3", icon: Heading3, run: lines("h3") },
  ],
  [
    { id: "bold", label: "Bold (Ctrl+B)", icon: Bold, run: (v, s, e) => wrapSelection(v, s, e, "**") },
    { id: "italic", label: "Italic (Ctrl+I)", icon: Italic, run: (v, s, e) => wrapSelection(v, s, e, "*") },
    { id: "strike", label: "Strikethrough", icon: Strikethrough, run: (v, s, e) => wrapSelection(v, s, e, "~~") },
    { id: "code", label: "Inline code", icon: Code, run: (v, s, e) => wrapSelection(v, s, e, "`", "`", "code") },
  ],
  [
    { id: "bullet", label: "Bulleted list", icon: List, run: lines("bullet") },
    { id: "number", label: "Numbered list", icon: ListOrdered, run: lines("number") },
    { id: "task", label: "Checklist", icon: ListChecks, run: lines("task") },
    { id: "quote", label: "Quote", icon: Quote, run: lines("quote") },
  ],
  [
    { id: "link", label: "Link (Ctrl+K)", icon: LinkIcon, run: insertLink },
    { id: "table", label: "Table", icon: TableIcon, run: insertTable },
    { id: "codeblock", label: "Code block", icon: FileCode, run: insertCodeBlock },
    { id: "divider", label: "Divider", icon: Minus, run: insertDivider },
  ],
];

const SHORTCUT: Record<string, string> = { b: "bold", i: "italic", k: "link" };

export function MarkdownEditor({ value, onChange, className }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const run = (action: Action) => {
    const el = ref.current;
    if (!el) return;
    applyEdit(el, action.run(el.value, el.selectionStart, el.selectionEnd), onChange);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      const id = SHORTCUT[e.key.toLowerCase()];
      const action = id && GROUPS.flat().find((a) => a.id === id);
      if (action) {
        e.preventDefault();
        run(action);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.nativeEvent.isComposing && el.selectionStart === el.selectionEnd) {
      const next = continueList(el.value, el.selectionStart);
      if (next) {
        e.preventDefault();
        applyEdit(el, next, onChange);
      }
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div role="toolbar" aria-label="Formatting" className="flex flex-shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-1.5 py-1">
        {GROUPS.map((group, gi) => (
          <div key={gi} className={cn("flex flex-shrink-0 items-center gap-0.5", gi > 0 && "ml-1 border-l border-border pl-1")}>
            {group.map((a) => (
              <button
                key={a.id}
                type="button"
                title={a.label}
                aria-label={a.label}
                data-testid={`tb-${a.id}`}
                onMouseDown={(e) => e.preventDefault()}                       // keep the selection in the text
                onClick={() => run(a)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <a.icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        ))}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Markdown text"
        placeholder="Write here… Markdown works: # heading, **bold**, - list, - [ ] checklist, | table |"
        spellCheck
        className="min-h-0 w-full flex-1 resize-none bg-transparent p-3 font-mono text-[13.5px] leading-6 text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
      />
    </div>
  );
}
