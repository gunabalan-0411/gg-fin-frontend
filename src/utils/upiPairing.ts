// Pairing UPI transactions with OCR rows (OCR page, UPI step). Pure logic — no React — so it is unit-testable.
//
// A customer row marked paid ONLINE is "waiting for UPI". Clicking a UPI transaction pairs it with that row: the row becomes
// Online + Paid with the UPI amount; several payments on the same row are ADDED (a customer who paid twice that day);
// every pairing can be undone. Saving the UPI id -> customer mapping happens later, when the page is submitted.

export type PairKind = "click" | "apply";

export interface UpiTxnLike {
  id: number;
  amount: string | number;
  sender_name: string | null;
  sender_vpa: string | null;
  transaction_date: string;                 // yyyy-mm-dd
  mapped_customer_id: number | null;
  mapped_customer_type: string | null;      // "edi" | "iop"
  mapped_customer_name: string | null;
}

export interface PairableRow {
  uid: string;
  collection_date: string;                  // dd-mm-yyyy
  customer_id: number | null;
  customer_name: string;
  extracted_name?: string;
  product_type: "EDI" | "IOP";
  payment_mode: "CASH" | "ONLINE";
  is_paid: boolean;
  amount: number;
}

export interface Pairing {
  txnId: number;
  rowUid: string;
  amount: number;                           // what this payment added to the row
  kind: PairKind;                           // "click": picked from the highlight · "apply": the UPI id was already mapped
  needsSave: boolean;                       // the UPI id -> customer mapping must be saved at Submit
  replace: boolean;                         // the user confirmed re-pointing a UPI id that belonged to someone else
  auto?: boolean;                           // applied by itself (the UPI id was already mapped to this customer), not by a click
}

export interface RowSnapshot {
  payment_mode: "CASH" | "ONLINE";
  is_paid: boolean;
  amount: number;
}

export interface PairingState<R extends PairableRow = PairableRow> {
  rows: R[];
  pairings: Pairing[];
  originals: Record<string, RowSnapshot>;   // each row as it was before its first pairing (to restore on Undo)
}

/** Rupees: amounts within this are "the same" (UPI amounts are whole rupees or paise; the sheet is rounded). */
export const AMOUNT_TOLERANCE = 0.5;

export const txnAmount = (txn: Pick<UpiTxnLike, "amount">): number => Number(txn.amount) || 0;

