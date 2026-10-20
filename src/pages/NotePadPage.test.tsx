/**
 * The Note Pad page: Markdown pages kept on the server. The real page, hooks and editor run; only the network layer is a small
 * in-memory server that behaves like the real one (versions, 409 stale, size and page limits).
 * Covers NP-01 … NP-08 (F5-01 … F5-05, T5-04 … T5-09).
 */
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => {
  type P = { id: number; title: string; content: string; version: number; created_at: string; updated_at: string };
  const db = {
    pages: [] as P[], nextId: 1, updates: [] as { id: number; body: any }[], creates: 0, deletes: [] as number[],
    failNext: null as null | { status: number; detail: any }, failList: false,
    hold: null as null | Promise<void>,                                  // makes the next update wait (a slow connection)
  };
  const err = (status: number, detail: unknown) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { detail } } });
  const now = () => new Date().toISOString();
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const summary = (p: P) => ({ id: p.id, title: p.title, version: p.version, size: bytes(p.content), updated_at: p.updated_at });
  const find = (id: number) => { const p = db.pages.find((x) => x.id === id); if (!p) throw err(404, { code: "not_found", message: "That page no longer exists" }); return p; };
  const api = {
    list: async () => { if (db.failList) throw err(500, "boom"); return { data: db.pages.map(summary) }; },
    get: async (id: number) => ({ data: { ...find(id) } }),
    create: async (body: { title?: string; content?: string }) => {
      db.creates += 1;
      if (db.pages.length >= 20) throw err(409, { code: "limit_reached", message: "At most 20 pages — delete one to make room" });
      const p = { id: db.nextId++, title: (body.title || "").trim() || "Untitled", content: body.content ?? "", version: 1, created_at: now(), updated_at: now() };
      db.pages.push(p);
      return { data: { ...p } };
    },
    update: async (id: number, body: { version: number; title?: string; content?: string }) => {
      db.updates.push({ id, body });
      if (db.hold) { const wait = db.hold; db.hold = null; await wait; }
      if (db.failNext) { const f = db.failNext; db.failNext = null; throw err(f.status, f.detail); }
      const p = find(id);
      if (body.version !== p.version) throw err(409, { code: "stale", message: "changed elsewhere", current: { ...p } });
      if (body.content !== undefined && bytes(body.content) > 200_000) throw err(422, { code: "too_large", message: "A page can hold at most 200 KB of text" });
      if (body.title !== undefined) p.title = body.title.split(/\s+/).filter(Boolean).join(" ") || "Untitled";
      if (body.content !== undefined) p.content = body.content;
      p.version += 1; p.updated_at = now();
      return { data: { ...p } };
    },
    remove: async (id: number) => { find(id); db.pages = db.pages.filter((x) => x.id !== id); db.deletes.push(id); return { data: null }; },
  };
  const add = (title: string, content = "") => { const p = { id: db.nextId++, title, content, version: 1, created_at: now(), updated_at: now() }; db.pages.push(p); return p; };
  /** someone else (another device) saves this page */
  const elsewhere = (id: number, content: string) => { const p = find(id); p.content = content; p.version += 1; };
  return { db, api, add, elsewhere };
});

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/services/api", () => ({ notesApi: h.api }));

import toast from "react-hot-toast";
import NotePadPage, { MAX_BYTES, MAX_PAGES } from "./NotePadPage";

