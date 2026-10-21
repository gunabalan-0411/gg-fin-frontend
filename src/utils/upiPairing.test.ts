import { describe, expect, it } from "vitest";
import {
  clearLinks, sharesLink, withoutSavedVpa,
  applyPairing, consumedIds, ddmmyyyyToIso, dropPairingsForRow, extractedAmount, findVpaOwner, isSatisfied, matchLabel, matchTags, namesMatch, planAutoPairings,
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

describe("findVpaOwner — who already owns the UPI id (clash caught while pairing)", () => {
  const owner = (t: UpiTxnLike, r: PairableRow, over: Partial<Parameters<typeof findVpaOwner>[2]> = {}) =>
    findVpaOwner(t, r, { saved: [], rows: [r], pairings: [], txnById: () => undefined, ...over });

  it("nobody owns it: no clash", () => {
    expect(owner(txn(), row())).toBeNull();
  });

  it("the transaction is already mapped to another customer", () => {
    const o = owner(txn({ mapped_customer_id: 9, mapped_customer_type: "edi", mapped_customer_name: "Old Owner" }), row());
    expect(o).toMatchObject({ customerId: 9, customerName: "Old Owner", source: "saved" });
  });

  it("the transaction is mapped to THIS customer: no clash", () => {
    expect(owner(txn({ mapped_customer_id: 1, mapped_customer_type: "edi", mapped_customer_name: "Selvam" }), row())).toBeNull();
  });

  it("an older transaction carries no customer, but the UPI id is saved for another one (case-insensitive)", () => {
    const o = owner(txn({ sender_vpa: "Selvam@UPI" }), row(), { saved: [{ upi_vpa: "selvam@upi", customer_id: 7, customer_type: "edi", customer_name: "Other" }] });
    expect(o).toMatchObject({ customerId: 7, customerName: "Other", source: "saved" });
  });

  it("saved for the SAME customer, or for the other product, is no clash", () => {
    expect(owner(txn(), row(), { saved: [{ upi_vpa: "selvam@upi", customer_id: 1, customer_type: "edi", customer_name: "Selvam" }] })).toBeNull();
    expect(owner(txn(), row(), { saved: [{ upi_vpa: "selvam@upi", customer_id: 7, customer_type: "iop", customer_name: "Other" }] })).toBeNull();
  });

  it("the same UPI id paired with another customer earlier on this page", () => {
    const other = row({ uid: "r2", customer_id: 2, customer_name: "Kannan" });
    const first = txn({ id: 10, sender_vpa: "shared@upi" });
    const second = txn({ id: 11, sender_vpa: "SHARED@upi" });
    const pairings = [{ txnId: 10, rowUid: "r2", amount: 100, kind: "click" as const, needsSave: true, replace: false }];
    const o = owner(second, row(), { rows: [row(), other], pairings, txnById: (id) => (id === 10 ? first : undefined) });
    expect(o).toMatchObject({ customerId: 2, customerName: "Kannan", source: "page" });
  });

  it("an earlier page pairing that will not save the id (user kept it elsewhere) or is for the same customer is no clash", () => {
    const other = row({ uid: "r2", customer_id: 2, customer_name: "Kannan" });
    const first = txn({ id: 10, sender_vpa: "shared@upi" });
    const second = txn({ id: 11, sender_vpa: "shared@upi" });
    const base = { txnId: 10, rowUid: "r2", amount: 100, kind: "click" as const, replace: false };
    const ctx = (needsSave: boolean) => ({ rows: [row(), other], pairings: [{ ...base, needsSave }], txnById: (id: number) => (id === 10 ? first : undefined) });
    expect(owner(second, row(), ctx(false))).toBeNull();
    expect(owner(second, other, ctx(true))).toBeNull();
  });

  it("a transaction without a UPI id can only clash through its own mapping", () => {
    expect(owner(txn({ sender_vpa: null }), row(), { saved: [{ upi_vpa: "", customer_id: 7, customer_type: "edi" }] })).toBeNull();
  });
});

describe("planAutoPairings — mapped payments that apply themselves (AU-01 … AU-04, AU-06)", () => {
  const mapped = (over: Partial<UpiTxnLike> = {}) =>
    txn({ amount: "500", mapped_customer_id: 1, mapped_customer_type: "edi", mapped_customer_name: "Selvam", ...over });
  const plan = (rows: PairableRow[], txns: UpiTxnLike[], skip: number[] = [], pairings: PairingState["pairings"] = []) =>
    planAutoPairings({ rows, pairings, originals: {} }, txns, new Set(skip)).map((p) => [p.txn.id, p.rowUid]);

  it("applies a payment mapped to the row's customer: same product, same day, same amount", () => {
    expect(plan([row({ payment_mode: "ONLINE" })], [mapped()])).toEqual([[10, "r1"]]);
  });

  it("does not need the name: only the mapping counts", () => {
    expect(plan([row({ customer_name: "Totally Different", payment_mode: "ONLINE" })], [mapped({ sender_name: "SOMEONE" })])).toEqual([[10, "r1"]]);
  });

  it("the amount has to match the sheet (within 50 paise); otherwise it stays manual", () => {
    expect(plan([row()], [mapped({ amount: "499.6" })])).toEqual([[10, "r1"]]);
    expect(plan([row()], [mapped({ amount: "320" })])).toEqual([]);
    expect(plan([row()], [mapped({ amount: "5000" })])).toEqual([]);
  });

  it("only on the day of the row's collection date", () => {
    expect(plan([row()], [mapped({ transaction_date: "2026-10-16" })])).toEqual([]);
    expect(plan([row({ collection_date: "18-10-2026" })], [mapped()])).toEqual([]);
  });

  it("not for payments that are unmapped, or mapped to another customer / product", () => {
    expect(plan([row()], [txn({ amount: "500" })])).toEqual([]);                                   // unmapped
    expect(plan([row()], [mapped({ mapped_customer_id: 2 })])).toEqual([]);                        // someone else
    expect(plan([row()], [mapped({ mapped_customer_type: "iop" })])).toEqual([]);                  // same id, other product
    expect(plan([row({ product_type: "IOP" })], [mapped()])).toEqual([]);
    expect(plan([row({ customer_id: null })], [mapped()])).toEqual([]);                            // the row has no customer yet
  });

  it("a Cash row is switched too when the customer has no GPay-marked row", () => {
    expect(plan([row({ payment_mode: "CASH", is_paid: true })], [mapped()])).toEqual([[10, "r1"]]);
  });

  it("a customer with a GPay-marked row: only that row is a candidate, even when a Cash row has the amount", () => {
    const rows = [row({ uid: "cash", payment_mode: "CASH", amount: 500 }), row({ uid: "gpay", payment_mode: "ONLINE", amount: 500 })];
    expect(plan(rows, [mapped()])).toEqual([[10, "gpay"]]);                                        // the GPay row, not the first row
    const other = [row({ uid: "cash", payment_mode: "CASH", amount: 500 }), row({ uid: "gpay", payment_mode: "ONLINE", amount: 300 })];
    expect(plan(other, [mapped()])).toEqual([]);                                                   // the GPay row's amount differs: leave it to the user
  });

  it("each row takes one payment: a second payment for the same row stays manual", () => {
    const rows = [row({ payment_mode: "ONLINE" })];
    expect(plan(rows, [mapped({ id: 10 }), mapped({ id: 11 })])).toEqual([[10, "r1"]]);
    const two = [row({ uid: "a", payment_mode: "ONLINE" }), row({ uid: "b", payment_mode: "ONLINE" })];
    expect(plan(two, [mapped({ id: 10 }), mapped({ id: 11 })])).toEqual([[10, "a"], [11, "b"]]);   // two GPay rows, two payments
  });

  it("never plans a payment that is already used, already auto-applied once (an Undo sticks) or on a row that already has a payment", () => {
    const rows = [row({ payment_mode: "ONLINE" })];
    const used = [{ txnId: 10, rowUid: "r1", amount: 500, kind: "click" as const, needsSave: true, replace: false }];
    expect(plan(rows, [mapped()], [], used)).toEqual([]);
    expect(plan(rows, [mapped()], [10])).toEqual([]);
    expect(plan(rows, [mapped({ id: 12 })], [], used)).toEqual([]);                                 // r1 already has a payment
  });

  it("uses what the sheet said, not an amount already changed by a pairing", () => {
    const original = { r1: { payment_mode: "CASH" as const, is_paid: true, amount: 500 } };
    const paired = row({ payment_mode: "ONLINE", amount: 200 });                                    // a 200 payment was paired by hand (sheet: 500)
    const pairings = [{ txnId: 99, rowUid: "r1", amount: 200, kind: "click" as const, needsSave: true, replace: false }];
    expect(planAutoPairings({ rows: [paired], pairings, originals: original }, [mapped()], new Set()).length).toBe(0);   // the row already has a payment
  });

  it("applyPairing marks the pairing as automatic and not needing a save", () => {
    const s = applyPairing(state([row({ payment_mode: "CASH" })]), mapped(), "r1", { kind: "apply", needsSave: false, auto: true });
    expect(s.pairings[0]).toMatchObject({ auto: true, needsSave: false, kind: "apply", amount: 500 });
    expect(s.rows[0]).toMatchObject({ payment_mode: "ONLINE", is_paid: true, amount: 500 });
    const manual = applyPairing(state([row()]), mapped(), "r1", { kind: "apply", needsSave: false });
    expect(manual.pairings[0].auto).toBeUndefined();
  });
});

describe("unlinking a UPI id — what loses its customer (UL-03, UL-04)", () => {
  const link = { mapped_customer_id: 7, mapped_customer_type: "iop", mapped_customer_name: "sathiskumar" };
  const target = txn({ id: 40, sender_vpa: "Parthi@UPI", ...link });
  const list = [
    target,
    txn({ id: 41, sender_vpa: "parthi@upi", ...link }),                                                       // same id (any case), same link
    txn({ id: 42, sender_vpa: "parthi@upi", mapped_customer_id: 8, mapped_customer_type: "iop", mapped_customer_name: "Other" }),   // earlier owner
    txn({ id: 43, sender_vpa: "parthi@upi", mapped_customer_id: 7, mapped_customer_type: "edi", mapped_customer_name: "Same no., other product" }),
    txn({ id: 44, sender_vpa: "other@upi", ...link }),                                                        // other UPI id of the same customer
    txn({ id: 45, sender_vpa: "parthi@upi" }),                                                                // not linked
  ];

  it("the transaction itself and the id's payments linked to the same customer + product — nothing else", () => {
    expect(list.filter((t) => sharesLink(t, target)).map((t) => t.id)).toEqual([40, 41]);
  });

  it("a transaction with no UPI id loses only its own link", () => {
    const lone = txn({ id: 50, sender_vpa: null, ...link });
    const twin = txn({ id: 51, sender_vpa: null, ...link });
    expect([lone, twin].filter((t) => sharesLink(t, lone)).map((t) => t.id)).toEqual([50]);
  });

  it("an unlinked target shares nothing", () => {
    expect(list.some((t) => sharesLink(t, txn({ id: 45, sender_vpa: "parthi@upi" })))).toBe(false);
  });

  it("clearLinks clears customer, product and name on those, leaves the rest as the same objects", () => {
    const out = clearLinks(list, target);
    expect(out[0]).toMatchObject({ id: 40, mapped_customer_id: null, mapped_customer_type: null, mapped_customer_name: null, sender_vpa: "Parthi@UPI", amount: "500" });
    expect(out[1]).toMatchObject({ id: 41, mapped_customer_id: null });
    for (const i of [2, 3, 4, 5]) expect(out[i]).toBe(list[i]);
    expect(list[0].mapped_customer_id).toBe(7);                                                              // the input is not mutated
  });
});

describe("unlinking a UPI id — the saved list (UL-05)", () => {
  const saved = [
    { upi_vpa: "parthi@upi", customer_id: 7, customer_type: "iop", customer_name: "sathiskumar" },
    { upi_vpa: "parthi@upi", customer_id: 7, customer_type: "edi", customer_name: "same no., other product" },
    { upi_vpa: "other@upi", customer_id: 7, customer_type: "iop", customer_name: "sathiskumar" },
    { upi_vpa: "parthi@upi", customer_id: 9, customer_type: "iop", customer_name: "someone else" },
  ];
  const target = txn({ id: 40, sender_vpa: " Parthi@UPI ", mapped_customer_id: 7, mapped_customer_type: "IOP", mapped_customer_name: "sathiskumar" });

  it("drops only that UPI id's entry for that customer + product", () => {
    expect(withoutSavedVpa(saved, target).map((m) => `${m.upi_vpa}/${m.customer_id}/${m.customer_type}`))
      .toEqual(["parthi@upi/7/edi", "other@upi/7/iop", "parthi@upi/9/iop"]);
  });

  it("changes nothing for a transaction with no UPI id or no link", () => {
    expect(withoutSavedVpa(saved, txn({ sender_vpa: null, mapped_customer_id: 7, mapped_customer_type: "iop" }))).toBe(saved);
    expect(withoutSavedVpa(saved, txn({ sender_vpa: "parthi@upi" }))).toBe(saved);
  });
});
