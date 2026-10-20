import { useEffect, useRef } from "react";
import type { PageInk } from "@/types";
import { DEFAULT_TIMING, linePosition, litBlobs, overlayOpacity, type ScanTiming } from "@/utils/radarScan";

// Colours: the brand mint for the scan line, a deeper mint for lit ink (pale mint would vanish on a white page), a mint-white ping.
const LINE_RGB: [number, number, number] = [127, 205, 176];
const TRAIL_RGB: [number, number, number] = [168, 211, 194];
const INK_RGB: [number, number, number] = [26, 158, 118];
const HALO_RGB: [number, number, number] = [168, 211, 194];
const FLASH_RGB: [number, number, number] = [226, 252, 241];

export interface ScanLayers {
  ink: CanvasImageSource;
  halo: CanvasImageSource;
  flash: CanvasImageSource;
}

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/**
 * Draw one frame: the lit characters (halo, ink, ping), then the scan line with its trail. `finishedMs` is null while the page is
 * still being read, and the time since the reading finished afterwards (the overlay fades out). Coordinates of `ink` are scaled to
 * the canvas size, so it follows however the page image is sized or zoomed. Pure with respect to its arguments.
 */
export function paintScan(
  ctx: CanvasRenderingContext2D,
  layers: ScanLayers | null,
  ink: Pick<PageInk, "width" | "height" | "blobs">,
  tMs: number,
  finishedMs: number | null,
  width: number,
  height: number,
  timing: ScanTiming = DEFAULT_TIMING,
) {
  ctx.clearRect(0, 0, width, height);
  const opacity = overlayOpacity(finishedMs, timing);
  if (opacity <= 0 || width <= 0 || height <= 0) return;
  const sx = width / ink.width;
  const sy = height / ink.height;

  if (layers) {
    const pad = 3;
    for (const { blob, glow } of litBlobs(ink.blobs, ink.height, tMs, timing)) {
      const [x, y, w, h] = blob;
      const px = Math.max(0, x - pad), py = Math.max(0, y - pad);
      const sw = Math.min(ink.width, x + w + pad) - px, sh = Math.min(ink.height, y + h + pad) - py;
      if (sw <= 0 || sh <= 0) continue;
      const draw = (layer: CanvasImageSource, alpha: number) => {
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.drawImage(layer, px, py, sw, sh, px * sx, py * sy, sw * sx, sh * sy);
      };
      if (glow.ink > 0.01) { draw(layers.halo, opacity * glow.ink * 0.6); draw(layers.ink, opacity * glow.ink); }
      if (glow.flash > 0.01) draw(layers.flash, opacity * glow.flash * 0.9);
    }
  }

  const pos = linePosition(tMs, timing);
  if (pos !== null) {
    const y = pos * height;
    const trail = Math.max(24, height * 0.12);
    ctx.globalAlpha = opacity;
    const g = ctx.createLinearGradient(0, y - trail, 0, y);
    g.addColorStop(0, rgba(TRAIL_RGB, 0));
    g.addColorStop(1, rgba(TRAIL_RGB, 0.42));
    ctx.fillStyle = g;
    ctx.fillRect(0, y - trail, width, trail);
    const band = Math.max(6, height * 0.006);                                   // soft glow around the line
    const b = ctx.createLinearGradient(0, y - band, 0, y + band);
    b.addColorStop(0, rgba(LINE_RGB, 0));
    b.addColorStop(0.5, rgba(LINE_RGB, 0.55));
    b.addColorStop(1, rgba(LINE_RGB, 0));
    ctx.fillStyle = b;
    ctx.fillRect(0, y - band, width, band * 2);
    ctx.fillStyle = rgba(LINE_RGB, 1);                                          // the line itself
    ctx.fillRect(0, y - 1, width, 2);
  }
  ctx.globalAlpha = 1;
}

/** The nearest ancestor that actually scrolls (the page pane), or null when the whole page fits. */
export function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflowY = getComputedStyle(p).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

