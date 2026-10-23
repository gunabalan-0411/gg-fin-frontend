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
    const b = { amount: 10000, principal: 0 };
    expect(patchForPrincipal("9500", b)).toEqual({ principal: 9500, amount: 10000 });
    expect(patchForPrincipal("", b)).toEqual({ principal: 0, amount: 10000 });
    expect(patchForPrincipal("abc", b)).toEqual({ principal: 0, amount: 10000 });
    expect(patchForPrincipal("9500.456", b)).toEqual({ principal: 9500.46, amount: 10000 });
  });

  it("interest typed -> the principal is what is left of the amount", () => {
    const b = { amount: 10000, principal: 0 };
    expect(patchForInterest("500", b)).toEqual({ principal: 9500, amount: 10000 });
    expect(patchForInterest("", b)).toEqual({ principal: 10000, amount: 10000 });           // no interest: all principal
    expect(patchForInterest("10000", b)).toEqual({ principal: 0, amount: 10000 });
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

describe("a principal or interest bigger than the amount is paid ON TOP (never a negative interest)", () => {
  it("amount 200 (the interest), principal 8000 typed -> amount 8200, interest 200, principal 8000", () => {
    const patch = patchForPrincipal("8000", { amount: 200, principal: 0 });
    expect(patch).toEqual({ principal: 8000, amount: 8200 });
    const row: SplitRow = { product_type: "IOP", is_paid: true, amount: patch.amount, principal: patch.principal };
    expect(interestOf(row)).toBe(200);
    expect(localSplitIssue(row)).toBeNull();
  });

  it("the answer depends only on where the typing started, not on the digits typed before (8, 80, 800, 8000)", () => {
    const start = { amount: 200, principal: 0 };
    expect(patchForPrincipal("8", start)).toEqual({ principal: 8, amount: 200 });           // still fits: a split of the 200
    expect(patchForPrincipal("80", start)).toEqual({ principal: 80, amount: 200 });
    expect(patchForPrincipal("800", start)).toEqual({ principal: 800, amount: 1000 });
    expect(patchForPrincipal("8000", start)).toEqual({ principal: 8000, amount: 8200 });
  });

  it("when the principal is changed again the interest stays what it was", () => {
    expect(patchForPrincipal("9000", { amount: 8200, principal: 8000 })).toEqual({ principal: 9000, amount: 9200 });
    expect(patchForPrincipal("5000", { amount: 8200, principal: 8000 })).toEqual({ principal: 5000, amount: 8200 });   // fits: the 8,200 is split again
  });

  it("an interest bigger than the amount is paid on top of the principal", () => {
    expect(patchForInterest("12000", { amount: 10000, principal: 9500 })).toEqual({ principal: 9500, amount: 21500 });
  });

  it("emptying the principal box brings the amount back to the original", () => {
    expect(patchForPrincipal("", { amount: 200, principal: 0 })).toEqual({ principal: 0, amount: 200 });
  });
});
