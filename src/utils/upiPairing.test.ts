import { describe, expect, it } from "vitest";
import {
  applyPairing, consumedIds, ddmmyyyyToIso, dropPairingsForRow, extractedAmount, isSatisfied, matchLabel, matchTags, namesMatch,
  pairedTotal, reconcile, remainingAmount, removePairing, rowForMappedTxn,
  type PairableRow, type PairingState, type UpiTxnLike,
} from "./upiPairing";

const row = (over: Partial<PairableRow> = {}): PairableRow => ({
  uid: "r1", collection_date: "17-10-2026", customer_id: 1, customer_name: "Selvam", extracted_name: "Selvm",
  product_type: "EDI", payment_mode: "ONLINE", is_paid: false, amount: 500, ...over,
});
const txn = (over: Partial<UpiTxnLike> = {}): UpiTxnLike => ({
  id: 10, amount: "500", sender_name: "SELVAM K", sender_vpa: "selvam@upi", transaction_date: "2026-10-17",
  mapped_customer_id: null, mapped_customer_type: null, mapped_customer_name: null, ...over,
});
const state = (rows: PairableRow[] = [row()]): PairingState => ({ rows, pairings: [], originals: {} });
const click = { kind: "click" as const, needsSave: true };

describe("namesMatch — a hint, not a decision", () => {
  it.each([
    ["RAMESH KUMAR", "Ramesh K", true],
    ["SELVAM", "selvam", true],
    ["Selvm", "Selvam", true],                 // one slip in a longer word
    ["Raj", "Rajesh", true],                   // a prefix of 3+ letters
    ["S. KANNAN", "Kannan", true],
    ["KANNAN", "Selvam", false],
    ["Anbu", "Anbarasan", false],
    ["", "Selvam", false],
    [null, "Selvam", false],
    ["செல்வம்", "செல்வம்", true],
  ])("%s ~ %s -> %s", (a, b, expected) => {
    expect(namesMatch(a as string, b as string)).toBe(expected);
  });
});

describe("pairing a transaction with a row (UP-04, UP-05)", () => {
  it("the first payment makes the row Online + Paid with the UPI amount and remembers how it was", () => {
    const s = applyPairing(state([row({ amount: 480 })]), txn({ amount: "500" }), "r1", click);
    expect(s.rows[0]).toMatchObject({ payment_mode: "ONLINE", is_paid: true, amount: 500 });
    expect(s.originals.r1).toEqual({ payment_mode: "ONLINE", is_paid: false, amount: 480 });
    expect(s.pairings).toEqual([{ txnId: 10, rowUid: "r1", amount: 500, kind: "click", needsSave: true, replace: false }]);
  });

  it("a second payment on the same row is ADDED, and the original is kept from the first one", () => {
    let s = applyPairing(state(), txn({ id: 10, amount: "300" }), "r1", click);
    s = applyPairing(s, txn({ id: 11, amount: "200" }), "r1", click);
    expect(s.rows[0].amount).toBe(500);
    expect(pairedTotal(s.pairings, "r1")).toBe(500);
    expect(s.originals.r1.amount).toBe(500);                  // the sheet said 500
    expect(extractedAmount(s.originals, s.rows[0])).toBe(500);
  });

  it("payments on different dates go to different rows and never mix", () => {
    const s0 = state([row({ uid: "r1", collection_date: "17-10-2026" }), row({ uid: "r2", collection_date: "18-10-2026", amount: 200 })]);
    let s = applyPairing(s0, txn({ id: 10, amount: "500" }), "r1", click);
    s = applyPairing(s, txn({ id: 11, amount: "200", transaction_date: "2026-10-18" }), "r2", click);
    expect(s.rows.map((r) => r.amount)).toEqual([500, 200]);
    expect(pairedTotal(s.pairings, "r1")).toBe(500);
    expect(pairedTotal(s.pairings, "r2")).toBe(200);
  });

  it("the same transaction can only be used once, and an unknown row is ignored", () => {
    const s = applyPairing(state(), txn(), "r1", click);
    expect(applyPairing(s, txn(), "r1", click)).toBe(s);
    expect(applyPairing(state(), txn(), "nope", click).pairings).toEqual([]);
    expect(consumedIds(s.pairings)).toEqual(new Set([10]));
  });

  it("Undo of the last payment puts the row back exactly as it was", () => {
    const s0 = state([row({ amount: 480, payment_mode: "CASH", is_paid: true })]);
    const back = removePairing(applyPairing(s0, txn(), "r1", click), 10);
    expect(back.rows[0]).toEqual(s0.rows[0]);
    expect(back.pairings).toEqual([]);
    expect(back.originals).toEqual({});
  });

  it("Undo of one of two payments only takes that amount off — the other stays applied", () => {
    let s = applyPairing(state(), txn({ id: 10, amount: "300" }), "r1", click);
    s = applyPairing(s, txn({ id: 11, amount: "200" }), "r1", click);
    const undone = removePairing(s, 11);
    expect(undone.rows[0]).toMatchObject({ amount: 300, payment_mode: "ONLINE", is_paid: true });
    expect(undone.pairings.map((p) => p.txnId)).toEqual([10]);
    expect(undone.originals.r1).toBeDefined();
    expect(removePairing(undone, 99)).toBe(undone);          // unknown transaction: nothing happens
  });

  it("deleting a row frees its transactions", () => {
    const s = dropPairingsForRow(applyPairing(state(), txn(), "r1", click), "r1");
    expect(s.pairings).toEqual([]);
    expect(s.originals).toEqual({});
  });
});

