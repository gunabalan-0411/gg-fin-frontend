/**
 * The radar scan over the page image: what is drawn and when (paintScan), and the component's lifecycle (it starts, fades out when the
 * reading ends, calls onDone once, stops drawing when removed).   RS-06 … RS-10
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { PageInk } from "@/types";
import { DEFAULT_TIMING as C } from "@/utils/radarScan";
import { ScanOverlay, followTarget, paintScan, scrollParentOf, type ScanLayers } from "./ScanOverlay";

type Call = { fn: string; args: any[]; alpha: number };

function fakeContext() {
  const calls: Call[] = [];
  const ctx: any = { globalAlpha: 1, fillStyle: "" };
  for (const fn of ["clearRect", "drawImage", "fillRect", "save", "restore"]) {
    ctx[fn] = (...args: any[]) => { calls.push({ fn, args, alpha: ctx.globalAlpha }); };
  }
  ctx.createLinearGradient = () => ({ addColorStop: () => {} });
  return { ctx: ctx as CanvasRenderingContext2D, calls };
}

const layers: ScanLayers = { ink: "ink" as any, halo: "halo" as any, flash: "flash" as any };
const INK: Pick<PageInk, "width" | "height" | "blobs"> = {
  width: 1000, height: 2000,
  blobs: [[100, 200, 80, 40], [100, 1000, 80, 40], [100, 1800, 80, 40]],            // bottoms at 12 %, 52 %, 92 % of the page
};
const drawn = (calls: Call[]) => calls.filter((c) => c.fn === "drawImage");
const lineRect = (calls: Call[]) => calls.filter((c) => c.fn === "fillRect" && c.args[3] === 2);

describe("paintScan — what is on screen at a moment", () => {
  it("at the start: only the scan line, at the top; no character is lit yet", () => {
    const { ctx, calls } = fakeContext();
    paintScan(ctx, layers, INK, 10, null, 500, 1000);
    expect(drawn(calls)).toHaveLength(0);
    const line = lineRect(calls);
    expect(line).toHaveLength(1);
    expect(line[0].args[1]).toBeLessThan(10);                                        // y just below the top
    expect(line[0].args[2]).toBe(500);                                               // as wide as the page
  });

  it("the line is where the time says, scaled to the canvas height", () => {
    const { ctx, calls } = fakeContext();
    paintScan(ctx, layers, INK, C.sweepMs / 2, null, 500, 1000);
    expect(lineRect(calls)[0].args[1]).toBeCloseTo(500 - 1, 0);
  });

  it("a character lights only after the line has passed it, and nothing below the line is lit", () => {
    const { ctx, calls } = fakeContext();
    paintScan(ctx, layers, INK, C.sweepMs * 0.6, null, 500, 1000);                   // the line is at 60 %: first two characters passed
    const images = drawn(calls);
    const sources = new Set(images.map((c) => c.args[0]));
    expect(sources.has("ink") && sources.has("halo")).toBe(true);
    const ys = new Set(images.map((c) => c.args[2]));                                // source y of the drawn pieces
    expect([...ys].every((y) => y < 1000)).toBe(true);                               // the character at y 1800 is not drawn
    expect(images.some((c) => c.args[2] > 150 && c.args[2] < 210)).toBe(true);       // the character at y 200 is
  });

  it("draws each lit character from its own box, scaled to the canvas (padded by 3 px for the glow)", () => {
    const { ctx, calls } = fakeContext();
    paintScan(ctx, layers, INK, C.sweepMs * 0.25, null, 500, 1000);                  // half size: canvas 500 x 1000 for a 1000 x 2000 mask
    const ink = drawn(calls).find((c) => c.args[0] === "ink")!;
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = ink.args;
    expect([sx, sy, sw, sh]).toEqual([97, 197, 86, 46]);
    expect([dx, dy, dw, dh]).toEqual([48.5, 98.5, 43, 23]);
  });

  it("the ping (bright layer) shows right after the pass and is gone a moment later; the tint stays", () => {
    const pass = C.sweepMs * (0.12 + C.lagFrac);
    const early = fakeContext();
    paintScan(early.ctx, layers, INK, pass + 40, null, 500, 1000);
    expect(drawn(early.calls).some((c) => c.args[0] === "flash")).toBe(true);
    const later = fakeContext();
    paintScan(later.ctx, layers, INK, pass + C.flashMs + 200, null, 500, 1000);
    expect(drawn(later.calls).some((c) => c.args[0] === "flash")).toBe(false);
    expect(drawn(later.calls).some((c) => c.args[0] === "ink")).toBe(true);
  });

  it("the tint fades: older characters are drawn fainter than the one just passed", () => {
    const { ctx, calls } = fakeContext();
    paintScan(ctx, layers, INK, C.sweepMs * 0.98, null, 500, 1000);
    const alphaOf = (srcY: number) => drawn(calls).find((c) => c.args[0] === "ink" && Math.abs(c.args[2] - srcY) < 5)?.alpha ?? 0;
    expect(alphaOf(197)).toBeGreaterThan(0);                                         // the first character is still faintly lit
    expect(alphaOf(997)).toBeGreaterThan(alphaOf(197));                              // the later one is brighter
  });

  it("while the line rests off the page nothing is drawn for it, but the lit characters keep fading", () => {
    const { ctx, calls } = fakeContext();
    paintScan(ctx, layers, INK, C.sweepMs + 100, null, 500, 1000);
    expect(lineRect(calls)).toHaveLength(0);
    expect(drawn(calls).length).toBeGreaterThan(0);
  });

  it("the next sweep starts again from the top and re-lights what it passes", () => {
    const { ctx, calls } = fakeContext();
    paintScan(ctx, layers, INK, C.sweepMs + C.pauseMs + 30, null, 500, 1000);
    expect(lineRect(calls)[0].args[1]).toBeLessThan(15);
  });

  it("after the reading finished it fades out together, then draws nothing at all", () => {
    const half = fakeContext();
    paintScan(half.ctx, layers, INK, C.sweepMs * 0.6, C.fadeOutMs / 2, 500, 1000);
    const full = fakeContext();
    paintScan(full.ctx, layers, INK, C.sweepMs * 0.6, 0, 500, 1000);
    const a = (r: ReturnType<typeof fakeContext>) => drawn(r.calls).find((c) => c.args[0] === "ink")!.alpha;
    expect(a(half)).toBeCloseTo(a(full) / 2, 5);
    const gone = fakeContext();
    paintScan(gone.ctx, layers, INK, C.sweepMs * 0.6, C.fadeOutMs, 500, 1000);
    expect(gone.calls.filter((c) => c.fn !== "clearRect")).toHaveLength(0);
  });

  it("without the tinted layers (could not be built) the line is still drawn and nothing breaks", () => {
    const { ctx, calls } = fakeContext();
    paintScan(ctx, null, INK, C.sweepMs * 0.6, null, 500, 1000);
    expect(drawn(calls)).toHaveLength(0);
    expect(lineRect(calls)).toHaveLength(1);
  });

  it("a page with no ink still shows the scan line", () => {
    const { ctx, calls } = fakeContext();
    paintScan(ctx, layers, { width: 100, height: 100, blobs: [] }, 500, null, 100, 100);
    expect(drawn(calls)).toHaveLength(0);
    expect(lineRect(calls)).toHaveLength(1);
  });

  it("an empty canvas is left alone", () => {
    const { ctx, calls } = fakeContext();
    paintScan(ctx, layers, INK, 100, null, 0, 0);
    expect(calls.filter((c) => c.fn !== "clearRect")).toHaveLength(0);
  });
});

// ── the component ──────────────────────────────────────────────────────────────────────────────────────────
describe("ScanOverlay (the component)", () => {
  const ink: PageInk = { width: 1000, height: 2000, mask_png_b64: "AAAA", blobs: INK.blobs, coverage: 0.05 };
  let calls: Call[];
  let original: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const f = fakeContext();
    calls = f.calls;
    original = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as any).getContext = () => f.ctx;
    Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
    Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get: () => 800 });
  });
  afterEach(() => {
    vi.useRealTimers();
    (HTMLCanvasElement.prototype as any).getContext = original;
    delete (HTMLCanvasElement.prototype as any).clientWidth;
    delete (HTMLCanvasElement.prototype as any).clientHeight;
  });

  const frames = (ms: number) => vi.advanceTimersByTime(ms);

  it("is a decorative canvas over the image: it does not take clicks and is hidden from screen readers", () => {
    const { getByTestId } = render(<ScanOverlay ink={ink} active />);
    const c = getByTestId("scan-overlay");
    expect(c.tagName).toBe("CANVAS");
    expect(c).toHaveAttribute("aria-hidden", "true");
    expect(c.className).toContain("pointer-events-none");
    expect(c.className).toContain("absolute");
  });

  it("paints the scan line frame after frame while the page is being read", () => {
    render(<ScanOverlay ink={ink} active />);
    frames(400);
    const ys = lineRect(calls).map((c) => c.args[1]);
    expect(ys.length).toBeGreaterThan(5);
    expect(ys[ys.length - 1]).toBeGreaterThan(ys[0]);                                // moving down
  });

  it("keeps sweeping (loops) for as long as the reading goes on, and does not call onDone", () => {
    const onDone = vi.fn();
    render(<ScanOverlay ink={ink} active onDone={onDone} />);
    frames(C.sweepMs * 3);
    expect(onDone).not.toHaveBeenCalled();
    const ys = lineRect(calls).map((c) => c.args[1]);
    expect(Math.min(...ys.slice(-30))).toBeLessThan(800);                            // it came back to the top after the first sweep
  });

  it("when the reading ends it fades out and calls onDone exactly once, then stops drawing", () => {
    const onDone = vi.fn();
    const { rerender } = render(<ScanOverlay ink={ink} active onDone={onDone} />);
    frames(500);
    rerender(<ScanOverlay ink={ink} active={false} onDone={onDone} />);
    frames(C.fadeOutMs / 2);
    expect(onDone).not.toHaveBeenCalled();                                          // still fading
    frames(C.fadeOutMs);
    expect(onDone).toHaveBeenCalledTimes(1);
    const n = calls.length;
    frames(1000);
    expect(calls.length).toBe(n);                                                    // no more frames after it is done
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("stops painting when removed from the page", () => {
    const { unmount } = render(<ScanOverlay ink={ink} active />);
    frames(200);
    unmount();
    const n = calls.length;
    frames(1000);
    expect(calls.length).toBe(n);
  });

  it("where a canvas cannot be drawn on it reports done at once instead of waiting forever", () => {
    (HTMLCanvasElement.prototype as any).getContext = () => null;
    const onDone = vi.fn();
    render(<ScanOverlay ink={ink} active onDone={onDone} />);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("sizes its drawing to the box it covers (so it follows zoom and resize)", () => {
    const { getByTestId } = render(<ScanOverlay ink={ink} active />);
    frames(50);
    const c = getByTestId("scan-overlay") as HTMLCanvasElement;
    expect([c.width, c.height]).toEqual([400, 800]);                                 // clientWidth x clientHeight at devicePixelRatio 1
  });
});

// ── following the line in a pane that is shorter than the page (RS-10) ───────────────────────────────────────
describe("followTarget — where the pane should be scrolled", () => {
  it("keeps the line about 55 % down the pane, never past the ends", () => {
    expect(followTarget(0.5, 0, 2000, 600, 1400)).toBe(1000 - 330);                 // line at 1000 px, pane 600 tall
    expect(followTarget(0.0, 0, 2000, 600, 1400)).toBe(0);                          // at the top: not negative
    expect(followTarget(1.0, 0, 2000, 600, 1400)).toBe(1400);                       // at the bottom: not beyond the end
  });
  it("counts the space above the page inside the pane", () => {
    expect(followTarget(0.5, 100, 2000, 600, 1500)).toBe(1100 - 330);
  });
  it("goes back to the top while the line rests", () => expect(followTarget(null, 0, 2000, 600, 1400)).toBe(0));
});

describe("ScanOverlay scrolls its pane to follow the line", () => {
  let saved: any;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    saved = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as any).getContext = () => fakeContext().ctx;
    Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
    Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get: () => 2000 });
    HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { top: 0 - ((this.parentElement?.parentElement as any)?.scrollTop ?? 0), left: 0, width: 400, height: 2000, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect; };
  });
  afterEach(() => {
    vi.useRealTimers();
    (HTMLCanvasElement.prototype as any).getContext = saved;
    delete (HTMLCanvasElement.prototype as any).clientWidth;
    delete (HTMLCanvasElement.prototype as any).clientHeight;
    delete (HTMLCanvasElement.prototype as any).getBoundingClientRect;
  });

  const ink: PageInk = { width: 1000, height: 2000, mask_png_b64: "AAAA", blobs: [], coverage: 0 };

  function mountInPane(clientHeight = 600, scrollHeight = 2000) {
    const pane = document.createElement("div");
    pane.style.overflowY = "auto";
    Object.defineProperty(pane, "clientHeight", { configurable: true, get: () => clientHeight });
    Object.defineProperty(pane, "scrollHeight", { configurable: true, get: () => scrollHeight });
    pane.getBoundingClientRect = () => ({ top: 0, left: 0, width: 400, height: clientHeight, bottom: clientHeight, right: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    document.body.appendChild(pane);
    const holder = document.createElement("div");
    pane.appendChild(holder);
    const utils = render(<ScanOverlay ink={ink} active />, { container: holder });
    return { pane, holder, ...utils, cleanup: () => pane.remove() };
  }

  it("scrollParentOf finds the nearest scrolling ancestor, and null when nothing scrolls", () => {
    const { pane, getByTestId, cleanup } = mountInPane();
    expect(scrollParentOf(getByTestId("scan-overlay"))).toBe(pane);
    cleanup();
    const lone = render(<ScanOverlay ink={ink} active />);
    expect(scrollParentOf(lone.getByTestId("scan-overlay"))).toBeNull();
    const fits = document.createElement("div");
    fits.style.overflowY = "auto";
    Object.defineProperty(fits, "clientHeight", { configurable: true, get: () => 800 });
    Object.defineProperty(fits, "scrollHeight", { configurable: true, get: () => 800 });
    document.body.appendChild(fits);
    const inner = render(<ScanOverlay ink={ink} active />, { container: fits.appendChild(document.createElement("div")) });
    expect(scrollParentOf(inner.getByTestId("scan-overlay"))).toBeNull();            // a pane that is not taller than its content needs no following
    fits.remove();
  });

  it("scrolls down with the line during the sweep (eased, and never past the end)", () => {
    const { pane, cleanup } = mountInPane();
    vi.advanceTimersByTime(C.sweepMs * 0.5);
    const mid = pane.scrollTop;
    expect(mid).toBeGreaterThan(300);                                                 // the line is at 1000 px of 2000: the pane has followed
    vi.advanceTimersByTime(C.sweepMs * 0.45);
    expect(pane.scrollTop).toBeGreaterThan(mid);
    expect(pane.scrollTop).toBeLessThanOrEqual(1400);
    cleanup();
  });

  it("eases back to the top while the line rests before the next sweep", () => {
    const { pane, cleanup } = mountInPane();
    vi.advanceTimersByTime(C.sweepMs * 0.98);
    expect(pane.scrollTop).toBeGreaterThan(800);
    vi.advanceTimersByTime(C.pauseMs + 100);
    expect(pane.scrollTop).toBeLessThan(400);
    cleanup();
  });

  it("never jumps: going back to the top at the end of a sweep is spread over many frames", () => {
    const { pane, cleanup } = mountInPane();
    vi.advanceTimersByTime(C.sweepMs * 0.99);
    let last = pane.scrollTop, biggest = 0;
    for (let i = 0; i < 60; i++) {
      vi.advanceTimersByTime(16);
      biggest = Math.max(biggest, Math.abs(pane.scrollTop - last));
      last = pane.scrollTop;
    }
    expect(biggest).toBeLessThan(400);                                                // not the 1000+ px a straight jump would be
    expect(pane.scrollTop).toBeLessThan(300);                                         // but it did get back to the top
    cleanup();
  });

  it.each(["wheel", "touchstart", "pointerdown", "keydown"])("stops following for good as soon as the user uses the pane (%s)", (type) => {
    const { pane, cleanup } = mountInPane();
    vi.advanceTimersByTime(C.sweepMs * 0.3);
    pane.dispatchEvent(new Event(type, { bubbles: true }));
    pane.scrollTop = 123;                                                             // wherever the user left it
    vi.advanceTimersByTime(C.sweepMs * 2);
    expect(pane.scrollTop).toBe(123);
    cleanup();
  });

  it("does not move the pane after the reading has finished", () => {
    const { pane, rerender, cleanup } = mountInPane();
    vi.advanceTimersByTime(C.sweepMs * 0.6);
    rerender(<ScanOverlay ink={ink} active={false} />);
    vi.advanceTimersByTime(50);
    const at = pane.scrollTop;
    vi.advanceTimersByTime(C.fadeOutMs - 100);
    expect(pane.scrollTop).toBe(at);
    cleanup();
  });

  it("removes its listeners when it goes away", () => {
    const { pane, unmount, cleanup } = mountInPane();
    const removed: string[] = [];
    const orig = pane.removeEventListener.bind(pane);
    pane.removeEventListener = ((t: string, ...r: any[]) => { removed.push(t); return (orig as any)(t, ...r); }) as any;
    unmount();
    expect(removed.sort()).toEqual(["keydown", "pointerdown", "touchstart", "wheel"]);
    cleanup();
  });
});
