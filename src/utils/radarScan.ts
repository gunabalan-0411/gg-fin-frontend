// The timing of the "radar" scan shown over the page image while it is being read. Pure functions of time: the same time always gives
// the same picture, so the whole effect is unit-testable. The server says where the ink is (blobs = one box per character); here we say
// WHEN each character lights.
//
//   a mint line sweeps from the top of the page to the bottom (sweepMs), rests for pauseMs off the page, and sweeps again;
//   a character lights a moment after the line has passed its bottom edge: a quick bright ping, then a steady deeper-mint tint that
//   fades away over glowMs like a radar phosphor (so each sweep re-lights what the line passes);
//   when the reading is finished the whole overlay fades out within fadeOutMs.

export interface ScanTiming {
  sweepMs: number;
  pauseMs: number;
  flashMs: number;
  glowMs: number;
  /** the line must be this far (fraction of the page height) below a character's bottom edge before it lights */
  lagFrac: number;
  fadeOutMs: number;
}

// The pace (ms). The whole motion is slowed to a quarter of the speed it first had (sweep 2.6 s -> 10.4 s, rest 0.45 s -> 1.8 s, glow 3.2 s ->
// 12.8 s), so it looks the same, only calmer. The quick ping (flashMs) and the fade-out when the reading ends keep their pace: they are not motion.
export const DEFAULT_TIMING: ScanTiming = { sweepMs: 10_400, pauseMs: 1_800, flashMs: 220, glowMs: 12_800, lagFrac: 0.008, fadeOutMs: 450 };

export const cycleMs = (c: ScanTiming) => c.sweepMs + c.pauseMs;

/** Where the line is, as a fraction of the page height (0 = top, 1 = bottom); null while it rests off the page (or before the start). */
export function linePosition(tMs: number, c: ScanTiming = DEFAULT_TIMING): number | null {
  if (tMs < 0) return null;
  const phase = tMs % cycleMs(c);
  return phase < c.sweepMs ? phase / c.sweepMs : null;
}

/** Milliseconds since the line passed a character whose bottom edge is at `bottomFrac` of the page height; -1 when it has not been passed yet. */
export function blobAge(bottomFrac: number, tMs: number, c: ScanTiming = DEFAULT_TIMING): number {
  if (tMs < 0) return -1;
  const cycle = cycleMs(c);
  const reveal = Math.min(1, Math.max(0, bottomFrac) + c.lagFrac) * c.sweepMs;
  const phase = tMs % cycle;
  let age = phase - reveal;
  if (age < 0) {
    if (tMs < cycle) return -1;                               // the very first sweep has not got there yet
    age += cycle;                                             // the previous sweep's pass is still fading
  }
  return age;
}

export interface Glow {
  /** 0..1: strength of the steady deeper-mint tint */
  ink: number;
  /** 0..1: strength of the quick bright ping right after the pass */
  flash: number;
}

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export function glow(ageMs: number, c: ScanTiming = DEFAULT_TIMING): Glow {
  if (ageMs < 0 || ageMs >= c.glowMs) return { ink: 0, flash: 0 };
  const rise = Math.min(1, ageMs / 60);                       // lights up in 60 ms, not in one frame
  const fade = ageMs <= c.flashMs ? 1 : 1 - smooth((ageMs - c.flashMs) / (c.glowMs - c.flashMs));
  const flash = ageMs < 40 ? ageMs / 40 : Math.max(0, 1 - (ageMs - 40) / (c.flashMs - 40));
  return { ink: rise * fade, flash: Math.min(1, flash) };
}

/** Opacity of the whole overlay: 1 while reading; after the reading finished it fades to 0 over fadeOutMs (null = still reading). */
export function overlayOpacity(msSinceFinished: number | null, c: ScanTiming = DEFAULT_TIMING): number {
  if (msSinceFinished === null) return 1;
  return Math.max(0, 1 - Math.max(0, msSinceFinished) / c.fadeOutMs);
}

export type Blob = [x: number, y: number, w: number, h: number];

/** The blobs that are lit at time t (with their glow), for a page `height` px tall. */
export function litBlobs(blobs: readonly Blob[], height: number, tMs: number, c: ScanTiming = DEFAULT_TIMING) {
  const out: { blob: Blob; glow: Glow }[] = [];
  for (const blob of blobs) {
    const g = glow(blobAge((blob[1] + blob[3]) / height, tMs, c), c);
    if (g.ink > 0.01 || g.flash > 0.01) out.push({ blob, glow: g });
  }
  return out;
}