/** Where the pane should be scrolled so the line stays in view (about 55 % down the pane); the top while the line rests. */
export function followTarget(linePos: number | null, canvasTopInContent: number, canvasHeight: number, paneHeight: number, maxScroll: number): number {
  if (linePos === null) return 0;
  const lineY = canvasTopInContent + linePos * canvasHeight;
  return Math.min(maxScroll, Math.max(0, lineY - paneHeight * 0.55));
}

/** The mask (white ink on black) as three tinted layers: ink, a soft halo of it, and a bright ping. */
export function buildLayers(mask: CanvasImageSource, width: number, height: number): ScanLayers | null {
  const make = () => {
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    return c;
  };
  const src = make();
  const sctx = src.getContext("2d");
  if (!sctx) return null;
  sctx.drawImage(mask, 0, 0, width, height);
  let data: ImageData;
  try { data = sctx.getImageData(0, 0, width, height); } catch { return null; }
  const tint = (rgb: [number, number, number]) => {
    const out = make();
    const octx = out.getContext("2d");
    if (!octx) return null;
    const img = octx.createImageData(width, height);
    for (let i = 0; i < data.data.length; i += 4) {
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2];
      img.data[i + 3] = data.data[i];                                           // the mask's brightness is the ink's opacity
    }
    octx.putImageData(img, 0, 0);
    return out;
  };
  const inkLayer = tint(INK_RGB), haloBase = tint(HALO_RGB), flash = tint(FLASH_RGB);
  if (!inkLayer || !haloBase || !flash) return null;
  const halo = make();
  const hctx = halo.getContext("2d");
  if (hctx) {
    try { hctx.filter = "blur(3px)"; } catch { /* no filter support: the halo is just a copy */ }
    hctx.drawImage(haloBase, 0, 0);
  }
  return { ink: inkLayer, halo, flash };
}

interface Props {
  ink: PageInk;
  /** true while the page is being read; when it turns false the overlay fades out and calls `onDone` */
  active: boolean;
  onDone?: () => void;
  timing?: ScanTiming;
}

/** A radar scan over the page image: lay it inside a `relative` box that has the image's size. */
export function ScanOverlay({ ink, active, onDone, timing = DEFAULT_TIMING }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layersRef = useRef<ScanLayers | null>(null);
  const finishedAt = useRef<number | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (active) finishedAt.current = null;
    else if (finishedAt.current === null) finishedAt.current = performance.now();
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) layersRef.current = buildLayers(img, ink.width, ink.height); };
    img.src = `data:image/png;base64,${ink.mask_png_b64}`;
    return () => { cancelled = true; layersRef.current = null; };
  }, [ink]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {                                                      // cannot draw here: do not leave the page waiting for a fade-out
      onDoneRef.current?.();
      return;
    }
    const start = performance.now();
    let raf = 0;
    let finished = false;

    // The page is usually taller than its pane: gently scroll the pane so the line stays in view — until the user scrolls themselves.
    const pane = scrollParentOf(canvas);
    let userMoved = false;
    const stop = () => { userMoved = true; };
    const stopEvents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    if (pane) stopEvents.forEach((e) => pane.addEventListener(e, stop, { passive: true }));
    const frame = () => {
      const now = performance.now();                                            // the same clock as `start` and `finishedAt`
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const sinceFinished = finishedAt.current === null ? null : now - finishedAt.current;
      paintScan(ctx, layersRef.current, ink, now - start, sinceFinished, w, h, timing);
      if (pane && !userMoved && sinceFinished === null) {
        const top = canvas.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
        const target = followTarget(linePosition(now - start, timing), top, canvas.clientHeight, pane.clientHeight, pane.scrollHeight - pane.clientHeight);
        pane.scrollTop += (target - pane.scrollTop) * 0.18;                    // eased, never a jump
      }
      if (sinceFinished !== null && sinceFinished >= timing.fadeOutMs) {
        if (!finished) { finished = true; onDoneRef.current?.(); }
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (pane) stopEvents.forEach((e) => pane.removeEventListener(e, stop));
    };
  }, [ink, timing]);

  return <canvas ref={canvasRef} data-testid="scan-overlay" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