export function ddmmyyyyToIso(d: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec((d ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// ── numbers ───────────────────────────────────────────────────────────────────

export const pairingsForRow = (pairings: Pairing[], rowUid: string) => pairings.filter((p) => p.rowUid === rowUid);
export const pairedTotal = (pairings: Pairing[], rowUid: string) =>
  pairingsForRow(pairings, rowUid).reduce((sum, p) => sum + p.amount, 0);
export const consumedIds = (pairings: Pairing[]) => new Set(pairings.map((p) => p.txnId));

/** What the sheet said (the amount before any UPI payment was paired). */
export const extractedAmount = (originals: Record<string, RowSnapshot>, row: Pick<PairableRow, "uid" | "amount">) =>
  originals[row.uid]?.amount ?? row.amount;

export const remainingAmount = (originals: Record<string, RowSnapshot>, pairings: Pairing[], row: PairableRow) =>
  extractedAmount(originals, row) - pairedTotal(pairings, row.uid);

/** Enough UPI payments have been paired to cover what the sheet said (the highlight switches itself off). */
export function isSatisfied(originals: Record<string, RowSnapshot>, pairings: Pairing[], row: PairableRow): boolean {
  if (pairingsForRow(pairings, row.uid).length === 0) return false;
  return pairedTotal(pairings, row.uid) >= extractedAmount(originals, row) - AMOUNT_TOLERANCE;
}

// ── pairing / undo ────────────────────────────────────────────────────────────

export function applyPairing<R extends PairableRow>(
  state: PairingState<R>,
  txn: Pick<UpiTxnLike, "id" | "amount">,
  rowUid: string,
  opts: { kind: PairKind; needsSave: boolean; replace?: boolean; auto?: boolean },
): PairingState<R> {
  const row = state.rows.find((r) => r.uid === rowUid);
  if (!row || state.pairings.some((p) => p.txnId === txn.id)) return state;     // unknown row, or this payment is already used

  const amount = txnAmount(txn);
  const first = pairingsForRow(state.pairings, rowUid).length === 0;
  const originals = first
    ? { ...state.originals, [rowUid]: { payment_mode: row.payment_mode, is_paid: row.is_paid, amount: row.amount } }
    : state.originals;
  return {
    originals,
    rows: state.rows.map((r) =>
      r.uid === rowUid ? { ...r, payment_mode: "ONLINE" as const, is_paid: true, amount: first ? amount : r.amount + amount } : r),
    pairings: [...state.pairings, { txnId: txn.id, rowUid, amount, kind: opts.kind, needsSave: opts.needsSave, replace: Boolean(opts.replace), ...(opts.auto ? { auto: true } : {}) }],
  };
}

export function removePairing<R extends PairableRow>(state: PairingState<R>, txnId: number): PairingState<R> {
  const pairing = state.pairings.find((p) => p.txnId === txnId);
  if (!pairing) return state;
  const pairings = state.pairings.filter((p) => p.txnId !== txnId);
  const stillPaired = pairingsForRow(pairings, pairing.rowUid).length > 0;
  const snapshot = state.originals[pairing.rowUid];

  const { [pairing.rowUid]: _gone, ...originals } = state.originals;
  return {
    pairings,
    originals: stillPaired ? state.originals : originals,
    rows: state.rows.map((r) => {
      if (r.uid !== pairing.rowUid) return r;
      if (stillPaired) return { ...r, amount: r.amount - pairing.amount };          // the others stay applied
      return snapshot ? { ...r, ...snapshot } : r;                                  // last one: back to how the row was
    }),
  };
}

/** A row was deleted: its pairings go with it (those UPI transactions become free again). */
export function dropPairingsForRow<R extends PairableRow>(state: PairingState<R>, rowUid: string): PairingState<R> {
  const { [rowUid]: _gone, ...originals } = state.originals;
  return { ...state, pairings: state.pairings.filter((p) => p.rowUid !== rowUid), originals };
}

/**
 * After rows were replaced wholesale (the page's own Undo / Redo): keep only the pairings whose row still exists and is
 * still Online + Paid — otherwise the UPI transaction would look used while its row no longer shows the payment.
 */
export function reconcile<R extends PairableRow>(state: PairingState<R>): PairingState<R> {
  const alive = state.pairings.filter((p) => {
    const row = state.rows.find((r) => r.uid === p.rowUid);
    return row && row.payment_mode === "ONLINE" && row.is_paid;
  });
  if (alive.length === state.pairings.length) return state;
  const uids = new Set(alive.map((p) => p.rowUid));
  return {
    ...state,
    pairings: alive,
    originals: Object.fromEntries(Object.entries(state.originals).filter(([uid]) => uids.has(uid))),
  };
}

/** The row an already-mapped UPI transaction belongs to (its customer + product), preferring the same date, then a free row. */
export function rowForMappedTxn<R extends PairableRow>(rows: R[], txn: UpiTxnLike, pairings: Pairing[] = []): R | undefined {
  if (txn.mapped_customer_id == null || !txn.mapped_customer_type) return undefined;
  const product = txn.mapped_customer_type.toUpperCase();
  const candidates = rows.filter((r) => r.customer_id === txn.mapped_customer_id && r.product_type === product);
  const sameDay = candidates.filter((r) => ddmmyyyyToIso(r.collection_date) === txn.transaction_date);
  const pool = sameDay.length ? sameDay : candidates;
  return pool.find((r) => pairingsForRow(pairings, r.uid).length === 0) ?? pool[0];
}

// ── who owns a UPI id ─────────────────────────────────────────────────────────

/** A saved UPI id -> customer mapping (a row of the UPI id table). */
export interface SavedVpa {
  upi_vpa: string;
  customer_id: number;
  customer_type: string;                    // "edi" | "iop"
  customer_name?: string | null;
}

export interface VpaOwner {
  customerId: number;
  customerType: string;
  customerName: string;
  /** "saved": the UPI id is already saved for that customer · "page": paired with that customer earlier on this page */
  source: "saved" | "page";
}

const vpaKey = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/**
 * The customer that already owns this transaction's UPI id when it is NOT the row's customer — i.e. what would make the
 * server refuse to save the mapping at Submit. Looked at while pairing, so the user can decide right there:
 *  1. the transaction is already mapped to someone else,
 *  2. the UPI id is saved for someone else (older transactions carry no customer, so this needs the saved list),
 *  3. the same UPI id was paired with another customer of the same product earlier on this page.
 */
export function findVpaOwner<R extends PairableRow>(
  txn: UpiTxnLike,
  row: R,
  ctx: { saved: SavedVpa[]; rows: R[]; pairings: Pairing[]; txnById: (id: number) => UpiTxnLike | undefined },
): VpaOwner | null {
  const product = row.product_type.toLowerCase();

  if (txn.mapped_customer_id != null && !(txn.mapped_customer_id === row.customer_id && (txn.mapped_customer_type ?? "").toLowerCase() === product)) {
    return {
      customerId: txn.mapped_customer_id, customerType: (txn.mapped_customer_type ?? "").toLowerCase(),
      customerName: txn.mapped_customer_name ?? "another customer", source: "saved",
    };
  }

  const vpa = vpaKey(txn.sender_vpa);
  if (!vpa) return null;

  const saved = ctx.saved.find((m) => vpaKey(m.upi_vpa) === vpa && m.customer_type.toLowerCase() === product && m.customer_id !== row.customer_id);
  if (saved) {
    return { customerId: saved.customer_id, customerType: product, customerName: saved.customer_name || "another customer", source: "saved" };
  }

  for (const p of ctx.pairings) {
    if (!p.needsSave || p.txnId === txn.id) continue;
    const other = ctx.txnById(p.txnId);
    const otherRow = ctx.rows.find((r) => r.uid === p.rowUid);
    if (!other || !otherRow || vpaKey(other.sender_vpa) !== vpa) continue;
    if (otherRow.product_type.toLowerCase() === product && otherRow.customer_id != null && otherRow.customer_id !== row.customer_id) {
      return { customerId: otherRow.customer_id, customerType: product, customerName: otherRow.customer_name, source: "page" };
    }
  }
  return null;
}

// ── unlinking a UPI id ────────────────────────────────────────────────────────

/**
 * Does `t` lose its customer link when `target` is unlinked? Mirrors the server: the target itself, and every payment from the
 * same UPI id still linked to the SAME customer + product (a payment linked to someone else is history of that account).
 */
export function sharesLink(t: UpiTxnLike, target: UpiTxnLike): boolean {
  if (target.mapped_customer_id == null) return false;
  if (t.id === target.id) return true;
  const vpa = vpaKey(target.sender_vpa);
  return vpa !== "" && vpaKey(t.sender_vpa) === vpa
    && t.mapped_customer_id === target.mapped_customer_id
    && (t.mapped_customer_type ?? "").toLowerCase() === (target.mapped_customer_type ?? "").toLowerCase();
}

/** The transactions as they look once `target` is unlinked. */
export function clearLinks<T extends UpiTxnLike>(txns: T[], target: UpiTxnLike): T[] {
  return txns.map((t) => (sharesLink(t, target)
    ? { ...t, mapped_customer_id: null, mapped_customer_type: null, mapped_customer_name: null }
    : t));
}

/** The saved UPI id list once `target`'s UPI id no longer points at its customer. */
export function withoutSavedVpa(saved: SavedVpa[], target: UpiTxnLike): SavedVpa[] {
  const vpa = vpaKey(target.sender_vpa);
  if (!vpa || target.mapped_customer_id == null) return saved;
  return saved.filter((m) => !(vpaKey(m.upi_vpa) === vpa && m.customer_id === target.mapped_customer_id
    && m.customer_type.toLowerCase() === (target.mapped_customer_type ?? "").toLowerCase()));
}

// ── payments that apply themselves ────────────────────────────────────────────

/**
 * UPI payments that can be applied WITHOUT a click: the payment is already mapped to a customer (an earlier pairing saved its UPI id),
 * dated the day of that customer's row, and its amount equals what the sheet says for the row. Nothing is guessed from names.
 *  - the row must be the same customer + product, have no payment yet, and not be claimed by an earlier payment in this plan;
 *  - a customer with a GPay (ONLINE) marked row: only those rows qualify (a customer can pay part in cash and part by GPay);
 *    a customer with no ONLINE row: a CASH row with the matching amount qualifies (the notebook often does not say GPay);
 *  - `skip`: payments already auto-applied once (an Undo must stick), never planned again.
 */
export function planAutoPairings<R extends PairableRow>(
  state: PairingState<R>,
  txns: UpiTxnLike[],
  skip: ReadonlySet<number> = new Set(),
): { txn: UpiTxnLike; rowUid: string }[] {
  const used = consumedIds(state.pairings);
  const claimed = new Set<string>();
  const plan: { txn: UpiTxnLike; rowUid: string }[] = [];

  for (const txn of txns) {
    if (used.has(txn.id) || skip.has(txn.id)) continue;
    if (txn.mapped_customer_id == null || !txn.mapped_customer_type) continue;
    const product = txn.mapped_customer_type.toUpperCase();
    const free = (r: R) => pairingsForRow(state.pairings, r.uid).length === 0 && !claimed.has(r.uid);

    const sameDay = state.rows.filter((r) =>
      r.customer_id === txn.mapped_customer_id && r.product_type === product && ddmmyyyyToIso(r.collection_date) === txn.transaction_date);
    const online = sameDay.filter((r) => r.payment_mode === "ONLINE");
    const pool = online.length ? online : sameDay;                                  // GPay-marked rows only, when there are any
    const row = pool.find((r) => free(r) && Math.abs(extractedAmount(state.originals, r) - txnAmount(txn)) <= AMOUNT_TOLERANCE);
    if (!row) continue;
    claimed.add(row.uid);
    plan.push({ txn, rowUid: row.uid });
  }
  return plan;
}

// ── matching hints ────────────────────────────────────────────────────────────

function tokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9஀-௿\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenClose(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && long.startsWith(short)) return true;                    // "raj" ~ "rajesh"
  return long.length >= 5 && editDistanceAtMostOne(a, b);                           // one slip in a longer word
}

/** Loose "same person?" check for a UPI sender name against a customer name — a hint for the user, not a decision. */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.some((u) => tokenClose(t, u)));
}

