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
