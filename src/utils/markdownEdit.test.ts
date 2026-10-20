import { describe, expect, it } from "vitest";
import {
  continueList, fileNameFor, insertCodeBlock, insertDivider, insertLink, insertTable, taskLines, toggleLines, toggleTask,
  wordCount, wrapSelection,
} from "./markdownEdit";

const sel = (e: { value: string; start: number; end: number }) => e.value.slice(e.start, e.end);

describe("wrapSelection (bold, italic, strike, code)", () => {
  it("wraps the selection and keeps it selected", () => {
    const e = wrapSelection("say hello now", 4, 9, "**");
    expect(e.value).toBe("say **hello** now");
    expect(sel(e)).toBe("hello");
  });

  it("with nothing selected it inserts a placeholder and selects it, ready to be typed over", () => {
    const e = wrapSelection("ab", 1, 1, "*", "*", "text");
    expect(e.value).toBe("a*text*b");
    expect(sel(e)).toBe("text");
  });

  it("wrapping twice takes the markers off again (selection inside the markers)", () => {
    const once = wrapSelection("hello", 0, 5, "**");
    const twice = wrapSelection(once.value, once.start, once.end, "**");
    expect(twice.value).toBe("hello");
    expect(sel(twice)).toBe("hello");
  });

  it("takes the markers off when the selection includes them", () => {
    const e = wrapSelection("a **b** c", 2, 7, "**");
    expect(e.value).toBe("a b c");
    expect(sel(e)).toBe("b");
  });

  it("works for different opening and closing markers", () => {
    expect(wrapSelection("x", 0, 1, "~~").value).toBe("~~x~~");
    expect(wrapSelection("x", 0, 1, "`").value).toBe("`x`");
  });

  it("italic on bold text adds a star pair (***both***) instead of stripping the bold, and toggles back", () => {
    const both = wrapSelection("**word**", 2, 6, "*");
    expect(both.value).toBe("***word***");
    expect(sel(both)).toBe("word");
    const back = wrapSelection(both.value, both.start, both.end, "*");
    expect(back.value).toBe("**word**");
    // and the selection including the markers behaves the same way
    expect(wrapSelection("**word**", 0, 8, "*").value).toBe("***word***");
    expect(wrapSelection("***word***", 0, 10, "*").value).toBe("**word**");
  });

  it("bold on italic text adds the pair too", () => {
    expect(wrapSelection("*word*", 1, 5, "**").value).toBe("***word***");
  });

  it("a marker at the very start of the text is not mistaken for 'already wrapped'", () => {
    expect(wrapSelection("hello", 0, 5, "**").value).toBe("**hello**");
  });
});

describe("insertLink", () => {
  it("uses the selection as the link text and selects the address", () => {
    const e = insertLink("see docs here", 4, 8);
    expect(e.value).toBe("see [docs](https://) here");
    expect(sel(e)).toBe("https://");
  });
  it("with nothing selected it makes a placeholder link", () => {
    const e = insertLink("", 0, 0);
    expect(e.value).toBe("[link text](https://)");
    expect(sel(e)).toBe("https://");
  });
});

describe("toggleLines (headings, lists, checklist, quote)", () => {
  it("makes the caret line a heading, and the same button again removes it", () => {
    const a = toggleLines("Title\nbody", 2, 2, "h2");
    expect(a.value).toBe("## Title\nbody");
    const b = toggleLines(a.value, a.start, a.end, "h2");
    expect(b.value).toBe("Title\nbody");
  });

  it("a different heading level replaces the old one", () => {
    expect(toggleLines("# Title", 0, 0, "h3").value).toBe("### Title");
  });

  it("bullets every selected line, leaving blank lines alone, and removes them again only when ALL have it", () => {
    const text = "one\n\ntwo\nthree";
    const a = toggleLines(text, 0, text.length, "bullet");
    expect(a.value).toBe("- one\n\n- two\n- three");
    expect(toggleLines(a.value, a.start, a.end, "bullet").value).toBe(text);
    const mixed = toggleLines("- one\ntwo", 0, 9, "bullet");
    expect(mixed.value).toBe("- one\n- two");                               // not all had it: the rest get it
  });

  it("numbers lines 1., 2., 3.", () => {
    expect(toggleLines("a\nb\nc", 0, 5, "number").value).toBe("1. a\n2. b\n3. c");
  });

  it("switches between list kinds instead of stacking markers", () => {
    expect(toggleLines("- a\n- b", 0, 7, "task").value).toBe("- [ ] a\n- [ ] b");
    expect(toggleLines("1. a", 0, 4, "bullet").value).toBe("- a");
    expect(toggleLines("# a", 0, 3, "quote").value).toBe("> a");
    expect(toggleLines("- [x] done", 0, 10, "task").value).toBe("done");     // already a checklist item: toggled off
  });

  it("keeps the indentation of nested items", () => {
    expect(toggleLines("  - a", 0, 5, "number").value).toBe("  1. a");
  });

  it("only touches the lines the selection covers", () => {
    const text = "a\nb\nc\nd";
    const e = toggleLines(text, 2, 5, "bullet");                             // b and c
    expect(e.value).toBe("a\n- b\n- c\nd");
  });

  it("a selection that ends right after a line break does not drag the next line in", () => {
    const e = toggleLines("a\nb\n", 0, 2, "bullet");                        // "a\n" selected
    expect(e.value).toBe("- a\nb\n");
  });

  it("an empty line gets a marker to type after", () => {
    const e = toggleLines("x\n\ny", 2, 2, "bullet");
    expect(e.value).toBe("x\n- \ny");
    expect(e.start).toBe(4);
  });

  it("a deeper heading (####) is left alone as plain text", () => {
    expect(toggleLines("#### small", 0, 0, "bullet").value).toBe("- #### small");
  });
});

