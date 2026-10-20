import { describe, expect, it } from "vitest";
import { DEFAULT_TIMING as C, blobAge, cycleMs, glow, linePosition, litBlobs, overlayOpacity, type Blob } from "./radarScan";

describe("the scan line (RS-01)", () => {
  it("starts at the top, reaches the bottom at the end of the sweep, then rests off the page", () => {
    expect(linePosition(0)).toBe(0);
    expect(linePosition(C.sweepMs / 2)).toBeCloseTo(0.5, 5);
    expect(linePosition(C.sweepMs - 1)).toBeCloseTo(1, 2);
    expect(linePosition(C.sweepMs)).toBeNull();                                // resting
    expect(linePosition(C.sweepMs + C.pauseMs - 1)).toBeNull();
  });

  it("sweeps again from the top, cycle after cycle, the same way every time", () => {
    const t = cycleMs(C);
    expect(linePosition(t)).toBe(0);
    expect(linePosition(t + C.sweepMs / 4)).toBeCloseTo(0.25, 5);
    expect(linePosition(5 * t + 1000)).toBeCloseTo(linePosition(1000)!, 5);
  });

  it("moves down at a constant speed (a radar does not speed up)", () => {
    const a = linePosition(500)!, b = linePosition(1000)!, c = linePosition(1500)!;
    expect(b - a).toBeCloseTo(c - b, 6);
  });

  it("is off before the start", () => expect(linePosition(-1)).toBeNull());
});

describe("when a character is passed (RS-02)", () => {
  it("a character is not lit before the line has passed its bottom edge (+ a small lag), in the first sweep", () => {
    expect(blobAge(0.5, 0)).toBe(-1);
    expect(blobAge(0.5, C.sweepMs * 0.5)).toBe(-1);                              // the line is level with the bottom: not yet
    expect(blobAge(0.5, C.sweepMs * (0.5 + C.lagFrac) + 50)).toBeCloseTo(50, 0);
  });

  it("characters further down are passed later", () => {
    const t = C.sweepMs * 0.7;
    expect(blobAge(0.2, t)).toBeGreaterThan(blobAge(0.6, t));
    expect(blobAge(0.9, t)).toBe(-1);
  });

  it("the bottom of the page is passed at the end of the sweep", () => {
    expect(blobAge(1, C.sweepMs - 1)).toBe(-1);
    expect(blobAge(1, C.sweepMs + 10)).toBeGreaterThanOrEqual(0);
  });

  it("in later sweeps the previous pass is still fading when the line is above the character", () => {
    const cycle = cycleMs(C);
    const t = cycle + C.sweepMs * 0.1;                                          // second sweep, line near the top
    const age = blobAge(0.5, t);
    expect(age).toBeGreaterThan(0);                                             // lit by the first sweep, fading
    expect(age).toBeCloseTo(t % cycle - C.sweepMs * (0.5 + C.lagFrac) + cycle, 3);
  });

  it("nothing is lit before the start", () => expect(blobAge(0.3, -5)).toBe(-1));
});

describe("how bright (RS-03)", () => {
  it("is dark before the pass and again after the glow has faded", () => {
    expect(glow(-1)).toEqual({ ink: 0, flash: 0 });
    expect(glow(C.glowMs)).toEqual({ ink: 0, flash: 0 });
    expect(glow(C.glowMs + 500)).toEqual({ ink: 0, flash: 0 });
  });

  it("lights up quickly, pings, holds, then fades smoothly to nothing", () => {
    expect(glow(0).ink).toBe(0);
    expect(glow(30).ink).toBeGreaterThan(0);
    expect(glow(60).ink).toBe(1);                                               // fully lit within 60 ms
    expect(glow(40).flash).toBeCloseTo(1, 5);                                   // the ping peaks right after the pass
    expect(glow(C.flashMs).flash).toBeCloseTo(0, 5);
    expect(glow(C.flashMs).ink).toBe(1);                                        // then the steady tint ...
    const early = glow(C.flashMs + 300).ink, late = glow(C.glowMs - 200).ink;
    expect(early).toBeGreaterThan(late);                                        // ... fades, never jumps back up
    expect(late).toBeGreaterThan(0);
    let last = 1;
    for (let a = C.flashMs; a < C.glowMs; a += 50) { const v = glow(a).ink; expect(v).toBeLessThanOrEqual(last + 1e-9); last = v; }
  });

  it("stays between 0 and 1", () => {
    for (let a = -10; a < C.glowMs + 50; a += 7) {
      const g = glow(a);
      expect(g.ink).toBeGreaterThanOrEqual(0); expect(g.ink).toBeLessThanOrEqual(1);
      expect(g.flash).toBeGreaterThanOrEqual(0); expect(g.flash).toBeLessThanOrEqual(1);
    }
  });
});

describe("the whole overlay when the reading ends (RS-04)", () => {
  it("is fully visible while reading and fades out within fadeOutMs once finished", () => {
    expect(overlayOpacity(null)).toBe(1);
    expect(overlayOpacity(0)).toBe(1);
    expect(overlayOpacity(C.fadeOutMs / 2)).toBeCloseTo(0.5, 5);
    expect(overlayOpacity(C.fadeOutMs)).toBe(0);
    expect(overlayOpacity(C.fadeOutMs * 5)).toBe(0);
  });
});

describe("which characters are lit at a moment (RS-05)", () => {
  const blobs: Blob[] = [[10, 100, 50, 40], [10, 400, 50, 40], [10, 800, 50, 40]];          // bottoms at 140, 440, 840 of a 1000 px page

  it("none at the start; the top character first; all of them just after the sweep", () => {
    expect(litBlobs(blobs, 1000, 0)).toHaveLength(0);
    const early = litBlobs(blobs, 1000, C.sweepMs * 0.2);
    expect(early.map((l) => l.blob[1])).toEqual([100]);
    const end = litBlobs(blobs, 1000, C.sweepMs + 100);
    expect(end.map((l) => l.blob[1])).toEqual([100, 400, 800]);
  });

  it("the characters passed first fade first, as the line goes on", () => {
    const t = C.sweepMs * 0.95;
    const lit = litBlobs(blobs, 1000, t);
    const strengths = lit.map((l) => l.glow.ink);
    expect(strengths.length).toBe(3);
    expect(strengths[0]).toBeLessThanOrEqual(strengths[1]);                                  // older pass is dimmer or equal
  });

  it("an empty page has nothing to light", () => expect(litBlobs([], 1000, 1234)).toEqual([]));

  it("a custom timing changes the pace", () => {
    const slow = { ...C, sweepMs: 10_000 };
    expect(litBlobs(blobs, 1000, 2600, slow)).toHaveLength(1);
    expect(litBlobs(blobs, 1000, 2600)).toHaveLength(3);
  });
});
