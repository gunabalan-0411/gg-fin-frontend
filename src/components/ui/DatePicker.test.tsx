/** DatePicker: the calendar can never be cut off (own layer kept on screen) and the keyboard moves the date. DP-01 ... */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { DatePicker } from "./DatePicker";
import { Modal } from "./Modal";

function Harness({ initial = "2026-10-29" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <div style={{ overflow: "hidden", width: 160 }} data-testid="clipping-card">
      <DatePicker value={v} onChange={setV} />
      <output data-testid="value">{v}</output>
    </div>
  );
}
const value = () => screen.getByTestId("value").textContent;
const trigger = () => screen.getByRole("button", { name: /29 Oct 2026|Oct 2026|Select date|\d{2} \w{3} \d{4}/ });

let vw = 375;
beforeEach(() => { Object.defineProperty(window, "innerWidth", { value: vw, configurable: true }); Object.defineProperty(window, "innerHeight", { value: 700, configurable: true }); });
afterEach(() => { vi.restoreAllMocks(); });

function mockButtonRect(rect: Partial<DOMRect>) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.tagName === "BUTTON" && this.getAttribute("aria-haspopup") === "dialog"
      ? ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {}, ...rect } as DOMRect)
      : ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect);
  });
}

describe("DatePicker (DP)", () => {
  it("DP-01 opening shows the calendar in its OWN layer on the page, not inside the (clipping) card", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    const pop = screen.getByTestId("date-popup");
    expect(pop.parentElement).toBe(document.body);
    expect(screen.getByTestId("clipping-card")).not.toContainElement(pop);
    expect(getComputedStyle(pop).position).toBe("fixed");
  });

  it("DP-02 a button near the right edge of a narrow screen: the calendar is shifted left so every column stays on screen", () => {
    mockButtonRect({ left: 300, top: 100, bottom: 140, right: 360, width: 60, height: 40 });
    render(<Harness />);
    fireEvent.click(trigger());
    const pop = screen.getByTestId("date-popup");
    expect(parseFloat(pop.style.left)).toBe(375 - 288 - 8);                    // right edge = screen - 8
    expect(parseFloat(pop.style.left) + parseFloat(pop.style.width)).toBeLessThanOrEqual(375 - 8);
  });

  it("DP-03 a button at the far left stays at least 8px from the screen edge", () => {
    mockButtonRect({ left: -50, top: 100, bottom: 140 });
    render(<Harness />);
    fireEvent.click(trigger());
    expect(parseFloat(screen.getByTestId("date-popup").style.left)).toBe(8);
  });

  it("DP-04 a screen narrower than the calendar makes the calendar narrower (never wider than the screen)", () => {
    Object.defineProperty(window, "innerWidth", { value: 260, configurable: true });
    mockButtonRect({ left: 10, top: 100, bottom: 140 });
    render(<Harness />);
    fireEvent.click(trigger());
    expect(parseFloat(screen.getByTestId("date-popup").style.width)).toBe(260 - 16);
  });

  it("DP-05 picking a day by click sets it and closes the calendar", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: "12" }));
    expect(value()).toBe("2026-10-12");
    expect(screen.queryByTestId("date-popup")).not.toBeInTheDocument();
  });

  it("DP-06 closed button: Left / Right move the date a day without opening the calendar", () => {
    render(<Harness />);
    fireEvent.keyDown(trigger(), { key: "ArrowRight" });
    expect(value()).toBe("2026-10-30");
    fireEvent.keyDown(screen.getByRole("button", { name: /30 Oct 2026/ }), { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByRole("button", { name: /29 Oct 2026/ }), { key: "ArrowLeft" });
    expect(value()).toBe("2026-10-28");
    expect(screen.queryByTestId("date-popup")).not.toBeInTheDocument();
  });

  it("DP-07 closed button: arrows cross month and year ends", () => {
    render(<Harness initial="2026-12-31" />);
    fireEvent.keyDown(screen.getByRole("button", { name: /31 Dec 2026/ }), { key: "ArrowRight" });
    expect(value()).toBe("2027-01-01");
    fireEvent.keyDown(screen.getByRole("button", { name: /01 Jan 2027/ }), { key: "ArrowLeft" });
    expect(value()).toBe("2026-12-31");
  });

  it("DP-08 open: Left / Right move the highlighted day, Enter picks it; the month changes by itself", () => {
    render(<Harness initial="2026-10-31" />);
    fireEvent.click(screen.getByRole("button", { name: /31 Oct 2026/ }));
    const pop = screen.getByTestId("date-popup");
    fireEvent.keyDown(pop, { key: "ArrowRight" });                             // 1 Nov
    expect(pop.querySelector('[data-cursor="true"]')).toHaveTextContent("1");
    expect(screen.getByRole("combobox", { name: "Month" })).toHaveValue("10"); // November (0-based)
    fireEvent.keyDown(pop, { key: "ArrowRight" });
    fireEvent.keyDown(pop, { key: "Enter" });
    expect(value()).toBe("2026-11-02");
    expect(screen.queryByTestId("date-popup")).not.toBeInTheDocument();
  });

  it("DP-09 open: Up / Down move a week, PageUp / PageDown a month", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    const pop = screen.getByTestId("date-popup");
    fireEvent.keyDown(pop, { key: "ArrowUp" });
    fireEvent.keyDown(pop, { key: "Enter" });
    expect(value()).toBe("2026-10-22");
    fireEvent.click(screen.getByRole("button", { name: /22 Oct 2026/ }));
    const pop2 = screen.getByTestId("date-popup");
    fireEvent.keyDown(pop2, { key: "PageDown" });
    fireEvent.keyDown(pop2, { key: "ArrowDown" });
    fireEvent.keyDown(pop2, { key: "Enter" });
    expect(value()).toBe("2026-11-29");
  });

  it("DP-10 Escape closes without changing the date", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    const pop = screen.getByTestId("date-popup");
    fireEvent.keyDown(pop, { key: "ArrowRight" });
    fireEvent.keyDown(pop, { key: "Escape" });
    expect(screen.queryByTestId("date-popup")).not.toBeInTheDocument();
    expect(value()).toBe("2026-10-29");
  });

  it("DP-11 a press outside closes it; a press inside the calendar does not", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.mouseDown(screen.getByTestId("date-popup"));
    expect(screen.getByTestId("date-popup")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("date-popup")).not.toBeInTheDocument();
  });

  it("DP-12 the month list keeps its own arrow keys (they do not move the day)", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Month" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByTestId("date-popup"), { key: "Enter" });
    expect(value()).toBe("2026-10-29");
  });

  it("DP-13 Today picks today", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    const t = new Date();
    expect(value()).toBe(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`);
  });

  it("DP-14 inside a modal dialog the calendar is drawn INSIDE that dialog (the modal blocks everything outside it)", () => {
    function InModal() {
      const [v, setV] = useState("2026-10-29");
      return <Modal open onClose={() => {}} title="Edit"><DatePicker value={v} onChange={setV} /><output data-testid="value">{v}</output></Modal>;
    }
    render(<InModal />);
    fireEvent.click(screen.getByRole("button", { name: /29 Oct 2026/ }));
    const pop = screen.getByTestId("date-popup");
    const host = pop.parentElement as HTMLElement;
    expect(host.getAttribute("role")).toBe("dialog");
    expect(host).not.toBe(document.body);
    fireEvent.click(screen.getByRole("button", { name: "9" }));
    expect(value()).toBe("2026-10-09");
  });

  it("DP-15 no value yet: the button says Select date and the calendar starts on this month", () => {
    function Empty() { const [v, setV] = useState(""); return <><DatePicker value={v} onChange={setV} /><output data-testid="value">{v}</output></>; }
    render(<Empty />);
    expect(screen.getByRole("button", { name: /Select date/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Select date/ }));
    const t = new Date();
    expect(screen.getByRole("combobox", { name: "Month" })).toHaveValue(String(t.getMonth()));
  });
});
