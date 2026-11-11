/** The payment list must show EVERY payment without a scroll bar: rows shrink, then flow into columns. TVL-01 ... TVL-09, FMT-01..04. */
import { describe, expect, it } from "vitest";
import { layoutPayments, ROW_MAX } from "./layout";
import { accountNo, amt, fmtDate, fmtDateShort } from "./format";

// the list area of the design on a 1080p screen: about 440 design px high, 704 wide (a 880px column minus the card's padding); amounts like "3,000"
const base = { height: 440, width: 704, maxChars: 6 };

describe("payments layout (TVL)", () => {
  it("TVL-01 up to ten payments: one column of the design's 44px rows", () => {
    for (const count of [1, 6, 10]) {
      const l = layoutPayments({ ...base, count });
      expect(l.cols, `count ${count}`).toBe(1);
      expect(l.rowH).toBe(ROW_MAX);
      expect(l.hidden).toBe(0);
      expect(l.shortYear).toBe(false);
      expect(l.fontPx).toBeCloseTo(22);                    // the design's date size
    }
  });

  it("TVL-02 more payments: the rows shrink (still one column) while they stay comfortable", () => {
    const l = layoutPayments({ ...base, count: 14 });
    expect(l.cols).toBe(1);
    expect(l.rowH).toBeCloseTo(440 / 14);
    expect(l.rowH).toBeLessThan(ROW_MAX);
  });

  it("TVL-03 then a second column opens, with the full year", () => {
    const l = layoutPayments({ ...base, count: 20 });
    expect(l.cols).toBe(2);
    expect(l.perCol).toBe(10);
    expect(l.hidden).toBe(0);
    expect(l.shortYear).toBe(false);
  });

  it("TVL-04 a long history flows into three columns with a short year - and nothing is left out", () => {
    const l = layoutPayments({ ...base, count: 53 });
    expect(l.cols).toBe(3);
    expect(l.shortYear).toBe(true);
    expect(l.hidden).toBe(0);
    expect(l.perCol * l.cols).toBeGreaterThanOrEqual(53);
    expect(l.rowH * l.perCol).toBeLessThanOrEqual(base.height + 0.001);       // it fits the height: no scroll bar
  });

  it("TVL-05 whatever the count, rows never overflow the area", () => {
    for (const count of [1, 2, 5, 9, 14, 20, 33, 40, 53, 66, 72, 90, 200]) {
      const l = layoutPayments({ ...base, count });
      expect(l.rowH * l.perCol, `count ${count}`).toBeLessThanOrEqual(base.height + 0.001);
      expect(count - l.hidden, `count ${count}`).toBeLessThanOrEqual(l.perCol * l.cols);
    }
  });

  it("TVL-06 only past the smallest readable size are the oldest left out, and the count is exact", () => {
    const l = layoutPayments({ ...base, count: 82 });
    expect(l.cols).toBe(3);
    expect(l.hidden).toBe(82 - l.perCol * 3);
    expect(l.hidden).toBeGreaterThan(0);
    expect(layoutPayments({ ...base, count: l.perCol * 3 }).hidden).toBe(0);   // exactly full is still complete
  });

  it("TVL-07 the text is never bigger than the row or the column allows", () => {
    for (const count of [3, 20, 60]) {
      const l = layoutPayments({ ...base, count });
      expect(l.fontPx).toBeLessThanOrEqual(22 + 0.001);
      expect(l.fontPx).toBeLessThanOrEqual(l.rowH * 0.7 + 0.001);
    }
    const wide = layoutPayments({ ...base, count: 53, maxChars: 9 });         // "1,50,000" needs more width than "3,000"
    const narrow = layoutPayments({ ...base, count: 53, maxChars: 5 });
    expect(wide.fontPx).toBeLessThan(narrow.fontPx);
  });

  it("TVL-08 no payments does not break", () => {
    const l = layoutPayments({ ...base, count: 0 });
    expect(l.cols).toBe(1);
    expect(l.hidden).toBe(0);
    expect(Number.isFinite(l.fontPx)).toBe(true);
  });

  it("TVL-09 the date cell is the design's 200px (9.09em of the 22px font) in one column, narrower when there are columns", () => {
    const one = layoutPayments({ ...base, count: 6 });
    expect(one.dateEm * one.fontPx).toBeCloseTo(200, 0);
    const two = layoutPayments({ ...base, count: 20 });
    const three = layoutPayments({ ...base, count: 53 });
    expect(one.dateEm).toBeGreaterThan(two.dateEm);
    expect(two.dateEm).toBeGreaterThan(three.dateEm);
    expect(two.pillEm).toBeGreaterThan(three.pillEm);
  });
});

describe("TV formats (FMT)", () => {
  it("FMT-01 dates are Indian day/month/year", () => {
    expect(fmtDate("2026-11-09")).toBe("09/11/2026");
    expect(fmtDateShort("2026-11-09")).toBe("09/11/26");
  });
  it("FMT-02 a missing or odd date is empty, not 'undefined'", () => {
    expect(fmtDate(null)).toBe("");
    expect(fmtDate("")).toBe("");
    expect(fmtDate("not a date")).toBe("");
    expect(fmtDateShort(undefined)).toBe("");
  });
  it("FMT-03 amounts use Indian grouping and no rupee sign (the design shows plain figures)", () => {
    expect(amt(250)).toBe("250");
    expect(amt(125000)).toBe("1,25,000");
    expect(amt(1234567.4)).toBe("12,34,567");
    expect(amt(0)).toBe("0");
    expect(amt(125000)).not.toContain("₹");
  });
  it("FMT-04 the account number is #GG- and four digits", () => {
    expect(accountNo(412)).toBe("#GG-0412");
    expect(accountNo(7)).toBe("#GG-0007");
    expect(accountNo(12345)).toBe("#GG-12345");
  });
});
