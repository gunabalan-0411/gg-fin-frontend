import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom does not implement these; components call them when scrolling a highlighted option into view
if (typeof Element.prototype.scrollIntoView !== "function") {
  (Element.prototype as any).scrollIntoView = () => {};
}
class RO { observe() {} unobserve() {} disconnect() {} }
if (!("ResizeObserver" in globalThis)) (globalThis as any).ResizeObserver = RO;
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as any;
}

// jsdom has no canvas: getContext answers null quietly (the scan overlay then draws nothing), instead of logging "not implemented"
if (typeof HTMLCanvasElement !== "undefined") (HTMLCanvasElement.prototype as any).getContext = () => null;

afterEach(() => cleanup());