describe("blocks: table, divider, code block", () => {
  it("a table goes on its own paragraph with 'Column 1' selected", () => {
    const e = insertTable("intro", 5, 5);
    expect(e.value.startsWith("intro\n\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |")).toBe(true);
    expect(sel(e)).toBe("Column 1");
  });

  it("no extra blank lines when the caret is already on a fresh paragraph", () => {
    expect(insertTable("", 0, 0).value.startsWith("| Column 1")).toBe(true);
    expect(insertDivider("a\n\n", 3, 3).value).toBe("a\n\n---\n");
  });

  it("a divider between two paragraphs keeps one blank line each side", () => {
    expect(insertDivider("a\n\nb", 3, 3).value).toBe("a\n\n---\n\nb");
  });

  it("a code block fences the selection, or opens an empty one with the caret inside", () => {
    const wrapped = insertCodeBlock("x = 1", 0, 5);
    expect(wrapped.value).toBe("```\nx = 1\n```\n");
    expect(sel(wrapped)).toBe("x = 1");
    const empty = insertCodeBlock("", 0, 0);
    expect(empty.value).toBe("```\n\n```\n");
    expect(empty.start).toBe(4);
  });
});

describe("continueList (Enter in a list)", () => {
  const at = (text: string) => continueList(text, text.length);

  it("continues a bullet", () => expect(at("- one")?.value).toBe("- one\n- "));
  it("continues a star bullet", () => expect(at("* one")?.value).toBe("* one\n* "));
  it("counts up a numbered list", () => expect(at("3. three")?.value).toBe("3. three\n4. "));
  it("starts the next checklist item unchecked, even after a ticked one", () => expect(at("- [x] done")?.value).toBe("- [x] done\n- [ ] "));
  it("keeps the indentation", () => expect(at("  - nested")?.value).toBe("  - nested\n  - "));
  it("puts the caret after the new marker", () => {
    const e = at("- a")!;
    expect(e.start).toBe(e.value.length);
  });

  it("Enter on an empty item ends the list", () => {
    const e = continueList("- one\n- ", 8)!;
    expect(e.value).toBe("- one\n");
    expect(e.start).toBe(6);
    expect(at("1. ")?.value).toBe("");
  });

  it("only acts at the end of a list line, and not on ordinary text", () => {
    expect(continueList("- one two", 4)).toBeNull();                         // caret in the middle: normal Enter splits the line
    expect(at("just text")).toBeNull();
    expect(at("# heading")).toBeNull();
    expect(at("")).toBeNull();
  });

  it("works on the line the caret is on, not the last one", () => {
    const text = "- a\nplain\n- b";
    const e = continueList(text, 3)!;                                         // end of line 1
    expect(e.value).toBe("- a\n- \nplain\n- b");
  });
});

describe("checklist items in the preview", () => {
  const md = "- [ ] one\n- [x] two\ntext\n1. [ ] three";

  it("finds them in document order", () => expect(taskLines(md)).toEqual([0, 1, 3]));

  it("ignores items inside fenced code blocks", () => {
    const withCode = "- [ ] real\n```\n- [ ] not a task\n```\n- [ ] also real";
    expect(taskLines(withCode)).toEqual([0, 4]);
    expect(toggleTask(withCode, 1)).toBe("- [ ] real\n```\n- [ ] not a task\n```\n- [x] also real");
  });

  it("ticks and unticks the n-th one", () => {
    expect(toggleTask(md, 0)).toBe("- [x] one\n- [x] two\ntext\n1. [ ] three");
    expect(toggleTask(md, 1)).toBe("- [ ] one\n- [ ] two\ntext\n1. [ ] three");
    expect(toggleTask(md, 2)).toBe("- [ ] one\n- [x] two\ntext\n1. [x] three");
  });

  it("an unknown item changes nothing", () => expect(toggleTask(md, 9)).toBe(md));
});

describe("small helpers", () => {
  it("counts words", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  \n ")).toBe(0);
    expect(wordCount("one  two\nthree")).toBe(3);
  });

  it("makes a safe file name from the title", () => {
    expect(fileNameFor("Shopping list")).toBe("Shopping-list.md");
    expect(fileNameFor('a/b\\c:d*e?"f<g>h|i')).toBe("abcdefghi.md");
    expect(fileNameFor("   ")).toBe("note.md");
    expect(fileNameFor("த " + "x".repeat(100)).length).toBeLessThanOrEqual(63);
  });
});