describe("when the highlight switches itself off (UP-09)", () => {
  it("only once the paired total reaches what the sheet said", () => {
    let s = applyPairing(state(), txn({ id: 10, amount: "300" }), "r1", click);
    expect(isSatisfied(s.originals, s.pairings, s.rows[0])).toBe(false);
    expect(remainingAmount(s.originals, s.pairings, s.rows[0])).toBe(200);
    s = applyPairing(s, txn({ id: 11, amount: "200" }), "r1", click);
    expect(isSatisfied(s.originals, s.pairings, s.rows[0])).toBe(true);
  });

  it("paying more than the sheet also counts as covered, and a row with no payment is never satisfied", () => {
    const s = applyPairing(state(), txn({ amount: "650" }), "r1", click);
    expect(isSatisfied(s.originals, s.pairings, s.rows[0])).toBe(true);
    expect(isSatisfied({}, [], row())).toBe(false);
  });

  it("a payment within half a rupee of the sheet counts as covered", () => {
    const s = applyPairing(state(), txn({ amount: "499.60" }), "r1", click);
    expect(isSatisfied(s.originals, s.pairings, s.rows[0])).toBe(true);
  });
});

describe("match tags (UP-03)", () => {
  const s0 = state();
  it.each([
    [{ amount: "500", sender_name: "SELVAM K" }, "Name & amount match"],
    [{ amount: "500", sender_name: "SOMEONE ELSE" }, "Amount matches"],
    [{ amount: "420", sender_name: "SELVAM K" }, "Name matches"],
    [{ amount: "420", sender_name: "SOMEONE ELSE", sender_vpa: "x@upi" }, null],
  ])("%j -> %s", (over, expected) => {
    expect(matchLabel(matchTags(txn(over as Partial<UpiTxnLike>), s0.rows[0], s0.originals, s0.pairings))).toBe(expected);
  });

  it("falls back to the UPI id when the sender has no name, and also compares with the text the OCR read", () => {
    const viaVpa = matchTags(txn({ sender_name: null, sender_vpa: "selvam@upi" }), row(), {}, []);
    expect(viaVpa.name).toBe(true);
    const viaOcr = matchTags(txn({ sender_name: "SELVM" }), row({ customer_name: "Somebody Else", extracted_name: "Selvm" }), {}, []);
    expect(viaOcr.name).toBe(true);
  });

  it("flags a transaction from another date", () => {
    const t = matchTags(txn({ transaction_date: "2026-10-16" }), row(), {}, []);
    expect(t.otherDate).toBe(true);
    expect(matchLabel(t)).toBe("Name & amount match · other date");
    expect(matchLabel({ name: false, amount: false, otherDate: true })).toBe("other date");
  });

  it("a second payment is compared with what is still unpaid, not with the whole sheet amount", () => {
    const s = applyPairing(state(), txn({ id: 10, amount: "300" }), "r1", click);
    expect(matchTags(txn({ id: 11, amount: "200", sender_name: "X" }), s.rows[0], s.originals, s.pairings).amount).toBe(true);
    expect(matchTags(txn({ id: 12, amount: "500", sender_name: "X" }), s.rows[0], s.originals, s.pairings).amount).toBe(false);
  });
});