function screenOf(kind: "phone" | "tablet" | "desktop") {
  window.matchMedia = ((q: string) => ({
    matches: (kind === "phone" && q.includes("max-width: 767px"))
      || (kind === "tablet" && q.includes("min-width: 768px") && q.includes("max-width: 1023px")),
    media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function mount({ strict = false } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  const page = <QueryClientProvider client={qc}><NotePadPage /></QueryClientProvider>;
  const utils = render(strict ? <StrictMode>{page}</StrictMode> : page);
  return { user, qc, ...utils };
}

/** let the 800 ms autosave fire and its request finish */
const settle = async (ms = 900) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const editor = () => screen.getByRole("textbox", { name: "Markdown text" }) as HTMLTextAreaElement;
const titleInput = () => screen.getByRole("textbox", { name: "Page title" }) as HTMLInputElement;
const status = () => screen.getByTestId("save-status").textContent ?? "";
const open = async () => { await screen.findByTestId("notepad"); await screen.findByRole("textbox", { name: "Page title" }); };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  localStorage.clear();
  screenOf("desktop");
  Object.assign(h.db, { pages: [], nextId: 1, updates: [], creates: 0, deletes: [], failNext: null, failList: false, hold: null });
});
afterEach(() => { vi.useRealTimers(); });

// ── NP-01: pages ──────────────────────────────────────────────────────────────────────────────────────────
describe("pages and tabs (NP-01, NP-02)", () => {
  it("shows an empty state with a button that creates the first page and puts the caret in its title", async () => {
    const { user } = mount();
    expect(await screen.findByTestId("notepad-empty")).toHaveTextContent("No pages yet");
    await user.click(screen.getByRole("button", { name: /Create your first page/ }));
    await open();
    expect(h.db.creates).toBe(1);
    expect(titleInput()).toHaveValue("Untitled");
    expect(titleInput()).toHaveFocus();
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.queryByTestId("notepad-empty")).toBeNull();
  });

  it("lists every page as a tab, opens the first one, and shows how many of 20 are used", async () => {
    h.add("Shopping", "- [ ] milk"); h.add("Ideas", "# Big idea"); h.add("Todo");
    mount();
    await open();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Shopping", "Ideas", "Todo"]);
    expect(screen.getByRole("tab", { name: "Shopping" })).toHaveAttribute("aria-selected", "true");
    expect(editor()).toHaveValue("- [ ] milk");
    expect(titleInput()).toHaveValue("Shopping");
    expect(screen.getByTestId("page-count")).toHaveTextContent(`3 of ${MAX_PAGES} pages`);
  });

  it("clicking a tab opens that page, and the choice is remembered on this device", async () => {
    h.add("Shopping", "one"); h.add("Ideas", "two");
    const first = mount();
    await open();
    await first.user.click(screen.getByRole("tab", { name: "Ideas" }));
    expect(await screen.findByDisplayValue("two")).toBeInTheDocument();
    expect(localStorage.getItem("gg_notepad_page")).toBe("2");
    first.unmount();

    mount();                                                                  // a later visit
    await open();
    expect(screen.getByRole("tab", { name: "Ideas" })).toHaveAttribute("aria-selected", "true");
    expect(editor()).toHaveValue("two");
  });

  it("a remembered page that no longer exists falls back to the first one", async () => {
    h.add("Shopping", "one");
    localStorage.setItem("gg_notepad_page", "99");
    mount();
    await open();
    expect(screen.getByRole("tab", { name: "Shopping" })).toHaveAttribute("aria-selected", "true");
  });

  it("the + button adds a page; at 20 pages it is disabled and says why", async () => {
    for (let i = 0; i < MAX_PAGES - 1; i++) h.add(`P${i}`);
    const { user } = mount();
    await open();
    await user.click(screen.getByTestId("new-page"));
    await screen.findByTestId(`page-tab-${MAX_PAGES}`);
    expect(screen.getAllByRole("tab")).toHaveLength(MAX_PAGES);
    expect(screen.getByTestId("new-page")).toBeDisabled();
    expect(screen.getByTestId("new-page")).toHaveAttribute("title", expect.stringContaining("At most 20 pages"));
    expect(screen.getByTestId("page-count")).toHaveTextContent("20 of 20 pages — delete one to add another");
  });

  it("when the server refuses a page (limit reached elsewhere) the user is told", async () => {
    h.add("Only");
    const { user } = mount();
    await open();
    for (let i = 0; i < MAX_PAGES; i++) h.add(`Other${i}`);                    // filled up on another device meanwhile
    await user.click(screen.getByTestId("new-page"));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(toast.error).toHaveBeenCalledWith("At most 20 pages — delete one to make room");
  });

  it("a long title is cut off in the tab but kept in full as the tooltip", async () => {
    h.add("A very long page title that does not fit in a tab at all");
    mount();
    await open();
    expect(screen.getByRole("tab")).toHaveAttribute("title", "A very long page title that does not fit in a tab at all");
  });

  it("a list that cannot be loaded says so instead of showing an empty Note Pad", async () => {
    h.db.failList = true;
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the Note Pad");
    expect(screen.queryByTestId("notepad-empty")).toBeNull();
  });
});

// ── NP-03: autosave ───────────────────────────────────────────────────────────────────────────────────────
describe("autosave (NP-03)", () => {
  it("saves a moment after the last keystroke, once — not on every key", async () => {
    h.add("Notes", "start");
    const { user } = mount();
    await open();
    await user.type(editor(), " more text");
    expect(status()).toMatch(/Unsaved/);
    await settle(500);
    expect(h.db.updates).toHaveLength(0);                                      // still inside the pause
    await settle(500);
    expect(h.db.updates).toHaveLength(1);
    expect(h.db.updates[0]).toEqual({ id: 1, body: { version: 1, content: "start more text" } });
    expect(status()).toMatch(/Saved/);
    expect(h.db.pages[0].content).toBe("start more text");
  });

  it("nothing is sent when nothing changed", async () => {
    h.add("Notes", "same");
    mount();
    await open();
    await settle(3000);
    expect(h.db.updates).toHaveLength(0);
    expect(status()).toMatch(/Saved/);
  });

  it("typing, then undoing back to the saved text, sends nothing", async () => {
    h.add("Notes", "abc");
    const { user } = mount();
    await open();
    await user.type(editor(), "d{Backspace}");
    await settle();
    expect(h.db.updates).toHaveLength(0);
  });

  it("keystrokes typed while a save is running are saved next, on the new version", async () => {
    h.add("Notes", "");
    const { user } = mount();
    await open();
    await user.type(editor(), "one");
    await settle();
    await user.type(editor(), " two");
    await settle();
    expect(h.db.updates.map((u) => u.body)).toEqual([{ version: 1, content: "one" }, { version: 2, content: "one two" }]);
    expect(h.db.pages[0].version).toBe(3);
  });

  it("text typed WHILE a save is still running is not lost: it is saved right after, on the new version", async () => {
    h.add("Notes", "");
    let release!: () => void;
    h.db.hold = new Promise<void>((r) => { release = r; });
    const { user } = mount();
    await open();
    await user.type(editor(), "one");
    await settle();                                                           // the first request is now in flight (held)
    expect(h.db.updates).toHaveLength(1);
    expect(status()).toMatch(/Saving/);
    await user.type(editor(), " two");                                        // typed during the request
    release();
    await settle(50);
    expect(status()).toMatch(/Unsaved/);                                      // the first save is done, the new text is not
    await settle(2000);
    expect(h.db.updates.map((u) => u.body)).toEqual([{ version: 1, content: "one" }, { version: 2, content: "one two" }]);
    expect(h.db.pages[0].content).toBe("one two");
    expect(status()).toMatch(/Saved/);
  });

  it("renaming saves the title (and only the title) and updates the tab", async () => {
    h.add("Old name", "body");
    const { user } = mount();
    await open();
    await user.clear(titleInput());
    await user.type(titleInput(), "New name");
    await settle();
    expect(h.db.updates.at(-1)!.body).toEqual({ version: 1, title: "New name" });
    expect(screen.getByRole("tab", { name: "New name" })).toBeInTheDocument();
  });

  it("a blank title becomes 'Untitled', as the server tidies it", async () => {
    h.add("Something");
    const { user } = mount();
    await open();
    await user.clear(titleInput());
    await settle();
    expect(titleInput()).toHaveValue("Untitled");
    expect(screen.getByRole("tab", { name: "Untitled" })).toBeInTheDocument();
  });

  it("title and text changed together are one save", async () => {
    h.add("A", "x");
    const { user } = mount();
    await open();
    await user.type(editor(), "y");
    await user.type(titleInput(), "B");
    await settle();
    expect(h.db.updates).toHaveLength(1);
    expect(h.db.updates[0].body).toEqual({ version: 1, title: "AB", content: "xy" });
  });

  it("leaving the page (another tab) saves what is pending at once, without waiting for the pause", async () => {
    h.add("One", "a"); h.add("Two", "b");
    const { user } = mount();
    await open();
    await user.type(editor(), "!");
    await user.click(screen.getByRole("tab", { name: "Two" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(h.db.updates).toHaveLength(1);
    expect(h.db.updates[0]).toEqual({ id: 1, body: { version: 1, content: "a!" } });
    expect(h.db.pages[0].content).toBe("a!");
    expect(await screen.findByDisplayValue("b")).toBeInTheDocument();
  });

  it("leaving the Note Pad (unmount) saves what is pending too", async () => {
    h.add("One", "a");
    const { user, unmount } = mount();
    await open();
    await user.type(editor(), "z");
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(h.db.pages[0].content).toBe("az");
  });

  it("the browser asks before the tab is closed with unsaved text, and not otherwise", async () => {
    h.add("One", "a");
    const { user } = mount();
    await open();
    const ev = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(ev()).toBe(false);
    await user.type(editor(), "b");
    expect(ev()).toBe(true);
    await settle();
    expect(ev()).toBe(false);
  });
});

// ── NP-04: a failed or refused save ───────────────────────────────────────────────────────────────────────
describe("failed saves (NP-04)", () => {
  it("a failed save keeps the text, says so, and 'Try again' saves it", async () => {
    h.add("Notes", "a");
    h.db.failNext = { status: 500, detail: "database down" };
    const { user } = mount();
    await open();
    await user.type(editor(), "b");
    await settle();
    expect(screen.getByTestId("error-banner")).toHaveTextContent("database down. Your text is still here.");
    expect(status()).toMatch(/Not saved/);
    expect(editor()).toHaveValue("ab");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(h.db.pages[0].content).toBe("ab");
    expect(screen.queryByTestId("error-banner")).toBeNull();
    expect(status()).toMatch(/Saved/);
  });

  it("typing after a failure retries by itself with the next autosave", async () => {
    h.add("Notes", "a");
    h.db.failNext = { status: 500, detail: "blip" };
    const { user } = mount();
    await open();
    await user.type(editor(), "b");
    await settle();
    await user.type(editor(), "c");
    await settle();
    expect(h.db.pages[0].content).toBe("abc");
    expect(screen.queryByTestId("error-banner")).toBeNull();
  });

  it("a page that is too long is refused with the server's message, and nothing is lost", async () => {
    h.add("Big", "");
    h.db.failNext = { status: 422, detail: { code: "too_large", message: "A page can hold at most 200 KB of text (this one is 201 KB)" } };
    const { user } = mount();
    await open();
    await user.type(editor(), "x");
    await settle();
    expect(screen.getByTestId("error-banner")).toHaveTextContent("at most 200 KB");
    expect(editor()).toHaveValue("x");
  });
});

// ── NP-05: saved on another device ────────────────────────────────────────────────────────────────────────
describe("page changed on another device (NP-05)", () => {
  async function conflicted() {
    h.add("Shared", "original");
    const ctx = mount();
    await open();
    h.elsewhere(1, "phone version");                                          // saved from the phone
    await ctx.user.type(editor(), " + laptop");
    await settle();
    return ctx;
  }

  it("is never overwritten silently: a banner offers both versions and nothing more is sent meanwhile", async () => {
    await conflicted();
    expect(screen.getByTestId("conflict-banner")).toHaveTextContent("saved somewhere else");
    expect(status()).toMatch(/changed elsewhere/);
    expect(h.db.pages[0].content).toBe("phone version");
    const sent = h.db.updates.length;
    await userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) }).type(editor(), " more");
    await settle(3000);
    expect(h.db.updates.length).toBe(sent);                                    // waiting for the user's choice
  });

  it("'Load the other version' shows it, drops the local edit and leaves the page saved", async () => {
    const { user } = await conflicted();
    await user.click(screen.getByRole("button", { name: "Load the other version" }));
    expect(editor()).toHaveValue("phone version");
    expect(screen.queryByTestId("conflict-banner")).toBeNull();
    expect(status()).toMatch(/Saved/);
    await settle(2000);
    expect(h.db.pages[0].content).toBe("phone version");
    await user.type(editor(), "!");                                           // and editing carries on normally, on the new version
    await settle();
    expect(h.db.pages[0].content).toBe("phone version!");
  });

  it("'Keep mine (overwrite)' saves what is on screen on top of the other version", async () => {
    const { user } = await conflicted();
    await user.click(screen.getByRole("button", { name: "Keep mine (overwrite)" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(h.db.pages[0].content).toBe("original + laptop");
    expect(screen.queryByTestId("conflict-banner")).toBeNull();
    expect(status()).toMatch(/Saved/);
  });

  it("while the choice is open nothing is sent, not even when the title loses focus", async () => {
    const { user } = await conflicted();
    const sent = h.db.updates.length;
    await user.click(titleInput());
    await user.tab();                                                         // blur saves normally — but not now
    await settle(2000);
    expect(h.db.updates.length).toBe(sent);
    expect(h.db.pages[0].content).toBe("phone version");
  });

  it("a rename that finds the page changed elsewhere is held back the same way", async () => {
    h.add("Shared", "x");
    const { user } = mount();
    await open();
    h.elsewhere(1, "other");
    await user.type(titleInput(), "!");
    await settle();
    expect(screen.getByTestId("conflict-banner")).toBeInTheDocument();
    expect(h.db.pages[0].title).toBe("Shared");
  });
});

// ── NP-06: deleting ───────────────────────────────────────────────────────────────────────────────────────
describe("deleting a page (NP-06)", () => {
  it("asks first; Cancel keeps the page", async () => {
    h.add("Keep me", "text");
    const { user } = mount();
    await open();
    await user.click(screen.getByRole("button", { name: "Delete this page" }));
    expect(await screen.findByText(/This cannot be undone/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.db.deletes).toEqual([]);
    expect(screen.getByRole("tab", { name: "Keep me" })).toBeInTheDocument();
  });

  it("deleting removes only that page, opens its neighbour and says so", async () => {
    h.add("One", "1"); h.add("Two", "2"); h.add("Three", "3");
    const { user } = mount();
    await open();
    await user.click(screen.getByRole("tab", { name: "Two" }));
    await screen.findByDisplayValue("2");
    await user.click(screen.getByRole("button", { name: "Delete this page" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(h.db.deletes).toEqual([2]);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["One", "Three"]);
    expect(await screen.findByDisplayValue("3")).toBeInTheDocument();         // the page after it
    expect(toast.success).toHaveBeenCalledWith("Page deleted");
  });

  it("deleting the last tab opens the one before it; deleting the only page shows the empty state", async () => {
    h.add("One", "1"); h.add("Two", "2");
    const { user } = mount();
    await open();
    await user.click(screen.getByRole("tab", { name: "Two" }));
    await screen.findByDisplayValue("2");
    await user.click(screen.getByRole("button", { name: "Delete this page" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByDisplayValue("1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete this page" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByTestId("notepad-empty")).toBeInTheDocument();
  });

  it("typing in a page and deleting it at once does not bring an error up", async () => {
    h.add("Doomed", "x");
    const { user } = mount();
    await open();
    await user.type(editor(), "y");
    await user.click(screen.getByRole("button", { name: "Delete this page" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(await screen.findByTestId("notepad-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("error-banner")).toBeNull();
  });
});

// ── NP-07: views and preview ─────────────────────────────────────────────────────────────────────────────
describe("edit / preview / side by side (NP-07)", () => {
  it("desktop starts side by side: editor and preview together, the preview following the text", async () => {
    h.add("Doc", "# Hello\n\nsome **bold** text");
    const { user } = mount();
    await open();
    expect(editor()).toBeInTheDocument();
    const preview = within(screen.getByTestId("md-preview"));
    expect(preview.getByRole("heading", { level: 1, name: "Hello" })).toBeInTheDocument();
    expect(screen.getByTestId("md-preview").querySelector("strong")).toHaveTextContent("bold");
    await user.type(editor(), "\n\n## Later");
    expect(preview.getByRole("heading", { level: 2, name: "Later" })).toBeInTheDocument();
  });

  it("Edit shows only the editor, Preview only the rendering, and the choice is remembered", async () => {
    h.add("Doc", "# Hello");
    const first = mount();
    await open();
    await first.user.click(screen.getByTestId("view-edit"));
    expect(screen.queryByTestId("md-preview")).toBeNull();
    expect(editor()).toBeInTheDocument();
    await first.user.click(screen.getByTestId("view-preview"));
    expect(screen.queryByRole("textbox", { name: "Markdown text" })).toBeNull();
    expect(screen.getByTestId("md-preview")).toBeInTheDocument();
    expect(screen.getByTestId("view-preview")).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("gg_notepad_view")).toBe("preview");
    first.unmount();

    mount();
    await screen.findByTestId("md-preview");
    expect(screen.queryByRole("textbox", { name: "Markdown text" })).toBeNull();
  });

  it("a phone has no side-by-side button, and a stored 'side by side' choice opens as Edit", async () => {
    screenOf("phone");
    localStorage.setItem("gg_notepad_view", "split");
    h.add("Doc", "text");
    mount();
    await open();
    expect(screen.queryByTestId("view-split")).toBeNull();
    expect(screen.getByTestId("view-edit")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("md-preview")).toBeNull();
  });

  it("an empty page previews as a hint, not as a blank box", async () => {
    h.add("Empty", "");
    mount();
    await open();
    expect(screen.getByTestId("md-preview")).toHaveTextContent("Nothing to preview yet");
  });

  it("renders tables, lists, quotes, code and strikethrough (GitHub-style Markdown)", async () => {
    h.add("Rich", "| a | b |\n|---|---|\n| 1 | 2 |\n\n- one\n- two\n\n1. first\n\n> quote\n\n`code` and ~~gone~~\n\n```\nblock\n```");
    mount();
    await open();
    const p = screen.getByTestId("md-preview");
    expect(p.querySelector("table")).not.toBeNull();
    expect(p.querySelectorAll("th")).toHaveLength(2);
    expect(p.querySelectorAll("ul li")).toHaveLength(2);
    expect(p.querySelector("ol li")).toHaveTextContent("first");
    expect(p.querySelector("blockquote")).toHaveTextContent("quote");
    expect(p.querySelector("del")).toHaveTextContent("gone");
    expect(p.querySelector("pre code")).toHaveTextContent("block");
  });

  it("pasted HTML and scripts are shown as plain text, never run; javascript: links are not links", async () => {
    h.add("Evil", "<script>window.__pwned = 1</script>\n\n<img src=x onerror=\"window.__pwned = 1\">\n\n[click](javascript:window.__pwned=1)\n\n[ok](https://example.com)");
    mount();
    await open();
    const p = screen.getByTestId("md-preview");
    expect(p.querySelector("script")).toBeNull();
    expect(p.querySelector("img")).toBeNull();
    expect((window as any).__pwned).toBeUndefined();
    const links = [...p.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://example.com"]);
    expect(p).toHaveTextContent("click");                                       // the words stay, only the link is gone
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0].getAttribute("rel")).toContain("noopener");
  });

  it("clicking a checklist box in the preview ticks it in the text and saves", async () => {
    h.add("List", "- [ ] milk\n- [x] eggs\n\n```\n- [ ] not a task\n```\n\n- [ ] bread");
    const { user } = mount();
    await open();
    const boxes = within(screen.getByTestId("md-preview")).getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([false, true, false]);
    await user.click(boxes[2]);                                               // bread — the third REAL task, not the one in the code block
    expect(editor()).toHaveValue("- [ ] milk\n- [x] eggs\n\n```\n- [ ] not a task\n```\n\n- [x] bread");
    await settle();
    expect(h.db.pages[0].content).toContain("- [x] bread");
    await user.click(within(screen.getByTestId("md-preview")).getAllByRole("checkbox")[1]);   // untick eggs
    expect(editor().value.startsWith("- [ ] milk\n- [ ] eggs")).toBe(true);
  });

  it("ticking works in React StrictMode too (the app renders everything twice in development)", async () => {
    h.add("List", "- [ ] one\n- [ ] two\n- [ ] three");
    const { user } = mount({ strict: true });
    await open();
    const boxes = within(screen.getByTestId("md-preview")).getAllByRole("checkbox");
    await user.click(boxes[1]);
    expect(editor()).toHaveValue("- [ ] one\n- [x] two\n- [ ] three");
    await user.click(within(screen.getByTestId("md-preview")).getAllByRole("checkbox")[2]);
    expect(editor()).toHaveValue("- [ ] one\n- [x] two\n- [x] three");
  });

  it("the checklist boxes in the preview can be clicked (they are not read-only)", async () => {
    h.add("List", "- [ ] a");
    mount();
    await open();
    expect(within(screen.getByTestId("md-preview")).getByRole("checkbox")).toBeEnabled();
  });
});

// ── NP-08: the editor ────────────────────────────────────────────────────────────────────────────────────
describe("toolbar, shortcuts and lists (NP-08)", () => {
  const select = (from: number, to: number) => { const el = editor(); el.focus(); el.setSelectionRange(from, to); };
  const flushTimers = () => act(async () => { await vi.advanceTimersByTimeAsync(20); });

  it("Bold wraps the selection; pressed again it unwraps", async () => {
    h.add("Doc", "make this bold");
    const { user } = mount();
    await open();
    select(5, 9);
    await user.click(screen.getByTestId("tb-bold"));
    await flushTimers();
    expect(editor()).toHaveValue("make **this** bold");
    await user.click(screen.getByTestId("tb-bold"));
    await flushTimers();
    expect(editor()).toHaveValue("make this bold");
  });

  it("Ctrl+B and Ctrl+I do the same from the keyboard", async () => {
    h.add("Doc", "word");
    mount();
    await open();
    select(0, 4);
    fireEvent.keyDown(editor(), { key: "b", ctrlKey: true });
    await flushTimers();
    expect(editor()).toHaveValue("**word**");
    select(2, 6);
    fireEvent.keyDown(editor(), { key: "i", metaKey: true });
    await flushTimers();
    expect(editor()).toHaveValue("***word***");
  });

  it("headings, bullets, numbers, checklist and quote work on the caret line or on every selected line", async () => {
    h.add("Doc", "one\ntwo");
    const { user } = mount();
    await open();
    select(0, 7);
    await user.click(screen.getByTestId("tb-number"));
    await flushTimers();
    expect(editor()).toHaveValue("1. one\n2. two");
    select(0, 13);
    await user.click(screen.getByTestId("tb-task"));
    await flushTimers();
    expect(editor()).toHaveValue("- [ ] one\n- [ ] two");
    select(0, 0);
    await user.click(screen.getByTestId("tb-h2"));
    await flushTimers();
    expect(editor().value.startsWith("## ")).toBe(true);
  });

  it("table, code block and divider are inserted as their own paragraphs", async () => {
    h.add("Doc", "intro");
    const { user } = mount();
    await open();
    select(5, 5);
    await user.click(screen.getByTestId("tb-table"));
    await flushTimers();
    expect(editor().value).toContain("intro\n\n| Column 1 | Column 2 | Column 3 |");
    expect(within(screen.getByTestId("md-preview")).getByRole("table")).toBeInTheDocument();
  });

  it("the toolbar keeps the text selected and the page unsaved-then-saved like typing does", async () => {
    h.add("Doc", "abc");
    const { user } = mount();
    await open();
    select(0, 3);
    await user.click(screen.getByTestId("tb-italic"));
    await settle();
    expect(h.db.pages[0].content).toBe("*abc*");
  });

  it("Enter at the end of a list item starts the next item; on an empty item it ends the list", async () => {
    h.add("Doc", "- one");
    const { user } = mount();
    await open();
    const el = editor();
    el.focus();
    el.setSelectionRange(5, 5);
    await user.keyboard("{Enter}");
    await flushTimers();
    expect(editor()).toHaveValue("- one\n- ");
    editor().setSelectionRange(8, 8);
    await user.keyboard("{Enter}");
    await flushTimers();
    expect(editor()).toHaveValue("- one\n");
  });

  it("Enter in ordinary text is left to the browser", async () => {
    h.add("Doc", "plain");
    const { user } = mount();
    await open();
    editor().focus();
    editor().setSelectionRange(5, 5);
    await user.keyboard("{Enter}x");
    expect(editor()).toHaveValue("plain\nx");
  });

  it("every toolbar button has a name for screen readers", async () => {
    h.add("Doc");
    mount();
    await open();
    const bar = screen.getByRole("toolbar", { name: "Formatting" });
    const names = within(bar).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toHaveLength(15);
    expect(names.every(Boolean)).toBe(true);
  });
});

// ── size, counts, download ───────────────────────────────────────────────────────────────────────────────
describe("size, counts and download (NP-09)", () => {
  it("shows words, characters and the size against the limit", async () => {
    h.add("Doc", "one two three");
    const { user } = mount();
    await open();
    expect(screen.getByTestId("page-stats")).toHaveTextContent("3 words · 13 characters");
    expect(screen.getByTestId("page-size")).toHaveTextContent("13 B of 200 KB");
    await user.type(editor(), " four");
    expect(screen.getByTestId("page-stats")).toHaveTextContent("4 words · 18 characters");
  });

  it("counts bytes, not characters (Tamil text takes 3 bytes a letter)", async () => {
    h.add("Doc", "த".repeat(1000));
    mount();
    await open();
    expect(screen.getByTestId("page-stats")).toHaveTextContent("1,000 characters");
    expect(screen.getByTestId("page-size")).toHaveTextContent("3.0 KB of 200 KB");
  });

  it("warns near the limit and says it is too long to save beyond it", async () => {
    h.add("Doc", "a".repeat(MAX_BYTES + 5));
    mount();
    await open();
    expect(screen.getByTestId("page-size")).toHaveTextContent("too long to save, shorten it");
  });

  it("Download hands the text over as a .md file named after the page", async () => {
    h.add("Shopping list", "# milk");
    const created: Blob[] = [];
    (URL as any).createObjectURL = vi.fn((b: Blob) => { created.push(b); return "blob:fake"; });
    (URL as any).revokeObjectURL = vi.fn();
    const clicked: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { clicked.push(this.download); };
    try {
      const { user } = mount();
      await open();
      await user.click(screen.getByRole("button", { name: "Download as .md file" }));
      expect(clicked).toEqual(["Shopping-list.md"]);
      expect(created).toHaveLength(1);
      const text = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsText(created[0]); });
      expect(text).toBe("# milk");
    } finally {
      HTMLAnchorElement.prototype.click = orig;
    }
  });
});
