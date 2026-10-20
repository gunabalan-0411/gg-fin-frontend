import { useEffect, useState } from "react";
import { ocrApi } from "@/services/api";
import type { PageInk } from "@/types";

/**
 * Where the ink is on the page the user is looking at (for the scan animation). Asked for as soon as the page is on screen, so it is
 * ready when "Extract" is pressed. Never blocks and never fails loudly: without it the page simply shows the plain progress bar.
 */
export function usePageInk(sessionId: string | null, pageIndex: number, ready: boolean): PageInk | null {
  const key = sessionId ? `${sessionId}:${pageIndex}` : "";
  const [state, setState] = useState<{ key: string; ink: PageInk | null }>({ key: "", ink: null });

  useEffect(() => {
    if (!sessionId || !ready) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await ocrApi.pageInk(sessionId, pageIndex);
        const ok = data && data.width > 0 && data.height > 0 && Array.isArray(data.blobs) && typeof data.mask_png_b64 === "string" && data.mask_png_b64 !== "";
        if (!cancelled) setState({ key, ink: ok ? data : null });
      } catch {
        if (!cancelled) setState({ key, ink: null });
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, pageIndex, ready, key]);

  return state.key === key ? state.ink : null;
}
