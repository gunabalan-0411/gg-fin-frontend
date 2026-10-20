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
  amount: number;
  payment_mode: string;
  payment_status: string;
}

export interface Expense {
  id: number;
  amount: number;
  date: string;
  notes?: string;
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
