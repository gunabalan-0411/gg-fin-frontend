/**
 * The home-TV page (/tv): pairing, the one-circle home, mic + fuzzy search, customer + loan, every payment with GG / red X, totals.
 * TV-FE-01 ... TV-FE-44. The server is mocked at the tvClient; the matching itself is tested in the backend (tests/test_tv.py).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/tv/tvClient", async () => {
  const actual = await vi.importActual<typeof import("@/tv/tvClient")>("@/tv/tvClient");
  return { ...actual, tvClient: { pairStart: vi.fn(), pairPoll: vi.fn(), me: vi.fn(), search: vi.fn(), customer: vi.fn() } };
});

import { tvClient } from "@/tv/tvClient";
import TvPage from "./TvPage";
import PaymentsPanel from "./PaymentsPanel";
import { T } from "./text";
import { isTvPath } from "@/App";
import type { TvCustomer, TvPayment, TvSearchHit } from "./types";

type Fn = ReturnType<typeof vi.fn>;
const api = tvClient as unknown as Record<"pairStart" | "pairPoll" | "me" | "search" | "customer", Fn>;

const unauthorized = () => Object.assign(new Error("401"), { response: { status: 401 } });

const SELVAM_HIT: TvSearchHit = { product: "edi", customer_id: 101, name_en: "Selvam K", name_ta: "செல்வம் கே", outstanding: 11800, score: 100 };
const SELVI_HIT: TvSearchHit = { product: "iop", customer_id: 202, name_en: "Selvi Ammal", name_ta: "செல்வி அம்மாள்", outstanding: 100000, score: 67 };

function pays(n: number, extra: Partial<TvPayment> = {}): TvPayment[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2026, 10, 9 - (i % 9), 0, 0, 0)).toISOString().slice(0, 10), amount: 250, principal: 0, gg: i % 2 === 0, paid: true, ...extra,
  }));
}
const SELVAM: TvCustomer = {
  product: "edi", customer_id: 101, name_en: "Selvam K", name_ta: "செல்வம் கே", phone: "98765 43210", address: "காமராஜர் தெரு",
  loan_start_date: "2026-08-14", loan_amount: 25000, disbursed_amount: 22500, interest: 2500, outstanding: 11800, total_paid: 13200,
  payments: [
    { date: "2026-11-09", amount: 250, principal: 0, gg: true, paid: true },
    { date: "2026-11-08", amount: 250, principal: 0, gg: true, paid: false },     // GG but the money did not come: red X
    { date: "2026-11-07", amount: 250, principal: 0, gg: false, paid: true },     // cash
  ],
};
const SELVI: TvCustomer = {
  product: "iop", customer_id: 202, name_en: "Selvi Ammal", name_ta: "செல்வி அம்மாள்", phone: "96000 77889", address: "அவிநாசி சாலை",
  loan_start_date: "2026-04-20", loan_amount: 100000, principal_paid: 25000, interest: 2000, outstanding: 100000, total_paid: 37000,
  payments: [{ date: "2026-10-20", amount: 14500, principal: 12500, gg: false, paid: true }],
};

function setup(over: { token?: string | null; search?: TvSearchHit[] } = {}) {
  localStorage.clear();
  if (over.token !== null) localStorage.setItem("gg_tv_token", over.token ?? "ggtv_abc");
  api.me.mockResolvedValue({ data: { name: "Living room TV" } });
  api.search.mockImplementation(async (_t: string, q: string) => ({ data: { results: q.trim() ? (over.search ?? [SELVAM_HIT, SELVI_HIT]) : [] } }));
  api.customer.mockImplementation(async (_t: string, product: string, id: number) => ({ data: product === "edi" && id === 101 ? SELVAM : SELVI }));
  return render(<TvPage />);
}

async function openSearch() {
  fireEvent.click(screen.getByRole("button", { name: T.openCustomers }));
  await screen.findByLabelText(T.search);
}
const type = (text: string) => fireEvent.change(screen.getByLabelText(T.search), { target: { value: text } });

beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); delete (window as any).GGTV; });
afterEach(() => { vi.useRealTimers(); delete (window as any).GGTV; delete (window as any).__ggtvHeard; delete (window as any).__ggtvListenEnd; delete (window as any).__ggtvNoMic; delete (window as any).__ggtvMicKey; delete (window as any).__ggtvBack; });

describe("pairing", () => {
  it("TV-FE-01 an unpaired TV shows a big 6-digit code and the steps, in Tamil", async () => {
    setup({ token: null });
    api.pairStart.mockResolvedValue({ data: { code: "483915", poll_id: "p".repeat(30), expires_in: 600 } });
    api.pairPoll.mockResolvedValue({ data: { status: "pending" } });
    // pairStart is called on mount; render happened before the mock - render again cleanly
    document.body.innerHTML = "";
    localStorage.clear();
    render(<TvPage />);
    await waitFor(() => expect(screen.getByTestId("tv-code")).toHaveTextContent("483 915"));
    expect(screen.getByText(T.pairTitle)).toBeInTheDocument();
    T.pairSteps.forEach((s) => expect(screen.getByText(s)).toBeInTheDocument());
    expect(api.me).not.toHaveBeenCalled();                                  // nothing to check without a token
  });

  it("TV-FE-02 once approved, the token is kept and the TV goes to the home circle", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    api.pairStart.mockResolvedValue({ data: { code: "111222", poll_id: "q".repeat(30), expires_in: 600 } });
    api.pairPoll.mockResolvedValueOnce({ data: { status: "pending" } }).mockResolvedValue({ data: { status: "approved", token: "ggtv_new", name: "TV" } });
    api.me.mockResolvedValue({ data: { name: "TV" } });
    render(<TvPage />);
    await screen.findByTestId("tv-code");
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(api.pairPoll).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(await screen.findByRole("button", { name: T.openCustomers })).toBeInTheDocument();
    expect(localStorage.getItem("gg_tv_token")).toBe("ggtv_new");
    expect(api.pairPoll).toHaveBeenCalledWith("q".repeat(30));
  });

  it("TV-FE-03 an expired code is replaced by a new one by itself", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    api.pairStart.mockResolvedValueOnce({ data: { code: "100000", poll_id: "a".repeat(30), expires_in: 600 } })
      .mockResolvedValue({ data: { code: "200000", poll_id: "b".repeat(30), expires_in: 600 } });
    api.pairPoll.mockResolvedValueOnce({ data: { status: "expired" } }).mockResolvedValue({ data: { status: "pending" } });
    render(<TvPage />);
    await waitFor(() => expect(screen.getByTestId("tv-code")).toHaveTextContent("100 000"));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    await waitFor(() => expect(screen.getByTestId("tv-code")).toHaveTextContent("200 000"));
    expect(api.pairStart).toHaveBeenCalledTimes(2);
  });

  it("TV-FE-04 no network: it says so and keeps trying", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    api.pairStart.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ data: { code: "300000", poll_id: "c".repeat(30), expires_in: 600 } });
    api.pairPoll.mockResolvedValue({ data: { status: "pending" } });
    render(<TvPage />);
    expect(await screen.findByText(T.pairError)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    expect(await screen.findByText("300 000")).toBeInTheDocument();
  });

  it("TV-FE-05 a token the server no longer accepts sends the TV back to the code screen", async () => {
    localStorage.setItem("gg_tv_token", "ggtv_old");
    api.me.mockRejectedValue(unauthorized());
    api.pairStart.mockResolvedValue({ data: { code: "400000", poll_id: "d".repeat(30), expires_in: 600 } });
    api.pairPoll.mockResolvedValue({ data: { status: "pending" } });
    render(<TvPage />);
    await waitFor(() => expect(screen.getByTestId("tv-code")).toHaveTextContent("400 000"));
    expect(localStorage.getItem("gg_tv_token")).toBeNull();
  });

  it("TV-FE-06 a network error while checking the token does NOT unpair the TV", async () => {
    setup();
    api.me.mockRejectedValue(new Error("offline"));
    await waitFor(() => expect(screen.getByRole("button", { name: T.openCustomers })).toBeInTheDocument());
    expect(localStorage.getItem("gg_tv_token")).toBe("ggtv_abc");
  });
});

describe("home and search", () => {
  it("TV-FE-07 the first screen is exactly one circle button", async () => {
    setup();
    const circle = await screen.findByRole("button", { name: T.openCustomers });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(circle).toHaveFocus();
    expect(screen.queryByLabelText(T.search)).not.toBeInTheDocument();
  });

  it("TV-FE-08 OK on the circle opens search; the MIC is focused first", async () => {
    setup();
    await openSearch();
    expect(screen.getByRole("button", { name: T.speak })).toHaveFocus();
    expect(screen.getByText(T.micHint)).toBeInTheDocument();
    expect(screen.getByText(T.noneSelected)).toBeInTheDocument();
    expect(screen.getByText(T.paymentsHere)).toBeInTheDocument();
  });

  it("TV-FE-09 typing searches (after a short pause) with the device token and shows the names, Tamil first", async () => {
    setup();
    await openSearch();
    type("selvem");
    const opts = await screen.findAllByTestId("tv-suggestion");
    expect(api.search).toHaveBeenCalledWith("ggtv_abc", "selvem", "iop");
    expect(opts).toHaveLength(2);
    expect(opts[0]).toHaveTextContent("செல்வம் கே");
    expect(opts[0]).toHaveTextContent("Selvam K");
    expect(opts[0]).toHaveTextContent("11,800");
    expect(opts[0]).toHaveAttribute("aria-selected", "true");               // the best guess is already open
    expect(opts[1]).toHaveAttribute("aria-selected", "false");
  });

  it("TV-FE-10 the best guess's customer, loan and payments appear without another key press", async () => {
    setup();
    await openSearch();
    type("selvem");
    const card = await screen.findByTestId("tv-customer");
    await waitFor(() => expect(within(card).getByText("98765 43210")).toBeInTheDocument());
    expect(api.customer).toHaveBeenCalledWith("ggtv_abc", "edi", 101);
    expect(within(card).getByText("14/08/2026")).toBeInTheDocument();       // Indian date order
    expect(within(card).getByText("காமராஜர் தெரு")).toBeInTheDocument();
    for (const t of [T.loan, T.given, T.interest]) expect(within(card).getByText(t)).toBeInTheDocument();
    expect(within(card).getByText("25,000")).toBeInTheDocument();
    expect(within(card).getByText("22,500")).toBeInTheDocument();
    expect(within(card).getByText("2,500")).toBeInTheDocument();
  });

  it("TV-FE-11 an IOP customer shows principal paid and interest per month instead", async () => {
    setup({ search: [SELVI_HIT] });
    await openSearch();
    type("selvi");
    const card = await screen.findByTestId("tv-customer");
    await waitFor(() => expect(within(card).getByText(T.principalPaid)).toBeInTheDocument());
    expect(within(card).getByText(T.interestPerMonth)).toBeInTheDocument();
    expect(within(card).queryByText(T.given)).not.toBeInTheDocument();
    expect(within(card).getByText("25,000")).toBeInTheDocument();
  });

  it("TV-FE-12 nothing found says so in Tamil", async () => {
    setup({ search: [] });
    await openSearch();
    type("xqzv");
    expect(await screen.findByText(T.notFound)).toBeInTheDocument();
    expect(screen.getByText(T.noneSelected)).toBeInTheDocument();
  });

  it("TV-FE-13 down from the mic into the names previews each one as you land on it", async () => {
    setup();
    await openSearch();
    type("sel");
    await screen.findAllByTestId("tv-suggestion");
    await waitFor(() => expect(api.customer).toHaveBeenCalledWith("ggtv_abc", "edi", 101));
    fireEvent.keyDown(window, { key: "ArrowDown" });
    const opts = screen.getAllByTestId("tv-suggestion");
    expect(opts[0]).toHaveFocus();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(opts[1]).toHaveFocus();
    await waitFor(() => expect(api.customer).toHaveBeenCalledWith("ggtv_abc", "iop", 202));
    expect(opts[1]).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(within(screen.getByTestId("tv-customer")).getByText("96000 77889")).toBeInTheDocument());
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(opts[0]).toHaveFocus();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByRole("button", { name: T.speak })).toHaveFocus();     // up from the first name goes back to the mic
  });

  it("TV-FE-14 a customer opened twice within a minute is not fetched twice", async () => {
    setup();
    await openSearch();
    type("sel");
    await screen.findAllByTestId("tv-suggestion");
    await waitFor(() => expect(api.customer).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    await waitFor(() => expect(api.customer).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(window, { key: "ArrowUp" });
    await waitFor(() => expect(within(screen.getByTestId("tv-customer")).getByText("98765 43210")).toBeInTheDocument());
    expect(api.customer).toHaveBeenCalledTimes(2);
  });

  it("TV-FE-15 typing a letter with the focus anywhere goes to the search box", async () => {
    setup();
    await openSearch();
    fireEvent.keyDown(window, { key: "s" });
    expect(screen.getByLabelText(T.search)).toHaveFocus();
  });

  it("TV-FE-16 a revoked TV (401 while searching) goes back to the code screen", async () => {
    setup();
    api.pairStart.mockResolvedValue({ data: { code: "500000", poll_id: "e".repeat(30), expires_in: 600 } });
    api.pairPoll.mockResolvedValue({ data: { status: "pending" } });
    await openSearch();
    api.search.mockRejectedValue(unauthorized());
    type("selvam");
    await waitFor(() => expect(screen.getByTestId("tv-code")).toHaveTextContent("500 000"));
    expect(localStorage.getItem("gg_tv_token")).toBeNull();
  });
});

describe("mic", () => {
  it("TV-FE-17 OK on the mic asks the Android app to listen, and what it heard is searched", async () => {
    const listen = vi.fn();
    setup();
    (window as any).GGTV = { listen };
    await openSearch();
    fireEvent.click(screen.getByRole("button", { name: T.speak }));
    expect(listen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: T.speak })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(T.listeningHint)).toBeInTheDocument();
    act(() => { (window as any).__ggtvHeard("murgan"); });
    await waitFor(() => expect(api.search).toHaveBeenCalledWith("ggtv_abc", "murgan", "iop"));
    expect(screen.getByLabelText(T.search)).toHaveValue("murgan");
    expect(screen.getByRole("button", { name: T.speak })).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findAllByTestId("tv-suggestion")).toHaveLength(2);
  });

  it("TV-FE-18 hearing nothing stops listening and says so (in Tamil)", async () => {
    setup();
    (window as any).GGTV = { listen: vi.fn() };
    await openSearch();
    fireEvent.click(screen.getByRole("button", { name: T.speak }));
    act(() => { (window as any).__ggtvListenEnd(); });
    await waitFor(() => expect(screen.getByRole("button", { name: T.speak })).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByLabelText(T.search)).toHaveValue("");
    expect(screen.getByText(T.notHeard)).toBeInTheDocument();
  });

  it("TV-FE-18b the app saying this TV has no speech service shows the typing message", async () => {
    setup();
    (window as any).GGTV = { listen: vi.fn() };
    await openSearch();
    fireEvent.click(screen.getByRole("button", { name: T.speak }));
    act(() => { (window as any).__ggtvNoMic(); });
    expect(await screen.findByText(T.noMic)).toBeInTheDocument();
    expect(screen.getByLabelText(T.search)).toHaveFocus();
  });

  it("TV-FE-18c the remote's own mic key (window.__ggtvMicKey) listens like the on-screen mic, and only while the search is open", async () => {
    const listen = vi.fn();
    setup();
    (window as any).GGTV = { listen };
    expect((window as any).__ggtvMicKey).toBeUndefined();                    // the circle home screen: the key does nothing
    await openSearch();
    act(() => { (window as any).__ggtvMicKey(); });
    expect(listen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: T.speak })).toHaveAttribute("aria-pressed", "true");
    act(() => { (window as any).__ggtvHeard("murgan"); });
    await waitFor(() => expect(api.search).toHaveBeenCalledWith("ggtv_abc", "murgan", "iop"));
    expect(screen.getByLabelText(T.search)).toHaveValue("murgan");
  });

  it("TV-FE-18d press and hold OK on the bar: listening starts on key down (repeats ignored) and the recording is stopped on key up", async () => {
    const listen = vi.fn(), stop = vi.fn();
    setup();
    (window as any).GGTV = { listen, stop };
    await openSearch();
    const bar = screen.getByTestId("tv-bar");
    expect(bar).toHaveFocus();                                               // the whole bar is the one focus stop (it glows) - not a little mic button
    fireEvent.keyDown(bar, { key: "Enter" });
    expect(listen).toHaveBeenCalledTimes(1);
    expect(bar.parentElement).toHaveClass("listen");
    expect(screen.getByText(T.listeningHint)).toBeInTheDocument();
    fireEvent.keyDown(bar, { key: "Enter", repeat: true });
    fireEvent.keyDown(bar, { key: "Enter", repeat: true });
    expect(listen).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    fireEvent.keyUp(bar, { key: "Enter" });
    expect(stop).toHaveBeenCalledTimes(1);
    act(() => { (window as any).__ggtvHeard("murgan"); });
    await waitFor(() => expect(api.search).toHaveBeenCalledWith("ggtv_abc", "murgan", "iop"));
    expect(bar.parentElement).not.toHaveClass("listen");
    fireEvent.keyUp(bar, { key: "Enter" });                                  // a stray key up does not stop anything
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("TV-FE-19 a second press while listening does not start a second recognition", async () => {
    const listen = vi.fn();
    setup();
    (window as any).GGTV = { listen };
    await openSearch();
    fireEvent.click(screen.getByRole("button", { name: T.speak }));
    fireEvent.click(screen.getByRole("button", { name: T.speak }));
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it("TV-FE-20 no speech support anywhere: a Tamil message, and typing still works", async () => {
    setup();
    await openSearch();
    fireEvent.click(screen.getByRole("button", { name: T.speak }));
    expect(await screen.findByText(T.noMic)).toBeInTheDocument();
    expect(screen.getByLabelText(T.search)).toHaveFocus();
    type("selvam");
    expect(await screen.findAllByTestId("tv-suggestion")).toHaveLength(2);
  });

  it("TV-FE-21 a second mic press clears the previous words first", async () => {
    setup();
    (window as any).GGTV = { listen: vi.fn() };
    await openSearch();
    type("selvam");
    await screen.findAllByTestId("tv-suggestion");
    fireEvent.click(screen.getByRole("button", { name: T.speak }));
    expect(screen.getByLabelText(T.search)).toHaveValue("");
    expect(screen.getByText(T.listeningHint)).toBeInTheDocument();
  });
});

describe("Back", () => {
  it("TV-FE-22 Back clears the search; Back on an empty search returns to the circle", async () => {
    setup();
    await openSearch();
    type("selvam");
    await screen.findAllByTestId("tv-suggestion");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByLabelText(T.search)).toHaveValue("");
    expect(screen.getByRole("button", { name: T.speak })).toHaveFocus();
    expect(screen.getByText(T.micHint)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(await screen.findByRole("button", { name: T.openCustomers })).toBeInTheDocument();
  });

  it("TV-FE-23 the Android Back key (window.__ggtvBack) does the same, and says when the app may close", async () => {
    setup();
    await screen.findByRole("button", { name: T.openCustomers });
    expect((window as any).__ggtvBack()).toBe(false);                        // on the circle: the app may close
    fireEvent.click(screen.getByRole("button", { name: T.openCustomers }));
    await screen.findByLabelText(T.search);
    type("selvam");
    await screen.findAllByTestId("tv-suggestion");
    let handled = false;
    act(() => { handled = (window as any).__ggtvBack(); });
    expect(handled).toBe(true);                                              // cleared the search
    expect(screen.getByLabelText(T.search)).toHaveValue("");
    act(() => { handled = (window as any).__ggtvBack(); });
    expect(handled).toBe(true);                                              // went home
    expect(await screen.findByRole("button", { name: T.openCustomers })).toBeInTheDocument();
    expect((window as any).__ggtvBack()).toBe(false);
  });

  it("TV-FE-24 Backspace outside the text box counts as Back; inside it only deletes a letter", async () => {
    setup();
    await openSearch();
    type("selvam");
    await screen.findAllByTestId("tv-suggestion");
    screen.getByLabelText(T.search).focus();
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(screen.getByLabelText(T.search)).toHaveValue("selvam");
    screen.getByRole("button", { name: T.speak }).focus();
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(screen.getByLabelText(T.search)).toHaveValue("");
  });
});

describe("payments", () => {
  it("TV-FE-25 every payment row: date, GG tag only on Google Pay, amount; red X only on a GG row that was not paid", async () => {
    setup();
    await openSearch();
    type("selvam");
    const rows = await screen.findAllByTestId("tv-payment");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("09/11/2026")).toBeInTheDocument();
    expect(within(rows[0]).getByText("GG")).toBeInTheDocument();
    expect(within(rows[0]).queryByTestId("tv-x")).not.toBeInTheDocument();
    expect(within(rows[1]).getByText("GG")).toBeInTheDocument();
    expect(within(rows[1]).getByTestId("tv-x")).toBeInTheDocument();         // GG + not paid
    expect(rows[1]).toHaveClass("unpaid");
    expect(within(rows[2]).queryByText("GG")).not.toBeInTheDocument();      // cash: no tag, and no X
    expect(within(rows[2]).queryByTestId("tv-x")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("tv-x")).toHaveLength(1);
    expect(screen.getByTestId("tv-legend")).toHaveTextContent(T.notReceived);
  });

  it("TV-FE-26 total paid and balance to pay are at the bottom", async () => {
    setup();
    await openSearch();
    type("selvam");
    await waitFor(() => expect(screen.getByTestId("tv-total-paid")).toHaveTextContent("13,200"));
    expect(screen.getByTestId("tv-balance")).toHaveTextContent("11,800");
    expect(screen.getByText(T.totalPaid)).toBeInTheDocument();
    expect(screen.getByText(T.balance)).toBeInTheDocument();
    const panel = screen.getByTestId("tv-payments");
    const rows = within(panel).getByTestId("tv-rows"), total = within(panel).getByTestId("tv-total-paid");
    expect(rows.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("TV-FE-27 a customer with nothing left to pay shows 'loan finished' in green", async () => {
    setup();
    api.customer.mockResolvedValue({ data: { ...SELVAM, outstanding: 0, payments: [] } });
    await openSearch();
    type("selvam");
    await waitFor(() => expect(screen.getByText(T.loanDone)).toBeInTheDocument());
    expect(screen.getByTestId("tv-balance")).toHaveTextContent("0");
    expect(screen.queryByTestId("tv-legend")).not.toBeInTheDocument();
  });

  it("TV-FE-28 an IOP row with principal carries the principal tag, not GG", async () => {
    setup({ search: [SELVI_HIT] });
    await openSearch();
    type("selvi");
    const rows = await screen.findAllByTestId("tv-payment");
    expect(within(rows[0]).getByText(T.principal)).toBeInTheDocument();
    expect(within(rows[0]).getByText("14,500")).toBeInTheDocument();
  });

  it("TV-FE-29 a cash row that was not collected is dimmed, with no red X", () => {
    const c: TvCustomer = { ...SELVAM, payments: [{ date: "2026-11-09", amount: 250, principal: 0, gg: false, paid: false }] };
    render(<PaymentsPanel customer={c} />);
    const row = screen.getByTestId("tv-payment");
    expect(row).toHaveClass("skipped");
    expect(screen.queryByTestId("tv-x")).not.toBeInTheDocument();
  });
});

describe("show everything (no scroll bar)", () => {
  const size = (h: number, w: number) => {
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get() { return this.classList?.contains("rows") ? h : 0; } });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return this.classList?.contains("rows") ? w : 0; } });
  };
  afterEach(() => { delete (HTMLElement.prototype as any).clientHeight; delete (HTMLElement.prototype as any).clientWidth; });
  const withPayments = (n: number): TvCustomer => ({ ...SELVAM, payments: pays(n) });

  it("TV-FE-30 a few payments are drawn in one big column with full years", () => {
    size(504, 768);
    render(<PaymentsPanel customer={withPayments(6)} />);
    expect(screen.getAllByTestId("tv-payment")).toHaveLength(6);
    expect(screen.getByTestId("tv-rows")).toHaveAttribute("data-cols", "1");
    expect(screen.getAllByTestId("tv-payment")[0]).toHaveTextContent(/\d\d\/\d\d\/\d{4}/);
    expect(screen.getByTestId("tv-more")).toHaveTextContent("");
  });

  it("TV-FE-31 a long history is ALL there, in three columns with short years, no 'more' note", () => {
    size(504, 768);
    render(<PaymentsPanel customer={withPayments(53)} />);
    expect(screen.getAllByTestId("tv-payment")).toHaveLength(53);
    expect(screen.getByTestId("tv-rows")).toHaveAttribute("data-cols", "3");
    expect(screen.getAllByTestId("tv-payment")[0]).toHaveTextContent(/\d\d\/\d\d\/\d\d(?!\d)/);
    expect(screen.getByTestId("tv-more")).toHaveTextContent("");
  });

  it("TV-FE-32 past what can be read, the oldest are left out and the count is said", () => {
    size(504, 768);
    render(<PaymentsPanel customer={withPayments(120)} />);
    const shown = screen.getAllByTestId("tv-payment").length;
    expect(shown).toBeLessThan(120);
    expect(screen.getByTestId("tv-more")).toHaveTextContent(T.more(120 - shown));
  });

  it("TV-FE-33 before the screen has been measured every row is drawn (nothing silently dropped)", () => {
    render(<PaymentsPanel customer={withPayments(120)} />);
    expect(screen.getAllByTestId("tv-payment")).toHaveLength(120);
  });
});

describe("the design (EL | தவணை, statement header, plain figures)", () => {
  it("TV-FE-35 the switch EL | தவணை is there, EL (the design's choice) is on, and the search looks only in EL = IOP", async () => {
    setup();
    await openSearch();
    expect(screen.getByTestId("tv-product-iop")).toHaveTextContent("EL");
    expect(screen.getByTestId("tv-product-edi")).toHaveTextContent("தவணை");
    expect(screen.getByTestId("tv-product-iop")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("tv-product-edi")).toHaveAttribute("aria-pressed", "false");
    type("sel");
    await screen.findAllByTestId("tv-suggestion");
    expect(api.search).toHaveBeenLastCalledWith("ggtv_abc", "sel", "iop");
  });

  it("TV-FE-36 choosing தவணை searches in EDI, keeps the words typed, and is remembered", async () => {
    setup();
    await openSearch();
    type("sel");
    await screen.findAllByTestId("tv-suggestion");
    fireEvent.click(screen.getByTestId("tv-product-edi"));
    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith("ggtv_abc", "sel", "edi"));
    expect(screen.getByLabelText(T.search)).toHaveValue("sel");
    expect(screen.getByTestId("tv-product-edi")).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("gg_tv_product")).toBe("edi");
  });

  it("TV-FE-37 the remembered choice is used the next time", async () => {
    setup();
    localStorage.setItem("gg_tv_product", "edi");
    await openSearch();
    expect(screen.getByTestId("tv-product-edi")).toHaveAttribute("aria-pressed", "true");
    type("sel");
    await screen.findAllByTestId("tv-suggestion");
    expect(api.search).toHaveBeenLastCalledWith("ggtv_abc", "sel", "edi");
  });

  it("TV-FE-38 the remote: up from the mic reaches the switch, left / right move between EL and தவணை, OK picks, down returns to the mic", async () => {
    setup();
    await openSearch();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByTestId("tv-product-iop")).toHaveFocus();               // the one that is on
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("tv-product-edi")).toHaveFocus();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("tv-product-iop")).toHaveFocus();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: T.speak })).toHaveFocus();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.click(screen.getByTestId("tv-product-edi"));                    // OK
    expect(screen.getByTestId("tv-product-edi")).toHaveAttribute("aria-pressed", "true");
  });

  it("TV-FE-39 top of the left column: the GG logo, the name of the app and the time", async () => {
    setup();
    await openSearch();
    expect(screen.getByText("GG")).toBeInTheDocument();
    expect(screen.getByText(T.brand)).toBeInTheDocument();
    expect(document.querySelector(".clock")).toHaveTextContent(/^\d{1,2}:\d{2}\s?(am|pm)$/i);
    expect(document.querySelector(".clock")).toHaveClass("num");              // figures are Geist Mono
  });

  it("TV-FE-40 the customer card: CUSTOMER label, big Tamil name, the 'active' pill, phone / date / address, three loan figures", async () => {
    setup();
    await openSearch();
    type("selvem");
    const card = await screen.findByTestId("tv-customer");
    await waitFor(() => expect(within(card).getByText("98765 43210")).toBeInTheDocument());
    expect(within(card).getByText("CUSTOMER")).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "செல்வம் கே" })).toBeInTheDocument();
    expect(within(card).getByText("Selvam K")).toBeInTheDocument();
    expect(within(card).getByText(T.active)).toBeInTheDocument();
    expect(within(card).getByText("14/08/2026")).toBeInTheDocument();
    expect(card.querySelectorAll(".cloan .box")).toHaveLength(3);
  });

  it("TV-FE-41 the statement header: title, STATEMENT · NAME, the account number and the start date with an arrow", async () => {
    setup();
    await openSearch();
    type("selvem");
    const panel = await screen.findByTestId("tv-payments");
    await waitFor(() => expect(within(panel).getByText("STATEMENT · SELVAM K")).toBeInTheDocument());
    expect(within(panel).getByText(T.paid)).toBeInTheDocument();
    expect(within(panel).getByText("#GG-0101")).toBeInTheDocument();
    expect(within(panel).getByText("14/08/2026 →")).toBeInTheDocument();
  });

  it("TV-FE-42 the table has its heading (date, kind, amount) and the missed GG row shows a hollow ring, not a cross", async () => {
    setup();
    await openSearch();
    type("selvem");
    const rows = await screen.findAllByTestId("tv-payment");
    const panel = screen.getByTestId("tv-payments");
    for (const h of [T.colDate, T.colKind, T.colAmount]) expect(within(panel).getByText(h)).toBeInTheDocument();
    const ring = within(rows[1]).getByTestId("tv-x");
    expect(ring).toHaveClass("miss");
    expect(ring.querySelector("svg")).toBeNull();
    expect(within(screen.getByTestId("tv-legend")).getByText(T.notReceived)).toBeInTheDocument();
  });

  it("TV-FE-43 every figure is Geist Mono (class num) and none carries a rupee sign", async () => {
    setup();
    await openSearch();
    type("selvem");
    await screen.findAllByTestId("tv-payment");
    await waitFor(() => expect(screen.getByTestId("tv-total-paid")).toHaveTextContent("13,200"));
    for (const el of [...document.querySelectorAll(".pr .d, .pr .a, .sa, .bv, .lmeta, .clock")]) expect(el, el.textContent ?? "").toHaveClass("num");
    expect(screen.getByTestId("tv-total-paid")).toHaveClass("num");
    expect(screen.getByTestId("tv-balance")).toHaveClass("num");
    expect(document.querySelector(".tv-root")!.textContent).not.toContain("₹");
  });

  it("TV-FE-44 at most three names are listed under the search, so the customer card always fits below", async () => {
    const hits = [1, 2, 3, 4, 5].map((i) => ({ ...SELVAM_HIT, customer_id: 100 + i, name_en: `Selvan ${i}`, name_ta: `செல்வன் ${i}` }));
    setup({ search: hits });
    await openSearch();
    type("selvan");
    expect(await screen.findAllByTestId("tv-suggestion")).toHaveLength(3);
  });
});

describe("routing", () => {
  it("TV-FE-34 /tv and anything under it is the TV page; nothing else is", () => {
    expect(isTvPath("/tv")).toBe(true);
    expect(isTvPath("/tv/")).toBe(true);
    expect(isTvPath("/tv/anything")).toBe(true);
    expect(isTvPath("/tvx")).toBe(false);
    expect(isTvPath("/dashboard")).toBe(false);
    expect(isTvPath("/")).toBe(false);
  });
});
