// Markdown editing helpers for the Note Pad textarea. Pure functions: (text, selection) -> (new text, new selection), so every
// toolbar button, shortcut and list behaviour is unit-testable without a browser.

export interface Edit {
  value: string;
  start: number;       // selection after the edit
  end: number;
}

const edit = (value: string, start: number, end: number = start): Edit => ({ value, start, end });

// ── inline: **bold**, *italic*, ~~strike~~, `code` ────────────────────────────

/** Wrap the selection in `before`/`after`; wrapping an already wrapped selection takes the markers off again. */
export function wrapSelection(value: string, start: number, end: number, before: string, after: string = before, placeholder = "text"): Edit {
  const selected = value.slice(start, end);

  // italic is one star and bold is two: a run of stars only means "italic" when its length is odd (** bold, *** both)
  const star = before === "*" && after === "*";
  const run = (s: string, from: number, dir: 1 | -1) => { let n = 0; for (let i = from; i >= 0 && i < s.length && s[i] === "*"; i += dir) n++; return n; };
  const italicIn = !star || (run(selected, 0, 1) % 2 === 1 && run(selected, selected.length - 1, -1) % 2 === 1);
  const italicOut = !star || (run(value, start - 1, -1) % 2 === 1 && run(value, end, 1) % 2 === 1);

  // selection itself includes the markers: **bold** selected -> unwrap
  if (italicIn && selected.length >= before.length + after.length && selected.startsWith(before) && selected.endsWith(after)) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return edit(value.slice(0, start) + inner + value.slice(end), start, start + inner.length);
  }
  // the markers sit just outside the selection -> unwrap
  if (italicOut && value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after && start >= before.length) {
    return edit(value.slice(0, start - before.length) + selected + value.slice(end + after.length), start - before.length, end - before.length);
  }
  const body = selected || placeholder;
  const out = value.slice(0, start) + before + body + after + value.slice(end);
  return edit(out, start + before.length, start + before.length + body.length);
}

/** [text](url): the selected text becomes the link text and `url` is selected, ready to be typed over. */
export function insertLink(value: string, start: number, end: number): Edit {
  const text = value.slice(start, end) || "link text";
  const url = "https://";
  const out = value.slice(0, start) + `[${text}](${url})` + value.slice(end);
  const urlStart = start + text.length + 3;
  return edit(out, urlStart, urlStart + url.length);
}

// ── lines: headings, lists, quote ─────────────────────────────────────────────

export type LineKind = "h1" | "h2" | "h3" | "bullet" | "number" | "task" | "quote";

// any block marker at the start of a line (after indentation)
const MARKER = /^(\s*)(#{1,6}[ \t]+|[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+|\d+[.)][ \t]+|>[ \t]?)/;

const PREFIX: Record<LineKind, (n: number) => string> = {
  h1: () => "# ", h2: () => "## ", h3: () => "### ", bullet: () => "- ", number: (n) => `${n}. `, task: () => "- [ ] ", quote: () => "> ",
};

function kindOf(line: string): LineKind | null {
  const m = MARKER.exec(line);
  if (!m) return null;
  const marker = m[2].trim();
  if (marker === "#") return "h1";
  if (marker === "##") return "h2";
  if (marker === "###") return "h3";
  if (/^[-*+]\s*\[[ xX]\]$/.test(marker)) return "task";
  if (/^[-*+]$/.test(marker)) return "bullet";
  if (/^\d+[.)]$/.test(marker)) return "number";
  if (marker === ">") return "quote";
  return null;                                                    // #### and deeper: not one of ours, treated as plain text
}

/**
 * Turn every selected line into `kind` — or, when every non-empty selected line already is, take that marker off again.
 * Other markers on the line are replaced (a bullet becomes a checklist item, a heading becomes a list item …).
 */
