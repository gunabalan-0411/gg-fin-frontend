// The two ways the TV page talks to the Android app that wraps it (tv-app/). Both are optional: in a normal browser they simply are not there.
//
//   Speech:   a WebView has no speech recognition of its own, so the app exposes `window.GGTV.listen()` and answers by calling
//             `window.__ggtvHeard(text)` (or `window.__ggtvListenEnd()` when nothing was heard). Without the app, the browser's own
//             speech recognition (Chrome) is used; without either, `unsupported` comes back and the page says so.
//   Back key: the app asks `window.__ggtvBack()`; true = the page used it (cleared the search / went home), false = the app may close.

declare global {
  interface Window {
    GGTV?: { listen?: () => void };
    __ggtvHeard?: (text: string) => void;
    __ggtvListenEnd?: () => void;
    __ggtvBack?: () => boolean;
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

const LISTEN_TIMEOUT_MS = 15000;
export const SPEECH_LANG = "ta-IN";

export interface Heard { text: string; unsupported?: boolean }

export function listenOnce(): Promise<Heard> {
  return new Promise((resolve) => {
    let finished = false;
    const done = (h: Heard) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (window.__ggtvHeard === onHeard) delete window.__ggtvHeard;
      if (window.__ggtvListenEnd === onEnd) delete window.__ggtvListenEnd;
      resolve(h);
    };
    const onHeard = (text: string) => done({ text: String(text ?? "").trim() });
    const onEnd = () => done({ text: "" });
    const timer = setTimeout(() => done({ text: "" }), LISTEN_TIMEOUT_MS);

    if (window.GGTV?.listen) {
      window.__ggtvHeard = onHeard;
      window.__ggtvListenEnd = onEnd;
      try { window.GGTV.listen(); } catch { done({ text: "", unsupported: true }); }
      return;
    }
    const Rec = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (Rec) {
      try {
        const rec = new Rec();
        rec.lang = SPEECH_LANG;
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onresult = (e: any) => onHeard(e.results?.[0]?.[0]?.transcript ?? "");
        rec.onerror = onEnd;
        rec.onend = onEnd;
        rec.start();
        return;
      } catch { /* fall through */ }
    }
    done({ text: "", unsupported: true });
  });
}

// ── Back key ──────────────────────────────────────────────────────────────────────────────────────────────
let backHandler: (() => boolean) | null = null;

/** The screen that is showing says what Back does (return true when it did something). Pass null on unmount. */
export function setBackHandler(fn: (() => boolean) | null): void {
  backHandler = fn;
  window.__ggtvBack = () => (backHandler ? backHandler() : false);
}
