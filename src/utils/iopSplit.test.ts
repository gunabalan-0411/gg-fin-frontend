import { describe, expect, it } from "vitest";
import { canSplit, checkRecords, interestOf, isSplit, localSplitIssue, patchForInterest, patchForPrincipal, principalOf, wantsCheck, type SplitRow } from "./iopSplit";

const row = (over: Partial<SplitRow> = {}): SplitRow => ({ product_type: "IOP", is_paid: true, amount: 10000, principal: 0, customer_id: 4, ...over });

describe("principal and interest of a row (IS-F1)", () => {
  it("the interest is what is left of the amount after the principal", () => {
    expect(principalOf(row({ principal: 9500 }))).toBe(9500);
    expect(interestOf(row({ principal: 9500 }))).toBe(500);
    expect(interestOf(row())).toBe(10000);                                   // no split: all of it is interest, as before
    expect(isSplit(row({ principal: 9500 }))).toBe(true);
    expect(isSplit(row())).toBe(false);
  });

  it("only a PAID IOP row can carry principal", () => {
    expect(principalOf(row({ principal: 9500, is_paid: false }))).toBe(0);
    expect(principalOf(row({ principal: 9500, product_type: "EDI" }))).toBe(0);
    expect(interestOf(row({ principal: 9500, is_paid: false }))).toBe(10000);
    expect(canSplit(row())).toBe(true);
    expect(canSplit(row({ product_type: "EDI" }))).toBe(false);
  });

  it("a missing or odd principal counts as nothing", () => {
    expect(principalOf(row({ principal: undefined }))).toBe(0);
    expect(principalOf(row({ principal: NaN }))).toBe(0);
  });
});

describe("typing one box fills the other (IS-F2)", () => {
  it("principal typed -> principal set, interest follows", () => {
    expect(patchForPrincipal("9500")).toEqual({ principal: 9500 });
    expect(patchForPrincipal("")).toEqual({ principal: 0 });
    expect(patchForPrincipal("abc")).toEqual({ principal: 0 });
    expect(patchForPrincipal("9500.456")).toEqual({ principal: 9500.46 });
  });

  it("interest typed -> the principal is what is left of the amount", () => {
    expect(patchForInterest({ amount: 10000 }, "500")).toEqual({ principal: 9500 });
    expect(patchForInterest({ amount: 10000 }, "")).toEqual({ principal: 10000 });          // no interest: all principal
    expect(patchForInterest({ amount: 10000 }, "10000")).toEqual({ principal: 0 });
    expect(patchForInterest({ amount: 10000 }, "12000")).toEqual({ principal: -2000 });      // too much interest shows as an error, not silently clamped
  });
});

describe("what the page can see by itself (IS-F3)", () => {
  it("a principal above the amount, or below zero, is a problem", () => {
    expect(localSplitIssue(row({ principal: 9500 }))).toBeNull();
    expect(localSplitIssue(row({ principal: 10000 }))).toBeNull();                           // all principal is fine
    expect(localSplitIssue(row({ principal: 12000 }))).toBe("The principal ₹12,000 is more than the amount collected ₹10,000");
    expect(localSplitIssue(row({ principal: -5 }))).toBe("The principal cannot be negative");
  });

  it("an amount lowered under the principal (e.g. after a UPI pairing) is caught", () => {
    expect(localSplitIssue(row({ principal: 9500, amount: 9000 }))).toContain("more than the amount collected ₹9,000");
  });

  it("unpaid and EDI rows have no issue (their principal does not count)", () => {
    expect(localSplitIssue(row({ principal: 99999, is_paid: false }))).toBeNull();
    expect(localSplitIssue(row({ principal: 99999, product_type: "EDI" }))).toBeNull();
  });
});

describe("the live check (IS-F4)", () => {
  it("sends every IOP row with its principal; rows without a split are included (they share the balance)", () => {
    const rows = [
      { ...row({ principal: 9500 }), collection_date: "17-10-2026", payment_mode: "CASH", customer_name: "Ravi" },
      { ...row({ customer_id: 5 }), collection_date: "17-10-2026", payment_mode: "ONLINE", customer_name: "Kumar" },
    ];
    expect(checkRecords(rows)).toEqual([
      { collection_date: "17-10-2026", customer_name: "Ravi", customer_id: 4, product_type: "IOP", payment_mode: "CASH", is_paid: true, amount: 10000, principal_amount: 9500 },
      { collection_date: "17-10-2026", customer_name: "Kumar", customer_id: 5, product_type: "IOP", payment_mode: "ONLINE", is_paid: true, amount: 10000, principal_amount: 0 },
    ]);
  });

  it("an unpaid row is sent with no principal", () => {
    const [r] = checkRecords([{ ...row({ principal: 9500, is_paid: false }), collection_date: "17-10-2026", payment_mode: "ONLINE" }]);
    expect(r.principal_amount).toBe(0);
  });

  it("a row wants a check only when it is IOP, has a customer, and is open or split", () => {
    expect(wantsCheck({ ...row(), split_open: true })).toBe(true);
    expect(wantsCheck(row({ principal: 100 }))).toBe(true);
    expect(wantsCheck(row())).toBe(false);
    expect(wantsCheck({ ...row({ customer_id: null }), split_open: true })).toBe(false);
    expect(wantsCheck({ ...row({ product_type: "EDI" }), split_open: true })).toBe(false);
  });
});