export interface MatchTags {
  name: boolean;
  amount: boolean;
  otherDate: boolean;
}

export function matchTags(
  txn: UpiTxnLike,
  row: PairableRow,
  originals: Record<string, RowSnapshot>,
  pairings: Pairing[],
): MatchTags {
  const paid = pairedTotal(pairings, row.uid);
  // a first payment is compared with what the sheet said, a second one with what is still unpaid
  const expected = paid > 0 ? extractedAmount(originals, row) - paid : extractedAmount(originals, row);
  const sender = txn.sender_name || txn.sender_vpa;
  return {
    name: namesMatch(sender, row.customer_name) || namesMatch(sender, row.extracted_name),
    amount: Math.abs(txnAmount(txn) - expected) <= AMOUNT_TOLERANCE,
    otherDate: ddmmyyyyToIso(row.collection_date) !== "" && ddmmyyyyToIso(row.collection_date) !== txn.transaction_date,
  };
}

/** The little text under a highlighted transaction. */
export function matchLabel(tags: MatchTags): string | null {
  const parts: string[] = [];
  if (tags.name && tags.amount) parts.push("Name & amount match");
  else if (tags.amount) parts.push("Amount matches");
  else if (tags.name) parts.push("Name matches");
  if (tags.otherDate) parts.push("other date");
  return parts.length ? parts.join(" · ") : null;
}
