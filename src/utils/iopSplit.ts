// IOP collections that are part interest, part principal (e.g. 10,000 collected = 500 interest + 9,500 principal). Pure logic - no React.
//
// The row's amount stays what was COLLECTED. The row may carry `principal` (the part of it that is principal); the interest is the rest.
// On Submit the transaction is saved with the interest only, and the principal is added to the customer's principal_paid.
// Only a PAID IOP row can carry principal.

export interface SplitRow {
  product_type: "EDI" | "IOP";
  is_paid: boolean;
  amount: number;
  principal?: number;
  customer_id?: number | null;
}

const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Whether this row can be split at all. */
export const canSplit = (r: Pick<SplitRow, "product_type">) => r.product_type === "IOP";

/** The principal that counts: only on a paid IOP row. */
export const principalOf = (r: SplitRow): number => (r.product_type === "IOP" && r.is_paid ? Number(r.principal) || 0 : 0);

/** The interest: what is left of the amount collected after the principal. */
export const interestOf = (r: SplitRow): number => (Number(r.amount) || 0) - principalOf(r);

/** Does the row carry a principal part? */
export const isSplit = (r: SplitRow) => principalOf(r) > 0;

/** A problem the page can see by itself (the server also checks the customer's balance). */
export function localSplitIssue(r: SplitRow): string | null {
  const p = principalOf(r);
  if (p < 0) return "The principal cannot be negative";
  if (p > (Number(r.amount) || 0)) return `The principal ${rupee(p)} is more than the amount collected ${rupee(Number(r.amount) || 0)}`;
  return null;
}

const whole = (n: number) => Math.round(n * 100) / 100;

/** The row patch when the principal is typed: the interest follows. */
export const patchForPrincipal = (value: string): { principal: number } => ({ principal: value.trim() === "" ? 0 : whole(Number(value) || 0) });

/** The row patch when the interest is typed: the principal is what is left of the amount. */
export const patchForInterest = (r: Pick<SplitRow, "amount">, value: string): { principal: number } => {
  const interest = value.trim() === "" ? 0 : Number(value) || 0;
  return { principal: whole((Number(r.amount) || 0) - interest) };
};

/** What the server's live check needs for every IOP row with a customer (rows without a split still matter: they share the balance). */
export function checkRecords<R extends SplitRow & { collection_date: string; payment_mode: string; customer_name?: string }>(rows: R[]) {
  return rows.map((r) => ({
    collection_date: r.collection_date, customer_name: r.customer_name ?? "", customer_id: r.customer_id ?? null,
    product_type: r.product_type, payment_mode: r.payment_mode, is_paid: r.is_paid, amount: r.amount, principal_amount: principalOf(r),
  }));
}

/** Does a row need the live check? (an IOP row with a customer and something to check) */
export const wantsCheck = (r: SplitRow & { split_open?: boolean }) => canSplit(r) && Boolean(r.customer_id) && (Boolean(r.split_open) || isSplit(r));
