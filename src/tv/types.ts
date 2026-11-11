// What the home-TV endpoints (/api/tv/*) return. Kept apart from the rest of the app: the TV page never uses a login.

export type TvProduct = "edi" | "iop";

export interface TvSearchHit {
  product: TvProduct;
  customer_id: number;
  name_en: string;
  name_ta: string;
  outstanding: number;
  score: number;
}

export interface TvPayment {
  date: string;         // YYYY-MM-DD
  amount: number;       // what was handed over (IOP: interest + principal)
  principal: number;    // the part of `amount` that was principal (IOP only)
  gg: boolean;          // marked as Google Pay ("GG")
  paid: boolean;        // false on a GG row = the money did not arrive (the red X)
}

export interface TvCustomer {
  product: TvProduct;
  customer_id: number;
  name_en: string;
  name_ta: string;
  phone: string;
  address: string;
  loan_start_date: string | null;
  loan_amount: number;
  interest: number;
  outstanding: number;
  total_paid: number;
  payments: TvPayment[];      // every payment, newest first
  disbursed_amount?: number;  // EDI
  principal_paid?: number;    // IOP
}

export interface TvDevice {
  id: number;
  name: string;
  created_at: string | null;
  last_seen_at: string | null;
}

export type PollResult =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "approved"; token: string; name: string };

/** One person on the collections page. */
export interface TvCollectRow {
  customer_id: number;
  name_en: string;
  name_ta: string;
  loan_amount: number;
  phone: string;
}
export interface TvElRow extends TvCollectRow {
  due: number;          // the interest of ONE collection (the customer's interest, as the dashboard's Reminder report shows it)
  paid_month: number;   // interest paid so far this month
  frequency: number;    // days between collections (10, 30 ...)
}
export type TvDayKey = "yesterday" | "today" | "tomorrow";
export interface TvElDay {
  date: string;         // YYYY-MM-DD
  ten_days: TvElRow[];  // due that day, collected more often than monthly
  monthly: TvElRow[];   // due that day, every 30 days or more ("maadha vatti")
}
export interface TvEdiLongRow extends TvCollectRow {
  last_payment_date: string | null;   // null = never paid
  loan_start_date: string | null;
  balance: number;
  days: number;         // days overdue = since the last paid payment (the start date if none) - the Defaulter report's number
}
export interface TvCollections {
  as_of: string;
  el: Record<TvDayKey, TvElDay>;
  edi_long: TvEdiLongRow[];
}
