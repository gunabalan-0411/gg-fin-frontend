import { useCallback, useEffect, useRef, useState } from "react";
import { notesApi } from "@/services/api";
import type { NotePage } from "@/types";

/** saved: on the server · dirty: typed, save pending · saving: request running · error: last save failed · conflict: someone saved first */
export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

export const AUTOSAVE_MS = 800;

function problem(err: any): { status?: number; code?: string; message: string; current?: NotePage } {
  const d = err?.response?.data?.detail;
  if (d && typeof d === "object") return { status: err.response.status, code: d.code, message: d.message ?? "Could not save", current: d.current };
  return { status: err?.response?.status, message: (typeof d === "string" ? d : err?.message) || "Could not save" };
}

/**
 * The text and title of ONE page while it is being edited, and its saving.
 *  - saves by itself a moment after the last keystroke, one request at a time (each based on the latest version);
 *  - a save that finds the page changed elsewhere (409) is NOT forced: `conflict` holds the other version and the user picks;
 *  - leaving the page (unmount) saves what is pending.
 */
export function useNoteDraft(initial: NotePage, onSaved: (page: NotePage) => void, delayMs = AUTOSAVE_MS) {
  const id = initial.id;
  const [text, setTextState] = useState(initial.content);
  const [title, setTitleState] = useState(initial.title);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [conflict, setConflict] = useState<NotePage | null>(null);

  const textRef = useRef(initial.content);
  const titleRef = useRef(initial.title);
  const version = useRef(initial.version);
  const savedText = useRef(initial.content);
  const savedTitle = useRef(initial.title);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const conflictRef = useRef<NotePage | null>(null);
  const alive = useRef(true);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const pending = () => textRef.current !== savedText.current || titleRef.current !== savedTitle.current;

  const doSave = useCallback(async () => {
    if (conflictRef.current || !pending()) {
      if (alive.current && !conflictRef.current) setStatus("saved");
      return;
    }
    const sentText = textRef.current;
    const sentTitle = titleRef.current;
    const body: { version: number; title?: string; content?: string } = { version: version.current };
    if (sentText !== savedText.current) body.content = sentText;
    if (sentTitle !== savedTitle.current) body.title = sentTitle;
    if (alive.current) { setStatus("saving"); setErrorText(null); }
    try {
      const { data } = await notesApi.update(id, body);
      version.current = data.version;
      savedText.current = data.content;
      savedTitle.current = data.title;
      if (titleRef.current === sentTitle && data.title !== sentTitle) {       // the server tidied the title (blank -> Untitled)
        titleRef.current = data.title;
        if (alive.current) setTitleState(data.title);
      }
      onSavedRef.current(data);
      if (!alive.current) return;
      if (pending()) {                                                         // typed while the request was running: its own autosave timer is already counting
        setStatus("dirty");
      } else {
        setStatus("saved");
        setSavedAt(new Date());
      }
    } catch (err) {
      const p = problem(err);
      if (!alive.current) return;
      if (p.status === 409 && p.code === "stale" && p.current) {
        conflictRef.current = p.current;
        setConflict(p.current);
        setStatus("conflict");
      } else {
        setErrorText(p.message);
        setStatus("error");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const enqueue = useCallback(() => {
    chain.current = chain.current.then(doSave, doSave);
    return chain.current;
  }, [doSave]);

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void enqueue(); }, delayMs);
  }

  const touched = () => {
    if (conflictRef.current) return;                                           // nothing is sent until the conflict is settled
    setStatus("dirty");
    setErrorText(null);
    schedule();
  };

  const setText = (v: string) => {
    textRef.current = v;
    setTextState(v);
    touched();
  };

  const setTitle = (v: string) => {
    titleRef.current = v;
    setTitleState(v);
    touched();
  };

  /** Save now (and wait for it): used on blur, on page switch and by "Try again". */
  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    return enqueue();
  }, [enqueue]);

  /** Conflict -> keep what is on screen: it is saved on top of the other version. */
  const keepMine = () => {
    if (!conflictRef.current) return;
    version.current = conflictRef.current.version;
    conflictRef.current = null;
    setConflict(null);
    setStatus("dirty");
    void flush();
  };

  /** Conflict -> take the other version; what was typed here since is dropped. */
  const takeTheirs = () => {
    const c = conflictRef.current;
    if (!c) return;
    conflictRef.current = null;
    version.current = c.version;
    savedText.current = textRef.current = c.content;
    savedTitle.current = titleRef.current = c.title;
    setTextState(c.content);
    setTitleState(c.title);
    setConflict(null);
    setStatus("saved");
    setSavedAt(new Date());
    onSavedRef.current(c);
  };

  // leaving the page saves what is pending (the request outlives the component)
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      if (pending() && !conflictRef.current) void enqueue();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // closing the tab / reloading with something unsaved: the browser asks first
  const unsaved = status !== "saved";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  return { text, title, status, savedAt, errorText, conflict, setText, setTitle, flush, keepMine, takeTheirs };
}