export function toggleLines(value: string, start: number, end: number, kind: LineKind): Edit {
  const blockStart = value.lastIndexOf("\n", start - 1) + 1;
  const nl = value.indexOf("\n", end > start ? end - 1 : end);    // a selection ending at a line break does not include the next line
  const blockEnd = nl === -1 ? value.length : nl;
  const lines = value.slice(blockStart, blockEnd).split("\n");

  const filled = lines.filter((l) => l.trim() !== "");
  const allAlready = filled.length > 0 && filled.every((l) => kindOf(l) === kind);

  let n = 0;
  const out = lines.map((line) => {
    if (line.trim() === "" && lines.length > 1) return line;      // blank lines inside a selection stay blank
    const m = MARKER.exec(line);
    const indent = m ? m[1] : /^\s*/.exec(line)![0];
    const rest = m && kindOf(line) !== null ? line.slice(m[0].length) : line.slice(indent.length);
    if (allAlready) return indent + rest;
    n += 1;
    return indent + PREFIX[kind](n) + rest;
  });

  const text = out.join("\n");
  const next = value.slice(0, blockStart) + text + value.slice(blockEnd);
  if (start === end) {                                            // caret: keep it where the text is
    const delta = text.length - (blockEnd - blockStart);
    return edit(next, Math.max(blockStart, start + delta));
  }
  return edit(next, blockStart, blockStart + text.length);
}

// ── blocks ────────────────────────────────────────────────────────────────────

/** Put a block on its own paragraph (blank line before and after), replacing the selection. */
function block(value: string, start: number, end: number, text: string, selStart: number, selEnd: number): Edit {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const tail = after === "" || after.startsWith("\n\n") ? (after === "" ? "\n" : "") : after.startsWith("\n") ? "\n" : "\n\n";
  const out = before + lead + text + tail + after;
  const base = before.length + lead.length;
  return edit(out, base + selStart, base + selEnd);
}

export function insertTable(value: string, start: number, end: number): Edit {
  const t = "| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |";
  return block(value, start, end, t, 2, 10);                       // "Column 1" selected
}

export function insertDivider(value: string, start: number, end: number): Edit {
  const e = block(value, start, end, "---", 3, 3);
  return edit(e.value, e.end + 1 > e.value.length ? e.end : e.end + 1);   // caret on the line after the rule
}

/** ``` fences around the selection (or an empty block, caret inside). */
export function insertCodeBlock(value: string, start: number, end: number): Edit {
  const selected = value.slice(start, end);
  if (selected) return block(value, start, end, "```\n" + selected + "\n```", 4, 4 + selected.length);
  return block(value, start, end, "```\n\n```", 4, 4);
}

// ── Enter in a list ───────────────────────────────────────────────────────────

const LIST_LINE = /^(\s*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?/;

/**
 * Enter inside a list item continues the list (next bullet / number / unchecked box); Enter on an EMPTY item ends the list.
 * Returns null when the caret is not at the end of a list line (the browser's normal Enter then applies).
 */
export function continueList(value: string, caret: number): Edit | null {
  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const lineEnd = value.indexOf("\n", caret);
  const end = lineEnd === -1 ? value.length : lineEnd;
  if (caret !== end) return null;                                  // only when typing at the end of the line
  const line = value.slice(lineStart, end);
  const m = LIST_LINE.exec(line);
  if (!m) return null;

  const content = line.slice(m[0].length);
  if (content.trim() === "") {                                      // empty item: leave the list, keep the indentation level out
    const out = value.slice(0, lineStart) + value.slice(end);
    return edit(out, lineStart);
  }
  const [, indent, marker, space, task] = m;
  const nextMarker = /^\d/.test(marker) ? `${parseInt(marker, 10) + 1}${marker.slice(-1)}` : marker;
  const insert = "\n" + indent + nextMarker + space + (task ? "[ ] " : "");
  const out = value.slice(0, caret) + insert + value.slice(caret);
  return edit(out, caret + insert.length);
}

// ── checklist items shown in the preview ──────────────────────────────────────

const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\]/;

/** Line numbers (0-based) of the task-list items, skipping fenced code blocks. */
export function taskLines(value: string): number[] {
  const out: number[] = [];
  let fence: string | null = null;
  value.split("\n").forEach((line, i) => {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence === null && TASK_LINE.test(line)) out.push(i);
  });
  return out;
}

/** Tick / untick the n-th checklist item (document order) — used when a box is clicked in the preview. */
export function toggleTask(value: string, ordinal: number): string {
  const line = taskLines(value)[ordinal];
  if (line === undefined) return value;
  const lines = value.split("\n");
  lines[line] = lines[line].replace(TASK_LINE, (_m, lead: string, mark: string) => `${lead}[${mark === " " ? "x" : " "}]`);
  return lines.join("\n");
}

// ── misc ──────────────────────────────────────────────────────────────────────

export const wordCount = (value: string): number => (value.trim() ? value.trim().split(/\s+/).length : 0);

/** A file name for "Download .md" from the page title. */
export function fileNameFor(title: string): string {
  const slug = title.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-").slice(0, 60);
  return `${slug || "note"}.md`;
}
