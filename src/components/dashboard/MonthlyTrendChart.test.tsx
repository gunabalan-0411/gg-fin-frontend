/**
 * The dashboard's Monthly trend chart. MT-01 ... MT-12. The real component, no mocks.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MonthlyTrendChart } from "./MonthlyTrendChart";
import type { MonthlyProfit } from "@/types";

const make = (n: number, from = "2021-10"): MonthlyProfit[] => {
  let [y, m] = from.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const month = `${y}-${String(m).padStart(2, "0")}`;
    m += 1; if (m > 12) { m = 1; y += 1; }
    const iop = 20000 + i * 1000, edi = 10000 + (i % 5) * 1000;
    return { month, iop_profit: iop, edi_profit: edi, expense: 5000, unclaimed: 0, defaulted: 0, net_profit: iop + edi - 5000 };
  });
};

// jsdom has no PointerEvent: give it one that carries the mouse position
if (typeof window.PointerEvent === "undefined") {
  (window as any).PointerEvent = class PointerEvent extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: any = {}) { super(type, init); this.pointerType = init.pointerType ?? "mouse"; }
  };
}

const hit = () => screen.getByTestId("trend-hit");
const hover = (clientX: number) => {
  (hit() as unknown as SVGRectElement).getBoundingClientRect = () => ({ left: 52, top: 0, right: 786, bottom: 100, width: 734, height: 100, x: 52, y: 0, toJSON() {} } as DOMRect);
  fireEvent.pointerMove(hit(), { clientX, pointerType: "mouse" });
};

describe("the headline numbers (MT-01 ... MT-03)", () => {
  it("show the latest month's net profit, its change on the month before, the average and the best month (MT-01)", () => {
    const data = make(6).map((m, i) => ({ ...m, net_profit: [10000, 20000, 90000, 40000, 50000, 60000][i] }));
    render(<MonthlyTrendChart data={data} />);
    const stats = screen.getByTestId("trend-stats");
    expect(stats).toHaveTextContent("₹60,000");
    expect(stats).toHaveTextContent("Mar 2022");
    expect(screen.getByTestId("trend-delta")).toHaveTextContent("▲ 20.0%");                  // 50,000 -> 60,000
    expect(screen.getByTestId("trend-avg")).toHaveTextContent("₹45,000");                    // (10+20+90+40+50+60) / 6
    expect(screen.getByTestId("trend-best")).toHaveTextContent("₹90,000");
    expect(screen.getByTestId("trend-best")).toHaveTextContent("Dec 2021");
  });

  it("a fall is shown as ▼ (MT-02)", () => {
    const data = make(4);
    data[3] = { ...data[3], net_profit: 1000 };
    render(<MonthlyTrendChart data={data} />);
    expect(screen.getByTestId("trend-delta")).toHaveTextContent(/▼ \d+\.\d%/);
  });

  it("no change figure when the month before had no profit to compare with (MT-03)", () => {
    const data = make(3);
    data[1] = { ...data[1], net_profit: 0 };
    render(<MonthlyTrendChart data={data} />);
    expect(screen.queryByTestId("trend-delta")).toBeNull();
  });
});

describe("the range (MT-04, MT-05)", () => {
  it("shows everything by default; 12M and 24M narrow the chart, the numbers and the table (MT-04)", async () => {
    const user = userEvent.setup();
    render(<MonthlyTrendChart data={make(63)} />);
    expect(screen.getByText(/63 months/)).toBeInTheDocument();
    expect(within(screen.getByTestId("trend-table")).getAllByRole("row")).toHaveLength(64);          // header + 63
    await user.click(within(screen.getByTestId("trend-range")).getByRole("button", { name: "12M" }));
    expect(screen.getByText(/12 months/)).toBeInTheDocument();
    expect(within(screen.getByTestId("trend-table")).getAllByRole("row")).toHaveLength(13);
    await user.click(within(screen.getByTestId("trend-range")).getByRole("button", { name: "24M" }));
    expect(screen.getByText(/24 months/)).toBeInTheDocument();
    expect(within(screen.getByTestId("trend-range")).getByRole("button", { name: "24M" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a range that would just be 'All' is switched off (MT-05)", () => {
    render(<MonthlyTrendChart data={make(8)} />);
    expect(within(screen.getByTestId("trend-range")).getByRole("button", { name: "12M" })).toBeDisabled();
    expect(within(screen.getByTestId("trend-range")).getByRole("button", { name: "All" })).toBeEnabled();
  });
});

describe("the lines (MT-06, MT-07)", () => {
  it("net, IOP and EDI are drawn; one dot per line at the end, not one on every month (MT-06)", () => {
    const { container } = render(<MonthlyTrendChart data={make(30)} />);
    for (const k of ["net", "iop", "edi"]) expect(screen.getByTestId(`line-${k}`)).toBeInTheDocument();
    // end dots (3) + the best-month dot (1): nothing like 90 dots
    expect(container.querySelectorAll("svg circle").length).toBeLessThanOrEqual(4);
    expect(screen.getByTestId("trend-peak")).toBeInTheDocument();
  });

  it("the legend switches lines off and on, and one line always stays (MT-07)", async () => {
    const user = userEvent.setup();
    render(<MonthlyTrendChart data={make(10)} />);
    const legend = screen.getByTestId("trend-legend");
    await user.click(within(legend).getByRole("button", { name: "IOP" }));
    expect(screen.queryByTestId("line-iop")).toBeNull();
    expect(within(legend).getByRole("button", { name: "IOP" })).toHaveAttribute("aria-pressed", "false");
    await user.click(within(legend).getByRole("button", { name: "EDI" }));
    await user.click(within(legend).getByRole("button", { name: "Net profit" }));           // the last one cannot be switched off
    expect(screen.getByTestId("line-net")).toBeInTheDocument();
    await user.click(within(legend).getByRole("button", { name: "IOP" }));
    expect(screen.getByTestId("line-iop")).toBeInTheDocument();
  });
});

describe("hover and keyboard (MT-08 ... MT-10)", () => {
  it("moving over the chart shows the month, every line's value and the change vs the month before (MT-08)", () => {
    const data = make(10);
    render(<MonthlyTrendChart data={data} />);
    expect(screen.queryByTestId("trend-tooltip")).toBeNull();
    hover(52);                                                                    // the left edge = the first month
    let tip = screen.getByTestId("trend-tooltip");
    expect(tip).toHaveTextContent("Oct 2021");
    expect(tip).toHaveTextContent(`₹${data[0].net_profit.toLocaleString("en-IN")}`);
    expect(tip).toHaveTextContent(`₹${data[0].iop_profit.toLocaleString("en-IN")}`);
    expect(tip).toHaveTextContent(`₹${data[0].edi_profit.toLocaleString("en-IN")}`);
    expect(tip).not.toHaveTextContent("vs");                                      // nothing before the first month
    hover(786);                                                                   // the right edge = the last month
    tip = screen.getByTestId("trend-tooltip");
    expect(tip).toHaveTextContent("Jul 2022");
    expect(tip).toHaveTextContent(/▲ [\d.]+% vs Jun 2022/);
  });

  it("a switched-off line is not in the tooltip (MT-09)", async () => {
    const user = userEvent.setup();
    render(<MonthlyTrendChart data={make(10)} />);
    await user.click(within(screen.getByTestId("trend-legend")).getByRole("button", { name: "EDI" }));
    hover(300);
    const tip = screen.getByTestId("trend-tooltip");
    expect(tip).toHaveTextContent("IOP");
    expect(tip).not.toHaveTextContent("EDI");
  });

  it("the arrow keys walk through the months and Escape closes the tooltip (MT-10)", () => {
    render(<MonthlyTrendChart data={make(10)} />);
    const plot = screen.getByTestId("trend-plot");
    fireEvent.keyDown(plot, { key: "ArrowLeft" });
    expect(screen.getByTestId("trend-tooltip")).toHaveTextContent("Jul 2022");     // starts from the latest month
    fireEvent.keyDown(plot, { key: "ArrowLeft" });
    expect(screen.getByTestId("trend-tooltip")).toHaveTextContent("Jun 2022");
    fireEvent.keyDown(plot, { key: "ArrowRight" });
    expect(screen.getByTestId("trend-tooltip")).toHaveTextContent("Jul 2022");
    fireEvent.keyDown(plot, { key: "Escape" });
    expect(screen.queryByTestId("trend-tooltip")).toBeNull();
  });
});

describe("edge cases (MT-11, MT-12)", () => {
  it("fewer than two months: a plain message, no chart (MT-11)", () => {
    render(<MonthlyTrendChart data={make(1)} />);
    expect(screen.getByText("Not enough data yet.")).toBeInTheDocument();
    expect(screen.queryByTestId("trend-plot")).toBeNull();
  });

  it("negative months are drawn below a zero line and labelled (MT-12)", () => {
    const data = make(6);
    data[2] = { ...data[2], net_profit: -40000 };
    const { container } = render(<MonthlyTrendChart data={data} />);
    expect(container.textContent).toContain("−₹40k");
    hover(300);
    expect(screen.getByTestId("trend-tooltip")).toBeInTheDocument();
  });
});
