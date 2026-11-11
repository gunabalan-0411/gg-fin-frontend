/** The collections page (வசூல்): second circle on the first screen, EL split by 10 days / monthly, தவணை 99+ days, totals, fit, Back. TV-CL-01 ... */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/tv/tvClient", async () => {
  const actual = await vi.importActual<typeof import("@/tv/tvClient")>("@/tv/tvClient");
  return { ...actual, tvClient: { pairStart: vi.fn(), pairPoll: vi.fn(), me: vi.fn(), search: vi.fn(), customer: vi.fn(), collections: vi.fn() } };
});

import { tvClient } from "@/tv/tvClient";
import TvPage from "./TvPage";
import { fitRows } from "./CollectionsPage";
import { idNo, fmtPhone } from "./format";
import { T } from "./text";
import type { TvCollections, TvElRow } from "./types";

type Fn = ReturnType<typeof vi.fn>;
const api = tvClient as unknown as Record<"me" | "search" | "customer" | "collections", Fn>;
const unauthorized = () => Object.assign(new Error("401"), { response: { status: 401 } });

const el = (id: number, ta: string, en: string, over: Partial<TvElRow> = {}): TvElRow =>
  ({ customer_id: id, name_ta: ta, name_en: en, loan_amount: 150000, due: 1000, paid_month: 0, phone: "9962034455", frequency: 10, ...over });

const DATA: TvCollections = {
  as_of: "2026-11-11",
  el: {
    yesterday: { date: "2026-11-10", ten_days: [el(401, "நேற்று ஆள்", "Yday")], monthly: [] },
    today: {
      date: "2026-11-11",
      ten_days: [el(201, "கோபால் சாமி", "Gopal Samy", { paid_month: 1000 }), el(202, "", "Murugan K", { due: 500, paid_month: 200, loan_amount: 80000 }), el(203, "செல்வம்", "Selvam", { due: 300 })],
      monthly: [el(301, "சுந்தரம்", "Sundaram", { due: 9000, paid_month: 9000, loan_amount: 300000, frequency: 30 })],
    },
    tomorrow: { date: "2026-11-12", ten_days: [el(501, "நாளை ஆள்", "Tmrw"), el(502, "நாளை இரண்டு", "Tmrw2")], monthly: [el(503, "நாளை மாதம்", "TmrwM", { frequency: 30 })] },
  },
  edi_long: [
    { customer_id: 112, name_ta: "செல்வம் கே", name_en: "Selvam K", last_payment_date: "2026-07-22", loan_start_date: "2026-03-01", loan_amount: 25000, balance: 11800, phone: "98765 43210", days: 112 },
    { customer_id: 120, name_ta: "குமார்", name_en: "Kumar", last_payment_date: null, loan_start_date: "2026-08-04", loan_amount: 50000, balance: 32000, phone: "9003122817", days: 99 },
  ],
};
const EMPTY_DAY = { date: "2026-11-11", ten_days: [], monthly: [] };

function setup(data: TvCollections = DATA) {
  localStorage.clear();
  localStorage.setItem("gg_tv_token", "ggtv_abc");
  api.me.mockResolvedValue({ data: { name: "TV" } });
  api.collections.mockResolvedValue({ data });
  return render(<TvPage />);
}
async function openCollections() {
  fireEvent.click(await screen.findByRole("button", { name: T.collect }));
  await screen.findByTestId("tv-collect");
}

beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); });
afterEach(() => { vi.useRealTimers(); delete (window as any).__ggtvBack; });

