export interface EdiCustomer {
  customer_id: number;
  month?: string;
  loan_start_date?: string;
  customer_segment_id?: number;
  customer_name?: string;
  customer_address?: string;
  proof_aadhaar?: string;
  contact_number?: string;
  loan_amount?: number;
  disbursed_amount?: number;
  interest?: number;
  outstanding_balance?: number;
  is_closed?: boolean;
  remarks?: string;
  tamil_name?: string;
  ignore?: boolean;
}

export interface IopCustomer {
  customer_id: number;
  month?: string;
  loan_start_date?: string;
  customer_segment_id?: number;
  customer_name?: string;
  customer_address?: string;
  proof_aadhaar?: string;
  contact_number?: string;
  interest_payment_frequency?: number;
  loan_amount?: number;
  disbursed_amount?: number;
  interest?: number;
  principal_paid?: number;
  outstanding_balance?: number;
  is_closed?: boolean;
  remarks?: string;
  tamil_name?: string;
  ignore?: boolean;
}

export interface EdiTransaction {
  transaction_id: number;
  customer_id: number;
  collection_date: string;
  amount: number;
  payment_mode: string;
  payment_status: string;
}

export interface IopTransaction {
  transaction_id: number;
  customer_id: number;
  collection_date: string;
  amount: number;                       // the interest (what the transaction holds)
  principal_amount?: number;            // the principal that came with it (already added to the customer's principal paid)
  payment_mode: string;
  payment_status: string;
}

/** Personal Finance records (the logged-in person's own; amounts come from the server as numbers or numeric text). */
export interface PersonalSaving {
  id: number;
  amount: number | string;
  bank: string;
  account_name: string;
  balance_date: string;                 // the day that balance was recorded
  notes?: string | null;
}
export interface PersonalLend {
  id: number;
  to_whom: string;
  amount: number | string;
  follow_up_date?: string | null;
  is_settled: boolean;
  notes?: string | null;
}
export type GiftType = "money" | "gold" | "other";
export interface PersonalGift {
  id: number;
  gift_type: GiftType;
  amount?: number | string | null;      // money: how much
  gold_grams?: number | string | null;  // gold: how much (grams)
  item_name?: string | null;            // other: what it is
  occasion?: string | null;
  gift_from?: string | null;
  received_date?: string | null;
  notes?: string | null;
}
export type PersonalRecordKind = "savings" | "lends" | "gifts";

export interface Expense {
  id: number;
  amount: number;
  date: string;
  notes?: string | null;
  category_id?: number | null;          // the most specific category; null = an old expense that is not grouped yet
  top_id?: number | null;               // its top-level category
  top_name?: string | null;
  sub_name?: string | null;             // the sub-category, when one was chosen
  person_id?: number | null;            // "for whom"
  person_name?: string | null;
}

/** A category: top-level (parent_id null) or a sub-category. `used` = expenses in it (and its sub-categories). */
export interface ExpenseCategory {
  id: number;
  name: string;
  parent_id: number | null;
  is_system: boolean;                   // Miscellaneous: cannot be renamed or deleted
  used: number;
}

export interface ExpensePerson {
  id: number;
  name: string;
  used: number;
}

export interface ExpenseSummary {
  categories: { id: number | null; name: string; ungrouped: boolean; count: number; total: number | string;
                subs: { id: number; name: string; count: number; total: number | string }[] }[];
  people: { id: number | null; name: string; count: number; total: number | string }[];
  total: number | string;
  count: number;
}

/** One line of "Group old expenses": every old expense with this notes text, and the guess to review. */
export interface LegacyExpenseGroup {
  notes: string | null;
  count: number;
  total: number | string;
  first: string;
  last: string;
  category_id: number;
  person_id: number | null;
}

/** Filters shared by the list, the totals and the export. */
export interface ExpenseFilters {
  date_from?: string;
  date_to?: string;
  category_id?: number;
  person_id?: number;
  search?: string;
}

export interface MonthlyProfit {
  month: string;
  iop_profit: number;
  edi_profit: number;
  expense: number;
  unclaimed: number;
  defaulted: number;
  net_profit: number;
}

export interface DashboardSummary {
  current_month_iop_profit: number;
  current_month_edi_profit: number;
  current_month_expense: number;
  current_month_unclaimed: number;
  current_month_defaulted: number;
  current_month_net_profit: number;
  monthly_trends: MonthlyProfit[];
}

export interface DailyActivity {
  date: string;
  edi_count: number;
  iop_count: number;
  edi_amount: number;
  iop_amount: number;
}

export interface LoanSummary {
  edi_total_loan: number;
  edi_total_receivable: number;
  iop_total_loan: number;
  iop_total_receivable: number;
}

export interface CustomerBrief {
  customer_id: number;
  customer_name: string;
  tamil_name: string;
  loan_amount: number;
  frequency: number;
  monthly_interest?: number;
  ignore?: boolean;
}

export interface IopRemindersResponse {
  yesterday: CustomerBrief[];
  today: CustomerBrief[];
  tomorrow: CustomerBrief[];
}

