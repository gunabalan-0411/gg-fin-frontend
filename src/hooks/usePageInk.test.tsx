import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/services/api", () => ({ ocrApi: { pageInk: vi.fn() } }));

import { ocrApi } from "@/services/api";
import { usePageInk } from "./usePageInk";

const pageInk = (ocrApi as unknown as { pageInk: ReturnType<typeof vi.fn> }).pageInk;
const ink = (n = 1) => ({ width: 800, height: 1200, mask_png_b64: "AAAA", blobs: [[1, 2, 3, 4]], coverage: 0.05 * n });

beforeEach(() => { vi.clearAllMocks(); pageInk.mockResolvedValue({ data: ink() }); });

describe("usePageInk — where the ink is, asked for when the page is on screen (RS-11)", () => {
  it("does not ask before there is a session, or before the page image is on screen", () => {
    renderHook(() => usePageInk(null, 0, true));
    renderHook(() => usePageInk("s1", 0, false));
    expect(pageInk).not.toHaveBeenCalled();
  });

  it("asks for the current page and returns what the server found", async () => {
    const { result } = renderHook(() => usePageInk("s1", 0, true));
    expect(result.current).toBeNull();                                           // nothing until it arrives
    await waitFor(() => expect(result.current).toEqual(ink()));
    expect(pageInk).toHaveBeenCalledWith("s1", 0);
    expect(pageInk).toHaveBeenCalledTimes(1);
  });

  it("asks again for another page, and never shows one page's ink on another page", async () => {
    pageInk.mockImplementation(async (_s: string, p: number) => ({ data: ink(p + 1) }));
    const { result, rerender } = renderHook(({ page }) => usePageInk("s1", page, true), { initialProps: { page: 0 } });
    await waitFor(() => expect(result.current?.coverage).toBeCloseTo(0.05));
    rerender({ page: 1 });
    expect(result.current).toBeNull();                                           // page 0's ink is not page 1's
    await waitFor(() => expect(result.current?.coverage).toBeCloseTo(0.1));
    expect(pageInk).toHaveBeenLastCalledWith("s1", 1);
  });

  it("a new session asks again", async () => {
    const { rerender, result } = renderHook(({ sid }) => usePageInk(sid, 0, true), { initialProps: { sid: "a" } });
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender({ sid: "b" });
    expect(result.current).toBeNull();
    await waitFor(() => expect(pageInk).toHaveBeenCalledWith("b", 0));
  });

  it("a failing request just means no animation: null, never an error", async () => {
    pageInk.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => usePageInk("s1", 0, true));
    await waitFor(() => expect(pageInk).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBeNull();
  });

  it.each([
    ["no mask", { width: 800, height: 1200, mask_png_b64: "", blobs: [], coverage: 0 }],
    ["zero size", { width: 0, height: 0, mask_png_b64: "AAAA", blobs: [], coverage: 0 }],
    ["blobs missing", { width: 800, height: 1200, mask_png_b64: "AAAA", coverage: 0 }],
    ["nothing at all", null],
  ])("an unusable answer (%s) means no animation", async (_name, data) => {
    pageInk.mockResolvedValue({ data });
    const { result } = renderHook(() => usePageInk("s1", 0, true));
    await waitFor(() => expect(pageInk).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBeNull();
  });

  it("an answer that arrives after the page changed is ignored", async () => {
    let resolveFirst!: (v: unknown) => void;
    pageInk.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));
    pageInk.mockResolvedValueOnce({ data: ink(2) });
    const { result, rerender } = renderHook(({ page }) => usePageInk("s1", page, true), { initialProps: { page: 0 } });
    rerender({ page: 1 });
    await waitFor(() => expect(result.current?.coverage).toBeCloseTo(0.1));
    resolveFirst({ data: ink(1) });                                              // the slow answer for page 0 lands late
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current?.coverage).toBeCloseTo(0.1);                           // still page 1's
  });

  it("an API without the call (older mock / old server build) is tolerated", async () => {
    const saved = (ocrApi as any).pageInk;
    delete (ocrApi as any).pageInk;
    try {
      const { result } = renderHook(() => usePageInk("s1", 0, true));
      await new Promise((r) => setTimeout(r, 20));
      expect(result.current).toBeNull();
    } finally {
      (ocrApi as any).pageInk = saved;
    }
  });
});