describe("collections page (TV-CL)", () => {
  it("TV-CL-01 the first screen has a second circle (வசூல்) beside the customers one; Left / Right move between them", async () => {
    setup();
    const search = await screen.findByRole("button", { name: T.openCustomers });
    const collect = screen.getByRole("button", { name: T.collect });
    expect(search).toHaveFocus();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(collect).toHaveFocus();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(search).toHaveFocus();
  });

  it("TV-CL-02 OK on the collections circle opens the page and asks the server with the TV's token", async () => {
    setup();
    await openCollections();
    expect(api.collections).toHaveBeenCalledWith("ggtv_abc");
  });

  it("TV-CL-03 left half: EL, the 10-day people above and the monthly interest ones below, each with the five columns", async () => {
    setup();
    await openCollections();
    expect(screen.getByText("EL")).toBeInTheDocument();
    const ten = await screen.findByTestId("tv-el-ten");
    const month = screen.getByTestId("tv-el-month");
    expect(within(ten).getAllByTestId("tv-el-ten-row")).toHaveLength(3);
    expect(within(month).getAllByTestId("tv-el-month-row")).toHaveLength(1);
    expect(within(month).getByText(T.monthlyInterest)).toBeInTheDocument();
    for (const h of [T.colName, T.colLoan, T.colDue, T.colThisMonth, T.colPhone]) expect(within(ten).getByText(h)).toBeInTheDocument();
    const first = within(ten).getAllByTestId("tv-el-ten-row")[0];
    expect(first).toHaveTextContent("கோபால் சாமி");
    expect(first).toHaveTextContent("1,50,000");
    expect(first).toHaveTextContent("1,000");
    expect(first).toHaveTextContent("99620 34455");
  });

  it("TV-CL-04 the removed texts are gone: no '10 நாளுக்கு', no '30 நாளுக்கு', no '99 நாளுக்கு மேல்', no English names", async () => {
    setup();
    await openCollections();
    await screen.findByTestId("tv-el-ten");
    const page = screen.getByTestId("tv-collect");
    expect(page.textContent).not.toMatch(/நாளுக்கு/);
    expect(page.textContent).not.toContain("Gopal Samy");
    expect(page.textContent).not.toContain("Selvam K");
  });

  it("TV-CL-05 a person with no Tamil name is shown by the English one (never a blank); the id is small, # and four digits, no GG-", async () => {
    setup();
    await openCollections();
    const ten = await screen.findByTestId("tv-el-ten");
    const second = within(ten).getAllByTestId("tv-el-ten-row")[1];
    expect(second).toHaveTextContent("Murugan K");
    expect(second).toHaveTextContent("#0202");
    expect(screen.getByTestId("tv-collect").textContent).not.toContain("GG-");
  });

  it("TV-CL-06 this month's paid figure: green when the interest due is paid, grey at 0, normal in between", async () => {
    setup();
    await openCollections();
    const rows = within(await screen.findByTestId("tv-el-ten")).getAllByTestId("tv-el-ten-row");
    expect(rows[0].querySelector(".paid")).toHaveClass("ok");
    expect(rows[1].querySelector(".paid")).toHaveClass("part");
    expect(rows[2].querySelector(".paid")).toHaveClass("zero");
  });

  it("TV-CL-07 each EL card ends with its totals (loan, due, paid this month)", async () => {
    setup();
    await openCollections();
    const ten = await screen.findByTestId("tv-el-ten");
    const foot = ten.querySelector(".cfoot")!;
    expect(foot).toHaveTextContent(T.total);
    expect(foot).toHaveTextContent("3,80,000");     // 150000 + 80000 + 150000
    expect(foot).toHaveTextContent("1,800");        // 1000 + 500 + 300
    expect(foot).toHaveTextContent("1,200");        // 1000 + 200 + 0
  });

  it("TV-CL-08 right half: தவணை, only the six columns - name, start date, loan, balance, phone, days (no வசூல் / இந்த மாதம்)", async () => {
    setup();
    await openCollections();
    const card = await screen.findByTestId("tv-edi-long");
    expect(screen.getByText(T.thavanai)).toBeInTheDocument();
    for (const h of [T.colName, T.colLastPay, T.colLoan, T.colBalance, T.colPhone, T.colDays]) expect(within(card).getByText(h)).toBeInTheDocument();
    expect(within(card).queryByText(T.colDue)).not.toBeInTheDocument();
    expect(within(card).queryByText(T.colThisMonth)).not.toBeInTheDocument();
    const rows = within(card).getAllByTestId("tv-edi-long-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("செல்வம் கே");
    expect(rows[0]).toHaveTextContent("#0112");
    expect(rows[0]).toHaveTextContent("22/07/2026");
    expect(rows[0]).toHaveTextContent("25,000");
    expect(rows[0]).toHaveTextContent("11,800");
    expect(rows[0]).toHaveTextContent("98765 43210");
    expect(rows[0]).toHaveTextContent("112");
    expect(rows[1]).toHaveTextContent("90031 22817");
    expect(rows[1]).toHaveTextContent("—");                                   // never paid: no last-payment date to show
  });

  it("TV-CL-16 EL has the Yesterday / Today / Tomorrow tabs; it opens on Today with the counts, like the Reminder report", async () => {
    setup();
    await openCollections();
    const today = await screen.findByTestId("tv-day-today");
    expect(today).toHaveFocus();
    expect(today).toHaveAttribute("aria-selected", "true");
    expect(today).toHaveTextContent(T.today);
    expect(today).toHaveTextContent("4");                                     // 3 + 1 due today
    expect(screen.getByTestId("tv-day-yesterday")).toHaveTextContent("1");
    expect(screen.getByTestId("tv-day-tomorrow")).toHaveTextContent("3");
    expect(screen.getByTestId("tv-day-date")).toHaveTextContent("11/11/2026");
    expect(within(screen.getByTestId("tv-el-ten")).getAllByTestId("tv-el-ten-row")).toHaveLength(3);
  });

  it("TV-CL-17 Right goes to Tomorrow and Left to Yesterday: the lists and the date follow", async () => {
    setup();
    await openCollections();
    await screen.findByTestId("tv-el-ten");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("tv-day-tomorrow")).toHaveFocus();
    expect(screen.getByTestId("tv-day-tomorrow")).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByTestId("tv-el-ten")).getAllByTestId("tv-el-ten-row")).toHaveLength(2);
    expect(within(screen.getByTestId("tv-el-month")).getAllByTestId("tv-el-month-row")).toHaveLength(1);
    expect(screen.getByTestId("tv-day-date")).toHaveTextContent("12/11/2026");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("tv-day-yesterday")).toHaveFocus();
    expect(within(screen.getByTestId("tv-el-ten")).getAllByTestId("tv-el-ten-row")).toHaveLength(1);
    expect(within(screen.getByTestId("tv-el-month")).queryAllByTestId("tv-el-month-row")).toHaveLength(0);
    expect(screen.getByTestId("tv-day-date")).toHaveTextContent("10/11/2026");
    fireEvent.keyDown(window, { key: "ArrowLeft" });                          // already on the first tab: stays
    expect(screen.getByTestId("tv-day-yesterday")).toHaveFocus();
  });

  it("TV-CL-18 the தவணை side does not change with the day tabs", async () => {
    setup();
    await openCollections();
    await screen.findByTestId("tv-edi-long");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(within(screen.getByTestId("tv-edi-long")).getAllByTestId("tv-edi-long-row")).toHaveLength(2);
  });

  it("TV-CL-19 the தவணை heading says no payment for 95 days (the Defaulter report), not 'since the loan start'", async () => {
    setup();
    await openCollections();
    expect(await screen.findByText(T.longLoans)).toBeInTheDocument();
    expect(T.longLoans).toContain("95");
  });

  it("TV-CL-09 the தவணை total row adds loan and balance", async () => {
    setup();
    await openCollections();
    const card = await screen.findByTestId("tv-edi-long");
    const foot = card.querySelector(".cfoot")!;
    expect(foot).toHaveTextContent("75,000");
    expect(foot).toHaveTextContent("43,800");
  });

  it("TV-CL-10 nobody in a group: a Tamil 'no one' note, and the page still works", async () => {
    setup({ as_of: "2026-11-11", el: { yesterday: EMPTY_DAY, today: EMPTY_DAY, tomorrow: EMPTY_DAY }, edi_long: [] });
    await openCollections();
    await waitFor(() => expect(screen.getAllByText(T.noOne)).toHaveLength(3));
  });

  it("TV-CL-11 Back returns to the first screen", async () => {
    setup();
    await openCollections();
    expect((window as any).__ggtvBack()).toBe(true);
    await screen.findByRole("button", { name: T.collect });
    expect(screen.queryByTestId("tv-collect")).not.toBeInTheDocument();
  });

  it("TV-CL-12 a token the server has forgotten sends the TV back to the pairing code", async () => {
    setup();
    api.collections.mockRejectedValue(unauthorized());
    await openCollections();
    await waitFor(() => expect(localStorage.getItem("gg_tv_token")).toBeNull());
  });

  it("TV-CL-13 a server error shows a Tamil message (and it keeps trying every 2 minutes)", async () => {
    setup();
    api.collections.mockRejectedValue(new Error("net"));
    await openCollections();
    expect(await screen.findByText(T.collectError)).toBeInTheDocument();
  });
});

describe("collections helpers (TV-CL)", () => {
  it("TV-CL-14 rows are 52px when there is room, shrink to fill the card, and stop at 30px (the rest is left out)", () => {
    expect(fitRows(5, 400)).toEqual({ rowH: 52, shown: 5 });
    expect(fitRows(10, 400)).toEqual({ rowH: 40, shown: 10 });
    const tight = fitRows(30, 600);
    expect(tight.rowH).toBe(30);
    expect(tight.shown).toBe(20);
    expect(fitRows(0, 400).shown).toBe(0);
  });

  it("TV-CL-15 the id is # + four digits and the phone is two halves", () => {
    expect(idNo(201)).toBe("#0201");
    expect(idNo(12345)).toBe("#12345");
    expect(fmtPhone("9962034455")).toBe("99620 34455");
    expect(fmtPhone("99620 34455")).toBe("99620 34455");
    expect(fmtPhone("234-5678")).toBe("234-5678");          // not ten digits: shown as it is
    expect(fmtPhone(null)).toBe("");
  });
});