describe("rowForMappedTxn (the existing Apply button)", () => {
  const rows = [row({ uid: "a", collection_date: "16-10-2026" }), row({ uid: "b", collection_date: "17-10-2026" }), row({ uid: "c", customer_id: 2 })];
  it("picks the row of that customer + product, preferring the transaction's date", () => {
    expect(rowForMappedTxn(rows, txn({ mapped_customer_id: 1, mapped_customer_type: "edi" }))?.uid).toBe("b");
    expect(rowForMappedTxn(rows, txn({ mapped_customer_id: 1, mapped_customer_type: "edi", transaction_date: "2026-10-16" }))?.uid).toBe("a");
  });
  it("with no row on the transaction's date it falls back to a free row of the customer", () => {
    const other = txn({ mapped_customer_id: 1, mapped_customer_type: "edi", transaction_date: "2026-10-01" });
    expect(rowForMappedTxn(rows, other)?.uid).toBe("a");
    const used = applyPairing({ rows, pairings: [], originals: {} }, txn({ id: 1 }), "a", click).pairings;
    expect(rowForMappedTxn(rows, other, used)?.uid).toBe("b");              // "a" already has a payment, "b" is free
  });
  it("a second payment on a day whose row already has one goes to that SAME row (same day: just add)", () => {
    const used = applyPairing({ rows, pairings: [], originals: {} }, txn({ id: 1 }), "b", click).pairings;
    expect(rowForMappedTxn(rows, txn({ mapped_customer_id: 1, mapped_customer_type: "edi" }), used)?.uid).toBe("b");
  });
  it("returns nothing for another product or an unmapped transaction", () => {
    expect(rowForMappedTxn(rows, txn({ mapped_customer_id: 1, mapped_customer_type: "iop" }))).toBeUndefined();
    expect(rowForMappedTxn(rows, txn())).toBeUndefined();
  });
});

describe("reconcile after the page's own Undo / Redo", () => {
  it("keeps pairings whose row still shows the payment and drops the rest", () => {
    const paired = applyPairing(state([row(), row({ uid: "r2", customer_id: 2 })]), txn({ id: 10 }), "r1", click);
    const both = applyPairing(paired, txn({ id: 11 }), "r2", click);
    expect(reconcile(both)).toBe(both);                                               // nothing changed
    const reverted = { ...both, rows: both.rows.map((r) => (r.uid === "r2" ? { ...r, payment_mode: "CASH" as const, is_paid: true } : r)) };
    const out = reconcile(reverted);
    expect(out.pairings.map((p) => p.txnId)).toEqual([10]);
    expect(Object.keys(out.originals)).toEqual(["r1"]);
    expect(reconcile({ ...both, rows: both.rows.filter((r) => r.uid !== "r1") }).pairings.map((p) => p.txnId)).toEqual([11]);
  });
});

describe("ddmmyyyyToIso", () => {
  it("converts and rejects", () => {
    expect(ddmmyyyyToIso("17-10-2026")).toBe("2026-10-17");
    expect(ddmmyyyyToIso("2026-10-17")).toBe("");
    expect(ddmmyyyyToIso("")).toBe("");
  });
});