export interface IopCalendarDay {
  date: string;
  customers: CustomerBrief[];
}

export interface EdiInactiveCustomer {
  customer_id: number;
  customer_name: string;
  tamil_name: string;
  loan_amount: number;
  outstanding_balance: number;
  last_payment_date: string | null;
  days_since_payment: number;
  ignore?: boolean;
}

export interface EdiDefaulter {
  customer_id: number;
  customer_name: string;
  tamil_name: string;
  loan_amount: number;
  outstanding_balance: number;
  last_payment_date: string | null;
  days_overdue: number;
  ignore?: boolean;
}

export interface IopMonthlyDue {
  customer_id: number;
  customer_name: string;
  tamil_name: string;
  loan_amount: number;
  monthly_interest: number;
  paid_this_month: number;
  due_this_month: number;
  payments_due_so_far: number;
  frequency: number;
  ignore?: boolean;
}

export interface VoiceAlternative {
  customer_id: number;
  name: string;
  score: number;
}

export interface VoiceEntry {
  spoken_name: string;
  amount: number;
  customer_id?: number;
  customer_name?: string;
  matched: boolean;
  score?: number;
  alternatives?: VoiceAlternative[];
}

export type ProductType = "edi" | "iop";

// ── Alias / AI-mismatch name mappings (OCR page) ──────────────────────────────
export type MappingKind = "alias" | "ai_mismatch";
export type FinanceType = "EDI" | "IOP";

/** Column-2 dropdown candidate: a customer reached through an alias / AI-mismatch word. */
export interface MappingCandidate {
  id: number;                 // customer id
  name: string;               // customer name
  score: number;              // 0..1 fuzzy score of the extracted text against `matched_word`
  source: MappingKind;
  mapping_id: number;
  matched_word: string;
  exact: boolean;
  use_count: number;
  also: { source: MappingKind; word: string; mapping_id: number }[];
}

/** Which mapping row a row's customer was picked through (so usage is counted when the row is saved). */
export interface MappingRef {
  kind: MappingKind;
  id: number;
}

export interface MappingItem {
  id: number;
  word: string;
  use_count: number;
  last_used_at: string | null;
  created_at: string | null;
  stale: boolean;
}

export interface MappingPopupData {
  customer: { id: number; name: string; finance_type: FinanceType };
  aliases: MappingItem[];
  mismatches: MappingItem[];
  limits: { alias: number; ai_mismatch: number };
}

/** The Personal view of the main dashboard (one person's own spending). */
export interface PersonalDashboard {
  month: string;                                              // "2026-10"
  this_month: { total: number | string; count: number };
  last_month: { total: number | string; count: number };
  categories: ExpenseSummary["categories"];                   // this month by category > sub-category, biggest first
  people: ExpenseSummary["people"];
  monthly: { month: string; total: number | string }[];       // the last 12 months, oldest first (zeros included)
}

/** One IOP row checked by the server: the interest it leaves, the customer's balance before / after, and why it would be refused. */
export interface IopSplitCheck {
  index: number;                        // position of the row in the list that was sent
  principal: number;
  interest: number;
  balance_before: number | null;
  balance_after: number | null;
  error: string | null;
}

/** Re-loan: the names stored under a customer's name (any customer, open or closed). */
export interface CarryPreview {
  customer: { id: number; name: string | null; is_closed: boolean; finance_type: FinanceType };
  aliases: string[];
  mismatches: string[];
}

/** What carrying a closed account's names to its replacement added (so Undo can take exactly that back). */
export interface CarryForwardResult {
  same_name: boolean;                       // same name: they follow by themselves, nothing was copied
  alias: string[];
  ai_mismatch: string[];
  skipped: { alias: number; ai_mismatch: number };
}

export interface MappingConflict {
  kind: MappingKind;
  word: string;
  customers: { mapping_id: number; customer_id: number; customer_name: string }[];
}

export type ConflictAction = "keep_both" | "move";

/** A new word that looks (90%+) like the name of an existing customer. `own`: it is the customer being edited. */
export interface MappingSimilar {
  kind: MappingKind;
  word: string;
  matches: { customer_id: number; customer_name: string; score: number; own: boolean }[];
}

export interface MappingResolution {
  kind: MappingKind;
  word: string;
  action: ConflictAction;
}

export interface RememberResult {
  status: "added" | "exists" | "limit_reached" | "conflict" | "similar";
  word: string;
  limit?: number;
  conflicts?: MappingConflict[];
  similar?: MappingSimilar[];
}
// ── Note Pad ───────────────────────────────────────────────────────────────
export interface NotePageSummary {
  id: number;
  title: string;
  version: number;
  size: number;            // bytes of Markdown
  updated_at: string;
}

export interface NotePage {
  id: number;
  title: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}
// ── OCR scan animation ─────────────────────────────────────────────────────
/** Where the ink is on a page (all coordinates in width x height, the size of the analysed image). */
export interface PageInk {
  width: number;
  height: number;
  mask_png_b64: string;                         // white = ink
  blobs: [number, number, number, number][];     // [x, y, w, h] per character, ordered by bottom edge
  coverage: number;
}
